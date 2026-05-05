import type { HardwareProfile } from '@team-x/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock node:os before import
vi.mock('node:os', () => ({
  cpus: () => Array.from({ length: 8 }, () => ({})),
  totalmem: () => 16 * 1024 ** 3, // 16 GB
  platform: () => 'win32',
}));

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'AdapterRAM=8589934592\nName=NVIDIA GeForce RTX 3070\n'),
}));

// Import after mocks
const { detectHardware, clearProfileCache } = await import('./profiler.js');

afterEach(() => {
  clearProfileCache();
});

describe('detectHardware', () => {
  it('detects CPU, RAM, and GPU from mocked system', () => {
    const profile = detectHardware();
    expect(profile.cpuCores).toBe(8);
    expect(profile.totalRamGb).toBe(16);
    expect(profile.gpuDetected).toBe(true);
    expect(profile.gpuName).toBe('NVIDIA GeForce RTX 3070');
    expect(profile.gpuVramGb).toBe(8);
    expect(profile.platform).toBe('win32');
  });

  it('caches the result across calls', () => {
    const first = detectHardware();
    const second = detectHardware();
    expect(first).toBe(second); // same reference
  });

  it('returns fresh result after clearProfileCache', () => {
    const first = detectHardware();
    clearProfileCache();
    const second = detectHardware();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe('detectHardware — no GPU', () => {
  it('reports gpuDetected=false for Microsoft Basic adapter', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockReturnValueOnce(
      'AdapterRAM=0\nName=Microsoft Basic Display Adapter\n',
    );
    clearProfileCache();
    const profile: HardwareProfile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
    expect(profile.gpuName).toBeNull();
  });

  it('reports gpuDetected=false when wmic throws', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('wmic not found');
    });
    clearProfileCache();
    const profile: HardwareProfile = detectHardware();
    expect(profile.gpuDetected).toBe(false);
  });
});
