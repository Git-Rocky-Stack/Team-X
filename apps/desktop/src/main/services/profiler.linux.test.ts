/**
 * Hardware profiler — Linux detection.
 *
 * Audit F9 — see profiler.darwin.test.ts. v3.4.0 ships a Linux AppImage,
 * so Linux users were told they had no GPU regardless of hardware.
 *
 * nvidia-smi is the primary source (it reports exact VRAM); lspci is the
 * fallback for AMD/Intel parts where no vendor tool is guaranteed present.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({
  cpus: () => Array.from({ length: 16 }, () => ({})),
  totalmem: () => 64 * 1024 ** 3,
  platform: () => 'linux',
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'NVIDIA GeForce RTX 4090, 24564 MiB, 550.90.07\n'),
}));

const { detectHardware, clearProfileCache } = await import('./profiler.js');

afterEach(() => {
  clearProfileCache();
  vi.clearAllMocks();
});

describe('detectHardware on Linux', () => {
  it('reports the NVIDIA GPU rather than claiming none exists', () => {
    const profile = detectHardware();
    expect(profile.platform).toBe('linux');
    expect(profile.gpuDetected).toBe(true);
    expect(profile.gpuName).toBe('NVIDIA GeForce RTX 4090');
  });

  it('converts nvidia-smi MiB into GB', () => {
    const profile = detectHardware();
    // 24564 MiB -> 24.0 GB (one decimal, matching the Windows branch)
    expect(profile.gpuVramGb).toBe(24);
  });

  it('queries nvidia-smi first', async () => {
    const { execFileSync } = await import('node:child_process');
    detectHardware();
    expect(vi.mocked(execFileSync).mock.calls[0]?.[0]).toBe('nvidia-smi');
  });

  it('falls back to lspci when nvidia-smi is absent', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        throw new Error('ENOENT: nvidia-smi not found');
      })
      .mockReturnValueOnce(
        '00:02.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Navi 31 [Radeon RX 7900 XTX]\n',
      );
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(true);
    expect(profile.gpuName).toContain('Radeon RX 7900 XTX');
    // lspci exposes no VRAM figure — null is the honest answer, not a guess.
    expect(profile.gpuVramGb).toBeNull();
  });

  it('reports no GPU when neither nvidia-smi nor lspci is available', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
    expect(profile.gpuName).toBeNull();
    expect(profile.gpuVramGb).toBeNull();
  });

  it('ignores lspci lines that are not display controllers', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        throw new Error('ENOENT');
      })
      .mockReturnValueOnce('00:1f.3 Audio device: Intel Corporation Alder Lake PCH-P High Def\n');
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
  });

  it('still reports CPU and RAM correctly', () => {
    const profile = detectHardware();
    expect(profile.cpuCores).toBe(16);
    expect(profile.totalRamGb).toBe(64);
  });
});
