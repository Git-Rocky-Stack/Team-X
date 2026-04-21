import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the live Ollama adapter (`makeOllamaStream`).
 *
 * Mirrors `anthropic.test.ts` — mocks `ollama-ai-provider` + `ai` so
 * the suite exercises the adapter without spawning a real Ollama
 * server. The assertion set is intentionally narrower on the "construction"
 * side because Ollama is a local-only provider with no apiKey, and wider
 * on the "default baseURL" case because that's the most common Ollama
 * misconfiguration in the wild.
 *
 * The live smoke verification against a running Ollama instance lives in
 * `apps/desktop/scripts/smoke-chat.ts` (Task 35); this unit suite stays
 * hermetic.
 */

const calls = {
  createOllama: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-ollama-model' } as const;

interface FullStreamPart {
  type: string;
  textDelta?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
}

interface FakeStreamResult {
  fullStream: AsyncIterable<FullStreamPart>;
  usage: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }>;
}
let nextStreamTextResult: FakeStreamResult | null = null;
let nextStreamTextError: Error | null = null;
let nextStreamTextImpl:
  | ((args: unknown) => FakeStreamResult | Promise<FakeStreamResult>)
  | null = null;

interface AdapterChunk {
  delta?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
  toolCall?: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
}

function fakeProviderCallable(...args: unknown[]): typeof fakeModel {
  calls.providerFactory.push(args);
  return fakeModel;
}

vi.mock('ollama-ai-provider', () => ({
  createOllama: (...args: unknown[]) => {
    calls.createOllama.push(args);
    return fakeProviderCallable;
  },
}));

vi.mock('ai', () => ({
  streamText: async (...args: unknown[]) => {
    calls.streamText.push(args);
    if (nextStreamTextError !== null) throw nextStreamTextError;
    if (nextStreamTextImpl !== null) return await nextStreamTextImpl(args[0]);
    if (nextStreamTextResult === null) {
      throw new Error(
        'test setup error: nextStreamTextResult must be assigned before calling the adapter',
      );
    }
    return nextStreamTextResult;
  },
}));

import { makeOllamaStream } from './ollama.js';

async function* iterableOf(chunks: string[]): AsyncIterable<FullStreamPart> {
  for (const c of chunks) yield { type: 'text-delta', textDelta: c };
}

async function* iterableOfParts(parts: FullStreamPart[]): AsyncIterable<FullStreamPart> {
  for (const part of parts) yield part;
}

