/**
 * Proactive dispatcher — integration layer for proactive work execution.
 *
 * This module provides createProactiveDispatcher, a helper that prepares
 * proactive work for the orchestrator. It creates threads and trigger
 * messages, validates budget governance and pause state, emits proactive.*
 * events, and then uses the existing orchestrator.enqueueChat path for
 * actual dispatch.
 *
 * Design rationale:
 * - Reuses existing orchestrator concurrency model and work queue
 * - Proactive work shares slots with chat — no separate concurrency limit
 * - All proactive-specific logic lives here — orchestrator remains unchanged
 * - Event emission provides renderer visibility into proactive state
 *
 * Phase 6 — Proactive Execution System — Slice 2
 */

import type {
  EventType,
  ProactiveBudgetBlockedPayload,
  ProactiveBlockedPayload,
  ProactiveErrorPayload,
  ProactiveWorkStartedPayload,
} from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ProactiveDispatcherDeps {
  orchestrator: {
    enqueueChat(args: {
      threadId: string;
      employeeId: string;
      userMessageId: string;
    }): Promise<void>;
    isCompanyPaused(companyId: string): boolean;
  };
  threadsRepo: {
    create(input: {
      companyId: string;
      kind: string;
      createdBy: string;
    }): string;
    getById(id: string): { companyId: string; kind: string } | null;
  };
  messagesRepo: {
    append(input: {
      threadId: string;
      authorId: string;
      authorKind: string;
      content: string;
    }): string;
  };
  employeesRepo: {
    getById(id: string): { id: string; companyId: string; isSystem?: boolean } | null;
  };
  companiesRepo: {
    getById(id: string): { id: string } | null;
  };
  bus: {
    emit<T>(input: {
      type: EventType;
      companyId: string;
      actorId: string;
      actorKind: string;
      payload: T;
    }): unknown;
  };
  budgetGovernance?: {
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
  now?: () => number;
}

export type ProactiveTrigger = 'goal_decompose' | 'work_scan' | 'background_monitor';

export interface EnqueueProactiveArgs {
  companyId: string;
  employeeId: string;
  trigger: ProactiveTrigger;
  triggerId: string;
  sourceGoalId?: string;
  sourceTicketId?: string;
}

export interface ProactiveEnqueueSuccess {
  success: true;
  threadId: string;
  userMessageId: string;
}

export interface ProactiveEnqueueError {
  success: false;
  error:
    | 'employee_not_found'
    | 'employee_company_mismatch'
    | 'company_not_found'
    | 'company_paused'
    | 'budget_blocked'
    | 'enqueue_failed';
  reason?: string;
}

export type ProactiveEnqueueResult = ProactiveEnqueueSuccess | ProactiveEnqueueError;

export interface ProactiveDispatcher {
  enqueueProactive(args: EnqueueProactiveArgs): Promise<ProactiveEnqueueResult>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createProactiveDispatcher(
  deps: ProactiveDispatcherDeps,
): ProactiveDispatcher {
  const now = deps.now ?? Date.now;

  /**
   * Build trigger message content based on trigger type and context.
   */
  function buildTriggerMessage(args: {
    trigger: ProactiveTrigger;
    triggerId: string;
    sourceGoalId?: string;
    sourceTicketId?: string;
  }): string {
    const { trigger, triggerId, sourceGoalId, sourceTicketId } = args;

    switch (trigger) {
      case 'goal_decompose':
        return `Decompose goal ${sourceGoalId || triggerId} into actionable tickets and projects. Use the decompose_project tool to generate a structured breakdown with milestones, specific tickets, suggested assignees, dependencies, and priority levels.`;

      case 'work_scan':
        return `Work on ticket ${sourceTicketId || triggerId}. Review the ticket requirements and propose an implementation approach. Coordinate with other employees as needed using the send_message_to_colleague tool.`;

      case 'background_monitor':
        return `Background monitoring task ${triggerId}. Scan for unassigned tickets, stalled work, or optimization opportunities. Report findings and take action where authority permits.`;

      default:
        return `Proactive work triggered: ${trigger} (${triggerId}).`;
    }
  }

  /**
   * Emit proactive work started event.
   */
  function emitWorkStarted(args: {
    companyId: string;
    employeeId: string;
    threadId: string;
    trigger: ProactiveTrigger;
    triggerId: string;
    sourceGoalId?: string;
    sourceTicketId?: string;
  }): void {
    const { companyId, employeeId, threadId, trigger, triggerId, sourceGoalId, sourceTicketId } =
      args;

    const payload: ProactiveWorkStartedPayload = {
      triggerId,
      runId: triggerId,
      threadId,
      employeeId,
      startedAt: now(),
    };

    try {
      deps.bus.emit({
        type: 'proactive.work_started',
        companyId,
        actorId: employeeId,
        actorKind: 'employee',
        payload,
      });
    } catch (err) {
      console.warn('[proactive-dispatch] failed to emit work_started event', err);
    }
  }

  /**
   * Emit proactive blocked event.
   */
  function emitBlocked(args: {
    companyId: string;
    employeeId: string;
    triggerId: string;
    reason: 'pause' | 'authority';
    explanation: string;
  }): void {
    const { companyId, employeeId, triggerId, reason, explanation } = args;

    const payload: ProactiveBlockedPayload = {
      triggerId,
      reason,
      explanation,
      autonomyMode: 'balanced', // TODO: read from settings
      blockedAt: now(),
    };

    try {
      deps.bus.emit({
        type: 'proactive.blocked',
        companyId,
        actorId: employeeId,
        actorKind: 'employee',
        payload,
      });
    } catch (err) {
      console.warn('[proactive-dispatch] failed to emit blocked event', err);
    }
  }

  /**
   * Emit proactive budget blocked event.
   */
  function emitBudgetBlocked(args: {
    companyId: string;
    employeeId: string;
    triggerId: string;
    reason: string;
  }): void {
    const { companyId, employeeId, triggerId, reason } = args;

    const payload: ProactiveBudgetBlockedPayload = {
      triggerId,
      reason,
      blockedAt: now(),
    };

    try {
      deps.bus.emit({
        type: 'proactive.budget_blocked',
        companyId,
        actorId: employeeId,
        actorKind: 'employee',
        payload,
      });
    } catch (err) {
      console.warn('[proactive-dispatch] failed to emit budget_blocked event', err);
    }
  }

  /**
   * Emit proactive error event.
   */
  function emitError(args: {
    companyId: string;
    employeeId: string;
    operation: string;
    message: string;
  }): void {
    const { companyId, employeeId, operation, message } = args;

    const payload: ProactiveErrorPayload = {
      operation,
      message,
      recoverable: true,
      errorAt: now(),
    };

    try {
      deps.bus.emit({
        type: 'proactive.error',
        companyId,
        actorId: employeeId,
        actorKind: 'employee',
        payload,
      });
    } catch (err) {
      console.warn('[proactive-dispatch] failed to emit error event', err);
    }
  }

  /**
   * Enqueue proactive work for execution.
   *
   * Flow:
   * 1. Validate employee exists and belongs to company
   * 2. Validate company exists
   * 3. Check budget governance (if configured)
   * 4. Check company pause state
   * 5. Create proactive thread
   * 6. Append trigger message from system
   * 7. Emit proactive.work_started event
   * 8. Call orchestrator.enqueueChat
   */
  async function enqueueProactive(
    args: EnqueueProactiveArgs,
  ): Promise<ProactiveEnqueueResult> {
    const { companyId, employeeId, trigger, triggerId, sourceGoalId, sourceTicketId } = args;

    // 1. Validate employee
    const employee = deps.employeesRepo.getById(employeeId);
    if (!employee) {
      return { success: false, error: 'employee_not_found' };
    }

    if (employee.companyId !== companyId) {
      return { success: false, error: 'employee_company_mismatch' };
    }

    // 2. Validate company
    const company = deps.companiesRepo.getById(companyId);
    if (!company) {
      return { success: false, error: 'company_not_found' };
    }

    // 3. Check budget governance
    if (deps.budgetGovernance) {
      try {
        const admission = await deps.budgetGovernance.assertExecutionAllowed({
          companyId,
          employeeId,
          executionKind: 'agentic',
        });

        if (!admission.allowed) {
          const reason = admission.reason ?? 'Budget policy blocked execution.';
          emitBudgetBlocked({ companyId, employeeId, triggerId, reason });
          return { success: false, error: 'budget_blocked', reason };
        }
      } catch (err) {
        console.warn('[proactive-dispatch] budget check failed', err);
        return {
          success: false,
          error: 'enqueue_failed',
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // 4. Check company pause state
    if (deps.orchestrator.isCompanyPaused(companyId)) {
      emitBlocked({
        companyId,
        employeeId,
        triggerId,
        reason: 'pause',
        explanation: 'Company is currently paused (meeting in progress).',
      });
      return { success: false, error: 'company_paused' };
    }

    // 5. Create proactive thread
    const threadId = deps.threadsRepo.create({
      companyId,
      kind: 'proactive',
      createdBy: employeeId,
    });

    // 6. Append trigger message
    const triggerMessage = buildTriggerMessage({
      trigger,
      triggerId,
      sourceGoalId,
      sourceTicketId,
    });

    const userMessageId = deps.messagesRepo.append({
      threadId,
      authorId: 'system',
      authorKind: 'system',
      content: triggerMessage,
    });

    // 7. Emit work started event
    emitWorkStarted({
      companyId,
      employeeId,
      threadId,
      trigger,
      triggerId,
      sourceGoalId,
      sourceTicketId,
    });

    // 8. Enqueue via orchestrator
    try {
      await deps.orchestrator.enqueueChat({
        threadId,
        employeeId,
        userMessageId,
      });

      return {
        success: true,
        threadId,
        userMessageId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitError({
        companyId,
        employeeId,
        operation: 'enqueueProactive',
        message,
      });

      return {
        success: false,
        error: 'enqueue_failed',
        reason: message,
      };
    }
  }

  return {
    enqueueProactive,
  };
}
