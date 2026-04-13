import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = {
  createProvider: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

const fakeModel = { __kind: 'fake-openai-model' } as const;

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
    if (nextStreamTextResult === null) {
      throw new Error(
        'test setup error: nextStreamTextResult must be assigned before calling the adapter',
      );
    }
    return nextStreamTextResult;
  },
}));

import { makeOpenAIStream } from './openai.js';

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

describe('makeOpenAIStream', () => {
  beforeEach(() => {
    calls.createProvider.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey through to createOpenAI', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOpenAIStream({ apiKey: 'sk-test-123', model: 'gpt-4o' });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider).toHaveLength(1);
      expect(calls.createProvider[0]).toEqual([{ apiKey: 'sk-test-123' }]);
    });

    it('forwards optional baseURL when supplied', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      };
      const stream = makeOpenAIStream({
        apiKey: 'k',
        model: 'm',
        baseURL: 'https://proxy.example.com/v1',
      });
      await drain(stream({ system: '', messages: [] }));
      expect(calls.createProvider[0]).toEqual([
        { apiKey: 'k', baseURL: 'https://proxy.example.com/v1' },
      ]);
    });

    it('throws synchronously on empty apiKey', () => {
      expect(() => makeOpenAIStream({ apiKey: '', model: 'gpt-4o' })).toThrow(/apiKey/i);
    });

    it('throws synchronously on empty model', () => {
      expect(() => makeOpenAIStream({ apiKey: 'sk-x', model: '' })).toThrow(/model/i);
    });
  });

  describe('streaming', () => {
    it('yields each chunk as a delta then final done+usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Hel', 'lo']),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 2, totalTokens: 12 }),
      };
      const stream = makeOpenAIStream({ apiKey: 'k', model: 'gpt-4o' });
      const chunks = await drain(stream({ system: '', messages: [] }));
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ delta: 'Hel' });
      expect(chunks[1]).toEqual({ delta: 'lo' });
      expect(chunks[2]).toEqual({ done: true, usage: { promptTokens: 10, completionTokens: 2 } });
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection', async () => {
      nextStreamTextError = new Error('rate limited');
      const stream = makeOpenAIStream({ apiKey: 'k', model: 'gpt-4o' });
      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          /* noop */
        }
      }).rejects.toThrow(/rate limited/);
    });
  });
});
