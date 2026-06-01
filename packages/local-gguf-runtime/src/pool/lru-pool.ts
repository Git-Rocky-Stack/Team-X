import type { LocalGgufError } from '@team-x/shared-types';
// packages/local-gguf-runtime/src/pool/lru-pool.ts
import type { ServerHandle } from '../runtime/server-lifecycle';

export class LruPoolError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`LruPoolError: ${JSON.stringify(error)}`);
    this.name = 'LruPoolError';
  }
}

export interface LruPoolDeps {
  loadModel: (modelId: string) => Promise<ServerHandle>;
}

export interface LoadedEntry {
  modelId: string;
  handle: ServerHandle;
  loadedAt: number;
  lastAccessedAt: number;
}

export interface LruPool {
  acquire(modelId: string): Promise<ServerHandle>;
  release(modelId: string): Promise<void>;
  setMaxConcurrent(n: number): Promise<void>;
  getStatus(): { loaded: LoadedEntry[]; maxConcurrent: number };
  shutdownAll(): Promise<void>;
}

export function createLruPool(deps: LruPoolDeps, initialMax: number): LruPool {
  if (initialMax < 1) throw new Error('maxConcurrent must be ≥ 1');
  let maxConcurrent = initialMax;
  const entries = new Map<string, LoadedEntry>();
  const inFlight = new Map<string, Promise<ServerHandle>>();
  // Serializes the capacity-check + load + commit critical section. Without it,
  // two concurrent acquires for different models both observe spare capacity
  // and both load, exceeding maxConcurrent (with the default max=1, that means
  // two llama-server processes — an OOM risk). The gate never rejects (the load
  // body swallows errors into the per-load promise), so the chain stays alive.
  let loadGate: Promise<void> = Promise.resolve();

  async function evictOldest() {
    let oldest: LoadedEntry | null = null;
    for (const e of entries.values()) {
      if (!oldest || e.lastAccessedAt < oldest.lastAccessedAt) oldest = e;
    }
    if (oldest) {
      entries.delete(oldest.modelId);
      try {
        await oldest.handle.stop();
      } catch {
        /* swallow — best effort */
      }
    }
  }

  async function ensureCapacity() {
    while (entries.size >= maxConcurrent) {
      await evictOldest();
    }
  }

  return {
    async acquire(modelId) {
      const existing = entries.get(modelId);
      if (existing) {
        existing.lastAccessedAt = Date.now();
        return existing.handle;
      }
      const pending = inFlight.get(modelId);
      if (pending) return pending;

      // Reserve the in-flight slot SYNCHRONOUSLY (before any await) via a
      // deferred promise, so a concurrent acquire for this same id dedups, and
      // the serialized gate below enforces capacity against committed entries.
      let resolveLoad!: (h: ServerHandle) => void;
      let rejectLoad!: (e: unknown) => void;
      const loadPromise = new Promise<ServerHandle>((res, rej) => {
        resolveLoad = res;
        rejectLoad = rej;
      });
      inFlight.set(modelId, loadPromise);

      loadGate = loadGate.then(async () => {
        try {
          await ensureCapacity();
          const handle = await deps.loadModel(modelId);
          entries.set(modelId, {
            modelId,
            handle,
            loadedAt: Date.now(),
            lastAccessedAt: Date.now(),
          });
          inFlight.delete(modelId);
          resolveLoad(handle);
        } catch (e) {
          inFlight.delete(modelId);
          rejectLoad(e);
        }
      });

      return loadPromise;
    },
    async release(modelId) {
      // If a load is still in flight, wait for it before stopping so the
      // release isn't silently dropped (which would leak the entry into the
      // pool once the load commits).
      const pending = inFlight.get(modelId);
      if (pending) {
        try {
          const handle = await pending;
          await handle.stop();
        } catch {
          /* best effort — load may have failed, nothing to stop */
        }
        entries.delete(modelId);
        return;
      }
      const entry = entries.get(modelId);
      if (!entry) return;
      entries.delete(modelId);
      try {
        await entry.handle.stop();
      } catch {
        /* best effort */
      }
    },
    async setMaxConcurrent(n) {
      if (n < 1) throw new LruPoolError({ kind: 'pool-full', current: entries.size, max: n });
      maxConcurrent = Math.floor(n);
      while (entries.size > maxConcurrent) await evictOldest();
    },
    getStatus() {
      return {
        loaded: Array.from(entries.values()).map((e) => ({ ...e })),
        maxConcurrent,
      };
    },
    async shutdownAll() {
      const all = Array.from(entries.values());
      entries.clear();
      await Promise.all(all.map((e) => e.handle.stop().catch(() => undefined)));
    },
  };
}
