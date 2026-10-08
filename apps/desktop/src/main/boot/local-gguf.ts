/**
 * Local & Networked GGUF Support (v3.3.0) — the boot phases of the
 * `localGguf.*` subsystem, in the order the composition root runs them:
 *
 *   1. `bootLocalGgufServices`        — repos, runtime, pool, library.
 *   2. `bootLocalGgufNetworkServices` — endpoints, HF browser, benchmarks
 *                                       (needs the secrets store).
 *   3. `registerLocalGgufIpcHandlers` — the IPC surface.
 *   4. `startLocalGgufBackgroundWork` — GPU probe + watch-folder re-hydration.
 *
 * The pool, library and HF services are also published on `runtime` so the
 * will-quit handler can tear them down before the SQLite handle closes.
 */

import {
  access as fsAccess,
  open as fsOpen,
  readdir as fsReaddir,
  stat as fsStat,
} from 'node:fs/promises';

import { runProbeCommand, sampleNvidiaVramMb } from '@team-x/local-gguf-runtime';
import type { AdvancedParams, LocalModel } from '@team-x/shared-types';
import { ipcMain } from 'electron';

import type { TeamXDb } from '../db/client.js';
import { createLocalModelAdvancedParamsRepo } from '../db/repos/local-model-advanced-params.js';
import { createLocalModelBenchmarksRepo } from '../db/repos/local-model-benchmarks.js';
import { createLocalModelEndpointsRepo } from '../db/repos/local-model-endpoints.js';
import { createLocalModelWatchFoldersRepo } from '../db/repos/local-model-watch-folders.js';
import { createLocalModelsRepo } from '../db/repos/local-models.js';
import { registerLocalGgufBenchmarkHandlers } from '../ipc/local-gguf-benchmark-handlers.js';
import { registerLocalGgufEndpointHandlers } from '../ipc/local-gguf-endpoint-handlers.js';
import { registerLocalGgufHfHandlers } from '../ipc/local-gguf-hf-handlers.js';
import { registerLocalGgufLibraryHandlers } from '../ipc/local-gguf-library-handlers.js';
import { registerLocalGgufRuntimeHandlers } from '../ipc/local-gguf-runtime-handlers.js';
import {
  type BenchmarkService,
  createBenchmarkService,
} from '../services/local-gguf/benchmark-service.js';
import {
  type EndpointService,
  createEndpointService,
} from '../services/local-gguf/endpoint-service.js';
import { type HfService, createHfService } from '../services/local-gguf/hf-service.js';
import {
  type LibraryFs,
  type LibraryService,
  createLibraryService,
} from '../services/local-gguf/library-service.js';
import { type PoolService, createPoolService } from '../services/local-gguf/pool-service.js';
import {
  type RuntimeService,
  createRuntimeService,
} from '../services/local-gguf/runtime-service.js';
import {
  type LocalGgufSettingsStore,
  createLocalGgufSettingsAccessor,
} from '../services/runtime-settings/local-gguf-settings.js';
import type { SecretsStore } from '../services/secrets.js';

import { LLAMA_BINARIES_VERSION, resolveLlamaResourcesRoot } from './paths.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface LocalGgufServicesDeps extends Pick<Repositories, 'settingsRepo'> {
  db: TeamXDb;
}

export type LocalGgufServices = ReturnType<typeof bootLocalGgufServices>;

