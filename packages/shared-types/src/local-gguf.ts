// packages/shared-types/src/local-gguf.ts
//
// Canonical types for the Local & Networked GGUF Support feature (v3.3.0).
// Locked in Phase 1; changes require master-plan update + migration of all
// consumers in the same commit.

export type GpuBackend = 'cuda' | 'rocm' | 'vulkan' | 'metal' | 'cpu';

export type SourceType = 'file' | 'folder-entry' | 'remote-endpoint';

export type ModelStatus = 'cold' | 'loading' | 'loaded' | 'error' | 'unreachable' | 'missing';

export type EndpointStatus = 'unknown' | 'reachable' | 'unreachable' | 'auth-failed';

export type WatchFolderStatus = 'unknown' | 'reachable' | 'unreachable';

export interface GpuDevice {
  name: string;
  vramMb: number;
  backend: GpuBackend;
  // --- Optional shape extensions (Spike S2, confirmed on real hardware 2026-05-29).
  // All optional → backward-compatible. See docs/spikes/2026-05-27-S2-gpu-probe-cross-platform.md
  // "Shape adjustments to GpuInventory". Strict set (load-bearing for backend ranking):
  computeCap?: string; // nvidia-smi compute_cap, e.g. "5.2" (Maxwell) / "12.0". Gates CUDA-build compatibility (S2 F16, S4 F13).
  gfxTarget?: string; // rocminfo gfxNNNN, e.g. "gfx1100". Confirms HIP --device-targets match.
  uuid?: string; // nvidia-smi -L UUID (CUDA) / deviceUUID (Vulkan). Stable per-device key; coalesce by UUID, not index (S2 F17).
  coreCount?: number; // Apple Silicon GPU core count; drives n_gpu_layers heuristic on Metal.
  metalSupport?: string; // system_profiler "Metal Support", e.g. "Metal 3"; gates shader-bundle compatibility.
  // Liberal set (display + cross-vendor coalescing):
  vendorId?: string; // vulkaninfo vendorID, e.g. "0x10de". Cross-vendor coalescing key.
  deviceId?: string; // vulkaninfo deviceID, e.g. "0x17c2".
  deviceType?: string; // vulkaninfo deviceType, e.g. "PHYSICAL_DEVICE_TYPE_DISCRETE_GPU".
  driverInfo?: string; // vulkaninfo driverInfo, e.g. "582.28" — human-readable for Settings → Runtime.
  apiVersion?: string; // vulkaninfo apiVersion, e.g. "1.4.312".
}

export interface GpuInventory {
  detectedAt: number;
  cuda: {
    available: boolean;
    devices: GpuDevice[];
    driverVersion?: string;
    cudaVersion?: string;
  };
  rocm: {
    available: boolean;
    devices: GpuDevice[];
    rocmVersion?: string;
  };
  vulkan: { available: boolean; devices: GpuDevice[] };
  metal: { available: boolean; devices: GpuDevice[] };
  cpu: { cores: number; ramMb: number };
}

export interface GgufMetadata {
  arch: string;
  paramsBillions: number | null;
  quant: string | null;
  contextMax: number | null;
  chatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  fileSizeBytes: number;
  sha256: string | null;
}

export interface LocalModel {
  id: string;
  displayName: string;
  sourceType: SourceType;
  sourcePath: string | null;
  endpointId: string | null;
  ggufArch: string | null;
  ggufParamsB: number | null;
  ggufQuant: string | null;
  ggufContextMax: number | null;
  ggufSizeBytes: number | null;
  ggufSha256: string | null;
  ggufChatTemplate: string | null;
  isEmbeddingModel: boolean;
  isToolCapable: boolean;
  hfRepoId: string | null;
  hfFilename: string | null;
  license: string | null;
  chatTemplateOverride: string | null;
  systemPromptOverride: string | null;
  status: ModelStatus;
  statusDetail: string | null;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdvancedParams {
  modelId: string;
  nCtx: number | null;
  nGpuLayers: number | null;
  nBatch: number | null;
  nThreads: number | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  repeatPenalty: number | null;
  mmap: boolean | null;
  mlock: boolean | null;
  flashAttention: boolean | null;
  updatedAt: number;
}

export interface BenchmarkResult {
  id: string;
  modelId: string;
  promptEvalTokS: number;
  genTokS: number;
  ttftMs: number;
  vramPeakMb: number | null;
  backend: GpuBackend;
  nCtxUsed: number;
  nGpuLayersUsed: number;
  ranAt: number;
}

export interface RemoteEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
  privacyTier: 'Local';
  status: EndpointStatus;
  lastCheckedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WatchFolder {
  id: string;
  path: string;
  recursive: boolean;
  status: WatchFolderStatus;
  lastScanAt: number | null;
  lastScanError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalGgufRuntimeSettings {
  activeBackend: GpuBackend;
  activeBackendIsAutoDetected: boolean;
  autoFallbackReason: string | null;
  maxConcurrentLocalModels: number; // pool size, default 1
  defaultLibraryFolder: string | null;
  embeddingModelId: string | null;
  hfTokenKeyRef: string | null; // optional, stored in keytar
  llamaBinariesVersion: string; // e.g. "b9371"
}

export type LocalGgufError =
  | { kind: 'binary-not-found'; backend: GpuBackend; path: string }
  | { kind: 'binary-unsupported'; backend: GpuBackend; osVersion: string }
  | { kind: 'gpu-probe-failed'; reason: string }
  | { kind: 'oom-predicted'; requiredMb: number; availableMb: number }
  | { kind: 'oom-runtime'; lastStderr: string }
  | { kind: 'gguf-parse-failed'; path: string; reason: string }
  | { kind: 'gguf-corrupt'; path: string; sha256Mismatch?: boolean }
  | { kind: 'server-spawn-failed'; exitCode: number | null; stderr: string }
  | { kind: 'server-crashed'; pid: number; exitCode: number | null; stderr: string }
  | { kind: 'port-exhausted' }
  | { kind: 'source-unreachable'; path: string }
  | { kind: 'hf-download-failed'; repo: string; file: string; httpStatus: number; body: string }
  | { kind: 'hf-rate-limited'; retryAfterS: number }
  | { kind: 'endpoint-unreachable'; url: string; httpStatus?: number }
  | { kind: 'endpoint-auth-failed'; url: string }
  | { kind: 'pool-full'; current: number; max: number }
  | { kind: 'context-too-large'; requested: number; max: number };

/**
 * Structural type guard. Confirms an unknown value is shaped like a
 * LocalGgufError (object with a string `kind`). Does NOT enforce that
 * `kind` is one of the declared variants — that's TypeScript's job at
 * compile time. Useful at IPC + JSON deserialization boundaries.
 */
export function isLocalGgufError(value: unknown): value is LocalGgufError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown };
  return typeof v.kind === 'string';
}

