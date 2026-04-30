/**
 * Agent wakeup queue - simple API for triggering proactive agent execution.
 *
 * This module provides the bridge between high-level events (routine completion,
 * ticket assignment, goal decomposition) and the heartbeat service that manages
 * agent wakeups. It's the "missing link" that transforms Team-X from reactive
 * to proactive.
 *
 * Key functions:
 * - Wake agent when issue is assigned
 * - Wake agent when routine completes
 * - Schedule recurring agent wakeup
 * - Manual agent wakeup
 *
 * The single line that transforms Team-X:
 *   await agentWakeupQueue.queueIssueAssignmentWakeup({ issueId, assigneeAgentId, contextSource });
 */

import type { HeartbeatService, WakeupContext } from './heartbeat-service.js';

export interface AgentWakeupQueueDeps {
  heartbeatService: HeartbeatService;
}

export interface AgentWakeupQueue {
  // Wake agent when issue is assigned
  queueIssueAssignmentWakeup(input: {
    companyId: string;
    issueId: string;
    assigneeAgentId: string;
    contextSource: string;
    goalId?: string;
    projectId?: string;
  }): Promise<void>;

  // Wake agent when routine completes
  queueRoutineCompletionWakeup(input: {
    routineId: string;
    companyId: string;
    agentId: string;
    goalId?: string;
    ticketId?: string;
  }): Promise<void>;

  // Schedule recurring agent wakeup
  scheduleRecurringWakeup(input: {
    agentId: string;
    companyId: string;
    intervalMinutes: number;
    context: {
      goalId?: string;
      sourceKind: WakeupContext['sourceKind'];
      metadata?: Record<string, unknown>;
    };
  }): Promise<string>;

  // Wake agent manually
  triggerManualWakeup(input: {
    agentId: string;
    companyId: string;
    reason: string;
    requestedBy: string;
  }): Promise<void>;

  // Wake agent for goal decomposition
  queueGoalDecompositionWakeup(input: {
    agentId: string;
    companyId: string;
    goalId: string;
    parentTicketId?: string;
  }): Promise<void>;
}

export function createAgentWakeupQueue(deps: AgentWakeupQueueDeps): AgentWakeupQueue {
  const { heartbeatService } = deps;

  async function queueIssueAssignmentWakeup(input: {
    companyId: string;
    issueId: string;
    assigneeAgentId: string;
    contextSource: string;
    goalId?: string;
    projectId?: string;
  }): Promise<void> {
    await heartbeatService.scheduleWakeup({
      agentId: input.assigneeAgentId,
      trigger: {
        type: 'ticket_assigned',
        id: input.issueId,
      },
      scheduledFor: new Date(), // Wake immediately
      priority: 70, // High priority for user assignments
      context: {
        companyId: input.companyId,
        goalId: input.goalId,
        projectId: input.projectId,
        sourceKind: 'manual_assignment' as const,
        sourceRefId: input.issueId,
        metadata: {
          contextSource: input.contextSource,
          issueId: input.issueId,
        },
      },
    });
  }

  async function queueRoutineCompletionWakeup(input: {
    routineId: string;
    companyId: string;
    agentId: string;
    goalId?: string;
    ticketId?: string;
  }): Promise<void> {
    await heartbeatService.scheduleWakeup({
      agentId: input.agentId,
      trigger: {
        type: 'routine',
        id: input.routineId,
      },
      scheduledFor: new Date(), // Wake immediately
      priority: 60, // Medium-high priority for routines
      context: {
        companyId: input.companyId,
        goalId: input.goalId,
        sourceKind: 'routine_execution' as const,
        sourceRefId: input.routineId,
        metadata: {
          routineId: input.routineId,
          ticketId: input.ticketId,
        },
      },
    });
  }

  async function scheduleRecurringWakeup(input: {
    agentId: string;
    companyId: string;
    intervalMinutes: number;
    context: {
      goalId?: string;
      sourceKind: WakeupContext['sourceKind'];
      metadata?: Record<string, unknown>;
    };
  }): Promise<string> {
    const scheduledFor = new Date(Date.now() + input.intervalMinutes * 60 * 1000);

    return await heartbeatService.scheduleWakeup({
      agentId: input.agentId,
      trigger: {
        type: 'schedule',
      },
      scheduledFor,
      priority: 50, // Medium priority for scheduled wakeups
      context: {
        companyId: input.companyId,
        goalId: input.context.goalId,
        sourceKind: input.context.sourceKind,
        metadata: input.context.metadata,
      },
    });
  }

  async function triggerManualWakeup(input: {
    agentId: string;
    companyId: string;
    reason: string;
    requestedBy: string;
  }): Promise<void> {
    await heartbeatService.scheduleWakeup({
      agentId: input.agentId,
      trigger: {
        type: 'manual',
      },
      scheduledFor: new Date(), // Wake immediately
      priority: 80, // High priority for manual wakeups
      context: {
        companyId: input.companyId,
        sourceKind: 'manual_assignment' as const,
        metadata: {
          reason: input.reason,
          requestedBy: input.requestedBy,
        },
      },
    });
  }

  async function queueGoalDecompositionWakeup(input: {
    agentId: string;
    companyId: string;
    goalId: string;
    parentTicketId?: string;
  }): Promise<void> {
    await heartbeatService.scheduleWakeup({
      agentId: input.agentId,
      trigger: {
        type: 'goal_decomposed',
        id: input.goalId,
      },
      scheduledFor: new Date(), // Wake immediately
      priority: 75, // High priority for goal work
      context: {
        companyId: input.companyId,
        goalId: input.goalId,
        sourceKind: 'goal_decomposition' as const,
        sourceRefId: input.goalId,
        metadata: {
          parentTicketId: input.parentTicketId,
        },
      },
    });
  }

  return {
    queueIssueAssignmentWakeup,
    queueRoutineCompletionWakeup,
    scheduleRecurringWakeup,
    triggerManualWakeup,
    queueGoalDecompositionWakeup,
  };
}
