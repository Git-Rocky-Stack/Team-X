// packages/local-gguf-runtime/src/errors.ts
//
// Re-exports the canonical LocalGgufError union from @team-x/shared-types
// (a direct dependency of this package). The re-export gives runtime
// consumers a single import surface — `@team-x/local-gguf-runtime` — for
// both the error helpers and the runtime APIs that later phases add here,
// so call sites don't reach into shared-types for error types separately.

export { isLocalGgufError, type GpuBackend, type LocalGgufError } from '@team-x/shared-types';
