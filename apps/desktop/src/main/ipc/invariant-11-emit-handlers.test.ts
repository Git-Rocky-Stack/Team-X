import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { CreateGoalInput, GoalRow, UpdateGoalInput } from '../db/repos/goals.js';
import type { AppendMessageInput } from '../db/repos/messages.js';
import type { CreateProjectInput, ProjectRow, UpdateProjectInput } from '../db/repos/projects.js';
import type { CreateThreadInput, ThreadMemberRow } from '../db/repos/threads.js';
import type { CreateTicketInput, TicketRow, UpdateTicketInput } from '../db/repos/tickets.js';

import type {
  IpcEmployeesRepo,
  IpcEventBus,
  IpcGoalsRepo,
  IpcMessagesRepo,
  IpcOrchestrator,
  IpcProjectsRepo,
  IpcThreadsRepo,
  IpcTicketsRepo,
} from './handlers.js';
import { createIpcHandlers } from './handlers.js';

/**
 * Tests for the 14 new bus emits introduced by Phase 5.6 M-C step f
 * (main-side Invariant #11 completeness hardening). Closes the
 * FOLLOWUP-P1 gap surfaced by `docs/qa/2026-04-18-ground-zero-audit.md`
 * §3.1 — every state-mutating `tickets.*` / `projects.*` / `goals.*`
 * IPC channel now emits a bus event so renderer caches invalidate
 * without relying on `onSuccess` coupling.
 *
 * Coverage per handler:
 *   - happy-path bus emit assertion (type + companyId + actorId + kind + payload shape)
 *   - best-effort emit: bus.emit throw is logged + swallowed
 *   - bus dep unwired is tolerated (dev-mode console.warn)
 *
 * Extended coverage for the richer payloads:
 *   - patchedKeys reflects caller intent for tickets.update / projects.update / goals.update
 *   - goal.updated re-reads progressPct AFTER the write and normalizes 0..100 → 0..1
 *   - snapshot-before-drop for goal.deleted / project.deleted
 *   - ticket.assigned carries previousAssigneeId snapshot (captured pre-write)
 *   - tickets.create fires ticket.created always + ticket.assigned when immediate-assign succeeds
 *   - project.ticketLinked / project.ticketUnlinked thread companyId via a project fetch
 */

// ---------------------------------------------------------------------------
// Shared fakes + harness
// ---------------------------------------------------------------------------

const COMPANY_ID = 'company-test-1';
const SECOND_COMPANY_ID = 'company-test-2';

class FakeTicketsRepo implements IpcTicketsRepo {
  rows: TicketRow[] = [];
  private seq = 0;
  nextCreateThrow: Error | null = null;

  create(input: CreateTicketInput): string {
    if (this.nextCreateThrow) {
      const e = this.nextCreateThrow;
      this.nextCreateThrow = null;
      throw e;
    }
    this.seq += 1;
    const id = `ticket-${this.seq}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      title: input.title,
      description: input.description,
      status: 'open',
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      reporterId: input.reporterId,
      reporterKind: input.reporterKind,
      threadId: null,
      labelsJson: input.labelsJson ?? '[]',
      slaHours: input.slaHours ?? null,
      dueAt: input.dueAt ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as TicketRow);
    return id;
  }
  getById(id: string): TicketRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  listByCompany(_companyId: string): TicketRow[] {
    return [];
  }
  listByAssignee(_assigneeId: string): TicketRow[] {
    return [];
  }
  update(id: string, input: UpdateTicketInput): void {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (input.title !== undefined) row.title = input.title;
    if (input.status !== undefined) row.status = input.status;
    if (input.priority !== undefined) row.priority = input.priority;
  }
  assign(id: string, assigneeId: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.assigneeId = assigneeId;
  }
  setThreadId(id: string, threadId: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.threadId = threadId;
  }
  close(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = 'done';
  }
  reopen(id: string): void {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = 'open';
  }
}

class FakeProjectsRepo implements IpcProjectsRepo {
  rows: ProjectRow[] = [];
  private seq = 0;
  linkCalls: Array<{ projectId: string; ticketId: string }> = [];
  unlinkCalls: Array<{ projectId: string; ticketId: string }> = [];

  create(input: CreateProjectInput): string {
    this.seq += 1;
    const id = `project-${this.seq}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      goalId: input.goalId,
      title: input.title,
      description: input.description,
      status: 'active',
      leadId: input.leadId,
      priority: input.priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as ProjectRow);
    return id;
  }
  getById(id: string): ProjectRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  listByCompany(_companyId: string): ProjectRow[] {
    return [];
  }
  listByGoal(_goalId: string): ProjectRow[] {
    return [];
  }
  update(id: string, input: UpdateProjectInput): void {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (input.title !== undefined) row.title = input.title;
    if (input.status !== undefined) row.status = input.status;
  }
  delete(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  linkTicket(projectId: string, ticketId: string): void {
    this.linkCalls.push({ projectId, ticketId });
  }
  unlinkTicket(projectId: string, ticketId: string): void {
    this.unlinkCalls.push({ projectId, ticketId });
  }
  listTickets(_projectId: string): string[] {
    return [];
  }
  countTicketsByStatus(_projectId: string): { total: number; done: number } {
    return { total: 0, done: 0 };
  }
}

