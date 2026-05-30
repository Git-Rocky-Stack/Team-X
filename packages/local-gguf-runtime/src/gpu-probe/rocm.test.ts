// packages/local-gguf-runtime/src/gpu-probe/rocm.test.ts
import { describe, expect, it } from 'vitest';
import { type ProbeRocmDeps, parseRocminfo, probeRocm } from './rocm';

// Inline excerpts modeled on the real S2 fixture at
// docs/spikes/S2-fixtures/_synthetic/linux-amd/rocminfo.txt

const SINGLE_GPU_RAW = `
ROCk module is loaded
==========
HSA Agents
==========
*******
Agent 1
*******
  Name:                    AMD Ryzen 9 7950X3D 16-Core Processor
  Uuid:                    CPU-XX
  Marketing Name:          AMD Ryzen 9 7950X3D 16-Core Processor
  Vendor Name:             CPU
  Device Type:             CPU
  Pool Info:
    Pool 1
      Segment:                 GLOBAL; FLAGS: FINE GRAINED
      Size:                    65970176(0x3eea000) KB
      Allocatable:             TRUE
*******
Agent 2
*******
  Name:                    gfx1100
  Uuid:                    GPU-XX
  Marketing Name:          AMD Radeon RX 7900 XTX
  Vendor Name:             AMD
  Device Type:             GPU
  Pool Info:
    Pool 1
      Segment:                 GLOBAL; FLAGS: COARSE GRAINED
      Size:                    25165824(0x1800000) KB
      Allocatable:             TRUE
    Pool 2
      Segment:                 GLOBAL; FLAGS: EXTENDED FINE GRAINED
      Size:                    25165824(0x1800000) KB
      Allocatable:             TRUE
    Pool 3
      Segment:                 GROUP
      Size:                    64(0x40) KB
      Allocatable:             FALSE
*** Done ***
`;

const TWO_GPU_RAW = `
*******
Agent 1
*******
  Name:                    gfx1100
  Uuid:                    GPU-A
  Marketing Name:          AMD Radeon RX 7900 XTX
  Vendor Name:             AMD
  Device Type:             GPU
  Pool Info:
    Pool 1
      Segment:                 GLOBAL; FLAGS: COARSE GRAINED
      Size:                    25165824(0x1800000) KB
      Allocatable:             TRUE
*******
Agent 2
*******
  Name:                    gfx1030
  Uuid:                    GPU-B
  Marketing Name:          AMD Radeon RX 6800 XT
  Vendor Name:             AMD
  Device Type:             GPU
  Pool Info:
    Pool 1
      Segment:                 GLOBAL; FLAGS: COARSE GRAINED
      Size:                    16777216(0x1000000) KB
      Allocatable:             TRUE
`;

describe('parseRocminfo', () => {
  it('parses a single GPU agent, skipping the CPU agent', () => {
    const out = parseRocminfo(SINGLE_GPU_RAW);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].name).toBe('AMD Radeon RX 7900 XTX');
    expect(out.devices[0].vramMb).toBe(24576); // 25165824 KB / 1024
    expect(out.devices[0].backend).toBe('rocm');
    expect(out.devices[0].gfxTarget).toBe('gfx1100');
  });

  it('only returns the AMD GPU — CPU agent is filtered out', () => {
    const out = parseRocminfo(SINGLE_GPU_RAW);
    expect(out.devices.every((d) => d.backend === 'rocm')).toBe(true);
    // The CPU agent "AMD Ryzen 9 7950X3D" must NOT appear
    expect(out.devices.find((d) => d.name.includes('Ryzen'))).toBeUndefined();
  });

  it('parses two GPU agents', () => {
    const out = parseRocminfo(TWO_GPU_RAW);
    expect(out.devices).toHaveLength(2);
    expect(out.devices[1].name).toBe('AMD Radeon RX 6800 XT');
    expect(out.devices[1].vramMb).toBe(16384); // 16777216 KB / 1024
    expect(out.devices[1].gfxTarget).toBe('gfx1030');
  });

  it('returns empty devices on empty input', () => {
    const out = parseRocminfo('');
    expect(out.devices).toHaveLength(0);
  });

  it('returns empty devices on malformed / non-rocminfo output', () => {
    const out = parseRocminfo('some random garbage\nnot rocminfo output');
    expect(out.devices).toHaveLength(0);
  });
});

describe('probeRocm', () => {
  it('returns available=true with parsed devices when rocminfo succeeds', async () => {
    const deps: ProbeRocmDeps = {
      runCommand: async () => ({ stdout: SINGLE_GPU_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
    };
    const result = await probeRocm(deps);
    expect(result.available).toBe(true);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].vramMb).toBe(24576);
  });

  it('returns available=false when rocminfo exits non-zero (missing tool)', async () => {
    const deps: ProbeRocmDeps = {
      runCommand: async () => ({
        stdout: '',
        stderr: 'rocminfo: command not found',
        exitCode: 127,
      }),
      timeoutMs: 3000,
    };
    const result = await probeRocm(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });

  it('returns available=false when the command throws (timeout)', async () => {
    const deps: ProbeRocmDeps = {
      runCommand: async () => {
        throw new Error('Command timed out');
      },
      timeoutMs: 3000,
    };
    const result = await probeRocm(deps);
    expect(result.available).toBe(false);
  });

  it('returns available=false when rocminfo produces no GPU devices', async () => {
    const deps: ProbeRocmDeps = {
      runCommand: async () => ({
        stdout: 'ROCk module is loaded\n*** Done ***',
        stderr: '',
        exitCode: 0,
      }),
      timeoutMs: 3000,
    };
    const result = await probeRocm(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });
});
