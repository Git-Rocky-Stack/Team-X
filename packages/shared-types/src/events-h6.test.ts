/**
 * H6 audit (2026-05-07) — `EVENT_TYPES` const-array source of truth.
 *
 * Pins the runtime-iterable form of the canonical event-type set so:
 *   - The Zod `z.enum(EVENT_TYPES)` schema in `agentic-tools.ts` keeps
 *     working without drift when new event types are added.
 *   - The `EventType` union and the runtime array stay byte-identical —
 *     this is the load-bearing invariant the H6 fix relies on.
 *   - Spreading `RUNTIME_AUDIT_EVENT_TYPES` into the parent tuple
 *     preserves the literal narrowing (TypeScript variant: tuple-spread
 *     in `as const` arrays must yield a literal-typed tuple, not a
 *     widened `string[]`).
 *
 * Source of truth: `packages/shared-types/src/events.ts`.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  EVENT_TYPES,
  RUNTIME_AUDIT_EVENT_TYPES,
  type EventType,
  type RuntimeAuditEventType,
} from './events.js';

describe('EVENT_TYPES — runtime-iterable canonical event-type set (H6 audit 2026-05-07)', () => {
  it('is a non-empty readonly array of string literals', () => {
    expect(Array.isArray(EVENT_TYPES)).toBe(true);
    expect(EVENT_TYPES.length).toBeGreaterThan(0);
    for (const t of EVENT_TYPES) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate literals (single source of truth)', () => {
    const seen = new Set(EVENT_TYPES);
    expect(seen.size).toBe(EVENT_TYPES.length);
  });

  it('includes every runtime-audit event spread member', () => {
    // The spread of `...RUNTIME_AUDIT_EVENT_TYPES` must survive the
    // outer `as const` narrowing — proves the tuple-spread literal
    // preservation contract.
    for (const auditType of RUNTIME_AUDIT_EVENT_TYPES) {
      expect(EVENT_TYPES).toContain(auditType);
    }
  });

  it('includes every read-side workhorse event the agentic loop queries', () => {
    // This list is the cross-section of "events the LLM is most likely
    // to filter on via query_events"; if any are accidentally removed
    // from the const tuple the schema would silently reject the model's
    // valid intent. Locking in the contract here.
    const workhorseEvents = [
      'work.completed',
      'work.failed',
      'tool.called',
      'tool.result',
      'ticket.created',
      'ticket.closed',
      'agentic.completed',
      'agentic.failed',
      'employee.hired',
      'employee.fired',
      'meeting.ended',
      'copilot.insight',
      'agent.step',
    ] satisfies EventType[];
    for (const t of workhorseEvents) {
      expect(EVENT_TYPES).toContain(t);
    }
  });

  it('EventType type matches the const-array element type (compile-time)', () => {
    // The union is `(typeof EVENT_TYPES)[number]`. Every member of the
    // tuple satisfies EventType; every EventType is present in the
    // tuple at the type level.
    expectTypeOf<(typeof EVENT_TYPES)[number]>().toEqualTypeOf<EventType>();
    expectTypeOf<RuntimeAuditEventType>().toMatchTypeOf<EventType>();
    expectTypeOf<'ticket.created'>().toMatchTypeOf<EventType>();
    expectTypeOf<'agentic.completed'>().toMatchTypeOf<EventType>();
    expectTypeOf<'runtime.session.started'>().toMatchTypeOf<EventType>();
  });

  it('rejects free-form strings at the type level (compile-time)', () => {
    // @ts-expect-error — `'not-an-event'` must not be assignable to EventType.
    const _bad: EventType = 'not-an-event';
    void _bad;
  });
});
