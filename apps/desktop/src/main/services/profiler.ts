/**
 * Hardware profiler — detects CPU, RAM, GPU capabilities.
 *
 * Runs once at startup and caches the result for the session. Used by
 * the strategy picker to auto-select between Hybrid/Always-On/Lean.
 *
 * Phase 3 — M19. Windows-focused; macOS/Linux stubs return
 * conservative defaults (Phase 4 will add cross-platform detection).
 */

import { execFileSync } from 'node:child_process';
import { cpus, platform, totalmem } from 'node:os';

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
  }
  // macOS / Linux stubs (Phase 4)

  cachedProfile = { cpuCores, totalRamGb, gpuDetected, gpuName, gpuVramGb, platform: plat };
  return cachedProfile;
}

/** Clear the cached profile. **Test-only.** */
export function clearProfileCache(): void {
  cachedProfile = null;
}
