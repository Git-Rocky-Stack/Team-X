// Public exports for @team-x/local-gguf-runtime.
//
// Phase 1 shipped only the errors re-export. Phase 2 (Runtime + Pool) extends
// the surface with the binary resolver, port allocator, auto-tune, llama-server
// lifecycle, GPU probe + ranking, and the LRU pool / auto-swap policy, so the
// Electron-main RuntimeService / PoolService can compose them from a single
// `@team-x/local-gguf-runtime` import.

export * from './errors.js';
export * from './runtime/binary-resolver.js';
export * from './runtime/port-allocator.js';
export * from './runtime/auto-tune.js';
export * from './runtime/server-lifecycle.js';
export * from './gpu-probe/probe.js';
export * from './gpu-probe/ranking.js';
export * from './pool/lru-pool.js';
export * from './pool/auto-swap.js';
