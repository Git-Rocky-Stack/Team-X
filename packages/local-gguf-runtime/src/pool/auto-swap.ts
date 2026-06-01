import type { ServerHandle } from '../runtime/server-lifecycle';
// packages/local-gguf-runtime/src/pool/auto-swap.ts
import type { LruPool } from './lru-pool';

export interface AutoSwapPolicy {
  resolveOrLoad(modelId: string): Promise<ServerHandle>;
}

export function createAutoSwapPolicy(pool: LruPool): AutoSwapPolicy {
  return {
    resolveOrLoad(modelId) {
      // The pool's acquire already implements LRU-eviction-on-demand.
      // This indirection documents the policy as a stable interface
      // the provider-router adapter consumes (Phase 4).
      return pool.acquire(modelId);
    },
  };
}
