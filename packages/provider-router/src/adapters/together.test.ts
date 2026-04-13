import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  createProvider: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-together-model' } as const;

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

import { makeTogetherStream } from './together.js';

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

describe('makeTogetherStream', () => {
  beforeEach(() => {
    calls.createProvider.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey and default baseURL through to createOpenAI', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeTogetherStream({
        apiKey: 'tog-test',
        model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider[0]).toEqual([
        { apiKey: 'tog-test', baseURL: 'https://api.together.xyz/v1' },
      ]);
    });

    it('throws synchronously on empty apiKey', () => {
      expect(() => makeTogetherStream({ apiKey: '', model: 'm' })).toThrow(/apiKey/i);
    });

    it('throws synchronously on empty model', () => {
      expect(() => makeTogetherStream({ apiKey: 'k', model: '' })).toThrow(/model/i);
    });
  });

  describe('streaming', () => {
    it('yields deltas then done+usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Together', ' works']),
        usage: Promise.resolve({ promptTokens: 6, completionTokens: 2, totalTokens: 8 }),
      };
      const stream = makeTogetherStream({ apiKey: 'k', model: 'm' });
      const chunks = await drain(stream({ system: '', messages: [] }));
      expect(chunks).toHaveLength(3);
      expect(chunks[2]).toEqual({ done: true, usage: { promptTokens: 6, completionTokens: 2 } });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection', async () => {
      nextStreamTextError = new Error('model not found');
      const stream = makeTogetherStream({ apiKey: 'k', model: 'm' });
      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          /* noop */
        }
      }).rejects.toThrow(/model not found/);
    });
  });
});
