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

import { randomUUID } from 'node:crypto';
import {
  type CallWarning,
  type CoreMessage,
  type CoreTool,
  type FinishReason,
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
  type LanguageModelV1StreamPart,
  streamText,
} from 'ai';
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

interface OllamaLanguageModelWithArgs extends LanguageModelV1 {
  getArguments(options: LanguageModelV1CallOptions): {
    args: Record<string, unknown>;
    warnings?: CallWarning[];
  };
}

interface OllamaRawToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

interface OllamaRawChunk {
  model?: string;
  created_at?: string;
  done?: boolean;
  done_reason?: string | null;
  eval_count?: number | null;
  prompt_eval_count?: number | null;
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: OllamaRawToolCall[] | null;
  };
}

interface OllamaPatchedToolCall {
  toolCallType: 'function';
  toolCallId: string;
  toolName: string;
  args: string;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function mergeFetchHeaders(
  ...groups: Array<Record<string, string | undefined> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = { 'content-type': 'application/json' };
  for (const group of groups) {
    if (!group) continue;
    for (const [key, value] of Object.entries(group)) {
      if (typeof value === 'string' && value.length > 0) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function toUsage(chunk: OllamaRawChunk): { promptTokens: number; completionTokens: number } {
  return {
    promptTokens:
      typeof chunk.prompt_eval_count === 'number' && Number.isFinite(chunk.prompt_eval_count)
        ? chunk.prompt_eval_count
        : 0,
    completionTokens:
      typeof chunk.eval_count === 'number' && Number.isFinite(chunk.eval_count) ? chunk.eval_count : 0,
  };
}

function mapOllamaFinishReason(
  doneReason: string | null | undefined,
  hasToolCalls: boolean,
): FinishReason {
  switch (doneReason) {
    case 'stop':
      return hasToolCalls ? 'tool-calls' : 'stop';
    default:
      return 'other';
  }
}

function extractToolCalls(chunk: OllamaRawChunk): OllamaPatchedToolCall[] {
  const toolCalls = chunk.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return [];
  }

  const parsed: OllamaPatchedToolCall[] = [];
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name;
    if (typeof toolName !== 'string' || toolName.trim().length === 0) {
      continue;
    }
    parsed.push({
      toolCallId:
        typeof toolCall.id === 'string' && toolCall.id.trim().length > 0
          ? toolCall.id
          : randomUUID(),
      toolCallType: 'function',
      toolName,
      args: JSON.stringify(toolCall.function?.arguments ?? {}),
    });
  }
  return parsed;
}

function isCloudOllamaModel(modelId: string): boolean {
  return /cloud/i.test(modelId);
}

async function postOllamaChat(args: {
  url: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  fetchHeaders?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const response = await (args.fetchImpl ?? fetch)(args.url, {
    method: 'POST',
    signal: args.signal,
    headers: mergeFetchHeaders(args.headers, args.fetchHeaders),
    body: JSON.stringify(args.body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const suffix = detail.trim().length > 0 ? `: ${detail.trim().slice(0, 500)}` : '';
    throw new Error(`[provider-router/ollama] Ollama returned HTTP ${response.status}${suffix}`);
  }

  return response;
}

async function parseOllamaJsonResponse(response: Response): Promise<OllamaRawChunk> {
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== 'object') {
    throw new Error('[provider-router/ollama] Ollama returned a non-object chat payload');
  }
  return payload as OllamaRawChunk;
}

function createOllamaLineStream(
  response: Response,
  onChunk: (chunk: OllamaRawChunk) => boolean,
): ReadableStream<Uint8Array> | null {
  if (response.body === null) {
    return null;
  }

  const source = response.body;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line: string): boolean => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;
        const chunk = JSON.parse(trimmed) as OllamaRawChunk;
        return onChunk(chunk);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex === -1) break;
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (processLine(line)) {
              controller.close();
              return;
            }
          }
        }

