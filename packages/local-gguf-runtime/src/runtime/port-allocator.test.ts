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
    // Mock by passing a tiny range with all ports busy
    const blockers: ReturnType<typeof createServer>[] = [];
    try {
      // Allocate and HOLD a small range so the allocator's range is fully busy
      for (let p = 50000; p <= 50005; p++) {
        const srv = createServer();
        await new Promise<void>((resolve, reject) => {
          srv.listen(p, '127.0.0.1', () => resolve());
          srv.on('error', reject);
        });
        blockers.push(srv);
      }
      await expect(
        allocatePort({ rangeStart: 50000, rangeEnd: 50005, maxAttempts: 3 }),
      ).rejects.toThrowError(PortAllocatorError);
    } finally {
      for (const s of blockers) await new Promise<void>((r) => s.close(() => r()));
    }
  });
});
