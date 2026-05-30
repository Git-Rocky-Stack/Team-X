// packages/local-gguf-runtime/src/gpu-probe/nvidia.test.ts
import { describe, expect, it } from 'vitest';
import { type ProbeNvidiaDeps, parseNvidiaSmiCsv, probeNvidia } from './nvidia';

describe('parseNvidiaSmiCsv', () => {
  it('parses a single-GPU CSV line', () => {
    const raw = 'NVIDIA GeForce RTX 4090, 24564 MiB, 555.42, 8.9';
    const out = parseNvidiaSmiCsv(raw);
    expect(out).toEqual({
      devices: [{ name: 'NVIDIA GeForce RTX 4090', vramMb: 24564, backend: 'cuda' }],
      driverVersion: '555.42',
      cudaVersion: undefined,
    });
  });

  it('parses multiple GPUs', () => {
    const raw = [
      'NVIDIA GeForce RTX 4090, 24564 MiB, 555.42, 8.9',
      'NVIDIA GeForce RTX 3090, 24576 MiB, 555.42, 8.6',
    ].join('\n');
    const out = parseNvidiaSmiCsv(raw);
    expect(out.devices).toHaveLength(2);
    expect(out.devices[1].name).toBe('NVIDIA GeForce RTX 3090');
  });

  it('returns empty devices on empty input', () => {
    const out = parseNvidiaSmiCsv('');
    expect(out.devices).toHaveLength(0);
  });

  it('tolerates extra whitespace', () => {
    const raw = '  NVIDIA RTX A6000  ,  49152 MiB  ,  535.86  ,  8.6  ';
    const out = parseNvidiaSmiCsv(raw);
    expect(out.devices[0].vramMb).toBe(49152);
    expect(out.devices[0].name).toBe('NVIDIA RTX A6000');
  });

  it('parses the real dual-TITAN S2 fixture format', () => {
    const raw = [
      'NVIDIA GeForce GTX TITAN X, 12288 MiB, 582.28, 5.2',
      'NVIDIA GeForce GTX TITAN X, 12288 MiB, 582.28, 5.2',
    ].join('\n');
    const out = parseNvidiaSmiCsv(raw);
    expect(out.devices).toHaveLength(2);
    expect(out.devices[0].vramMb).toBe(12288);
    expect(out.devices[0].backend).toBe('cuda');
    expect(out.driverVersion).toBe('582.28');
  });
});

describe('probeNvidia', () => {
  it('returns available=true with parsed devices when nvidia-smi succeeds', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => ({
        stdout: 'NVIDIA RTX 4090, 24564 MiB, 555.42, 8.9',
        stderr: '',
        exitCode: 0,
      }),
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(true);
    expect(result.devices[0].vramMb).toBe(24564);
    expect(result.driverVersion).toBe('555.42');
  });

  it('returns available=false when nvidia-smi exits non-zero', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => ({ stdout: '', stderr: 'nvidia-smi not found', exitCode: 127 }),
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });

  it('returns available=false when the command times out', async () => {
    const deps: ProbeNvidiaDeps = {
      runCommand: async () => {
        throw new Error('Command timed out');
      },
      timeoutMs: 3000,
    };
    const result = await probeNvidia(deps);
    expect(result.available).toBe(false);
  });
});
