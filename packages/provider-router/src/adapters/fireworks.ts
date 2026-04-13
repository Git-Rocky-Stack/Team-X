/**
 * Fireworks AI adapter for the provider router.
 *
 * Fireworks exposes an OpenAI-compatible API, so this adapter uses
 * `@ai-sdk/openai`'s `createOpenAI` with a custom baseURL pointing at
 * `https://api.fireworks.ai/inference/v1`. This avoids depending on
 * `@ai-sdk/fireworks` which requires a newer `ai` SDK version than
 * we currently run.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

export interface FireworksAdapterOptions {
  /** Fireworks AI API key. Required. */
  apiKey: string;
  /** Model id, e.g. `accounts/fireworks/models/llama-v3p1-8b-instruct`. */
  model: string;
  /** Optional base URL override. Defaults to Fireworks' official API. */
  baseURL?: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific Fireworks model + key.
 */
export function makeFireworksStream(options: FireworksAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/fireworks] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/fireworks] model is required and must be non-empty');
  }

  const provider = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? FIREWORKS_BASE_URL,
  });

  return async function* fireworksStream({ system, messages, tools, maxSteps }) {
    const result = await streamText({
      model: provider(options.model),
      system,
      messages: messages as CoreMessage[],
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
