/**
 * OpenRouter adapter for the provider router.
 *
 * Wraps `@openrouter/ai-sdk-provider` via `streamText`. OpenRouter is
 * an aggregator — it proxies requests to many upstream model providers
 * so a single API key unlocks access to hundreds of models. Pattern
 * mirrors `./anthropic.ts`.
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface OpenRouterAdapterOptions {
  /** OpenRouter API key. Required. */
  apiKey: string;
  /** Model id, e.g. `meta-llama/llama-3.1-8b-instruct`. */
  model: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific OpenRouter model + key.
 *
 * OpenRouter does not support a custom baseURL — the SDK always targets
 * `https://openrouter.ai/api/v1`. No baseURL option exposed.
 */
export function makeOpenRouterStream(options: OpenRouterAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/openrouter] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/openrouter] model is required and must be non-empty');
  }

  const provider = createOpenRouter({ apiKey: options.apiKey });

  return async function* openrouterStream({ system, messages, tools, maxSteps }) {
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
