/**
 * IPC handlers for the localGguf.benchmark.* channels.
 *
 * Phase 10 (benchmark runner) — LIVE. Both channels delegate to the injected
 * {@link BenchmarkService}, which loads the model through the pool, drives one
 * fixed completion against the resulting llama-server, and records only what it
 * measured. The Phase 1 not-implemented stubs these replaced are gone; the boot
 * sequence constructs the service and passes it in via `deps`.
 *
 * `run` is long-running by nature — it may have to load a multi-gigabyte model
 * before it can measure anything — so the renderer should treat the invoke as a
 * task rather than a quick round-trip.
 */

import type { BenchmarkResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import type { BenchmarkService } from '../services/local-gguf/benchmark-service.js';

export const LOCAL_GGUF_BENCHMARK_CHANNELS = [
  'localGguf.benchmark.run',
  'localGguf.benchmark.history',
] as const;

/** Service the benchmark channels delegate to (constructed at boot). */
export interface LocalGgufBenchmarkHandlerDeps {
  benchmark: BenchmarkService;
}

export function registerLocalGgufBenchmarkHandlers(
  ipc: IpcMain,
  deps: LocalGgufBenchmarkHandlerDeps,
): void {
  const { benchmark } = deps;

  ipc.handle(
    'localGguf.benchmark.run',
    (_event, modelId: string): Promise<BenchmarkResult> => benchmark.run(modelId),
  );

  ipc.handle(
    'localGguf.benchmark.history',
    (_event, modelId: string): Promise<BenchmarkResult[]> => benchmark.history(modelId),
  );
}
