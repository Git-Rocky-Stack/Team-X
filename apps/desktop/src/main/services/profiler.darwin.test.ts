/**
 * Hardware profiler — macOS detection.
 *
 * Audit F9 — `detectHardware` carried a bare `// macOS / Linux stubs
 * (Phase 4)` comment, so every Mac reported `gpuDetected: false` with a
 * null name and null VRAM. v3.4.0 ships signed mac installers, so this was
 * wrong on a platform users actually run, and it fed the strategy picker a
 * false "no accelerator" signal.
 *
 * The parsing is delegated to `parseSystemProfiler` from
 * `@team-x/local-gguf-runtime`, which was already implemented and tested
 * but had no desktop consumer.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({
  cpus: () => Array.from({ length: 10 }, () => ({})),
  totalmem: () => 32 * 1024 ** 3,
  platform: () => 'darwin',
}));

const SYSTEM_PROFILER_M3 = `Graphics/Displays:

    Apple M3 Max:

      Chipset Model: Apple M3 Max
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 40
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
`;

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => SYSTEM_PROFILER_M3),
}));

const { detectHardware, clearProfileCache } = await import('./profiler.js');

afterEach(() => {
  clearProfileCache();
  vi.clearAllMocks();
});

describe('detectHardware on macOS', () => {
  it('reports the Apple Silicon GPU rather than claiming none exists', () => {
    const profile = detectHardware();
    expect(profile.platform).toBe('darwin');
    expect(profile.gpuDetected).toBe(true);
    expect(profile.gpuName).toBe('Apple M3 Max');
  });

  it('queries system_profiler, not the Windows wmic path', async () => {
    const { execFileSync } = await import('node:child_process');
    detectHardware();
    expect(vi.mocked(execFileSync).mock.calls[0]?.[0]).toBe('system_profiler');
  });

  it('reports unified memory as the GPU VRAM budget on Apple Silicon', () => {
    // Apple Silicon has no discrete VRAM line; system_profiler omits it.
    // Reporting null would tell the strategy picker "unknown", when in
    // fact the GPU can address the shared pool.
    const profile = detectHardware();
    expect(profile.gpuVramGb).not.toBeNull();
    expect(profile.gpuVramGb as number).toBeGreaterThan(0);
    expect(profile.gpuVramGb as number).toBeLessThanOrEqual(32);
  });

  it('reports no GPU when system_profiler is unavailable', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
    expect(profile.gpuName).toBeNull();
    expect(profile.gpuVramGb).toBeNull();
  });

  it('reports no GPU when system_profiler returns nothing parseable', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockReturnValueOnce('Graphics/Displays:\n');
    clearProfileCache();

    const profile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
  });

  it('still reports CPU and RAM correctly', () => {
    const profile = detectHardware();
    expect(profile.cpuCores).toBe(10);
    expect(profile.totalRamGb).toBe(32);
  });
});
