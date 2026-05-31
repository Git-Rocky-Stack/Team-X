/**
 * PoolService — Electron-main wrapper over the `@team-x/local-gguf-runtime`
 * LRU pool (v3.3.0 Local & Networked GGUF Support, Phase 2 spec § 12).
 *
 * Owns a single {@link LruPool} whose `loadModel` callback is the load pipeline:
 * read the model row → § 12.3 health-check the active backend and resolve its
 * binary → auto-tune from GGUF metadata + detected VRAM/cores → overlay any
 * per-model advanced-param overrides → allocate a port → spawn llama-server.
 * The pool then enforces `maxConcurrentLocalModels` with LRU eviction.
 *
 * House style: a pure factory function returning an object of methods (mirrors
 * `cloud-link-service.ts`). Every I/O dependency — the runtime service, the
 * model/advanced-param repos (narrowed to the structural slice consumed), the
 * settings accessor, port allocation, server spawning, auto-tune, and even the
 * pool constructor — is injectable with a real default, so unit tests drive it
 * with fakes (no real subprocess, no real GPU, no real network).
 */

import {
  type AutoTuneInput,
  type AutoTuneOutput,
  type LruPool,
  type LruPoolDeps,
  type ServerHandle,
  type SpawnServerOptions,
  createLruPool,
  allocatePort as defaultAllocatePort,
  autoTune as defaultAutoTune,
  spawnServer as defaultSpawnServer,
} from '@team-x/local-gguf-runtime';
import type { AdvancedParams, GpuBackend, GpuInventory, LocalModel } from '@team-x/shared-types';

import type { LocalGgufSettingsAccessor } from '../runtime-settings/local-gguf-settings.js';

/** Narrow structural slice of the runtime service this pool consumes. */
export interface PoolRuntime {
  resolveActiveBinary(): Promise<{ backend: GpuBackend; binaryPath: string }>;
  getInventory(): Promise<GpuInventory>;
}

/** Narrow structural slice of the local-models repo (mirrors cloud-link-service). */
export interface PoolModelsRepo {
  getById(id: string): LocalModel | null;
}

/** Narrow structural slice of the advanced-params repo. */
export interface PoolAdvancedParamsRepo {
  getByModelId(id: string): AdvancedParams | null;
}

export interface PoolServiceDeps {
  /** § 12.3 health-check + active GPU inventory provider. */
  runtime: PoolRuntime;
  /** Local-models repo (narrowed). */
  models: PoolModelsRepo;
  /** Per-model advanced-param overrides (narrowed). */
  advancedParams: PoolAdvancedParamsRepo;
  /** Settings accessor — used to persist `maxConcurrentLocalModels`. */
  settings: LocalGgufSettingsAccessor;
  /** Pool capacity at construction (caller passes `settings.get().maxConcurrentLocalModels`). */
  initialMaxConcurrent: number;
  /** Ephemeral-port allocator; defaults to the package {@link defaultAllocatePort}. */
  allocatePort?: () => Promise<number>;
  /** llama-server spawner; defaults to the package {@link defaultSpawnServer}. */
  spawnServer?: (opts: SpawnServerOptions) => Promise<ServerHandle>;
  /** GGUF auto-tuner; defaults to the package {@link defaultAutoTune}. */
  autoTune?: (input: AutoTuneInput) => AutoTuneOutput;
  /** Pool constructor; defaults to the package {@link createLruPool} (overridable for tests). */
  createPool?: (deps: LruPoolDeps, initialMax: number) => LruPool;
}

/** Shape returned to the IPC layer for a loaded model (Task 13 contract). */
export interface LoadedModelInfo {
  modelId: string;
  baseUrl: string;
  pid: number;
}

export interface PoolStatus {
  loaded: LoadedModelInfo[];
  maxConcurrent: number;
}

export interface PoolService {
  status(): Promise<PoolStatus>;
  load(modelId: string): Promise<LoadedModelInfo>;
  unload(modelId: string): Promise<void>;
  setMaxConcurrent(n: number): Promise<void>;
  shutdownAll(): Promise<void>;
}

/**
 * Sum the VRAM (MB) of every device the active backend exposes. CPU (and any
 * backend with no devices) yields 0, which drives `nGpuLayers = 0` in auto-tune.
 */
