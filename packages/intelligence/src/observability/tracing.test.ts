/**
 * Trace sampling.
 *
 * The tracer used to stamp `sampled` from a hard-coded `Math.random() < 0.1`
 * and then record every span regardless, so the flag meant nothing and a
 * caller's sample rate (Enhanced AI's `traceSampleRate`) had nowhere to go.
 * A root span is now recorded with probability `sampleRate`; every span
 * under it inherits the root's decision, so a trace is kept or dropped whole.
 */

import { describe, expect, it, vi } from 'vitest';
import { type SpanProcessor, createTracer } from './tracing.js';

function recordedNames(exported: string): string[] {
  const walk = (spans: Array<{ name: string; children: unknown[] }>): string[] =>
    spans.flatMap((s) => [s.name, ...walk(s.children as typeof spans)]);
  return walk(JSON.parse(exported));
}

function spyProcessor(): SpanProcessor & { started: string[]; ended: string[] } {
  const started: string[] = [];
  const ended: string[] = [];
  return {
    started,
    ended,
    onStart: (span) => started.push(span.name),
    onEnd: (span) => ended.push(span.name),
    onError: vi.fn(),
  };
}

describe('createTracer — sampling', () => {
  it('records every trace when no sample rate is given', () => {
    const tracer = createTracer({ name: 't', random: () => 0.999 });

    const root = tracer.startSpan('root');
    tracer.endSpan(root);

    expect(root.context.sampled).toBe(true);
    expect(recordedNames(tracer.exportTraces())).toEqual(['root']);
  });

  it('records a root span when the draw falls under the sample rate', () => {
    const tracer = createTracer({ name: 't', sampleRate: 0.25, random: () => 0.2 });

    const root = tracer.startSpan('root');
    tracer.endSpan(root);

    expect(root.context.sampled).toBe(true);
    expect(recordedNames(tracer.exportTraces())).toEqual(['root']);
  });

  it('drops a root span — and tells no processor — when the draw is at or above the rate', () => {
    const processor = spyProcessor();
    const tracer = createTracer({
      name: 't',
      sampleRate: 0.25,
      random: () => 0.25,
      processors: [processor],
    });

    const root = tracer.startSpan('root');
    tracer.endSpan(root);

    expect(root.context.sampled).toBe(false);
    expect(tracer.exportTraces()).toBe('[]');
    expect(processor.started).toEqual([]);
    expect(processor.ended).toEqual([]);
  });

  it("makes child spans follow the root's decision instead of drawing again", () => {
    const draws = [0.1, 0.9, 0.9];
    const random = vi.fn(() => draws.shift() ?? 0.9);
    const tracer = createTracer({ name: 't', sampleRate: 0.5, random });

    const root = tracer.startSpan('root');
    const child = tracer.startSpan('child');
    tracer.endSpan(child);
    tracer.endSpan(root);

    expect(random).toHaveBeenCalledTimes(1);
    expect(child.context.sampled).toBe(true);
    expect(recordedNames(tracer.exportTraces())).toEqual(['root', 'child']);
  });

  it('drops the children of a dropped root', () => {
    const draws = [0.9, 0.1];
    const tracer = createTracer({ name: 't', sampleRate: 0.5, random: () => draws.shift() ?? 0 });

    const root = tracer.startSpan('root');
    const child = tracer.startSpan('child');
    tracer.endSpan(child);
    tracer.endSpan(root);

    expect(child.context.sampled).toBe(false);
    expect(tracer.exportTraces()).toBe('[]');
  });

  it('starts a fresh decision for the next trace once the root ends', () => {
    const draws = [0.9, 0.1];
    const tracer = createTracer({ name: 't', sampleRate: 0.5, random: () => draws.shift() ?? 0 });

    const dropped = tracer.startSpan('first');
    tracer.endSpan(dropped);
    const kept = tracer.startSpan('second');
    tracer.endSpan(kept);

    expect(recordedNames(tracer.exportTraces())).toEqual(['second']);
  });

  it('rejects a sample rate outside [0, 1]', () => {
    expect(() => createTracer({ name: 't', sampleRate: 1.5 })).toThrow(/sampleRate/);
    expect(() => createTracer({ name: 't', sampleRate: -0.1 })).toThrow(/sampleRate/);
    expect(() => createTracer({ name: 't', sampleRate: Number.NaN })).toThrow(/sampleRate/);
  });
});

