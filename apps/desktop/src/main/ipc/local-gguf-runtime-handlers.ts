/**
 * IPC handlers for the localGguf.runtime.* and localGguf.pool.* channels.
 *
 * Phase 2 (runtime + pool) — LIVE. Each channel delegates to the injected
 * {@link RuntimeService} (GPU probe, backend selection, persisted settings,
 * binaries version) or {@link PoolService} (LRU load / unload, capacity).
 * The Phase 1 not-implemented stubs these replaced are gone; the boot
 * sequence constructs both services and passes them in via `deps`.
 */

import type { GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import type { PoolService } from '../services/local-gguf/pool-service.js';
import type { RuntimeService } from '../services/local-gguf/runtime-service.js';

/** A loaded model's runtime handle, surfaced by the pool channels. */
export interface LoadedModelHandle {
  modelId: string;
  baseUrl: string;
  pid: number;
}

export const LOCAL_GGUF_RUNTIME_CHANNELS = [
  'localGguf.runtime.gpuInventory',
  'localGguf.runtime.reprobeGpu',
  'localGguf.runtime.settings',
  'localGguf.runtime.setSettings',
  'localGguf.runtime.binariesVersion',
  'localGguf.pool.status',
  'localGguf.pool.load',
  'localGguf.pool.unload',
  'localGguf.pool.setMaxConcurrent',
] as const;

/** Services the runtime + pool channels delegate to (constructed at boot). */
export interface LocalGgufRuntimeHandlerDeps {
  runtime: RuntimeService;
  pool: PoolService;
}

export function registerLocalGgufRuntimeHandlers(
  ipc: IpcMain,
  deps: LocalGgufRuntimeHandlerDeps,
): void {
  // ── runtime: GPU inventory + backend selection + settings ───────────────
  ipc.handle(
    'localGguf.runtime.gpuInventory',
    (): Promise<GpuInventory> => deps.runtime.getInventory(),
  );
  ipc.handle(
    'localGguf.runtime.reprobeGpu',
    (): Promise<GpuInventory> => deps.runtime.reprobeGpu(),
  );
  ipc.handle(
    'localGguf.runtime.settings',
    (): Promise<LocalGgufRuntimeSettings> => deps.runtime.getSettings(),
  );
  ipc.handle(
    'localGguf.runtime.setSettings',
    (_event, partial: Partial<LocalGgufRuntimeSettings>): Promise<LocalGgufRuntimeSettings> =>
      deps.runtime.setSettings(partial),
  );
  ipc.handle(
    'localGguf.runtime.binariesVersion',
    (): Promise<string> => deps.runtime.getBinariesVersion(),
  );

  // ── pool: LRU load / unload + capacity ──────────────────────────────────
  ipc.handle(
    'localGguf.pool.status',
    (): Promise<{ loaded: LoadedModelHandle[]; maxConcurrent: number }> => deps.pool.status(),
  );
  ipc.handle(
    'localGguf.pool.load',
    (_event, id: string): Promise<LoadedModelHandle> => deps.pool.load(id),
  );
  ipc.handle('localGguf.pool.unload', (_event, id: string): Promise<void> => deps.pool.unload(id));
  ipc.handle(
    'localGguf.pool.setMaxConcurrent',
    (_event, n: number): Promise<void> => deps.pool.setMaxConcurrent(n),
  );
}
