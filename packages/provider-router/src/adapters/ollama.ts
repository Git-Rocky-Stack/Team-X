/**
 * Ollama adapter for the provider router.
 *
 * Wraps the Vercel AI SDK's `streamText` + `ollama-ai-provider` so the
 * orchestrator can drive a local Ollama server through the same
 * `ProviderStreamFn` contract used for cloud providers. Architectural
 * notes match `./anthropic.ts` — see that file's header comment for the
 * full rationale on why all SDK touches live in this layer.
 *
 * Differences vs the Anthropic adapter:
 *
 *   - **No apiKey.** Ollama is local-by-default and uses no
 *     authentication. The `OllamaProviderSettings` type in the SDK
 *     therefore has no `apiKey` field. The construction-time guards
 *     here only validate `model` and (when supplied) the shape of
 *     `headers` / `baseURL`.
 *
 *   - **baseURL almost always wants overriding.** The SDK's default is
 *     `http://localhost:11434/api`, which works for the standard local
 *     install. Production users behind a reverse proxy or running
 *     Ollama on a remote box override it via the providers row's
 *     `config_json.baseUrl`. The provider-factory threads that override
 *     into the `baseURL` field here when present, otherwise omits it
 *     entirely so the SDK default kicks in.
 *
 *   - **Custom headers passthrough.** Some self-hosted Ollama setups
 *     stick a header-based auth shim in front of the API. We forward an
 *     optional `headers` map to give those configurations a clean
 *     escape hatch without leaking provider-specific concerns into the
 *     orchestrator.
 *
 * Streaming + usage protocol:
 *
 *   Identical to the Anthropic adapter — `streamText().textStream` for
 *   deltas, then `await result.usage` for the final
 *   `{ promptTokens, completionTokens }` pair. The Ollama SDK reports
 *   real token counts when the model returns them; otherwise it falls
 *   back to zero (rather than rejecting), which keeps `runAgent`'s
 *   downstream cost-calculation path on the happy line.
 */

import { type CoreMessage, streamText } from 'ai';
import { createOllama } from 'ollama-ai-provider';

import type { ProviderStreamFn } from '../stream.js';

export interface OllamaAdapterOptions {
  /**
   * Ollama chat model id, e.g. `qwen2.5:3b`, `llama3.1:8b`,
   * `gemma2:9b`. Required. Resolved by the provider-factory from
   * `employee.modelPref` or a Phase 1 default before reaching the
   * adapter.
   */
  model: string;

  /**
   * Optional base URL for the Ollama API. Falls through to the SDK
   * default (`http://localhost:11434/api`) when omitted. The desktop
   * providers service stores per-row baseUrl overrides in
   * `providers.config_json` and the factory threads them here.
   */
  baseURL?: string;

  /**
   * Optional custom request headers — useful when fronting Ollama with
   * a header-auth proxy. Forwarded verbatim to `createOllama`.
   */
  headers?: Record<string, string>;
}

/**
 * Build a `ProviderStreamFn` bound to a specific Ollama model and
 * (optional) base URL. The captured provider object reuses HTTP
 * connections across turns; the orchestrator therefore wants to keep
 * the returned function alive across multiple `enqueueChat` calls when
 * the user is talking to the same employee, rather than rebuilding
 * per-turn.
 */
export function makeOllamaStream(options: OllamaAdapterOptions): ProviderStreamFn {
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/ollama] model is required and must be non-empty');
  }

  // Construct the SDK options object lazily — fields the caller did not
  // supply are omitted entirely so the SDK's own defaults take effect.
  const providerOptions: { baseURL?: string; headers?: Record<string, string> } = {};
  if (options.baseURL !== undefined) {
    providerOptions.baseURL = options.baseURL;
  }
  if (options.headers !== undefined) {
    providerOptions.headers = options.headers;
  }
  const provider = createOllama(providerOptions);

  return async function* ollamaStream({ system, messages }) {
    const result = await streamText({
      model: provider(options.model),
      system,
      // Same structural-subset note as the Anthropic adapter — see
      // `./anthropic.ts` for the full rationale.
      messages: messages as CoreMessage[],
    });

    for await (const textDelta of result.textStream) {
      yield { delta: textDelta };
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
