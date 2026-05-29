/**
 * IPC handlers for the localGguf.runtime.* and localGguf.pool.* channels.
 *
 * Phase 1: typed not-implemented stubs. Phase 2 (runtime + pool) replaces
 * them with real implementations against the RuntimeService (GPU probe,
 * backend selection, binaries version) and PoolService (LRU load/unload).
 */

import type { GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

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

export function registerLocalGgufRuntimeHandlers(ipc: IpcMain): void {
  ipc.handle('localGguf.runtime.gpuInventory', async (): Promise<GpuInventory> =>
    notImplemented('localGguf.runtime.gpuInventory'),
  );
  ipc.handle('localGguf.runtime.reprobeGpu', async (): Promise<GpuInventory> =>
    notImplemented('localGguf.runtime.reprobeGpu'),
  );
  ipc.handle('localGguf.runtime.settings', async (): Promise<LocalGgufRuntimeSettings> =>
    notImplemented('localGguf.runtime.settings'),
  );
  ipc.handle('localGguf.runtime.setSettings', async (): Promise<LocalGgufRuntimeSettings> =>
    notImplemented('localGguf.runtime.setSettings'),
  );
  ipc.handle('localGguf.runtime.binariesVersion', async (): Promise<string> =>
    notImplemented('localGguf.runtime.binariesVersion'),
  );
  ipc.handle(
    'localGguf.pool.status',
    async (): Promise<{ loaded: LoadedModelHandle[]; maxConcurrent: number }> =>
      notImplemented('localGguf.pool.status'),
  );
  ipc.handle('localGguf.pool.load', async (): Promise<LoadedModelHandle> =>
    notImplemented('localGguf.pool.load'),
  );
  ipc.handle('localGguf.pool.unload', async (): Promise<void> =>
    notImplemented('localGguf.pool.unload'),
  );
  ipc.handle('localGguf.pool.setMaxConcurrent', async (): Promise<void> =>
    notImplemented('localGguf.pool.setMaxConcurrent'),
  );
}
