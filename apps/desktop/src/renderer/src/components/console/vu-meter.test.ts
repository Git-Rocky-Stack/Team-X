/**
 * VuMeter — pure math tests (Sweep Phase 1, Task 10).
 *
 * Covers the two exported computations that make the meter *functional*
 * instrumentation per DESIGN.md §VU Discipline: `segmentStates` (zone
 * banding green≤60% / amber≤85% / red above, lit-count quantization, and
 * the single flickering tip at the highest lit segment) and
 * `ballisticsStep` (IEC 60268-17-style exponential integration — ~99% of
 * a step change indicated within 300ms, symmetric attack/release). No DOM
 * involved, so this file stays in the workspace's plain `node` env.
 */
import { describe, expect, it } from 'vitest';

import { ballisticsStep, segmentStates } from './vu-meter';

describe('segmentStates', () => {
  it('lights the right count: value 0.5 of 16 segments lights 8', () => {
    const segs = segmentStates(0.5, 16);
    expect(segs.filter((s) => s.lit)).toHaveLength(8);
  });

  it('zones: green to 60%, amber to 85%, red above', () => {
    const segs = segmentStates(1, 20);
    expect(segs[0]?.zone).toBe('g');
    expect(segs[11]?.zone).toBe('g'); // 12/20 = 60%
    expect(segs[12]?.zone).toBe('a');
    expect(segs[16]?.zone).toBe('a'); // 17/20 = 85%
    expect(segs[17]?.zone).toBe('r');
    expect(segs[19]?.zone).toBe('r');
  });

  it('marks exactly the highest lit segment as the flickering tip', () => {
    const segs = segmentStates(0.5, 16);
    expect(segs.findIndex((s) => s.tip)).toBe(7);
    expect(segs.filter((s) => s.tip)).toHaveLength(1);
  });

  it('value 0 lights nothing and has no tip', () => {
    const segs = segmentStates(0, 16);
    expect(segs.some((s) => s.lit)).toBe(false);
    expect(segs.some((s) => s.tip)).toBe(false);
  });

  it('clamps out-of-range values', () => {
    expect(segmentStates(1.7, 8).filter((s) => s.lit)).toHaveLength(8);
    expect(segmentStates(-1, 8).some((s) => s.lit)).toBe(false);
  });
});

describe('ballisticsStep (IEC 60268-17: ~300ms attack / ~300ms release)', () => {
  it('moves toward the target without overshooting it in one big step', () => {
    const next = ballisticsStep(0, 1, 150);
    expect(next).toBeGreaterThan(0.3);
    expect(next).toBeLessThan(1);
  });

  it('reaches ~99% of target within 300ms of accumulated steps', () => {
    let v = 0;
    for (let t = 0; t < 300; t += 16) v = ballisticsStep(v, 1, 16);
    expect(v).toBeGreaterThan(0.95);
  });

  it('releases symmetrically', () => {
    let v = 1;
    for (let t = 0; t < 300; t += 16) v = ballisticsStep(v, 0, 16);
    expect(v).toBeLessThan(0.05);
  });

  it('is stable at the target', () => {
    expect(ballisticsStep(0.5, 0.5, 16)).toBe(0.5);
  });
});
