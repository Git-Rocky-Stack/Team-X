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
import { generateTraceId } from '@team-x/shared-types';

import type { AppendMessageInput } from '../db/repos/messages.js';
import type { FinishRunInput, StartRunInput } from '../db/repos/runs.js';

import type { EventBus } from './event-bus.js';
import {
  MAX_PROVIDER_ATTEMPTS,
  PROVIDER_CONNECTION_DROPPED_MESSAGE,
  getProviderRetryBackoffMs,
  isTransientFetchFailure,
} from './transient-errors.js';

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
 *
 * Cache token fields (C3, audit 2026-05-07): when an Anthropic call
 * returns prompt-cache stats, callers thread `cachedInputTokens` and
 * `cacheWriteTokens` through so the cost calc applies the correct
 * per-rate column. Both default to undefined (= zero) for non-cached
 * providers.
 */
export type CostCalculator = (args: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
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
  /** Ticket currently represented by this thread, when the turn is ticket-scoped. */
  currentTicketId?: string | null;
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
   * Abort when the provider goes silent for too long after it has begun
   * streaming. Defaults to 45s and resets on every stream event. The
   * pre-first-token window is guarded by `timeoutMs`, because local model
   * cold starts can be legitimately quiet for longer than the idle window.
   */
  idleTimeoutMs?: number;
}

export interface RunAgentResult {
  runId: string;
  messageId: string;
  /** Fresh (non-cached) input tokens — `usage.input_tokens` upstream. */
  promptTokens: number;
  completionTokens: number;
  /** Cache-read tokens (Anthropic prompt caching). Zero if unsupported. */
  cacheReadTokens: number;
  /** Cache-write tokens (Anthropic prompt caching). Zero if unsupported. */
  cacheWriteTokens: number;
  latencyMs: number;
  costUsd: string;
  /**
   * W3C-format trace ID minted at run start. Always present on success
   * results. Lets the IPC handler thread it to logs / canary metrics
   * without re-reading the runs row. Audit 2026-05-07 H4.
   */
  traceId: string;
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

interface CompletedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function synthesizeToolOnlyReply(toolResults: CompletedToolResult[]): string | null {
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const entry = toolResults[i];
    if (!entry || !isRecord(entry.result) || entry.result.success !== true) continue;

    if (typeof entry.result.message === 'string' && entry.result.message.trim().length > 0) {
      return entry.result.message.trim();
    }

    if (entry.toolName === 'send_message_to_colleague') {
      const recipientName =
        typeof entry.result.recipientName === 'string' &&
        entry.result.recipientName.trim().length > 0
          ? entry.result.recipientName.trim()
          : 'the colleague';
      return `I sent the message to ${recipientName}.`;
    }
  }

  return null;
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
  //
  // H4 (audit 2026-05-07): mint a single traceId for this turn and
  // thread it onto runs.start AND every event emitted below. This is
  // what the dashboard's reconstruction query relies on:
  //     SELECT * FROM events WHERE trace_id = ?
  // joined against the runs row written here.
  const traceId = generateTraceId();
  const runId = deps.runs.start({
    employeeId: input.employeeId,
    provider: input.providerName,
    model: input.model,
    threadId: input.threadId,
    traceId,
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
    traceId,
  });

  const startTime = now();
  let buffer = '';
  let usage: StreamUsage | null = null;
  let toolCallsCount = 0;
  const toolResults: CompletedToolResult[] = [];

  // Retry-loop result. `lastErr === null` means the stream drained
  // successfully on at least one attempt; `lastErr !== null` means we
  // exhausted retries (or hit a non-retryable failure on attempt 1).
  let lastErr: unknown = null;
  let lastAbortKind: 'external' | 'timeout' | 'idle-timeout' | null = null;
  // Tracks whether ANY attempt has yielded at least one chunk. Once
  // true, retry is permanently disabled: re-running the stream would
  // duplicate streamed output to the renderer's open message bubble.
  let chunkSeen = false;

