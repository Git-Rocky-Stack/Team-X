// packages/local-gguf-runtime/src/gpu-probe/cpu.test.ts
import { describe, expect, it } from 'vitest';
import { probeCpu } from './cpu';

describe('probeCpu', () => {
  it('returns cores >= 1', () => {
    const result = probeCpu();
    expect(result.cores).toBeGreaterThanOrEqual(1);
  });

  it('returns ramMb > 0', () => {
    const result = probeCpu();
    expect(result.ramMb).toBeGreaterThan(0);
  });

  it('returns integer values for cores and ramMb', () => {
    const result = probeCpu();
    expect(Number.isInteger(result.cores)).toBe(true);
    expect(Number.isInteger(result.ramMb)).toBe(true);
  });
});
