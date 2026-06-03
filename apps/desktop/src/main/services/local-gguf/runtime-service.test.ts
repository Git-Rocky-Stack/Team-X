import { BinaryResolverError } from '@team-x/local-gguf-runtime';
import type { GpuBackend, GpuInventory, LocalGgufRuntimeSettings } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalGgufSettingsAccessor } from '../runtime-settings/local-gguf-settings.js';
import { DEFAULT_LOCAL_GGUF_SETTINGS } from '../runtime-settings/local-gguf-settings.js';

import { RuntimeServiceError, createRuntimeService } from './runtime-service.js';

/**
 * In-memory fake of LocalGgufSettingsAccessor. Mirrors the real accessor's
 * write semantics (updateBackend clears the fallback reason; recordFallback
 * sets it and marks the backend not-auto-detected) so round-trip assertions
 * exercise the same state machine the production accessor implements.
 */
function makeFakeSettings(
  initial: Partial<LocalGgufRuntimeSettings> = {},
): LocalGgufSettingsAccessor & {
  updateBackend: ReturnType<typeof vi.fn>;
  recordFallback: ReturnType<typeof vi.fn>;
  setMaxConcurrent: ReturnType<typeof vi.fn>;
  setLlamaBinariesVersion: ReturnType<typeof vi.fn>;
} {
  let state: LocalGgufRuntimeSettings = { ...DEFAULT_LOCAL_GGUF_SETTINGS, ...initial };
  return {
    get: vi.fn(() => ({ ...state })),
    updateBackend: vi.fn((backend: GpuBackend, autoDetected: boolean) => {
      state = {
        ...state,
        activeBackend: backend,
        activeBackendIsAutoDetected: autoDetected,
        autoFallbackReason: null,
      };
    }),
    recordFallback: vi.fn((backend: GpuBackend, reason: string) => {
      state = {
        ...state,
        activeBackend: backend,
        activeBackendIsAutoDetected: false,
        autoFallbackReason: reason,
      };
    }),
    setMaxConcurrent: vi.fn((n: number) => {
      state = { ...state, maxConcurrentLocalModels: Math.floor(n) };
    }),
    setDefaultLibraryFolder: vi.fn((path: string | null) => {
      state = { ...state, defaultLibraryFolder: path };
    }),
    setEmbeddingModelId: vi.fn((id: string | null) => {
      state = { ...state, embeddingModelId: id };
    }),
    setHfTokenKeyRef: vi.fn((ref: string | null) => {
      state = { ...state, hfTokenKeyRef: ref };
    }),
    setLlamaBinariesVersion: vi.fn((version: string) => {
      state = { ...state, llamaBinariesVersion: version };
    }),
  };
}

function makeInventory(overrides: Partial<GpuInventory> = {}): GpuInventory {
  return {
    detectedAt: 1_700_000_000_000,
    cuda: { available: false, devices: [] },
    rocm: { available: false, devices: [] },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 8, ramMb: 32_768 },
    ...overrides,
  };
}

/**
 * Inventory where a MODERN CUDA GPU is present (compute capability 8.9 — the
 * bundled CUDA 13.3 build runs it natively), so compute-cap-aware ranking keeps
 * CUDA first: ['cuda','vulkan','cpu']. Used by the tests that exercise the
 * §12.3 health-check + fallback MECHANICS, which need CUDA legitimately ranked
 * on top. The Maxwell-class soft-demote is covered by {@link maxwellInventory}.
 */
function cudaInventory(): GpuInventory {
  return makeInventory({
    cuda: {
      available: true,
      devices: [{ name: 'RTX 4090', vramMb: 24_576, backend: 'cuda', computeCap: '8.9' }],
    },
    vulkan: {
      available: true,
      devices: [{ name: 'RTX 4090', vramMb: 24_576, backend: 'vulkan' }],
    },
  });
}

/**
 * Inventory for a Maxwell-class NVIDIA rig (the dual GTX TITAN X / sm_52). The
 * bundled CUDA 13.3 build cannot initialize sm_52, so compute-cap-aware ranking
 * demotes CUDA below Vulkan UP FRONT (['vulkan','cuda','cpu']) rather than
 * relying on a failing CUDA --version smoke-check + fallback. See ranking.ts and
 * docs/spikes/2026-05-27-S4-llama-server-lifecycle.md F13 (Codex CR-7 F4).
 */
