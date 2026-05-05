/**
 * Streaming Responses for Agentic AI
 *
 * Provides real-time partial response streaming from LLM outputs,
 * with support for SSE (Server-Sent Events) and WebSocket transport.
 *
 * Phase 5 — M30 (Phase 3 enhancement).
 */

/**
 * A chunk of streamed response content.
 */
export interface StreamChunk {
  /** Chunk ID */
  id: string;

  /** Type of chunk */
  type: StreamChunkType;

  /** Content payload */
  content: string;

  /** Whether this is the final chunk */
  isFinal: boolean;

  /** Chunk index in the stream */
  index: number;

  /** Timestamp */
  timestamp: number;

  /** Metadata associated with this chunk */
  metadata?: {
    stepIndex?: number;
    toolName?: string;
    reasoning?: string;
    [key: string]: unknown;
  };
}

/**
 * Types of stream chunks.
 */
export type StreamChunkType =
  | 'token' // Individual token
  | 'text' // Text fragment (multiple tokens)
  | 'reasoning' // Model reasoning/thought process
  | 'tool_call' // Tool invocation start
  | 'tool_result' // Tool result
  | 'plan' // Planning step
  | 'answer' // Final answer fragment
  | 'error' // Error message
  | 'metadata' // Metadata update
  | 'control'; // Control signal (start/end)

/**
 * Stream event for Server-Sent Events.
 */
export interface StreamEvent {
  /** Event name */
  event: string;

  /** Event data */
  data: string;

  /** Event ID */
  id?: string;

  /** Retry delay (ms) */
  retry?: number;
}

/**
 * Stream options.
 */
export interface StreamOptions {
  /** Chunk size in tokens/characters */
  chunkSize?: number;

  /** Delay between chunks (ms) */
  chunkDelay?: number;

  /** Enable metadata streaming */
  includeMetadata?: boolean;

  /** Transport type */
  transport?: 'sse' | 'websocket' | 'callback';

  /** Callback for individual chunks */
  onChunk?: (chunk: StreamChunk) => void;

  /** Callback for completion */
  onComplete?: () => void;

  /** Callback for errors */
  onError?: (error: Error) => void;

  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Stream state.
 */
export interface StreamState {
  /** Whether stream is active */
  active: boolean;

  /** Current chunk index */
  index: number;

  /** Total bytes sent */
  bytesSent: number;

  /** Start timestamp */
  startedAt: number;

  /** Last chunk timestamp */
  lastChunkAt: number;
}

/**
 * Response streamer interface.
 */
export interface ResponseStreamer {
  /**
   * Stream a complete response.
   */
  stream(
    response: string | AsyncGenerator<string>,
    options?: StreamOptions,
  ): AsyncGenerator<StreamChunk>;

  /**
   * Convert to SSE format.
   */
  toSSE(chunk: StreamChunk): StreamEvent;

  /**
   * Convert to WebSocket message.
   */
  toWebSocket(chunk: StreamChunk): string;

  /**
   * Create a multiplexed stream for multiple concurrent outputs.
   */
  multiplex(
    streams: Array<{ id: string; source: AsyncGenerator<StreamChunk> }>,
  ): AsyncGenerator<{ streamId: string; chunk: StreamChunk }>;

  /**
   * Get current stream state.
   */
  getState(streamId: string): StreamState | null;
}

/**
 * Token streaming interface for LLM providers.
 */
export interface TokenStream {
  /** Iterator for tokens */
  [Symbol.asyncIterator](): AsyncIterator<string>;

  /** Abort the stream */
  abort(): void;

  /** Check if complete */
  isComplete(): boolean;
}

/**
 * Create a token stream from an async generator.
 */
export function createTokenStream(generator: AsyncGenerator<string>): TokenStream {
  let aborted = false;
  let complete = false;

  return {
    async *[Symbol.asyncIterator]() {
      if (aborted) return;

      try {
        for await (const token of generator) {
          if (aborted) break;
          yield token;
        }
      } finally {
        complete = true;
      }
    },

    abort() {
      aborted = true;
    },

    isComplete() {
      return complete || aborted;
    },
  };
}

/**
 * Create a streaming response from a static string.
 */
export function createStaticStream(
  text: string,
  options?: { tokensPerChunk?: number; delayMs?: number },
): AsyncGenerator<string> {
  const tokensPerChunk = options?.tokensPerChunk ?? 1;
  const delayMs = options?.delayMs ?? 0;

  return (async function* () {
    // Simple tokenization by character (in production, use proper tokenizer)
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += tokensPerChunk) {
      chunks.push(text.slice(i, i + tokensPerChunk));
    }

    for (const chunk of chunks) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      yield chunk;
    }
  })();
}

/**
 * Create response streamer.
 */
