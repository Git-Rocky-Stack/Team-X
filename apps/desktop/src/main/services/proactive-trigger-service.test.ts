/**
 * ProactiveTriggerService tests — TDD-first, Slice 1.
 *
 * Tests the proactive trigger service that:
 *   - Decomposes goals using agentic loop (decompose_project tool)
 *   - Scans for unassigned work and queues agent replies
 *   - Respects autonomy mode, pause state, budget, authority
 *   - Emits proactive.* events for renderer updates
 *
 * Phase 1 — Foundation — Week 1
 */

import type {
  EffectiveAuthoritySnapshot,
  EventType,
  ExtensionsAutonomyMode,
} from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProactiveDispatcher } from '../orchestrator/proactive-dispatch.js';

import {
  type ProactiveTriggerService,
  type ProactiveTriggerServiceDeps,
  createProactiveTriggerService,
} from './proactive-trigger-service.js';

// ---------------------------------------------------------------------------
// Fakes — hand-rolled for TDD isolation
// ---------------------------------------------------------------------------

interface FakeOrchestratorCall {
  companyId: string;
  employeeId: string;
  threadId: string;
  userMessageId: string;
}

class FakeOrchestrator {
  readonly enqueuedChats: FakeOrchestratorCall[] = [];
  pausedCompanies = new Set<string>();
  private nextThreadId = 1;
  private nextMessageId = 1;

  /**
   * The real orchestrator settles `enqueueChat`'s promise on turn
   * COMPLETION (orchestrator/index.ts:1819), not on admission. These
   * controls reproduce that so the in-flight counters can be observed
   * mid-turn.
   */
  private holdCount = 0;
  private readonly releases: Array<() => void> = [];
  private startedSignal: (() => void) | null = null;
  private startedPromise: Promise<void> | null = null;
  private failNext: string | null = null;

  holdNextTurn(): void {
    this.holdCount += 1;
    this.startedPromise = new Promise<void>((resolve) => {
      this.startedSignal = resolve;
    });
  }

  turnStarted(): Promise<void> {
    return this.startedPromise ?? Promise.resolve();
  }

  releaseHeldTurns(): void {
    this.holdCount = 0;
    while (this.releases.length > 0) {
      this.releases.pop()?.();
    }
  }

  failNextTurn(message: string): void {
    this.failNext = message;
  }

  async enqueueChat(args: {
    threadId: string;
    employeeId: string;
    userMessageId: string;
  }): Promise<void> {
    this.enqueuedChats.push({
      companyId: 'co-test',
      employeeId: args.employeeId,
      threadId: args.threadId,
      userMessageId: args.userMessageId,
    });

    if (this.failNext !== null) {
      const message = this.failNext;
      this.failNext = null;
      throw new Error(message);
    }

    if (this.holdCount > 0) {
      this.holdCount -= 1;
      this.startedSignal?.();
      this.startedSignal = null;
      await new Promise<void>((resolve) => {
        this.releases.push(resolve);
      });
    }
  }

  isCompanyPaused(companyId: string): boolean {
    return this.pausedCompanies.has(companyId);
  }

  pauseCompany(companyId: string): void {
    this.pausedCompanies.add(companyId);
  }

  resumeCompany(companyId: string): void {
    this.pausedCompanies.delete(companyId);
  }

  generateThreadId(): string {
    return `thr-${this.nextThreadId++}`;
  }

  generateMessageId(): string {
    return `msg-${this.nextMessageId++}`;
  }
}

interface AgenticLoopStartCall {
  companyId: string;
  userText: string;
  employeeId?: string;
}

class FakeAgenticLoopService {
  readonly starts: AgenticLoopStartCall[] = [];
  private runCounter = 0;

  async start(args: {
    companyId: string;
    userText: string;
    employeeId?: string;
  }): Promise<{ runId: string; threadId: string }> {
    this.starts.push({
      companyId: args.companyId,
      userText: args.userText,
      employeeId: args.employeeId,
    });
    this.runCounter += 1;
    return {
      runId: `run-${this.runCounter}`,
      threadId: `thr-${this.runCounter}`,
    };
  }

