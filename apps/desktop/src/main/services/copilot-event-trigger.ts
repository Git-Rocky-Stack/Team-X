/**
 * CopilotEventTrigger — event-bus subscriber that fires supplementary
 * `CopilotAnalyzerService.tick()` calls in response to four signal
 * types with a per-company 30s debounce. Phase 5 — M33 T4.
 *
 * Design:
 *
 *   1. Signals (locked by Phase 5 §8.5):
 *        - meeting.ended
 *        - ticket.closed        (future-ready — not in today's EventType union)
 *        - goal.progressChanged (future-ready — not in today's EventType union)
 *        - agentic.failed + payload.reason is a budget reason
 *
 *      The two "future-ready" signals have no producer in the codebase
 *      today; the trigger listens anyway so the wiring is ready the day
 *      the upstream events are added. Harmless — a subscription that
 *      never receives an event is zero-cost.
 *
 *      "Budget reason" is NOT the string 'budget_exhausted'. That is the
 *      run STATUS (`LoopStatus`). `finishRun` in `agentic-loop-service.ts`
 *      puts `state.errorReason ?? state.status` on the payload, and for a
 *      budget-exhausted run `errorReason` is the loop's terminal
 *      `LoopErrorReason`: `budget_iterations`, `budget_steps`,
 *      `budget_tokens`, or `budget_timeout`. See `BUDGET_FAILURE_REASONS`.
 *
 *   2. Debounce (per-company, not throttle):
 *      Each signal resets a 30s timer keyed by companyId. If a second
 *      signal fires within 30s, the timer is extended AND the stored
 *      `reason` is replaced with the newer trigger. When the timer
 *      finally fires, it calls `analyzer.tick(companyId, { reason })`
 *      with the MOST-RECENT reason. This matches the Phase 5 §8.5
 *      intent: "coalesce bursts of activity into a single tick".
 *
 *   3. Invariant preservation:
 *      - #2 (orchestrator is the only scheduler): the trigger is a
 *        supplementary ticker — ticks still route through the analyzer,
 *        which observes orchestrator pause on every provider call.
 *      - #6 (events append-only): the trigger is a pure observer; it
 *        never writes to the events table.
 *
 *   4. Separation from `CopilotEventWindow` (T3):
 *      The window is a pure accumulator. The trigger is an analyzer
 *      dispatcher. Splitting them keeps T3's test isolation intact —
 *      the window can be tested without the analyzer's timer machinery,
 *      and the trigger can be tested without the window's buffer state.
 */

import type { LoopErrorReason, LoopStatus } from '@team-x/intelligence';
import type { CopilotAnalyzedReason, DashboardEvent } from '@team-x/shared-types';

import type { CopilotAnalyzerTickResult } from './copilot-analyzer-service.js';

export interface CopilotEventTriggerBus {
  subscribe(listener: (event: DashboardEvent) => void): () => void;
}

export interface CopilotEventTriggerAnalyzer {
  tick(
    companyId: string,
    opts?: { reason?: CopilotAnalyzedReason },
  ): Promise<CopilotAnalyzerTickResult>;
}

export interface CopilotEventTriggerLogger {
  warn(msg: string, err?: unknown): void;
}

export interface CopilotEventTriggerDeps {
  bus: CopilotEventTriggerBus;
  analyzer: CopilotEventTriggerAnalyzer;
  /** Debounce window. Defaults to 30 000 ms (Phase 5 §8.5 locked value). */
  debounceMs?: number;
  /** Injectable timer primitives for tests. */
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  logger?: CopilotEventTriggerLogger;
}

export interface CopilotEventTrigger {
  start(): void;
  stop(): void;
  /**
   * Force-dispatch an event as if it had come off the bus. Exposed for
   * IPC-driven manual ticks and for E2E specs that want to simulate a
   * signal without plumbing a real producer. Production callers should
   * emit on the bus; the trigger picks them up through `subscribe`.
   */
  triggerAnalysis(companyId: string, reason: CopilotAnalyzedReason): void;
}

export const DEFAULT_DEBOUNCE_MS = 30_000;

/**
 * Signal-type → analyzer reason mapping. The `agentic.failed` signal
 * ALSO requires a payload predicate (the reason is a budget reason, see
 * `BUDGET_FAILURE_REASONS`), which is applied inside `reasonForEvent` below.
 */
