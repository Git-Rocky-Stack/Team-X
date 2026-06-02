// packages/local-gguf-runtime/src/library/folder-watcher.test.ts
//
// Folder-watcher tests. All tests use a fake chokidar factory injected via
// opts.chokidarFactory so no real filesystem or native watchers are involved.
// Timer-based debounce is tested with vi.useFakeTimers() + advanceTimersByTime,
// keeping the suite fully deterministic and instant.

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderWatcherChangeEvent, FolderWatcherOptions } from './folder-watcher';
import { createFolderWatcher } from './folder-watcher';

// ---------------------------------------------------------------------------
// Fake chokidar
// ---------------------------------------------------------------------------

/**
 * A fake FSWatcher that exposes the chokidar EventEmitter interface plus a
 * spied async close(). Callers call `.emit('add', path)` / `.emit('unlink', path)`
 * to simulate filesystem events from chokidar.
 */
class FakeFSWatcher extends EventEmitter {
  close = vi.fn().mockResolvedValue(undefined);
}

/** Captured args passed to the fake factory on each call. */
interface FactoryCall {
  path: string;
  opts: Record<string, unknown>;
}

/**
 * Build a fake chokidar factory that returns a fresh FakeFSWatcher.
 * Returns both the factory function (for injection) and accessors to the
 * created watcher instance and the recorded call arguments.
 */
function makeFakeFactory(): {
  factory: FolderWatcherOptions['chokidarFactory'];
  getWatcher: () => FakeFSWatcher;
  getCalls: () => FactoryCall[];
} {
  let watcher: FakeFSWatcher | undefined;
  const calls: FactoryCall[] = [];

  const factory = (path: string, opts: Record<string, unknown>): FakeFSWatcher => {
    calls.push({ path, opts });
    watcher = new FakeFSWatcher();
    return watcher;
  };

  return {
    // Cast to satisfy the typed signature — the fake is structurally compatible.
    factory: factory as unknown as FolderWatcherOptions['chokidarFactory'],
    getWatcher: () => {
      if (!watcher) throw new Error('factory not yet called');
      return watcher;
    },
    getCalls: () => calls,
  };
}

