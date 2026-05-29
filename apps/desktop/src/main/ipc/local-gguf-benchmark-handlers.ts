/**
 * IPC handlers for the localGguf.benchmark.* channels.
 *
 * Phase 1: typed not-implemented stubs. Phase 10 (benchmark runner)
 * replaces them with real implementations against the BenchmarkService.
 */

import type { BenchmarkResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_BENCHMARK_CHANNELS = [
  'localGguf.benchmark.run',
  'localGguf.benchmark.history',
] as const;

export function registerLocalGgufBenchmarkHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.benchmark.run',
    async (): Promise<BenchmarkResult> => notImplemented('localGguf.benchmark.run'),
  );
  ipc.handle(
    'localGguf.benchmark.history',
    async (): Promise<BenchmarkResult[]> => notImplemented('localGguf.benchmark.history'),
  );
}
