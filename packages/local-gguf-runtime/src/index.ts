// Public exports for @team-x/local-gguf-runtime.
//
// Phase 1 shipped only the errors re-export. Phase 2 (Runtime + Pool) extends
// the surface with the binary resolver, port allocator, auto-tune, llama-server
// lifecycle, GPU probe + ranking, and the LRU pool / auto-swap policy, so the
// Electron-main RuntimeService / PoolService can compose them from a single
// `@team-x/local-gguf-runtime` import. Phase 3 adds the GGUF metadata parser
// and its embedding / tool-capability detectors for the LibraryService.

export * from './errors.js';
export * from './runtime/binary-resolver.js';
export * from './runtime/port-allocator.js';
export * from './runtime/auto-tune.js';
export * from './runtime/server-lifecycle.js';
export * from './gpu-probe/probe.js';
export * from './gpu-probe/ranking.js';
export * from './pool/lru-pool.js';
export * from './pool/auto-swap.js';
export * from './metadata/parser.js';
export * from './metadata/embedding-arches.js';
export * from './metadata/tool-capable-list.js';
export * from './library/split-gguf.js';
export * from './library/scanner.js';
export * from './library/folder-watcher.js';
export * from './library/resilience.js';