export function createResponseStreamer(options?: {
  idGen?: () => string;
  now?: () => number;
}): ResponseStreamer {
  const now = options?.now ?? Date.now;
  const idGen =
    options?.idGen ??
    (() => `chunk_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`);

  const states = new Map<string, StreamState>();

  return {
    async *stream(response, streamOptions = {}) {
      const chunkSize = streamOptions.chunkSize ?? 1;
      const chunkDelay = streamOptions.chunkDelay ?? 0;
      const includeMetadata = streamOptions.includeMetadata ?? true;

      let index = 0;
      const startedAt = now();
      const streamId = idGen();

      // Initialize stream state
      states.set(streamId, {
        active: true,
        index: 0,
        bytesSent: 0,
        startedAt,
        lastChunkAt: startedAt,
      });

      // Emit start event
      yield {
        id: idGen(),
        type: 'control',
        content: '',
        isFinal: false,
        index: index++,
        timestamp: now(),
        metadata: { control: 'start', streamId },
      };

      try {
        if (typeof response === 'string') {
          // Stream static string
          const stream = createStaticStream(response, {
            tokensPerChunk: chunkSize,
            delayMs: chunkDelay,
          });

          for await (const chunk of stream) {
            if (streamOptions.signal?.aborted) {
              throw new Error('Stream aborted');
            }

            const streamChunk: StreamChunk = {
              id: idGen(),
              type: 'text',
              content: chunk,
              isFinal: false,
              index: index++,
              timestamp: now(),
            };

            if (includeMetadata) {
              streamChunk.metadata = { streamId };
            }

            // Update state
            const state = states.get(streamId);
            if (state) {
              state.index = index;
              state.bytesSent += chunk.length;
              state.lastChunkAt = now();
            }

            // Callback
            streamOptions.onChunk?.(streamChunk);

            yield streamChunk;
          }
        } else {
          // Stream from async generator
          for await (const chunk of response) {
            if (streamOptions.signal?.aborted) {
              throw new Error('Stream aborted');
            }

            const streamChunk: StreamChunk = {
              id: idGen(),
              type: 'text',
              content: chunk,
              isFinal: false,
              index: index++,
              timestamp: now(),
            };

            if (includeMetadata) {
              streamChunk.metadata = { streamId };
            }

            // Update state
            const state = states.get(streamId);
            if (state) {
              state.index = index;
              state.bytesSent += chunk.length;
              state.lastChunkAt = now();
            }

            // Callback
            streamOptions.onChunk?.(streamChunk);

            yield streamChunk;
          }
        }

        // Emit end event
        const endChunk: StreamChunk = {
          id: idGen(),
          type: 'control',
          content: '',
          isFinal: true,
          index: index++,
          timestamp: now(),
          metadata: { control: 'end', streamId },
        };

        streamOptions.onChunk?.(endChunk);
        yield endChunk;

        // Mark complete
        const state = states.get(streamId);
        if (state) {
          state.active = false;
        }

        streamOptions.onComplete?.();
      } catch (err) {
        const errorChunk: StreamChunk = {
          id: idGen(),
          type: 'error',
          content: err instanceof Error ? err.message : String(err),
          isFinal: true,
          index: index++,
          timestamp: now(),
          metadata: { streamId },
        };

        streamOptions.onError?.(err instanceof Error ? err : new Error(String(err)));
        yield errorChunk;

        // Mark complete
        const state = states.get(streamId);
        if (state) {
          state.active = false;
        }
      }
    },

    toSSE(chunk) {
      const data = JSON.stringify({
        type: chunk.type,
        content: chunk.content,
        isFinal: chunk.isFinal,
        index: chunk.index,
        timestamp: chunk.timestamp,
        metadata: chunk.metadata,
      });

      return {
        event: chunk.type === 'control' ? 'control' : 'message',
        data,
        id: chunk.id,
      };
    },

    toWebSocket(chunk) {
      return JSON.stringify({
        id: chunk.id,
        type: chunk.type,
        content: chunk.content,
        isFinal: chunk.isFinal,
        index: chunk.index,
        timestamp: chunk.timestamp,
        metadata: chunk.metadata,
      });
    },

    async *multiplex(streams) {
      const streamStates = new Map(streams.map((s) => [s.id, { active: true, index: 0 }]));

      // Simple round-robin multiplexing
      while (Array.from(streamStates.values()).some((s) => s.active)) {
        for (const stream of streams) {
          const state = streamStates.get(stream.id);
          if (!state || !state.active) continue;

          const { value, done } = await stream.source.next();

          if (done) {
            state.active = false;
            continue;
          }

          yield { streamId: stream.id, chunk: value };
          state.index++;
        }
      }
    },

    getState(streamId) {
      return states.get(streamId) ?? null;
    },
  };
}

/**
 * SSE formatter for HTTP responses.
 */
export function formatSSE(event: StreamEvent): string {
  let lines = `event: ${event.event}\n`;
  lines += `data: ${event.data}\n`;
  if (event.id) {
    lines += `id: ${event.id}\n`;
  }
  if (event.retry) {
    lines += `retry: ${event.retry}\n`;
  }
  lines += '\n';
  return lines;
}

/**
 * Create an SSE stream from chunks.
 */
export async function* asSSEStream(
  chunks: AsyncGenerator<StreamChunk>,
  streamer: ResponseStreamer,
): AsyncGenerator<string> {
  for await (const chunk of chunks) {
    const event = streamer.toSSE(chunk);
    yield formatSSE(event);
  }

  // Send final done event
  yield formatSSE({
    event: 'done',
    data: '{}',
  });
}

/**
 * Accumulate stream chunks into a full response.
 */
export async function accumulateStream(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    if (chunk.type === 'text' || chunk.type === 'token') {
      chunks.push(chunk.content);
    }

    if (chunk.isFinal) {
      break;
    }
  }

  return chunks.join('');
}

/**
 * Create a filtered stream that only emits certain chunk types.
 */
export async function* filterStream(
  stream: AsyncGenerator<StreamChunk>,
  types: Set<StreamChunkType>,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of stream) {
    if (types.has(chunk.type)) {
      yield chunk;
    }

    if (chunk.isFinal) {
      break;
    }
  }
}

/**
 * Transform stream chunks.
 */
export async function* transformStream(
  stream: AsyncGenerator<StreamChunk>,
  transform: (chunk: StreamChunk) => StreamChunk,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of stream) {
    yield transform(chunk);

    if (chunk.isFinal) {
      break;
    }
  }
}
