/**
 * runAgent — orchestrate one full agent turn end-to-end.
 *
 * This is the smallest unit the work queue dispatches. Given a system
 * prompt, a chat history, and a provider stream factory, it:
 *
 *   1. Opens a runs row (status='running') for telemetry.
 *   2. Appends an empty assistant message to the thread so the renderer
 *      has a stable id to attach streaming tokens to.
 *   3. Emits `work.started` so dashboards know which provider/model is
 *      handling this turn.
 *   4. Drains the provider stream:
 *        - Each `delta` chunk → append to a local buffer, overwrite the
 *          message row content via `messages.updateContent`, emit a
 *          `token.delta` event so the renderer can grow the bubble in
 *          real time.
 *        - The terminal `done` chunk carries usage (prompt + completion
 *          tokens). We capture both for the runs row and the
 *          work.completed event.
 *   5. Closes the runs row with success + latency + cost.
 *   6. Emits `work.completed` carrying the final telemetry.
 *
 * On any error from the provider stream:
 *   - The runs row is closed with status='error' and the error string.
 *   - A `work.failed` event is emitted.
 *   - The error is re-thrown so the work-queue's enqueue Promise rejects
 *     and callers can react (retry, surface, etc.).
 *
 * Architectural intent:
 *
 * runAgent is intentionally a *function*, not a class. It owns no state
 * across calls, takes everything it needs as injected dependencies, and
 * is composable inside the work queue. The orchestrator facade in T31
 * is what wires the real DB, real bus, real provider router, and
 * scheduling — runAgent stays a pure step that's trivially testable
 * with a fake provider.
 *
 * No disk I/O, no role-pack loading, no template rendering inside this
 * function. The system prompt arrives pre-rendered. Loading and
 * rendering live one layer up so swapping a role mid-conversation is a
 * matter of re-running the renderer rather than passing a different
 * argument to a deeply-nested helper.
 *
 * The `runs.costUsd` column is a decimal STRING (see schema.ts comment).
 * The injected `calcCost` returns a string so this function never
 * touches `Number → String` formatting and never risks float drift on
 * sub-cent values.
 */

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import { streamAgent } from '@team-x/provider-router';
import type {
  TokenDeltaPayload,
  ToolCalledPayload,
  WorkCompletedPayload,
  WorkStartedPayload,
} from '@team-x/shared-types';

import type { AppendMessageInput } from '../db/repos/messages.js';
import type { FinishRunInput, StartRunInput } from '../db/repos/runs.js';
import type { EventBus } from './event-bus.js';

/**
 * Minimal structural shape runAgent needs from the messages repo. The
 * real `createMessagesRepo` is generic over the SQLite driver — we hand
 * roll the interface to keep this module decoupled from drizzle types
 * AND to make fakes trivial.
 */
export interface MessagesRepoLike {
  append(input: AppendMessageInput): string;
  updateContent(id: string, content: string): void;
}

export interface RunsRepoLike {
  start(input: StartRunInput): string;
  finish(id: string, input: FinishRunInput): void;
}

/**
 * Cost calculator. Returns a decimal string ready to drop into the
 * `runs.costUsd` column. Receives the model id + token counts; provider
 * id is supplied separately for callers that route by both. The real
 * implementation in T31 wraps `@team-x/telemetry-core`'s `calcCostUsd`,
 * which returns `{ usd: number, … }` — the wrapper formats the number
 * to a string at the boundary so all internal storage stays decimal.
 */
export type CostCalculator = (args: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) => string;

export interface RunAgentDeps {
  bus: EventBus;
  messages: MessagesRepoLike;
  runs: RunsRepoLike;
  budgetGovernance?: {
    recordRunSpend(runId: string): Promise<void>;
  };
  calcCost: CostCalculator;
  /**
   * Optional clock injection for deterministic latency measurement
   * inside tests. Defaults to `Date.now`.
   */
  now?: () => number;
}

export interface RunAgentInput {
  companyId: string;
  threadId: string;
  employeeId: string;
  /**
   * Pre-rendered system prompt. Template variables (`{{company.name}}`,
   * etc.) are already substituted before this function sees them. The
   * orchestrator facade in T31 owns the render step.
   */
  system: string;
  /**
   * Chat history sent to the provider. The new assistant turn is NOT in
   * this list — runAgent creates it via `messages.append` and streams
   * into it via `messages.updateContent`.
   */
  messages: StreamMessage[];
  /**
   * Provider stream factory — fake in tests, real (anthropic / ollama /
   * etc.) in production.
   */
  provider: ProviderStreamFn;
  /** Provider id for telemetry — e.g. "anthropic", "ollama-local". */
  providerName: string;
  /** Model id for telemetry + cost lookup — e.g. "claude-sonnet-4-6". */
  model: string;
  /**
   * AI SDK tools (pre-built via `buildProviderTools`). When present,
   * the provider adapter passes them to `streamText({ tools })` and
   * the model can invoke them during the turn. Tool execution happens
   * inside the `execute` callbacks which the caller wires to McpHost.
   */
  tools?: Record<string, unknown>;
  /** Max reasoning steps with tool use. Defaults to 1 (no tool loop). */
  maxSteps?: number;
  /**
   * Called with the `runId` immediately after the runs row is created.
   * The orchestrator uses this to thread the runId into tool execute
   * callbacks that were built before `runAgent` was invoked.
   */
  onRunCreated?: (runId: string) => void;
  /** Optional cancellation signal for user-triggered stop / shutdown flows. */
  signal?: AbortSignal;
  /**
   * Wall-clock cap for one turn. Defaults to 120s so a wedged provider
   * cannot leave the chat UI spinning forever.
   */
  timeoutMs?: number;
  /**
   * Abort when the provider goes silent for too long mid-turn. Defaults
   * to 45s and resets on every stream event.
   */
  idleTimeoutMs?: number;
}

