/**
 * Unit tests for step-card write-side narrow helpers (Phase 5 — M32 T6).
 *
 * These are pure functions — no DOM, no React, no jsdom required.
 * Validates that malformed / partial / undefined payloads always produce
 * safe default values with the correct shape, matching the contract
 * documented in `packages/shared-types/src/events.ts` AgentStepPayload.
 */

import { describe, expect, it } from 'vitest';

import {
  narrowDelegationMade,
  narrowReviewPending,
  narrowTicketCreated,
} from './step-card-narrow.js';

// ---------------------------------------------------------------------------
// narrowTicketCreated
// ---------------------------------------------------------------------------

describe('narrowTicketCreated', () => {
  it('extracts all fields from a well-formed payload', () => {
    const result = narrowTicketCreated({
      ticketId: 'tk-001',
      title: 'Build auth module',
      assigneeId: 'emp-42',
      planId: 'plan-7',
    });
    expect(result).toEqual({
      ticketId: 'tk-001',
      title: 'Build auth module',
      assigneeId: 'emp-42',
      planId: 'plan-7',
    });
  });

  it('returns safe defaults for undefined input', () => {
    const result = narrowTicketCreated(undefined);
    expect(result).toEqual({ ticketId: '', title: '', assigneeId: '', planId: '' });
  });

  it('returns safe defaults for partial input', () => {
    const result = narrowTicketCreated({ ticketId: 'tk-002' });
    expect(result.ticketId).toBe('tk-002');
    expect(result.title).toBe('');
    expect(result.assigneeId).toBe('');
    expect(result.planId).toBe('');
  });

  it('coerces non-string fields to empty strings', () => {
    const result = narrowTicketCreated({ ticketId: 42, title: null, assigneeId: true, planId: {} });
    expect(result).toEqual({ ticketId: '', title: '', assigneeId: '', planId: '' });
  });
});

// ---------------------------------------------------------------------------
// narrowDelegationMade
// ---------------------------------------------------------------------------

describe('narrowDelegationMade', () => {
  it('extracts all fields from a well-formed payload', () => {
    const result = narrowDelegationMade({
      ticketId: 'tk-010',
      assigneeId: 'emp-5',
      assigneeName: 'Jane Doe',
      planId: 'plan-3',
    });
    expect(result).toEqual({
      ticketId: 'tk-010',
      assigneeId: 'emp-5',
      assigneeName: 'Jane Doe',
      planId: 'plan-3',
    });
  });

  it('returns safe defaults for undefined input', () => {
    const result = narrowDelegationMade(undefined);
    expect(result).toEqual({ ticketId: '', assigneeId: '', assigneeName: '', planId: '' });
  });

  it('handles partial input gracefully', () => {
    const result = narrowDelegationMade({ assigneeName: 'Bob' });
    expect(result.assigneeName).toBe('Bob');
    expect(result.ticketId).toBe('');
  });
});

// ---------------------------------------------------------------------------
// narrowReviewPending
// ---------------------------------------------------------------------------

describe('narrowReviewPending', () => {
  it('extracts all fields from a well-formed payload', () => {
    const result = narrowReviewPending({
      ticketId: 'tk-020',
      reviewerId: 'emp-9',
      outcome: 'approve',
      planId: 'plan-1',
    });
    expect(result).toEqual({
      ticketId: 'tk-020',
      reviewerId: 'emp-9',
      outcome: 'approve',
      planId: 'plan-1',
    });
  });

  it('returns null for planId when absent', () => {
    const result = narrowReviewPending({
      ticketId: 'tk-021',
      reviewerId: 'emp-10',
      outcome: 'reject',
    });
    expect(result.planId).toBeNull();
  });

  it('returns safe defaults for undefined input', () => {
    const result = narrowReviewPending(undefined);
    expect(result).toEqual({ ticketId: '', reviewerId: '', outcome: '', planId: null });
  });

  it('coerces non-string fields to defaults', () => {
    const result = narrowReviewPending({
      ticketId: 123,
      reviewerId: false,
      outcome: [],
      planId: 999,
    });
    expect(result).toEqual({ ticketId: '', reviewerId: '', outcome: '', planId: null });
  });
});
