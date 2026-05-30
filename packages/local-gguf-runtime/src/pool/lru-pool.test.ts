// packages/local-gguf-runtime/src/pool/lru-pool.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ServerHandle } from '../runtime/server-lifecycle';
import { LruPoolError, createLruPool } from './lru-pool';

// ---------------------------------------------------------------------------
// Fake ServerHandle factory
// ---------------------------------------------------------------------------

function makeFakeHandle(port = 9000): ServerHandle {
  return {
    port,
    pid: port * 10,
    baseUrl: `http://127.0.0.1:${port}`,
    stop: vi.fn().mockResolvedValue(undefined),
    onCrash: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test-level loadModel factory
// ---------------------------------------------------------------------------

function makeLoadModel(handleFactory: (modelId: string) => ServerHandle) {
  return vi.fn().mockImplementation((id: string) => Promise.resolve(handleFactory(id)));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLruPool', () => {
  it('throws a plain Error when initialMax < 1', () => {
    const deps = { loadModel: makeLoadModel(() => makeFakeHandle()) };
    expect(() => createLruPool(deps, 0)).toThrow('maxConcurrent must be ≥ 1');
    expect(() => createLruPool(deps, -1)).toThrow('maxConcurrent must be ≥ 1');
  });

  it('creates a pool successfully when initialMax ≥ 1', () => {
    const deps = { loadModel: makeLoadModel(() => makeFakeHandle()) };
    const pool = createLruPool(deps, 1);
    expect(pool).toBeDefined();
    expect(typeof pool.acquire).toBe('function');
    expect(typeof pool.release).toBe('function');
    expect(typeof pool.setMaxConcurrent).toBe('function');
    expect(typeof pool.getStatus).toBe('function');
    expect(typeof pool.shutdownAll).toBe('function');
  });
});

describe('LruPool.acquire', () => {
  it('acquire-empty: calls loadModel and returns the handle', async () => {
    const handle = makeFakeHandle(8001);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    const result = await pool.acquire('model-a');

    expect(loadModel).toHaveBeenCalledOnce();
    expect(loadModel).toHaveBeenCalledWith('model-a');
    expect(result).toBe(handle);
  });

  it('acquire-cached: returns cached handle without calling loadModel again', async () => {
    const handle = makeFakeHandle(8002);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    const first = await pool.acquire('model-b');
    const second = await pool.acquire('model-b');

    expect(loadModel).toHaveBeenCalledOnce();
    expect(first).toBe(handle);
    expect(second).toBe(handle);
  });

  it('acquire-cached: bumps lastAccessedAt on re-access', async () => {
    const handle = makeFakeHandle(8003);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    await pool.acquire('model-c');
    const { loaded: before } = pool.getStatus();
    const accessBefore = before[0].lastAccessedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));

    await pool.acquire('model-c');
    const { loaded: after } = pool.getStatus();
    const accessAfter = after[0].lastAccessedAt;

    expect(accessAfter).toBeGreaterThanOrEqual(accessBefore);
  });

  it('eviction-on-full: evicts the oldest model when pool is at maxConcurrent', async () => {
    let portCounter = 9000;
    const handles: Record<string, ServerHandle> = {};

    const loadModel = vi.fn().mockImplementation((id: string) => {
      const h = makeFakeHandle(portCounter++);
      handles[id] = h;
      return Promise.resolve(h);
    });

    const pool = createLruPool({ loadModel }, 2);

    // Acquire model-a (oldest), then model-b
    await pool.acquire('model-a');
    await new Promise((r) => setTimeout(r, 5));
    await pool.acquire('model-b');

    // Pool is now full (max=2). Acquiring model-c should evict model-a (oldest lastAccessed)
    await pool.acquire('model-c');

    expect(handles['model-a'].stop).toHaveBeenCalledOnce();
    expect(handles['model-b'].stop).not.toHaveBeenCalled();

    const { loaded } = pool.getStatus();
    const ids = loaded.map((e) => e.modelId);
    expect(ids).toContain('model-b');
    expect(ids).toContain('model-c');
    expect(ids).not.toContain('model-a');
  });

  it('eviction-on-full: re-accessing a model bumps it to most-recently-used (protects from eviction)', async () => {
    let portCounter = 9100;
    const handles: Record<string, ServerHandle> = {};

    const loadModel = vi.fn().mockImplementation((id: string) => {
      const h = makeFakeHandle(portCounter++);
      handles[id] = h;
      return Promise.resolve(h);
    });

    const pool = createLruPool({ loadModel }, 2);

    await pool.acquire('model-a');
    await new Promise((r) => setTimeout(r, 5));
    await pool.acquire('model-b');

    // Re-access model-a to make model-b the oldest
    await new Promise((r) => setTimeout(r, 5));
    await pool.acquire('model-a');

    // Acquiring model-c should evict model-b (oldest after the re-access)
    await pool.acquire('model-c');

    expect(handles['model-b'].stop).toHaveBeenCalledOnce();
    expect(handles['model-a'].stop).not.toHaveBeenCalled();
  });

  it('in-flight dedup: two concurrent acquire(sameId) share one loadModel call', async () => {
    const handle = makeFakeHandle(8888);
    let resolveLoad: ((h: ServerHandle) => void) | undefined;

    const loadModel = vi.fn().mockImplementation(
      () =>
        new Promise<ServerHandle>((res) => {
          resolveLoad = res;
        }),
    );

    const pool = createLruPool({ loadModel }, 2);

    // Fire two acquires simultaneously — neither awaited yet
    const p1 = pool.acquire('model-dedup');
    const p2 = pool.acquire('model-dedup');

    // Flush microtasks so the gated load reaches loadModel and assigns resolveLoad.
    await new Promise((r) => setTimeout(r, 0));

    // Resolve the single in-flight load (only one loadModel call was made)
    expect(resolveLoad).toBeDefined();
    resolveLoad?.(handle);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(loadModel).toHaveBeenCalledOnce();
    expect(r1).toBe(handle);
    expect(r2).toBe(handle);
  });
});

