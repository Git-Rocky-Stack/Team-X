// packages/local-gguf-runtime/src/library/resilience.ts
//
// Network-share resilience monitor.
//
// Polls each watched path on a configurable interval (default 30 s) and, on
// failure, backs off exponentially to a 5-min ceiling — never gives up.
// Emits `reachableChange` only on STATE TRANSITIONS so consumers receive a
// clean signal rather than a flood.  Used by the LibraryService to flip a
// watch-folder's online/offline status when a NAS disconnects or reconnects.
//
// Backoff formula (maxFailures capped at 5 to avoid BigInt overflow):
//   interval = min(base * 2^(failures-1), max)
// On success the failure counter resets to 0 and the base interval is restored.

import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options for createResilienceMonitor. */
export interface ResilienceMonitorOptions {
  /**
   * Called once per path per poll cycle.  Resolves if the path is reachable;
   * rejects (for any reason) if it is not.
   */
  checkAccess: (path: string) => Promise<void>;
  /** Base polling interval in milliseconds.  Defaults to 30 000 (30 s). */
  baseIntervalMs?: number;
  /** Exponential-backoff ceiling in milliseconds.  Defaults to 300 000 (5 min). */
  maxIntervalMs?: number;
}

/** Payload emitted on the `reachableChange` event. */
export interface ReachableChangeEvent {
  path: string;
  reachable: boolean;
}

/** EventEmitter extended with lifecycle controls. */
export interface ResilienceMonitor extends EventEmitter {
  /** Start the poll loop.  Idempotent — a second call while running is a no-op. */
  start: () => void;
  /** Cancel any pending timer and stop all future polling. */
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_MS = 30_000;
const DEFAULT_MAX_MS = 300_000;

// Cap the exponent so 2^n never produces Infinity; 2^5 = 32 already exceeds
// any ratio between base (30 s) and max (5 min), so the ceiling kicks in first.
const MAX_FAILURE_EXP = 5;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Per-path mutable state tracked internally. */
interface PathState {
  /** null = initial (unknown), true = last check passed, false = last check failed. */
  reachable: boolean | null;
  /** Consecutive failure count; reset to 0 on the first success after failures. */
  failureCount: number;
}

/**
 * Create a resilience monitor that polls `paths` and emits `reachableChange`
 * events on state transitions.
 *
 * Events:
 *   'reachableChange' (ReachableChangeEvent) — emitted once per path per
 *     transition; not re-emitted while the state is steady.
 */
export function createResilienceMonitor(
  paths: string[],
  opts: ResilienceMonitorOptions,
): ResilienceMonitor {
  const emitter = new EventEmitter() as ResilienceMonitor;
  const baseInterval = opts.baseIntervalMs ?? DEFAULT_BASE_MS;
  const maxInterval = opts.maxIntervalMs ?? DEFAULT_MAX_MS;

  // Initialise state for every path (reachable unknown, no failures yet).
  const state = new Map<string, PathState>();
  for (const p of paths) {
    state.set(p, { reachable: null, failureCount: 0 });
  }

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  // --------------------------------------------------------------------------
  // Poll cycle
  // --------------------------------------------------------------------------

  async function tick(): Promise<void> {
    if (stopped) return;

    for (const p of paths) {
      const prev = state.get(p);
      if (!prev) continue; // defensive — path must always be in the map

      try {
        await opts.checkAccess(p);
        state.set(p, { reachable: true, failureCount: 0 });
        if (prev.reachable !== true) {
          emitter.emit('reachableChange', {
            path: p,
            reachable: true,
          } satisfies ReachableChangeEvent);
        }
      } catch {
        const failureCount = prev.failureCount + 1;
        state.set(p, { reachable: false, failureCount });
        if (prev.reachable !== false) {
          emitter.emit('reachableChange', {
            path: p,
            reachable: false,
          } satisfies ReachableChangeEvent);
        }
      }
    }

    if (!stopped) scheduleNext();
  }

  // --------------------------------------------------------------------------
  // Backoff scheduler
  // --------------------------------------------------------------------------

  /** Compute the next interval based on the highest failure count across all paths. */
  function nextInterval(): number {
    let maxFailureCount = 0;
    for (const s of state.values()) {
      if (s.failureCount > maxFailureCount) maxFailureCount = s.failureCount;
    }
    if (maxFailureCount === 0) return baseInterval;
    const exp = Math.min(maxFailureCount - 1, MAX_FAILURE_EXP);
    const grown = baseInterval * 2 ** exp;
    return Math.min(grown, maxInterval);
  }

  function scheduleNext(): void {
    timer = setTimeout(() => {
      void tick();
    }, nextInterval());
  }

  // --------------------------------------------------------------------------
  // Public controls
  // --------------------------------------------------------------------------

  emitter.start = (): void => {
    // Idempotent — ignore if a timer is already pending.
    if (timer !== null) return;
    stopped = false;
    // Fire the first tick immediately (delay = 0) so callers get an initial
    // reachability reading without waiting a full base interval.
    timer = setTimeout(() => {
      void tick();
    }, 0);
  };

  emitter.stop = (): void => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return emitter;
}
