/**
 * RuntimeService — Electron-main orchestrator for the local GGUF runtime
 * (v3.3.0 Local & Networked GGUF Support, Phase 2 spec § 12).
 *
 * Composes the pure building blocks from `@team-x/local-gguf-runtime`
 * (GPU probe, backend ranking, binary resolver) with the persisted
 * `localGguf.*` settings, exposing the surface the Task 13 IPC handlers call.
 *
 * House style: a pure factory function returning an object of methods (mirrors
 * `cloud-link-service.ts`). Every dependency that touches I/O — the GPU probe,
 * the binary resolver, `fileExists`, and the `--version` health-check spawn —
 * is injectable with a real default, so unit tests drive it with fakes (no real
 * subprocess, no real GPU).
 *
 * The crown jewel is `resolveActiveBinary()` — the § 12.3 health-check +
 * single-rank fallback that demotes a backend whose bundled binary fails its
 * `--version` smoke test (e.g. the CUDA-13.3 build on Maxwell sm_52, which must
 * fall back CUDA → Vulkan). See the method doc for the verbatim spec text.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import {
  BinaryResolverError,
  resolveBinaryPath as defaultResolveBinaryPath,
  probeGpu,
  rankBackends,
} from '@team-x/local-gguf-runtime';
import type {
  GpuBackend,
  GpuInventory,
  LocalGgufError,
  LocalGgufRuntimeSettings,
} from '@team-x/shared-types';

import type { LocalGgufSettingsAccessor } from '../runtime-settings/local-gguf-settings.js';

/** Health-check timeout for the `<binary> --version` smoke test (§ 12.3). */
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Carries a typed {@link LocalGgufError} so IPC handlers (Task 13) can surface a
 * structured kind to the renderer rather than a bare `Error`. Used when no
 * backend in the ranked list passes its health check.
 */
export class RuntimeServiceError extends Error {
  constructor(public readonly error: LocalGgufError) {
    super(`RuntimeServiceError: ${JSON.stringify(error)}`);
    this.name = 'RuntimeServiceError';
  }
}

/** Signature of the package's {@link defaultResolveBinaryPath}, narrowed for injection. */
export type ResolveBinaryPathFn = (opts: {
  platform: NodeJS.Platform;
  arch: 'x64' | 'arm64';
  backend: GpuBackend;
  resourcesRoot: string;
  fileExists: (path: string) => boolean;
}) => string;

export interface RuntimeServiceDeps {
  /** Typed accessor for the persisted `localGguf.*` settings namespace. */
  settings: LocalGgufSettingsAccessor;
  /** OS platform; defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** CPU arch; defaults to `process.arch` narrowed to the supported union. */
  arch?: 'x64' | 'arm64';
  /** Root under which `llama-server/<platform-arch>/<backend>/` lives. */
  resourcesRoot: string;
  /** Pinned llama-server build tag (e.g. `b9371`), persisted on `init()`. */
  binariesVersion: string;
  /** GPU inventory probe; defaults to the real parallel-subprocess {@link probeGpu}. */
  probe?: () => Promise<GpuInventory>;
  /** Backend ranking; defaults to the pure {@link rankBackends}. */
  rank?: (inventory: GpuInventory) => GpuBackend[];
  /** Binary path resolver; defaults to the package {@link defaultResolveBinaryPath}. */
  resolveBinaryPath?: ResolveBinaryPathFn;
  /** File-existence check passed into the resolver; defaults to `fs.existsSync`. */
  fileExists?: (path: string) => boolean;
  /**
   * § 12.3 backend smoke test: spawn `<binaryPath> --version` with a 5 s
   * timeout, resolving `true` iff exit code 0. Defaults to a real spawn.
   */
  healthCheck?: (binaryPath: string) => Promise<boolean>;
}

export interface ResolvedBinary {
  backend: GpuBackend;
  binaryPath: string;
}

