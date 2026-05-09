/**
 * Agentic loop — pure type surface.
 *
 * The loop is a provider-agnostic ReAct orchestrator: it consumes a
 * completion function (text + native tool-calls in / text + native tool-calls
 * out + usage), a zod-validated tool registry, and budget caps, and emits a
 * typed stream of `LoopStep` values until it reaches an answer or exhausts
 * its budget.
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
 *   - Wire format is native function-calling, not hand-rolled JSON. The
 *     loop never parses JSON out of assistant text — providers surface
 *     tool calls as structured events through `LoopProviderCompletion.toolCalls`
 *     and the loop dispatches them through the registry.
 *
 * Phase 5 — M31 — T1. Native tool-use migration: C2 (audit 2026-05-07).
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
  /**
   * W3C-format trace ID propagated from `LoopDeps.traceId`. Set iff the
   * orchestrator supplied one — the loop never generates its own. Lets
   * the orchestrator correlate `loop.run()` output with the `runs.start`
   * row it opened before invoking the loop. Audit 2026-05-07 H4.
   */
  readonly traceId?: string;
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

export interface Tool<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<TArgs>;
  execute(args: TArgs, ctx: ToolContext): Promise<TResult>;
}

// ---------------------------------------------------------------------------
// Provider contract — native function-calling.
//
// The loop hands the provider the system prompt, the structured chat transcript,
// and the tool descriptors; the provider returns the assistant's text + any
// tool-calls it wants to issue this turn. The loop dispatches each tool call
// through its zod-validated registry, appends a tool-result message, and asks
// the provider for the next turn — repeating until the provider returns a turn
// with no tool-calls (final answer) or a budget is exhausted.
//
// The provider never executes tools. It only emits tool-call events. This
// keeps budget enforcement, observation fencing, and typed failure modes in
// one place (the loop). C2 — native tool-use migration (audit 2026-05-07).
// ---------------------------------------------------------------------------

/**
 * A single tool call the provider emits in one turn. Mirrors the Vercel
 * AI SDK's `tool-call` part shape so adapters can pass it through with
 * zero translation.
 */
export interface LoopProviderToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
}

/**
 * Tool descriptor the loop hands to the provider on every completion call.
 * The provider serializes these to its native function-calling format
 * (Anthropic `tools`, OpenAI `tools`, etc.). JSON Schema is the lingua franca.
 */
export interface LoopProviderToolDescriptor {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the tool's argument object. */
  readonly jsonSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Structured chat transcript.
//
// The loop maintains a CoreMessage-shaped history so a multi-turn tool
// conversation round-trips cleanly to the provider. Each turn the model
// emits a tool-call assistant message; the loop appends a tool-result
// `tool` message; the provider's next call has the proper structure to
// honor the model's prior commitments.
// ---------------------------------------------------------------------------

export interface LoopMessageTextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface LoopMessageToolCallPart {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
}

export interface LoopMessageToolResultPart {
  readonly type: 'tool-result';
  readonly toolCallId: string;
  readonly toolName: string;
  /**
   * Pre-fenced, escape-cleaned string content. The loop wraps every tool
   * result in `<observation tool="…" trust="tool_output">…</observation>`
   * with `escapeFencedCloseTags` applied, so the wrapper / provider can
   * pass the value through unchanged.
   */
  readonly result: string;
}

export type LoopMessageContentPart =
  | LoopMessageTextPart
  | LoopMessageToolCallPart
  | LoopMessageToolResultPart;

/**
 * Structured chat history element.
 *
 * - `user` messages are always plain strings (the original prompt).
 * - `assistant` messages can be a plain text final answer OR an array of
 *   `text` + `tool-call` parts when the model issued tool calls.
 * - `tool` messages carry one or more `tool-result` parts answering the
 *   immediately preceding assistant tool-call message.
 *
 * The wrapper translates this to Vercel AI SDK `CoreMessage` shape at the
 * provider boundary; tests that need a simple text history can pass
 * `{ role: 'user', content: '...' }` exactly as before.
 */
export type LoopMessage =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string | ReadonlyArray<LoopMessageTextPart | LoopMessageToolCallPart>;
    }
  | {
      readonly role: 'tool';
      readonly content: ReadonlyArray<LoopMessageToolResultPart>;
    };

export type LoopMessageRole = LoopMessage['role'];

export interface LoopProviderUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LoopProviderCompletion {
  /**
   * Pre-tool-call assistant text. May be empty when the model called a tool
   * without preamble. When `toolCalls.length === 0`, `text` is the final
   * answer and the loop terminates.
   */
  readonly text: string;
  /**
   * Native tool-calls the provider emitted this turn. When non-empty, the
   * loop dispatches each through the zod-validated registry in order, then
   * issues another completion call with the tool-result messages appended.
   * When empty, the loop treats `text` as the final answer.
   */
  readonly toolCalls: readonly LoopProviderToolCall[];
  readonly usage: LoopProviderUsage;
  readonly provider: string;
  readonly model: string;
  /** Cost attribution for this single completion. Zero is acceptable for local providers. */
  readonly costUsd: number;
}

export interface LoopCompleteRequest {
  readonly system: string;
  readonly messages: readonly LoopMessage[];
  /**
   * Tool descriptors the provider should expose to the model via native
   * function-calling. Empty array is legal — the provider must still produce
   * a final-answer text turn.
   */
  readonly tools: readonly LoopProviderToolDescriptor[];
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
  /**
   * W3C-format trace ID supplied by the orchestrator that constructed
   * this loop. The loop carries it through onto `LoopRun.traceId` so the
   * orchestrator can correlate `runs.finish` with the run row it opened.
   * The loop itself does NOT generate trace IDs — that's the orchestrator's
   * job (one trace per logical request). Audit 2026-05-07 H4.
   */
  readonly traceId?: string;
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
