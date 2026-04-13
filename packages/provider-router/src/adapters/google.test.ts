import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  createProvider: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-google-model' } as const;

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

function fakeProviderCallable(...args: unknown[]): typeof fakeModel {
  calls.providerFactory.push(args);
  return fakeModel;
}

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (...args: unknown[]) => {
    calls.createProvider.push(args);
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

import { makeGoogleStream } from './google.js';

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

describe('makeGoogleStream', () => {
  beforeEach(() => {
    calls.createProvider.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey through to createGoogleGenerativeAI', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeGoogleStream({ apiKey: 'AIza-test', model: 'gemini-2.0-flash' });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider).toHaveLength(1);
      expect(calls.createProvider[0]).toEqual([{ apiKey: 'AIza-test' }]);
    });

    it('throws synchronously on empty apiKey', () => {
      expect(() => makeGoogleStream({ apiKey: '', model: 'gemini-2.0-flash' })).toThrow(/apiKey/i);
    });

    it('throws synchronously on empty model', () => {
      expect(() => makeGoogleStream({ apiKey: 'k', model: '' })).toThrow(/model/i);
    });
  });

  describe('streaming', () => {
    it('yields each chunk as a delta then final done+usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Hi', ' there']),
        usage: Promise.resolve({ promptTokens: 5, completionTokens: 2, totalTokens: 7 }),
      };
      const stream = makeGoogleStream({ apiKey: 'k', model: 'gemini-2.0-flash' });
      const chunks = await drain(stream({ system: '', messages: [] }));
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ delta: 'Hi' });
      expect(chunks[1]).toEqual({ delta: ' there' });
      expect(chunks[2]).toEqual({ done: true, usage: { promptTokens: 5, completionTokens: 2 } });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection', async () => {
      nextStreamTextError = new Error('quota exceeded');
      const stream = makeGoogleStream({ apiKey: 'k', model: 'gemini-2.0-flash' });
      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          /* noop */
        }
      }).rejects.toThrow(/quota exceeded/);
    });
  });
});
