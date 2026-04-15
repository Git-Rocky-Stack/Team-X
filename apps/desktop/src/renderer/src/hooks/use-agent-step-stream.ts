/**
 * Subscribe to the main-process dashboard event stream and accumulate
 * the live step transcript for a single agentic-loop run, keyed by
 * the system-agent thread the run is writing to.
 *
 * Phase 5 — M31 T5. Consumed by the chat drawer's Copilot detail
 * view (and the command palette's step-log mode from T6) so the
 * user can watch the ReAct loop reason in real-time.
 *
 * M32 T0 / F1 — optional `runId` backfill on mount. When the caller
 * knows the runId (the palette does; it comes back from
 * `command.execute` as `{ runId, threadId }`), the hook fetches the
 * run's persisted-in-memory snapshot via `command.getRunSnapshot`
 * BEFORE attaching the bus listener and seeds `steps` + `result`
 * from it. Dedup by `(runId, stepIndex)` absorbs any race where a
 * step fires between the backfill fetch and the subscription.
 *
 * Root cause the backfill fixes:
 *   - Under fast providers (canned test seam, small local models)
 *     the loop completes in sub-millisecond time and every
 *     `agent.step` / `agentic.completed` event fires before React
 *     Query (or the bare subscription) attaches the listener. The
 *     palette then shows only the terminal answer card at best —
 *     or nothing at all if even the terminal event was missed.
 *
 * Shape contract:
 *   - `steps` accumulates every `agent.step` payload that targets the
 *     given `threadId`, in emission order. One `agent.step` fires per
 *     loop iteration (plan → tool_call → tool_result → answer / error).
 *     When `runId` is provided, the array is seeded with the snapshot
 *     on mount and live events append with dedup.
 *   - `result` is `null` while the run is in-flight, then latches to
 *     `{ kind: 'completed', payload }` or `{ kind: 'failed', payload }`
 *     when the terminal `agentic.completed` / `agentic.failed` event
 *     arrives (or from the snapshot's `terminal` field, same shape).
 *     A run emits exactly one terminal event.
 *   - `reset()` clears local state — used when the user switches to a
 *     different thread in the drawer.
 *
 * Design notes:
 *   - This hook subscribes to `ipc.events.onDashboard` directly rather
 *     than reading from the global Zustand store. Step transcripts are
 *     view-local state — the drawer needs them only while open on a
 *     system-agent thread. Keeping them out of the store avoids
 *     memory-unbounded event history across every run the app has
 *     ever seen.
 *   - Multiple hook instances on the same page are safe: each gets
 *     its own listener. The main-process event bus broadcasts to every
 *     subscriber without filtering.
 *   - `threadId === null` is the unmounted / no-selection case — the
 *     hook returns empty state and does NOT register a listener OR
 *     trigger the backfill fetch.
 *   - The backfill is a one-shot fire-and-forget; if the IPC call
 *     fails (main process crash, unknown runId) the hook silently
 *     falls back to live-only, matching pre-F1 behavior.
 */

import type {
  AgentStepPayload,
  AgenticCompletedPayload,
  AgenticFailedPayload,
  DashboardEvent,
} from '@team-x/shared-types';

import { useCallback, useEffect, useState } from 'react';

import { ipc } from '@/lib/ipc.js';

export type AgentStreamResult =
  | { kind: 'completed'; payload: AgenticCompletedPayload }
  | { kind: 'failed'; payload: AgenticFailedPayload };

export interface UseAgentStepStreamReturn {
  steps: AgentStepPayload[];
  result: AgentStreamResult | null;
  reset: () => void;
}

/**
 * Dedup key — `(runId, stepIndex)` uniquely identifies a step within
 * a run. Pure string builder so the backfill + stream merge stays
 * allocation-light.
 */
function stepKey(runId: string, stepIndex: number): string {
  return `${runId}:${stepIndex}`;
}

export function useAgentStepStream(
  threadId: string | null,
  runId?: string | null,
): UseAgentStepStreamReturn {
  const [steps, setSteps] = useState<AgentStepPayload[]>([]);
  const [result, setResult] = useState<AgentStreamResult | null>(null);

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
  }, []);

  useEffect(() => {
    // Clear any stale state from the previously-watched thread before
    // the new subscription starts emitting.
    setSteps([]);
    setResult(null);

    if (!threadId) return;

    // Tracks which (runId, stepIndex) pairs are already in local
    // state. Seeded by the backfill and appended by the live stream
    // so an event that raced the snapshot fetch is absorbed, not
    // double-rendered.
    const seen = new Set<string>();
    // Guards against the subscription callback running during an
    // unmount-in-flight: we unsubscribe in cleanup, but if the IPC
    // backfill resolves AFTER cleanup we must drop the seed.
    let cancelled = false;

    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.type === 'agent.step') {
        const payload = event.payload as AgentStepPayload;
        if (payload.threadId !== threadId) return;
        const key = stepKey(payload.runId, payload.stepIndex);
        if (seen.has(key)) return;
        seen.add(key);
        setSteps((prev) => [...prev, payload]);
        return;
      }

      if (event.type === 'agentic.completed') {
        const payload = event.payload as AgenticCompletedPayload;
        if (payload.threadId !== threadId) return;
        setResult((prev) => prev ?? { kind: 'completed', payload });
        return;
      }

      if (event.type === 'agentic.failed') {
        const payload = event.payload as AgenticFailedPayload;
        if (payload.threadId !== threadId) return;
        setResult((prev) => prev ?? { kind: 'failed', payload });
      }
    });

    // M32 T0 / F1 — one-shot snapshot backfill. Only when the caller
    // has a concrete runId. Thread-only subscribers (the chat drawer,
    // which doesn't track runId) retain pre-F1 live-only behavior.
    if (runId) {
      ipc.command
        .getRunSnapshot(runId)
        .then((snap) => {
          if (cancelled || !snap) return;
          if (snap.threadId !== threadId) return;
          if (snap.steps.length > 0) {
            const fresh: AgentStepPayload[] = [];
            for (const step of snap.steps) {
              const key = stepKey(step.runId, step.stepIndex);
              if (seen.has(key)) continue;
              seen.add(key);
              fresh.push(step);
            }
            if (fresh.length > 0) {
              setSteps((prev) => (prev.length === 0 ? fresh : [...fresh, ...prev]));
            }
          }
          if (snap.terminal) {
            setResult((prev) => prev ?? snap.terminal ?? null);
          }
        })
        .catch(() => {
          // Silent: the live stream is the source of truth. Backfill
          // is best-effort — unknown / evicted runs and transient
          // IPC failures both land here and fall through to live-only.
        });
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId, runId]);

  return { steps, result, reset };
}
