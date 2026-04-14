/**
 * Unit tests for the shared `INTENT_LABELS` mapping (Phase 5 — M30 T7).
 *
 * Guards:
 *   1. Every intent in `IpcIntentName` has a label — no undefined cells.
 *   2. Destructive intents render with explicit verbs so the audit log
 *      makes the action's gravity unmistakable.
 *   3. `intentLabel()` falls back to the raw string on unknowns —
 *      stale rows / older bus payloads never render as empty.
 *   4. Label stability — the palette and audit summary depend on exact
 *      strings. A change here is a visible UX change and must be
 *      intentional (this test is the canary).
 */

import { describe, expect, it } from 'vitest';

import type { IpcIntentName } from '@team-x/shared-types';

import { INTENT_LABELS, intentLabel } from './intent-labels.js';

// Canonical intent list — kept in lock-step with `IpcIntentName`.
// If TypeScript accepts this cast, the union hasn't drifted.
const ALL_INTENTS: readonly IpcIntentName[] = [
  'hire_employee',
  'fire_employee',
  'assign_ticket',
  'create_ticket',
  'close_ticket',
  'promote_employee',
  'create_project',
  'create_goal',
  'call_meeting',
  'end_meeting',
  'check_status',
  'show_view',
  'search_vault',
  'complex_request',
  'reopen_ticket',
];

describe('INTENT_LABELS', () => {
  it('defines a non-empty label for every IpcIntentName', () => {
    expect(ALL_INTENTS).toHaveLength(15);
    for (const intent of ALL_INTENTS) {
      const label = INTENT_LABELS[intent];
      expect(label, `missing label for ${intent}`).toBeDefined();
      expect(label.length, `empty label for ${intent}`).toBeGreaterThan(0);
    }
  });

  it('uses explicit destructive verbs for destructive intents', () => {
    // These four intents are the ones the palette + CommandService
    // gate behind an explicit confirm. Their labels MUST read with
    // the action verb so a user scanning the audit log sees the
    // gravity at a glance — no euphemisms.
    expect(INTENT_LABELS.fire_employee).toBe('Fire Employee');
    expect(INTENT_LABELS.close_ticket).toBe('Close Ticket');
    expect(INTENT_LABELS.end_meeting).toBe('End Meeting');
    expect(INTENT_LABELS.promote_employee).toBe('Promote Employee');
  });

  it('every label is unique — no collisions across intents', () => {
    const labels = ALL_INTENTS.map((i) => INTENT_LABELS[i]);
    const set = new Set(labels);
    expect(set.size).toBe(labels.length);
  });

  it('label stability — pins the user-visible strings', () => {
    // If a palette snapshot test, E2E spec, or audit dashboard copy
    // diverges from this table, update this test with intent — but
    // NOT silently. Any change in here is a UX-visible change.
    expect(INTENT_LABELS.hire_employee).toBe('Hire Employee');
    expect(INTENT_LABELS.assign_ticket).toBe('Assign Ticket');
    expect(INTENT_LABELS.create_ticket).toBe('Create Ticket');
    expect(INTENT_LABELS.reopen_ticket).toBe('Reopen Ticket');
    expect(INTENT_LABELS.create_project).toBe('Create Project');
    expect(INTENT_LABELS.create_goal).toBe('Create Goal');
    expect(INTENT_LABELS.call_meeting).toBe('Call Meeting');
    expect(INTENT_LABELS.check_status).toBe('Check Status');
    expect(INTENT_LABELS.show_view).toBe('Show View');
    expect(INTENT_LABELS.search_vault).toBe('Search Vault');
    expect(INTENT_LABELS.complex_request).toBe('Route to Agent');
  });
});

describe('intentLabel()', () => {
  it('returns the canonical label for a known intent string', () => {
    expect(intentLabel('hire_employee')).toBe('Hire Employee');
    expect(intentLabel('fire_employee')).toBe('Fire Employee');
  });

  it('falls back to the raw string for unknown intents', () => {
    // A stale row persisted by an older build may reference an
    // intent that no longer exists in the union. The audit UI must
    // still render something — the raw string is the honest fallback.
    expect(intentLabel('not_a_real_intent')).toBe('not_a_real_intent');
    expect(intentLabel('')).toBe('');
    expect(intentLabel('legacy_action_v0')).toBe('legacy_action_v0');
  });

  it('handles every defined IpcIntentName exactly as INTENT_LABELS does', () => {
    for (const intent of ALL_INTENTS) {
      expect(intentLabel(intent)).toBe(INTENT_LABELS[intent]);
    }
  });
});
