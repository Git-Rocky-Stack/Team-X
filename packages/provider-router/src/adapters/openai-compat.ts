/**
 * Generic OpenAI-compatible adapter for the provider router.
 *
 * Wraps `@ai-sdk/openai` with a REQUIRED `baseURL` so the user can
 * point at any OpenAI-compatible endpoint (LM Studio, vLLM, Oobabooga,
 * LocalAI, llama.cpp server, Anyscale, etc.).
 *
 * Unlike the standard OpenAI adapter, `baseURL` is mandatory here —
 * if the user wanted the official OpenAI API they would use the `openai`
 * provider kind instead.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { type CoreMessage, type CoreTool, streamText } from 'ai';

import type { ProviderStreamFn } from '../stream.js';

export interface OpenAICompatAdapterOptions {
  /** API key for the target endpoint. Required. */
  apiKey: string;
  /** Model id as recognized by the target endpoint. */
  model: string;
  /** Base URL of the OpenAI-compatible endpoint. REQUIRED. */
  baseURL: string;
}

/**
 * Build a `ProviderStreamFn` bound to an OpenAI-compatible endpoint.
 *
 * Throws at construction time if `baseURL` is missing — this is the
 * distinguishing trait from the standard OpenAI adapter.
 */
export function makeOpenAICompatStream(options: OpenAICompatAdapterOptions): ProviderStreamFn {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new Error('[provider-router/openai-compat] apiKey is required and must be non-empty');
  }
  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('[provider-router/openai-compat] model is required and must be non-empty');
  }
  if (typeof options.baseURL !== 'string' || options.baseURL.trim() === '') {
    throw new Error(
      '[provider-router/openai-compat] baseURL is required for OpenAI-compatible endpoints',
    );
  }

  const provider = createOpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });

  return async function* openaiCompatStream({ system, messages, tools, maxSteps }) {
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
