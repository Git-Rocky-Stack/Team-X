// packages/local-gguf-runtime/src/gpu-probe/nvidia.ts
import type { GpuDevice } from '@team-x/shared-types';

export interface NvidiaCsvParseResult {
  devices: GpuDevice[];
  driverVersion: string | undefined;
  cudaVersion: string | undefined;
}

export interface ProbeNvidiaDeps {
  runCommand: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  timeoutMs: number;
}

export interface NvidiaProbeResult {
  available: boolean;
  devices: GpuDevice[];
  driverVersion?: string;
  cudaVersion?: string;
}

export function parseNvidiaSmiCsv(raw: string): NvidiaCsvParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const devices: GpuDevice[] = [];
  let driverVersion: string | undefined;
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    // Explicit guards satisfy noUncheckedIndexedAccess without non-null assertions.
    const namePart = parts[0];
    const memPart = parts[1];
    if (namePart === undefined || memPart === undefined) continue;
    const driver = parts[2]; // string | undefined — intentional
    const memMatch = /^(\d+)\s*MiB$/i.exec(memPart);
    if (!memMatch) continue;
    const memStr = memMatch[1];
    if (memStr === undefined) continue;
    devices.push({ name: namePart, vramMb: Number.parseInt(memStr, 10), backend: 'cuda' });
    if (driver && !driverVersion) driverVersion = driver;
  }
  return { devices, driverVersion, cudaVersion: undefined };
}

export async function probeNvidia(deps: ProbeNvidiaDeps): Promise<NvidiaProbeResult> {
  try {
    const result = await deps.runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version,compute_cap',
      '--format=csv,noheader',
    ]);
    if (result.exitCode !== 0) {
      return { available: false, devices: [] };
    }
    const parsed = parseNvidiaSmiCsv(result.stdout);
    return {
      available: parsed.devices.length > 0,
      devices: parsed.devices,
      driverVersion: parsed.driverVersion,
      cudaVersion: parsed.cudaVersion,
    };
  } catch {
    return { available: false, devices: [] };
  }
}

/**
 * Sum the per-GPU "memory used" figures from `nvidia-smi --query-gpu=memory.used`.
 *
 * Summed rather than maxed because llama.cpp can split a model's layers across
 * every visible device — the number that matters to an operator is the total
 * the run occupied, which is also how `vramForBackend` totals capacity.
 *
 * Returns null, never 0, when nothing parseable came back. Zero is a
 * measurement ("nothing is resident"); null is the absence of one. A benchmark
 * row records that distinction, so it must survive the parser.
 */
export function parseNvidiaMemoryUsed(raw: string): number | null {
  let total = 0;
  let parsedAny = false;
  for (const line of raw.split(/\r?\n/)) {
    // `--format=...,nounits` drops the suffix, but a caller that forgets it
    // still gets "5312 MiB" — accept both rather than silently reading zero.
    const match = /^(\d+)(?:\s*MiB)?$/i.exec(line.trim());
    if (!match?.[1]) continue;
    total += Number.parseInt(match[1], 10);
    parsedAny = true;
  }
  return parsedAny ? total : null;
}

/**
 * Sample current NVIDIA VRAM use in MB, or null when it cannot be read.
 *
 * Used by BenchmarkService to record `vramPeakMb`. Every failure mode — no
 * nvidia-smi on the box, a non-zero exit, unparseable output — resolves to
 * null rather than throwing: this is instrumentation wrapped around a
 * measurement, and it must never be able to fail the measurement.
 */
export async function sampleNvidiaVramMb(deps: ProbeNvidiaDeps): Promise<number | null> {
  try {
    const result = await deps.runCommand('nvidia-smi', [
      '--query-gpu=memory.used',
      '--format=csv,noheader,nounits',
    ]);
    if (result.exitCode !== 0) return null;
    return parseNvidiaMemoryUsed(result.stdout);
  } catch {
    return null;
  }
}
