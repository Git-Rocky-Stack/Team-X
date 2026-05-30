// packages/local-gguf-runtime/src/gpu-probe/metal.ts
import type { GpuDevice } from '@team-x/shared-types';

export interface SystemProfilerParseResult {
  devices: GpuDevice[];
}

export interface ProbeMetalDeps {
  runCommand: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  timeoutMs: number;
  /**
   * The operating system platform string (e.g. process.platform).
   * Injected as a dep so tests can exercise the non-darwin guard
   * without any real shell-out or platform detection.
   */
  platform: string;
}

export interface MetalProbeResult {
  available: boolean;
  devices: GpuDevice[];
}

/**
 * Parse `system_profiler SPDisplaysDataType` output into Metal GPU devices.
 *
 * system_profiler emits indented sections per display/GPU adapter.
 * Each GPU section contains:
 *   - `Chipset Model:` — the GPU's marketing name
 *   - `Type: GPU`     — distinguishes GPU adapters from displays (Type: Display)
 *   - `Metal Support:` — e.g. "Metal 3"; gates shader-bundle compatibility
 *
 * VRAM note: Apple Silicon has unified memory — no VRAM line appears in
 * SPDisplaysDataType output. The parser sets `vramMb: 0`; the Phase 2
 * RuntimeService supplies the real value from `sysctl hw.memsize` after
 * probe, applying Apple's 70–75% allocation guideline for GPU work.
 */
export function parseSystemProfiler(raw: string): SystemProfilerParseResult {
  const devices: GpuDevice[] = [];
  if (!raw.trim()) return { devices };

  // Strategy: split the raw text on `Chipset Model:` lines — each split chunk
  // corresponds to one adapter entry. The text before the first `Chipset Model:`
  // is the header (sliced off). Within each chunk we look for `Type:` and
  // `Metal Support:` on subsequent lines before the next adapter entry.
  const chunks = raw.split(/^\s*Chipset Model:\s+/m);
  // chunks[0] is the preamble ("Graphics/Displays:" header etc.)
  for (const chunk of chunks.slice(1)) {
    // First non-empty line of the chunk is the chipset name (up to newline)
    const nameEnd = chunk.indexOf('\n');
    const chipsetModel = nameEnd >= 0 ? chunk.slice(0, nameEnd).trim() : chunk.trim();
    if (!chipsetModel) continue;

    // Within this chunk, find `Type:` and `Metal Support:` key-value lines
    const typeMatch = /^\s*Type:\s+(.+)$/m.exec(chunk);
    if (!typeMatch) continue;
    const typeValue = typeMatch[1].trim();
    if (typeValue !== 'GPU') continue;

    const metalMatch = /^\s*Metal Support:\s+(.+)$/m.exec(chunk);
    const metalSupport = metalMatch ? metalMatch[1].trim() : undefined;

    const device: GpuDevice = {
      name: chipsetModel,
      // vramMb intentionally 0 — Apple Silicon unified memory is supplied
      // externally by the service layer via sysctl hw.memsize.
      vramMb: 0,
      backend: 'metal',
      ...(metalSupport !== undefined ? { metalSupport } : {}),
    };
    devices.push(device);
  }

  return { devices };
}

export async function probeMetal(deps: ProbeMetalDeps): Promise<MetalProbeResult> {
  // Metal is macOS-only; skip entirely on other platforms
  if (deps.platform !== 'darwin') {
    return { available: false, devices: [] };
  }

  try {
    const result = await deps.runCommand('system_profiler', ['SPDisplaysDataType']);
    if (result.exitCode !== 0) {
      return { available: false, devices: [] };
    }
    const parsed = parseSystemProfiler(result.stdout);
    return {
      available: parsed.devices.length > 0,
      devices: parsed.devices,
    };
  } catch {
    return { available: false, devices: [] };
  }
}
