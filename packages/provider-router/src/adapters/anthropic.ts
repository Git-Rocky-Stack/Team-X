/**
 * Anthropic adapter for the provider router.
 *
 * Wraps the Vercel AI SDK's `streamText` + `@ai-sdk/anthropic` so the
 * rest of Team-X consumes one normalized contract — `ProviderStreamFn` —
 * regardless of which LLM is on the other end. The shape returned by
 * this factory is identical to the Ollama adapter, so the orchestrator
 * can swap providers per turn without any conditional logic.
 *
 * Why this lives inside `provider-router`:
 *
 *   The Phase 1 architectural invariants pin the provider router as the
 *   single layer that touches LLM SDKs (CLAUDE.md, invariant #5). The
 *   desktop main process pulls API keys out of the OS keychain via the
 *   `provider-factory` service (T32), then constructs an instance of
 *   this adapter and hands the resulting `ProviderStreamFn` to the
 *   orchestrator. Nothing else in the codebase imports `@ai-sdk/anthropic`
 *   directly.
 *
 * Streaming + usage protocol:
 *
 *   Vercel's `StreamTextResult` exposes `textStream` (an
 *   `AsyncIterableStream<string>` of text deltas) and `usage`
 *   (a `Promise<LanguageModelUsage>` that resolves once the underlying
 *   stream terminates). The contract for `ProviderStreamFn` is to yield
 *   each delta as `{ delta }` and then a single terminal
 *   `{ done: true, usage }` chunk. We achieve that by:
 *
 *     1. Awaiting `streamText(...)` to obtain the result handle. This
 *        is the call that performs the HTTP handshake — auth errors and
 *        404s surface here as a Promise rejection, not mid-stream.
 *     2. Iterating `result.fullStream` with `for await`. Each iteration
 *        yields a typed event (`text-delta`, `tool-call`, etc.).
 *        Mid-stream errors (network drops, rate-limit truncation)
 *        propagate as a thrown value out of the loop, which becomes a
 *        rejection on the consumer's `next()`.
 *     3. Awaiting `result.usage` AFTER the stream loop terminates.
 *        Vercel guarantees the usage promise resolves shortly after the
 *        last delta — never before. Awaiting earlier would deadlock.
 *     4. Awaiting `result.experimental_providerMetadata` to surface
 *        Anthropic's prompt-caching token counts (cache read + write)
 *        when `cacheControl` is enabled. Both are folded into the
 *        terminal `{ done: true, usage }` chunk so the orchestrator's
 *        cost calculator sees them inline with the other token counts.
 *
 *   The Anthropic provider always reports `promptTokens` /
 *   `completionTokens` so we never need to special-case missing usage.
 *
 * Prompt caching (C3 — audit 2026-05-07):
 *
 *   Caching is enabled by default — `cacheControl: true` flips the
 *   `anthropic-beta: prompt-caching-2024-07-31` header on the SDK and
 *   surfaces `cache_creation_input_tokens` / `cache_read_input_tokens`
 *   in the response. It can be disabled via `enablePromptCache: false`
 *   for the Phase 1 default (chat without tools) where the cache hit
 *   rate is too low to be worth the per-iteration overhead, but the
 *   agentic loop wants this on every iteration.
 *
 *   The system prompt is marked cacheable by injecting it into the
 *   `messages` array as a `{ role: 'system', content, experimental_providerMetadata }`
 *   message instead of using the bare `system` string parameter — the
 *   SDK only honors `providerMetadata` on message-shaped values. Tool
 *   definitions are NOT directly markable in this SDK version, but
 *   Anthropic caches everything from the start of the prompt up to the
 *   marker — so the system marker effectively also caches the system
 *   prompt itself, and tool defs sit just after it and benefit from
 *   the same prefix on subsequent identical-tool turns (Anthropic
 *   automatically caches tools alongside the system prompt when a
 *   marker is present).
 *
 * Construction-time guards:
 *
 *   `apiKey` and `model` are validated synchronously inside
 *   `makeAnthropicStream` rather than lazily inside the generator.
 *   The orchestrator builds the bound `ProviderStreamFn` once per turn
 *   and we want misconfiguration to surface immediately (so the run row
 *   is never opened with a doomed provider) rather than after a token
 *   has already been streamed back to the user.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface AnthropicAdapterOptions {
  /**
   * Anthropic API key.
   *
   * Required. The live adapter intentionally never falls back to the
   * `ANTHROPIC_API_KEY` environment variable: keys live in the OS
   * keychain (T24, `SecretsStore`) and are passed in by the desktop's
   * `provider-factory` service. A missing key here is a programming bug
   * we want to surface during construction, not silently inherit from
   * ambient process state.
   */
  apiKey: string;

  /**
   * Anthropic model id, e.g. `claude-haiku-4-5`, `claude-sonnet-4-6`,
   * `claude-opus-4-6`. Resolved by the provider-factory from
   * `employee.modelPref` or a tier-mapped Phase 1 default before
   * reaching the adapter.
   */
  model: string;

  /**
   * Optional URL prefix override for proxy / gateway deployments. Falls
   * through to the SDK default (`https://api.anthropic.com/v1`) when
   * omitted. The desktop providers service stores per-row baseUrl
   * overrides in `providers.config_json` and the factory threads them
   * here.
   */
  baseURL?: string;

  /**
   * Enable Anthropic prompt caching (C3 — audit 2026-05-07).
   *
   * Defaults to `true`. When on, the SDK adds the
   * `anthropic-beta: prompt-caching-2024-07-31` header, the system
   * prompt is marked cacheable via `providerMetadata`, and the
   * adapter surfaces cache-read / cache-write token counts in the
   * terminal usage event.
   *
   * The agentic loop and the chat path both want this on by default —
   * any prefix repeated within ~5 minutes drops to ~10% of its
   * uncached input cost. Set to `false` only in tests or for narrow
   * one-shot flows where the per-iteration overhead is unwanted.
   */
  enablePromptCache?: boolean;
}