describe('LruPool.release', () => {
  it('stops the handle and removes the entry from the pool', async () => {
    const handle = makeFakeHandle(7001);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    await pool.acquire('model-rel');
    expect(pool.getStatus().loaded).toHaveLength(1);

    await pool.release('model-rel');

    expect(handle.stop).toHaveBeenCalledOnce();
    expect(pool.getStatus().loaded).toHaveLength(0);
  });

  it('is a no-op when the model is not in the pool', async () => {
    const loadModel = vi.fn();
    const pool = createLruPool({ loadModel }, 2);

    // Should not throw
    await expect(pool.release('nonexistent')).resolves.toBeUndefined();
    expect(loadModel).not.toHaveBeenCalled();
  });
});

describe('LruPool.setMaxConcurrent', () => {
  it('throws LruPoolError({ kind: "pool-full" }) when n < 1', async () => {
    const pool = createLruPool({ loadModel: vi.fn() }, 2);

    await expect(pool.setMaxConcurrent(0)).rejects.toBeInstanceOf(LruPoolError);
    await expect(pool.setMaxConcurrent(-1)).rejects.toBeInstanceOf(LruPoolError);

    try {
      await pool.setMaxConcurrent(0);
    } catch (e) {
      expect(e).toBeInstanceOf(LruPoolError);
      const err = e as LruPoolError;
      expect(err.error.kind).toBe('pool-full');
      // Confirm the shape: pool-full has current + max
      expect('current' in err.error).toBe(true);
      expect('max' in err.error).toBe(true);
    }
  });

  it('shrink-evicts: evicts excess entries when max is reduced below current loaded count', async () => {
    let portCounter = 6000;
    const handles: Record<string, ServerHandle> = {};

    const loadModel = vi.fn().mockImplementation((id: string) => {
      const h = makeFakeHandle(portCounter++);
      handles[id] = h;
      return Promise.resolve(h);
    });

    const pool = createLruPool({ loadModel }, 3);

    // Load 3 models in LRU order: model-x (oldest) → model-y → model-z (newest)
    await pool.acquire('model-x');
    await new Promise((r) => setTimeout(r, 5));
    await pool.acquire('model-y');
    await new Promise((r) => setTimeout(r, 5));
    await pool.acquire('model-z');

    expect(pool.getStatus().loaded).toHaveLength(3);

    // Shrink to 1 → should evict 2 oldest (model-x, model-y)
    await pool.setMaxConcurrent(1);

    expect(pool.getStatus().maxConcurrent).toBe(1);
    expect(pool.getStatus().loaded).toHaveLength(1);
    expect(pool.getStatus().loaded[0].modelId).toBe('model-z');

    expect(handles['model-x'].stop).toHaveBeenCalledOnce();
    expect(handles['model-y'].stop).toHaveBeenCalledOnce();
    expect(handles['model-z'].stop).not.toHaveBeenCalled();
  });

  it('increase to larger value: no evictions occur', async () => {
    const handle = makeFakeHandle(5001);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 1);

    await pool.acquire('model-grow');
    await pool.setMaxConcurrent(5);

    expect(pool.getStatus().maxConcurrent).toBe(5);
    expect(handle.stop).not.toHaveBeenCalled();
  });
});

