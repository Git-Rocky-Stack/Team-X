/**
 * Streaming helpers (audit 2026-10-07 P1-6: ~6% covered).
 *
 * `accumulateStream` is on Enhanced AI's production path, and the unified
 * service builds its streams with `createResponseStreamer`, so both are pinned
 * here end to end, including abort and error handling.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  type StreamChunk,
  accumulateStream,
  asSSEStream,
  createResponseStreamer,
  createStaticStream,
  createTokenStream,
  filterStream,
  formatSSE,
  transformStream,
} from './responses.js';

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

async function* tokens(...parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}

function deterministic() {
  let n = 0;
  let t = 1_000;
  return { idGen: () => `id${++n}`, now: () => t++ };
}

describe('createStaticStream', () => {
  it('splits text into fixed-size pieces that rejoin to the original', async () => {
    const pieces = await collect(createStaticStream('hello world', { tokensPerChunk: 4 }));
    expect(pieces).toEqual(['hell', 'o wo', 'rld']);
    expect(pieces.join('')).toBe('hello world');
  });

  it('yields nothing for empty text', async () => {
    expect(await collect(createStaticStream(''))).toEqual([]);
  });
});

describe('createTokenStream', () => {
  it('passes tokens through and reports completion', async () => {
    const stream = createTokenStream(tokens('a', 'b'));
    expect(stream.isComplete()).toBe(false);
    expect(await collect(stream)).toEqual(['a', 'b']);
    expect(stream.isComplete()).toBe(true);
  });

  it('stops after abort', async () => {
    const stream = createTokenStream(tokens('a', 'b', 'c'));
    const seen: string[] = [];
    for await (const t of stream) {
      seen.push(t);
      stream.abort();
    }
    expect(seen).toEqual(['a']);
    expect(stream.isComplete()).toBe(true);
  });
});

describe('createResponseStreamer', () => {
  it('frames a string response with start and end control chunks', async () => {
    const streamer = createResponseStreamer(deterministic());
    const chunks = await collect(streamer.stream('abc', { chunkSize: 2 }));

    expect(chunks.map((c) => c.type)).toEqual(['control', 'text', 'text', 'control']);
    expect(chunks.map((c) => c.content)).toEqual(['', 'ab', 'c', '']);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(chunks[0]?.metadata).toMatchObject({ control: 'start' });
    expect(chunks.at(-1)).toMatchObject({ isFinal: true, metadata: { control: 'end' } });
  });

  it('streams an async generator, tracks state and calls the hooks', async () => {
    const streamer = createResponseStreamer(deterministic());
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const chunks = await collect(
      streamer.stream(tokens('one ', 'two'), { onChunk, onComplete, includeMetadata: false }),
    );

    expect(chunks.filter((c) => c.type === 'text').map((c) => c.content)).toEqual(['one ', 'two']);
    expect(chunks.find((c) => c.type === 'text')?.metadata).toBeUndefined();
    expect(onChunk).toHaveBeenCalledTimes(3); // two text chunks + end
    expect(onComplete).toHaveBeenCalledOnce();

    const streamId = String(chunks[0]?.metadata?.streamId);
    expect(streamer.getState(streamId)).toMatchObject({ active: false, bytesSent: 7, index: 3 });
    expect(streamer.getState('missing')).toBeNull();
  });

  it('turns an abort into a final error chunk and reports it', async () => {
    const streamer = createResponseStreamer(deterministic());
    const controller = new AbortController();
    controller.abort();
    const onError = vi.fn();
    const chunks = await collect(streamer.stream('abc', { signal: controller.signal, onError }));

    expect(chunks.at(-1)).toMatchObject({
      type: 'error',
      content: 'Stream aborted',
      isFinal: true,
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Stream aborted' }));
  });

  it('turns a failing source into a final error chunk', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'partial';
      throw new Error('provider dropped');
    }
    const streamer = createResponseStreamer(deterministic());
    const chunks = await collect(streamer.stream(failing()));
    expect(chunks.map((c) => c.type)).toEqual(['control', 'text', 'error']);
    expect(chunks.at(-1)?.content).toBe('provider dropped');
  });

  it('serializes chunks for SSE and WebSocket transports', async () => {
    const streamer = createResponseStreamer(deterministic());
    const [start, text] = await collect(streamer.stream('x'));
    if (!start || !text) throw new Error('expected chunks');

    expect(streamer.toSSE(start).event).toBe('control');
    const sse = streamer.toSSE(text);
    expect(sse.event).toBe('message');
    expect(JSON.parse(sse.data)).toMatchObject({ type: 'text', content: 'x' });
    expect(JSON.parse(streamer.toWebSocket(text))).toMatchObject({ id: text.id, content: 'x' });
  });

  it('multiplexes several sources round-robin until all finish', async () => {
    const streamer = createResponseStreamer(deterministic());
    const a = streamer.stream('ab', { chunkSize: 1 });
    const b = streamer.stream('c', { chunkSize: 1 });
    const out = await collect(
      streamer.multiplex([
        { id: 'a', source: a },
        { id: 'b', source: b },
      ]),
    );
    const texts = out
      .filter((o) => o.chunk.type === 'text')
      .map((o) => `${o.streamId}:${o.chunk.content}`);
    expect(texts).toEqual(['a:a', 'b:c', 'a:b']);
  });
});

describe('stream utilities', () => {
  function chunk(type: StreamChunk['type'], content: string, isFinal = false): StreamChunk {
    return { id: content, type, content, isFinal, index: 0, timestamp: 0 };
  }
  async function* of(...chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
    for (const c of chunks) yield c;
  }

  it('accumulateStream joins text and token chunks and stops at the final chunk', async () => {
    const text = await accumulateStream(
      of(
        chunk('control', ''),
        chunk('text', 'Hello'),
        chunk('reasoning', '(thinking)'),
        chunk('token', ', world'),
        chunk('control', '', true),
        chunk('text', 'ignored after final'),
      ),
    );
    expect(text).toBe('Hello, world');
  });

  it('filterStream keeps only the requested types and ends at the final chunk', async () => {
    const out = await collect(
      filterStream(
        of(
          chunk('text', 'a'),
          chunk('tool_call', 't'),
          chunk('text', 'b', true),
          chunk('text', 'c'),
        ),
        new Set(['text']),
      ),
    );
    expect(out.map((c) => c.content)).toEqual(['a', 'b']);
  });

  it('transformStream maps every chunk and ends at the final chunk', async () => {
    const out = await collect(
      transformStream(
        of(chunk('text', 'a'), chunk('text', 'b', true), chunk('text', 'c')),
        (c) => ({
          ...c,
          content: c.content.toUpperCase(),
        }),
      ),
    );
    expect(out.map((c) => c.content)).toEqual(['A', 'B']);
  });

  it('formatSSE writes the event, data, optional id and retry, then a blank line', () => {
    expect(formatSSE({ event: 'message', data: '{}' })).toBe('event: message\ndata: {}\n\n');
    expect(formatSSE({ event: 'message', data: '{}', id: '7', retry: 3000 })).toBe(
      'event: message\ndata: {}\nid: 7\nretry: 3000\n\n',
    );
  });

  it('asSSEStream frames every chunk and closes with a done event', async () => {
    const streamer = createResponseStreamer(deterministic());
    const frames = await collect(asSSEStream(streamer.stream('hi', { chunkSize: 2 }), streamer));
    expect(frames).toHaveLength(4); // start, text, end, done
    expect(frames.at(-1)).toBe('event: done\ndata: {}\n\n');
  });
});
