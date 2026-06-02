// packages/local-gguf-runtime/src/library/resilience.test.ts
//
// Deterministic tests for the resilience monitor.
//
// Timer strategy: vi.useFakeTimers() in beforeEach + vi.advanceTimersByTimeAsync()
// (the *Async* variant) throughout.  The Async form flushes pending microtasks
// between each simulated timer fire, so the `await checkAccess(p)` calls that
// execute inside tick() are fully resolved before we inspect results.  This
// makes the suite instant and 100% deterministic — no real-clock sleeps, no
// race conditions.
//
// Every test stops the monitor in its own cleanup to prevent timer leak across
// cases.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReachableChangeEvent } from './resilience';
import { createResilienceMonitor } from './resilience';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all 'reachableChange' events emitted into an array for assertions. */
function collectEvents(
  monitor: ReturnType<typeof createResilienceMonitor>,
): ReachableChangeEvent[] {
  const events: ReachableChangeEvent[] = [];
  monitor.on('reachableChange', (e: ReachableChangeEvent) => events.push(e));
  return events;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('createResilienceMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Reachable → unreachable → reachable transitions
  // -------------------------------------------------------------------------

  it('emits reachableChange{false} when path becomes unreachable, then {true} on recovery', async () => {
    const checkAccess = vi.fn<() => Promise<void>>();

    // First tick: reachable.
    checkAccess.mockResolvedValueOnce(undefined);
    // Second tick: unreachable.
    checkAccess.mockRejectedValueOnce(new Error('ENOENT'));
    // Third tick: reachable again.
    checkAccess.mockResolvedValue(undefined);

    const monitor = createResilienceMonitor(['/nas/models'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 1_600,
    });
    const events = collectEvents(monitor);
    monitor.start();

    // Tick 1 (delay=0): checkAccess resolves → first ever check; state was null
    // so a {reachable:true} event fires (null !== true).
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ path: '/nas/models', reachable: true });

    // Tick 2 (delay=baseInterval=100ms): checkAccess rejects → transition to false.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ path: '/nas/models', reachable: false });

    // Tick 3: after 1 failure the backoff is base * 2^0 = 100ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ path: '/nas/models', reachable: true });

    monitor.stop();
  });

  // -------------------------------------------------------------------------
  // 2. No duplicate emits while state is steady
  // -------------------------------------------------------------------------

  it('does NOT re-emit reachableChange while state remains steady (no duplicates)', async () => {
    // checkAccess always rejects — once the state flips to false it stays false.
    const checkAccess = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('unavailable'));

    const monitor = createResilienceMonitor(['/nas/share'], {
      checkAccess,
      baseIntervalMs: 50,
      maxIntervalMs: 400,
    });
    const events = collectEvents(monitor);
    monitor.start();

    // Tick 1 (delay=0): null→false transition → 1 event.
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ path: '/nas/share', reachable: false });

    // Tick 2 (backoff base * 2^0 = 50ms): still false, no new event.
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toHaveLength(1);

    // Tick 3 (backoff base * 2^1 = 100ms): still false, no new event.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(1);

    monitor.stop();
  });

  it('does NOT re-emit reachableChange while state remains reachable', async () => {
    const checkAccess = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = createResilienceMonitor(['/local/models'], {
      checkAccess,
      baseIntervalMs: 50,
      maxIntervalMs: 400,
    });
    const events = collectEvents(monitor);
    monitor.start();

    // Tick 1: null→true → 1 event.
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ path: '/local/models', reachable: true });

    // Two more ticks at base interval — state steady, no extra events.
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toHaveLength(1);

    monitor.stop();
  });

  // -------------------------------------------------------------------------
  // 3. Both-direction transitions across multiple advances
  // -------------------------------------------------------------------------

  it('handles repeated false→true→false→true transitions correctly', async () => {
    const checkAccess = vi.fn<() => Promise<void>>();
    // Pattern: fail, pass, fail, pass.
    checkAccess
      .mockRejectedValueOnce(new Error('down')) // tick1 → false
      .mockResolvedValueOnce(undefined) // tick2 → true
      .mockRejectedValueOnce(new Error('down')) // tick3 → false
      .mockResolvedValueOnce(undefined); // tick4 → true

    const monitor = createResilienceMonitor(['/mnt/nas'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 1_600,
    });
    const events = collectEvents(monitor);
    monitor.start();

    // Tick 1 (0ms): null→false.
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ path: '/mnt/nas', reachable: false });

    // Tick 2 (backoff after 1 failure = base * 2^0 = 100ms): false→true.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ path: '/mnt/nas', reachable: true });

    // Tick 3 (back to base interval = 100ms): true→false.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(3);
    expect(events[2]).toEqual({ path: '/mnt/nas', reachable: false });

    // Tick 4 (backoff after 1 failure = 100ms): false→true.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(4);
    expect(events[3]).toEqual({ path: '/mnt/nas', reachable: true });

    monitor.stop();
  });

  // -------------------------------------------------------------------------
  // 4. Exponential backoff: intervals grow and plateau at maxIntervalMs
  // -------------------------------------------------------------------------

  it('applies exponential backoff: tick count within a fixed window shrinks as failures accumulate', async () => {
    // Always failing — backoff grows each tick.
    const checkAccess = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('unreachable'));

    // base=100ms, max=800ms. Sequence of delays after tick N:
    //   tick0→delay=100 (1 failure, exp=0, 100*1=100)
    //   tick1→delay=200 (2 failures, exp=1, 100*2=200)
    //   tick2→delay=400 (3 failures, exp=2, 100*4=400)
    //   tick3→delay=800 (4 failures, exp=3, 100*8=800, capped at 800)
    //   tick4→delay=800 (5 failures, exp=4, 100*16=1600, capped at 800)
    const monitor = createResilienceMonitor(['/mnt/nas'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });
    monitor.start();

    // Tick 0 fires at delay=0.
    await vi.advanceTimersByTimeAsync(0);
    expect(checkAccess).toHaveBeenCalledTimes(1); // 1 failure now

    // Next delay = 100ms (1 failure, 100 * 2^0).
    await vi.advanceTimersByTimeAsync(100);
    expect(checkAccess).toHaveBeenCalledTimes(2); // 2 failures now

    // Next delay = 200ms (2 failures, 100 * 2^1).
    await vi.advanceTimersByTimeAsync(200);
    expect(checkAccess).toHaveBeenCalledTimes(3); // 3 failures now

    // Next delay = 400ms (3 failures, 100 * 2^2).
    await vi.advanceTimersByTimeAsync(400);
    expect(checkAccess).toHaveBeenCalledTimes(4); // 4 failures now

    // Next delay = 800ms (4 failures, 100 * 2^3 = 800, at ceiling).
    await vi.advanceTimersByTimeAsync(800);
    expect(checkAccess).toHaveBeenCalledTimes(5); // 5 failures now

    // Ceiling should hold: next delay still 800ms (5 failures, 100*2^4=1600, capped at 800).
    await vi.advanceTimersByTimeAsync(800);
    expect(checkAccess).toHaveBeenCalledTimes(6);

    // Verify the ceiling holds even further.
    await vi.advanceTimersByTimeAsync(800);
    expect(checkAccess).toHaveBeenCalledTimes(7);

    monitor.stop();
  });

  it('resets interval to base after a recovery', async () => {
    const checkAccess = vi.fn<() => Promise<void>>();
    // 3 failures to build up backoff, then recovery.
    checkAccess
      .mockRejectedValueOnce(new Error('down')) // tick0
      .mockRejectedValueOnce(new Error('down')) // tick1 (delay 100)
      .mockRejectedValueOnce(new Error('down')) // tick2 (delay 200)
      .mockResolvedValue(undefined); // tick3+ → recovered

    const monitor = createResilienceMonitor(['/mnt/share'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });
    monitor.start();

    await vi.advanceTimersByTimeAsync(0); // tick0 → 1 failure, next=100
    await vi.advanceTimersByTimeAsync(100); // tick1 → 2 failures, next=200
    await vi.advanceTimersByTimeAsync(200); // tick2 → 3 failures, next=400
    await vi.advanceTimersByTimeAsync(400); // tick3 → recovery! failureCount→0, next=100 (base)

    expect(checkAccess).toHaveBeenCalledTimes(4);

    // After recovery the interval should be back to base (100ms).
    // Advance exactly 100ms — tick4 should fire.
    await vi.advanceTimersByTimeAsync(100);
    expect(checkAccess).toHaveBeenCalledTimes(5);

    // Advance only 50ms — tick5 must NOT have fired yet (interval is still 100ms).
    await vi.advanceTimersByTimeAsync(50);
    expect(checkAccess).toHaveBeenCalledTimes(5);

    monitor.stop();
  });

  // -------------------------------------------------------------------------
  // 5. stop() cancels pending checks
  // -------------------------------------------------------------------------

  it('stop() cancels the pending timer — no further checkAccess calls after stop', async () => {
    const checkAccess = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = createResilienceMonitor(['/mnt/nas'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });
    monitor.start();

    // Tick 0 at delay=0.
    await vi.advanceTimersByTimeAsync(0);
    expect(checkAccess).toHaveBeenCalledTimes(1);

    // Stop before the next tick fires.
    monitor.stop();

    // Advance well past the next interval — nothing should fire.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkAccess).toHaveBeenCalledTimes(1);
  });

  it('stop() while tick is mid-flight does not schedule another tick', async () => {
    // checkAccess takes a moment (simulated via a slow async), but since we
    // control fake timers the resolution is still deterministic.
    let resolveCheck!: () => void;
    const checkAccess = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const monitor = createResilienceMonitor(['/mnt/nas'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });
    monitor.start();

    // Fire the initial tick (delay=0) but don't resolve checkAccess yet.
    await vi.advanceTimersByTimeAsync(0);
    expect(checkAccess).toHaveBeenCalledTimes(1);

    // Stop while the promise is still pending.
    monitor.stop();

    // Now resolve checkAccess — tick() will finish but find stopped=true.
    resolveCheck();
    // Flush the microtask queue.
    await vi.advanceTimersByTimeAsync(0);

    // No subsequent timer should have been scheduled.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(checkAccess).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 6. start() is idempotent
  // -------------------------------------------------------------------------

  it('calling start() twice does not double the tick rate', async () => {
    const checkAccess = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const monitor = createResilienceMonitor(['/mnt/nas'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });

    // Start twice in a row.
    monitor.start();
    monitor.start();

    // After the initial tick (delay=0) only ONE checkAccess call should happen.
    await vi.advanceTimersByTimeAsync(0);
    expect(checkAccess).toHaveBeenCalledTimes(1);

    // One more base interval — still exactly one tick per cycle.
    await vi.advanceTimersByTimeAsync(100);
    expect(checkAccess).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  // -------------------------------------------------------------------------
  // 7. Multiple paths are checked independently
  // -------------------------------------------------------------------------

  it('monitors multiple paths and emits independent events per path', async () => {
    const checkAccess = vi.fn<(path: string) => Promise<void>>();
    // Path A always reachable; path B always unreachable.
    checkAccess.mockImplementation(async (path) => {
      if (path === '/mnt/b') throw new Error('down');
    });

    const monitor = createResilienceMonitor(['/mnt/a', '/mnt/b'], {
      checkAccess,
      baseIntervalMs: 100,
      maxIntervalMs: 800,
    });
    const events = collectEvents(monitor);
    monitor.start();

    // Initial tick: both paths transition from null.
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(2);

    const aEvent = events.find((e) => e.path === '/mnt/a');
    const bEvent = events.find((e) => e.path === '/mnt/b');
    expect(aEvent).toEqual({ path: '/mnt/a', reachable: true });
    expect(bEvent).toEqual({ path: '/mnt/b', reachable: false });

    // Second tick: states are steady — no new events.
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toHaveLength(2);

    monitor.stop();
  });
});