// ---------------------------------------------------------------------------
// Beyond sampling (audit 2026-10-07 P1-6: ~30% covered). The unified service
// traces its agent loop with createAgentTracer; these pin what it records.
// ---------------------------------------------------------------------------

import {
  createAgentTracer,
  createConsoleSpanProcessor,
  createLlmTracer,
  createRagTracer,
  propagateTrace,
} from './tracing.js';

type Exported = {
  name: string;
  kind: string;
  status: { code: string; description?: string };
  attributes: Record<string, unknown>;
  events: Array<{ name: string; attributes: Record<string, unknown> }>;
  children: Exported[];
};

describe('createTracer — spans', () => {
  it('nests a span started under another as its child', () => {
    const tracer = createTracer({ name: 't' });
    const root = tracer.startSpan('root', { attributes: { a: 1 } });
    const child = tracer.startSpan('child', { kind: 'client' });
    tracer.endSpan(child);
    const sibling = tracer.startSpan('sibling');
    tracer.endSpan(sibling);
    tracer.endSpan(root);

    const [exported] = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(exported?.name).toBe('root');
    expect(exported?.attributes).toEqual({ a: 1 });
    expect(exported?.children.map((c) => [c.name, c.kind])).toEqual([
      ['child', 'client'],
      ['sibling', 'internal'],
    ]);
    expect(tracer.getContext()).toBeNull();
  });

  it('records an exception as an error status, an event, and a processor callback', async () => {
    const processor = spyProcessor();
    const tracer = createTracer({ name: 't', processors: [processor] });
    await expect(
      tracer.startActiveSpan('boom', () => {
        throw new TypeError('bad input');
      }),
    ).rejects.toThrow('bad input');

    const [span] = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(span?.status).toEqual({ code: 'error', description: 'TypeError: bad input' });
    expect(span?.events[0]?.name).toBe('exception');
    expect(span?.events[0]?.attributes).toMatchObject({
      'exception.type': 'TypeError',
      'exception.message': 'bad input',
    });
    expect(processor.onError).toHaveBeenCalledOnce();
  });

  it('keeps going when a processor throws', () => {
    const tracer = createTracer({
      name: 't',
      processors: [
        {
          onStart: () => {
            throw new Error('x');
          },
          onEnd: () => {
            throw new Error('y');
          },
          onError: () => undefined,
        },
      ],
    });
    const span = tracer.startSpan('s');
    expect(() => tracer.endSpan(span)).not.toThrow();
  });
});

describe('createTracer — W3C trace-context propagation', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = '00f067aa0ba902b7';

  it('writes a standard traceparent header (version-traceid-spanid-flags)', () => {
    const tracer = createTracer({ name: 't' });
    expect(tracer.injectTraceHeader({ traceId, spanId, sampled: true } as never)).toBe(
      `00-${traceId}-${spanId}-01`,
    );
  });

  it('reads a standard traceparent header from another service', () => {
    const tracer = createTracer({ name: 't' });
    expect(tracer.extractTraceHeader(`00-${traceId}-${spanId}-00`)).toEqual({
      traceId,
      spanId,
      sampled: false,
    });
    expect(tracer.extractTraceHeader('garbage')).toBeNull();
  });

  it('round-trips a carrier with tracestate', () => {
    const tracer = createTracer({ name: 't' });
    const context = {
      traceId,
      spanId,
      sampled: true,
      vendor: new Map([['teamx', 'abc']]),
    } as never;
    const carrier = tracer.injectCarrier(context);
    expect(carrier).toEqual({ traceparent: `00-${traceId}-${spanId}-01`, tracestate: 'teamx=abc' });
    const back = tracer.extractCarrier(carrier);
    expect(back).toMatchObject({ traceId, spanId, sampled: true });
    expect(back?.vendor?.get('teamx')).toBe('abc');
    expect(tracer.extractCarrier({})).toBeNull();
  });

  it('propagateTrace adds the carrier to a request only inside a trace', () => {
    const tracer = createTracer({ name: 't' });
    expect(propagateTrace({ headers: { a: '1' } }, tracer)).toEqual({ headers: { a: '1' } });
    tracer.startSpan('outbound');
    const req = propagateTrace({ headers: { a: '1' } }, tracer);
    expect(req.headers?.a).toBe('1');
    expect(req.headers?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });
});