  waitForRun(_runId: string): Promise<void> {
    return Promise.resolve();
  }
}

interface AuthorityGrantEntry {
  resourceKind: string;
  resourceId: string;
  permission: 'allow' | 'deny' | 'prompt';
}

class FakeAuthorityResolver {
  private employeeGrants = new Map<string, AuthorityGrantEntry[]>();

  setEmployeeAuthority(employeeId: string, grants: AuthorityGrantEntry[]): void {
    this.employeeGrants.set(employeeId, grants);
  }

  resolveEmployee(companyId: string, employeeId: string): EffectiveAuthoritySnapshot {
    const grants = this.employeeGrants.get(employeeId) ?? [];
    // Match the real EffectiveAuthoritySnapshot contract from
    // @team-x/shared-types: a flat `entries` list of resolved authority
    // resolutions, plus the materialized tools allowlist/denylist. The old
    // shape (`capabilities` / `paths` arrays) was an earlier draft that the
    // type was renamed away from; tests need to mirror the real type so
    // production consumers (e.g. `proactive-trigger-service.scanForWork`)
    // see the data they actually parse against.
    return {
      companyId,
      employeeId,
      entries: grants.map((g) => ({
        resourceKind:
          g.resourceKind as EffectiveAuthoritySnapshot['entries'][number]['resourceKind'],
        resourceId: g.resourceId,
        permission: g.permission,
        sourceKind: 'employee',
        sourceId: employeeId,
      })),
      toolsAllowed: [],
      toolsDenied: [],
    };
  }
}

interface GoalRow {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
}

interface TicketRow {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  assigneeId: string | null;
  reporterId: string;
  reporterKind: string;
  priority: string;
}

interface EmployeeRow {
  id: string;
  companyId: string;
  name: string;
  level: string;
  isSystem: boolean;
  status: string;
}

class FakeGoalsRepo {
  private goals = new Map<string, GoalRow>();

  setGoal(goal: GoalRow): void {
    this.goals.set(goal.id, goal);
  }

  getById(id: string): GoalRow | null {
    return this.goals.get(id) ?? null;
  }

  listByCompany(companyId: string): GoalRow[] {
    return Array.from(this.goals.values()).filter((g) => g.companyId === companyId);
  }
}

class FakeTicketsRepo {
  private tickets = new Map<string, TicketRow>();

  setTicket(ticket: TicketRow): void {
    this.tickets.set(ticket.id, ticket);
  }

  listByCompany(companyId: string): TicketRow[] {
    return Array.from(this.tickets.values()).filter((t) => t.companyId === companyId);
  }
}

class FakeEmployeesRepo {
  private employees = new Map<string, EmployeeRow>();

  setEmployee(employee: EmployeeRow): void {
    this.employees.set(employee.id, employee);
  }

  getById(id: string): EmployeeRow | null {
    return this.employees.get(id) ?? null;
  }

  listByCompany(companyId: string): EmployeeRow[] {
    return Array.from(this.employees.values()).filter((e) => e.companyId === companyId);
  }
}

interface EmittedEvent {
  type: EventType;
  companyId: string;
  actorId: string;
  actorKind: string;
  payload: unknown;
}

class FakeEventBus {
  readonly emitted: EmittedEvent[] = [];
  private eventCounter = 0;

  emit<T>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
  }): {
    id: string;
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
    createdAt: number;
  } {
    this.emitted.push({
      type: input.type,
      companyId: input.companyId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      payload: input.payload,
    });
    this.eventCounter += 1;
    return {
      id: `evt-${this.eventCounter}`,
      type: input.type,
      companyId: input.companyId,
      actorId: input.actorId,
      actorKind: input.actorKind as never,
      payload: input.payload,
      createdAt: Date.now(),
    };
  }
}

class FakeSettingsRepo {
  proactiveEnabled = true;
  autonomyMode: ExtensionsAutonomyMode = 'balanced';

  getProactive(): { enabled: boolean; autonomyMode: ExtensionsAutonomyMode } {
    return {
      enabled: this.proactiveEnabled,
      autonomyMode: this.autonomyMode,
    };
  }

