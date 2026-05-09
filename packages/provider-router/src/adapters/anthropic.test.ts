import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the live Anthropic adapter (`makeAnthropicStream`).
 *
 * These tests exercise the adapter in isolation by mocking both the
 * `@ai-sdk/anthropic` provider factory AND the `ai` package's
 * `streamText` function. The adapter under test is a pure glue layer
 * between those two SDKs and our `ProviderStreamFn` contract — the
 * goal of this suite is to pin down:
 *
 *   1. Construction: `createAnthropic` receives the apiKey (and
 *      optional baseURL) the caller supplied.
 *   2. Model binding: the returned `AnthropicProvider` callable is
 *      invoked with the caller's `model` string AND the cache control
 *      flag (C3, audit 2026-05-07).
 *   3. Invocation: `streamText` is called with the system prompt
 *      hoisted into a cacheable system-role message (when caching is
 *      on) or via the bare `system` parameter (when caching is off).
 *   4. Streaming: each chunk produced by `fullStream` is forwarded as
 *      a `{ delta }` tuple, in order.
 *   5. Completion: the final `{ done: true, usage }` chunk carries the
 *      `promptTokens` / `completionTokens` pair plus optional cache
 *      token counts surfaced via `experimental_providerMetadata`.
 *   6. Error surfacing: a rejection from `streamText` bubbles out of
 *      the generator on the first `next()` so `runAgent`'s try/catch
 *      can close the run row.
 *
 * Real network calls are intentionally forbidden here: hitting the
 * Anthropic API from unit tests would flake on rate limits, burn
 * credits, and leak through CI. The live smoke path lives in
 * `scripts/smoke-chat.ts` (Task 35).
 */

// Recording buffers and fake return shaping. Reset in `beforeEach`.
const calls = {
  createAnthropic: [] as unknown[][],
  streamText: [] as unknown[][],
  providerFactory: [] as unknown[][],
};

/** Marker object the fake provider factory returns as the "model". */
const fakeModel = { __kind: 'fake-anthropic-model' } as const;

/**
 * What the next `streamText` invocation should return. Tests reassign
 * this before calling the adapter so each case has deterministic
 * fullStream + usage values. When `nextStreamTextError` is set, the
 * mocked `streamText` rejects instead.
 */
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
  experimental_providerMetadata?: Promise<unknown | undefined>;
}
let nextStreamTextResult: FakeStreamResult | null = null;
let nextStreamTextError: Error | null = null;

/**
 * Callable stand-in for the `AnthropicProvider` returned by
 * `createAnthropic`. Matches the real SDK shape — the provider object
 * is itself callable: `provider(modelId, settings?) -> LanguageModelV1`.
 */
function fakeProviderCallable(...args: unknown[]): typeof fakeModel {
  calls.providerFactory.push(args);
  return fakeModel;
}

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: (...args: unknown[]) => {
    calls.createAnthropic.push(args);
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

// Import AFTER the mocks so the adapter picks them up.
import { makeAnthropicStream } from './anthropic.js';

/** Helper: build a fullStream AsyncIterable from a fixed array of text chunks. */
async function* iterableOf(chunks: string[]): AsyncIterable<FullStreamPart> {
  for (const c of chunks) yield { type: 'text-delta', textDelta: c };
}

/**
 * Drain the adapter's generator into a flat array of chunks. Tests
 * assert on the shape of this array directly rather than relying on
 * any helper abstractions — we want failures to point at the exact
 * chunk sequence that diverged.
 */
async function drain(
  gen: AsyncGenerator<{
    delta?: string;
    done?: boolean;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
    };
  }>,
): Promise<
  Array<{
    delta?: string;
    done?: boolean;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
    };
  }>
