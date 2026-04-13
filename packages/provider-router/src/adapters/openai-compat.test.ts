import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  createProvider: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-openai-compat-model' } as const;

interface FullStreamPart {
  type: string;
  textDelta?: string;
}
interface FakeStreamResult {
  fullStream: AsyncIterable<FullStreamPart>;
  usage: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }>;
}
let nextStreamTextResult: FakeStreamResult | null = null;
let nextStreamTextError: Error | null = null;

function fakeProviderCallable(...args: unknown[]): typeof fakeModel {
  calls.providerFactory.push(args);
  return fakeModel;
}

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: (...args: unknown[]) => {
    calls.createProvider.push(args);
    return fakeProviderCallable;
  },
}));

vi.mock('ai', () => ({
  streamText: async (...args: unknown[]) => {
    calls.streamText.push(args);
    if (nextStreamTextError !== null) throw nextStreamTextError;
    if (nextStreamTextResult === null) throw new Error('test setup error');
    return nextStreamTextResult;
  },
}));

import { makeOpenAICompatStream } from './openai-compat.js';

async function* iterableOf(chunks: string[]): AsyncIterable<FullStreamPart> {
  for (const c of chunks) yield { type: 'text-delta', textDelta: c };
}

async function drain(
  gen: AsyncGenerator<{
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
  }>,
) {
  const out: Array<{
    delta?: string;
    done?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
  }> = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('makeOpenAICompatStream', () => {
  beforeEach(() => {
    calls.createProvider.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey + baseURL through to createOpenAI', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOpenAICompatStream({
        apiKey: 'lm-test',
        model: 'local-model',
        baseURL: 'http://localhost:1234/v1',
      });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider[0]).toEqual([
        { apiKey: 'lm-test', baseURL: 'http://localhost:1234/v1' },
      ]);
    });

    it('throws synchronously on empty apiKey', () => {
      expect(() =>
        makeOpenAICompatStream({ apiKey: '', model: 'm', baseURL: 'http://localhost:1234/v1' }),
      ).toThrow(/apiKey/i);
    });

    it('throws synchronously on empty model', () => {
      expect(() =>
        makeOpenAICompatStream({ apiKey: 'k', model: '', baseURL: 'http://localhost:1234/v1' }),
      ).toThrow(/model/i);
    });

    it('throws synchronously on missing baseURL — distinguishing trait', () => {
      expect(() => makeOpenAICompatStream({ apiKey: 'k', model: 'm', baseURL: '' })).toThrow(
        /baseURL/i,
      );
    });

    it('throws synchronously on undefined baseURL', () => {
      // biome-ignore lint/suspicious/noExplicitAny: intentionally omitting required field to test validation
      expect(() => makeOpenAICompatStream({ apiKey: 'k', model: 'm' } as any)).toThrow(/baseURL/i);
    });
  });

  describe('streaming', () => {
    it('yields deltas then done+usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Local', ' model']),
        usage: Promise.resolve({ promptTokens: 7, completionTokens: 2, totalTokens: 9 }),
      };
      const stream = makeOpenAICompatStream({
        apiKey: 'k',
        model: 'local-model',
        baseURL: 'http://localhost:1234/v1',
      });
      const chunks = await drain(stream({ system: '', messages: [] }));
      expect(chunks).toHaveLength(3);
      expect(chunks[2]).toEqual({ done: true, usage: { promptTokens: 7, completionTokens: 2 } });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection', async () => {
      nextStreamTextError = new Error('connection refused');
      const stream = makeOpenAICompatStream({
        apiKey: 'k',
        model: 'm',
        baseURL: 'http://localhost:1234/v1',
      });
      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          /* noop */
        }
      }).rejects.toThrow(/connection refused/);
    });
  });
});
