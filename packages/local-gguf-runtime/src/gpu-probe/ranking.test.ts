import type { GpuInventory } from '@team-x/shared-types';
// packages/local-gguf-runtime/src/gpu-probe/ranking.test.ts
import { describe, expect, it } from 'vitest';
import { rankBackends } from './ranking';

// ---------------------------------------------------------------------------
// Hand-built GpuInventory fixtures — deterministic, no I/O.
// ---------------------------------------------------------------------------

function makeInventory(overrides: Partial<GpuInventory>): GpuInventory {
  const base: GpuInventory = {
    detectedAt: 0,
    cuda: { available: false, devices: [] },
    rocm: { available: false, devices: [] },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 4, ramMb: 8192 },
  };
  return { ...base, ...overrides };
}

describe('rankBackends', () => {
  it('case 1 — NVIDIA with CUDA: returns [cuda, vulkan, cpu]', () => {
    const inv = makeInventory({
      cuda: { available: true, devices: [{ name: 'GTX TITAN X', vramMb: 12288, backend: 'cuda' }] },
      vulkan: { available: true, devices: [{ name: 'GTX TITAN X', vramMb: 0, backend: 'vulkan' }] },
    });
    expect(rankBackends(inv)).toEqual(['cuda', 'vulkan', 'cpu']);
  });

  it('case 2 — AMD with ROCm: returns [rocm, vulkan, cpu]', () => {
    const inv = makeInventory({
      rocm: { available: true, devices: [{ name: 'RX 7900 XTX', vramMb: 24576, backend: 'rocm' }] },
      vulkan: { available: true, devices: [{ name: 'RX 7900 XTX', vramMb: 0, backend: 'vulkan' }] },
    });
    expect(rankBackends(inv)).toEqual(['rocm', 'vulkan', 'cpu']);
  });

  it('case 3 — Metal (macOS): returns [metal, cpu]', () => {
    const inv = makeInventory({
      metal: { available: true, devices: [{ name: 'Apple M2', vramMb: 0, backend: 'metal' }] },
    });
    expect(rankBackends(inv)).toEqual(['metal', 'cpu']);
  });

  it('case 4 — Vulkan only (Intel / AMD without ROCm / no CUDA): returns [vulkan, cpu]', () => {
    const inv = makeInventory({
      vulkan: {
        available: true,
        devices: [{ name: 'Intel Arc A770', vramMb: 16384, backend: 'vulkan' }],
      },
    });
    expect(rankBackends(inv)).toEqual(['vulkan', 'cpu']);
  });

  it('case 5 — No GPU at all: returns [cpu]', () => {
    const inv = makeInventory({});
    expect(rankBackends(inv)).toEqual(['cpu']);
  });
});