function maxwellInventory(): GpuInventory {
  return makeInventory({
    cuda: {
      available: true,
      devices: [{ name: 'GTX TITAN X', vramMb: 12_288, backend: 'cuda', computeCap: '5.2' }],
    },
    vulkan: {
      available: true,
      devices: [{ name: 'GTX TITAN X', vramMb: 12_288, backend: 'vulkan' }],
    },
  });
}

describe('runtime-service', () => {
  let settings: ReturnType<typeof makeFakeSettings>;

  beforeEach(() => {
    settings = makeFakeSettings();
  });

  describe('init', () => {
    it('probes, ranks, and persists the top-ranked backend + binaries version', async () => {
      const inventory = cudaInventory();
      const probe = vi.fn().mockResolvedValue(inventory);
      const svc = createRuntimeService({
        settings,
        platform: 'win32',
        arch: 'x64',
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe,
      });

      await svc.init();

      expect(probe).toHaveBeenCalledTimes(1);
      // cuda available → ranked ['cuda','vulkan','cpu'] → activeBackend = 'cuda', auto-detected.
      expect(settings.updateBackend).toHaveBeenCalledWith('cuda', true);
      expect(settings.setLlamaBinariesVersion).toHaveBeenCalledWith('b9371');
      expect(svc.getRankedBackends()).toEqual(['cuda', 'vulkan', 'cpu']);
    });

    it('demotes CUDA below Vulkan on a Maxwell-class rig and persists vulkan as the top backend (CR-7 F4)', async () => {
      // The bundled CUDA 13.3 build can't initialize sm_52, so compute-cap-aware
      // ranking puts Vulkan first UP FRONT — the auto-detected backend is vulkan,
      // not cuda, with no failing-CUDA detour. See ranking.ts + S4 spike F13.
      const probe = vi.fn().mockResolvedValue(maxwellInventory());
      const svc = createRuntimeService({
        settings,
        platform: 'win32',
        arch: 'x64',
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe,
      });

      await svc.init();

      expect(settings.updateBackend).toHaveBeenCalledWith('vulkan', true);
      expect(svc.getRankedBackends()).toEqual(['vulkan', 'cuda', 'cpu']);
    });

    it('is safe to call twice (idempotent)', async () => {
      const probe = vi.fn().mockResolvedValue(makeInventory());
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe,
      });
      await svc.init();
      await svc.init();
      expect(probe).toHaveBeenCalledTimes(2);
      expect(svc.getRankedBackends()).toEqual(['cpu']);
    });
  });

  describe('getInventory', () => {
    it('probes lazily on first call and caches afterward', async () => {
      const inventory = cudaInventory();
      const probe = vi.fn().mockResolvedValue(inventory);
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe,
      });

      const first = await svc.getInventory();
      const second = await svc.getInventory();

      expect(first).toBe(inventory);
      expect(second).toBe(inventory);
      expect(probe).toHaveBeenCalledTimes(1);
    });
  });

  describe('reprobeGpu', () => {
    it('re-runs the probe, re-ranks, and updates the active backend', async () => {
      const first = makeInventory(); // cpu-only
      const second = cudaInventory();
      const probe = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe,
      });

      await svc.init();
      expect(settings.updateBackend).toHaveBeenLastCalledWith('cpu', true);

      const inv = await svc.reprobeGpu();
      expect(inv).toBe(second);
      expect(probe).toHaveBeenCalledTimes(2);
      expect(settings.updateBackend).toHaveBeenLastCalledWith('cuda', true);
      expect(svc.getRankedBackends()).toEqual(['cuda', 'vulkan', 'cpu']);
    });
  });

  describe('settings accessors', () => {
    it('getActiveBackend reflects persisted state', async () => {
      settings = makeFakeSettings({ activeBackend: 'vulkan' });
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(makeInventory()),
      });
      expect(await svc.getActiveBackend()).toBe('vulkan');
    });

    it('getSettings returns the full settings object', async () => {
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(makeInventory()),
      });
      expect(await svc.getSettings()).toMatchObject({ activeBackend: 'cpu' });
    });

    it('getBinariesVersion reads from settings', async () => {
      settings = makeFakeSettings({ llamaBinariesVersion: 'b9371' });
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(makeInventory()),
      });
      expect(await svc.getBinariesVersion()).toBe('b9371');
    });

    it('setSettings marks a manual backend change as NOT auto-detected', async () => {
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(makeInventory()),
      });
      const result = await svc.setSettings({ activeBackend: 'vulkan' });
      expect(settings.updateBackend).toHaveBeenCalledWith('vulkan', false);
      expect(result.activeBackend).toBe('vulkan');
      expect(result.activeBackendIsAutoDetected).toBe(false);
    });

    it('setSettings persists maxConcurrentLocalModels and other fields', async () => {
      const svc = createRuntimeService({
        settings,
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(makeInventory()),
      });
      const result = await svc.setSettings({
        maxConcurrentLocalModels: 3,
        defaultLibraryFolder: 'D:/models',
        embeddingModelId: 'emb-1',
        hfTokenKeyRef: 'keyref-1',
      });
      expect(settings.setMaxConcurrent).toHaveBeenCalledWith(3);
      expect(result.maxConcurrentLocalModels).toBe(3);
      expect(result.defaultLibraryFolder).toBe('D:/models');
      expect(result.embeddingModelId).toBe('emb-1');
      expect(result.hfTokenKeyRef).toBe('keyref-1');
    });
  });

  describe('resolveActiveBinary — §12.3 health-check + fallback', () => {
    function svcWith(opts: {
      inventory: GpuInventory;
      installed: Set<GpuBackend>;
      healthy: Set<GpuBackend>;
      activeBackend?: GpuBackend;
    }) {
      if (opts.activeBackend) {
        settings = makeFakeSettings({ activeBackend: opts.activeBackend });
      }
      const resolveBinaryPath = vi.fn((args: { backend: GpuBackend }) => {
        if (!opts.installed.has(args.backend)) {
          throw new BinaryResolverError({
            kind: 'binary-not-found',
            backend: args.backend,
            path: `C:/app/resources/llama-server/win32-x64/${args.backend}/server.exe`,
          });
        }
        return `C:/app/resources/llama-server/win32-x64/${args.backend}/server.exe`;
      });
      const healthCheck = vi.fn(async (binaryPath: string) => {
        for (const b of opts.healthy) {
          if (binaryPath.includes(`/${b}/`)) return true;
        }
        return false;
      });
      const svc = createRuntimeService({
        settings,
        platform: 'win32',
        arch: 'x64',
        resourcesRoot: 'C:/app/resources',
        binariesVersion: 'b9371',
        probe: vi.fn().mockResolvedValue(opts.inventory),
        resolveBinaryPath,
        healthCheck,
      });
      return { svc, resolveBinaryPath, healthCheck };
    }

    it('returns the top backend when it passes its --version health check (no fallback)', async () => {
      const { svc, healthCheck } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
      });
      await svc.init();

      const res = await svc.resolveActiveBinary();

      expect(res.backend).toBe('cuda');
      expect(res.binaryPath).toContain('/cuda/');
      expect(healthCheck).toHaveBeenCalledWith(res.binaryPath);
      expect(settings.recordFallback).not.toHaveBeenCalled();
    });

    it('falls back cuda → vulkan when CUDA fails --version (defense-in-depth: broken CUDA install) and records the reason', async () => {
      // Even when ranking legitimately puts CUDA first (a modern card), the
      // bundled CUDA binary can still fail its --version smoke-check (e.g. a
      // missing cudart DLL / broken driver). The health-check is the runtime's
      // defense-in-depth net that complements compute-cap ranking: it must demote
      // to vulkan and record the reason. (Maxwell sm_52 is handled earlier, by
      // ranking — see the Maxwell-class F4 tests below.)
      const { svc, healthCheck } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(['vulkan', 'cpu']), // cuda NOT healthy
      });
      await svc.init();
      expect(settings.get().activeBackend).toBe('cuda');

      const res = await svc.resolveActiveBinary();

      expect(res.backend).toBe('vulkan');
      expect(res.binaryPath).toContain('/vulkan/');
      // cuda was attempted (and failed), then vulkan.
      expect(healthCheck).toHaveBeenCalledTimes(2);
      expect(settings.recordFallback).toHaveBeenCalledTimes(1);
      expect(settings.recordFallback).toHaveBeenCalledWith(
        'vulkan',
        expect.stringMatching(/cuda/i),
      );
    });

    it('skips a backend whose binary is not installed and continues to the next', async () => {
      // cuda ranked first but not installed → resolveBinaryPath throws
      // binary-not-found → continue to vulkan, which is healthy.
      const { svc, resolveBinaryPath, healthCheck } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['vulkan', 'cpu']), // cuda missing
        healthy: new Set<GpuBackend>(['vulkan', 'cpu']),
      });
      await svc.init();

      const res = await svc.resolveActiveBinary();

      expect(res.backend).toBe('vulkan');
      // resolveBinaryPath was attempted for cuda (threw) and vulkan (resolved).
      expect(resolveBinaryPath).toHaveBeenCalled();
      // healthCheck only ran for the installed candidate(s) — cuda never spawned.
      expect(healthCheck).toHaveBeenCalledTimes(1);
      // Falling back from the auto-detected cuda → vulkan records the reason.
      expect(settings.recordFallback).toHaveBeenCalledTimes(1);
    });

    it('records an accurate reason when the active backend is not valid on this platform', async () => {
      // A manual override set the active backend to 'metal' on a win32 box,
      // where metal is never in the ranked list (startIndex === -1). The walk
      // runs over the ranked list from the top and the first candidate is
      // healthy, so failedBackends stays empty. The recorded reason must state
      // metal is unavailable — NOT that it "failed its health check", because it
      // was never attempted (that would mislead the Settings diagnosis).
      const { svc } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
      });
      await svc.init();
      await svc.setSettings({ activeBackend: 'metal' }); // manual, not auto-detected

      const res = await svc.resolveActiveBinary();

      expect(res.backend).toBe('cuda');
      expect(settings.recordFallback).toHaveBeenCalledWith(
        'cuda',
        expect.stringMatching(/metal is not available on this platform/i),
      );
    });

    it('throws when no candidate backend passes the health check', async () => {
      const { svc } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(), // none healthy
      });
      await svc.init();

      // Must be the structured, LocalGgufError-bearing RuntimeServiceError that
      // the Task 13 IPC handlers route to the renderer — not a bare Error.
      const err = await svc.resolveActiveBinary().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RuntimeServiceError);
      expect((err as RuntimeServiceError).error).toMatchObject({ kind: 'gpu-probe-failed' });
    });

    it('does not record a fallback when the active backend itself passes', async () => {
      const { svc } = svcWith({
        inventory: cudaInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(['cuda']),
      });
      await svc.init();
      const res = await svc.resolveActiveBinary();
      expect(res.backend).toBe('cuda');
      expect(settings.recordFallback).not.toHaveBeenCalled();
    });

    it('on a Maxwell rig, resolves vulkan WITHOUT a failing CUDA smoke-check or a recorded fallback (CR-7 F4)', async () => {
      // The whole point of compute-cap ranking: because CUDA is already demoted
      // below Vulkan for sm_52, resolveActiveBinary picks the legitimately
      // top-ranked vulkan directly. It must NOT attempt (and fail) the CUDA
      // --version check first, and must NOT record a fallback — vulkan is the
      // auto-detected top, not a demotion. This is the behavioural win over the
      // old "rank CUDA first, then health-check fallback" path.
      const { svc, healthCheck } = svcWith({
        inventory: maxwellInventory(),
        installed: new Set<GpuBackend>(['cuda', 'vulkan', 'cpu']),
        healthy: new Set<GpuBackend>(['vulkan', 'cpu']), // cuda would fail IF attempted
      });
      await svc.init();
      expect(settings.get().activeBackend).toBe('vulkan');

      const res = await svc.resolveActiveBinary();

      expect(res.backend).toBe('vulkan');
      expect(res.binaryPath).toContain('/vulkan/');
      // Exactly one smoke-test ran — vulkan. CUDA was never spawned.
      expect(healthCheck).toHaveBeenCalledTimes(1);
      expect(healthCheck).toHaveBeenCalledWith(res.binaryPath);
      expect(settings.recordFallback).not.toHaveBeenCalled();
    });
  });
});
