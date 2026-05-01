/**
 * Proactive dispatcher integration tests.
 *
 * Tests the createProactiveDispatcher helper that:
 * - Creates threads and trigger messages for proactive work
 * - Validates budget governance before dispatch
 * - Honors company pause state
 * - Emits proactive.* events
 * - Uses existing orchestrator.enqueueChat for actual dispatch
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import type { TestDbHandle } from '../db/test-helpers.js';
import { makeTestDb } from '../db/test-helpers.js';

import { createEventBus } from './event-bus.js';
import { createProactiveDispatcher } from './proactive-dispatch.js';

interface Fixture {
  ctx: TestDbHandle;
  bus: ReturnType<typeof createEventBus>;
  messagesRepo: ReturnType<typeof createMessagesRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  threadsRepo: ReturnType<typeof createThreadsRepo>;
  companyId: string;
  employeeId: string;
  systemAgentId: string;
  orchestratorMock: {
    enqueueChat(args: {
      threadId: string;
      employeeId: string;
      userMessageId: string;
    }): Promise<void>;
    isCompanyPaused(companyId: string): boolean;
  };
  budgetGovernanceMock: {
    assertExecutionAllowed(args: {
      companyId: string;
      employeeId?: string | null;
      executionKind: 'agentic' | 'routine' | 'copilot';
    }): Promise<{
      allowed: boolean;
      policy: { id: string } | null;
      reason: string | null;
    }>;
  };
}

async function buildFixture(): Promise<Fixture> {
  const ctx = await makeTestDb();
  const companiesRepo = createCompaniesRepo(ctx.db);
  const employeesRepo = createEmployeesRepo(ctx.db);
  const threadsRepo = createThreadsRepo(ctx.db);
  const messagesRepo = createMessagesRepo(ctx.db);
  const eventsRepo = createEventsRepo(ctx.db);
  const bus = createEventBus({ repo: eventsRepo });

  const companyId = companiesRepo.create({
    name: 'Strategia-X',
    slug: 'strategia-x',
    settings: { mission: 'run itself', values: ['q', 's'] },
  });

  const employeeId = employeesRepo.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha-test',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
  });

  const systemAgentId = employeesRepo.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'system',
    roleMdSha: 'sha-system',
    level: 'officer',
    name: 'System',
    title: 'System Agent',
    isSystem: true,
  });

  const enqueueChatSpy = vi.fn().mockResolvedValue(undefined);
  const isCompanyPausedSpy = vi.fn().mockReturnValue(false);

  const budgetGovernanceMock = {
    assertExecutionAllowed: vi.fn().mockResolvedValue({
      allowed: true,
      policy: null,
      reason: null,
    }),
  };

  return {
    ctx,
    bus,
    messagesRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    companyId,
    employeeId,
    systemAgentId,
    orchestratorMock: {
      enqueueChat: enqueueChatSpy,
      isCompanyPaused: isCompanyPausedSpy,
    },
    budgetGovernanceMock,
  };
}

describe('createProactiveDispatcher', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await buildFixture();
  });

  afterEach(() => {
    f.ctx.close();
  });

  describe('enqueueProactive happy path', () => {
    it('creates a thread, trigger message, and enqueues chat', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
        sourceGoalId: 'goal-123',
      });

      expect(result).toEqual({
        success: true,
        threadId: expect.any(String),
        userMessageId: expect.any(String),
      });

      // Verify thread was created
      const thread = f.threadsRepo.getById(result.threadId);
      expect(thread).toEqual(
        expect.objectContaining({
          companyId: f.companyId,
          kind: 'proactive',
          createdBy: f.systemAgentId,
        }),
      );

      // Verify trigger message was created
      const messages = f.messagesRepo.listByThread(result.threadId);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.authorId).toBe('system');
      expect(messages[0]?.authorKind).toBe('system');
      expect(messages[0]?.content).toContain('Decompose goal');
      expect(messages[0]?.content).toContain('goal-123');

      // Verify orchestrator.enqueueChat was called
      expect(f.orchestratorMock.enqueueChat).toHaveBeenCalledWith({
        threadId: result.threadId,
        employeeId: f.systemAgentId,
        userMessageId: result.userMessageId,
      });

      // Verify proactive.work_started event was emitted
      const events = f.bus.replaySince(0);
      const workStartedEvents = events.filter((e) => e.type === 'proactive.work_started');
      expect(workStartedEvents).toHaveLength(1);
      expect(workStartedEvents[0]).toEqual(
        expect.objectContaining({
          type: 'proactive.work_started',
          companyId: f.companyId,
          actorId: f.systemAgentId,
          actorKind: 'employee',
          payload: expect.objectContaining({
            triggerId: 'goal-123',
            triggerKind: 'goal_decompose',
            goalId: 'goal-123',
          }),
        }),
      );
    });

    it('includes ticketId in payload when sourceTicketId is provided', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'work_scan',
        triggerId: 'ticket-456',
        sourceTicketId: 'ticket-456',
      });

      expect(result.success).toBe(true);

      const events = f.bus.replaySince(0);
      const workStartedEvents = events.filter((e) => e.type === 'proactive.work_started');
      expect(workStartedEvents[0]).toEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            triggerId: 'ticket-456',
            triggerKind: 'work_scan',
            ticketId: 'ticket-456',
          }),
        }),
      );
    });

    it('generates appropriate trigger message content for each trigger type', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      // Test goal_decompose trigger
      const goalResult = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
        sourceGoalId: 'goal-123',
      });

      const goalMessages = f.messagesRepo.listByThread(goalResult.threadId);
      expect(goalMessages[0]?.content).toContain('Decompose goal');
      expect(goalMessages[0]?.content).toContain('goal-123');

      // Test work_scan trigger
      const ticketResult = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'work_scan',
        triggerId: 'ticket-456',
        sourceTicketId: 'ticket-456',
      });

      const ticketMessages = f.messagesRepo.listByThread(ticketResult.threadId);
      expect(ticketMessages[0]?.content).toContain('Work on ticket');
      expect(ticketMessages[0]?.content).toContain('ticket-456');
    });
  });

  describe('validation failures', () => {
    it('returns error when employee does not exist', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: 'non-existent-employee',
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result).toEqual({
        success: false,
        error: 'employee_not_found',
      });

      // No thread or message should be created
      const allThreads = f.threadsRepo.listByCompany(f.companyId);
      expect(allThreads).toHaveLength(0);

      // orchestrator.enqueueChat should not be called
      expect(f.orchestratorMock.enqueueChat).not.toHaveBeenCalled();
    });

    it('returns error when employee belongs to different company', async () => {
      const otherCompanyId = f.companiesRepo.create({
        name: 'Other Company',
        slug: 'other-co',
      });

      const otherEmployeeId = f.employeesRepo.create({
        companyId: otherCompanyId,
        rolePackId: 'strategia-official',
        roleId: 'ceo',
        roleMdSha: 'sha-other',
        level: 'officer',
        name: 'Other CEO',
        title: 'CEO',
      });

      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: otherEmployeeId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result).toEqual({
        success: false,
        error: 'employee_company_mismatch',
      });

      expect(f.orchestratorMock.enqueueChat).not.toHaveBeenCalled();
    });

    it('returns error when company does not exist', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: 'non-existent-company',
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      // Employee belongs to f.companyId, not 'non-existent-company'
      expect(result).toEqual({
        success: false,
        error: 'employee_company_mismatch',
      });

      expect(f.orchestratorMock.enqueueChat).not.toHaveBeenCalled();
    });
  });

  describe('budget governance', () => {
    it('returns budget_blocked when budget check fails', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: {
          assertExecutionAllowed: vi.fn().mockResolvedValue({
            allowed: false,
            policy: { id: 'budget-policy-1' },
            reason: 'Budget cap reached for company scope.',
          }),
        },
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result).toEqual({
        success: false,
        error: 'budget_blocked',
        reason: 'Budget cap reached for company scope.',
      });

      // Emit proactive.budget_blocked event
      const events = f.bus.replaySince(0);
      const budgetBlockedEvents = events.filter((e) => e.type === 'proactive.budget_blocked');
      expect(budgetBlockedEvents).toHaveLength(1);
      expect(budgetBlockedEvents[0]).toEqual(
        expect.objectContaining({
          type: 'proactive.budget_blocked',
          companyId: f.companyId,
          actorId: f.systemAgentId,
          actorKind: 'employee',
          payload: expect.objectContaining({
            triggerId: 'goal-123',
            reason: 'Budget cap reached for company scope.',
          }),
        }),
      );

      // orchestrator.enqueueChat should not be called
      expect(f.orchestratorMock.enqueueChat).not.toHaveBeenCalled();
    });
  });

  describe('company pause semantics', () => {
    it('returns paused when company is paused', async () => {
      f.orchestratorMock.isCompanyPaused.mockReturnValue(true);

      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result).toEqual({
        success: false,
        error: 'company_paused',
      });

      // Emit proactive.blocked event with pause reason
      const events = f.bus.replaySince(0);
      const blockedEvents = events.filter((e) => e.type === 'proactive.blocked');
      expect(blockedEvents).toHaveLength(1);
      expect(blockedEvents[0]).toEqual(
        expect.objectContaining({
          type: 'proactive.blocked',
          companyId: f.companyId,
          payload: expect.objectContaining({
            triggerId: 'goal-123',
            reason: 'pause',
          }),
        }),
      );

      expect(f.orchestratorMock.enqueueChat).not.toHaveBeenCalled();
    });
  });

  describe('orchestrator integration', () => {
    it('propagates orchestrator enqueueChat rejection', async () => {
      const enqueueError = new Error('Orchestrator is shutting down');
      f.orchestratorMock.enqueueChat.mockRejectedValueOnce(enqueueError);

      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result).toEqual({
        success: false,
        error: 'enqueue_failed',
        reason: enqueueError.message,
      });

      // Emit proactive.error event
      const events = f.bus.replaySince(0);
      const errorEvents = events.filter((e) => e.type === 'proactive.error');
      expect(errorEvents).toHaveLength(1);
    });

    it('resolves when orchestrator enqueueChat succeeds', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'goal_decompose',
        triggerId: 'goal-123',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('background_monitor trigger type', () => {
    it('handles background_monitor trigger without source IDs', async () => {
      const dispatcher = createProactiveDispatcher({
        orchestrator: f.orchestratorMock,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        bus: f.bus,
        budgetGovernance: f.budgetGovernanceMock,
      });

      const result = await dispatcher.enqueueProactive({
        companyId: f.companyId,
        employeeId: f.systemAgentId,
        trigger: 'background_monitor',
        triggerId: 'monitor-123',
      });

      expect(result.success).toBe(true);

      const messages = f.messagesRepo.listByThread(result.threadId);
      expect(messages[0]?.content).toContain('Background monitoring');

      const events = f.bus.replaySince(0);
      const workStartedEvents = events.filter((e) => e.type === 'proactive.work_started');
      expect(workStartedEvents[0]).toEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            triggerKind: 'background_monitor',
            triggerId: 'monitor-123',
          }),
        }),
      );
    });
  });
});