  setProactive(enabled: boolean, autonomyMode?: ExtensionsAutonomyMode): void {
    this.proactiveEnabled = enabled;
    if (autonomyMode !== undefined) {
      this.autonomyMode = autonomyMode;
    }
  }
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

/**
 * Thread / message / budget fakes back the real `createProactiveDispatcher`,
 * so `scanForWork` is exercised through the same governed path production
 * uses rather than against a hand-stubbed dispatcher.
 */
class FakeThreadsRepo {
  readonly created: Array<{ id: string; companyId: string; kind: string; createdBy: string }> = [];
  private next = 1;

  create(input: { companyId: string; kind: string; createdBy: string }): string {
    const id = `thr-real-${this.next++}`;
    this.created.push({ id, ...input });
    return id;
  }

  getById(id: string): { companyId: string; kind: string } | null {
    const row = this.created.find((t) => t.id === id);
    return row ? { companyId: row.companyId, kind: row.kind } : null;
  }
}

class FakeMessagesRepo {
  readonly appended: Array<{
    id: string;
    threadId: string;
    authorId: string;
    authorKind: string;
    content: string;
  }> = [];
  private next = 1;

  append(input: {
    threadId: string;
    authorId: string;
    authorKind: string;
    content: string;
  }): string {
    const id = `msg-real-${this.next++}`;
    this.appended.push({ id, ...input });
    return id;
  }
}

class FakeBudgetGovernance {
  private denial: string | null = null;

  deny(reason: string): void {
    this.denial = reason;
  }

  async assertExecutionAllowed(): Promise<{
    allowed: boolean;
    policy: { id: string } | null;
    reason: string | null;
  }> {
    if (this.denial !== null) {
      return { allowed: false, policy: { id: 'policy-1' }, reason: this.denial };
    }
    return { allowed: true, policy: null, reason: null };
  }
}

class FakeClock {
  private value = 1_600_000_000_000;

  set(next: number): void {
    this.value = next;
  }

