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
