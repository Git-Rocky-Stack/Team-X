/**
 * Together AI adapter for the provider router.
 *
 * Together AI exposes an OpenAI-compatible API, so this adapter uses
 * `@ai-sdk/openai`'s `createOpenAI` with a custom baseURL pointing at
 * `https://api.together.xyz/v1`. This avoids depending on
 * `@ai-sdk/togetherai` which requires a newer `ai` SDK version than
 * we currently run.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

const TOGETHER_BASE_URL = 'https://api.together.xyz/v1';

export interface TogetherAdapterOptions {
  /** Together AI API key. Required. */
  apiKey: string;
  /** Model id, e.g. `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`. */
  model: string;
  /** Optional base URL override. Defaults to Together's official API. */
  baseURL?: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific Together AI model + key.
 */
export function makeTogetherStream(options: TogetherAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/together] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/together] model is required and must be non-empty');
  }

  const provider = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? TOGETHER_BASE_URL,
  });

  return async function* togetherStream({ system, messages, tools, maxSteps, signal }) {
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
