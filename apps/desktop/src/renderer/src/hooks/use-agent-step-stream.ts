/**
 * Subscribe to the main-process dashboard event stream and accumulate
 * the live step transcript for a single agentic-loop run, keyed by
 * the system-agent thread the run is writing to.
 *
 * Phase 5 — M31 T5. Consumed by the chat drawer's Copilot detail
 * view (and later the command palette's step-log mode in T6) so the
 * user can watch the ReAct loop reason in real-time.
 *
 * Shape contract:
 *   - `steps` accumulates every `agent.step` payload that targets the
 *     given `threadId`, in emission order. One `agent.step` fires per
 *     loop iteration (plan → tool_call → tool_result → answer / error).
 *   - `result` is `null` while the run is in-flight, then latches to
 *     `{ kind: 'completed', payload }` or `{ kind: 'failed', payload }`
 *     when the terminal `agentic.completed` / `agentic.failed` event
 *     arrives. A run emits exactly one terminal event.
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
 *     hook returns empty state and does NOT register a listener.
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

export function useAgentStepStream(threadId: string | null): UseAgentStepStreamReturn {
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

    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.type === 'agent.step') {
        const payload = event.payload as AgentStepPayload;
        if (payload.threadId !== threadId) return;
        setSteps((prev) => [...prev, payload]);
        return;
      }

      if (event.type === 'agentic.completed') {
        const payload = event.payload as AgenticCompletedPayload;
        if (payload.threadId !== threadId) return;
        setResult({ kind: 'completed', payload });
        return;
      }

      if (event.type === 'agentic.failed') {
        const payload = event.payload as AgenticFailedPayload;
        if (payload.threadId !== threadId) return;
        setResult({ kind: 'failed', payload });
      }
    });

    return unsubscribe;
  }, [threadId]);

  return { steps, result, reset };
}
