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

interface FakeStreamResult {
  textStream: AsyncIterable<string>;
  usage: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }>;
}
let nextStreamTextResult: FakeStreamResult | null = null;
let nextStreamTextError: Error | null = null;

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
    if (nextStreamTextResult === null) {
      throw new Error(
        'test setup error: nextStreamTextResult must be assigned before calling the adapter',
      );
    }
    return nextStreamTextResult;
  },
}));

import { makeOllamaStream } from './ollama.js';

async function* iterableOf(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c;
}

async function drain(
  gen: AsyncGenerator<{
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
  }>,
): Promise<
  Array<{
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
  }>
> {
  const out: Array<{
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
  }> = [];
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
  });

  describe('construction', () => {
    it('passes baseURL through to createOllama when provided', async () => {
      nextStreamTextResult = {
        textStream: iterableOf(['ok']),
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
        textStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOllamaStream({ model: 'qwen2.5:3b' });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createOllama[0]).toEqual([{}]);
    });

    it('forwards optional custom headers to createOllama', async () => {
      nextStreamTextResult = {
        textStream: iterableOf([]),
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
        textStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
      };
      const stream = makeOllamaStream({ model: 'llama3.1:8b' });
      await drain(stream({ system: 's', messages: [{ role: 'user', content: 'hi' }] }));

      expect(calls.providerFactory).toHaveLength(1);
      expect(calls.providerFactory[0]).toEqual(['llama3.1:8b']);
    });

    it('calls streamText with model + system + messages unchanged', async () => {
      nextStreamTextResult = {
        textStream: iterableOf(['ok']),
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
        textStream: iterableOf(['one ', 'two ', 'three']),
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

    it('yields a final done chunk with usage resolved from result.usage', async () => {
      nextStreamTextResult = {
        textStream: iterableOf(['x']),
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
  });
});