  // 4. Drain the provider stream — with one transparent retry on
  //    pre-stream transient failures (e.g. stale undici keepalive
  //    socket against Ollama's local→cloud proxy). The retry only
  //    fires when no chunks have been received yet, the error is a
  //    recognised transient flake, and the user has not aborted.
  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS; attempt++) {
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

    try {
      // streamAgent normalizes the underlying adapter into the
      // StreamChunk union so this loop is the same for every provider.
      for await (const chunk of streamAgent({
        providerFactory: input.provider,
        system: input.system,
        messages: input.messages,
        tools: input.tools,
        maxSteps: input.maxSteps,
        signal: streamController.signal,
        runId,
        threadId: input.threadId,
        companyId: input.companyId,
        employeeId: input.employeeId,
        currentTicketId: input.currentTicketId ?? null,
      })) {
        chunkSeen = true;
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
            traceId,
          });
        } else if (chunk.kind === 'tool-call') {
          toolCallsCount++;
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
            traceId,
          });
        } else if (chunk.kind === 'tool-result') {
          toolResults.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            result: chunk.result,
          });
        } else if (chunk.kind === 'done') {
          usage = chunk.usage;
        }
      }
      // Stream drained without throwing — clear any prior attempt's
      // captured error and break out of the retry loop.
      lastErr = null;
      lastAbortKind = null;
      break;
    } catch (err) {
      lastErr = err;
      lastAbortKind = abortKind;

      const isAborted =
        abortKind !== null || input.signal?.aborted === true || isAbortError(err);
      const canRetry =
        !isAborted &&
        !chunkSeen &&
        attempt < MAX_PROVIDER_ATTEMPTS - 1 &&
        isTransientFetchFailure(err);

      if (canRetry) {
        // The `finally` below clears timers and removes the abort
        // listener; a fresh AbortController + listener pair is set up
        // at the top of the next iteration.
        //
        // H5 (audit 2026-05-07): backoff duration is now error-aware.
        // Network-layer flakes use the fixed 200 ms (PROVIDER_RETRY_BACKOFF_MS);
        // HTTP 429 uses Retry-After when present, exponential
        // backoff (1s, 2s, 4s, … capped at 30s) otherwise.
        const backoffMs = getProviderRetryBackoffMs(err, attempt);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, backoffMs);
        });
        continue;
      }
      break;
    } finally {
      clearTimers();
      if (input.signal) {
        input.signal.removeEventListener('abort', externalAbortListener);
      }
    }
  }

  if (lastErr !== null) {
    // 5a. Provider failure path. Close the run row with the error,
    //     emit work.failed (NOT work.completed), then re-throw so the
    //     work-queue caller's enqueue Promise rejects.
    const latencyMs = Math.max(0, now() - startTime);
    const timedOut = lastAbortKind === 'timeout' || lastAbortKind === 'idle-timeout';
    const aborted =
      lastAbortKind === 'external' ||
      (!timedOut && (input.signal?.aborted === true || isAbortError(lastErr)));
    const transientExhausted =
      !timedOut && !aborted && !chunkSeen && isTransientFetchFailure(lastErr);
    const message = timedOut
      ? lastAbortKind === 'idle-timeout'
        ? PROVIDER_STALLED_MESSAGE
        : PROVIDER_TIMED_OUT_MESSAGE
      : aborted
        ? 'Run canceled by user'
        : transientExhausted
          ? PROVIDER_CONNECTION_DROPPED_MESSAGE
          : lastErr instanceof Error
            ? lastErr.message
            : String(lastErr);

    if (timedOut) {
      deps.messages.updateContent(
        messageId,
        buildInterruptedReplyContent(
          buffer,
          lastAbortKind === 'idle-timeout' ? 'stalled' : 'timed out',
        ),
      );
    }

    deps.runs.finish(runId, {
      status: aborted ? 'cancelled' : 'error',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs,
      costUsd: '0',
      toolCallsCount,
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
      traceId,
    });
    throw timedOut
      ? new Error(message)
      : transientExhausted
        ? new Error(message, { cause: lastErr })
        : lastErr;
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
      toolCallsCount,
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
      traceId,
    });
    throw new Error(message);
  }

  if (buffer.trim().length === 0) {
    const toolOnlyReply = synthesizeToolOnlyReply(toolResults);
    if (toolOnlyReply !== null && usage !== null) {
      deps.messages.updateContent(messageId, toolOnlyReply);
      const latencyMs = Math.max(0, now() - startTime);
      const cacheReadTokens = usage.cachedInputTokens ?? 0;
      const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
      const costUsd = deps.calcCost({
        provider: input.providerName,
        model: input.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedInputTokens: cacheReadTokens,
        cacheWriteTokens,
      });

      deps.runs.finish(runId, {
        status: 'success',
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        latencyMs,
        costUsd,
        toolCallsCount,
      });

      if (deps.budgetGovernance) {
        void deps.budgetGovernance.recordRunSpend(runId).catch((err) => {
          console.warn('[runAgent] budget recordRunSpend failed:', err);
        });
      }

      deps.bus.emit<WorkCompletedPayload>({
        type: 'work.completed',
        companyId: input.companyId,
        actorId: 'orchestrator',
        actorKind: 'orchestrator',
        payload: {
          threadId: input.threadId,
          messageId,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          latencyMs,
          costUsd: Number(costUsd),
        },
        traceId,
      });

      return {
        runId,
        messageId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        latencyMs,
        costUsd,
        traceId,
      };
    }

    // Tools were executed but the SDK didn't surface result details (e.g.,
    // send_message_to_colleague via Vercel AI SDK's internal tool loop).
    // Treat as success with a generic acknowledgment — the tool side-effects
    // (message sent, event emitted) already happened.
    if (toolCallsCount > 0 && usage !== null) {
      const genericMessage = "Done. I've taken care of that.";
      deps.messages.updateContent(messageId, genericMessage);
      const latencyMs = Math.max(0, now() - startTime);
      const cacheReadTokens = usage.cachedInputTokens ?? 0;
      const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
      const costUsd = deps.calcCost({
        provider: input.providerName,
        model: input.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedInputTokens: cacheReadTokens,
        cacheWriteTokens,
      });

      deps.runs.finish(runId, {
        status: 'success',
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        latencyMs,
        costUsd,
        toolCallsCount,
      });

      if (deps.budgetGovernance) {
        void deps.budgetGovernance.recordRunSpend(runId).catch((err) => {
          console.warn('[runAgent] budget recordRunSpend failed:', err);
        });
      }

      deps.bus.emit<WorkCompletedPayload>({
        type: 'work.completed',
        companyId: input.companyId,
        actorId: 'orchestrator',
        actorKind: 'orchestrator',
        payload: {
          threadId: input.threadId,
          messageId,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          latencyMs,
          costUsd: Number(costUsd),
        },
        traceId,
      });

      return {
        runId,
        messageId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        latencyMs,
        costUsd,
        traceId,
      };
    }

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
      toolCallsCount,
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
      traceId,
    });
    throw new Error(message);
  }

  const latencyMs = Math.max(0, now() - startTime);
  const cacheReadTokens = usage.cachedInputTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const costUsd = deps.calcCost({
    provider: input.providerName,
    model: input.model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cachedInputTokens: cacheReadTokens,
    cacheWriteTokens,
  });

  deps.runs.finish(runId, {
    status: 'success',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    latencyMs,
    costUsd,
    toolCallsCount,
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
    traceId,
  });

  return {
    runId,
    messageId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    latencyMs,
    costUsd,
    traceId,
  };
}