describe('component tracers', () => {
  it('createAgentTracer records the loop and each tool call', async () => {
    const tracer = createAgentTracer({ name: 'agent' });
    await tracer.traceLoop({
      query: 'plan the launch',
      maxSteps: 4,
      fn: async () => {
        await tracer.traceToolCall({
          toolName: 'search',
          args: { q: 'launch' },
          fn: async () => ({ hits: 2 }),
        });
      },
    });

    const [loop] = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(loop?.name).toBe('agent.loop');
    expect(loop?.attributes).toMatchObject({
      'agent.query': 'plan the launch',
      'agent.max_steps': 4,
    });
    expect(loop?.events.map((e) => e.name)).toEqual(['loop_start', 'loop_complete']);
    const [tool] = loop?.children ?? [];
    expect(tool?.name).toBe('agent.tool.search');
    expect(tool?.attributes).toMatchObject({
      'agent.tool': 'search',
      'agent.args': '{"q":"launch"}',
    });
    expect(tool?.events.map((e) => e.name)).toEqual(['tool_call_start', 'tool_call_complete']);
  });

  it('createAgentTracer marks a failing loop and tool call as errors', async () => {
    const tracer = createAgentTracer({ name: 'agent' });
    await expect(
      tracer.traceToolCall({
        toolName: 'write',
        args: {},
        fn: async () => {
          throw new Error('denied');
        },
      }),
    ).rejects.toThrow('denied');
    await expect(
      tracer.traceLoop({
        query: 'q',
        maxSteps: 1,
        fn: async () => {
          throw new Error('stuck');
        },
      }),
    ).rejects.toThrow('stuck');
    const spans = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(spans.map((s) => [s.name, s.status.code])).toEqual([
      ['agent.tool.write', 'error'],
      ['agent.loop', 'error'],
    ]);
    expect(spans[0]?.events.map((e) => e.name)).toContain('tool_call_error');
    expect(spans[1]?.events.map((e) => e.name)).toContain('loop_error');
  });

  it('createRagTracer records retrieval and indexing', async () => {
    const tracer = createRagTracer({ name: 'rag' });
    await tracer.traceRetrieval({ query: 'why', topK: 5, threshold: 0.3, fn: async () => [] });
    await tracer.traceIndexing({
      sourceId: 's1',
      sourceType: 'ticket',
      contentLength: 120,
      fn: async () => 3,
    });
    await expect(
      tracer.traceRetrieval({
        query: 'x',
        topK: 1,
        threshold: 0,
        fn: async () => {
          throw new Error('index offline');
        },
      }),
    ).rejects.toThrow('index offline');

    const spans = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(spans.map((s) => s.name)).toEqual(['rag.retrieval', 'rag.indexing', 'rag.retrieval']);
    expect(spans[1]?.attributes).toMatchObject({
      'rag.chunk_count': 3,
      'rag.source_type': 'ticket',
    });
    expect(spans[2]?.events.map((e) => e.name)).toContain('query_error');
  });

  it('createLlmTracer records token counts', async () => {
    const tracer = createLlmTracer({ name: 'llm' });
    await tracer.traceCompletion({
      model: 'm',
      provider: 'p',
      promptTokens: 10,
      fn: async () => ({ completionTokens: 5, text: 'ok' }),
    });
    const [span] = JSON.parse(tracer.exportTraces()) as Exported[];
    expect(span?.attributes).toMatchObject({ 'llm.prompt_tokens': 10, 'llm.completion_tokens': 5 });
    expect(span?.events.find((e) => e.name === 'completion_complete')?.attributes).toEqual({
      total_tokens: 15,
    });
  });

  it('the console processor logs start, end and errors', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tracer = createTracer({ name: 't', processors: [createConsoleSpanProcessor()] });
      const span = tracer.startSpan('visible');
      tracer.recordException(span, new Error('e'));
      tracer.endSpan(span);
      expect(log.mock.calls.map((c) => String(c[0]))).toEqual([
        expect.stringContaining('Start span: visible'),
        expect.stringContaining('End span: visible'),
      ]);
      expect(error).toHaveBeenCalledWith('[TRACE] Error in span: visible', expect.any(Error));
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