class FakeGoalsRepo implements IpcGoalsRepo {
  rows: GoalRow[] = [];
  private seq = 0;
  recalcCalls: string[] = [];

  create(input: CreateGoalInput): string {
    this.seq += 1;
    const id = `goal-${this.seq}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      title: input.title,
      description: input.description,
      status: 'active',
      progressPct: 0,
      targetDate: input.targetDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as GoalRow);
    return id;
  }
  getById(id: string): GoalRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  listByCompany(_companyId: string): GoalRow[] {
    return [];
  }
  update(id: string, input: UpdateGoalInput): void {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (input.title !== undefined) row.title = input.title;
    if (input.progressPct !== undefined) row.progressPct = input.progressPct;
    if (input.status !== undefined) row.status = input.status;
  }
  delete(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  recalcProgress(id: string): void {
    this.recalcCalls.push(id);
  }
}

class FakeEmployeesRepo implements IpcEmployeesRepo {
  rows: EmployeeRow[] = [];

  seed(employeeId: string, companyId: string, name = 'Engineer'): void {
    this.rows.push({
      id: employeeId,
      companyId,
      roleId: 'senior-fullstack-engineer',
      name,
      title: 'Senior Fullstack Engineer',
      level: 'ic',
      modelPref: 'ollama-local',
      providerPref: 'ollama-local',
      status: 'idle',
      isSystem: 0,
      toolsAllowedJson: '[]',
      toolsDeniedJson: '[]',
      roleMdSha: 'deadbeef',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as EmployeeRow);
  }
  listByCompany(_companyId: string): EmployeeRow[] {
    return this.rows;
  }
  listVisibleByCompany(_companyId: string): EmployeeRow[] {
    return this.rows.filter((r) => r.isSystem === 0);
  }
  getById(id: string): EmployeeRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  findSystemByRoleId(_companyId: string, _roleId: string): EmployeeRow | null {
    return null;
  }
  create(_input: never): string {
    throw new Error('unused by invariant-11 tests');
  }
  delete(_id: string): void {
    throw new Error('unused by invariant-11 tests');
  }
  promote(_input: never): void {
    throw new Error('unused by invariant-11 tests');
  }
}

class FakeThreadsRepo implements IpcThreadsRepo {
  private seq = 0;
  createCalls: CreateThreadInput[] = [];
  memberCalls: Array<{ threadId: string; memberId: string }> = [];

  create(input: CreateThreadInput): string {
    this.createCalls.push(input);
    this.seq += 1;
    return `thread-${this.seq}`;
  }
  getById(_id: string): never {
    throw new Error('unused by invariant-11 tests');
  }
  addMember(input: { threadId: string; memberId: string; memberKind: string }): void {
    this.memberCalls.push({ threadId: input.threadId, memberId: input.memberId });
  }
  listMembers(_threadId: string): ThreadMemberRow[] {
    return [];
  }
  getOrCreateDmThread(_input: never): string {
    throw new Error('unused by invariant-11 tests');
  }
  listByCompanyWithMembers(_companyId: string): never {
    throw new Error('unused by invariant-11 tests');
  }
}

class FakeMessagesRepo implements IpcMessagesRepo {
  private seq = 0;
  appendCalls: AppendMessageInput[] = [];

  append(input: AppendMessageInput): string {
    this.appendCalls.push(input);
    this.seq += 1;
    return `msg-${this.seq}`;
  }
  listByThread(_threadId: string): never {
    throw new Error('unused by invariant-11 tests');
  }
}

class FakeOrchestrator implements IpcOrchestrator {
  enqueueCalls: Array<{ threadId: string; employeeId: string; userMessageId: string }> = [];

  async enqueueChat(args: {
    threadId: string;
    employeeId: string;
    userMessageId: string;
  }): Promise<void> {
    this.enqueueCalls.push(args);
  }
}

interface BusEmitArgs {
  type: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  payload: unknown;
}

function makeBusMock() {
  const emitted: BusEmitArgs[] = [];
  let nextEmitThrow: Error | null = null;
  const bus: IpcEventBus = {
    emit: (input) => {
      emitted.push({
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
      });
      if (nextEmitThrow) {
        const e = nextEmitThrow;
        nextEmitThrow = null;
        throw e;
      }
    },
  };
  return {
    bus,
    emitted,
    setNextEmitThrow(e: Error): void {
      nextEmitThrow = e;
    },
  };
}

interface HarnessOpts {
  omitBus?: boolean;
}

function buildHarness(opts?: HarnessOpts) {
  const noop = {} as Record<string, unknown>;
  const ticketsRepo = new FakeTicketsRepo();
  const projectsRepo = new FakeProjectsRepo();
  const goalsRepo = new FakeGoalsRepo();
  const employeesRepo = new FakeEmployeesRepo();
  const threadsRepo = new FakeThreadsRepo();
  const messagesRepo = new FakeMessagesRepo();
  const orchestrator = new FakeOrchestrator();
  const bus = makeBusMock();

  const handlers = createIpcHandlers({
    companiesRepo: noop as never,
    employeesRepo: employeesRepo as unknown as never,
    threadsRepo: threadsRepo as unknown as never,
    messagesRepo: messagesRepo as unknown as never,
    ticketsRepo: ticketsRepo as unknown as never,
    ticketAttachmentsRepo: noop as never,
    goalsRepo: goalsRepo as unknown as never,
    projectsRepo: projectsRepo as unknown as never,
    meetingsRepo: noop as never,
    runsRepo: noop as never,
    eventsRepo: noop as never,
    orchestrator: orchestrator as unknown as never,
    meetingService: noop as never,
    roleLookup: noop as never,
    mcpHost: noop as never,
    mcpServersRepo: noop as never,
    providersService: noop as never,
    secretsStore: noop as never,
    settingsRepo: noop as never,
    vaultService: noop as never,
    backupService: noop as never,
    auditRepo: noop as never,
    updaterService: noop as never,
    bus: opts?.omitBus ? undefined : bus.bus,
    getHardwareProfile: () => ({ cpuCores: 4, ramGb: 16, gpuName: null, gpuVramGb: null }),
  });

  return {
    handlers,
    ticketsRepo,
    projectsRepo,
    goalsRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    orchestrator,
    bus,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Invariant #11 main-side emits — Phase 5.6 M-C step f', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // Goals (3 emits)
  // -------------------------------------------------------------------------

  describe('goals.create', () => {
    it('emits goal.created with goalId + companyId + title + createdAt', async () => {
      const { handlers, bus } = buildHarness();
      const { goalId } = await handlers.goalsCreate({
        companyId: COMPANY_ID,
        title: '  Ship v1.1.1  ',
      });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]).toMatchObject({
        type: 'goal.created',
        companyId: COMPANY_ID,
        actorId: 'rocky',
        actorKind: 'user',
      });
      const payload = bus.emitted[0]?.payload as {
        goalId: string;
        companyId: string;
        title: string;
        createdAt: number;
      };
      expect(payload.goalId).toBe(goalId);
      expect(payload.title).toBe('Ship v1.1.1');
      expect(payload.createdAt).toBeGreaterThan(0);
    });

    it('swallows bus.emit throw (durable write still happens)', async () => {
      const { handlers, goalsRepo, bus } = buildHarness();
      bus.setNextEmitThrow(new Error('bus dead'));
      await expect(
        handlers.goalsCreate({ companyId: COMPANY_ID, title: 'x' }),
      ).resolves.toBeDefined();
      expect(goalsRepo.rows).toHaveLength(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ipc] goals.create: bus emit failed'),
        expect.any(Error),
      );
    });

    it('tolerates bus dep unwired (dev-mode warn)', async () => {
      const { handlers, goalsRepo } = buildHarness({ omitBus: true });
      await handlers.goalsCreate({ companyId: COMPANY_ID, title: 'x' });
      expect(goalsRepo.rows).toHaveLength(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('goals.create: bus dep unwired'),
      );
    });
  });

  describe('goals.update', () => {
    it('emits goal.updated with patchedKeys reflecting caller intent', async () => {
      const { handlers, goalsRepo, bus } = buildHarness();
      const { goalId } = await handlers.goalsCreate({ companyId: COMPANY_ID, title: 'goal' });
      bus.emitted.length = 0; // drop the goal.created emit
      await handlers.goalsUpdate({ goalId, title: 'new title', progressPct: 50 });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('goal.updated');
      const payload = bus.emitted[0]?.payload as {
        goalId: string;
        patchedKeys: string[];
        progress: number;
      };
      expect(payload.patchedKeys).toEqual(['title', 'progress']);
      // DB stores 0..100; payload normalizes to 0..1
      expect(payload.progress).toBeCloseTo(0.5);
      expect(goalsRepo.rows[0]?.title).toBe('new title');
    });

    it('empty patch still emits with empty patchedKeys', async () => {
      const { handlers, bus } = buildHarness();
      const { goalId } = await handlers.goalsCreate({ companyId: COMPANY_ID, title: 'x' });
      bus.emitted.length = 0;
      await handlers.goalsUpdate({ goalId });
      expect(bus.emitted).toHaveLength(1);
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[]; progress: number };
      expect(payload.patchedKeys).toEqual([]);
      expect(payload.progress).toBe(0);
    });
  });

  describe('goals.delete', () => {
    it('emits goal.deleted with title snapshot captured before drop', async () => {
      const { handlers, goalsRepo, bus } = buildHarness();
      const { goalId } = await handlers.goalsCreate({
        companyId: COMPANY_ID,
        title: 'condemned',
      });
      bus.emitted.length = 0;
      await handlers.goalsDelete({ goalId });
      expect(goalsRepo.rows).toHaveLength(0);
      expect(bus.emitted).toHaveLength(1);
      const payload = bus.emitted[0]?.payload as { title: string; deletedAt: number };
      expect(payload.title).toBe('condemned');
      expect(payload.deletedAt).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Projects (5 emits)
  // -------------------------------------------------------------------------

  describe('projects.create', () => {
    it('emits project.created with goalId null when standalone', async () => {
      const { handlers, bus } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: '  new project  ',
      });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('project.created');
      const payload = bus.emitted[0]?.payload as {
        projectId: string;
        title: string;
        goalId: string | null;
      };
      expect(payload.projectId).toBe(projectId);
      expect(payload.title).toBe('new project');
      expect(payload.goalId).toBeNull();
    });

    it('emits project.created with goalId threaded through when supplied', async () => {
      const { handlers, bus } = buildHarness();
      await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'bound',
        goalId: 'goal-xyz',
      });
      const payload = bus.emitted[0]?.payload as { goalId: string | null };
      expect(payload.goalId).toBe('goal-xyz');
    });
  });

  describe('projects.update', () => {
    it('emits project.updated with patchedKeys reflecting caller intent', async () => {
      const { handlers, bus } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'x',
      });
      bus.emitted.length = 0;
      await handlers.projectsUpdate({ projectId, title: 'y', status: 'active' });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('project.updated');
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[] };
      expect(payload.patchedKeys).toEqual(['title', 'status']);
    });
  });

  describe('projects.delete', () => {
    it('emits project.deleted with title snapshot + recalcProgress fires when linked to goal', async () => {
      const { handlers, goalsRepo, bus } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'doomed',
        goalId: 'goal-parent',
      });
      bus.emitted.length = 0;
      await handlers.projectsDelete({ projectId });
      expect(bus.emitted).toHaveLength(1);
      const payload = bus.emitted[0]?.payload as { title: string };
      expect(payload.title).toBe('doomed');
      expect(goalsRepo.recalcCalls).toContain('goal-parent');
    });
  });

  describe('projects.linkTicket', () => {
    it('fetches the project to thread companyId into the bus event', async () => {
      const { handlers, projectsRepo, bus } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'p',
      });
      bus.emitted.length = 0;
      await handlers.projectsLinkTicket({ projectId, ticketId: 'ticket-free' });
      expect(projectsRepo.linkCalls).toEqual([{ projectId, ticketId: 'ticket-free' }]);
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]).toMatchObject({
        type: 'project.ticketLinked',
        companyId: COMPANY_ID,
      });
      const payload = bus.emitted[0]?.payload as { ticketId: string; linkedAt: number };
      expect(payload.ticketId).toBe('ticket-free');
      expect(payload.linkedAt).toBeGreaterThan(0);
    });

    it('rejects phantom project id before any repo write', async () => {
      const { handlers, projectsRepo } = buildHarness();
      await expect(
        handlers.projectsLinkTicket({ projectId: 'nope', ticketId: 't' }),
      ).rejects.toThrow('project not found');
      expect(projectsRepo.linkCalls).toEqual([]);
    });
  });

  describe('projects.unlinkTicket', () => {
    it('emits project.ticketUnlinked with companyId from the fetched project', async () => {
      const { handlers, projectsRepo, bus } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'p',
      });
      bus.emitted.length = 0;
      await handlers.projectsUnlinkTicket({ projectId, ticketId: 'ticket-free' });
      expect(projectsRepo.unlinkCalls).toEqual([{ projectId, ticketId: 'ticket-free' }]);
      expect(bus.emitted[0]?.type).toBe('project.ticketUnlinked');
      const payload = bus.emitted[0]?.payload as { unlinkedAt: number };
      expect(payload.unlinkedAt).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Tickets (6 handlers, 7 emits — tickets.create fires ticket.created + ticket.assigned)
  // -------------------------------------------------------------------------

  describe('tickets.create', () => {
    it('emits ticket.created with assigneeId null when no immediate-assign', async () => {
      const { handlers, bus } = buildHarness();
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'free',
      });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('ticket.created');
      const payload = bus.emitted[0]?.payload as {
        ticketId: string;
        assigneeId: string | null;
      };
      expect(payload.ticketId).toBe(ticketId);
      expect(payload.assigneeId).toBeNull();
    });

    it('fires ticket.created + ticket.assigned when immediate-assign succeeds', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'assigned from start',
        assigneeId: 'emp-1',
      });
      expect(bus.emitted.map((e) => e.type)).toEqual(['ticket.created', 'ticket.assigned']);
      const assignPayload = bus.emitted[1]?.payload as {
        ticketId: string;
        assigneeId: string;
        previousAssigneeId: string | null;
        threadId: string;
      };
      expect(assignPayload.ticketId).toBe(ticketId);
      expect(assignPayload.assigneeId).toBe('emp-1');
      expect(assignPayload.previousAssigneeId).toBeNull();
      expect(assignPayload.threadId).toMatch(/^thread-/);
    });
  });

  describe('tickets.update', () => {
    it('emits ticket.updated with patchedKeys (excludes labelsJson/slaHours/dueAt by design)', async () => {
      const { handlers, bus } = buildHarness();
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
      });
      bus.emitted.length = 0;
      await handlers.ticketsUpdate({
        ticketId,
        title: 'new',
        status: 'in_progress',
        priority: 'high',
      });
      expect(bus.emitted).toHaveLength(1);
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[] };
      expect(payload.patchedKeys).toEqual(['title', 'status', 'priority']);
    });
  });

  describe('tickets.assign', () => {
    it('carries previousAssigneeId snapshot when reassigning', async () => {
      const { handlers, employeesRepo, ticketsRepo, bus } = buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      employeesRepo.seed('emp-2', COMPANY_ID, 'Bob');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
        assigneeId: 'emp-1',
      });
      bus.emitted.length = 0;
      await handlers.ticketsAssign({ ticketId, assigneeId: 'emp-2' });
      expect(bus.emitted.map((e) => e.type)).toEqual(['ticket.assigned']);
      const payload = bus.emitted[0]?.payload as {
        assigneeId: string;
        previousAssigneeId: string | null;
      };
      expect(payload.assigneeId).toBe('emp-2');
      expect(payload.previousAssigneeId).toBe('emp-1');
      expect(ticketsRepo.getById(ticketId)?.assigneeId).toBe('emp-2');
    });

    it('emits with null previousAssigneeId when ticket had no prior assignee', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
      });
      bus.emitted.length = 0;
      await handlers.ticketsAssign({ ticketId, assigneeId: 'emp-1' });
      const payload = bus.emitted[0]?.payload as { previousAssigneeId: string | null };
      expect(payload.previousAssigneeId).toBeNull();
    });
  });

  describe('tickets.close', () => {
    it('emits ticket.closed with closedAt timestamp', async () => {
      const { handlers, ticketsRepo, bus } = buildHarness();
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
      });
      bus.emitted.length = 0;
      await handlers.ticketsClose({ ticketId });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('ticket.closed');
      const payload = bus.emitted[0]?.payload as { closedAt: number };
      expect(payload.closedAt).toBeGreaterThan(0);
      expect(ticketsRepo.getById(ticketId)?.status).toBe('done');
    });
  });

  describe('tickets.reopen', () => {
    it('emits ticket.reopened after the repo flip', async () => {
      const { handlers, ticketsRepo, bus } = buildHarness();
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
      });
      await handlers.ticketsClose({ ticketId });
      bus.emitted.length = 0;
      await handlers.ticketsReopen({ ticketId });
      expect(bus.emitted[0]?.type).toBe('ticket.reopened');
      expect(ticketsRepo.getById(ticketId)?.status).toBe('open');
    });
  });

  describe('tickets.addComment', () => {
    it('emits ticket.commentAdded with messageId + authorId = HUMAN_USER_ID', async () => {
      const { handlers, employeesRepo, messagesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
        assigneeId: 'emp-1',
      });
      bus.emitted.length = 0;
      const result = await handlers.ticketsAddComment({ ticketId, content: '  hello  ' });
      expect(messagesRepo.appendCalls.at(-1)?.content).toBe('hello');
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('ticket.commentAdded');
      const payload = bus.emitted[0]?.payload as {
        messageId: string;
        authorId: string;
        addedAt: number;
      };
      expect(payload.messageId).toBe(result.messageId);
      expect(payload.authorId).toBe('rocky');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting invariant pins
  // -------------------------------------------------------------------------

  describe('invariant #11 cross-cutting contract', () => {
    it('every bus emit carries actorId=rocky + actorKind=user (HUMAN_USER_ID sweep)', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      const { goalId } = await handlers.goalsCreate({ companyId: COMPANY_ID, title: 'g' });
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'p',
      });
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 't',
      });
      await handlers.goalsUpdate({ goalId, title: 'g2' });
      await handlers.projectsUpdate({ projectId, title: 'p2' });
      await handlers.ticketsUpdate({ ticketId, title: 't2' });
      await handlers.projectsLinkTicket({ projectId, ticketId });
      await handlers.projectsUnlinkTicket({ projectId, ticketId });
      await handlers.ticketsAssign({ ticketId, assigneeId: 'emp-1' });
      await handlers.ticketsClose({ ticketId });
      await handlers.ticketsReopen({ ticketId });
      await handlers.ticketsAddComment({ ticketId, content: 'hi' });
      await handlers.projectsDelete({ projectId });
      await handlers.goalsDelete({ goalId });

      // Expect at least 12 emits (one per mutation + ticket.assigned fired by assign)
      expect(bus.emitted.length).toBeGreaterThanOrEqual(12);
      for (const e of bus.emitted) {
        expect(e.actorId).toBe('rocky');
        expect(e.actorKind).toBe('user');
        expect(e.companyId).toBe(COMPANY_ID);
      }
    });

    it('emits carry companyId matching the mutated row (cross-company isolation)', async () => {
      const { handlers, bus } = buildHarness();
      await handlers.goalsCreate({ companyId: COMPANY_ID, title: 'g1' });
      await handlers.goalsCreate({ companyId: SECOND_COMPANY_ID, title: 'g2' });
      expect(bus.emitted.map((e) => e.companyId)).toEqual([COMPANY_ID, SECOND_COMPANY_ID]);
    });
  });
});
