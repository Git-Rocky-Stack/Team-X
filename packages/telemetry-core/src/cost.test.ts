import { describe, expect, it } from 'vitest';
import { type CostResult, calcCostUsd } from './cost.js';

describe('calcCostUsd', () => {
  it('computes exact-match Anthropic Opus pricing', () => {
    const r: CostResult = calcCostUsd('claude-opus-4-6', 1000, 1000);
    // 1k input @ $0.015 + 1k output @ $0.075 = $0.090
    expect(r.usd).toBeCloseTo(0.09, 6);
    expect(r.known).toBe(true);
    expect(r.matchedModel).toBe('claude-opus-4-6');
  });

  it('computes exact-match Anthropic Sonnet pricing', () => {
    const r = calcCostUsd('claude-sonnet-4-6', 2000, 500);
    // 2k input @ $0.003 + 0.5k output @ $0.015 = $0.006 + $0.0075 = $0.0135
    expect(r.usd).toBeCloseTo(0.0135, 6);
    expect(r.known).toBe(true);
  });

  it('computes Haiku pricing with the dated model id', () => {
    const r = calcCostUsd('claude-haiku-4-5-20251001', 10000, 10000);
    // 10k input @ $0.0008 + 10k output @ $0.004 = $0.008 + $0.04 = $0.048
    expect(r.usd).toBeCloseTo(0.048, 6);
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