// ---------------------------------------------------------------------------
// Hugging Face Hub browser types
// ---------------------------------------------------------------------------
//
// Surfaced by the `localGguf.hf.*` channels. Phase 1 introduces them at the
// contract level so the preload bridge and IPC stubs share one definition;
// Phase 7 (HF browser) wires them to the real HfService. They live here in
// shared-types — not inline in the handler module — so the main process,
// preload, and renderer all type-check against a single source of truth.

/** One row of a Hugging Face Hub model search result. */
export interface HfSearchResult {
  repoId: string;
  downloads: number;
  likes: number;
  description: string;
  tags: string[];
}

/** A Hugging Face model card with its downloadable file siblings. */
export interface HfModelCard {
  repoId: string;
  description: string;
  license: string | null;
  siblings: Array<{ rfilename: string; sizeBytes: number | null }>;
}

/** Live progress for an in-flight Hugging Face download. */
export interface DownloadProgress {
  handleId: string;
  repoId: string;
  filename: string;
  bytesReceived: number;
  bytesTotal: number;
  state: 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Bridge surface — the `localGguf` namespace on `window.teamx`
// ---------------------------------------------------------------------------
//
// The high-level, renderer-facing shape of the `localGguf.*` IPC namespace.
// Composed into `TeamXApi` (see ipc.ts) so renderer code calls
// `window.teamx.localGguf.<area>.<method>(...)` and type-checks against the
// same contract the main-process handler layer implements. Phase 1 ships the
// full typed surface even though every handler is a not-implemented stub;
// later phases swap the implementations in behind these stable signatures.

export interface LocalGgufApi {
  library: {
    list(): Promise<LocalModel[]>;
    get(id: string): Promise<LocalModel | null>;
    addFile(path: string): Promise<LocalModel>;
    addFolder(path: string, recursive: boolean): Promise<WatchFolder>;
    removeModel(id: string): Promise<void>;
    removeFolder(id: string): Promise<void>;
    scanFolder(id: string): Promise<{ addedCount: number; removedCount: number }>;
    setSystemPrompt(id: string, prompt: string | null): Promise<LocalModel>;
    setChatTemplate(id: string, template: string | null): Promise<LocalModel>;
    setAdvancedParams(id: string, params: Partial<AdvancedParams>): Promise<AdvancedParams>;
    resetAdvanced(id: string): Promise<AdvancedParams>;
    listBySourceType(sourceType: SourceType): Promise<LocalModel[]>;
  };
  runtime: {
    gpuInventory(): Promise<GpuInventory>;
    reprobeGpu(): Promise<GpuInventory>;
    settings(): Promise<LocalGgufRuntimeSettings>;
    setSettings(partial: Partial<LocalGgufRuntimeSettings>): Promise<LocalGgufRuntimeSettings>;
    binariesVersion(): Promise<string>;
  };
  pool: {
    status(): Promise<{
      loaded: Array<{ modelId: string; baseUrl: string; pid: number }>;
      maxConcurrent: number;
    }>;
    load(id: string): Promise<{ modelId: string; baseUrl: string; pid: number }>;
    unload(id: string): Promise<void>;
    setMaxConcurrent(n: number): Promise<void>;
  };
  endpoint: {
    list(): Promise<RemoteEndpoint[]>;
    add(config: {
      name: string;
      baseUrl: string;
      authHeaderKeyRef: string | null;
    }): Promise<RemoteEndpoint>;
    remove(id: string): Promise<void>;
    test(id: string): Promise<{ reachable: boolean; latencyMs?: number; error?: LocalGgufError }>;
    update(
      id: string,
      partial: { name?: string; baseUrl?: string; authHeaderKeyRef?: string | null },
    ): Promise<RemoteEndpoint>;
  };
  hf: {
    search(query: string, filters: Record<string, unknown>): Promise<HfSearchResult[]>;
    modelCard(repoId: string): Promise<HfModelCard>;
    startDownload(
      repoId: string,
      filename: string,
      targetFolder: string,
    ): Promise<{ handleId: string }>;
    pauseDownload(handleId: string): Promise<void>;
    resumeDownload(handleId: string): Promise<void>;
    cancelDownload(handleId: string): Promise<void>;
    activeDownloads(): Promise<DownloadProgress[]>;
  };
  benchmark: {
    run(modelId: string): Promise<BenchmarkResult>;
    history(modelId: string): Promise<BenchmarkResult[]>;
  };
}
