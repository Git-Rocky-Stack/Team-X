import { describe, expect, it } from 'vitest';
import { type CostResult, calcCostUsd } from './cost.js';

describe('calcCostUsd — legacy two-arg form', () => {
  it('computes exact-match Anthropic Opus pricing', () => {
    const r: CostResult = calcCostUsd('claude-opus-4-6', 1000, 1000);
    // 1k input @ $0.015 + 1k output @ $0.075 = $0.090
    expect(r.usd).toBeCloseTo(0.09, 6);
    expect(r.known).toBe(true);
    expect(r.matchedModel).toBe('claude-opus-4-6');
    // Cache components should be zero in legacy form.
    expect(r.breakdown.freshInputUsd).toBeCloseTo(0.015, 6);
    expect(r.breakdown.outputUsd).toBeCloseTo(0.075, 6);
    expect(r.breakdown.cachedInputUsd).toBe(0);
    expect(r.breakdown.cacheWriteUsd).toBe(0);
  });

  it('computes exact-match Anthropic Sonnet pricing', () => {
    const r = calcCostUsd('claude-sonnet-4-6', 2000, 500);
    // 2k input @ $0.003 + 0.5k output @ $0.015 = $0.006 + $0.0075 = $0.0135
    expect(r.usd).toBeCloseTo(0.0135, 6);
    expect(r.known).toBe(true);
  });

  it('computes Haiku pricing with the corrected dated model id (C3)', () => {
    const r = calcCostUsd('claude-haiku-4-5-20251001', 10000, 10000);
    // C3 corrected pricing: 10k input @ $0.001 + 10k output @ $0.005
    //                     = $0.010 + $0.050 = $0.060
    expect(r.usd).toBeCloseTo(0.06, 6);
    expect(r.known).toBe(true);
  });

  it('matches any ollama/* model via wildcard fallback to zero cost', () => {
    const a = calcCostUsd('ollama/qwen2.5:3b', 5000, 5000);
    expect(a.usd).toBe(0);
    expect(a.known).toBe(true);
    expect(a.matchedModel).toBe('ollama/*');

    const b = calcCostUsd('ollama/gemma3:27b', 1, 1);
    expect(b.usd).toBe(0);
    expect(b.known).toBe(true);
  });

  it('returns zero usd and known=false for unknown models', () => {
    const r = calcCostUsd('mystery-model-9000', 1000, 1000);
    expect(r.usd).toBe(0);
    expect(r.known).toBe(false);
    expect(r.matchedModel).toBeNull();
    expect(r.breakdown.freshInputUsd).toBe(0);
  });

  it('handles zero token inputs without crashing', () => {
    const r = calcCostUsd('claude-opus-4-6', 0, 0);
    expect(r.usd).toBe(0);
    expect(r.known).toBe(true);
  });

  it('treats negative tokens as zero (defensive)', () => {
    const r = calcCostUsd('claude-opus-4-6', -100, -100);
    expect(r.usd).toBe(0);
    expect(r.known).toBe(true);
  });
});

