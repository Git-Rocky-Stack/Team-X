import { describe, expect, it } from 'vitest';

import {
  type AdvancedParams,
  type GpuBackend,
  type GpuInventory,
  type LocalGgufError,
  type LocalGgufRuntimeSettings,
  type LocalModel,
  type ModelStatus,
  type RemoteEndpoint,
  type SourceType,
  type WatchFolder,
  isLocalGgufError,
} from './local-gguf.js';

describe('isLocalGgufError', () => {
  it('returns true for any LocalGgufError variant', () => {
    const variants: LocalGgufError[] = [
      { kind: 'binary-not-found', backend: 'cuda', path: '/nope' },
      { kind: 'binary-unsupported', backend: 'rocm', osVersion: 'Windows 7' },
      { kind: 'gpu-probe-failed', reason: 'nvidia-smi missing' },
      { kind: 'oom-predicted', requiredMb: 9000, availableMb: 4000 },
      { kind: 'oom-runtime', lastStderr: 'CUDA OOM' },
      { kind: 'gguf-parse-failed', path: '/x.gguf', reason: 'EOF' },
      { kind: 'gguf-corrupt', path: '/x.gguf' },
      { kind: 'server-spawn-failed', exitCode: 1, stderr: 'no model' },
      { kind: 'server-crashed', pid: 1234, exitCode: null, stderr: 'sigsegv' },
      { kind: 'port-exhausted' },
      { kind: 'source-unreachable', path: '//NAS/models' },
      { kind: 'hf-download-failed', repo: 'a/b', file: 'c.gguf', httpStatus: 500, body: 'oops' },
      { kind: 'hf-rate-limited', retryAfterS: 60 },
      { kind: 'endpoint-unreachable', url: 'http://x:1234' },
      { kind: 'endpoint-auth-failed', url: 'http://x:1234' },
      { kind: 'pool-full', current: 1, max: 1 },
      { kind: 'context-too-large', requested: 99999, max: 4096 },
    ];
    for (const v of variants) {
      expect(isLocalGgufError(v)).toBe(true);
    }
  });

  it('returns false for non-error values', () => {
    expect(isLocalGgufError(null)).toBe(false);
    expect(isLocalGgufError(undefined)).toBe(false);
    expect(isLocalGgufError('error')).toBe(false);
    expect(isLocalGgufError(42)).toBe(false);
    expect(isLocalGgufError({})).toBe(false);
    expect(isLocalGgufError({ kind: 42 })).toBe(false);
    // Any non-empty (or empty) string `kind` passes the structural check;
    // spec-level validity of the discriminant is enforced by TypeScript.
    expect(isLocalGgufError({ kind: '' })).toBe(true);
  });
});

describe('LocalGgufError kind exhaustiveness', () => {
  // Compile-time exhaustiveness check — if a new variant is added to
  // LocalGgufError, this switch fails TypeScript compilation unless the new
  // variant is added here. The runtime assertion is incidental.
  it('every kind has a discriminator case', () => {
    function exhaustive(e: LocalGgufError): string {
      switch (e.kind) {
        case 'binary-not-found':
          return e.path;
        case 'binary-unsupported':
          return e.osVersion;
        case 'gpu-probe-failed':
          return e.reason;
        case 'oom-predicted':
          return `${e.requiredMb}/${e.availableMb}`;
        case 'oom-runtime':
          return e.lastStderr;
        case 'gguf-parse-failed':
          return e.reason;
        case 'gguf-corrupt':
          return e.path;
        case 'server-spawn-failed':
          return e.stderr;
        case 'server-crashed':
          return e.stderr;
        case 'port-exhausted':
          return 'port-exhausted';
        case 'source-unreachable':
          return e.path;
        case 'hf-download-failed':
          return e.repo;
        case 'hf-rate-limited':
          return String(e.retryAfterS);
        case 'endpoint-unreachable':
          return e.url;
        case 'endpoint-auth-failed':
          return e.url;
        case 'pool-full':
          return `${e.current}/${e.max}`;
        case 'context-too-large':
          return `${e.requested}/${e.max}`;
        default: {
          const _never: never = e;
          return _never;
        }
      }
    }
    expect(exhaustive({ kind: 'port-exhausted' })).toBe('port-exhausted');
  });
});

describe('GpuBackend type', () => {
  it('accepts the five backend values', () => {
    const backends: GpuBackend[] = ['cuda', 'rocm', 'vulkan', 'metal', 'cpu'];
    expect(backends).toHaveLength(5);
  });
});

describe('SourceType type', () => {
  it('accepts the three source-type values', () => {
    const sources: SourceType[] = ['file', 'folder-entry', 'remote-endpoint'];
    expect(sources).toHaveLength(3);
  });
});