  now = (): number => this.value;
}

interface Fixture {
  orchestrator: FakeOrchestrator;
  agenticLoopService: FakeAgenticLoopService;
  authorityResolver: FakeAuthorityResolver;
  goalsRepo: FakeGoalsRepo;
  ticketsRepo: FakeTicketsRepo;
  employeesRepo: FakeEmployeesRepo;
  threadsRepo: FakeThreadsRepo;
  messagesRepo: FakeMessagesRepo;
  budgetGovernance: FakeBudgetGovernance;
  clock: FakeClock;
  bus: FakeEventBus;
  settingsRepo: FakeSettingsRepo;
  deps: ProactiveTriggerServiceDeps;
  service: ProactiveTriggerService;
  companyId: string;
  systemAgentId: string;
}

function buildFixture(): Fixture {
  const orchestrator = new FakeOrchestrator();
  const agenticLoopService = new FakeAgenticLoopService();
  const authorityResolver = new FakeAuthorityResolver();
  const goalsRepo = new FakeGoalsRepo();
  const ticketsRepo = new FakeTicketsRepo();
  const employeesRepo = new FakeEmployeesRepo();
  const bus = new FakeEventBus();
  const settingsRepo = new FakeSettingsRepo();
  const threadsRepo = new FakeThreadsRepo();
  const messagesRepo = new FakeMessagesRepo();
  const budgetGovernance = new FakeBudgetGovernance();
  const clock = new FakeClock();

  const companyId = 'co-test';
  const systemAgentId = 'emp-system';

  // Set up system agent employee
  employeesRepo.setEmployee({
    id: systemAgentId,
    companyId,
    name: 'System Agent',
    level: 'system',
    isSystem: true,
    status: 'active',
  });

  const deps: ProactiveTriggerServiceDeps = {
    orchestrator: {
      enqueueChat: (args) => orchestrator.enqueueChat(args),
      isCompanyPaused: (id) => orchestrator.isCompanyPaused(id),
    },
    agenticLoopService: {
      start: (args) => agenticLoopService.start(args),
    },
    authorityResolver: {
      resolveEmployee: (cid, eid) => authorityResolver.resolveEmployee(cid, eid),
    },
    employeesRepo: {
      getById: (id) => employeesRepo.getById(id),
      listByCompany: (cid) => employeesRepo.listByCompany(cid),
    },
    goalsRepo: {
      listByCompany: (cid) => goalsRepo.listByCompany(cid),
    },
    ticketsRepo: {
      listByCompany: (cid) => ticketsRepo.listByCompany(cid),
    },
    projectsRepo: {
      listByCompany: () => [],
    },
    bus: {
      emit: (input) => bus.emit(input),
    },
    settingsRepo: {
      getProactive: () => settingsRepo.getProactive(),
    },
    // The REAL dispatcher, backed by fake repos — `scanForWork` must run
    // through the same governed path production uses (thread + message
    // creation, budget admission, pause checks, lifecycle events).
    dispatcher: createProactiveDispatcher({
      orchestrator: {
        enqueueChat: (args) => orchestrator.enqueueChat(args),
        isCompanyPaused: (id) => orchestrator.isCompanyPaused(id),
      },
      threadsRepo: {
        create: (input) => threadsRepo.create(input),
        getById: (id) => threadsRepo.getById(id),
      },
      messagesRepo: {
        append: (input) => messagesRepo.append(input),
      },
      employeesRepo: {
        getById: (id) => employeesRepo.getById(id),
      },
      companiesRepo: {
        getById: (id) => (id === companyId ? { id } : null),
      },
      bus: {
        emit: (input) => bus.emit(input),
      },
      budgetGovernance: {
        assertExecutionAllowed: () => budgetGovernance.assertExecutionAllowed(),
      },
      now: clock.now,
    }),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    now: clock.now,
  };

  const service = createProactiveTriggerService(deps);

  return {
    orchestrator,
    agenticLoopService,
    authorityResolver,
    goalsRepo,
    ticketsRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    budgetGovernance,
    clock,
    bus,
    settingsRepo,
    deps,
    service,
    companyId,
    systemAgentId,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('proactive-trigger-service', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = buildFixture();
  });

  describe('decomposeGoal', () => {
    it('decomposes a goal into tickets using agentic loop', async () => {
      // Arrange: create a goal, enable proactive
      const goalId = 'goal-1';
      fixture.goalsRepo.setGoal({
        id: goalId,
        companyId: fixture.companyId,
        title: 'Launch Q2 Marketing Campaign',
        description: 'Execute marketing plan for Q2',
        status: 'active',
      });

      // Act: call decomposeGoal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId,
      });

      // Assert: agenticLoopService.start called with system-agent
      expect(fixture.agenticLoopService.starts).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: prior toHaveLength(1) would have failed the test if index 0 were undefined
      const startCall = fixture.agenticLoopService.starts[0]!;
      expect(startCall.companyId).toBe(fixture.companyId);
      expect(startCall.employeeId).toBe(fixture.systemAgentId);
      expect(startCall.userText).toContain('decompose');
      expect(startCall.userText).toContain(goalId);

      // Assert: bus emitted proactive.goal_decomposed
      const decomposedEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.goal_decomposed',
      );
      expect(decomposedEvents).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: prior toHaveLength(1) would have failed the test if index 0 were undefined
      const decomposedEvent = decomposedEvents[0]!;
      expect(decomposedEvent.companyId).toBe(fixture.companyId);
      expect((decomposedEvent.payload as { goalId: string }).goalId).toBe(goalId);
    });

    it('respects autonomy mode: conservative blocks goal decomposition', async () => {
      // Arrange: autonomyMode = 'conservative', goal exists
      fixture.settingsRepo.setProactive(true, 'conservative');

      const goalId = 'goal-1';
      fixture.goalsRepo.setGoal({
        id: goalId,
        companyId: fixture.companyId,
        title: 'Launch Q2 Marketing Campaign',
        description: 'Execute marketing plan for Q2',
        status: 'active',
      });

      // Act: call decomposeGoal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId,
      });

      // Assert: no agentic loop call, authority request created
      expect(fixture.agenticLoopService.starts).toHaveLength(0);