describe('calcCostUsd — C3 cache-aware object form', () => {
  it('attributes cache reads at the discounted rate (Anthropic 0.1x)', () => {
    // Sonnet: in=$0.003/1k, cachedIn=$0.0003/1k.
    // 1k fresh + 9k cache-read + 0 cache-write + 0 output.
    const r = calcCostUsd('claude-sonnet-4-6', {
      promptTokens: 1000,
      completionTokens: 0,
      cachedInputTokens: 9000,
      cacheWriteTokens: 0,
    });
    // fresh: 1k * 0.003 = 0.003
    // cached: 9k * 0.0003 = 0.0027
    // total: 0.0057
    expect(r.usd).toBeCloseTo(0.0057, 6);
    expect(r.breakdown.freshInputUsd).toBeCloseTo(0.003, 6);
    expect(r.breakdown.cachedInputUsd).toBeCloseTo(0.0027, 6);
    expect(r.breakdown.cacheWriteUsd).toBe(0);
    expect(r.breakdown.outputUsd).toBe(0);
  });

  it('attributes cache writes at the premium rate (Anthropic 1.25x)', () => {
    // Haiku 4.5: in=$0.001/1k, cacheWrite=$0.00125/1k.
    // 0 fresh + 0 cache-read + 4k cache-write + 0 output.
    const r = calcCostUsd('claude-haiku-4-5-20251001', {
      promptTokens: 0,
      completionTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 4000,
    });
    // 4k * 0.00125 = 0.005
    expect(r.usd).toBeCloseTo(0.005, 6);
    expect(r.breakdown.cacheWriteUsd).toBeCloseTo(0.005, 6);
    expect(r.breakdown.freshInputUsd).toBe(0);
    expect(r.breakdown.cachedInputUsd).toBe(0);
  });

  it('demonstrates the 8-step agentic-loop savings the audit cited', () => {
    // Mini scenario: 8 iterations of a 4k-token Sonnet prefix.
    //
    // WITHOUT caching (every iteration re-bills the full 4k as fresh):
    //   8 * 4000 * 0.003/1k = $0.096 (input only).
    //
    // WITH caching (turn 1 cache-writes 4k; turns 2-8 cache-read 4k):
    //   write @ premium: 4k * 0.00375/1k = $0.015
    //   read  @ discount: 7 * 4000 * 0.0003/1k = $0.0084
    //   total input: $0.0234
    //
    // Effective input cost ratio: 0.0234 / 0.096 ≈ 24% — i.e. 76% saved.
    const noCache = calcCostUsd('claude-sonnet-4-6', 8 * 4000, 0).usd;
    const withCacheWrite = calcCostUsd('claude-sonnet-4-6', {
      promptTokens: 0,
      completionTokens: 0,
      cacheWriteTokens: 4000,
    }).usd;
    const withCacheReads = calcCostUsd('claude-sonnet-4-6', {
      promptTokens: 0,
      completionTokens: 0,
      cachedInputTokens: 7 * 4000,
    }).usd;
    const withCacheTotal = withCacheWrite + withCacheReads;

    expect(noCache).toBeCloseTo(0.096, 6);
    expect(withCacheTotal).toBeCloseTo(0.0234, 6);
    expect(withCacheTotal / noCache).toBeLessThan(0.25);
  });

  it('sums fresh + cached + write + output components for a realistic Anthropic call', () => {
    const r = calcCostUsd('claude-opus-4-6', {
      promptTokens: 500, // fresh
      completionTokens: 800, // output
      cachedInputTokens: 12_000, // huge cache hit
      cacheWriteTokens: 1000, // small new prefix appended
    });
    // Opus: in=0.015, out=0.075, cachedIn=0.0015, cacheWrite=0.01875.
    // fresh:  500   * 0.015    / 1000 = 0.0075
    // cached: 12000 * 0.0015   / 1000 = 0.0180
    // write:  1000  * 0.01875  / 1000 = 0.01875
    // out:    800   * 0.075    / 1000 = 0.06
    // total:  0.10425
    expect(r.usd).toBeCloseTo(0.10425, 6);
    expect(r.breakdown.freshInputUsd).toBeCloseTo(0.0075, 6);
    expect(r.breakdown.cachedInputUsd).toBeCloseTo(0.018, 6);
    expect(r.breakdown.cacheWriteUsd).toBeCloseTo(0.01875, 6);
    expect(r.breakdown.outputUsd).toBeCloseTo(0.06, 6);
  });

  it('treats negative cache token counts as zero (defensive)', () => {
    const r = calcCostUsd('claude-opus-4-6', {
      promptTokens: 100,
      completionTokens: 100,
      cachedInputTokens: -5000,
      cacheWriteTokens: -1000,
    });
    // Negatives clamped to zero — only fresh + out land in the total.
    // 100 * 0.015/1000 + 100 * 0.075/1000 = 0.0015 + 0.0075 = 0.009
    expect(r.usd).toBeCloseTo(0.009, 6);
    expect(r.breakdown.cachedInputUsd).toBe(0);
    expect(r.breakdown.cacheWriteUsd).toBe(0);
  });

  it('priced cache tokens at zero for ollama/* (local cache benefit is implicit)', () => {
    const r = calcCostUsd('ollama/qwen2.5:3b', {
      promptTokens: 5000,
      completionTokens: 5000,
      cachedInputTokens: 100_000,
      cacheWriteTokens: 100_000,
    });
    expect(r.usd).toBe(0);
    expect(r.breakdown.freshInputUsd).toBe(0);
    expect(r.breakdown.cachedInputUsd).toBe(0);
    expect(r.breakdown.cacheWriteUsd).toBe(0);
    expect(r.breakdown.outputUsd).toBe(0);
  });

  it('returns the pre-C3 result shape extended with a breakdown block (not a regression)', () => {
    const r = calcCostUsd('claude-sonnet-4-6', 1000, 1000);
    // Existing fields preserved verbatim — old callers reading r.usd /
    // r.known / r.matchedModel keep working untouched.
    expect(r.usd).toBeCloseTo(0.018, 6);
    expect(r.known).toBe(true);
    expect(r.matchedModel).toBe('claude-sonnet-4-6');
    // New field is always present — even in legacy form.
    expect(r.breakdown).toBeDefined();
  });
});