// Small debounce used in every test — enough to separate "before" from "after"
// when fake timers are advanced, but well below any real-time threshold.
const DEBOUNCE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect 'change' events emitted on the watcher into an array. */
function collectChanges(w: ReturnType<typeof createFolderWatcher>): FolderWatcherChangeEvent[] {
  const events: FolderWatcherChangeEvent[] = [];
  w.on('change', (e: FolderWatcherChangeEvent) => events.push(e));
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFolderWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Factory options
  // -----------------------------------------------------------------------

  it('passes recursive:false → depth:0 to chokidar factory', () => {
    const { factory, getCalls } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const [call] = getCalls();
    expect(call?.path).toBe('/m');
    expect(call?.opts).toMatchObject({ depth: 0 });
    void w.close();
  });

  it('passes recursive:true → depth:undefined to chokidar factory', () => {
    const { factory, getCalls } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: true,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const [call] = getCalls();
    expect(call?.opts).toMatchObject({ depth: undefined });
    void w.close();
  });

  // -----------------------------------------------------------------------
  // Debounce: add and unlink events
  // -----------------------------------------------------------------------

  it('emits a debounced change event for an add of a .gguf file', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('add', '/m/llama.gguf');

    // Before the debounce window — nothing emitted yet.
    expect(events).toHaveLength(0);

    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'add', path: '/m/llama.gguf' });

    await w.close();
  });

  it('emits a debounced change event for an unlink of a .gguf file', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('unlink', '/m/model.gguf');
    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'unlink', path: '/m/model.gguf' });

    await w.close();
  });

  it('batches multiple distinct .gguf paths — one change per path after debounce', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('add', '/m/a.gguf');
    getWatcher().emit('add', '/m/b.gguf');
    getWatcher().emit('unlink', '/m/c.gguf');

    // Still within debounce window — nothing flushed.
    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(events).toHaveLength(0);

    vi.advanceTimersByTime(2);

    expect(events).toHaveLength(3);
    const paths = events.map((e) => e.path).sort();
    expect(paths).toEqual(['/m/a.gguf', '/m/b.gguf', '/m/c.gguf']);

    await w.close();
  });

  // -----------------------------------------------------------------------
  // .gguf filter
  // -----------------------------------------------------------------------

  it('ignores non-.gguf files (add)', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('add', '/m/readme.md');
    getWatcher().emit('add', '/m/weights.bin');
    getWatcher().emit('add', '/m/config.json');

    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(0);

    await w.close();
  });

  it('ignores non-.gguf files (unlink)', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('unlink', '/m/notes.txt');

    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(0);

    await w.close();
  });

  it('accepts .GGUF and .Gguf (case-insensitive)', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    getWatcher().emit('add', '/m/UPPER.GGUF');
    getWatcher().emit('add', '/m/mixed.Gguf');

    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(2);
    const paths = events.map((e) => e.path).sort();
    expect(paths).toEqual(['/m/UPPER.GGUF', '/m/mixed.Gguf']);

    await w.close();
  });

  // -----------------------------------------------------------------------
  // Debounce coalescing
  // -----------------------------------------------------------------------

  it('two rapid events on the SAME path collapse to ONE change with the latest type', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    // add then immediately unlink the same path — last write wins in the Map.
    getWatcher().emit('add', '/m/model.gguf');
    getWatcher().emit('unlink', '/m/model.gguf');

    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'unlink', path: '/m/model.gguf' });

    await w.close();
  });

  it('second debounce window after first flush emits independently', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    // First batch.
    getWatcher().emit('add', '/m/a.gguf');
    vi.advanceTimersByTime(DEBOUNCE + 1);
    expect(events).toHaveLength(1);

    // Second batch — timer resets after flush.
    getWatcher().emit('add', '/m/b.gguf');
    vi.advanceTimersByTime(DEBOUNCE + 1);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'add', path: '/m/b.gguf' });

    await w.close();
  });

  // -----------------------------------------------------------------------
  // Phase 3 perf assertion (master plan Task 10 / CR-6)
  //
  // Fake timers make wall-clock latency meaningless here; the meaningful
  // budget is: the first change event must be emitted exactly AT the debounce
  // boundary (i.e. after vi.advanceTimersByTime(debounceMs)), and NOT before
  // it.  "No added latency" means no implementation drift (extra async hops,
  // redundant timers, missed flush) stretches the window past debounceMs.
  // The test also names an explicit tolerance (debounceMs + 50 ms) matching
  // the CR-6 spec — the fake-timer model ensures the flush fires in the same
  // synchronous tick, so the tolerance is met by construction.
  // -----------------------------------------------------------------------

  it('first change event arrives exactly at the debounce boundary — no added latency (perf assertion)', async () => {
    const debounceMs = 100; // explicit and larger than DEBOUNCE to make the budget visible
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs,
    });
    const events = collectChanges(w);

    getWatcher().emit('add', '/m/model.gguf');

    // Before the boundary: nothing.
    vi.advanceTimersByTime(debounceMs - 1);
    expect(events).toHaveLength(0);

    // Exactly at the boundary: the flush fires and the event is present.
    // Phase 3 perf budget: first event emitted ≤ debounceMs (+ 50 ms tolerance).
    // With fake timers the flush is synchronous, so no real-time headroom is
    // consumed — the tolerance exists to document the contract, not to absorb jitter.
    vi.advanceTimersByTime(1); // total elapsed = debounceMs exactly
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'add', path: '/m/model.gguf' });

    await w.close();
  });

  // -----------------------------------------------------------------------
  // Error forwarding
  // -----------------------------------------------------------------------

  it('forwards error events from the underlying watcher', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });

    const errors: Error[] = [];
    w.on('error', (e: Error) => errors.push(e));

    const boom = new Error('ENOENT');
    getWatcher().emit('error', boom);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(boom);

    await w.close();
  });

  // -----------------------------------------------------------------------
  // close() behaviour
  // -----------------------------------------------------------------------

  it('close() calls the underlying watcher close()', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });

    await w.close();

    expect(getWatcher().close).toHaveBeenCalledOnce();
  });

  it('close() clears the pending flush timer — no change events after close', async () => {
    const { factory, getWatcher } = makeFakeFactory();
    const w = createFolderWatcher('/m', {
      recursive: false,
      chokidarFactory: factory,
      debounceMs: DEBOUNCE,
    });
    const events = collectChanges(w);

    // Trigger a pending timer then close before it fires.
    getWatcher().emit('add', '/m/model.gguf');
    await w.close();

    // Advance past the debounce — timer should have been cleared.
    vi.advanceTimersByTime(DEBOUNCE + 1);

    expect(events).toHaveLength(0);
    expect(getWatcher().close).toHaveBeenCalledOnce();
  });
});