const ANTHROPIC_CACHE_CONTROL_EPHEMERAL = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
};

/**
 * Build a `ProviderStreamFn` bound to a specific Anthropic model + key.
 *
 * Returns a thin async generator the orchestrator can drive via
 * `streamAgent`. The provider object created by `createAnthropic` is
 * captured in a closure so each invocation of the returned function
 * reuses the same auth context — only the per-turn `system` and
 * `messages` differ.
 */
export function makeAnthropicStream(options: AnthropicAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/anthropic] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/anthropic] model is required and must be non-empty');
  }

  // Build the SDK options object with the optional baseURL omitted when
  // not supplied — `exactOptionalPropertyTypes` is off in this workspace
  // but we still prefer the cleaner shape so the createAnthropic call
  // matches what a hand-written client would write.
  const providerOptions: { apiKey: string; baseURL?: string } = { apiKey: options.apiKey };
  if (options.baseURL !== undefined) {
    providerOptions.baseURL = options.baseURL;
  }
  const provider = createAnthropic(providerOptions);

  const cacheEnabled = options.enablePromptCache !== false;

  return async function* anthropicStream({ system, messages, tools, maxSteps, signal }) {
    // When caching is enabled we hoist the system string into the
    // `messages` array as a system-role message with cacheControl
    // metadata. The SDK only honors `providerMetadata` on message-
    // shaped values; the bare `system` parameter is sent without it
    // and would not be cached. When caching is disabled we keep using
    // the simpler `system` string so the request shape stays minimal.
    const streamArgs: Parameters<typeof streamText>[0] = {
      model: provider(options.model, { cacheControl: cacheEnabled }),
      abortSignal: signal,
      ...(tools && Object.keys(tools).length > 0
        ? { tools: tools as Record<string, CoreTool>, maxSteps: maxSteps ?? 1 }
        : {}),
    };

    if (cacheEnabled) {
      const cachedSystemMessage: CoreMessage = {
        role: 'system',
        content: system,
        experimental_providerMetadata: ANTHROPIC_CACHE_CONTROL_EPHEMERAL,
      };
      streamArgs.messages = [cachedSystemMessage, ...(messages as CoreMessage[])];
    } else {
      streamArgs.system = system;
      streamArgs.messages = messages as CoreMessage[];
    }

    const result = await streamText(streamArgs);

    // When tools are present we use fullStream to surface tool-call
    // and tool-result events alongside text deltas. When no tools are
    // configured, fullStream still works identically to the old
    // textStream-only path — text-delta events are the only ones that
    // fire.
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield { delta: part.textDelta };
          break;
        case 'tool-call':
          yield {
            toolCall: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args as Record<string, unknown>,
            },
          };
          break;
        // tool execution + results are handled automatically by the SDK
        // via the execute callbacks wired into each tool definition.
        // step-finish, finish, error — handled below via result.usage
      }
    }

    const usage = await result.usage;

    // C3: Anthropic surfaces cache stats via `experimental_providerMetadata`.
    // The shape is `{ anthropic: { cacheCreationInputTokens, cacheReadInputTokens } }`
    // when `cacheControl: true` was set on the model, else `undefined`.
    // We forward both as optional fields on the terminal usage event so
    // the orchestrator's `calcCostUsd` wrapper can attribute them to the
    // correct rate columns. Null and undefined alike collapse to omit so
    // downstream callers can rely on `cachedInputTokens === undefined`
    // meaning "no caching info".
    let cachedInputTokens: number | undefined;
    let cacheWriteTokens: number | undefined;
    if (cacheEnabled) {
      const meta = (await result.experimental_providerMetadata) as
        | {
            anthropic?: {
              cacheCreationInputTokens?: number | null;
              cacheReadInputTokens?: number | null;
            };
          }
        | undefined;
      const anth = meta?.anthropic;
      if (anth) {
        if (typeof anth.cacheReadInputTokens === 'number') {
          cachedInputTokens = anth.cacheReadInputTokens;
        }
        if (typeof anth.cacheCreationInputTokens === 'number') {
          cacheWriteTokens = anth.cacheCreationInputTokens;
        }
      }
    }

    yield {
      done: true,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
        ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
      },
    };
  };
}
