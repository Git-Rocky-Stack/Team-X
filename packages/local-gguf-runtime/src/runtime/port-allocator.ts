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
  /**
   * How long a handed-out port stays reserved. Covers the gap between this
   * function returning and the caller's server actually binding the port —
   * see the `reservations` note below. Default 60s, which is generous enough
   * for a cold model load.
   */
  reservationMs?: number;
  /** Injectable clock, so reservation expiry is testable without waiting. */
  now?: () => number;
}

/**
 * Ports this process has handed out but whose server has not bound yet,
 * mapped to the time their reservation expires.
 *
 * Why this exists: `tryBind` answers "is anyone listening on this port right
 * now", which is the wrong question for a concurrent caller. The probe binds
 * and immediately closes, so a port already promised to an in-flight
 * `spawnServer` still probes as available and gets handed out twice. The
 * second server then fails to bind. `pool-service.ts` takes exactly that path
 * whenever `maxConcurrent > 1` and two models load at once.
 *
 * Process-wide state is the right scope here: the thing being tracked is
 * "ports this process has promised", which is a property of the process.
 *
 * Reservations expire rather than being explicitly released. Once the server
 * has bound the port, `tryBind` correctly reports it busy and the reservation
 * has no further work to do — so a TTL covering the spawn window is
 * sufficient, and it cannot leak the range the way an unreleased handle would.
 */
const reservations = new Map<number, number>();

export async function allocatePort(opts: AllocatePortOptions = {}): Promise<number> {
  const rangeStart = opts.rangeStart ?? 49152;
  const rangeEnd = opts.rangeEnd ?? 65535;
  const maxAttempts = opts.maxAttempts ?? 50;
  const probe = opts.probe ?? tryBind;
  const reservationMs = opts.reservationMs ?? 60_000;
  const now = opts.now ?? Date.now;

  const startedAt = now();
  for (const [port, expiresAt] of reservations) {
    if (expiresAt <= startedAt) reservations.delete(port);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart;
    // A reserved candidate consumes an attempt exactly as a busy one does.
    // Skipping without counting would spin forever once the range is fully
    // reserved, which is the case the `port-exhausted` error exists to report.
    if (reservations.has(port)) continue;

    // Claim BEFORE probing, not after. `probe` is async, so a claim made on
    // the far side of the await is a check-then-act race: two callers both
    // pass the `has` check, both await, and both claim the same port — the
    // exact collision this map exists to prevent. Claiming first makes the
    // check-and-claim atomic with respect to other callers, because the
    // synchronous run between them cannot be interleaved.
    reservations.set(port, now() + reservationMs);
    let available: boolean;
    try {
      available = await probe(port);
    } catch (err) {
      // A claim that produced no allocation must not outlive the attempt.
      // Leaving it would wedge the candidate until the TTL expired, turning a
      // transient probe error into up to a minute of spurious exhaustion.
      reservations.delete(port);
      throw err;
    }
    if (available) return port;
    // Someone else is already listening there; the claim was wrong to make.
    reservations.delete(port);
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
