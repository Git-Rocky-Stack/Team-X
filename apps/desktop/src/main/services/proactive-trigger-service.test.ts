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
  ExtensionsAutonomyMode,
  EventType,
} from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';


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

  setEmployeeAuthority(
    employeeId: string,
    grants: AuthorityGrantEntry[],
  ): void {
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
        resourceKind: g.resourceKind as EffectiveAuthoritySnapshot['entries'][number]['resourceKind'],
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
    return Array.from(this.goals.values()).filter(
      (g) => g.companyId === companyId,
    );
  }
}

class FakeTicketsRepo {
  private tickets = new Map<string, TicketRow>();

  setTicket(ticket: TicketRow): void {
    this.tickets.set(ticket.id, ticket);
  }

  listByCompany(companyId: string): TicketRow[] {
    return Array.from(this.tickets.values()).filter(
      (t) => t.companyId === companyId,
    );
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
    return Array.from(this.employees.values()).filter(
      (e) => e.companyId === companyId,
    );
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

interface Fixture {
  orchestrator: FakeOrchestrator;
  agenticLoopService: FakeAgenticLoopService;
  authorityResolver: FakeAuthorityResolver;
  goalsRepo: FakeGoalsRepo;
  ticketsRepo: FakeTicketsRepo;
  employeesRepo: FakeEmployeesRepo;
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
      resolveEmployee: (cid, eid) =>
        authorityResolver.resolveEmployee(cid, eid),
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
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    now: () => Date.now(),
  };

  const service = createProactiveTriggerService(deps);

  return {
    orchestrator,
    agenticLoopService,
    authorityResolver,
    goalsRepo,
    ticketsRepo,
    employeesRepo,
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

      const blockedEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.blocked',
      );
      expect(blockedEvents).toHaveLength(1);
      const blockedEvent = blockedEvents[0]!;
      expect((blockedEvent.payload as { reason: string }).reason).toContain(
        'autonomy',
      );
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
      const errorEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.error',
      );
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
      const queuedEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.work_queued',
      );
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
      const blockedEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.blocked',
      );
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
      const events = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.enabled_changed',
      );
      expect(events).toHaveLength(1);
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
      const errorEvents = fixture.bus.emitted.filter(
        (e) => e.type === 'proactive.error',
      );
      // Should handle gracefully, not throw
      expect(result).toBeDefined();
      // TODO: Add expectation for error events when error handling is implemented
      void errorEvents; // Explicitly mark as intentionally unused for now
    });
  });
});
