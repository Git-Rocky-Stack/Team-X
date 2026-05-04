/**
 * Advanced Observability - Distributed Tracing
 *
 * Provides distributed tracing, span correlation, and request lifecycle
 * tracking across all AI components (RAG, agentic loop, embeddings, etc.).
 *
 * Phase 5 — M30 (Phase 3 enhancement).
 */

/**
 * Trace ID format (UUID v4 compatible).
 */
export type TraceId = string & { readonly __brand: unique symbol };

/**
 * Span ID format (16-char hex).
 */
export type SpanId = string & { readonly __brand: unique symbol };

/**
 * Trace state for context propagation.
 */
export interface TraceState {
  /** Trace ID */
  traceId: TraceId;

  /** Current span ID */
  spanId: SpanId;

  /** Parent span ID (if any) */
  parentSpanId?: SpanId;

  /** Sampled flag */
  sampled: boolean;

  /** Trace state key-value pairs for vendor-specific data */
  vendor?: Map<string, string>;
}

/**
 * Span kind.
 */
export type SpanKind =
  | 'internal'    // Internal operation
  | 'server'      // Incoming request
  | 'client'      // Outgoing request
  | 'producer'    // Message publisher
  | 'consumer';   // Message subscriber

/**
 * Span status.
 */
export interface SpanStatus {
  /** Status code */
  code: 'ok' | 'error';

  /** Description (for errors) */
  description?: string;
}

/**
 * Attribute value types.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | Array<string>
  | Array<number>
  | Array<boolean>;

/**
 * Span representing a unit of work.
 */
export interface Span {
  /** Span context */
  context: TraceState;

  /** Span name */
  name: string;

  /** Span kind */
  kind: SpanKind;

  /** Start timestamp (nanoseconds since epoch) */
  startTime: bigint;

  /** End timestamp (optional until span completes) */
  endTime?: bigint;

  /** Span attributes */
  attributes: Map<string, AttributeValue>;

  /** Events (timed annotations) */
  events: SpanEvent[];

  /** Links to other spans */
  links: SpanLink[];

  /** Span status */
  status: SpanStatus;

  /** Child spans */
  children: Span[];
}

/**
 * Span event (timed annotation).
 */
export interface SpanEvent {
  /** Event name */
  name: string;

  /** Event timestamp */
  timestamp: bigint;

  /** Event attributes */
  attributes: Map<string, AttributeValue>;
}

/**
 * Link between spans.
 */
export interface SpanLink {
  /** Linked span context */
  context: TraceState;

  /** Link attributes */
  attributes: Map<string, AttributeValue>;
}

/**
 * Span processor interface.
 */
export interface SpanProcessor {
  /** Called when a span is started */
  onStart(span: Span): void;

  /** Called when a span ends */
  onEnd(span: Span): void;

  /** Called when an error occurs */
  onError(exception: unknown, span: Span): void;

  /** Force flush any buffered spans */
  forceFlush?: () => Promise<void>;

  /** Shutdown the processor */
  shutdown?: () => Promise<void>;
}

/**
 * Tracer options.
 */
export interface TracerOptions {
  /** Tracer name (usually component name) */
  name: string;

  /** Tracer version */
  version?: string;

  /** Schema URL */
  schemaUrl?: string;
}

/**
 * Tracer interface for creating spans.
 */
export interface Tracer {
  /** Get current trace context */
  getContext(): TraceState | null;

  /** Set current trace context */
  setContext(context: TraceState): void;

  /** Clear current trace context */
  clearContext(): void;

  /**
   * Start a new span.
   */
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, AttributeValue>;
      links?: SpanLink[];
      startTime?: bigint;
    }
  ): Span;

  /**
   * Start a span with automatic parent detection.
   */
  startActiveSpan(
    name: string,
    fn: (span: Span) => Promise<unknown> | unknown,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, AttributeValue>;
      links?: SpanLink[];
      startTime?: bigint;
    }
  ): Promise<Span>;

  /**
   * End a span.
   */
  endSpan(span: Span, endTime?: bigint, status?: SpanStatus): void;

  /**
   * Record an exception in a span.
   */
  recordException(span: Span, exception: unknown, attributes?: Record<string, AttributeValue>): void;

  /**
   * Add an event to a span.
   */
  addEvent(span: Span, name: string, attributes?: Record<string, AttributeValue>): void;

  /**
   * Set attributes on a span.
   */
  setAttributes(span: Span, attributes: Record<string, AttributeValue>): void;

  /**
   * Get a trace header for propagation.
   */
  injectTraceHeader(context: TraceState): string;

  /**
   * Extract trace context from a header.
   */
  extractTraceHeader(header: string): TraceState | null;

  /**
   * Create a trace carrier for cross-process propagation.
   */
  injectCarrier(context: TraceState): Record<string, string>;

  /**
   * Extract trace context from a carrier.
   */
  extractCarrier(carrier: Record<string, string>): TraceState | null;

  /**
   * Export trace data (for debugging/analysis).
   */
  exportTraces(): string;
}

