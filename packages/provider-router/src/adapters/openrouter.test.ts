import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  createProvider: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-openrouter-model' } as const;

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

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (...args: unknown[]) => {
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

import { makeOpenRouterStream } from './openrouter.js';

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

describe('makeOpenRouterStream', () => {
  beforeEach(() => {
    calls.createProvider.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey through to createOpenRouter', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOpenRouterStream({
        apiKey: 'sk-or-test',
        model: 'meta-llama/llama-3.1-8b-instruct',
      });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider[0]).toEqual([{ apiKey: 'sk-or-test' }]);
    });

    it('throws synchronously on empty apiKey', () => {
      expect(() => makeOpenRouterStream({ apiKey: '', model: 'm' })).toThrow(/apiKey/i);
    });

    it('throws synchronously on empty model', () => {
      expect(() => makeOpenRouterStream({ apiKey: 'k', model: '' })).toThrow(/model/i);
    });
  });

  describe('streaming', () => {
    it('yields deltas then done+usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Routed', ' reply']),
        usage: Promise.resolve({ promptTokens: 8, completionTokens: 2, totalTokens: 10 }),
      };
      const stream = makeOpenRouterStream({
        apiKey: 'k',
        model: 'meta-llama/llama-3.1-8b-instruct',
      });
      const chunks = await drain(stream({ system: '', messages: [] }));
      expect(chunks).toHaveLength(3);
      expect(chunks[2]).toEqual({ done: true, usage: { promptTokens: 8, completionTokens: 2 } });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection', async () => {
      nextStreamTextError = new Error('upstream timeout');
      const stream = makeOpenRouterStream({ apiKey: 'k', model: 'm' });
      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          /* noop */
        }
      }).rejects.toThrow(/upstream timeout/);
    });
  });
});
