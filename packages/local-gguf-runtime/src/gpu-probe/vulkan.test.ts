// packages/local-gguf-runtime/src/gpu-probe/vulkan.test.ts
import { describe, expect, it } from 'vitest';
import { type ProbeVulkanDeps, parseVulkaninfo, probeVulkan } from './vulkan';

// Inline excerpts modeled on the real S2 fixture at
// docs/spikes/S2-fixtures/windows-nvidia/vulkaninfo.txt

const SINGLE_GPU_RAW = `
==========
VULKANINFO
==========

Devices:
========
GPU0:
	apiVersion         = 1.4.312
	driverVersion      = 582.28.0.0
	vendorID           = 0x10de
	deviceID           = 0x17c2
	deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
	deviceName         = NVIDIA GeForce GTX TITAN X
	driverInfo         = 582.28
	deviceUUID         = 4056aaf7-ba2a-a8f5-1bcb-5db6fd91ca8f
`;

// Dual-TITAN: mirrors the actual S2 fixture exactly (two discrete GPUs)
const DUAL_TITAN_RAW = `
==========
VULKANINFO
==========

Vulkan Instance Version: 1.4.309

Devices:
========
GPU0:
	apiVersion         = 1.4.312
	driverVersion      = 582.28.0.0
	vendorID           = 0x10de
	deviceID           = 0x17c2
	deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
	deviceName         = NVIDIA GeForce GTX TITAN X
	driverInfo         = 582.28
	deviceUUID         = 4056aaf7-ba2a-a8f5-1bcb-5db6fd91ca8f
GPU1:
	apiVersion         = 1.4.312
	driverVersion      = 582.28.0.0
	vendorID           = 0x10de
	deviceID           = 0x17c2
	deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
	deviceName         = NVIDIA GeForce GTX TITAN X
	driverInfo         = 582.28
	deviceUUID         = 90b5d104-c751-0f3d-a02c-71711408661f
`;

// Software renderer that should be filtered out
const SOFTWARE_RENDERER_RAW = `
Devices:
========
GPU0:
	apiVersion         = 1.3.204
	vendorID           = 0x10005
	deviceID           = 0x0000
	deviceType         = PHYSICAL_DEVICE_TYPE_CPU
	deviceName         = llvmpipe (LLVM 15.0.7, 256 bits)
`;

// Mixed: one discrete GPU + one software renderer
const MIXED_RAW = `
Devices:
========
GPU0:
	apiVersion         = 1.4.312
	vendorID           = 0x10de
	deviceID           = 0x17c2
	deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
	deviceName         = NVIDIA GeForce RTX 4090
	driverInfo         = 555.42
GPU1:
	apiVersion         = 1.3.204
	vendorID           = 0x10005
	deviceID           = 0x0000
	deviceType         = PHYSICAL_DEVICE_TYPE_CPU
	deviceName         = SwiftShader Device (LLVM 10.0.0)
`;

describe('parseVulkaninfo', () => {
  it('parses a single discrete GPU block', () => {
    const out = parseVulkaninfo(SINGLE_GPU_RAW);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].name).toBe('NVIDIA GeForce GTX TITAN X');
    expect(out.devices[0].backend).toBe('vulkan');
  });

  it('parses the real dual-TITAN fixture — returns 2 devices', () => {
    const out = parseVulkaninfo(DUAL_TITAN_RAW);
    expect(out.devices).toHaveLength(2);
    expect(out.devices[0].name).toBe('NVIDIA GeForce GTX TITAN X');
    expect(out.devices[1].name).toBe('NVIDIA GeForce GTX TITAN X');
    // UUIDs distinguish the two physical cards
    expect(out.devices[0].uuid).toBe('4056aaf7-ba2a-a8f5-1bcb-5db6fd91ca8f');
    expect(out.devices[1].uuid).toBe('90b5d104-c751-0f3d-a02c-71711408661f');
  });

  it('populates optional fields from the real fixture', () => {
    const out = parseVulkaninfo(SINGLE_GPU_RAW);
    const dev = out.devices[0];
    expect(dev.vendorId).toBe('0x10de');
    expect(dev.deviceId).toBe('0x17c2');
    expect(dev.deviceType).toBe('PHYSICAL_DEVICE_TYPE_DISCRETE_GPU');
    expect(dev.driverInfo).toBe('582.28');
    expect(dev.apiVersion).toBe('1.4.312');
  });

  it('handles CRLF line endings (vulkaninfo on Windows — the primary target)', () => {
    const out = parseVulkaninfo(DUAL_TITAN_RAW.replace(/\n/g, '\r\n'));
    expect(out.devices).toHaveLength(2);
    expect(out.devices[0].name).toBe('NVIDIA GeForce GTX TITAN X');
    expect(out.devices[1].uuid).toBe('90b5d104-c751-0f3d-a02c-71711408661f');
  });

  it('extracts deviceUUID and not driverUUID when both are present', () => {
    const raw = [
      'Devices:',
      '========',
      'GPU0:',
      '\tdeviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU',
      '\tdeviceName         = NVIDIA GeForce GTX TITAN X',
      '\tdeviceUUID         = 4056aaf7-ba2a-a8f5-1bcb-5db6fd91ca8f',
      '\tdriverUUID         = a70d28c3-efe0-5567-9edc-ff605278cc82',
    ].join('\n');
    const out = parseVulkaninfo(raw);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].uuid).toBe('4056aaf7-ba2a-a8f5-1bcb-5db6fd91ca8f');
  });

  it('filters out software renderers (llvmpipe)', () => {
    const out = parseVulkaninfo(SOFTWARE_RENDERER_RAW);
    expect(out.devices).toHaveLength(0);
  });

  it('keeps discrete GPU and drops software renderer in mixed output', () => {
    const out = parseVulkaninfo(MIXED_RAW);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].name).toBe('NVIDIA GeForce RTX 4090');
  });

  it('returns empty devices on empty input', () => {
    const out = parseVulkaninfo('');
    expect(out.devices).toHaveLength(0);
  });

  it('returns empty devices on malformed input', () => {
    const out = parseVulkaninfo('not vulkaninfo output at all');
    expect(out.devices).toHaveLength(0);
  });
});

describe('probeVulkan', () => {
  it('returns available=true with parsed devices when vulkaninfo succeeds', async () => {
    const deps: ProbeVulkanDeps = {
      runCommand: async () => ({ stdout: DUAL_TITAN_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
    };
    const result = await probeVulkan(deps);
    expect(result.available).toBe(true);
    expect(result.devices).toHaveLength(2);
  });

  it('returns available=false when vulkaninfo exits non-zero (missing tool)', async () => {
    const deps: ProbeVulkanDeps = {
      runCommand: async () => ({ stdout: '', stderr: 'vulkaninfo: not found', exitCode: 127 }),
      timeoutMs: 3000,
    };
    const result = await probeVulkan(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });

  it('returns available=false when command throws (timeout)', async () => {
    const deps: ProbeVulkanDeps = {
      runCommand: async () => {
        throw new Error('Command timed out');
      },
      timeoutMs: 3000,
    };
    const result = await probeVulkan(deps);
    expect(result.available).toBe(false);
  });

  it('returns available=false when only software renderers found', async () => {
    const deps: ProbeVulkanDeps = {
      runCommand: async () => ({ stdout: SOFTWARE_RENDERER_RAW, stderr: '', exitCode: 0 }),
      timeoutMs: 3000,
    };
    const result = await probeVulkan(deps);
    expect(result.available).toBe(false);
    expect(result.devices).toHaveLength(0);
  });
});
