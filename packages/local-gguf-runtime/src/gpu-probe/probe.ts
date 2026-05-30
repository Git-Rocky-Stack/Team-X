// packages/local-gguf-runtime/src/gpu-probe/probe.ts
//
// GPU probe orchestrator — runs all five backend probes in parallel and merges
// the results into a single GpuInventory snapshot.
//
// Reconciliation notes (Task 9):
// 1. probeMetal requires `platform` in its deps — plan code omitted it.
//    We inject `process.platform` so the darwin guard works correctly on the
//    real OS and tests can stub it without touching platform detection.
// 2. RocmProbeResult has no `rocmVersion` field. GpuInventory.rocm.rocmVersion
//    is optional (?: string). We omit the field entirely (no explicit undefined
//    assignment) — it is simply absent, satisfying the optional contract cleanly.

import { spawn } from 'node:child_process';
import type { GpuInventory } from '@team-x/shared-types';
import { probeCpu } from './cpu';
import { probeMetal } from './metal';
import { probeNvidia } from './nvidia';
import { probeRocm } from './rocm';
import { probeVulkan } from './vulkan';

async function defaultRunCommand(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    // Only signal if the process is still running. On Windows, kill()ing an
    // already-exited process can surface a spurious 'error' (EPERM); guarding
    // on exitCode === null avoids that ambiguity.
    const timer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }, 3000);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    proc.on('error', (e: Error) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: e.message, exitCode: -1 });
    });
  });
}

export async function probeGpu(): Promise<GpuInventory> {
  const cpuResult = probeCpu();
  const deps = { runCommand: defaultRunCommand, timeoutMs: 3000 };
  const [nvidia, rocm, vulkan, metal] = await Promise.all([
    probeNvidia(deps),
    probeRocm(deps),
    probeVulkan(deps),
    // CRITICAL: probeMetal requires platform — pass process.platform so the
    // darwin guard fires correctly; on non-darwin it returns available=false immediately.
    probeMetal({ ...deps, platform: process.platform }),
  ]);
  return {
    detectedAt: Date.now(),
    cuda: {
      available: nvidia.available,
      devices: nvidia.devices,
      driverVersion: nvidia.driverVersion,
      cudaVersion: nvidia.cudaVersion,
    },
    // rocmVersion is optional in GpuInventory; RocmProbeResult does not expose it.
    // Omit the field — satisfies the optional contract without an explicit undefined.
    rocm: {
      available: rocm.available,
      devices: rocm.devices,
    },
    vulkan: { available: vulkan.available, devices: vulkan.devices },
    metal: { available: metal.available, devices: metal.devices },
    cpu: { cores: cpuResult.cores, ramMb: cpuResult.ramMb },
  };
}