async function drain(
  gen: AsyncGenerator<AdapterChunk>,
): Promise<AdapterChunk[]> {
  const out: AdapterChunk[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('makeOllamaStream', () => {
  beforeEach(() => {
    calls.createOllama.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
    nextStreamTextImpl = null;
  });

  describe('construction', () => {
    it('passes baseURL through to createOllama when provided', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
      };
      const stream = makeOllamaStream({
        model: 'qwen2.5:3b',
        baseURL: 'http://localhost:11434',
      });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createOllama).toHaveLength(1);
      expect(calls.createOllama[0]).toEqual([{ baseURL: 'http://localhost:11434' }]);
    });

    it('omits baseURL from the options object when not supplied — SDK default kicks in', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createOllama[0]).toEqual([{}]);
    });

    it('forwards optional custom headers to createOllama', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOllamaStream({
        model: 'qwen2.5:3b',
        headers: { 'X-Tenant': 'rocky' },
      });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createOllama[0]).toEqual([{ headers: { 'X-Tenant': 'rocky' } }]);
    });

    it('throws synchronously on an empty model — construction-time guard', () => {
      expect(() => makeOllamaStream({ model: '' })).toThrow(/model/i);
      expect(() => makeOllamaStream({ model: '   ' })).toThrow(/model/i);
    });
  });

  describe('invocation', () => {
    it('binds the model id via the provider factory on each call', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
      };
      const stream = makeOllamaStream({ model: 'llama3.1:8b' });
      await drain(stream({ system: 's', messages: [{ role: 'user', content: 'hi' }] }));

      expect(calls.providerFactory).toHaveLength(1);
      expect(calls.providerFactory[0]).toEqual(['llama3.1:8b']);
    });

    it('calls streamText with model + system + messages unchanged', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 2, completionTokens: 2, totalTokens: 4 }),
      };
      const history = [
        { role: 'user' as const, content: 'write a haiku' },
        { role: 'assistant' as const, content: 'roses are red' },
      ];
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      await drain(stream({ system: 'You are a poet.', messages: history }));

      expect(calls.streamText).toHaveLength(1);
      const arg = calls.streamText[0]?.[0] as {
        model: unknown;
        system: string;
        messages: unknown[];
      };
      expect(arg.model).toBe(fakeModel);
      expect(arg.system).toBe('You are a poet.');
      expect(arg.messages).toEqual(history);
    });
  });

  describe('streaming', () => {
    it('yields each textStream chunk as a delta in order', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['one ', 'two ', 'three']),
        usage: Promise.resolve({ promptTokens: 8, completionTokens: 3, totalTokens: 11 }),
      };
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      const chunks = await drain(stream({ system: '', messages: [] }));

      expect(chunks.filter((c) => c.delta !== undefined)).toEqual([
        { delta: 'one ' },
        { delta: 'two ' },
        { delta: 'three' },
      ]);
    });

    it('continues streaming assistant text after a tool call', async () => {
      nextStreamTextResult = {
        fullStream: iterableOfParts([
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup_company',
            args: { companyId: 'company-1' },
          },
          { type: 'text-delta', textDelta: 'Company ' },
          { type: 'text-delta', textDelta: 'status ready' },
        ]),
        usage: Promise.resolve({ promptTokens: 11, completionTokens: 5, totalTokens: 16 }),
      };
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      const chunks = await drain(
        stream({
          system: '',
          messages: [],
          tools: { lookup_company: {} },
          maxSteps: 2,
        }),
      );

      expect(chunks).toEqual([
        {
          toolCall: {
            toolCallId: 'call-1',
            toolName: 'lookup_company',
            args: { companyId: 'company-1' },
          },
        },
        { delta: 'Company ' },
        { delta: 'status ready' },
        {
          done: true,
          usage: { promptTokens: 11, completionTokens: 5 },
        },
      ]);
    });

    it('yields a final done chunk with usage resolved from result.usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 99, completionTokens: 17, totalTokens: 116 }),
      };
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      const chunks = await drain(stream({ system: '', messages: [] }));

      expect(chunks.at(-1)).toEqual({
        done: true,
        usage: { promptTokens: 99, completionTokens: 17 },
      });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection out of the generator', async () => {
      nextStreamTextError = new Error('connection refused');
      const stream = makeOllamaStream({
        model: 'qwen2.5:3b',
        baseURL: 'http://localhost:99999',
      });

      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          // never reached
        }
      }).rejects.toThrow(/connection refused/);
    });

    it('passes abortSignal to streamText and stops without a done chunk when aborted', async () => {
      const controller = new AbortController();
      let sawAbort = false;

      nextStreamTextImpl = (arg) => {
        const abortSignal = (arg as { abortSignal?: AbortSignal }).abortSignal;
        const abortError = Object.assign(new Error('stream aborted'), { name: 'AbortError' });
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'partial' };

            if (!abortSignal) {
              yield { type: 'text-delta', textDelta: 'unexpected-without-signal' };
              return;
            }

            if (!abortSignal.aborted) {
              await new Promise<void>((resolve) => {
                abortSignal.addEventListener('abort', () => resolve(), { once: true });
              });
            }

            sawAbort = abortSignal.aborted;
            throw abortError;
          })(),
          usage: Promise.resolve({ promptTokens: 2, completionTokens: 2, totalTokens: 4 }),
        };
      };

      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      const args = { system: '', messages: [], signal: controller.signal };
      const gen = stream(args);
      const chunks: AdapterChunk[] = [];

      const first = await gen.next();
      if (!first.done) {
        chunks.push(first.value);
      }

      controller.abort();

      await expect(async () => {
        for await (const chunk of gen) {
          chunks.push(chunk);
        }
      }).rejects.toMatchObject({ name: 'AbortError' });

      expect(calls.streamText[0]?.[0]).toMatchObject({ abortSignal: controller.signal });
      expect(sawAbort).toBe(true);
      expect(chunks).toEqual([{ delta: 'partial' }]);
      expect(chunks.some((chunk) => chunk.done)).toBe(false);
    });
  });
});
