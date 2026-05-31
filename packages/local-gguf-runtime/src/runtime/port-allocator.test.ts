import { createServer } from 'node:net';
// packages/local-gguf-runtime/src/runtime/port-allocator.test.ts
import { describe, expect, it } from 'vitest';
import { PortAllocatorError, allocatePort } from './port-allocator';

describe('allocatePort', () => {
  it('returns a port number in the ephemeral range', async () => {
    const port = await allocatePort();
    expect(port).toBeGreaterThanOrEqual(49152);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('returned ports are bindable', async () => {
    const port = await allocatePort();
    await new Promise<void>((resolve, reject) => {
      const srv = createServer();
      srv.listen(port, '127.0.0.1', () => {
        srv.close(() => resolve());
      });
      srv.on('error', reject);
    });
  });

  it('returns distinct ports on rapid successive calls', async () => {
    const ports = await Promise.all([
      allocatePort(),
      allocatePort(),
      allocatePort(),
      allocatePort(),
    ]);
    const unique = new Set(ports);
    expect(unique.size).toBe(ports.length);
  });

  it('throws PortAllocatorError(port-exhausted) when no port is available', async () => {
    // Deterministic and network-free: inject a probe that reports every
    // candidate port busy, so all attempts fail and exhaustion is thrown.
    // (Avoids hard-coded ports, which flake on shared CI runners.)
    await expect(
      allocatePort({
        rangeStart: 50000,
        rangeEnd: 50005,
        maxAttempts: 3,
        probe: async () => false,
      }),
    ).rejects.toThrowError(PortAllocatorError);
  });

  it('returns the first port the probe reports available', async () => {
    // Deterministic: probe accepts only one specific port in the range.
    const target = 50003;
    const port = await allocatePort({
      rangeStart: 50000,
      rangeEnd: 50005,
      maxAttempts: 500,
      probe: async (p) => p === target,
    });
    expect(port).toBe(target);
  });

  it('succeeds for ≥95% of trials within 10 attempts under ~50% contention (perf assertion)', async () => {
    // Deterministic Bernoulli probe via a seeded PRNG (mulberry32) — no
    // Math.random, so the measured success rate is reproducible run to run.
    // ~50% of candidate ports report busy; P(fail within 10 attempts) ≈ 0.5^10,
    // so the expected rate is ~99.9% — comfortably above the 95% budget.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const trials = 200;
    let successes = 0;
    for (let i = 0; i < trials; i++) {
      try {
        await allocatePort({ maxAttempts: 10, probe: async () => rand() > 0.5 });
        successes++;
      } catch {
        /* port-exhausted — counts as a miss */
      }
    }
    // Phase 2 perf budget: ≥ 95% allocation success within 10 attempts.
    expect(successes / trials).toBeGreaterThanOrEqual(0.95);
  });
});
