/**
 * OpenAI adapter for the provider router.
 *
 * Wraps the Vercel AI SDK's `streamText` + `@ai-sdk/openai` so the
 * orchestrator consumes one normalized `ProviderStreamFn` contract.
 * Pattern mirrors `./anthropic.ts` — see that file's header for the
 * full rationale on streaming protocol, construction-time guards, and
 * why all SDK touches live in this layer.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface OpenAIAdapterOptions {
  /** OpenAI API key. Required — never falls back to env vars. */
  apiKey: string;
  /** Model id, e.g. `gpt-4o`, `gpt-4o-mini`, `o1`. */
  model: string;
  /** Optional base URL override for proxy / Azure deployments. */
  baseURL?: string;
}

/**
 * Build a `ProviderStreamFn` bound to a specific OpenAI model + key.
 */
export function makeOpenAIStream(options: OpenAIAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/openai] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/openai] model is required and must be non-empty');
  }

  const providerOptions: { apiKey: string; baseURL?: string } = { apiKey: options.apiKey };
  if (options.baseURL !== undefined) {
    providerOptions.baseURL = options.baseURL;
  }
  const provider = createOpenAI(providerOptions);

  return async function* openaiStream({ system, messages, tools, maxSteps, signal }) {
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