/**
 * Component-specific tracer interfaces.
 */

/**
 * RAG tracer for retrieval operations.
 */
export interface RagTracer extends Tracer {
  /**
   * Trace a retrieval operation.
   */
  traceRetrieval(params: {
    query: string;
    topK: number;
    threshold: number;
    fn: () => Promise<unknown>;
  }): Promise<Span>;

  /**
   * Trace an indexing operation.
   */
  traceIndexing(params: {
    sourceId: string;
    sourceType: string;
    contentLength: number;
    fn: () => Promise<number>;
  }): Promise<Span>;
}

/**
 * Agentic loop tracer.
 */
export interface AgentTracer extends Tracer {
  /**
   * Trace a loop run.
   */
  traceLoop(params: {
    query: string;
    maxSteps: number;
    fn: () => Promise<unknown>;
  }): Promise<Span>;

  /**
   * Trace a tool call.
   */
  traceToolCall(params: {
    toolName: string;
    args: Record<string, unknown>;
    fn: () => Promise<unknown>;
  }): Promise<Span>;
}

/**
 * LLM tracer for completion calls.
 */
export interface LlmTracer extends Tracer {
  /**
   * Trace an LLM completion.
   */
  traceCompletion(params: {
    model: string;
    provider: string;
    promptTokens: number;
    fn: () => Promise<{ completionTokens: number; text: string }>;
  }): Promise<Span>;
}

/**
 * In-memory tracer implementation.
 */
