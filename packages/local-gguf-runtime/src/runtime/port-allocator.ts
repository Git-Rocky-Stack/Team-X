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
  rangeEnd?: number;   // default 65535
  maxAttempts?: number; // default 50
}

export async function allocatePort(opts: AllocatePortOptions = {}): Promise<number> {
  const rangeStart = opts.rangeStart ?? 49152;
  const rangeEnd = opts.rangeEnd ?? 65535;
  const maxAttempts = opts.maxAttempts ?? 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart;
    const available = await tryBind(port);
    if (available) return port;
  }
  throw new PortAllocatorError({ kind: 'port-exhausted' });
}

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}
