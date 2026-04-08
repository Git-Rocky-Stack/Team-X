/**
 * Ollama adapter for the provider router.
 *
 * Phase 1 status: STUB. See `./anthropic.ts` for the rationale. The live
 * implementation lands in Task 32, when it's wired into the orchestrator and
 * the smoke-chat script (Task 35) verifies it against a real local Ollama.
 */

import type { ProviderStreamFn } from '../stream.js';

export interface OllamaAdapterOptions {
  baseUrl?: string;
  model: string;
}

export function makeOllamaStream(_options: OllamaAdapterOptions): ProviderStreamFn {
  // biome-ignore lint/correctness/useYield: Phase 1 stub throws before any token is produced; replaced with a real `ollama-ai-provider` adapter in Task 32.
  return async function* (_args) {
    throw new Error(
      '[provider-router] Ollama adapter is a Phase 1 stub — wire up the live SDK in Task 32.',
    );
  };
}