const SIGNAL_TYPES = new Set<string>([
  'meeting.ended',
  'ticket.closed',
  'goal.progressChanged',
  'agentic.failed',
]);

interface AgenticFailedPayloadShape {
  reason?: string;
}

/** The budget caps among the loop's terminal error reasons. */
type BudgetLoopErrorReason = Extract<LoopErrorReason, `budget_${string}`>;

/**
 * Every `agentic.failed` payload `reason` that means "the run hit a budget
 * cap". Typed as a record over the budget members of `LoopErrorReason`, so
 * a budget reason added to the loop fails to compile here until it is
 * listed.
 *
 * The four `budget_*` reasons are what a real run reports: every
 * `'budget_exhausted'` exit in `packages/intelligence/src/loop/loop.ts`
 * goes through `emitErrorAndFinish`, which appends the error step that
 * `agentic-loop-service.ts` copies into `state.errorReason`.
 *
 * `budget_exhausted` is the run status, kept because it is the declared
 * fallback of the emitter's own expression (`state.errorReason ??
 * state.status`). No current loop path reaches that fallback for a budget
 * exit; listing it means a future one that finalizes without an error step
 * still wakes the analyzer.
 */
const BUDGET_FAILURE_REASONS: Readonly<
  Record<BudgetLoopErrorReason | Extract<LoopStatus, 'budget_exhausted'>, true>
> = {
  budget_iterations: true,
  budget_steps: true,
  budget_tokens: true,
  budget_timeout: true,
  budget_exhausted: true,
};

/**
 * Map a bus event onto an analyzer `reason`. Returns `null` when the
 * event is not a signal (i.e. should NOT trigger analysis). Exported
 * for the T4 trigger unit tests.
 */
export function reasonForEvent(event: DashboardEvent): CopilotAnalyzedReason | null {
  const type = event.type as string;
  if (!SIGNAL_TYPES.has(type)) return null;
  if (type === 'agentic.failed') {
    const payload = event.payload as AgenticFailedPayloadShape | null;
    const reason = payload?.reason;
    if (typeof reason !== 'string' || !Object.hasOwn(BUDGET_FAILURE_REASONS, reason)) return null;
    return 'agentic.budget_exhausted';
  }
  if (type === 'meeting.ended') return 'meeting.ended';
  if (type === 'ticket.closed') return 'ticket.closed';
  if (type === 'goal.progressChanged') return 'goal.progressChanged';
  return null;
}

export function createCopilotEventTrigger(deps: CopilotEventTriggerDeps): CopilotEventTrigger {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const setTimeoutFn = deps.setTimeout ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeout ?? clearTimeout;
  const logger: CopilotEventTriggerLogger = deps.logger ?? {
    warn: (m, e) => console.warn(m, e),
  };

  interface DebounceEntry {
    timer: ReturnType<typeof setTimeout>;
    reason: CopilotAnalyzedReason;
  }

  const pending = new Map<string, DebounceEntry>();
  let unsubscribe: (() => void) | null = null;

  function schedule(companyId: string, reason: CopilotAnalyzedReason): void {
    const existing = pending.get(companyId);
    if (existing) {
      clearTimeoutFn(existing.timer);
    }
    const timer = setTimeoutFn(() => {
      pending.delete(companyId);
      deps.analyzer.tick(companyId, { reason }).catch((err) => {
        logger.warn(`[copilot-event-trigger] tick failed for ${companyId}`, err);
      });
    }, debounceMs);
    pending.set(companyId, { timer, reason });
  }

  function onEvent(event: DashboardEvent): void {
    const reason = reasonForEvent(event);
    if (reason === null) return;
    schedule(event.companyId, reason);
  }

  function start(): void {
    if (unsubscribe) return;
    unsubscribe = deps.bus.subscribe(onEvent);
  }

  function stop(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    for (const { timer } of pending.values()) {
      clearTimeoutFn(timer);
    }
    pending.clear();
  }

  function triggerAnalysis(companyId: string, reason: CopilotAnalyzedReason): void {
    schedule(companyId, reason);
  }

  return { start, stop, triggerAnalysis };
}

/** Exposed for tests only — NEVER depend on this from production code. */
export const __TEST_INTERNALS__ = {
  DEFAULT_DEBOUNCE_MS,
  SIGNAL_TYPES,
} as const;