export interface RuntimeService {
  init(): Promise<void>;
  getInventory(): Promise<GpuInventory>;
  reprobeGpu(): Promise<GpuInventory>;
  getActiveBackend(): Promise<GpuBackend>;
  getSettings(): Promise<LocalGgufRuntimeSettings>;
  setSettings(partial: Partial<LocalGgufRuntimeSettings>): Promise<LocalGgufRuntimeSettings>;
  getBinariesVersion(): Promise<string>;
  resolveActiveBinary(): Promise<ResolvedBinary>;
  getRankedBackends(): GpuBackend[];
}

/**
 * Default § 12.3 health check: spawn `<binaryPath> --version` with stdio
 * ignored and a 5 s timeout. Resolves `true` only on a clean exit-code-0; any
 * spawn error, non-zero exit, or timeout resolves `false`.
 *
 * Security: args are passed as an array (never a shell string), so the binary
 * path is not subject to shell interpolation. The timeout guards on
 * `proc.exitCode === null` before `kill()` to avoid a spurious EPERM 'error'
 * when killing an already-exited process on Windows (mirrors probe.ts).
 */
function defaultHealthCheck(binaryPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const proc = spawn(binaryPath, ['--version'], { stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
      finish(false);
    }, HEALTH_CHECK_TIMEOUT_MS);
    proc.on('exit', (code) => finish(code === 0));
    proc.on('error', () => finish(false));
  });
}

function narrowArch(arch: string): 'x64' | 'arm64' {
  return arch === 'arm64' ? 'arm64' : 'x64';
}

/** True iff a thrown error is a BinaryResolverError for an absent/unsupported binary. */
function isBinaryAbsent(err: unknown): boolean {
  return (
    err instanceof BinaryResolverError &&
    (err.error.kind === 'binary-not-found' || err.error.kind === 'binary-unsupported')
  );
}

