/**
 * Anthropic adapter for the provider router.
 *
 * Phase 1 status: STUB. The shape conforms to `ProviderStreamFn` so the
 * orchestrator can be wired up against it, but the live network call is
 * intentionally deferred to Task 32 (`Real Anthropic + Ollama adapters via
 * Vercel AI SDK`) where the orchestrator + keytar + provider-factory are
 * stitched together end-to-end.
 *
 * The stub throws on use so we never silently make a fake network call. To
 * exercise this path manually before Task 32, replace the throw with the
 * `streamText({ model: anthropic(model), ... })` invocation from `ai` /
 * `@ai-sdk/anthropic` and provide an apiKey.
 */

import type { ProviderStreamFn } from '../stream.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
}

export function makeAnthropicStream(_options: AnthropicAdapterOptions): ProviderStreamFn {
  // biome-ignore lint/correctness/useYield: Phase 1 stub throws before any token is produced; replaced with a real `streamText({ model: anthropic(...) })` adapter in Task 32.
  return async function* (_args) {
    throw new Error(
      '[provider-router] Anthropic adapter is a Phase 1 stub — wire up the live SDK in Task 32.',
    );
  };
}
