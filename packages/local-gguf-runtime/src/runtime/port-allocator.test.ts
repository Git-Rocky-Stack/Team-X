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
});
