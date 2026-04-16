/**
 * Pure narrow helpers for write-side AgentStepPayload `data` fields
 * (Phase 5 — M32 T6).
 *
 * Extracted to a standalone module with zero renderer dependencies so
 * they can be unit-tested in the node-env Vitest without jsdom or Vite
 * alias resolution. The main `step-card.tsx` re-exports from here.
 *
 * Each function takes `unknown` and returns a safe, fully-typed object
 * with empty-string / null defaults for missing or malformed fields.
 * Shape contracts match `AgentStepPayload.data` per kind as documented
 * in `packages/shared-types/src/events.ts`.
 */

// ---------------------------------------------------------------------------
// ticket_created
// ---------------------------------------------------------------------------

export interface TicketCreatedData {
  ticketId: string;
  title: string;
  assigneeId: string;
  planId: string;
}

export function narrowTicketCreated(data: unknown): TicketCreatedData {
  const d = data as Partial<TicketCreatedData> | undefined;
  return {
    ticketId: typeof d?.ticketId === 'string' ? d.ticketId : '',
    title: typeof d?.title === 'string' ? d.title : '',
    assigneeId: typeof d?.assigneeId === 'string' ? d.assigneeId : '',
    planId: typeof d?.planId === 'string' ? d.planId : '',
  };
}

// ---------------------------------------------------------------------------
// delegation_made
// ---------------------------------------------------------------------------

export interface DelegationMadeData {
  ticketId: string;
  assigneeId: string;
  assigneeName: string;
  planId: string;
}

export function narrowDelegationMade(data: unknown): DelegationMadeData {
  const d = data as Partial<DelegationMadeData> | undefined;
  return {
    ticketId: typeof d?.ticketId === 'string' ? d.ticketId : '',
    assigneeId: typeof d?.assigneeId === 'string' ? d.assigneeId : '',
    assigneeName: typeof d?.assigneeName === 'string' ? d.assigneeName : '',
    planId: typeof d?.planId === 'string' ? d.planId : '',
  };
}

// ---------------------------------------------------------------------------
// review_pending
// ---------------------------------------------------------------------------

export interface ReviewPendingData {
  ticketId: string;
  reviewerId: string;
  outcome: string;
  planId: string | null;
}

export function narrowReviewPending(data: unknown): ReviewPendingData {
  const d = data as Partial<ReviewPendingData> | undefined;
  return {
    ticketId: typeof d?.ticketId === 'string' ? d.ticketId : '',
    reviewerId: typeof d?.reviewerId === 'string' ? d.reviewerId : '',
    outcome: typeof d?.outcome === 'string' ? d.outcome : '',
    planId: typeof d?.planId === 'string' ? d.planId : null,
  };
}
