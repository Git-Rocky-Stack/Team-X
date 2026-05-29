// packages/local-gguf-runtime/src/errors.ts
//
// Re-exports the canonical LocalGgufError union from @team-x/shared-types.
// This indirection lets runtime consumers import errors from
// `@team-x/local-gguf-runtime/errors` without depending on shared-types
// transitively — keeps the dependency graph readable.

export { isLocalGgufError, type GpuBackend, type LocalGgufError } from '@team-x/shared-types';
