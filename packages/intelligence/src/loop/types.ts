/**
 * Agentic loop — pure type surface.
 *
 * The loop is a provider-agnostic ReAct orchestrator: it consumes a
 * completion function (text-in / text-out + usage), a zod-validated
 * tool registry, and budget caps, and emits a typed stream of
 * `LoopStep` values until it reaches an answer or exhausts its budget.
 *
 * Architectural invariants:
 *   - No Electron. No SQLite. No `fs`. No network. All side-effects are
 *     injected through `LoopDeps`.
 *   - Budgets are non-negotiable: step cap, token cap, wall-clock
 *     timeout. Any breach emits a terminal `error` step and returns
 *     the run with `status: 'budget_exhausted'` (or `failed` / `canceled`).
 *   - Every step carries `{ tokensIn, tokensOut, costUsd, provider, model }`
 *     so the telemetry dashboard can attribute cost to a specific
 *     complex_request end-to-end.
 *
 * Phase 5 — M31 — T1.
 */

import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Telemetry carried on every step
// ---------------------------------------------------------------------------

export interface LoopStepTelemetry {
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly provider: string;
  readonly model: string;
}

/** Convenience constant — tool_result and error steps have no LLM cost. */
export const ZERO_TELEMETRY: LoopStepTelemetry = {
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  provider: '',
  model: '',
};

// ---------------------------------------------------------------------------
// Discriminated-union step shape. The renderer's step-card component
// switches on `kind`; downstream persistence writes the same rows to
// the event bus + a transcript table.
// ---------------------------------------------------------------------------

export interface LoopStepPlan {
  readonly kind: 'plan';
  readonly stepIndex: number;
  readonly text: string;
  readonly telemetry: LoopStepTelemetry;
}

export interface LoopStepToolCall {
  readonly kind: 'tool_call';
  readonly stepIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly telemetry: LoopStepTelemetry;
}

export interface LoopStepToolResult {
  readonly kind: 'tool_result';
  readonly stepIndex: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly telemetry: LoopStepTelemetry;
}

export interface LoopStepAnswer {
  readonly kind: 'answer';
  readonly stepIndex: number;
  readonly text: string;
  readonly telemetry: LoopStepTelemetry;
}

/**
 * Terminal error conditions. Every failure mode the loop can encounter
 * maps to exactly one reason so downstream UX + audit rows can branch
 * cleanly.
 */
export type LoopErrorReason =
  | 'budget_steps'
  | 'budget_tokens'
  | 'budget_timeout'
  | 'tool_call_invalid'
  | 'tool_unknown'
  | 'tool_threw'
  | 'tool_timeout'
  | 'provider_error'
  | 'canceled';

export interface LoopStepError {
  readonly kind: 'error';
  readonly stepIndex: number;
  readonly reason: LoopErrorReason;
  readonly message: string;
  readonly telemetry: LoopStepTelemetry;
}

export type LoopStep =
  | LoopStepPlan
  | LoopStepToolCall
  | LoopStepToolResult
  | LoopStepAnswer
  | LoopStepError;

// ---------------------------------------------------------------------------
// Run status + budget bookkeeping
// ---------------------------------------------------------------------------

export type LoopStatus = 'completed' | 'budget_exhausted' | 'failed' | 'canceled';

export interface LoopBudget {
  readonly maxSteps: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

export interface LoopBudgetUsed {
  readonly steps: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly wallClockMs: number;
  readonly costUsd: number;
}

export interface LoopRun {
  readonly runId: string;
  readonly status: LoopStatus;
  readonly steps: readonly LoopStep[];
  readonly budget: LoopBudget;
  readonly used: LoopBudgetUsed;
  /** Set only when `status === 'completed'`. */
  readonly answer?: string;
}

// ---------------------------------------------------------------------------
// Tool contract — minimal surface so agentic-tools (T2) can wrap any
// repo without pulling zod mechanics into the main process.
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** Aborted when the loop is canceled or the tool times out. */
  readonly signal: AbortSignal;
  /** Run-scoped identifier — useful for tool-side logging/tracing. */
  readonly runId: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Tool args are heterogeneous by design.
export interface Tool<
  TArgs extends Record<string, unknown> = Record<string, any>,
  TResult = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<TArgs>;
  execute(args: TArgs, ctx: ToolContext): Promise<TResult>;
}

// ---------------------------------------------------------------------------
// Provider contract — the only coupling to an LLM backend.
//
// The loop requires a single function: given a system prompt and a
// chat transcript, return a full assistant completion + usage record.
// This matches the M30 `ClassifyCompleteFn` discipline (one function,
// injected, trivially mockable) and leaves streaming concerns to the
// layer above (main-process AgenticLoopService wraps `streamAgent`
// from @team-x/provider-router and collects deltas before calling in).
// ---------------------------------------------------------------------------

export type LoopMessageRole = 'user' | 'assistant';

export interface LoopMessage {
  readonly role: LoopMessageRole;
  readonly content: string;
}

export interface LoopProviderUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LoopProviderCompletion {
  readonly text: string;
  readonly usage: LoopProviderUsage;
  readonly provider: string;
  readonly model: string;
  /** Cost attribution for this single completion. Zero is acceptable for local providers. */
  readonly costUsd: number;
}

export interface LoopCompleteRequest {
  readonly system: string;
  readonly messages: readonly LoopMessage[];
  readonly signal: AbortSignal;
}

export type LoopCompleteFn = (req: LoopCompleteRequest) => Promise<LoopProviderCompletion>;

// ---------------------------------------------------------------------------
// Factory inputs — everything the loop needs, nothing it doesn't.
// ---------------------------------------------------------------------------

export interface LoopDeps {
  /** LLM completion function. Injected so tests pass a canned responder. */
  readonly complete: LoopCompleteFn;
  /** Tools available to the agent. Empty list is legal (answer-only loop). */
  readonly tools: readonly Tool[];
  /**
   * Model identifier recorded in telemetry. The `complete` function is
   * typically already bound to a specific model, so this is a label.
   */
  readonly model: string;
  /** Default: 8. Matches the Settings default from T7. */
  readonly maxSteps?: number;
  /** Default: 8000. Summed across all completions in the run. */
  readonly maxTokens?: number;
  /** Default: 120_000 (120s). Wall-clock from start to terminal step. */
  readonly timeoutMs?: number;
  /** Default: 30_000 per tool call. */
  readonly toolTimeoutMs?: number;
  /** Optional override for the system prompt prefix (before the tool list). */
  readonly systemPrompt?: string;
  /** Override for deterministic IDs in tests. */
  readonly idGen?: () => string;
  /** Override for deterministic time in tests. */
  readonly now?: () => number;
}

export interface RunOptions {
  /**
   * Invoked synchronously with each step as it lands. The loop does
   * not await this callback — renderers can forward to the event bus
   * without backpressuring the loop.
   */
  readonly onStep?: (step: LoopStep) => void;
  /**
   * External cancel signal. If aborted mid-run, the loop terminates
   * at the next check with `status: 'canceled'`.
   */
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Public factory return type
// ---------------------------------------------------------------------------

export interface AgenticLoop {
  run(userText: string, options?: RunOptions): Promise<LoopRun>;
}

// ---------------------------------------------------------------------------
// Default budget constants — imported by T3 (AgenticLoopService) when
// settings haven't been written yet.
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_STEPS = 8;
export const DEFAULT_MAX_TOKENS = 8000;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
