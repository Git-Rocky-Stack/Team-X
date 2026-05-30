// packages/local-gguf-runtime/src/runtime/port-allocator.ts
import { createServer } from 'node:net';
import type { LocalGgufError } from '@team-x/shared-types';

export class PortAllocatorError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`PortAllocatorError: ${JSON.stringify(error)}`);
    this.name = 'PortAllocatorError';
  }
}

export interface AllocatePortOptions {
  rangeStart?: number; // default 49152
  rangeEnd?: number; // default 65535
  maxAttempts?: number; // default 50
  /**
   * Availability probe for a candidate port. Defaults to a real TCP bind on
   * 127.0.0.1. Injectable so callers (and tests) can drive allocation
   * deterministically without touching the network.
   */
  probe?: (port: number) => Promise<boolean>;
}

export async function allocatePort(opts: AllocatePortOptions = {}): Promise<number> {
  const rangeStart = opts.rangeStart ?? 49152;
  const rangeEnd = opts.rangeEnd ?? 65535;
  const maxAttempts = opts.maxAttempts ?? 50;
  const probe = opts.probe ?? tryBind;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart;
    const available = await probe(port);
    if (available) return port;
  }
  throw new PortAllocatorError({ kind: 'port-exhausted' });
}

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => {
      // Release the failed server's handle before reporting unavailable.
      // close() on a never-listening server invokes its callback with
      // ERR_SERVER_NOT_RUNNING, which we intentionally ignore.
      srv.close(() => resolve(false));
    });
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}
