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
    const [name, mem, driver] = parts;
    const memMatch = /^(\d+)\s*MiB$/i.exec(mem);
    if (!memMatch) continue;
    devices.push({ name, vramMb: Number.parseInt(memMatch[1], 10), backend: 'cuda' });
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
