import type { GpuBackend, GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { PoolService, PoolStatus } from '../services/local-gguf/pool-service.js';
import type { RuntimeService } from '../services/local-gguf/runtime-service.js';

import {
  LOCAL_GGUF_RUNTIME_CHANNELS,
  type LoadedModelHandle,
  registerLocalGgufRuntimeHandlers,
} from './local-gguf-runtime-handlers.js';

function makeFakeIpc() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const ipc = {
    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
      handlers.set(channel, fn);
    },
  } as unknown as IpcMain;
  return {
    ipc,
    channels: () => [...handlers.keys()],
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, ...args);
    },
  };
}

/** A minimal but structurally-complete GpuInventory for canned probe results. */
const CANNED_INVENTORY: GpuInventory = {
  detectedAt: 1_700_000_000_000,
  cuda: { available: false, devices: [] },
  rocm: { available: false, devices: [] },
  vulkan: { available: false, devices: [] },
  metal: { available: false, devices: [] },
  cpu: { cores: 8, ramMb: 32_768 },
};

const CANNED_SETTINGS: LocalGgufRuntimeSettings = {
  activeBackend: 'cpu',
  activeBackendIsAutoDetected: true,
  autoFallbackReason: null,
  maxConcurrentLocalModels: 1,
  defaultLibraryFolder: null,
  embeddingModelId: null,
  hfTokenKeyRef: null,
  llamaBinariesVersion: 'b9371',
};

const CANNED_HANDLE: LoadedModelHandle = {
  modelId: 'model-1',
  baseUrl: 'http://127.0.0.1:51234',
  pid: 4242,
};

const CANNED_POOL_STATUS: PoolStatus = {
  loaded: [CANNED_HANDLE],
  maxConcurrent: 2,
};

/**
 * Build fully-stubbed runtime + pool services. Every method is a `vi.fn()`
 * with a canned resolution so a registered handler can be invoked and its
 * forwarded value / args asserted. Cast to the service interface — only the
 * methods the handlers call need real stubs.
 */
function makeFakeServices() {
  const runtime = {
    init: vi.fn(async () => undefined),
    getInventory: vi.fn(async () => CANNED_INVENTORY),
    reprobeGpu: vi.fn(async () => CANNED_INVENTORY),
    getActiveBackend: vi.fn(async () => 'cpu' as GpuBackend),
    getSettings: vi.fn(async () => CANNED_SETTINGS),
    setSettings: vi.fn(async (_partial: Partial<LocalGgufRuntimeSettings>) => CANNED_SETTINGS),
    getBinariesVersion: vi.fn(async () => 'b9371'),
    resolveActiveBinary: vi.fn(),
    getRankedBackends: vi.fn(() => [] as GpuBackend[]),
  } as unknown as RuntimeService;

  const pool = {
    status: vi.fn(async () => CANNED_POOL_STATUS),
    load: vi.fn(async (_id: string) => CANNED_HANDLE),
    unload: vi.fn(async (_id: string) => undefined),
    setMaxConcurrent: vi.fn(async (_n: number) => undefined),
    shutdownAll: vi.fn(async () => undefined),
  } as unknown as PoolService;

  return { runtime, pool };
}

describe('localGguf runtime + pool IPC handlers (Phase 2, service delegation)', () => {
  it('registers exactly every runtime and pool channel', () => {
    const f = makeFakeIpc();
    registerLocalGgufRuntimeHandlers(f.ipc, makeFakeServices());
    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_RUNTIME_CHANNELS].sort());
  });

  it('localGguf.runtime.gpuInventory resolves to runtime.getInventory()', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.runtime.gpuInventory')).resolves.toBe(CANNED_INVENTORY);
    expect(deps.runtime.getInventory).toHaveBeenCalledTimes(1);
  });

  it('localGguf.runtime.reprobeGpu resolves to runtime.reprobeGpu()', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.runtime.reprobeGpu')).resolves.toBe(CANNED_INVENTORY);
    expect(deps.runtime.reprobeGpu).toHaveBeenCalledTimes(1);
  });

  it('localGguf.runtime.settings resolves to runtime.getSettings()', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.runtime.settings')).resolves.toBe(CANNED_SETTINGS);
    expect(deps.runtime.getSettings).toHaveBeenCalledTimes(1);
  });

  it('localGguf.runtime.setSettings forwards the partial and resolves to the updated settings', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    const partial: Partial<LocalGgufRuntimeSettings> = { maxConcurrentLocalModels: 2 };
    await expect(f.invoke('localGguf.runtime.setSettings', partial)).resolves.toBe(CANNED_SETTINGS);
    expect(deps.runtime.setSettings).toHaveBeenCalledWith(partial);
  });

  it('localGguf.runtime.binariesVersion resolves to runtime.getBinariesVersion()', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.runtime.binariesVersion')).resolves.toBe('b9371');
    expect(deps.runtime.getBinariesVersion).toHaveBeenCalledTimes(1);
  });

  it('localGguf.pool.status resolves to pool.status()', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.pool.status')).resolves.toEqual({
      loaded: [CANNED_HANDLE],
      maxConcurrent: 2,
    });
    expect(deps.pool.status).toHaveBeenCalledTimes(1);
  });

  it('localGguf.pool.load forwards the model id and resolves to the loaded handle', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.pool.load', 'model-1')).resolves.toBe(CANNED_HANDLE);
    expect(deps.pool.load).toHaveBeenCalledWith('model-1');
  });

  it('localGguf.pool.unload forwards the model id', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.pool.unload', 'model-1')).resolves.toBeUndefined();
    expect(deps.pool.unload).toHaveBeenCalledWith('model-1');
  });

  it('localGguf.pool.setMaxConcurrent forwards the number', async () => {
    const f = makeFakeIpc();
    const deps = makeFakeServices();
    registerLocalGgufRuntimeHandlers(f.ipc, deps);
    await expect(f.invoke('localGguf.pool.setMaxConcurrent', 3)).resolves.toBeUndefined();
    expect(deps.pool.setMaxConcurrent).toHaveBeenCalledWith(3);
  });
});
