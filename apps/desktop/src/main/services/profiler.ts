/**
 * Hardware profiler — detects CPU, RAM, GPU capabilities.
 *
 * Runs once at startup and caches the result for the session. Used by
 * the strategy picker to auto-select between Hybrid/Always-On/Lean.
 *
 * Cross-platform: `wmic` on Windows, `system_profiler` on macOS,
 * `nvidia-smi` (then `lspci`) on Linux. The macOS and Linux branches reuse
 * the parsers from `@team-x/local-gguf-runtime`'s GPU probe rather than
 * re-implementing them.
 *
 * Phase 3 — M19.
 */

import { execFileSync } from 'node:child_process';
import { cpus, platform, totalmem } from 'node:os';

import {
  parseNvidiaSmiCsv,
  parseSystemProfiler,
} from '@team-x/local-gguf-runtime/gpu-probe/parsers';
import type { HardwareProfile } from '@team-x/shared-types';

let cachedProfile: HardwareProfile | null = null;

/**
 * Detect hardware capabilities. Returns a cached result on subsequent
 * calls. Call `clearProfileCache()` to force re-detection (test-only).
 */
export function detectHardware(): HardwareProfile {
  if (cachedProfile) return cachedProfile;

  const cpuCores = cpus().length;
  const totalRamGb = Math.round((totalmem() / 1024 ** 3) * 10) / 10;
  const plat = platform();

  let gpuDetected = false;
  let gpuName: string | null = null;
  let gpuVramGb: number | null = null;

  if (plat === 'win32') {
    try {
      // Use execFileSync (not execSync) to avoid shell injection.
      // wmic is a direct executable — no shell features needed.
      const output = execFileSync(
        'wmic',
        ['path', 'win32_videocontroller', 'get', 'Name,AdapterRAM', '/value'],
        { encoding: 'utf-8', timeout: 5000 },
      );
      const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let ram = 0;
      let name = '';
      for (const line of lines) {
        if (line.startsWith('AdapterRAM=')) {
          ram = Number.parseInt(line.split('=')[1] ?? '0', 10);
        }
        if (line.startsWith('Name=')) {
          name = line.split('=').slice(1).join('=');
        }
      }
      // Filter out generic Windows display adapters
      if (
        name &&
        !name.toLowerCase().includes('basic') &&
        !name.toLowerCase().includes('microsoft basic')
      ) {
        gpuDetected = true;
        gpuName = name;
        gpuVramGb = ram > 0 ? Math.round((ram / 1024 ** 3) * 10) / 10 : null;
      }
    } catch {
      // GPU detection failed — assume none
    }
  } else if (plat === 'darwin') {
    const mac = detectDarwinGpu(totalRamGb);
    gpuDetected = mac.detected;
    gpuName = mac.name;
    gpuVramGb = mac.vramGb;
  } else if (plat === 'linux') {
    const linux = detectLinuxGpu();
    gpuDetected = linux.detected;
    gpuName = linux.name;
    gpuVramGb = linux.vramGb;
  }

  cachedProfile = { cpuCores, totalRamGb, gpuDetected, gpuName, gpuVramGb, platform: plat };
  return cachedProfile;
}

interface GpuDetection {
  detected: boolean;
  name: string | null;
  vramGb: number | null;
}

const NO_GPU: GpuDetection = { detected: false, name: null, vramGb: null };

/**
 * Fraction of unified memory Apple documents as addressable by the GPU on
 * Apple Silicon. `system_profiler` reports no VRAM line for these parts
 * (memory is shared), so reporting `null` would tell the strategy picker
 * "unknown" when the GPU can in fact address most of system RAM.
 */
const APPLE_UNIFIED_MEMORY_GPU_SHARE = 0.7;

/**
 * macOS GPU detection via `system_profiler SPDisplaysDataType`.
 *
 * Parsing is delegated to `parseSystemProfiler`, the same tested parser the
 * local-GGUF Metal probe uses — this path exists precisely because that
 * parser had no desktop consumer.
 */
function detectDarwinGpu(totalRamGb: number): GpuDetection {
  try {
    const output = execFileSync('system_profiler', ['SPDisplaysDataType'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const device = parseSystemProfiler(output).devices[0];
    if (!device) return NO_GPU;

    return {
      detected: true,
      name: device.name,
      // Discrete cards report real VRAM; Apple Silicon reports 0 because
      // the pool is unified, so derive the GPU-addressable share instead.
      vramGb:
        device.vramMb > 0
          ? Math.round((device.vramMb / 1024) * 10) / 10
          : Math.round(totalRamGb * APPLE_UNIFIED_MEMORY_GPU_SHARE * 10) / 10,
    };
  } catch {
    return NO_GPU;
  }
}

/**
 * Linux GPU detection: `nvidia-smi` first because it reports exact VRAM,
 * then `lspci` as the vendor-neutral fallback for AMD/Intel parts where no
 * vendor tool is guaranteed to be installed.
 */
function detectLinuxGpu(): GpuDetection {
  try {
    const output = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
      { encoding: 'utf-8', timeout: 5000 },
    );
    const device = parseNvidiaSmiCsv(output).devices[0];
    if (device) {
      return {
        detected: true,
        name: device.name,
        vramGb: Math.round((device.vramMb / 1024) * 10) / 10,
      };
    }
  } catch {
    // No NVIDIA tooling — fall through to lspci.
  }

  try {
    const output = execFileSync('lspci', [], { encoding: 'utf-8', timeout: 5000 });
    for (const line of output.split('\n')) {
      // lspci class names for graphics parts. Anything else (audio,
      // bridges, NICs) must not be mistaken for a GPU.
      const match =
        /^\S+\s+(?:VGA compatible controller|3D controller|Display controller):\s*(.+)$/.exec(
          line.trim(),
        );
      const name = match?.[1]?.trim();
      if (name) {
        // lspci exposes no VRAM figure. `null` is the honest answer —
        // a fabricated number would be worse than "unknown".
        return { detected: true, name, vramGb: null };
      }
    }
  } catch {
    // Neither probe available.
  }

  return NO_GPU;
}

/** Clear the cached profile. **Test-only.** */
export function clearProfileCache(): void {
  cachedProfile = null;
}