      const blockedEvents = fixture.bus.emitted.filter((e) => e.type === 'proactive.blocked');
      expect(blockedEvents).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: prior toHaveLength(1) would have failed the test if index 0 were undefined
      const blockedEvent = blockedEvents[0]!;
      expect((blockedEvent.payload as { reason: string }).reason).toContain('autonomy');
    });

    it('respects autonomy mode: balanced allows goal decomposition', async () => {
      // Arrange: autonomyMode = 'balanced'
      fixture.settingsRepo.setProactive(true, 'balanced');

      const goalId = 'goal-1';
      fixture.goalsRepo.setGoal({
        id: goalId,
        companyId: fixture.companyId,
        title: 'Launch Q2 Marketing Campaign',
        description: 'Execute marketing plan for Q2',
        status: 'active',
      });

      // Act: call decomposeGoal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId,
      });

      // Assert: agentic loop called
      expect(fixture.agenticLoopService.starts).toHaveLength(1);
    });

    it('returns early when proactive is disabled', async () => {
      // Arrange: proactive disabled
      fixture.settingsRepo.setProactive(false);

      const goalId = 'goal-1';
      fixture.goalsRepo.setGoal({
        id: goalId,
        companyId: fixture.companyId,
        title: 'Launch Q2 Marketing Campaign',
        description: 'Execute marketing plan for Q2',
        status: 'active',
      });

      // Act: call decomposeGoal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId,
      });

      // Assert: no agentic loop call
      expect(fixture.agenticLoopService.starts).toHaveLength(0);
    });

    it('emits error when goal not found', async () => {
      // Act: call with non-existent goal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId: 'non-existent',
      });

      // Assert: error event emitted
      const errorEvents = fixture.bus.emitted.filter((e) => e.type === 'proactive.error');
      expect(errorEvents).toHaveLength(1);
    });
  });

  describe('scanForWork', () => {
    it('scans for work and queues agent replies on unassigned tickets', async () => {
      // Arrange: unassigned tickets exist, proactive enabled
      // Add a regular employee for assignment
      const developerId = 'emp-dev-1';
      fixture.employeesRepo.setEmployee({
        id: developerId,
        companyId: fixture.companyId,
        name: 'Developer',
        level: 'ic',
        isSystem: false,
        status: 'active',
      });

      const ticket1Id = 'ticket-1';
      const ticket2Id = 'ticket-2';

      fixture.ticketsRepo.setTicket({
        id: ticket1Id,
        companyId: fixture.companyId,
        title: 'Design landing page',
        description: 'Create mockup for homepage',
        status: 'open',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });

      fixture.ticketsRepo.setTicket({
        id: ticket2Id,
        companyId: fixture.companyId,
        title: 'Write API documentation',
        description: 'Document REST endpoints',
        status: 'open',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'medium',
      });

      // Act: call scanForWork
      const result = await fixture.service.scanForWork({
        companyId: fixture.companyId,
      });

      // Assert: orchestrator.enqueueChat called for each ticket
      expect(fixture.orchestrator.enqueuedChats).toHaveLength(2);

      // Assert: result returns queued count
      expect(result.queuedCount).toBe(2);

      // Assert: proactive.work_queued events emitted
      const queuedEvents = fixture.bus.emitted.filter((e) => e.type === 'proactive.work_queued');
      expect(queuedEvents).toHaveLength(2);
    });

    it('does not queue work when company is paused (meeting)', async () => {
      // Arrange: tickets exist, company paused
      fixture.orchestrator.pauseCompany(fixture.companyId);

      fixture.ticketsRepo.setTicket({
        id: 'ticket-1',
        companyId: fixture.companyId,
        title: 'Design landing page',
        description: 'Create mockup for homepage',
        status: 'open',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });

      // Act: call scanForWork
      const result = await fixture.service.scanForWork({
        companyId: fixture.companyId,
      });

      // Assert: no enqueueChat calls
      expect(fixture.orchestrator.enqueuedChats).toHaveLength(0);
      expect(result.queuedCount).toBe(0);
    });

    it('checks authority before queuing proactive work', async () => {
      // Arrange: ticket exists, employee lacks capability authority
      const employeeId = 'emp-1';
      fixture.employeesRepo.setEmployee({
        id: employeeId,
        companyId: fixture.companyId,
        name: 'Developer',
        level: 'ic',
        isSystem: false,
        status: 'active',
      });

      // Deny capability for proactive work
      fixture.authorityResolver.setEmployeeAuthority(employeeId, [
        {
          resourceKind: 'capability',
          resourceId: 'proactive_work',
          permission: 'deny',
        },
      ]);

      fixture.ticketsRepo.setTicket({
        id: 'ticket-1',
        companyId: fixture.companyId,
        title: 'Design landing page',
        description: 'Create mockup for homepage',
        status: 'open',
        assigneeId: null,
        reporterId: employeeId,
        reporterKind: 'employee',
        priority: 'high',
      });

      // Act: call scanForWork
      await fixture.service.scanForWork({
        companyId: fixture.companyId,
      });

      // Assert: proactive.blocked emitted, no enqueue
      const blockedEvents = fixture.bus.emitted.filter((e) => e.type === 'proactive.blocked');
      expect(blockedEvents.length).toBeGreaterThan(0);
      expect(fixture.orchestrator.enqueuedChats).toHaveLength(0);
    });

    it('skips already assigned tickets', async () => {
      // Arrange: mix of assigned and unassigned tickets
      const assignedEmployeeId = 'emp-1';
      fixture.employeesRepo.setEmployee({
        id: assignedEmployeeId,
        companyId: fixture.companyId,
        name: 'Developer',
        level: 'ic',
        isSystem: false,
        status: 'active',
      });

      fixture.ticketsRepo.setTicket({
        id: 'ticket-assigned',
        companyId: fixture.companyId,
        title: 'Assigned task',
        description: 'Already has owner',
        status: 'open',
        assigneeId: assignedEmployeeId,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });

      fixture.ticketsRepo.setTicket({
        id: 'ticket-unassigned',
        companyId: fixture.companyId,
        title: 'Unassigned task',
        description: 'Needs owner',
        status: 'open',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });

      // Act: call scanForWork
      const result = await fixture.service.scanForWork({
        companyId: fixture.companyId,
      });

      // Assert: only unassigned ticket queued
      expect(fixture.orchestrator.enqueuedChats).toHaveLength(1);
      expect(result.queuedCount).toBe(1);
    });

    it('skips closed/completed tickets', async () => {
      // Arrange: closed ticket exists
      fixture.ticketsRepo.setTicket({
        id: 'ticket-closed',
        companyId: fixture.companyId,
        title: 'Completed task',
        description: 'Already done',
        status: 'done',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });

      // Act: call scanForWork
      const result = await fixture.service.scanForWork({
        companyId: fixture.companyId,
      });

      // Assert: no work queued
      expect(fixture.orchestrator.enqueuedChats).toHaveLength(0);
      expect(result.queuedCount).toBe(0);
    });
  });

  describe('setEnabled and isEnabled', () => {
    it('toggles proactive mode', () => {
      // Act: disable proactive
      fixture.service.setEnabled({
        companyId: fixture.companyId,
        enabled: false,
      });

      // Assert: isEnabled returns false
      expect(fixture.service.isEnabled(fixture.companyId)).toBe(false);

      // Act: re-enable
      fixture.service.setEnabled({
        companyId: fixture.companyId,
        enabled: true,
      });

      // Assert: isEnabled returns true
      expect(fixture.service.isEnabled(fixture.companyId)).toBe(true);
    });

    it('emits proactive.enabled_changed event when toggled', () => {
      // Act: toggle proactive
      fixture.service.setEnabled({
        companyId: fixture.companyId,
        enabled: false,
      });

      // Assert: event emitted
      const events = fixture.bus.emitted.filter((e) => e.type === 'proactive.enabled_changed');
      expect(events).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: prior toHaveLength(1) would have failed the test if index 0 were undefined
      const event = events[0]!;
      expect((event.payload as { enabled: boolean }).enabled).toBe(false);
    });
  });

  describe('autonomy mode checks', () => {
    it('autonomous mode allows all proactive actions', async () => {
      // Arrange: autonomous mode
      fixture.settingsRepo.setProactive(true, 'autonomous');

      const goalId = 'goal-1';
      fixture.goalsRepo.setGoal({
        id: goalId,
        companyId: fixture.companyId,
        title: 'Launch Q2 Marketing Campaign',
        description: 'Execute marketing plan for Q2',
        status: 'active',
      });

      // Act: call decomposeGoal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId,
      });

      // Assert: agentic loop called
      expect(fixture.agenticLoopService.starts).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('logs warnings when goal lookup fails', async () => {
      // Act: call with invalid goal
      await fixture.service.decomposeGoal({
        companyId: fixture.companyId,
        goalId: 'invalid-goal',
      });

      // Assert: logger.warn called
      expect(fixture.deps.logger?.warn).toHaveBeenCalled();
    });

    it('emits proactive.error on scan failure', async () => {
      // Arrange: cause a scan failure by passing invalid company
      const result = await fixture.service.scanForWork({
        companyId: 'non-existent-company',
      });

      // Assert: error emitted or handled gracefully
      const errorEvents = fixture.bus.emitted.filter((e) => e.type === 'proactive.error');
      // Should handle gracefully, not throw
      expect(result).toBeDefined();
      // TODO: Add expectation for error events when error handling is implemented
      void errorEvents; // Explicitly mark as intentionally unused for now
    });
  });
});

