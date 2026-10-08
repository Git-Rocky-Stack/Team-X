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
        rangeStart: 40000,
        rangeEnd: 40005,
        maxAttempts: 3,
        probe: async () => false,
      }),
    ).rejects.toThrowError(PortAllocatorError);
  });

  it('returns the first port the probe reports available', async () => {
    // Deterministic: probe accepts only one specific port in the range.
    const target = 40003;
    const port = await allocatePort({
      rangeStart: 40000,
      rangeEnd: 40005,
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

/**
 * Concurrent allocation.
 *
 * `allocatePort` picks a random candidate, probes it by binding and then
 * *closing* the socket, and returns the number. Nothing is held. Two callers
 * that happen to draw the same candidate therefore both see it as available
 * and both receive it — the probe cannot detect a port that this process has
 * already promised to someone else.
 *
 * That is not a test-only concern. `pool-service.ts:212` allocates a port and
 * then spawns a llama-server on it; with `maxConcurrent > 1`, two models
 * loading at once take that path concurrently, and a collision means one
 * server fails to bind. Measured collision rate for four concurrent draws over
 * the default 16,384-port range is ~0.037%.
 *
 * These tests pin the reservation that closes it, using a one-port range so
 * the outcome is decided by the reservation rather than by the draw.
 */
describe('allocatePort reservations', () => {
  // Fixed-range tests here and above use 40xxx, below the default 49152–65535
  // range on purpose. Reservations are process-wide and last 60s, and the
  // default-range tests (including the 200-trial perf test) leave ~200 random
  // ports reserved. With these windows inside the default range, a stray
  // reservation landed in one about 5% of runs and the partition test failed
  // with port-exhausted — test pollution, not a flaky allocator.
  it('does not hand out a port it has already handed out', async () => {
    const opts = { rangeStart: 40100, rangeEnd: 40100, maxAttempts: 5, probe: async () => true };
    const first = await allocatePort(opts);
    expect(first).toBe(40100);

    // The only candidate in range is now spoken for. Availability is not the
    // question — the probe still says yes — so returning it again would mean
    // two callers hold the same port.
    await expect(allocatePort(opts)).rejects.toThrowError(PortAllocatorError);
  });

  it('releases a reservation once the spawn window has passed', async () => {
    // A reservation covers the gap between "we chose this port" and "the
    // server bound it". After that the real bind probe is authoritative
    // again, so holding the number forever would leak the range.
    let clock = 1_000_000;
    const opts = {
      rangeStart: 40101,
      rangeEnd: 40101,
      maxAttempts: 5,
      probe: async () => true,
      reservationMs: 30_000,
      now: () => clock,
    };
    expect(await allocatePort(opts)).toBe(40101);

    clock += 30_001;
    expect(await allocatePort(opts)).toBe(40101);
  });

  it('gives concurrent callers distinct ports across a small range', async () => {
    // Four callers, four ports, all probing as available: without reservation
    // this is a birthday draw and repeats are expected. With it, the four
    // callers must partition the range exactly.
    const opts = { rangeStart: 40110, rangeEnd: 40113, maxAttempts: 50, probe: async () => true };
    const ports = await Promise.all([
      allocatePort(opts),
      allocatePort(opts),
      allocatePort(opts),
      allocatePort(opts),
    ]);
    expect(new Set(ports).size).toBe(4);
    expect([...ports].sort()).toEqual([40110, 40111, 40112, 40113]);
  });

  it('does not strand a reservation when the probe throws', async () => {
    // The claim is made before the probe is awaited, so a probe that rejects
    // leaves a port claimed by a caller that never received it. With a
    // one-port range that would wedge the range until the TTL expired — up to
    // a minute of spurious `port-exhausted` for a transient probe error.
    const boom = {
      rangeStart: 40120,
      rangeEnd: 40120,
      maxAttempts: 1,
      probe: async () => {
        throw new Error('probe exploded');
      },
    };
    await expect(allocatePort(boom)).rejects.toThrow('probe exploded');

    const ok = { rangeStart: 40120, rangeEnd: 40120, maxAttempts: 1, probe: async () => true };
    expect(await allocatePort(ok)).toBe(40120);
  });
});