export function createRuntimeService(deps: RuntimeServiceDeps): RuntimeService {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? narrowArch(process.arch);
  const probe = deps.probe ?? probeGpu;
  const rank = deps.rank ?? rankBackends;
  const resolveBinaryPath = deps.resolveBinaryPath ?? defaultResolveBinaryPath;
  const fileExists = deps.fileExists ?? existsSync;
  const healthCheck = deps.healthCheck ?? defaultHealthCheck;

  let cachedInventory: GpuInventory | null = null;
  let rankedBackends: GpuBackend[] = [];

  /** Probe → cache inventory → re-rank → persist top backend as auto-detected. */
  async function probeAndRank(): Promise<GpuInventory> {
    const inventory = await probe();
    cachedInventory = inventory;
    rankedBackends = rank(inventory);
    const top = rankedBackends[0] ?? 'cpu';
    deps.settings.updateBackend(top, true);
    return inventory;
  }

  async function init(): Promise<void> {
    await probeAndRank();
    deps.settings.setLlamaBinariesVersion(deps.binariesVersion);
  }

  async function getInventory(): Promise<GpuInventory> {
    if (cachedInventory) return cachedInventory;
    return probeAndRank();
  }

  async function reprobeGpu(): Promise<GpuInventory> {
    return probeAndRank();
  }

  async function getActiveBackend(): Promise<GpuBackend> {
    return deps.settings.get().activeBackend;
  }

  async function getSettings(): Promise<LocalGgufRuntimeSettings> {
    return deps.settings.get();
  }

  async function setSettings(
    partial: Partial<LocalGgufRuntimeSettings>,
  ): Promise<LocalGgufRuntimeSettings> {
    // A manual backend set is, by definition, not auto-detected.
    if (partial.activeBackend !== undefined) {
      deps.settings.updateBackend(partial.activeBackend, false);
    }
    if (partial.maxConcurrentLocalModels !== undefined) {
      deps.settings.setMaxConcurrent(partial.maxConcurrentLocalModels);
    }
    if (partial.defaultLibraryFolder !== undefined) {
      deps.settings.setDefaultLibraryFolder(partial.defaultLibraryFolder);
    }
    if (partial.embeddingModelId !== undefined) {
      deps.settings.setEmbeddingModelId(partial.embeddingModelId);
    }
    if (partial.hfTokenKeyRef !== undefined) {
      deps.settings.setHfTokenKeyRef(partial.hfTokenKeyRef);
    }
    return deps.settings.get();
  }

  async function getBinariesVersion(): Promise<string> {
    return deps.settings.get().llamaBinariesVersion;
  }

  function getRankedBackends(): GpuBackend[] {
    return [...rankedBackends];
  }

  /**
   * § 12.3 (verbatim): "The runtime-service smoke-tests the active backend
   * before each model load by spawning the chosen binary with `--version` and a
   * 5 s timeout. On failure, fall back one rank, log via toast, and persist the
   * fallback choice with an `autoFallbackReason` flag."
   *
   * Walks the ranked list starting at the current active backend's position
   * (falling through the whole list if the active backend isn't ranked). For
   * each candidate: resolve its binary path (skip on binary-not-found /
   * -unsupported — that backend simply isn't installed), then health-check it.
   * The first healthy candidate wins; if it differs from the active backend, the
   * demotion is persisted via `recordFallback(candidate, reason)` so the UI can
   * surface why the runtime is no longer on the auto-detected backend. Throws a
   * `RuntimeServiceError({ kind: 'gpu-probe-failed' })` if nothing passes.
   */
  async function resolveActiveBinary(): Promise<ResolvedBinary> {
    // Ensure we have a ranked list (lazy-probe if init() was never called).
    if (rankedBackends.length === 0) await probeAndRank();

    const activeBackend = deps.settings.get().activeBackend;
    const startIndex = rankedBackends.indexOf(activeBackend);
    // Start at the active backend if it's in the ranked list; otherwise walk all.
    const candidates = startIndex >= 0 ? rankedBackends.slice(startIndex) : [...rankedBackends];

    const failedBackends: GpuBackend[] = [];

    for (const candidate of candidates) {
      let binaryPath: string;
      try {
        binaryPath = resolveBinaryPath({
          platform,
          arch,
          backend: candidate,
          resourcesRoot: deps.resourcesRoot,
          fileExists,
        });
      } catch (err) {
        if (isBinaryAbsent(err)) {
          // Not installed / unsupported on this platform — treat as a failed
          // rank so the fallback reason names it, and continue.
          failedBackends.push(candidate);
          continue;
        }
        throw err;
      }

      const healthy = await healthCheck(binaryPath);
      if (!healthy) {
        failedBackends.push(candidate);
        continue;
      }

      // Healthy. If we demoted past the active backend, persist the fallback.
      if (candidate !== activeBackend) {
        // Two distinct demotion causes: (a) one or more higher-ranked backends
        // failed their --version health check (the normal CUDA→Vulkan case), or
        // (b) the active backend isn't valid on this platform at all, so it was
        // never in the ranked list and never attempted (startIndex === -1). Name
        // the cause accurately — claiming the active backend "failed its health
        // check" when it was never run would mislead the Settings diagnosis.
        const reason =
          failedBackends.length > 0
            ? `${failedBackends.join(', ')} failed its --version health check`
            : `${activeBackend} is not available on this platform; using ${candidate}`;
        deps.settings.recordFallback(candidate, reason);
      }
      return { backend: candidate, binaryPath };
    }

    throw new RuntimeServiceError({
      kind: 'gpu-probe-failed',
      reason: `No backend passed its --version health check (tried: ${candidates.join(', ')})`,
    });
  }

  return {
    init,
    getInventory,
    reprobeGpu,
    getActiveBackend,
    getSettings,
    setSettings,
    getBinariesVersion,
    resolveActiveBinary,
    getRankedBackends,
  };
}