// ---------------------------------------------------------------------------
// Audit F2 + F3 — governed dispatch and real runtime counters
//
// F3: `scanForWork` used to synthesize `proactive-thread-${ticket.id}` /
//     `proactive-msg-${ticket.id}` ids for rows that were never created, and
//     called `orchestrator.enqueueChat` directly — bypassing the budget
//     governance, thread creation and message creation that
//     `createProactiveDispatcher` already implements and tests.
//
// F2: `proactive.getState` returned hardcoded `0 / 0 / null`, which two
//     shipped surfaces (ProactiveControls and Settings → Extensions) render
//     as "Active Work", "Queued Work" and "Last Scan" metric tiles.
// ---------------------------------------------------------------------------

describe('proactive-trigger-service — governed dispatch (F3)', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = buildFixture();
  });

  function seedOpenTicket(id: string): void {
    fixture.ticketsRepo.setTicket({
      id,
      companyId: fixture.companyId,
      title: `Ticket ${id}`,
      description: 'needs an owner',
      status: 'open',
      assigneeId: null,
      reporterId: 'user-1',
      reporterKind: 'user',
      priority: 'high',
    });
  }

  function seedWorker(id: string): void {
    fixture.employeesRepo.setEmployee({
      id,
      companyId: fixture.companyId,
      name: 'Developer',
      level: 'ic',
      isSystem: false,
      status: 'active',
    });
  }

  it('creates a real thread for each dispatch instead of synthesizing an id', async () => {
    seedWorker('emp-dev-1');
    seedOpenTicket('ticket-1');

    await fixture.service.scanForWork({ companyId: fixture.companyId });

    expect(fixture.threadsRepo.created).toHaveLength(1);
    const enqueued = fixture.orchestrator.enqueuedChats;
    expect(enqueued).toHaveLength(1);
    // The thread handed to the orchestrator must be one the repo actually
    // created — never a fabricated `proactive-thread-*` string.
    expect(fixture.threadsRepo.created.map((t) => t.id)).toContain(enqueued[0]?.threadId);
    expect(enqueued[0]?.threadId).not.toMatch(/^proactive-thread-/);
  });

  it('appends a real trigger message instead of synthesizing a message id', async () => {
    seedWorker('emp-dev-1');
    seedOpenTicket('ticket-1');

    await fixture.service.scanForWork({ companyId: fixture.companyId });

    expect(fixture.messagesRepo.appended).toHaveLength(1);
    const enqueued = fixture.orchestrator.enqueuedChats[0];
    expect(fixture.messagesRepo.appended.map((m) => m.id)).toContain(enqueued?.userMessageId);
    expect(enqueued?.userMessageId).not.toMatch(/^proactive-msg-/);
  });

  it('does not dispatch when budget governance denies execution', async () => {
    seedWorker('emp-dev-1');
    seedOpenTicket('ticket-1');
    fixture.budgetGovernance.deny('Monthly spend cap reached.');

    const result = await fixture.service.scanForWork({ companyId: fixture.companyId });

    expect(result.queuedCount).toBe(0);
    expect(fixture.orchestrator.enqueuedChats).toHaveLength(0);
    expect(fixture.threadsRepo.created).toHaveLength(0);
    const blocked = fixture.bus.emitted.filter((e) => e.type === 'proactive.budget_blocked');
    expect(blocked).toHaveLength(1);
  });
});

