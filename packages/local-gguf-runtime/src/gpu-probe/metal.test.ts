// packages/local-gguf-runtime/src/gpu-probe/metal.test.ts
import { describe, expect, it } from 'vitest';
import { type ProbeMetalDeps, parseSystemProfiler, probeMetal } from './metal';

// Inline excerpt modeled on the real S2 fixture at
// docs/spikes/S2-fixtures/_synthetic/macos-arm64/system_profiler.txt

const M2_MAX_RAW = `
Graphics/Displays:

    Apple M2 Max:

      Chipset Model: Apple M2 Max
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 38
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
      Displays:
        PG42UQ:
          Resolution: 3840 x 2160 (2160p/4K UHD 1 - Ultra High Definition)
`;

// A display entry (Type: Display) that should NOT produce a device
const DISPLAY_ONLY_RAW = `
Graphics/Displays:

    Color LCD:

      Chipset Model: Color LCD
      Type: Display
      Resolution: 2560 x 1600
`;

// Multiple entries: one GPU + one display
const GPU_AND_DISPLAY_RAW = `
Graphics/Displays:

    Apple M2 Max:

      Chipset Model: Apple M2 Max
      Type: GPU
      Total Number of Cores: 38
      Metal Support: Metal 3

    Color LCD:

      Chipset Model: Color LCD
      Type: Display
      Resolution: 2560 x 1600
`;

describe('parseSystemProfiler', () => {
  it('parses an Apple M2 Max GPU entry', () => {
    const out = parseSystemProfiler(M2_MAX_RAW);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].name).toBe('Apple M2 Max');
    expect(out.devices[0].backend).toBe('metal');
    expect(out.devices[0].metalSupport).toBe('Metal 3');
  });

  it('sets vramMb to 0 (unified memory — filled by service layer via sysctl)', () => {
    const out = parseSystemProfiler(M2_MAX_RAW);
    expect(out.devices[0].vramMb).toBe(0);
  });

  it('extracts the GPU core count (drives the Metal n_gpu_layers heuristic)', () => {
    const out = parseSystemProfiler(M2_MAX_RAW);
    expect(out.devices[0].coreCount).toBe(38);
  });

  it('ignores entries with Type: Display (not Type: GPU)', () => {
    const out = parseSystemProfiler(DISPLAY_ONLY_RAW);
    expect(out.devices).toHaveLength(0);
  });

  it('keeps GPU entry and skips Display entry in mixed output', () => {
    const out = parseSystemProfiler(GPU_AND_DISPLAY_RAW);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].name).toBe('Apple M2 Max');
  });

  it('returns empty devices on empty input', () => {
    const out = parseSystemProfiler('');
    expect(out.devices).toHaveLength(0);
  });

  it('returns empty devices on malformed / non-system_profiler output', () => {
    const out = parseSystemProfiler('not system_profiler output');
    expect(out.devices).toHaveLength(0);
  });
});

describe('probeMetal', () => {
  it('returns available=true with parsed GPU when on darwin and system_profiler succeeds', async () => {
    const deps: ProbeMetalDeps = {
      runCommand: async () => ({ stdout: M2_MAX_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
      platform: 'darwin',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(true);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].metalSupport).toBe('Metal 3');
  });

  it('returns available=false on win32 without invoking runCommand', async () => {
    let called = false;
    const deps: ProbeMetalDeps = {
      runCommand: async () => {
        called = true;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      timeoutMs: 3000,
      platform: 'win32',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
    expect(called).toBe(false);
  });

  it('returns available=false on linux without invoking runCommand', async () => {
    const deps: ProbeMetalDeps = {
      runCommand: async () => ({ stdout: M2_MAX_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
      platform: 'linux',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(false);
  });

  it('returns available=false when system_profiler exits non-zero', async () => {
    const deps: ProbeMetalDeps = {
      runCommand: async () => ({ stdout: '', stderr: 'command not found', exitCode: 127 }),
      timeoutMs: 3000,
      platform: 'darwin',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });

  it('returns available=false when command throws (timeout)', async () => {
    const deps: ProbeMetalDeps = {
      runCommand: async () => {
        throw new Error('Command timed out');
      },
      timeoutMs: 3000,
      platform: 'darwin',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(false);
  });

  it('returns available=false when system_profiler produces no GPU entries', async () => {
    const deps: ProbeMetalDeps = {
      runCommand: async () => ({ stdout: DISPLAY_ONLY_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
      platform: 'darwin',
    };
    const result = await probeMetal(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });
});
