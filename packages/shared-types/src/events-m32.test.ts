import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AgentStepKind,
  AgentStepPayload,
  EventType,
  PlanApprovedPayload,
  PlanProposedPayload,
  ReviewCompletedPayload,
  ReviewRequestedPayload,
  TaskDelegatedPayload,
  TaskEscalatedPayload,
} from './events.js';

describe('M32 T4 — write-side event types + step kinds', () => {
  it('EventType union includes all 6 write-side planner events', () => {
    const plannerEvents: EventType[] = [
      'plan.proposed',
      'plan.approved',
      'task.delegated',
      'task.escalated',
      'review.requested',
      'review.completed',
    ];
    expect(plannerEvents).toHaveLength(6);

    expectTypeOf<'plan.proposed'>().toMatchTypeOf<EventType>();
    expectTypeOf<'plan.approved'>().toMatchTypeOf<EventType>();
    expectTypeOf<'task.delegated'>().toMatchTypeOf<EventType>();
    expectTypeOf<'task.escalated'>().toMatchTypeOf<EventType>();
    expectTypeOf<'review.requested'>().toMatchTypeOf<EventType>();
    expectTypeOf<'review.completed'>().toMatchTypeOf<EventType>();
  });

  it('AgentStepKind union includes 3 write-side step kinds', () => {
    const writeKinds: AgentStepKind[] = ['ticket_created', 'delegation_made', 'review_pending'];
    expect(writeKinds).toHaveLength(3);

    expectTypeOf<'ticket_created'>().toMatchTypeOf<AgentStepKind>();
    expectTypeOf<'delegation_made'>().toMatchTypeOf<AgentStepKind>();
    expectTypeOf<'review_pending'>().toMatchTypeOf<AgentStepKind>();

    const step: AgentStepPayload = {
      runId: 'run-1',
      threadId: 'th-1',
      stepIndex: 0,
      kind: 'ticket_created',
      data: { ticketId: 't-1', title: 'Fix auth', assigneeId: 'emp-1', planId: 'plan-1' },
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      provider: 'test',
      model: 'test-model',
    };
    expect(step.kind).toBe('ticket_created');
  });

  it('payload interfaces have correct discriminator shapes', () => {
    const proposed: PlanProposedPayload = {
      planId: 'plan-1',
      projectId: 'proj-1',
      subtaskCount: 3,
      truncated: false,
      subtasks: [
        {
          title: 'Task A',
          assigneeId: 'emp-1',
          assigneeName: 'Alice',
          complexity: 'medium',
          dependsOn: [],
        },
      ],
    };
    expect(proposed.planId).toBe('plan-1');

    const approved: PlanApprovedPayload = {
      planId: 'plan-1',
      projectId: 'proj-1',
      approvedBy: 'emp-2',
      ticketIds: ['t-1', 't-2'],
    };
    expect(approved.ticketIds).toHaveLength(2);

    const delegated: TaskDelegatedPayload = {
      ticketId: 't-1',
      planId: 'plan-1',
      assigneeId: 'emp-1',
      assigneeName: 'Alice',
      parentProjectId: 'proj-1',
      fallbackUsed: false,
      attemptCount: 1,
    };
    expect(delegated.fallbackUsed).toBe(false);

    const escalated: TaskEscalatedPayload = {
      planId: 'plan-1',
      escalatedTo: 'emp-0',
      reason: 'Too many failures',
    };
    expect(escalated.reason).toBeTruthy();

    const reviewReq: ReviewRequestedPayload = {
      ticketId: 't-1',
      reviewerId: 'emp-2',
      planId: 'plan-1',
    };
    expect(reviewReq.reviewerId).toBe('emp-2');

    const reviewDone: ReviewCompletedPayload = {
      ticketId: 't-1',
      reviewerId: 'emp-2',
      outcome: 'approve',
      summary: 'LGTM',
      planId: 'plan-1',
      escalated: false,
    };
    expect(reviewDone.outcome).toBe('approve');
    expect(reviewDone.escalated).toBe(false);
  });
});