export function createTracer(options: TracerOptions & {
  processors?: SpanProcessor[];
  now?: () => bigint;
  idGen?: () => string;
}): Tracer {
  const now = options.now ?? (() => BigInt(Date.now()) * 1_000_000n);
  const idGen = options.idGen ?? (() => {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  });

  const processors = options.processors ?? [];
  const rootSpans: Span[] = [];
  const activeSpans = new Map<string, Span>();
  let currentContext: TraceState | null = null;

  // Helper to generate trace ID
  function generateTraceId(): TraceId {
    return idGen() as TraceId;
  }

  // Helper to generate span ID (16-char hex)
  function generateSpanId(): SpanId {
    const id = Math.random().toString(16).slice(2);
    return id.padEnd(16, '0').slice(0, 16) as SpanId;
  }

  return {
    getContext() {
      return currentContext;
    },

    setContext(context) {
      currentContext = context;
    },

    clearContext() {
      currentContext = null;
    },

    startSpan(name, opts = {}) {
      const parentContext = currentContext;
      const traceId = parentContext?.traceId ?? generateTraceId();
      const spanId = generateSpanId();

      const context: TraceState = {
        traceId,
        spanId,
        parentSpanId: parentContext?.spanId,
        sampled: parentContext?.sampled ?? Math.random() < 0.1, // 10% default sampling
      };

      const span: Span = {
        context,
        name,
        kind: opts.kind ?? 'internal',
        startTime: opts.startTime ?? now(),
        attributes: new Map(Object.entries(opts.attributes ?? {})),
        events: [],
        links: opts.links ?? [],
        status: { code: 'ok' },
        children: [],
      };

      // Set this span as active
      currentContext = context;
      activeSpans.set(spanId, span);

      // Notify processors
      for (const processor of processors) {
        try {
          processor.onStart(span);
        } catch {}
      }

      return span;
    },

    async startActiveSpan(name, fn, opts = {}) {
      const span = this.startSpan(name, opts);

      try {
        await fn(span);
        this.endSpan(span, undefined, { code: 'ok' });
        return span;
      } catch (err) {
        this.recordException(span, err);
        this.endSpan(span, undefined, { code: 'error', description: String(err) });
        throw err;
      }
    },

    endSpan(span, endTime, status) {
      span.endTime = endTime ?? now();
      if (status) {
        span.status = status;
      }

      // Pop from stack
      if (currentContext?.spanId === span.context.spanId) {
        currentContext = span.context.parentSpanId
          ? {
              ...span.context,
              spanId: span.context.parentSpanId,
            }
          : null;
      }

      activeSpans.delete(span.context.spanId);

      // Add to parent if exists
      if (span.context.parentSpanId) {
        const parent = activeSpans.get(span.context.parentSpanId);
        if (parent) {
          parent.children.push(span);
        }
      } else {
        rootSpans.push(span);
      }

      // Notify processors
      for (const processor of processors) {
        try {
          processor.onEnd(span);
        } catch {}
      }
    },

    recordException(span, exception: unknown, attributes = {}) {
      const attrs = new Map(Object.entries(attributes));
      attrs.set('exception.type', (exception as { constructor?: { name?: string } })?.constructor?.name ?? 'Unknown');
      attrs.set('exception.message', exception instanceof Error ? exception.message : String(exception));

      if (exception instanceof Error && exception.stack) {
        attrs.set('exception.stacktrace', exception.stack);
      }

      span.events.push({
        name: 'exception',
        timestamp: now(),
        attributes: attrs,
      });

      // Update status
      span.status = {
        code: 'error',
        description: exception instanceof Error ? exception.message : String(exception),
      };

      // Notify processors
      for (const processor of processors) {
        try {
          processor.onError(exception, span);
        } catch {}
      }
    },

    addEvent(span, name, attributes = {}) {
      span.events.push({
        name,
        timestamp: now(),
        attributes: new Map(Object.entries(attributes)),
      });
    },

    setAttributes(span, attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.attributes.set(key, value);
      }
    },

    injectTraceHeader(context) {
      // W3C Trace Context format: traceparent: version-traceid-parentid-flags
      const flags = context.sampled ? '01' : '00';
      return `${context.traceId}-${context.spanId}-${flags}`;
    },

    extractTraceHeader(header) {
      // Parse W3C Trace Context format
      const match = /^([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/.exec(header);
      if (!match) return null;

      const [, traceId, spanId, flags] = match;
      return {
        traceId: traceId as TraceId,
        spanId: spanId as SpanId,
        sampled: flags === '01',
      };
    },

    injectCarrier(context) {
      return {
        'traceparent': this.injectTraceHeader(context),
        'tracestate': context.vendor ? Array.from(context.vendor.entries()).map(([k, v]) => `${k}=${v}`).join(',') : '',
      };
    },

    extractCarrier(carrier) {
      const traceparent = carrier['traceparent'];
      if (traceparent) {
        const context = this.extractTraceHeader(traceparent);
        if (context) {
          // Parse tracestate if present
          const tracestate = carrier['tracestate'];
          if (tracestate) {
            const vendor = new Map<string, string>();
            for (const pair of tracestate.split(',')) {
              const [key, value] = pair.split('=');
              if (key && value) vendor.set(key, value);
            }
            context.vendor = vendor;
          }
          return context;
        }
      }
      return null;
    },

    exportTraces() {
      return JSON.stringify(
        rootSpans.map((span) => spanToJson(span)),
        null,
        2
      );
    },
  };
}

/**
 * Convert span to JSON-serializable object.
 */
function spanToJson(span: Span): unknown {
  return {
    context: {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      sampled: span.context.sampled,
    },
    name: span.name,
    kind: span.kind,
    startTime: span.startTime.toString(),
    endTime: span.endTime?.toString(),
    attributes: Object.fromEntries(span.attributes),
    events: span.events.map((e) => ({
      name: e.name,
      timestamp: e.timestamp.toString(),
      attributes: Object.fromEntries(e.attributes),
    })),
    links: span.links.map((l) => ({
      context: l.context,
      attributes: Object.fromEntries(l.attributes),
    })),
    status: span.status,
    children: span.children.map(spanToJson),
  };
}

/**
 * Create a console logging span processor.
 */
export function createConsoleSpanProcessor(): SpanProcessor {
  return {
    onStart(span) {
      console.log(`[TRACE] Start span: ${span.name} (${span.context.spanId.slice(0, 8)})`);
    },

    onEnd(span) {
      const duration = span.endTime
        ? Number((span.endTime - span.startTime) / 1_000_000n)
        : 0;
      console.log(
        `[TRACE] End span: ${span.name} (${span.context.spanId.slice(0, 8)}) - ${duration}ms - ${span.status.code}`
      );
    },

    onError(exception, span) {
      console.error(
        `[TRACE] Error in span: ${span.name}`,
        exception
      );
    },
  };
}

/**
 * Create a RAG-specific tracer.
 */
export function createRagTracer(options: TracerOptions & {
  processors?: SpanProcessor[];
}): RagTracer {
  const baseTracer = createTracer(options);

  return {
    ...baseTracer,

    async traceRetrieval(params) {
      return baseTracer.startActiveSpan(
        'rag.retrieval',
        async (span) => {
          baseTracer.setAttributes(span, {
            'rag.query': params.query,
            'rag.top_k': params.topK,
            'rag.threshold': params.threshold,
          });

          baseTracer.addEvent(span, 'query_start', {
            'query.length': params.query.length,
          });

          const start = performance.now();
          try {
            await params.fn();

            baseTracer.addEvent(span, 'query_complete', {
              'duration_ms': performance.now() - start,
            });
          } catch (err) {
            baseTracer.addEvent(span, 'query_error', {
              'error': String(err),
            });
            throw err;
          }

          return span;
        },
        { kind: 'client' }
      );
    },

    async traceIndexing(params) {
      return baseTracer.startActiveSpan(
        'rag.indexing',
        async (span) => {
          baseTracer.setAttributes(span, {
            'rag.source_id': params.sourceId,
            'rag.source_type': params.sourceType,
            'rag.content_length': params.contentLength,
          });

          const chunkCount = await params.fn();

          baseTracer.setAttributes(span, {
            'rag.chunk_count': chunkCount,
          });

          return span;
        },
        { kind: 'internal' }
      );
    },
  };
}

/**
 * Create an agent-specific tracer.
 */
export function createAgentTracer(options: TracerOptions & {
  processors?: SpanProcessor[];
}): AgentTracer {
  const baseTracer = createTracer(options);

  return {
    ...baseTracer,

    async traceLoop(params) {
      return baseTracer.startActiveSpan(
        'agent.loop',
        async (span) => {
          baseTracer.setAttributes(span, {
            'agent.query': params.query,
            'agent.max_steps': params.maxSteps,
          });

          baseTracer.addEvent(span, 'loop_start');

          try {
            await params.fn();

            baseTracer.addEvent(span, 'loop_complete');
          } catch (err) {
            baseTracer.addEvent(span, 'loop_error', {
              'error': String(err),
            });
            throw err;
          }

          return span;
        },
        { kind: 'internal' }
      );
    },

    async traceToolCall(params) {
      return baseTracer.startActiveSpan(
        `agent.tool.${params.toolName}`,
        async (span) => {
          baseTracer.setAttributes(span, {
            'agent.tool': params.toolName,
            'agent.args': JSON.stringify(params.args),
          });

          baseTracer.addEvent(span, 'tool_call_start');

          try {
            const result = await params.fn();

            baseTracer.addEvent(span, 'tool_call_complete', {
              'result_size': JSON.stringify(result).length,
            });

            return span;
          } catch (err) {
            baseTracer.addEvent(span, 'tool_call_error', {
              'error': String(err),
            });
            throw err;
          }
        },
        { kind: 'client' }
      );
    },
  };
}

/**
 * Create an LLM-specific tracer.
 */
export function createLlmTracer(options: TracerOptions & {
  processors?: SpanProcessor[];
}): LlmTracer {
  const baseTracer = createTracer(options);

  return {
    ...baseTracer,

    async traceCompletion(params) {
      return baseTracer.startActiveSpan(
        'llm.completion',
        async (span) => {
          baseTracer.setAttributes(span, {
            'llm.model': params.model,
            'llm.provider': params.provider,
            'llm.prompt_tokens': params.promptTokens,
          });

          baseTracer.addEvent(span, 'completion_start');

      try {
        const result = await params.fn();

        baseTracer.setAttributes(span, {
          'llm.completion_tokens': result.completionTokens,
        });

        baseTracer.addEvent(span, 'completion_complete', {
          'total_tokens': params.promptTokens + result.completionTokens,
        });

        return span;
      } catch (err) {
        baseTracer.addEvent(span, 'completion_error', {
          'error': String(err),
        });
        throw err;
      }
    },
    { kind: 'client' }
  );
},
};
}

/**
 * Trace propagation utility.
 */
export function propagateTrace<T extends { headers?: Record<string, string> }>(
  request: T,
  tracer: Tracer
): T {
  const context = tracer.getContext();
  if (!context) return request;

  const carrier = tracer.injectCarrier(context);
  return {
    ...request,
    headers: {
      ...request.headers,
      ...carrier,
    },
  };
}
