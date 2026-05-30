// packages/local-gguf-runtime/src/gpu-probe/vulkan.ts
import type { GpuDevice } from '@team-x/shared-types';

export interface VulkaninfoParseResult {
  devices: GpuDevice[];
}

export interface ProbeVulkanDeps {
  runCommand: (
    cmd: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  timeoutMs: number;
}

export interface VulkanProbeResult {
  available: boolean;
  devices: GpuDevice[];
}

/** Software-renderer filter: drop adapters that are pure software emulation. */
const SOFTWARE_RENDERER_RE = /llvmpipe|swiftshader|software/i;

/**
 * Parse `vulkaninfo --summary` output into GPU devices.
 *
 * vulkaninfo emits `GPUn:` block headers (e.g. `GPU0:`, `GPU1:`) followed by
 * tab-indented key = value pairs. We:
 *  1. Split on `GPU\d+:` section headers.
 *  2. Extract `deviceName`, `deviceType`, `vendorID`, `deviceID`,
 *     `driverInfo`, `apiVersion`, `deviceUUID` from each block.
 *  3. Filter out software renderers (llvmpipe, SwiftShader) by name.
 *  4. Set backend `'vulkan'` on every kept device.
 *  5. vramMb is not reported by vulkaninfo — set to 0 (optional field;
 *     the ranking service fills it via a secondary OS query if needed).
 */
export function parseVulkaninfo(raw: string): VulkaninfoParseResult {
  // Split on GPU section headers — each chunk is one adapter block.
  const gpuBlocks = raw.split(/^GPU\d+:\s*$/m).slice(1);

  const devices: GpuDevice[] = [];

  for (const block of gpuBlocks) {
    const get = (key: string): string | undefined => {
      const match = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm').exec(block);
      return match ? match[1].trim() : undefined;
    };

    const deviceName = get('deviceName');
    if (!deviceName) continue;

    // Filter software renderers
    if (SOFTWARE_RENDERER_RE.test(deviceName)) continue;

    const deviceType = get('deviceType');
    const vendorId = get('vendorID');
    const deviceId = get('deviceID');
    const driverInfo = get('driverInfo');
    const apiVersion = get('apiVersion');
    const uuid = get('deviceUUID');

    const device: GpuDevice = {
      name: deviceName,
      // vulkaninfo does not expose VRAM; set 0 — service layer adds via OS query
      vramMb: 0,
      backend: 'vulkan',
      ...(deviceType !== undefined ? { deviceType } : {}),
      ...(vendorId !== undefined ? { vendorId } : {}),
      ...(deviceId !== undefined ? { deviceId } : {}),
      ...(driverInfo !== undefined ? { driverInfo } : {}),
      ...(apiVersion !== undefined ? { apiVersion } : {}),
      ...(uuid !== undefined ? { uuid } : {}),
    };
    devices.push(device);
  }

  return { devices };
}

export async function probeVulkan(deps: ProbeVulkanDeps): Promise<VulkanProbeResult> {
  try {
    const result = await deps.runCommand('vulkaninfo', ['--summary']);
    if (result.exitCode !== 0) {
      return { available: false, devices: [] };
    }
    const parsed = parseVulkaninfo(result.stdout);
    return {
      available: parsed.devices.length > 0,
      devices: parsed.devices,
    };
  } catch {
    return { available: false, devices: [] };
  }
}
