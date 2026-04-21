/**
 * Google Gemini adapter for the provider router.
 *
 * Wraps `@ai-sdk/google` via `streamText`. Pattern mirrors
 * `./anthropic.ts` — see that file for the full streaming protocol
 * rationale.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface GoogleAdapterOptions {
  /** Google AI API key. Required. */
  apiKey: string;
  /** Model id, e.g. `gemini-2.0-flash`, `gemini-1.5-pro`. */
  model: string;
  /** Optional base URL override. */
  baseURL?: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific Google model + key.
 */
export function makeGoogleStream(options: GoogleAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/google] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/google] model is required and must be non-empty');
  }

  const providerOptions: { apiKey: string; baseURL?: string } = { apiKey: options.apiKey };
  if (options.baseURL !== undefined) {
    providerOptions.baseURL = options.baseURL;
  }
  const provider = createGoogleGenerativeAI(providerOptions);

  return async function* googleStream({ system, messages, tools, maxSteps, signal }) {
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
