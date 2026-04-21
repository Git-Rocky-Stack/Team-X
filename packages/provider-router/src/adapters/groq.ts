/**
 * Groq adapter for the provider router.
 *
 * Wraps `@ai-sdk/groq` via `streamText`. Pattern mirrors
 * `./anthropic.ts` — see that file for the full streaming protocol
 * rationale.
 */

import { createGroq } from '@ai-sdk/groq';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface GroqAdapterOptions {
  /** Groq API key. Required. */
  apiKey: string;
  /** Model id, e.g. `llama-3.1-8b-instant`, `mixtral-8x7b-32768`. */
  model: string;
  /** Optional base URL override. */
  baseURL?: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific Groq model + key.
 */
export function makeGroqStream(options: GroqAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/groq] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/groq] model is required and must be non-empty');
  }

  const providerOptions: { apiKey: string; baseURL?: string } = { apiKey: options.apiKey };
  if (options.baseURL !== undefined) {
    providerOptions.baseURL = options.baseURL;
  }
  const provider = createGroq(providerOptions);

  return async function* groqStream({ system, messages, tools, maxSteps, signal }) {
    const result = await streamText({
      model: provider(options.model),
      system,
      messages: messages as CoreMessage[],
      abortSignal: signal,
      ...(tools && Object.keys(tools).length > 0
        ? { tools: tools as Record<string, CoreTool>, maxSteps: maxSteps ?? 1 }
        : {}),
    });

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