        buffer += decoder.decode();
        if (processLine(buffer)) {
          controller.close();
          return;
        }
        controller.error(new Error('[provider-router/ollama] stream ended without a done chunk'));
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export function makePatchedOllamaCloudLanguageModel(args: {
  baseModel: OllamaLanguageModelWithArgs;
  baseURL?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): LanguageModelV1 {
  const chatUrl = `${(args.baseURL ?? 'http://localhost:11434/api').replace(/\/$/, '')}/chat`;

  return {
    specificationVersion: args.baseModel.specificationVersion,
    provider: args.baseModel.provider,
    modelId: args.baseModel.modelId,
    defaultObjectGenerationMode: args.baseModel.defaultObjectGenerationMode,
    supportsImageUrls: args.baseModel.supportsImageUrls,
    supportsStructuredOutputs: args.baseModel.supportsStructuredOutputs,

    async doGenerate(options) {
      const { args: requestArgs, warnings = [] } = args.baseModel.getArguments(options);
      const { messages: rawPrompt, ...rawSettings } = requestArgs;
      const response = await postOllamaChat({
        url: chatUrl,
        body: { ...requestArgs, stream: false },
        signal: options.abortSignal,
        headers: args.headers,
        fetchHeaders: options.headers,
        fetchImpl: args.fetchImpl,
      });
      const payload = await parseOllamaJsonResponse(response);
      const toolCalls = extractToolCalls(payload);

      return {
        text:
          typeof payload.message?.content === 'string' && payload.message.content.length > 0
            ? payload.message.content
            : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: mapOllamaFinishReason(payload.done_reason, toolCalls.length > 0),
        usage: toUsage(payload),
        rawCall: {
          rawPrompt,
          rawSettings,
        },
        rawResponse: {
          headers: responseHeadersToObject(response.headers),
        },
        response: {
          modelId: typeof payload.model === 'string' ? payload.model : args.baseModel.modelId,
          timestamp: typeof payload.created_at === 'string' ? new Date(payload.created_at) : undefined,
        },
        warnings,
      };
    },

    async doStream(options) {
      const { args: requestArgs, warnings = [] } = args.baseModel.getArguments(options);
      const { messages: rawPrompt, ...rawSettings } = requestArgs;
      const response = await postOllamaChat({
        url: chatUrl,
        body: { ...requestArgs, stream: true },
        signal: options.abortSignal,
        headers: args.headers,
        fetchHeaders: options.headers,
        fetchImpl: args.fetchImpl,
      });

      const responseHeaders = responseHeadersToObject(response.headers);
      const lowLevelStream = new ReadableStream<LanguageModelV1StreamPart>({
        start(controller) {
          let emittedResponseMetadata = false;
          let sawToolCalls = false;

          const lineStream = createOllamaLineStream(response, (chunk) => {
            if (!emittedResponseMetadata) {
              controller.enqueue({
                type: 'response-metadata',
                modelId: typeof chunk.model === 'string' ? chunk.model : args.baseModel.modelId,
                timestamp: typeof chunk.created_at === 'string' ? new Date(chunk.created_at) : undefined,
              });
              emittedResponseMetadata = true;
            }

            const toolCalls = extractToolCalls(chunk);
            if (toolCalls.length > 0) {
              sawToolCalls = true;
              for (const toolCall of toolCalls) {
                controller.enqueue({
                  type: 'tool-call',
                  ...toolCall,
                });
              }
            }

            const text = chunk.message?.content;
            if (typeof text === 'string' && text.length > 0) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: text,
              });
            }

            if (chunk.done === true) {
              controller.enqueue({
                type: 'finish',
                finishReason: mapOllamaFinishReason(chunk.done_reason, sawToolCalls),
                usage: toUsage(chunk),
              });
              return true;
            }

            return false;
          });

          if (lineStream === null) {
            controller.error(new Error('[provider-router/ollama] empty response body'));
            return;
          }

          lineStream.pipeTo(
            new WritableStream<Uint8Array>({
              write() {
                // No-op. createOllamaLineStream routes parsed chunks into controller directly.
              },
            }),
          )
            .then(() => {
              controller.close();
            })
            .catch((error) => {
              controller.error(error);
            });
        },
      });

      return {
        stream: lowLevelStream,
        rawCall: {
          rawPrompt,
          rawSettings,
        },
        rawResponse: {
          headers: responseHeaders,
        },
        warnings,
      };
    },
  };
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
  const baseModel = provider(options.model) as OllamaLanguageModelWithArgs;
  const model = isCloudOllamaModel(options.model)
    ? makePatchedOllamaCloudLanguageModel({
        baseModel,
        baseURL: providerOptions.baseURL,
        headers: providerOptions.headers,
      })
    : baseModel;

  return async function* ollamaStream({ system, messages, tools, maxSteps, signal }) {
    const result = await streamText({
      model,
      system,
      messages: messages as CoreMessage[],
      abortSignal: signal,
      // Ollama's num_predict defaults to -1 (unlimited), but AI SDK requires maxTokens >= 1.
      // Use a large number to approximate unlimited behavior.
      maxTokens: 4096,
      ...(tools && Object.keys(tools).length > 0
        ? { tools: tools as Record<string, CoreTool>, maxSteps: maxSteps ?? 1 }
        : {}),
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        yield { delta: part.textDelta };
        continue;
      }
      if (part.type === 'error') {
        throw part.error instanceof Error
          ? part.error
          : new Error(
              typeof part.error === 'string'
                ? part.error
                : '[provider-router/ollama] provider stream emitted an unknown error',
            );
      }
      if (part.type === 'tool-call') {
        yield {
          toolCall: {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args as Record<string, unknown>,
          },
        };
        continue;
      }
    }

    const usage = await result.usage;
    // Ollama cloud models may not return eval_count, so provide fallback.
    // The usage object has getter properties that return NaN when null.
    // We must explicitly check for null/undefined/NaN and default to 0.
    const rawPromptTokens = usage?.promptTokens;
    const rawCompletionTokens = usage?.completionTokens;
    const promptTokens = (rawPromptTokens == null || Number.isNaN(rawPromptTokens)) ? 0 : rawPromptTokens;
    const completionTokens = (rawCompletionTokens == null || Number.isNaN(rawCompletionTokens)) ? 0 : rawCompletionTokens;
    yield {
      done: true,
      usage: {
        promptTokens,
        completionTokens,
      },
    };
  };
}