describe('ModelStatus type', () => {
  it('accepts the six status values', () => {
    const statuses: ModelStatus[] = [
      'cold',
      'loading',
      'loaded',
      'error',
      'unreachable',
      'missing',
    ];
    expect(statuses).toHaveLength(6);
  });
});

describe('LocalModel shape', () => {
  it('accepts a fully-populated file-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-1',
      displayName: 'Llama-3.1-8B-Q4_K_M',
      sourceType: 'file',
      sourcePath: '/models/llama-3.1-8b.gguf',
      endpointId: null,
      ggufArch: 'llama',
      ggufParamsB: 8.0,
      ggufQuant: 'Q4_K_M',
      ggufContextMax: 131072,
      ggufSizeBytes: 4_900_000_000,
      ggufSha256: 'abc',
      ggufChatTemplate: '<|begin_of_text|>...',
      isEmbeddingModel: false,
      isToolCapable: false,
      hfRepoId: 'TheBloke/Meta-Llama-3.1-8B-Instruct-GGUF',
      hfFilename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
      license: 'Llama 3.1 Community License',
      chatTemplateOverride: null,
      systemPromptOverride: null,
      status: 'cold',
      statusDetail: null,
      lastUsedAt: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.id).toBe('uuid-1');
  });

  it('accepts a remote-endpoint-sourced model', () => {
    const m: LocalModel = {
      id: 'uuid-2',
      displayName: 'Remote LM Studio',
      sourceType: 'remote-endpoint',
      sourcePath: null,
      endpointId: 'ep-1',
      ggufArch: null,
      ggufParamsB: null,
      ggufQuant: null,
      ggufContextMax: null,
      ggufSizeBytes: null,
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
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(m.endpointId).toBe('ep-1');
  });
});

describe('GpuInventory shape', () => {
  it('accepts a fully populated NVIDIA inventory with S2 device extensions', () => {
    const inv: GpuInventory = {
      detectedAt: 1716750000000,
      cuda: {
        available: true,
        devices: [
          {
            name: 'NVIDIA GeForce GTX TITAN X',
            vramMb: 12288,
            backend: 'cuda',
            computeCap: '5.2',
            uuid: 'GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          },
        ],
        driverVersion: '582.28',
        cudaVersion: '13.0',
      },
      rocm: { available: false, devices: [] },
      vulkan: {
        available: true,
        devices: [
          {
            name: 'NVIDIA GeForce GTX TITAN X',
            vramMb: 12288,
            backend: 'vulkan',
            vendorId: '0x10de',
            deviceId: '0x17c2',
            deviceType: 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU',
            apiVersion: '1.4.312',
          },
        ],
      },
      metal: { available: false, devices: [] },
      cpu: { cores: 24, ramMb: 65536 },
    };
    expect(inv.cuda.devices[0]?.vramMb).toBe(12288);
    expect(inv.cuda.devices[0]?.computeCap).toBe('5.2');
    expect(inv.vulkan.devices[0]?.vendorId).toBe('0x10de');
  });
});

describe('LocalGgufRuntimeSettings shape', () => {
  it('accepts a default settings record', () => {
    const s: LocalGgufRuntimeSettings = {
      activeBackend: 'cpu',
      activeBackendIsAutoDetected: true,
      autoFallbackReason: null,
      maxConcurrentLocalModels: 1,
      defaultLibraryFolder: null,
      embeddingModelId: null,
      hfTokenKeyRef: null,
      llamaBinariesVersion: 'b9371',
    };
    expect(s.maxConcurrentLocalModels).toBe(1);
  });
});

describe('AdvancedParams shape (all-null = use auto-tune)', () => {
  it('accepts an all-null params record', () => {
    const p: AdvancedParams = {
      modelId: 'uuid-1',
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
      updatedAt: 1716750000000,
    };
    expect(p.modelId).toBe('uuid-1');
  });
});

describe('RemoteEndpoint shape', () => {
  it('accepts a Local-tier endpoint', () => {
    const e: RemoteEndpoint = {
      id: 'ep-1',
      name: 'LM Studio on bench',
      baseUrl: 'http://192.168.1.50:1234',
      authHeaderKeyRef: null,
      privacyTier: 'Local',
      status: 'unknown',
      lastCheckedAt: null,
      lastError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(e.privacyTier).toBe('Local');
  });
});

describe('WatchFolder shape', () => {
  it('accepts a UNC-path watched folder', () => {
    const w: WatchFolder = {
      id: 'wf-1',
      path: '\\\\NAS-01\\models\\meta',
      recursive: true,
      status: 'unknown',
      lastScanAt: null,
      lastScanError: null,
      createdAt: 1716750000000,
      updatedAt: 1716750000000,
    };
    expect(w.path.startsWith('\\\\')).toBe(true);
  });
});