export function bootLocalGgufServices(deps: LocalGgufServicesDeps) {
  const { db, settingsRepo } = deps;

  // ── Local & Networked GGUF runtime (v3.3.0 Phase 2) ───────────────────
  const localModelsRepo = createLocalModelsRepo(db);
  const localModelAdvancedParamsRepo = createLocalModelAdvancedParamsRepo(db);
  // Phase 3 (library + scanning): folder sources scanned for GGUF files; the
  // LibraryService owns the watcher/monitor lifecycle for each registered row.
  const localModelWatchFoldersRepo = createLocalModelWatchFoldersRepo(db);
  // Phase 5 (remote LAN endpoints) + Phase 10 (benchmark history).
  const localModelEndpointsRepo = createLocalModelEndpointsRepo(db);
  const localModelBenchmarksRepo = createLocalModelBenchmarksRepo(db);

  // Adapter: the app settings repo (getRaw → string | null / set → JSON) →
  // the get<T>() | undefined / set<T>() shape the local-gguf accessor expects.
  const localGgufSettingsStore: LocalGgufSettingsStore = {
    get<T>(key: string): T | undefined {
      const raw = settingsRepo.getRaw(key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    set<T>(key: string, value: T): void {
      settingsRepo.set(key, value);
    },
  };
  const localGgufSettings = createLocalGgufSettingsAccessor(localGgufSettingsStore);

  const runtimeService: RuntimeService = createRuntimeService({
    settings: localGgufSettings,
    resourcesRoot: resolveLlamaResourcesRoot(),
    binariesVersion: LLAMA_BINARIES_VERSION,
  });
  const poolService: PoolService = createPoolService({
    runtime: runtimeService,
    models: localModelsRepo,
    advancedParams: localModelAdvancedParamsRepo,
    settings: localGgufSettings,
    initialMaxConcurrent: localGgufSettings.get().maxConcurrentLocalModels,
  });
  runtime.poolServiceInstance = poolService;

  // ── Local & Networked GGUF library service (v3.3.0 Phase 3) ───────────
  // Production filesystem adapter. readFile MUST honour `{ length }`: the
  // service reads only the GGUF head (1 MiB) to parse metadata, and a plain
  // fs.readFile ignores `length` - it would load a multi-GB model fully into
  // memory. A bounded `length` is satisfied via a file handle partial read
  // (a small head file simply returns fewer bytes, which is fine). Node `fs`
  // accepts the scanner's forward-slash paths on Windows, incl. //host/share.
  const libraryFs: LibraryFs = {
    async readFile(path, opts) {
      const fh = await fsOpen(path, 'r');
      try {
        if (opts?.length == null) {
          return await fh.readFile();
        }
        const buf = Buffer.allocUnsafe(opts.length);
        const { bytesRead } = await fh.read(buf, 0, opts.length, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },
    stat: (p) => fsStat(p).then((s) => ({ size: s.size })),
    access: (p) => fsAccess(p),
    // The scanner always passes `{ withFileTypes: true }`; force that overload
    // (Dirent[]) so the structural `{ name, isDirectory, isFile }` return holds.
    readdir: (p) => fsReaddir(p, { withFileTypes: true }) as ReturnType<LibraryFs['readdir']>,
  };

  // resetAdvanced = "reset to auto": clear the stored override, then return
  // an all-null AdvancedParams meaning "no overrides; auto-tune on next load".
  // Real auto-tuning (GPU probe + autoTune) already runs at model-load time in
  // pool-service.ts, so a settings-reset click must NOT trigger a GPU probe -
  // returning the null/auto row is the correct, side-effect-free behaviour.
  const computeAutoParams = async (model: LocalModel): Promise<AdvancedParams> => ({
    modelId: model.id,
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
    updatedAt: Date.now(),
  });

  const libraryService: LibraryService = createLibraryService({
    models: localModelsRepo,
    watchFolders: localModelWatchFoldersRepo,
    advancedParams: localModelAdvancedParamsRepo,
    fs: libraryFs,
    computeAutoParams,
  });
  runtime.libraryServiceInstance = libraryService;

  return {
    localModelsRepo,
    localModelEndpointsRepo,
    localModelBenchmarksRepo,
    localGgufSettings,
    runtimeService,
    poolService,
    libraryService,
  };
}

export interface LocalGgufNetworkServicesDeps
  extends Pick<
    LocalGgufServices,
    | 'localModelsRepo'
    | 'localModelEndpointsRepo'
    | 'localModelBenchmarksRepo'
    | 'localGgufSettings'
    | 'poolService'
  > {
  secretsStore: SecretsStore;
}

export type LocalGgufNetworkServices = ReturnType<typeof bootLocalGgufNetworkServices>;

export function bootLocalGgufNetworkServices(deps: LocalGgufNetworkServicesDeps) {
  const {
    localModelsRepo,
    localModelEndpointsRepo,
    localModelBenchmarksRepo,
    localGgufSettings,
    poolService,
    secretsStore,
  } = deps;

  // ── Local & Networked GGUF: endpoints, HF browser, benchmarks ─────────
  // These three complete the `localGguf.*` surface. Until now their channels
  // were registered but threw a Phase 1 not-implemented error, so the whole
  // namespace looked live from the preload bridge while a third of it could
  // only fail. Constructed here rather than beside the Phase 2/3 services
  // above because all three need `secretsStore`, which is created at this
  // point in the boot sequence.
  const endpointService: EndpointService = createEndpointService({
    repo: localModelEndpointsRepo,
    // Read-only slice: the service resolves an endpoint's stored auth header
    // for its reachability probe and never writes to the keychain.
    secrets: {
      getEndpointAuthHeader: (keyRef) => secretsStore.getEndpointAuthHeader(keyRef),
    },
  });

  const hfService: HfService = createHfService({
    // `hfTokenKeyRef` names the keychain entry; the token itself never
    // touches the settings store. Read per call so rotating it in Settings
    // takes effect on the next request rather than the next launch.
    getToken: async () => {
      const ref = localGgufSettings.get().hfTokenKeyRef;
      if (!ref) return null;
      try {
        return await secretsStore.getHfToken(ref);
      } catch (err) {
        console.warn('[main] could not read the Hugging Face token from the keychain', err);
        return null;
      }
    },
  });
  runtime.hfServiceInstance = hfService;

  const benchmarkService: BenchmarkService = createBenchmarkService({
    pool: poolService,
    models: localModelsRepo,
    benchmarks: localModelBenchmarksRepo,
    runtime: { getSettings: async () => localGgufSettings.get() },
    // Real peak-VRAM sampling on NVIDIA hardware; every other backend (and
    // any box without nvidia-smi) resolves to null, which the benchmark row
    // records as "not measured" rather than as zero.
    sampleVramMb: () => sampleNvidiaVramMb({ runCommand: runProbeCommand, timeoutMs: 3000 }),
  });

  return { endpointService, hfService, benchmarkService };
}

export type LocalGgufIpcDeps = Pick<
  LocalGgufServices,
  'libraryService' | 'runtimeService' | 'poolService'
> &
  LocalGgufNetworkServices;

export function registerLocalGgufIpcHandlers(deps: LocalGgufIpcDeps): void {
  const {
    libraryService,
    runtimeService,
    poolService,
    hfService,
    benchmarkService,
    endpointService,
  } = deps;

  // Local & Networked GGUF Support (v3.3.0) — the whole `localGguf.*` surface
  // is LIVE. Every handler delegates to a real service: library + runtime +
  // pool (Phases 2-3), endpoints (Phase 5), the Hugging Face browser and its
  // resumable download manager (Phase 7), and the benchmark runner
  // (Phase 10). No channel in this namespace throws not-implemented any more.
  registerLocalGgufLibraryHandlers(ipcMain, { library: libraryService });
  registerLocalGgufRuntimeHandlers(ipcMain, { runtime: runtimeService, pool: poolService });
  registerLocalGgufHfHandlers(ipcMain, { hf: hfService });
  registerLocalGgufBenchmarkHandlers(ipcMain, { benchmark: benchmarkService });
  registerLocalGgufEndpointHandlers(ipcMain, { endpoints: endpointService });
}

export function startLocalGgufBackgroundWork(
  deps: Pick<LocalGgufServices, 'runtimeService' | 'libraryService'>,
): void {
  const { runtimeService, libraryService } = deps;

  // Pre-warm the GPU probe + persist the active backend / binaries version in
  // the background. Fire-and-forget by design: the probe must never delay
  // handler registration or window creation, and the services lazy-probe on
  // first use anyway, so a slow or failed probe degrades gracefully (CPU
  // backend) rather than blocking boot. Non-fatal — log and continue.
  void runtimeService.init().catch((err: unknown) => {
    console.error('[main] local-gguf runtimeService.init failed (GPU probe):', err);
  });

  // Re-hydrate watch folders persisted from a prior session: bring each
  // folder's chokidar watcher + resilience monitor back online and reconcile
  // it against the current disk state. Fire-and-forget for the same reason as
  // the GPU probe above — `start()` registers every watcher synchronously
  // before it yields, so coverage is live immediately, while the per-folder
  // reconciles run in the background and a slow/unreachable NAS never blocks
  // window creation. Non-fatal — failures are logged inside the service.
  void libraryService.start().catch((err: unknown) => {
    console.error('[main] local-gguf libraryService.start failed (watch re-hydration):', err);
  });
}
