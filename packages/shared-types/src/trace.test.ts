/**
 * H4 audit 2026-05-07 — TraceId helper tests.
 */

import { describe, expect, it } from 'vitest';

import { generateTraceId, isTraceId, parseTraceId } from './trace.js';

describe('generateTraceId', () => {
  it('produces a 32-char lowercase hex string', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces a different value on each call (high entropy — collision unlikely)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateTraceId());
    }
    // 1000 unique 128-bit IDs — no collisions expected at this scale.
    expect(ids.size).toBe(1000);
  });

  it('never returns the all-zero W3C-reserved invalid value', () => {
    // Statistically impossible at 128 bits but still worth pinning the
    // explicit guard in trace.ts.
    for (let i = 0; i < 100; i++) {
      expect(generateTraceId()).not.toBe('0'.repeat(32));
    }
  });

  it('output is recognized by its own type guard', () => {
    const id = generateTraceId();
    expect(isTraceId(id)).toBe(true);
  });
});

describe('isTraceId', () => {
  it('accepts valid 32-hex-char strings', () => {
    expect(isTraceId('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isTraceId('a'.repeat(32))).toBe(true);
    expect(isTraceId('f'.repeat(32))).toBe(true);
  });

  it('rejects the all-zero W3C-reserved value', () => {
    expect(isTraceId('0'.repeat(32))).toBe(false);
  });

  it('rejects strings of the wrong length', () => {
    expect(isTraceId('abc')).toBe(false);
    expect(isTraceId('a'.repeat(31))).toBe(false);
    expect(isTraceId('a'.repeat(33))).toBe(false);
    expect(isTraceId('')).toBe(false);
  });

  it('rejects strings with non-hex characters', () => {
    expect(isTraceId('g'.repeat(32))).toBe(false);
    expect(isTraceId('A'.repeat(32))).toBe(false); // uppercase rejected — W3C spec mandates lowercase
    expect(isTraceId('z'.repeat(32))).toBe(false);
    expect(isTraceId(`${'a'.repeat(31)}-`)).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isTraceId(undefined)).toBe(false);
    expect(isTraceId(null)).toBe(false);
    expect(isTraceId(123)).toBe(false);
    expect(isTraceId({})).toBe(false);
    expect(isTraceId([])).toBe(false);
  });
});

describe('parseTraceId', () => {
  it('returns the input as a TraceId when valid', () => {
    const valid = '0123456789abcdef0123456789abcdef';
    expect(parseTraceId(valid)).toBe(valid);
  });

  it('returns null for invalid inputs', () => {
    expect(parseTraceId('abc')).toBeNull();
    expect(parseTraceId('0'.repeat(32))).toBeNull();
    expect(parseTraceId(undefined)).toBeNull();
    expect(parseTraceId(null)).toBeNull();
    expect(parseTraceId('A'.repeat(32))).toBeNull();
  });

  it('round-trips a generated trace ID', () => {
    const generated = generateTraceId();
    expect(parseTraceId(generated)).toBe(generated);
  });
});
