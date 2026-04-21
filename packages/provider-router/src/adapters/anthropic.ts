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
 *     2. Iterating `result.textStream` with `for await`. Each iteration
 *        yields one text delta. Mid-stream errors (network drops,
 *        rate-limit truncation) propagate as a thrown value out of the
 *        loop, which becomes a rejection on the consumer's `next()`.
 *     3. Awaiting `result.usage` AFTER the textStream loop terminates.
 *        Vercel guarantees the usage promise resolves shortly after the
 *        last delta — never before. Awaiting earlier would deadlock.
 *
 *   The Anthropic provider always reports `promptTokens` /
 *   `completionTokens` so we never need to special-case missing usage.
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
}

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

  return async function* anthropicStream({ system, messages, tools, maxSteps, signal }) {
    const result = await streamText({
      model: provider(options.model),
      system,
      messages: messages as CoreMessage[],
      abortSignal: signal,
      ...(tools && Object.keys(tools).length > 0
        ? { tools: tools as Record<string, CoreTool>, maxSteps: maxSteps ?? 1 }
        : {}),
    });

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
    yield {
      done: true,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    };
  };
}
