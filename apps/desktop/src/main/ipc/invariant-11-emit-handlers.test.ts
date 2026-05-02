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
 * (main-side Invariant #11 completeness hardening) AND the 4 additional
 * emits introduced by Phase 5.6 M-C FOLLOWUP-P1-extended (employees.
 * hire/fire + ticket attachment lifecycle). Together they close the
 * FOLLOWUP-P1 gaps surfaced by `docs/qa/2026-04-18-ground-zero-audit.md`
 * §3.1 (step f) and `docs/qa/2026-04-18-autonomous-run-report.md` §4
 * (FOLLOWUP-P1-extended: BUG-009 / BUG-010 / BUG-011) — every state-
 * mutating `tickets.*` / `projects.*` / `goals.*` / `employees.*` IPC
 * channel now emits a bus event so renderer caches invalidate without
 * relying on `onSuccess` coupling.
 *
 * Coverage per handler:
 *   - happy-path bus emit assertion (type + companyId + actorId + kind + payload shape)
 *   - best-effort emit: bus.emit throw is logged + swallowed
 *   - bus dep unwired is tolerated (dev-mode console.warn)
 *
 * Extended coverage for the richer payloads:
 *   - patchedKeys reflects caller intent for tickets.update / projects.update / goals.update
 *   - goal.updated re-reads progressPct AFTER the write and normalizes 0..100 → 0..1
 *   - snapshot-before-drop for goal.deleted / project.deleted / employee.fired
 *   - ticket.assigned carries previousAssigneeId snapshot (captured pre-write)
 *   - tickets.create fires ticket.created always + ticket.assigned when immediate-assign succeeds
 *   - project.ticketLinked / project.ticketUnlinked thread companyId via a project fetch
 *   - ticket.attachmentAdded / ticket.attachmentRemoved thread companyId via a ticket fetch
 *   - ticket.attachmentRemoved captures attachmentId via listByTicket BEFORE the drop
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
    if (input.description !== undefined) row.description = input.description;
    if (input.status !== undefined) row.status = input.status;
    if (input.priority !== undefined) row.priority = input.priority;
    if (input.assigneeId !== undefined) row.assigneeId = input.assigneeId;
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
      goalId: input.goalId ?? null,
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'active',
      leadId: input.leadId ?? null,
      priority: input.priority ?? 'medium',
      targetDate: input.targetDate ?? null,
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
    if (input.description !== undefined) row.description = input.description;
    if (input.status !== undefined) row.status = input.status;
    if (input.goalId !== undefined) row.goalId = input.goalId;
    if (input.leadId !== undefined) row.leadId = input.leadId;
    if (input.priority !== undefined) row.priority = input.priority;
    if (input.targetDate !== undefined) row.targetDate = input.targetDate;
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
  private seq = 0;
  nextCreateThrow: Error | null = null;

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
  /**
   * Seed a framework-internal pseudo-employee (`isSystem=1`). Used by the
   * FOLLOWUP-P1-extended `employees.fire` refuse-test — the IPC handler's
   * last-line-of-defense must reject system rows even when the caller
   * gets past the hire-dialog filter.
   */
  seedSystem(employeeId: string, companyId: string, roleId = 'system-agent'): void {
    this.rows.push({
      id: employeeId,
      companyId,
      roleId,
      name: 'System Agent',
      title: 'System Agent',
      level: 'system',
      modelPref: null,
      providerPref: null,
      status: 'idle',
      isSystem: 1,
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
  /**
   * Working `create` for the FOLLOWUP-P1-extended `employee.hired` tests.
   * Pushes the resolved row onto `rows` and returns a monotonically
   * increasing id.
   */
  create(input: {
    companyId: string;
    rolePackId: string;
    roleId: string;
    roleMdSha: string;
    level: string;
    name: string;
    title: string;
    toolsAllowed?: string[];
    toolsDenied?: string[];
  }): string {
    if (this.nextCreateThrow) {
      const e = this.nextCreateThrow;
      this.nextCreateThrow = null;
      throw e;
    }
    this.seq += 1;
    // Use a `hire-` prefix so FOLLOWUP-P1-extended `create` ids never
    // collide with `emp-*` ids produced by `seed(...)` in the step-f
    // cross-cutting sweep test.
    const id = `hire-${this.seq}`;
    this.rows.push({
      id,
      companyId: input.companyId,
      roleId: input.roleId,
      name: input.name,
      title: input.title,
      level: input.level,
      modelPref: null,
      providerPref: null,
      status: 'idle',
      isSystem: 0,
      toolsAllowedJson: JSON.stringify(input.toolsAllowed ?? []),
      toolsDeniedJson: JSON.stringify(input.toolsDenied ?? []),
      roleMdSha: input.roleMdSha,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as EmployeeRow);
    return id;
  }
  /** Working `delete` for the FOLLOWUP-P1-extended `employee.fired` tests. */
  delete(id: string): void {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  promote(_input: never): void {
    throw new Error('unused by invariant-11 tests');
  }
}

/**
 * Fake `IpcTicketAttachmentsRepo` for the FOLLOWUP-P1-extended
 * `tickets.attachFile` / `tickets.detachFile` bus-emit tests. Mirrors
 * the production repo's contract: `attach` returns a generated id and
 * pushes a row; `detachByFile` removes the `(ticketId, fileId)` pair;
 * `listByTicket` returns matching rows newest-first.
 */
class FakeTicketAttachmentsRepo {
  rows: Array<{
    id: string;
    ticketId: string;
    fileId: string;
    attachedBy: string;
    attachedAt: number;
  }> = [];
  private seq = 0;

  attach(ticketId: string, fileId: string, attachedBy: string): string {
    this.seq += 1;
    const id = `att-${this.seq}`;
    this.rows.push({ id, ticketId, fileId, attachedBy, attachedAt: Date.now() });
    return id;
  }
  detachByFile(ticketId: string, fileId: string): void {
    this.rows = this.rows.filter((r) => !(r.ticketId === ticketId && r.fileId === fileId));
  }
  listByTicket(ticketId: string): Array<{
    id: string;
    ticketId: string;
    fileId: string;
    attachedBy: string;
    attachedAt: number;
  }> {
    return this.rows
      .filter((r) => r.ticketId === ticketId)
      .slice()
      .reverse();
  }
}

/**
 * Fake `IpcRoleLookup` for the FOLLOWUP-P1-extended `employees.create`
 * tests. Seeds a canned `senior-fullstack-engineer` role (level: 'ic')
 * and a canned `system-agent` role (level: 'system') so the handler's
 * framework-internal-role refusal path stays exercisable.
 */
function makeFakeRoleLookup() {
  const specs: Record<string, unknown> = {
    'senior-fullstack-engineer': {
      sha256: 'deadbeef',
      frontmatter: {
        id: 'senior-fullstack-engineer',
        level: 'ic',
        name: 'Senior Fullstack Engineer',
        tools_allowed: ['read', 'edit'],
        tools_denied: ['shell'],
      },
    },
    'system-agent': {
      sha256: 'systemsha',
      frontmatter: {
        id: 'system-agent',
        level: 'system',
        name: 'System Agent',
      },
    },
  };
  return {
    getSpec(roleId: string): unknown {
      return specs[roleId] ?? null;
    },
  };
}

class FakeThreadsRepo implements IpcThreadsRepo {
  private seq = 0;
  createCalls: CreateThreadInput[] = [];
  memberCalls: Array<{ threadId: string; memberId: string; memberKind: string }> = [];
  memberRows: ThreadMemberRow[] = [];

  create(input: CreateThreadInput): string {
    this.createCalls.push(input);
    this.seq += 1;
    return `thread-${this.seq}`;
  }
  getById(_id: string): never {
    throw new Error('unused by invariant-11 tests');
  }
  addMember(input: { threadId: string; memberId: string; memberKind: string }): void {
    this.memberCalls.push({
      threadId: input.threadId,
      memberId: input.memberId,
      memberKind: input.memberKind,
    });
    this.memberRows.push({
      threadId: input.threadId,
      memberId: input.memberId,
      memberKind: input.memberKind,
      roleInThread: null,
    } as ThreadMemberRow);
  }
  removeMember(input: { threadId: string; memberId: string; memberKind: string }): void {
    this.memberRows = this.memberRows.filter(
      (member) =>
        !(
          member.threadId === input.threadId &&
          member.memberId === input.memberId &&
          member.memberKind === input.memberKind
        ),
    );
  }
  listMembers(threadId: string): ThreadMemberRow[] {
    return this.memberRows.filter((member) => member.threadId === threadId);
  }
  updateLastMessageAt(_threadId: string, _timestamp: number): void {
    // Unused by invariant-11 tests.
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
  rows: MessageRow[] = [];

  append(input: AppendMessageInput): string {
    this.appendCalls.push(input);
    this.seq += 1;
    const id = `msg-${this.seq}`;
    this.rows.push({
      id,
      threadId: input.threadId,
      authorId: input.authorId,
      authorKind: input.authorKind,
      content: input.content,
      toolCallsJson: input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
      parentId: input.parentId ?? null,
      isAgentInitiated: input.isAgentInitiated ?? false,
      createdAt: Date.now(),
    } as MessageRow);
    return id;
  }
  listByThread(threadId: string): MessageRow[] {
    return this.rows.filter((row) => row.threadId === threadId);
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
  // FOLLOWUP-P1-extended — real fakes for `ticketAttachmentsRepo` + `roleLookup`
  // replacing the step-f `noop as never` stubs so employees.create /
  // employees.fire / tickets.attachFile / tickets.detachFile handler bodies
  // resolve cleanly without touching production role-pack files.
  const ticketAttachmentsRepo = new FakeTicketAttachmentsRepo();
  const roleLookup = makeFakeRoleLookup();
  const bus = makeBusMock();

  const handlers = createIpcHandlers({
    companiesRepo: noop as never,
    employeesRepo: employeesRepo as unknown as never,
    threadsRepo: threadsRepo as unknown as never,
    messagesRepo: messagesRepo as unknown as never,
    ticketsRepo: ticketsRepo as unknown as never,
    ticketAttachmentsRepo: ticketAttachmentsRepo as unknown as never,
    goalsRepo: goalsRepo as unknown as never,
    projectsRepo: projectsRepo as unknown as never,
    meetingsRepo: noop as never,
    runsRepo: noop as never,
    eventsRepo: noop as never,
    orchestrator: orchestrator as unknown as never,
    meetingService: noop as never,
    roleLookup: roleLookup as unknown as never,
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
    ticketAttachmentsRepo,
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
      await handlers.projectsUpdate({
        projectId,
        title: 'y',
        status: 'active',
        priority: 'high',
        targetDate: Date.UTC(2026, 10, 1, 12, 0, 0),
      });
      expect(bus.emitted).toHaveLength(1);
      expect(bus.emitted[0]?.type).toBe('project.updated');
      const payload = bus.emitted[0]?.payload as { patchedKeys: string[] };
      expect(payload.patchedKeys).toEqual(['title', 'status', 'priority', 'targetDate']);
    });

    it('recalculates old and new goal progress when a project is rebound', async () => {
      const { handlers, goalsRepo } = buildHarness();
      const { projectId } = await handlers.projectsCreate({
        companyId: COMPANY_ID,
        title: 'bound',
        goalId: 'goal-old',
      });

      await handlers.projectsUpdate({ projectId, goalId: 'goal-new' });

      expect(goalsRepo.recalcCalls).toEqual(['goal-old', 'goal-new']);
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

    it('wakes every employee participant and historical employee author on human comments', async () => {
      const { handlers, employeesRepo, ticketsRepo, threadsRepo, messagesRepo, orchestrator } =
        buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      employeesRepo.seed('emp-2', COMPANY_ID, 'Iris');
      employeesRepo.seed('emp-3', COMPANY_ID, 'Carolyn');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
        assigneeId: 'emp-1',
      });
      const threadId = ticketsRepo.getById(ticketId)?.threadId;
      expect(threadId).toBeTypeOf('string');
      threadsRepo.addMember({
        threadId: threadId ?? '',
        memberId: 'emp-2',
        memberKind: 'employee',
      });
      messagesRepo.append({
        threadId: threadId ?? '',
        authorId: 'emp-3',
        authorKind: 'employee',
        content: 'I participated earlier.',
      });
      orchestrator.enqueueCalls.length = 0;

      await handlers.ticketsAddComment({ ticketId, content: 'Any update?' });

      expect(orchestrator.enqueueCalls.map((call) => call.employeeId)).toEqual([
        'emp-1',
        'emp-2',
        'emp-3',
      ]);
    });
  });

  describe('tickets.addParticipant / tickets.removeParticipant', () => {
    it('adds, wakes, and removes ticket participants from the ticket thread', async () => {
      const { handlers, employeesRepo, ticketsRepo, threadsRepo, orchestrator, bus } =
        buildHarness();
      employeesRepo.seed('emp-1', COMPANY_ID, 'Alice');
      employeesRepo.seed('emp-2', COMPANY_ID, 'Iris');
      const { ticketId } = await handlers.ticketsCreate({
        companyId: COMPANY_ID,
        title: 'x',
        assigneeId: 'emp-1',
      });
      const threadId = ticketsRepo.getById(ticketId)?.threadId;
      expect(threadId).toBeTypeOf('string');
      bus.emitted.length = 0;
      orchestrator.enqueueCalls.length = 0;

      await handlers.ticketsAddParticipant({ ticketId, employeeId: 'emp-2' });

      expect(threadsRepo.listMembers(threadId ?? '').map((member) => member.memberId)).toContain(
        'emp-2',
      );
      expect(orchestrator.enqueueCalls.map((call) => call.employeeId)).toEqual(['emp-2']);
      expect(bus.emitted[0]?.type).toBe('ticket.participantAdded');

      bus.emitted.length = 0;
      await handlers.ticketsRemoveParticipant({ ticketId, employeeId: 'emp-2' });

      expect(threadsRepo.listMembers(threadId ?? '').map((member) => member.memberId)).not.toContain(
        'emp-2',
      );
      expect(bus.emitted[0]?.type).toBe('ticket.participantRemoved');
    });
  });

  // -------------------------------------------------------------------------
  // FOLLOWUP-P1-extended — Phase 5.6 M-C employees.hire/fire + ticket
  // attachment emits (BUG-009 / BUG-010 / BUG-011). Same coverage discipline
  // as the step-f tickets/projects/goals blocks above: happy-path emit +
  // throw-swallow + dep-unwired warn, plus the lifecycle-specific snapshot
  // guards (fire snapshot-before-drop, detach attachmentId snapshot).
  // -------------------------------------------------------------------------

  describe('employees.create (BUG-009)', () => {
    it('emits employee.hired with employeeId + companyId + resolved role frontmatter + hiredAt', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      const res = await handlers.employeesCreate({
        companyId: COMPANY_ID,
        roleId: 'senior-fullstack-engineer',
        name: '  Alice Smith  ',
      });
      expect(employeesRepo.rows.length).toBe(1);
      expect(employeesRepo.rows[0]?.name).toBe('Alice Smith'); // trimmed by handler
      expect(bus.emitted.length).toBe(1);
      const emit = bus.emitted[0];
      expect(emit?.type).toBe('employee.hired');
      expect(emit?.companyId).toBe(COMPANY_ID);
      expect(emit?.actorId).toBe('rocky');
      expect(emit?.actorKind).toBe('user');
      const payload = emit?.payload as {
        employeeId: string;
        companyId: string;
        roleId: string;
        level: string;
        name: string;
        title: string;
        hiredAt: number;
      };
      expect(payload.employeeId).toBe(res.employeeId);
      expect(payload.companyId).toBe(COMPANY_ID);
      expect(payload.roleId).toBe('senior-fullstack-engineer');
      expect(payload.level).toBe('ic');
      expect(payload.name).toBe('Alice Smith');
      expect(payload.title).toBe('Senior Fullstack Engineer');
      expect(typeof payload.hiredAt).toBe('number');
    });

    it('does NOT emit when role resolution fails (handler throws before write)', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      await expect(
        handlers.employeesCreate({
          companyId: COMPANY_ID,
          roleId: 'nonexistent-role',
          name: 'Alice',
        }),
      ).rejects.toThrow('role not found');
      expect(employeesRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(0);
    });

    it('refuses to hire a framework-internal role (no emit, no row write)', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      await expect(
        handlers.employeesCreate({
          companyId: COMPANY_ID,
          roleId: 'system-agent',
          name: 'bad-path',
        }),
      ).rejects.toThrow('framework-internal');
      expect(employeesRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(0);
    });

    it('swallows a bus.emit throw (durable write still happens)', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      bus.setNextEmitThrow(new Error('bus down'));
      const res = await handlers.employeesCreate({
        companyId: COMPANY_ID,
        roleId: 'senior-fullstack-engineer',
        name: 'Alice',
      });
      expect(res.employeeId).toBeDefined();
      expect(employeesRepo.rows.length).toBe(1); // durable write landed
      expect(bus.emitted.length).toBe(1); // emit attempted — throw was swallowed
    });

    it('tolerates bus dep unwired (dev-mode warn)', async () => {
      const { handlers, employeesRepo } = buildHarness({ omitBus: true });
      const res = await handlers.employeesCreate({
        companyId: COMPANY_ID,
        roleId: 'senior-fullstack-engineer',
        name: 'Alice',
      });
      expect(res.employeeId).toBeDefined();
      expect(employeesRepo.rows.length).toBe(1);
    });
  });

  describe('employees.fire (BUG-010)', () => {
    it('emits employee.fired with snapshot fields captured BEFORE the delete', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-fire-1', COMPANY_ID, 'Bob Jones');
      // Force a specific pre-fire snapshot
      const row = employeesRepo.rows[0];
      if (row) {
        row.roleId = 'senior-fullstack-engineer';
        row.level = 'ic';
        row.title = 'Senior Fullstack Engineer';
      }

      await handlers.employeesFire({ employeeId: 'emp-fire-1' });
      expect(employeesRepo.rows.length).toBe(0); // delete landed
      expect(bus.emitted.length).toBe(1);
      const emit = bus.emitted[0];
      expect(emit?.type).toBe('employee.fired');
      expect(emit?.companyId).toBe(COMPANY_ID);
      expect(emit?.actorId).toBe('rocky');
      expect(emit?.actorKind).toBe('user');
      const payload = emit?.payload as {
        employeeId: string;
        companyId: string;
        roleId: string;
        level: string;
        name: string;
        title: string;
        firedAt: number;
      };
      expect(payload.employeeId).toBe('emp-fire-1');
      expect(payload.companyId).toBe(COMPANY_ID);
      expect(payload.roleId).toBe('senior-fullstack-engineer');
      expect(payload.level).toBe('ic');
      expect(payload.name).toBe('Bob Jones'); // snapshot — row is gone now
      expect(payload.title).toBe('Senior Fullstack Engineer');
      expect(typeof payload.firedAt).toBe('number');
    });

    it('refuses a framework-internal (isSystem) employee — no delete, no emit', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seedSystem('sys-agent-1', COMPANY_ID);
      await expect(handlers.employeesFire({ employeeId: 'sys-agent-1' })).rejects.toThrow(
        'framework-internal',
      );
      expect(employeesRepo.rows.length).toBe(1); // still there
      expect(bus.emitted.length).toBe(0);
    });

    it('rejects phantom employeeId before any emit', async () => {
      const { handlers, bus } = buildHarness();
      await expect(handlers.employeesFire({ employeeId: 'phantom' })).rejects.toThrow(
        'employee not found',
      );
      expect(bus.emitted.length).toBe(0);
    });

    it('swallows a bus.emit throw (row still deleted)', async () => {
      const { handlers, employeesRepo, bus } = buildHarness();
      employeesRepo.seed('emp-fire-2', COMPANY_ID, 'Bob');
      bus.setNextEmitThrow(new Error('bus down'));
      await handlers.employeesFire({ employeeId: 'emp-fire-2' });
      expect(employeesRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(1); // throw was swallowed after emit attempt
    });

    it('tolerates bus dep unwired (dev-mode warn)', async () => {
      const { handlers, employeesRepo } = buildHarness({ omitBus: true });
      employeesRepo.seed('emp-fire-3', COMPANY_ID, 'Bob');
      await handlers.employeesFire({ employeeId: 'emp-fire-3' });
      expect(employeesRepo.rows.length).toBe(0);
    });
  });

  describe('tickets.attachFile (BUG-011)', () => {
    it('emits ticket.attachmentAdded with companyId threaded via ticket fetch', async () => {
      const { handlers, ticketsRepo, ticketAttachmentsRepo, bus } = buildHarness();
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });

      const res = await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-file-1' });
      expect(ticketAttachmentsRepo.rows.length).toBe(1);
      expect(bus.emitted.length).toBe(1);
      const emit = bus.emitted[0];
      expect(emit?.type).toBe('ticket.attachmentAdded');
      expect(emit?.companyId).toBe(COMPANY_ID);
      expect(emit?.actorId).toBe('rocky');
      expect(emit?.actorKind).toBe('user');
      const payload = emit?.payload as {
        attachmentId: string;
        ticketId: string;
        companyId: string;
        fileId: string;
        attachedBy: string;
        attachedAt: number;
      };
      expect(payload.attachmentId).toBe(res.attachmentId);
      expect(payload.ticketId).toBe(ticketId);
      expect(payload.companyId).toBe(COMPANY_ID);
      expect(payload.fileId).toBe('vault-file-1');
      expect(payload.attachedBy).toBe('rocky');
      expect(typeof payload.attachedAt).toBe('number');
    });

    it('rejects phantom ticketId before any repo write or emit', async () => {
      const { handlers, ticketAttachmentsRepo, bus } = buildHarness();
      await expect(
        handlers.ticketsAttachFile({ ticketId: 'phantom', fileId: 'vault-file-1' }),
      ).rejects.toThrow('ticket not found');
      expect(ticketAttachmentsRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(0);
    });

    it('swallows a bus.emit throw (row still attached)', async () => {
      const { handlers, ticketsRepo, ticketAttachmentsRepo, bus } = buildHarness();
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });
      bus.setNextEmitThrow(new Error('bus down'));
      const res = await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-file-1' });
      expect(res.attachmentId).toBeDefined();
      expect(ticketAttachmentsRepo.rows.length).toBe(1);
      expect(bus.emitted.length).toBe(1);
    });

    it('tolerates bus dep unwired (dev-mode warn)', async () => {
      const { handlers, ticketsRepo, ticketAttachmentsRepo } = buildHarness({ omitBus: true });
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });
      const res = await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-file-1' });
      expect(res.attachmentId).toBeDefined();
      expect(ticketAttachmentsRepo.rows.length).toBe(1);
    });
  });

  describe('tickets.detachFile (BUG-011)', () => {
    it('emits ticket.attachmentRemoved with snapshot attachmentId captured BEFORE drop', async () => {
      const { handlers, ticketsRepo, ticketAttachmentsRepo, bus } = buildHarness();
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });
      const attach = await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-file-1' });
      // Reset emits so the detach assertion sees only the detach event.
      bus.emitted.length = 0;

      await handlers.ticketsDetachFile({ ticketId, fileId: 'vault-file-1' });
      expect(ticketAttachmentsRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(1);
      const emit = bus.emitted[0];
      expect(emit?.type).toBe('ticket.attachmentRemoved');
      expect(emit?.companyId).toBe(COMPANY_ID);
      expect(emit?.actorId).toBe('rocky');
      expect(emit?.actorKind).toBe('user');
      const payload = emit?.payload as {
        attachmentId: string | null;
        ticketId: string;
        companyId: string;
        fileId: string;
        removedAt: number;
      };
      expect(payload.attachmentId).toBe(attach.attachmentId); // snapshot from listByTicket pre-drop
      expect(payload.ticketId).toBe(ticketId);
      expect(payload.companyId).toBe(COMPANY_ID);
      expect(payload.fileId).toBe('vault-file-1');
      expect(typeof payload.removedAt).toBe('number');
    });

    it('emits with attachmentId=null when no matching (ticketId, fileId) row exists (no-op detach)', async () => {
      const { handlers, ticketsRepo, bus } = buildHarness();
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });

      await handlers.ticketsDetachFile({ ticketId, fileId: 'phantom-file' });
      expect(bus.emitted.length).toBe(1);
      const payload = bus.emitted[0]?.payload as { attachmentId: string | null };
      expect(payload.attachmentId).toBeNull();
    });

    it('rejects phantom ticketId before any repo write or emit', async () => {
      const { handlers, ticketAttachmentsRepo, bus } = buildHarness();
      await expect(
        handlers.ticketsDetachFile({ ticketId: 'phantom', fileId: 'vault-file-1' }),
      ).rejects.toThrow('ticket not found');
      expect(ticketAttachmentsRepo.rows.length).toBe(0);
      expect(bus.emitted.length).toBe(0);
    });

    it('swallows a bus.emit throw (row still detached)', async () => {
      const { handlers, ticketsRepo, ticketAttachmentsRepo, bus } = buildHarness();
      const ticketId = ticketsRepo.create({
        companyId: COMPANY_ID,
        title: 'T',
        description: 'd',
        priority: 'normal',
        reporterId: 'rocky',
        reporterKind: 'user',
      });
      await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-file-1' });
      expect(ticketAttachmentsRepo.rows.length).toBe(1);
      bus.setNextEmitThrow(new Error('bus down'));
      await handlers.ticketsDetachFile({ ticketId, fileId: 'vault-file-1' });
      expect(ticketAttachmentsRepo.rows.length).toBe(0);
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
      // FOLLOWUP-P1-extended — include employees.hire/fire + ticket attachment
      // emits so the HUMAN_USER_ID sweep spans ALL Phase 5.6 M-C state-
      // mutating channels, not just step-f tickets/projects/goals.
      const hire = await handlers.employeesCreate({
        companyId: COMPANY_ID,
        roleId: 'senior-fullstack-engineer',
        name: 'Carol',
      });
      await handlers.employeesFire({ employeeId: hire.employeeId });
      await handlers.ticketsAttachFile({ ticketId, fileId: 'vault-x' });
      await handlers.ticketsDetachFile({ ticketId, fileId: 'vault-x' });
      await handlers.projectsDelete({ projectId });
      await handlers.goalsDelete({ goalId });

      // Expect at least 16 emits (step-f baseline 12 + 4 FOLLOWUP-P1-extended).
      expect(bus.emitted.length).toBeGreaterThanOrEqual(16);
      // FOLLOWUP-P1-extended emits must be present and carry the contract.
      const types = new Set(bus.emitted.map((e) => e.type));
      expect(types.has('employee.hired')).toBe(true);
      expect(types.has('employee.fired')).toBe(true);
      expect(types.has('ticket.attachmentAdded')).toBe(true);
      expect(types.has('ticket.attachmentRemoved')).toBe(true);
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