describe('LruPool.getStatus', () => {
  it('returns correct snapshot of loaded entries and maxConcurrent', async () => {
    let portCounter = 4000;
    const loadModel = vi.fn().mockImplementation((_id: string) => {
      const h = makeFakeHandle(portCounter++);
      return Promise.resolve(h);
    });

    const pool = createLruPool({ loadModel }, 3);
    const before = pool.getStatus();
    expect(before.loaded).toHaveLength(0);
    expect(before.maxConcurrent).toBe(3);

    await pool.acquire('model-snap-a');
    await pool.acquire('model-snap-b');

    const { loaded, maxConcurrent } = pool.getStatus();
    expect(maxConcurrent).toBe(3);
    expect(loaded).toHaveLength(2);

    const ids = loaded.map((e) => e.modelId);
    expect(ids).toContain('model-snap-a');
    expect(ids).toContain('model-snap-b');

    // Each entry has the expected shape
    for (const entry of loaded) {
      expect(typeof entry.modelId).toBe('string');
      expect(entry.handle).toBeDefined();
      expect(typeof entry.loadedAt).toBe('number');
      expect(typeof entry.lastAccessedAt).toBe('number');
    }
  });

  it('returns a shallow copy of entries (mutations do not affect internal state)', async () => {
    const handle = makeFakeHandle(3500);
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    await pool.acquire('model-copy');
    const { loaded } = pool.getStatus();
    // Mutate the returned array
    loaded.pop();

    // Internal state must be unaffected
    expect(pool.getStatus().loaded).toHaveLength(1);
  });
});

describe('LruPool.shutdownAll', () => {
  it('stops all loaded handles and clears the pool', async () => {
    let portCounter = 2000;
    const handles: Record<string, ServerHandle> = {};

    const loadModel = vi.fn().mockImplementation((id: string) => {
      const h = makeFakeHandle(portCounter++);
      handles[id] = h;
      return Promise.resolve(h);
    });

    const pool = createLruPool({ loadModel }, 3);

    await pool.acquire('model-sd-a');
    await pool.acquire('model-sd-b');
    await pool.acquire('model-sd-c');

    expect(pool.getStatus().loaded).toHaveLength(3);

    await pool.shutdownAll();

    expect(handles['model-sd-a'].stop).toHaveBeenCalledOnce();
    expect(handles['model-sd-b'].stop).toHaveBeenCalledOnce();
    expect(handles['model-sd-c'].stop).toHaveBeenCalledOnce();
    expect(pool.getStatus().loaded).toHaveLength(0);
  });

  it('is safe to call on an empty pool', async () => {
    const pool = createLruPool({ loadModel: vi.fn() }, 2);
    await expect(pool.shutdownAll()).resolves.toBeUndefined();
  });

  it('swallows individual stop errors and still clears', async () => {
    const handle = makeFakeHandle(1999);
    (handle.stop as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('crash'));
    const loadModel = vi.fn().mockResolvedValue(handle);
    const pool = createLruPool({ loadModel }, 2);

    await pool.acquire('model-crash');
    await expect(pool.shutdownAll()).resolves.toBeUndefined();
    expect(pool.getStatus().loaded).toHaveLength(0);
  });
});

describe('LruPool concurrency', () => {
  it('concurrent acquires for different models never exceed maxConcurrent (default 1)', async () => {
    const handles: Record<string, ServerHandle> = {
      A: makeFakeHandle(7001),
      B: makeFakeHandle(7002),
    };
    const loadModel = vi.fn().mockImplementation((id: string) => Promise.resolve(handles[id]));
    const pool = createLruPool({ loadModel }, 1);

    // Fire both concurrently — same tick, no await between them. The serialized
    // load gate must enforce max=1: A loads, then B evicts A before loading.
    const [hA, hB] = await Promise.all([pool.acquire('A'), pool.acquire('B')]);

    expect(hA).toBe(handles.A);
    expect(hB).toBe(handles.B);
    expect(handles.A?.stop).toHaveBeenCalledOnce(); // A evicted to make room for B
    const status = pool.getStatus();
    expect(status.loaded).toHaveLength(1); // never two at once
    expect(status.loaded[0]?.modelId).toBe('B');
  });

  it('release during an in-flight load stops the handle and does not leak the entry', async () => {
    const handle = makeFakeHandle(7100);
    let resolveLoad!: (h: ServerHandle) => void;
    const loadModel = vi.fn().mockImplementation(
      () =>
        new Promise<ServerHandle>((res) => {
          resolveLoad = res;
        }),
    );
    const pool = createLruPool({ loadModel }, 1);

    const acquireP = pool.acquire('X'); // inFlight['X'] reserved synchronously
    // Flush microtasks so the gated load reaches loadModel (resolveLoad assigned).
    await new Promise((r) => setTimeout(r, 0));
    const releaseP = pool.release('X'); // sees the in-flight load, waits for it
    resolveLoad(handle); // load now completes
    await Promise.all([acquireP, releaseP]);

    expect(handle.stop).toHaveBeenCalledOnce(); // released handle was stopped
    expect(pool.getStatus().loaded).toHaveLength(0); // entry did not leak back in
  });
});
