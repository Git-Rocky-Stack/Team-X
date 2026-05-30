// packages/local-gguf-runtime/src/gpu-probe/rocm.ts
import type { GpuDevice } from '@team-x/shared-types';

export interface RocmParseResult {
  devices: GpuDevice[];
}

export interface ProbeRocmDeps {
  runCommand: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  timeoutMs: number;
}

export interface RocmProbeResult {
  available: boolean;
  devices: GpuDevice[];
}

/**
 * Parse rocminfo text output into GPU devices.
 *
 * rocminfo emits one "Agent N" block per HSA agent (CPUs and GPUs both).
 * We:
 *  1. Split the text on `Agent \d+` lines (the `*******` separators are noise).
 *  2. Keep only sections whose `Device Type:` is `GPU`.
 *  3. Extract `Marketing Name:` as the display name.
 *  4. Extract `Name:` (e.g. `gfx1100`) as the gfx ISA target.
 *  5. Find the COARSE GRAINED GLOBAL pool `Size:` for VRAM (in KB → MiB).
 */
export function parseRocminfo(raw: string): RocmParseResult {
  // Split on "Agent N" lines — the `*******` lines are decorative separators.
  // This gives us one chunk per agent (the first chunk is the preamble, sliced off).
  const agentBlocks = raw.split(/^Agent\s+\d+\s*$/m).slice(1);

  const devices: GpuDevice[] = [];

  for (const block of agentBlocks) {
    // Only process GPU agents
    if (!/Device Type:\s+GPU/m.test(block)) continue;

    // Marketing Name (display string)
    const nameMatch = /^\s*Marketing Name:\s+(.+)$/m.exec(block);
    if (!nameMatch) continue;
    const name = nameMatch[1]?.trim();
    if (!name) continue;

    // Name: gfxNNNN (ISA target)
    const gfxMatch = /^\s*Name:\s+(gfx\S+)/m.exec(block);
    const gfxTarget = gfxMatch?.[1]?.trim();

    // VRAM: scan line-by-line for the COARSE GRAINED GLOBAL pool Size.
    // We look for a "Segment: GLOBAL; FLAGS: COARSE GRAINED" line, then take
    // the very next "Size:" line that appears before any other "Segment:" line.
    let vramMb = 0;
    const lines = block.split(/\r?\n/);
    let inCoarseGrained = false;
    for (const line of lines) {
      if (/Segment:\s+GLOBAL;\s+FLAGS:\s+COARSE GRAINED/.test(line)) {
        inCoarseGrained = true;
        continue;
      }
      if (inCoarseGrained) {
        const sizeMatch = /^\s*Size:\s+(\d+)/.exec(line);
        if (sizeMatch) {
          const kbStr = sizeMatch[1];
          // Compiler-required guard (noUncheckedIndexedAccess); a matched
          // \d+ group is never undefined at runtime. If it ever were, the
          // COARSE GRAINED pool boundary is found — stop scanning, don't continue.
          if (kbStr === undefined) break;
          const kb = Number.parseInt(kbStr, 10);
          vramMb = Math.floor(kb / 1024);
          break;
        }
        // If we hit another Segment line before Size, reset
        if (/Segment:/.test(line)) {
          inCoarseGrained = false;
        }
      }
    }

    const device: GpuDevice = {
      name,
      vramMb,
      backend: 'rocm',
      ...(gfxTarget !== undefined ? { gfxTarget } : {}),
    };
    devices.push(device);
  }

  return { devices };
}

export async function probeRocm(deps: ProbeRocmDeps): Promise<RocmProbeResult> {
  try {
    const result = await deps.runCommand('rocminfo', []);
    if (result.exitCode !== 0) {
      return { available: false, devices: [] };
    }
    const parsed = parseRocminfo(result.stdout);
    return {
      available: parsed.devices.length > 0,
      devices: parsed.devices,
    };
  } catch {
    return { available: false, devices: [] };
  }
}