> {
  const out: Array<{
    delta?: string;
    done?: boolean;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
    };
  }> = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe('makeAnthropicStream', () => {
  beforeEach(() => {
    calls.createAnthropic.length = 0;
    calls.streamText.length = 0;
    calls.providerFactory.length = 0;
    nextStreamTextResult = null;
    nextStreamTextError = null;
  });

  describe('construction', () => {
    it('passes apiKey through to createAnthropic', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['x']),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'sk-ant-test-123', model: 'claude-haiku-4-5' });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createAnthropic).toHaveLength(1);
      expect(calls.createAnthropic[0]).toEqual([{ apiKey: 'sk-ant-test-123' }]);
    });

    it('forwards an optional baseURL when supplied', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({
        apiKey: 'k',
        model: 'm',
        baseURL: 'https://proxy.example.com/v1',
      });
      await drain(stream({ system: '', messages: [] }));

      expect(calls.createAnthropic[0]).toEqual([
        { apiKey: 'k', baseURL: 'https://proxy.example.com/v1' },
      ]);
    });

    it('omits baseURL from the options object when not supplied', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'm' });
      await drain(stream({ system: '', messages: [] }));

      const opts = calls.createAnthropic[0]?.[0] as Record<string, unknown>;
      expect(opts).toBeDefined();
      expect(Object.keys(opts)).toEqual(['apiKey']);
    });

    it('throws synchronously on an empty apiKey — construction-time guard', () => {
      expect(() => makeAnthropicStream({ apiKey: '', model: 'claude-haiku-4-5' })).toThrow(
        /apiKey/i,
      );
      expect(() => makeAnthropicStream({ apiKey: '   ', model: 'claude-haiku-4-5' })).toThrow(
        /apiKey/i,
      );
    });

    it('throws synchronously on an empty model — construction-time guard', () => {
      expect(() => makeAnthropicStream({ apiKey: 'sk-x', model: '' })).toThrow(/model/i);
    });
  });

  describe('invocation', () => {
    it('binds the model id with cacheControl: true via the provider factory by default', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-sonnet-4-6' });
      await drain(stream({ system: 's', messages: [{ role: 'user', content: 'hi' }] }));

      // C3 — the second arg is the model settings object with
      // `cacheControl: true` so the SDK adds the prompt-caching beta
      // header and surfaces cache stats on the response.
      expect(calls.providerFactory).toHaveLength(1);
      expect(calls.providerFactory[0]).toEqual(['claude-sonnet-4-6', { cacheControl: true }]);
    });

    it('honors enablePromptCache: false by binding the model with cacheControl disabled', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({
        apiKey: 'k',
        model: 'claude-haiku-4-5',
        enablePromptCache: false,
      });
      await drain(stream({ system: 's', messages: [] }));

      expect(calls.providerFactory[0]).toEqual(['claude-haiku-4-5', { cacheControl: false }]);
    });

    it('hoists the system prompt into a cacheable system-role message when caching is enabled', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const history = [
        { role: 'user' as const, content: 'first' },
        { role: 'assistant' as const, content: 'reply-1' },
        { role: 'user' as const, content: 'second' },
      ];

      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-opus-4-6' });
      await drain(stream({ system: 'You are a CEO.', messages: history }));

      expect(calls.streamText).toHaveLength(1);
      const arg = calls.streamText[0]?.[0] as {
        model: unknown;
        system?: string;
        messages: Array<{
          role: string;
          content: unknown;
          experimental_providerMetadata?: unknown;
        }>;
      };
      expect(arg.model).toBe(fakeModel);
      // C3 — when caching is on, the bare `system` param is NOT passed
      // (the SDK doesn't honor providerMetadata on it). Instead, the
      // system text becomes the first message in the array with a
      // `cacheControl: ephemeral` marker so the prompt-caching prefix
      // covers the full system block.
      expect(arg.system).toBeUndefined();
      expect(arg.messages).toHaveLength(history.length + 1);
      const sys = arg.messages[0];
      expect(sys?.role).toBe('system');
      expect(sys?.content).toBe('You are a CEO.');
      expect(sys?.experimental_providerMetadata).toEqual({
        anthropic: { cacheControl: { type: 'ephemeral' } },
      });
      // History is appended verbatim after the cacheable system message.
      expect(arg.messages.slice(1)).toEqual(history);
    });

    it('uses the bare system parameter (no message hoisting) when caching is disabled', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const history = [{ role: 'user' as const, content: 'first' }];

      const stream = makeAnthropicStream({
        apiKey: 'k',
        model: 'claude-opus-4-6',
        enablePromptCache: false,
      });
      await drain(stream({ system: 'You are a CEO.', messages: history }));

      const arg = calls.streamText[0]?.[0] as {
        system?: string;
        messages: unknown[];
      };
      expect(arg.system).toBe('You are a CEO.');
      expect(arg.messages).toEqual(history);
    });
  });

  describe('streaming', () => {
    it('yields each fullStream text chunk as a delta in order', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['Hel', 'lo, ', 'world!']),
        usage: Promise.resolve({ promptTokens: 12, completionTokens: 3, totalTokens: 15 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-haiku-4-5' });
      const chunks = await drain(stream({ system: '', messages: [] }));

      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({ delta: 'Hel' });
      expect(chunks[1]).toEqual({ delta: 'lo, ' });
      expect(chunks[2]).toEqual({ delta: 'world!' });
    });

    it('yields a final done chunk with usage resolved from result.usage', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['a', 'b']),
        usage: Promise.resolve({ promptTokens: 42, completionTokens: 7, totalTokens: 49 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-haiku-4-5' });
      const chunks = await drain(stream({ system: '', messages: [] }));

      const last = chunks.at(-1);
      // Cache fields are absent when caching is enabled but the response
      // did not carry providerMetadata (e.g., a turn whose prefix was
      // shorter than the model's minimum cacheable size).
      expect(last).toEqual({ done: true, usage: { promptTokens: 42, completionTokens: 7 } });
    });

    it('handles an empty fullStream by still emitting a done chunk', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf([]),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-haiku-4-5' });
      const chunks = await drain(stream({ system: '', messages: [] }));

      expect(chunks).toEqual([{ done: true, usage: { promptTokens: 0, completionTokens: 0 } }]);
    });
  });

  describe('cache token surfacing (C3)', () => {
    it('forwards cacheReadInputTokens and cacheCreationInputTokens from providerMetadata', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
        experimental_providerMetadata: Promise.resolve({
          anthropic: {
            cacheReadInputTokens: 4000,
            cacheCreationInputTokens: 200,
          },
        }),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-sonnet-4-6' });
      const chunks = await drain(stream({ system: 'sys', messages: [] }));

      const last = chunks.at(-1);
      expect(last).toEqual({
        done: true,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          cachedInputTokens: 4000,
          cacheWriteTokens: 200,
        },
      });
    });

    it('omits cache fields when providerMetadata returns null counts', async () => {
      // Anthropic returns `null` (not the field absent) when caching is
      // active but no cache rows touched on this turn. The adapter must
      // treat null and missing the same: omit the field rather than
      // forwarding null downstream.
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 50, completionTokens: 10, totalTokens: 60 }),
        experimental_providerMetadata: Promise.resolve({
          anthropic: {
            cacheReadInputTokens: null,
            cacheCreationInputTokens: null,
          },
        }),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-sonnet-4-6' });
      const chunks = await drain(stream({ system: 'sys', messages: [] }));

      const last = chunks.at(-1) as {
        done?: boolean;
        usage?: { cachedInputTokens?: number; cacheWriteTokens?: number };
      };
      expect(last?.usage?.cachedInputTokens).toBeUndefined();
      expect(last?.usage?.cacheWriteTokens).toBeUndefined();
    });

    it('omits cache fields entirely when prompt caching is disabled', async () => {
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
        // SDK does not return providerMetadata at all when cacheControl
        // is false on the model — the adapter shouldn't await it.
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({
        apiKey: 'k',
        model: 'claude-sonnet-4-6',
        enablePromptCache: false,
      });
      const chunks = await drain(stream({ system: 'sys', messages: [] }));

      const last = chunks.at(-1) as {
        usage?: { cachedInputTokens?: number; cacheWriteTokens?: number };
      };
      expect(last?.usage?.cachedInputTokens).toBeUndefined();
      expect(last?.usage?.cacheWriteTokens).toBeUndefined();
    });

    it('passes through a partial providerMetadata (only one cache field present)', async () => {
      // Cache write only — covers the very first turn of a fresh prefix.
      nextStreamTextResult = {
        fullStream: iterableOf(['ok']),
        usage: Promise.resolve({ promptTokens: 200, completionTokens: 30, totalTokens: 230 }),
        experimental_providerMetadata: Promise.resolve({
          anthropic: { cacheCreationInputTokens: 1000 },
        }),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-sonnet-4-6' });
      const chunks = await drain(stream({ system: 'sys', messages: [] }));

      const last = chunks.at(-1) as {
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          cachedInputTokens?: number;
          cacheWriteTokens?: number;
        };
      };
      expect(last?.usage?.cacheWriteTokens).toBe(1000);
      expect(last?.usage?.cachedInputTokens).toBeUndefined();
    });
  });

  describe('errors', () => {
    it('propagates a streamText rejection out of the generator', async () => {
      nextStreamTextError = new Error('rate limited');
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-haiku-4-5' });

      await expect(async () => {
        for await (const _ of stream({ system: '', messages: [] })) {
          // should never run
        }
      }).rejects.toThrow(/rate limited/);
    });

    it('propagates a mid-stream rejection from fullStream', async () => {
      async function* failing(): AsyncIterable<FullStreamPart> {
        yield { type: 'text-delta', textDelta: 'prefix ' };
        throw new Error('connection reset');
      }
      nextStreamTextResult = {
        fullStream: failing(),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
        experimental_providerMetadata: Promise.resolve(undefined),
      };
      const stream = makeAnthropicStream({ apiKey: 'k', model: 'claude-haiku-4-5' });

      const collected: string[] = [];
      await expect(async () => {
        for await (const chunk of stream({ system: '', messages: [] })) {
          if (chunk.delta !== undefined) collected.push(chunk.delta);
        }
      }).rejects.toThrow(/connection reset/);
      expect(collected).toEqual(['prefix ']);
    });
  });
});