export interface RunAgentResult {
  runId: string;
  messageId: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: string;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (err instanceof Error) {
    return err.name === 'AbortError' || /aborted|canceled/i.test(err.message);
  }
  return false;
}

const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const DEFAULT_RUN_IDLE_TIMEOUT_MS = 45_000;
const PROVIDER_TIMED_OUT_MESSAGE = 'provider timed out before completing reply';
const PROVIDER_STALLED_MESSAGE = 'provider stream stalled before completing reply';

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.round(value));
}

function buildInterruptedReplyContent(buffer: string, reason: 'stalled' | 'timed out'): string {
  const trimmed = buffer.trimEnd();
  const notice =
    reason === 'stalled'
      ? "I couldn't finish that reply because the provider stalled. Please retry."
      : "I couldn't finish that reply because the provider timed out. Please retry.";

  if (trimmed.length > 0) {
    return `${trimmed}\n\n${notice}`;
  }

  return reason === 'stalled'
    ? "I couldn't complete that reply because the provider stalled."
    : "I couldn't complete that reply because the provider timed out.";
}

export async function runAgent(deps: RunAgentDeps, input: RunAgentInput): Promise<RunAgentResult> {
  const now = deps.now ?? Date.now;
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs, DEFAULT_RUN_TIMEOUT_MS);
  const idleTimeoutMs = normalizeTimeoutMs(
    input.idleTimeoutMs,
    Math.min(DEFAULT_RUN_IDLE_TIMEOUT_MS, timeoutMs),
  );

  // 1. Open the run row first. If telemetry persistence fails the
  //    caller learns about it before any provider call burns tokens.
  const runId = deps.runs.start({
    employeeId: input.employeeId,
    provider: input.providerName,
    model: input.model,
    threadId: input.threadId,
  });

  // Thread runId to tool execute callbacks built before this function.
  if (input.onRunCreated) {
    input.onRunCreated(runId);
  }

  // 2. Append the empty assistant message. Authored by the employee
  //    (not 'system' or 'user') — see entities.ts AuthorKind narrow.
  const messageId = deps.messages.append({
    threadId: input.threadId,
    authorId: input.employeeId,
    authorKind: 'employee',
    content: '',
  });

  // 3. Announce the work-in-progress on the bus. The forwarder
  //    subscriber (T36) will hand this to the renderer for the
  //    "thinking" status pill.
  const startedPayload: WorkStartedPayload = {
    threadId: input.threadId,
    employeeId: input.employeeId,
    provider: input.providerName,
    model: input.model,
  };
  deps.bus.emit<WorkStartedPayload>({
    type: 'work.started',
    companyId: input.companyId,
    actorId: 'orchestrator',
    actorKind: 'orchestrator',
    payload: startedPayload,
  });

  const startTime = now();
  let buffer = '';
  let usage: StreamUsage | null = null;
  let abortKind: 'external' | 'timeout' | 'idle-timeout' | null = null;
  const streamController = new AbortController();

  const abortWithKind = (kind: 'external' | 'timeout' | 'idle-timeout') => {
    if (streamController.signal.aborted) return;
    abortKind = kind;
    streamController.abort();
  };

  const externalAbortListener = () => {
    abortWithKind('external');
  };
  if (input.signal) {
    if (input.signal.aborted) {
      abortWithKind('external');
    } else {
      input.signal.addEventListener('abort', externalAbortListener, { once: true });
    }
  }

  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearTimers = () => {
    if (totalTimer !== null) {
      clearTimeout(totalTimer);
      totalTimer = null;
    }
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const resetIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      abortWithKind('idle-timeout');
    }, idleTimeoutMs);
  };

  totalTimer = setTimeout(() => {
    abortWithKind('timeout');
  }, timeoutMs);
  resetIdleTimer();

  try {
    // 4. Drain the provider stream. `streamAgent` normalizes the
    //    underlying adapter into the StreamChunk union so this loop
    //    is the same for every provider.
    for await (const chunk of streamAgent({
      providerFactory: input.provider,
      system: input.system,
      messages: input.messages,
      tools: input.tools,
      maxSteps: input.maxSteps,
      signal: streamController.signal,
    })) {
      resetIdleTimer();
      if (chunk.kind === 'delta') {
        buffer += chunk.delta;
        deps.messages.updateContent(messageId, buffer);

        const deltaPayload: TokenDeltaPayload = {
          threadId: input.threadId,
          messageId,
          delta: chunk.delta,
        };
        deps.bus.emit<TokenDeltaPayload>({
          type: 'token.delta',
          companyId: input.companyId,
          actorId: input.employeeId,
          actorKind: 'employee',
          payload: deltaPayload,
        });
      } else if (chunk.kind === 'tool-call') {
        const toolCalledPayload: ToolCalledPayload = {
          threadId: input.threadId,
          messageId,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
        };
        deps.bus.emit<ToolCalledPayload>({
          type: 'tool.called',
          companyId: input.companyId,
          actorId: input.employeeId,
          actorKind: 'employee',
          payload: toolCalledPayload,
        });
      } else if (chunk.kind === 'done') {
        usage = chunk.usage;
      }
    }
  } catch (err) {
    // 5a. Provider failure path. Close the run row with the error,
    //     emit work.failed (NOT work.completed), then re-throw so the
    //     work-queue caller's enqueue Promise rejects.
    const latencyMs = Math.max(0, now() - startTime);
    const timedOut = abortKind === 'timeout' || abortKind === 'idle-timeout';
    const aborted =
      abortKind === 'external' ||
      (!timedOut && (input.signal?.aborted === true || isAbortError(err)));
    const message = timedOut
      ? abortKind === 'idle-timeout'
        ? PROVIDER_STALLED_MESSAGE
        : PROVIDER_TIMED_OUT_MESSAGE
      : aborted
        ? 'Run canceled by user'
        : err instanceof Error
          ? err.message
          : String(err);

    if (timedOut) {
      deps.messages.updateContent(
        messageId,
        buildInterruptedReplyContent(
          buffer,
          abortKind === 'idle-timeout' ? 'stalled' : 'timed out',
        ),
      );
    }

    deps.runs.finish(runId, {
      status: aborted ? 'cancelled' : 'error',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs,
      costUsd: '0',
      error: message,
    });
    deps.bus.emit({
      type: 'work.failed',
      companyId: input.companyId,
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: {
        threadId: input.threadId,
        employeeId: input.employeeId,
        messageId,
        error: message,
      },
    });
    throw timedOut ? new Error(message) : err;
  } finally {
    clearTimers();
    if (input.signal) {
      input.signal.removeEventListener('abort', externalAbortListener);
    }
  }

  // 5b. Success path. A provider that closes the stream without ever
  //     emitting a `done` chunk is a contract violation — surface it
  //     loudly via the same error path so telemetry stays consistent.
  if (usage === null) {
    const latencyMs = Math.max(0, now() - startTime);
    const message = 'provider stream ended without a usage record';
    deps.runs.finish(runId, {
      status: 'error',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs,
      costUsd: '0',
      error: message,
    });
    deps.bus.emit({
      type: 'work.failed',
      companyId: input.companyId,
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: {
        threadId: input.threadId,
        employeeId: input.employeeId,
        messageId,
        error: message,
      },
    });
    throw new Error(message);
  }

  if (buffer.trim().length === 0) {
    const latencyMs = Math.max(0, now() - startTime);
    const message = 'provider stream completed without assistant text';
    deps.messages.updateContent(
      messageId,
      "I couldn't complete that reply. Provider returned no assistant text.",
    );
    deps.runs.finish(runId, {
      status: 'error',
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs,
      costUsd: '0',
      error: message,
    });
    deps.bus.emit({
      type: 'work.failed',
      companyId: input.companyId,
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: {
        threadId: input.threadId,
        employeeId: input.employeeId,
        messageId,
        error: message,
      },
    });
    throw new Error(message);
  }

  const latencyMs = Math.max(0, now() - startTime);
  const costUsd = deps.calcCost({
    provider: input.providerName,
    model: input.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });

  deps.runs.finish(runId, {
    status: 'success',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
    costUsd,
  });

  if (deps.budgetGovernance) {
    void deps.budgetGovernance.recordRunSpend(runId).catch((err) => {
      console.warn('[runAgent] budget recordRunSpend failed:', err);
    });
  }

  // 6. Final completion event with the full telemetry payload. The
  //    `costUsd` field on `WorkCompletedPayload` is a number (matches
  //    DashboardEvent dispatch shape); we keep the string copy on the
  //    runs row for sub-cent precision in the DB.
  const completedPayload: WorkCompletedPayload = {
    threadId: input.threadId,
    messageId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
    costUsd: Number(costUsd),
  };
  deps.bus.emit<WorkCompletedPayload>({
    type: 'work.completed',
    companyId: input.companyId,
    actorId: 'orchestrator',
    actorKind: 'orchestrator',
    payload: completedPayload,
  });

  return {
    runId,
    messageId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
    costUsd,
  };
}