describe('proactive-trigger-service — runtime state (F2)', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = buildFixture();
  });

  it('reports a null lastScanAt before any scan has run', () => {
    const state = fixture.service.getState(fixture.companyId);
    expect(state.lastScanAt).toBeNull();
    expect(state.activeWork).toBe(0);
    expect(state.queuedWork).toBe(0);
  });

  it('records lastScanAt when a scan completes', async () => {
    fixture.clock.set(1_700_000_000_000);

    await fixture.service.scanForWork({ companyId: fixture.companyId });

    expect(fixture.service.getState(fixture.companyId).lastScanAt).toBe(1_700_000_000_000);
  });

  it('counts in-flight and backlogged proactive work while a scan runs', async () => {
    fixture.employeesRepo.setEmployee({
      id: 'emp-dev-1',
      companyId: fixture.companyId,
      name: 'Developer',
      level: 'ic',
      isSystem: false,
      status: 'active',
    });
    for (const id of ['ticket-1', 'ticket-2', 'ticket-3']) {
      fixture.ticketsRepo.setTicket({
        id,
        companyId: fixture.companyId,
        title: `Ticket ${id}`,
        description: 'needs an owner',
        status: 'open',
        assigneeId: null,
        reporterId: 'user-1',
        reporterKind: 'user',
        priority: 'high',
      });
    }

    // `enqueueChat` resolves on turn COMPLETION, so holding the first turn
    // open lets us observe the counters mid-scan.
    fixture.orchestrator.holdNextTurn();
    const scan = fixture.service.scanForWork({ companyId: fixture.companyId });
    await fixture.orchestrator.turnStarted();

    const midScan = fixture.service.getState(fixture.companyId);
    expect(midScan.activeWork).toBe(1);
    expect(midScan.queuedWork).toBe(2);

    fixture.orchestrator.releaseHeldTurns();
    await scan;

    const afterScan = fixture.service.getState(fixture.companyId);
    expect(afterScan.activeWork).toBe(0);
    expect(afterScan.queuedWork).toBe(0);
  });

  it('clears in-flight counters when a dispatch throws', async () => {
    fixture.employeesRepo.setEmployee({
      id: 'emp-dev-1',
      companyId: fixture.companyId,
      name: 'Developer',
      level: 'ic',
      isSystem: false,
      status: 'active',
    });
    fixture.ticketsRepo.setTicket({
      id: 'ticket-1',
      companyId: fixture.companyId,
      title: 'Ticket 1',
      description: 'needs an owner',
      status: 'open',
      assigneeId: null,
      reporterId: 'user-1',
      reporterKind: 'user',
      priority: 'high',
    });
    fixture.orchestrator.failNextTurn('provider exploded');

    await fixture.service.scanForWork({ companyId: fixture.companyId });

    const state = fixture.service.getState(fixture.companyId);
    expect(state.activeWork).toBe(0);
    expect(state.queuedWork).toBe(0);
  });

  it('tracks state per company', async () => {
    fixture.clock.set(1_700_000_000_000);
    await fixture.service.scanForWork({ companyId: fixture.companyId });

    expect(fixture.service.getState('co-other').lastScanAt).toBeNull();
    expect(fixture.service.getState(fixture.companyId).lastScanAt).toBe(1_700_000_000_000);
  });
});
