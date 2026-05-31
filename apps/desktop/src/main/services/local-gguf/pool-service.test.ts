import type {
  AutoTuneInput,
  AutoTuneOutput,
  ServerHandle,
  SpawnServerOptions,
} from '@team-x/local-gguf-runtime';
import type {
  AdvancedParams,
  GpuInventory,
  LocalGgufRuntimeSettings,
  LocalModel,
} from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { LocalGgufSettingsAccessor } from '../runtime-settings/local-gguf-settings.js';
import { DEFAULT_LOCAL_GGUF_SETTINGS } from '../runtime-settings/local-gguf-settings.js';

import { createPoolService } from './pool-service.js';

/** Extract the first argument of a mock's first call, asserting it was called. */
function firstCallArg<T>(mock: { mock: { calls: unknown[][] } }): T {
  const call = mock.mock.calls[0];
  if (!call) throw new Error('expected mock to have been called at least once');
  return call[0] as T;
}

function makeModel(overrides: Partial<LocalModel> = {}): LocalModel {
  return {
    id: 'model-1',
    displayName: 'Test 7B',
    sourceType: 'file',
    sourcePath: 'D:/models/test-7b.Q4_K_M.gguf',
    endpointId: null,
    ggufArch: 'llama',
    ggufParamsB: 7,
    ggufQuant: 'Q4_K_M',
    ggufContextMax: 8192,
    ggufSizeBytes: 4_500_000_000,
    ggufSha256: null,
    ggufChatTemplate: null,
    isEmbeddingModel: false,
    isToolCapable: false,
    hfRepoId: null,
    hfFilename: null,
    license: null,
    chatTemplateOverride: null,
    systemPromptOverride: null,
    status: 'cold',
    statusDetail: null,
    lastUsedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeAdvancedParams(overrides: Partial<AdvancedParams> = {}): AdvancedParams {
  return {
    modelId: 'model-1',
    nCtx: null,
    nGpuLayers: null,
    nBatch: null,
    nThreads: null,
    temperature: null,
    topP: null,
    topK: null,
    repeatPenalty: null,
    mmap: null,
    mlock: null,
    flashAttention: null,
    updatedAt: 0,
    ...overrides,
  };
}

function cudaInventory(): GpuInventory {
  return {
    detectedAt: 0,
    cuda: {
      available: true,
      devices: [
        { name: 'GTX TITAN X', vramMb: 12_288, backend: 'cuda' },
        { name: 'GTX TITAN X', vramMb: 12_288, backend: 'cuda' },
      ],
    },
    rocm: { available: false, devices: [] },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 16, ramMb: 65_536 },
  };
}

function makeHandle(overrides: Partial<ServerHandle> = {}): ServerHandle {
  return {
    port: 50000,
    pid: 4242,
    baseUrl: 'http://127.0.0.1:50000',
    stop: vi.fn().mockResolvedValue(undefined),
    onCrash: vi.fn(),
    ...overrides,
  };
}

function makeFakeSettings(
  initial: Partial<LocalGgufRuntimeSettings> = {},
): LocalGgufSettingsAccessor & { setMaxConcurrent: ReturnType<typeof vi.fn> } {
  let state: LocalGgufRuntimeSettings = { ...DEFAULT_LOCAL_GGUF_SETTINGS, ...initial };
  return {
    get: vi.fn(() => ({ ...state })),
    updateBackend: vi.fn(),
    recordFallback: vi.fn(),
    setMaxConcurrent: vi.fn((n: number) => {
      state = { ...state, maxConcurrentLocalModels: Math.floor(n) };
    }),
    setDefaultLibraryFolder: vi.fn(),
    setEmbeddingModelId: vi.fn(),
    setHfTokenKeyRef: vi.fn(),
    setLlamaBinariesVersion: vi.fn(),
  };
}

interface Harness {
  models: { getById: ReturnType<typeof vi.fn> };
  advancedParams: { getByModelId: ReturnType<typeof vi.fn> };
  runtime: {
    resolveActiveBinary: ReturnType<typeof vi.fn>;
    getInventory: ReturnType<typeof vi.fn>;
  };
  settings: ReturnType<typeof makeFakeSettings>;
  allocatePort: ReturnType<typeof vi.fn>;
  spawnServer: ReturnType<typeof vi.fn>;
  autoTune: ReturnType<typeof vi.fn>;
  service: ReturnType<typeof createPoolService>;
}

function makeHarness(
  opts: {
    model?: LocalModel | null;
    advanced?: AdvancedParams | null;
    backend?: 'cuda' | 'vulkan' | 'cpu';
    inventory?: GpuInventory;
    handle?: ServerHandle;
    initialMax?: number;
    autoTuneOut?: AutoTuneOutput;
  } = {},
): Harness {
  const model = opts.model === undefined ? makeModel() : opts.model;
  const advanced = opts.advanced === undefined ? null : opts.advanced;
  const backend = opts.backend ?? 'cuda';
  const inventory = opts.inventory ?? cudaInventory();
  const handle = opts.handle ?? makeHandle();

  const models = { getById: vi.fn(() => model) };
  const advancedParams = { getByModelId: vi.fn(() => advanced) };
  const runtime = {
    resolveActiveBinary: vi.fn().mockResolvedValue({
      backend,
      binaryPath: `C:/app/resources/llama-server/win32-x64/${backend}/server.exe`,
    }),
    getInventory: vi.fn().mockResolvedValue(inventory),
  };
  const settings = makeFakeSettings({ maxConcurrentLocalModels: opts.initialMax ?? 1 });
  const allocatePort = vi.fn().mockResolvedValue(50_007);
  const spawnServer = vi.fn().mockResolvedValue(handle);
  const autoTune = vi.fn(
    (input: AutoTuneInput): AutoTuneOutput =>
      opts.autoTuneOut ?? {
        nCtx: 4096,
        nGpuLayers: 999,
        nBatch: 512,
        nThreads: Math.max(1, input.physicalCores - 2),
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        repeatPenalty: 1.1,
      },
  );

  const service = createPoolService({
    runtime,
    models,
    advancedParams,
    settings,
    initialMaxConcurrent: opts.initialMax ?? 1,
    allocatePort,
    spawnServer,
    autoTune,
  });

  return {
    models,
    advancedParams,
    runtime,
    settings,
    allocatePort,
    spawnServer,
    autoTune,
    service,
  };
}

describe('pool-service', () => {
  describe('load', () => {
    it('pulls the row, resolves the binary, allocates a port, spawns, and returns {modelId, baseUrl, pid}', async () => {
      const h = makeHarness();

      const result = await h.service.load('model-1');

      expect(h.models.getById).toHaveBeenCalledWith('model-1');
      expect(h.runtime.resolveActiveBinary).toHaveBeenCalledTimes(1);
      expect(h.allocatePort).toHaveBeenCalledTimes(1);
      expect(h.spawnServer).toHaveBeenCalledTimes(1);

      const spawnArgs = firstCallArg<SpawnServerOptions>(h.spawnServer);
      expect(spawnArgs).toMatchObject({
        binaryPath: 'C:/app/resources/llama-server/win32-x64/cuda/server.exe',
        modelPath: 'D:/models/test-7b.Q4_K_M.gguf',
        port: 50_007,
      });
      expect(result).toEqual({
        modelId: 'model-1',
        baseUrl: 'http://127.0.0.1:50000',
        pid: 4242,
      });
    });

    it('feeds VRAM (summed across active-backend devices) and CPU cores into autoTune', async () => {
      const h = makeHarness({ backend: 'cuda', inventory: cudaInventory() });
      await h.service.load('model-1');
      const tuneInput = firstCallArg<AutoTuneInput>(h.autoTune);
      // Two TITAN X @ 12288 MB each on the cuda backend.
      expect(tuneInput.availableVramMb).toBe(24_576);
      expect(tuneInput.physicalCores).toBe(16);
      expect(tuneInput.ggufArch).toBe('llama');
      expect(tuneInput.ggufParamsB).toBe(7);
    });

    it('uses 0 VRAM when the active backend is cpu', async () => {
      const h = makeHarness({ backend: 'cpu' });
      await h.service.load('model-1');
      const tuneInput = firstCallArg<AutoTuneInput>(h.autoTune);
      expect(tuneInput.availableVramMb).toBe(0);
    });

    it('applies advanced-params overrides over the auto-tuned base', async () => {
      const h = makeHarness({
        advanced: makeAdvancedParams({
          nCtx: 2048,
          nGpuLayers: 10,
          nBatch: 256,
          nThreads: 4,
          flashAttention: true,
          mmap: false,
          mlock: true,
        }),
      });

      await h.service.load('model-1');

      const spawnArgs = firstCallArg<SpawnServerOptions>(h.spawnServer);
      expect(spawnArgs).toMatchObject({
        nCtx: 2048,
        nGpuLayers: 10,
        nBatch: 256,
        nThreads: 4,
        flashAttention: true,
        mmap: false,
        mlock: true,
      });
    });

    it('falls back to the pure auto-tune values when no advanced-params row exists', async () => {
      const h = makeHarness({
        advanced: null,
        autoTuneOut: {
          nCtx: 4096,
          nGpuLayers: 999,
          nBatch: 512,
          nThreads: 14,
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          repeatPenalty: 1.1,
        },
      });

      await h.service.load('model-1');

      const spawnArgs = firstCallArg<SpawnServerOptions>(h.spawnServer);
      expect(spawnArgs).toMatchObject({
        nCtx: 4096,
        nGpuLayers: 999,
        nBatch: 512,
        nThreads: 14,
      });
    });

    it('ignores null override fields and keeps the auto-tuned value', async () => {
      const h = makeHarness({
        advanced: makeAdvancedParams({ nCtx: 1024, nGpuLayers: null }),
        autoTuneOut: {
          nCtx: 4096,
          nGpuLayers: 777,
          nBatch: 512,
          nThreads: 14,
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          repeatPenalty: 1.1,
        },
      });

      await h.service.load('model-1');

      const spawnArgs = firstCallArg<SpawnServerOptions>(h.spawnServer);
      expect(spawnArgs.nCtx).toBe(1024); // overridden
      expect(spawnArgs.nGpuLayers).toBe(777); // auto-tuned (override was null)
    });

    it('throws when the model row is missing', async () => {
      const h = makeHarness({ model: null });
      await expect(h.service.load('ghost')).rejects.toThrow(/not found/i);
    });

    it('throws when the model has no local source path', async () => {
      const h = makeHarness({ model: makeModel({ sourcePath: null }) });
      await expect(h.service.load('model-1')).rejects.toThrow();
    });

    it('refuses a sourcePath that resembles a CLI flag (argument-injection guard)', async () => {
      const h = makeHarness({ model: makeModel({ sourcePath: '--no-mmap' }) });
      await expect(h.service.load('model-1')).rejects.toThrow(/resembles a CLI flag/i);
      // The dangerous path must never reach the spawn.
      expect(h.spawnServer).not.toHaveBeenCalled();
    });

    it('runs resolveActiveBinary (the §12.3 health check) before each load', async () => {
      const h = makeHarness({ initialMax: 2 });
      await h.service.load('model-1');
      h.models.getById.mockReturnValue(makeModel({ id: 'model-2' }));
      await h.service.load('model-2');
      expect(h.runtime.resolveActiveBinary).toHaveBeenCalledTimes(2);
    });
  });

  describe('status', () => {
    it('maps loaded pool entries to {modelId, baseUrl, pid} and reports maxConcurrent', async () => {
      const h = makeHarness({ initialMax: 3 });
      await h.service.load('model-1');

      const status = await h.service.status();

      expect(status.maxConcurrent).toBe(3);
      expect(status.loaded).toEqual([
        { modelId: 'model-1', baseUrl: 'http://127.0.0.1:50000', pid: 4242 },
      ]);
    });
  });

  describe('setMaxConcurrent', () => {
    it('persists to settings AND updates the pool', async () => {
      const h = makeHarness({ initialMax: 1 });
      await h.service.setMaxConcurrent(4);
      expect(h.settings.setMaxConcurrent).toHaveBeenCalledWith(4);
      const status = await h.service.status();
      expect(status.maxConcurrent).toBe(4);
    });
  });

  describe('unload', () => {
    it('releases the model and stops its handle', async () => {
      const handle = makeHandle();
      const h = makeHarness({ handle });
      await h.service.load('model-1');
      await h.service.unload('model-1');
      expect(handle.stop).toHaveBeenCalledTimes(1);
      const status = await h.service.status();
      expect(status.loaded).toHaveLength(0);
    });
  });

  describe('shutdownAll', () => {
    it('stops every loaded handle and empties the pool', async () => {
      const handle = makeHandle();
      const h = makeHarness({ handle, initialMax: 2 });
      await h.service.load('model-1');
      await h.service.shutdownAll();
      expect(handle.stop).toHaveBeenCalled();
      const status = await h.service.status();
      expect(status.loaded).toHaveLength(0);
    });
  });
});
