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

  // Virtual / BMC display adapters are the Linux counterpart of the
  // "Microsoft Basic Display Adapter" the Windows branch filters: every VM
  // and most rack servers expose one, and none can run a model. Reporting
  // them as a GPU steers the strategy picker toward GPU-only strategies.
  it.each([
    [
      'QXL',
      '00:02.0 VGA compatible controller: Red Hat, Inc. QXL paravirtual graphic card (rev 05)',
    ],
    ['virtio-gpu', '00:01.0 VGA compatible controller: Red Hat, Inc. Virtio 1.0 GPU (rev 01)'],
    ['VMware SVGA', '00:0f.0 VGA compatible controller: VMware SVGA II Adapter'],
    [
      'VirtualBox',
      '00:02.0 VGA compatible controller: InnoTek Systemberatung GmbH VirtualBox Graphics Adapter',
    ],
    ['Cirrus', '00:02.0 VGA compatible controller: Cirrus Logic GD 5446'],
    [
      'ASPEED BMC',
      '03:00.0 VGA compatible controller: ASPEED Technology, Inc. ASPEED Graphics Family (rev 41)',
    ],
    [
      'Matrox G200 BMC',
      '0b:00.0 VGA compatible controller: Matrox Electronics Systems Ltd. MGA G200e [Pilot] ServerEngines (SEP1) (rev 02)',
    ],
    ['Hyper-V', '00:08.0 VGA compatible controller: Microsoft Corporation Hyper-V virtual VGA'],
    ['QEMU std VGA', '00:02.0 VGA compatible controller: Device 1234:1111 (rev 02)'],
    ['bochs', '00:02.0 VGA compatible controller: Bochs QEMU Standard VGA (rev 02)'],
  ])('does not report a %s display adapter as a GPU', async (_label, line) => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        throw new Error('ENOENT');
      })
      .mockReturnValueOnce(`${line}\n`);
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
    expect(profile.gpuName).toBeNull();
  });

  it('skips a BMC adapter and reports the real GPU behind it', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        throw new Error('ENOENT');
      })
      .mockReturnValueOnce(
        [
          '03:00.0 VGA compatible controller: ASPEED Technology, Inc. ASPEED Graphics Family (rev 41)',
          'c1:00.0 Display controller: Advanced Micro Devices, Inc. [AMD/ATI] Aldebaran/MI200 [Instinct MI210] (rev 02)',
        ].join('\n'),
      );
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(true);
    expect(profile.gpuName).toContain('Instinct MI210');
  });

  it('still reports CPU and RAM correctly', () => {
    const profile = detectHardware();
    expect(profile.cpuCores).toBe(16);
    expect(profile.totalRamGb).toBe(64);
  });
});