function vramForBackend(inventory: GpuInventory, backend: GpuBackend): number {
  let devices: ReadonlyArray<{ vramMb: number }>;
  switch (backend) {
    case 'cuda':
      devices = inventory.cuda.devices;
      break;
    case 'rocm':
      devices = inventory.rocm.devices;
      break;
    case 'vulkan':
      devices = inventory.vulkan.devices;
      break;
    case 'metal':
      devices = inventory.metal.devices;
      break;
    default:
      return 0; // cpu / none
  }
  return devices.reduce((sum, d) => sum + d.vramMb, 0);
}

/** Overlay non-null advanced-param overrides onto an auto-tuned base. */
function mergeTuning(
  base: AutoTuneOutput,
  adv: AdvancedParams | null,
): AutoTuneOutput & {
  mmap: boolean | undefined;
  mlock: boolean | undefined;
  flashAttention: boolean | undefined;
} {
  return {
    nCtx: adv?.nCtx ?? base.nCtx,
    nGpuLayers: adv?.nGpuLayers ?? base.nGpuLayers,
    nBatch: adv?.nBatch ?? base.nBatch,
    nThreads: adv?.nThreads ?? base.nThreads,
    temperature: adv?.temperature ?? base.temperature,
    topP: adv?.topP ?? base.topP,
    topK: adv?.topK ?? base.topK,
    repeatPenalty: adv?.repeatPenalty ?? base.repeatPenalty,
    // Tri-state booleans: null = "use auto/default", so only forward non-null.
    mmap: adv?.mmap ?? undefined,
    mlock: adv?.mlock ?? undefined,
    flashAttention: adv?.flashAttention ?? undefined,
  };
}

export function createPoolService(deps: PoolServiceDeps): PoolService {
  const allocatePort = deps.allocatePort ?? defaultAllocatePort;
  const spawnServer = deps.spawnServer ?? defaultSpawnServer;
  const autoTune = deps.autoTune ?? defaultAutoTune;
  const createPool = deps.createPool ?? createLruPool;

  /**
   * The pool's load pipeline. Runs the § 12.3 health check before every load
   * (per spec: "smoke-tests the active backend before each model load").
   */
  async function loadModel(modelId: string): Promise<ServerHandle> {
    const row = deps.models.getById(modelId);
    if (!row) {
      throw new Error(`[pool-service] model not found: ${modelId}`);
    }
    if (!row.sourcePath) {
      throw new Error(`[pool-service] model ${modelId} has no local source path to serve`);
    }

    // § 12.3: health-check + resolve the active backend's binary before loading.
    const { backend, binaryPath } = await deps.runtime.resolveActiveBinary();

    const inventory = await deps.runtime.getInventory();
    const availableVramMb = vramForBackend(inventory, backend);

    const base = autoTune({
      ggufContextMax: row.ggufContextMax,
      ggufArch: row.ggufArch ?? 'llama',
      ggufParamsB: row.ggufParamsB ?? 7,
      ggufQuant: row.ggufQuant ?? 'Q4_K_M',
      ggufSizeBytes: row.ggufSizeBytes ?? 0,
      availableVramMb,
      physicalCores: inventory.cpu.cores,
    });

    const adv = deps.advancedParams.getByModelId(modelId);
    const tuned = mergeTuning(base, adv);

    const port = await allocatePort();

    return spawnServer({
      binaryPath,
      modelPath: row.sourcePath,
      port,
      nCtx: tuned.nCtx,
      nGpuLayers: tuned.nGpuLayers,
      nBatch: tuned.nBatch,
      nThreads: tuned.nThreads,
      flashAttention: tuned.flashAttention,
      mmap: tuned.mmap,
      mlock: tuned.mlock,
    });
  }

  const pool = createPool({ loadModel }, deps.initialMaxConcurrent);

  async function status(): Promise<PoolStatus> {
    const raw = pool.getStatus();
    return {
      loaded: raw.loaded.map((e) => ({
        modelId: e.modelId,
        baseUrl: e.handle.baseUrl,
        pid: e.handle.pid,
      })),
      maxConcurrent: raw.maxConcurrent,
    };
  }

  async function load(modelId: string): Promise<LoadedModelInfo> {
    const handle = await pool.acquire(modelId);
    return { modelId, baseUrl: handle.baseUrl, pid: handle.pid };
  }

  async function unload(modelId: string): Promise<void> {
    await pool.release(modelId);
  }

  async function setMaxConcurrent(n: number): Promise<void> {
    await pool.setMaxConcurrent(n);
    deps.settings.setMaxConcurrent(n);
  }

  async function shutdownAll(): Promise<void> {
    await pool.shutdownAll();
  }

  return { status, load, unload, setMaxConcurrent, shutdownAll };
}
