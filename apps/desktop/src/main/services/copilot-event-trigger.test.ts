/**
 * CopilotEventTrigger — unit tests. Phase 5 — M33 T4.
 *
 * Two tests matching the T4 brief's event-triggered debounce budget:
 *   1. Single signal debounces then fires the analyzer tick once.
 *   2. Repeated signals inside the debounce window coalesce into a
 *      single analyzer tick with the most-recent reason.
 */

import type { CopilotAnalyzedReason, DashboardEvent, EventType } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  type CopilotEventTriggerAnalyzer,
  type CopilotEventTriggerBus,
  createCopilotEventTrigger,
  reasonForEvent,
} from './copilot-event-trigger.js';

function makeEvent(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: (overrides.type ?? 'meeting.ended') as EventType,
    companyId: overrides.companyId ?? 'co-1',
    actorId: overrides.actorId ?? 'system',
    actorKind: (overrides.actorKind ?? 'system') as DashboardEvent['actorKind'],
    payload: overrides.payload ?? {},
    createdAt: overrides.createdAt ?? 1_000,
  };
}

function makeFakeBus(): {
  bus: CopilotEventTriggerBus;
  push: (e: DashboardEvent) => void;
} {
  const listeners = new Set<(e: DashboardEvent) => void>();
  return {
    bus: {
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    push: (e) => {
      for (const fn of listeners) fn(e);
    },
  };
}

function makeFakeAnalyzer(): {
  analyzer: CopilotEventTriggerAnalyzer;
  calls: Array<{ companyId: string; reason: CopilotAnalyzedReason | undefined }>;
} {
  const calls: Array<{ companyId: string; reason: CopilotAnalyzedReason | undefined }> = [];
  return {
    calls,
    analyzer: {
      tick: async (companyId, opts) => {
        calls.push({ companyId, reason: opts?.reason });
        return {
          runId: `r-${calls.length}`,
          reason: opts?.reason ?? 'manual',
          insightsProposed: 0,
          insightsGenerated: 0,
          insightsMerged: 0,
          insightsExpired: 0,
          status: 'success',
          errorMessage: null,
        };
      },
    },
  };
}

describe('copilot-event-trigger — debounce', () => {
  it('debounces a single signal and fires analyzer.tick once with mapped reason', async () => {
    vi.useFakeTimers();
    try {
      const { bus, push } = makeFakeBus();
      const { analyzer, calls } = makeFakeAnalyzer();
      const trigger = createCopilotEventTrigger({
        bus,
        analyzer,
        debounceMs: 30_000,
      });
      trigger.start();
      push(makeEvent({ type: 'meeting.ended' }));
      // Before the debounce window elapses, no tick fires.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toHaveLength(0);
      // Debounce fully elapses — exactly one tick with reason=meeting.ended.
      await vi.advanceTimersByTimeAsync(25_000);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ companyId: 'co-1', reason: 'meeting.ended' });
      trigger.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces repeated signals in the debounce window into one tick with the latest reason', async () => {
    vi.useFakeTimers();
    try {
      const { bus, push } = makeFakeBus();
      const { analyzer, calls } = makeFakeAnalyzer();
      const trigger = createCopilotEventTrigger({
        bus,
        analyzer,
        debounceMs: 30_000,
      });
      trigger.start();

      // First signal — meeting.ended
      push(makeEvent({ type: 'meeting.ended' }));
      await vi.advanceTimersByTimeAsync(20_000);

      // Second signal 20s in — agentic.failed/budget_exhausted. Timer resets.
      push(
        makeEvent({
          type: 'agentic.failed',
          payload: { reason: 'budget_exhausted' },
        }),
      );
      await vi.advanceTimersByTimeAsync(20_000);

      // Still no tick (second timer only 20s in).
      expect(calls).toHaveLength(0);

      // Wait out the rest of the second debounce window.
      await vi.advanceTimersByTimeAsync(15_000);

      // Exactly one tick, using the latest reason.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        companyId: 'co-1',
        reason: 'agentic.budget_exhausted',
      });

      // Non-signal events are ignored entirely.
      push(makeEvent({ type: 'token.delta' }));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toHaveLength(1);

      // And `agentic.failed` WITHOUT `budget_exhausted` reason must NOT fire.
      push(makeEvent({ type: 'agentic.failed', payload: { reason: 'provider_error' } }));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toHaveLength(1);

      // Sanity: the pure helper agrees with the trigger.
      expect(reasonForEvent(makeEvent({ type: 'meeting.ended' }))).toBe('meeting.ended');
      expect(
        reasonForEvent(
          makeEvent({ type: 'agentic.failed', payload: { reason: 'budget_exhausted' } }),
        ),
      ).toBe('agentic.budget_exhausted');
      expect(reasonForEvent(makeEvent({ type: 'token.delta' }))).toBeNull();

      trigger.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
