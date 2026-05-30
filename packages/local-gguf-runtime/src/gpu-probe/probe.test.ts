// packages/local-gguf-runtime/src/gpu-probe/probe.test.ts
//
// Unit tests for probeGpu(). All five probe functions are vi.mock'd so this
// suite never shells out to real OS tools — it exercises the orchestrator's
// merging logic and GpuInventory shape construction deterministically.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CpuProbeResult } from './cpu';
import type { MetalProbeResult } from './metal';
import type { NvidiaProbeResult } from './nvidia';
import type { RocmProbeResult } from './rocm';
import type { VulkanProbeResult } from './vulkan';

// ---------------------------------------------------------------------------
// Mock all probe modules before importing probeGpu.
// ---------------------------------------------------------------------------
vi.mock('./nvidia', () => ({
  probeNvidia: vi.fn(),
}));
vi.mock('./rocm', () => ({
  probeRocm: vi.fn(),
}));
vi.mock('./vulkan', () => ({
  probeVulkan: vi.fn(),
}));
vi.mock('./metal', () => ({
  probeMetal: vi.fn(),
}));
vi.mock('./cpu', () => ({
  probeCpu: vi.fn(),
}));

import { probeCpu } from './cpu';
import { probeMetal } from './metal';
import { probeNvidia } from './nvidia';
import { probeGpu } from './probe';
import { probeRocm } from './rocm';
import { probeVulkan } from './vulkan';

// ---------------------------------------------------------------------------
// Typed mock references.
// ---------------------------------------------------------------------------
const mockProbeNvidia = vi.mocked(probeNvidia);
const mockProbeRocm = vi.mocked(probeRocm);
const mockProbeVulkan = vi.mocked(probeVulkan);
const mockProbeMetal = vi.mocked(probeMetal);
const mockProbeCpu = vi.mocked(probeCpu);

// ---------------------------------------------------------------------------
// Default no-op results — overridden per test as needed.
// ---------------------------------------------------------------------------
const noNvidia: NvidiaProbeResult = { available: false, devices: [] };
const noRocm: RocmProbeResult = { available: false, devices: [] };
const noVulkan: VulkanProbeResult = { available: false, devices: [] };
const noMetal: MetalProbeResult = { available: false, devices: [] };
const cpuResult: CpuProbeResult = { cores: 8, ramMb: 16384 };

beforeEach(() => {
  vi.clearAllMocks();
  mockProbeNvidia.mockResolvedValue(noNvidia);
  mockProbeRocm.mockResolvedValue(noRocm);
  mockProbeVulkan.mockResolvedValue(noVulkan);
  mockProbeMetal.mockResolvedValue(noMetal);
  mockProbeCpu.mockReturnValue(cpuResult);
});

describe('probeGpu', () => {
  it('returns a GpuInventory with correct shape when no GPU is detected', async () => {
    const inv = await probeGpu();

    expect(typeof inv.detectedAt).toBe('number');
    expect(inv.detectedAt).toBeGreaterThan(0);

    expect(inv.cuda).toEqual({ available: false, devices: [] });
    expect(inv.rocm).toEqual({ available: false, devices: [] });
    expect(inv.vulkan).toEqual({ available: false, devices: [] });
    expect(inv.metal).toEqual({ available: false, devices: [] });
    expect(inv.cpu).toEqual({ cores: 8, ramMb: 16384 });
  });

  it('maps NVIDIA probe result into cuda field with driverVersion + cudaVersion', async () => {
    const nvidiaResult: NvidiaProbeResult = {
      available: true,
      devices: [{ name: 'GTX TITAN X', vramMb: 12288, backend: 'cuda' }],
      driverVersion: '582.28',
      cudaVersion: '12.4',
    };
    mockProbeNvidia.mockResolvedValue(nvidiaResult);

    const inv = await probeGpu();

    expect(inv.cuda.available).toBe(true);
    expect(inv.cuda.devices).toHaveLength(1);
    expect(inv.cuda.devices[0]?.name).toBe('GTX TITAN X');
    expect(inv.cuda.driverVersion).toBe('582.28');
    expect(inv.cuda.cudaVersion).toBe('12.4');
  });

  it('maps ROCm probe result into rocm field (no rocmVersion from probe)', async () => {
    const rocmResult: RocmProbeResult = {
      available: true,
      devices: [{ name: 'RX 7900 XTX', vramMb: 24576, backend: 'rocm', gfxTarget: 'gfx1100' }],
    };
    mockProbeRocm.mockResolvedValue(rocmResult);

    const inv = await probeGpu();

    expect(inv.rocm.available).toBe(true);
    expect(inv.rocm.devices).toHaveLength(1);
    expect(inv.rocm.devices[0]?.name).toBe('RX 7900 XTX');
    // rocmVersion is optional in GpuInventory and not in RocmProbeResult — must be undefined
    expect(inv.rocm.rocmVersion).toBeUndefined();
  });

  it('maps Vulkan probe result into vulkan field', async () => {
    const vulkanResult: VulkanProbeResult = {
      available: true,
      devices: [{ name: 'GTX TITAN X', vramMb: 0, backend: 'vulkan', vendorId: '0x10de' }],
    };
    mockProbeVulkan.mockResolvedValue(vulkanResult);

    const inv = await probeGpu();

    expect(inv.vulkan.available).toBe(true);
    expect(inv.vulkan.devices[0]?.vendorId).toBe('0x10de');
  });

  it('maps Metal probe result into metal field', async () => {
    const metalResult: MetalProbeResult = {
      available: true,
      devices: [{ name: 'Apple M2', vramMb: 0, backend: 'metal', metalSupport: 'Metal 3' }],
    };
    mockProbeMetal.mockResolvedValue(metalResult);

    const inv = await probeGpu();

    expect(inv.metal.available).toBe(true);
    expect(inv.metal.devices[0]?.metalSupport).toBe('Metal 3');
  });

  it('calls all 5 probes — all results compose into one GpuInventory', async () => {
    mockProbeNvidia.mockResolvedValue({
      available: true,
      devices: [{ name: 'GPU-A', vramMb: 8192, backend: 'cuda' }],
      driverVersion: '582.28',
    });
    mockProbeRocm.mockResolvedValue({ available: false, devices: [] });
    mockProbeVulkan.mockResolvedValue({
      available: true,
      devices: [{ name: 'GPU-A', vramMb: 0, backend: 'vulkan' }],
    });
    mockProbeMetal.mockResolvedValue({ available: false, devices: [] });
    mockProbeCpu.mockReturnValue({ cores: 16, ramMb: 32768 });

    const inv = await probeGpu();

    expect(mockProbeNvidia).toHaveBeenCalledOnce();
    expect(mockProbeRocm).toHaveBeenCalledOnce();
    expect(mockProbeVulkan).toHaveBeenCalledOnce();
    expect(mockProbeMetal).toHaveBeenCalledOnce();
    expect(mockProbeCpu).toHaveBeenCalledOnce();

    expect(inv.cuda.available).toBe(true);
    expect(inv.rocm.available).toBe(false);
    expect(inv.vulkan.available).toBe(true);
    expect(inv.metal.available).toBe(false);
    expect(inv.cpu.cores).toBe(16);
    expect(inv.cpu.ramMb).toBe(32768);
  });
});
