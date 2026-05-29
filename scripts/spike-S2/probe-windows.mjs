#!/usr/bin/env node
/**
 * Spike S2 — Windows GPU probe parser prototype.
 *
 * THROWAWAY: this script proves the GpuInventory shape from the spec § 12.1
 * is correctly extractable from `nvidia-smi`, `nvidia-smi -L`, and
 * `vulkaninfo --summary` output. Phase 2 production code lives at
 * `packages/local-gguf-runtime/src/gpu-probe/{nvidia,vulkan}.ts` and replaces
 * these parsers with the production implementations.
 *
 * Scope (Windows):
 *   - nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap
 *     --format=csv,noheader  → cuda.devices + cuda.driverVersion
 *   - nvidia-smi -L                                                → cross-check device count + UUID
 *   - vulkaninfo --summary                                         → vulkan.devices
 *   - (no rocm — Windows AMD goes via Vulkan or via the separate llama.cpp HIP
 *     binary; ROCm linux-only system probe is parsed by probe-linux.mjs)
 *
 * Spec contract (from packages/shared-types/src/local-gguf.ts in phase-01):
 *   GpuInventory.cuda    = { available, devices[], driverVersion?, cudaVersion? }
 *   GpuInventory.vulkan  = { available, devices[] }
 *   GpuDevice            = { name, vramMb, backend, ...?optional }
 *
 * The parsers below INTENTIONALLY emit a few "shape-extension" fields
 * (computeCap, deviceId, vendorId, deviceType, driverInfo, uuid) so the
 * Phase 1 shape can be amended without re-parsing. The Phase 2 production
 * code keeps the extensions; see the writeup "Shape adjustments to
 * GpuInventory" section.
 *
 * NVIDIA-smi reference:
 *   https://docs.nvidia.com/deploy/nvidia-smi/index.html
 * Vulkan VkPhysicalDeviceType enum:
 *   https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceType.html
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';

// ────────────────────────────────────────────────────────────────────────────
// nvidia-smi --query-gpu CSV parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap
 * --format=csv,noheader` output.
 *
 * Per NVIDIA docs the columns are emitted in the order given to --query-gpu;
 * memory.total comes back as `<int> MiB`; compute_cap as `M.m`. One row per
 * GPU. Both spaced (`A, B, C`) and unspaced (`A,B,C`) variants appear in the
 * wild — we strip both. Lines starting with `#` are fixture header comments
 * and are skipped.
 *
 * @param {string} raw - Raw command output (or fixture text).
 * @returns {{devices: object[], driverVersion: string | undefined}}
 */
export function parseNvidiaSmiCsv(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const devices = [];
  let driverVersion;

  for (const line of lines) {
    // Split on commas, trim each field. The CSV format guarantees no quoted
    // commas because every field is a primitive (name has no commas in any
    // shipped GPU; memory.total is digits + " MiB"; driver_version is a
    // dotted version; compute_cap is M.m).
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length < 4) continue;

    const [name, memTotal, driver, computeCap] = fields;
    const vramMb = parseMib(memTotal);
    if (vramMb === null) continue;

    devices.push({
      name,
      vramMb,
      backend: 'cuda',
      computeCap, // shape extension: M.m string; used by backend ranking (CUDA ≥ 11)
    });

    // All rows on a given host share the same driver — last-wins is fine.
    if (driver) driverVersion = driver;
  }

  return { devices, driverVersion };
}

/**
 * Parse `<int> MiB` → integer MiB. Returns null on shape mismatch.
 * Real nvidia-smi outputs always look like `32607 MiB`; older versions
 * sometimes emit a `[Insufficient Permissions]` literal — the parser must
 * not crash on those.
 *
 * @param {string} raw
 * @returns {number | null}
 */
function parseMib(raw) {
  const match = raw.match(/^(\d+)\s*MiB$/i);
  return match ? Number(match[1]) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// nvidia-smi -L parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `nvidia-smi -L` output for cross-check / UUID extraction.
 *
 * Line shape (per NVIDIA's deepops docs and MLCommons' production regex):
 *   `GPU <idx>: <name> (UUID: GPU-<uuid>)`
 *
 * MIG sub-device lines are indented and start with `MIG` — we ignore them
 * (Team-X v3.3.0 does not address MIG partitions).
 *
 * Reference regex (MLCommons inference results):
 *   https://github.com/mlcommons/inference_results_v5.0/blob/main/open/HPE/code/common/systems/accelerator.py
 *
 * @param {string} raw
 * @returns {{index: number, name: string, uuid: string}[]}
 */
export function parseNvidiaSmiList(raw) {
  const re = /^GPU\s+(\d+):\s+(.+?)\s+\(UUID:\s+(GPU-[0-9a-f-]+)\)\s*$/i;
  const out = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = line.match(re);
    if (!match) continue;
    out.push({
      index: Number(match[1]),
      name: match[2],
      uuid: match[3],
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// vulkaninfo --summary parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `vulkaninfo --summary` output → array of Vulkan devices.
 *
 * Output format (vulkan-tools 1.3.224+):
 *   Devices:
 *   ========
 *   GPU0:
 *       apiVersion         = 1.4.329
 *       driverVersion      = 595.58.3.0
 *       vendorID           = 0x10de
 *       deviceID           = 0x2684
 *       deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
 *       deviceName         = NVIDIA GeForce RTX 5090
 *       driverName         = NVIDIA
 *       driverInfo         = 595.58.03
 *       ...
 *
 * Older vulkan-tools (< 1.3.224) dump the same fields under
 * `PhysicalDevice <idx>` headers without the `--summary` short form — see
 * Findings F2 in the writeup. Phase 2 falls back to the full `vulkaninfo`
 * dump in that case; this spike's parser only covers the modern format.
 *
 * The parser must:
 *   1. Locate the `Devices:` block (everything after the `========` underline
 *      until EOF).
 *   2. Section into `GPUN:` stanzas.
 *   3. Pull deviceName, deviceType, vendorID, deviceID, driverInfo from each.
 *   4. Filter out CPU/Other deviceTypes (software fallback drivers).
 *
 * deviceType enum:
 *   https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceType.html
 *
 * vramMb is NOT exposed by `--summary`. The Phase 2 production probe will
 * either issue `vulkaninfo --json` (which DOES include
 * `VkPhysicalDeviceMemoryProperties.memoryHeaps[].size`) or fall back to
 * "vramMb unknown — set to 0 in inventory". For this spike we emit `vramMb: 0`
 * and surface the gap in the writeup (Findings F1).
 *
 * @param {string} raw
 * @returns {object[]}
 */
export function parseVulkanInfoSummary(raw) {
  // Strip fixture comment lines.
  const cleaned = raw
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  // Find Devices: section.
  const devicesIdx = cleaned.indexOf('\nDevices:');
  const body = devicesIdx === -1 ? cleaned : cleaned.slice(devicesIdx);

  // Split into per-GPU stanzas. Each stanza starts with `GPUN:` at the start
  // of a line. Use a positive lookahead so the split keeps the `GPUN:` line
  // attached to its stanza.
  const stanzas = body.split(/\n(?=GPU\d+:)/).filter((s) => /^GPU\d+:/.test(s));

  const devices = [];
  for (const stanza of stanzas) {
    const device = parseVulkanStanza(stanza);
    if (!device) continue;

    // Filter out CPU / Other device types — those are software fallback
    // drivers (llvmpipe, SwiftShader) that the user does NOT want to run a
    // GPU build of llama.cpp against.
    if (
      device.deviceType !== 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU' &&
      device.deviceType !== 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU'
    ) {
      continue;
    }

    devices.push({
      name: device.deviceName,
      vramMb: 0, // vulkaninfo --summary does not expose memoryHeaps; Phase 2 reads --json.
      backend: 'vulkan',
      vendorId: device.vendorID,
      deviceId: device.deviceID,
      deviceType: device.deviceType,
      driverInfo: device.driverInfo,
      driverName: device.driverName,
      apiVersion: device.apiVersion,
    });
  }

  return devices;
}

/**
 * Pull `key = value` lines out of a single GPUN: stanza.
 *
 * @param {string} stanza
 * @returns {Record<string, string> | null}
 */
function parseVulkanStanza(stanza) {
  const out = {};
  for (const rawLine of stanza.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^(\w+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, key, value] = match;
    out[key] = value;
  }
  // Reject the stanza if it doesn't have at least a deviceName + deviceType.
  if (!out.deviceName || !out.deviceType) return null;
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregator: produces a partial GpuInventory shape for Windows.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read fixture files for one Windows scenario and produce a partial
 * GpuInventory. CPU/RAM are placeholders — the Phase 2 production probe
 * reads them via `os.cpus()` and `os.totalmem()`.
 *
 * @param {string} fixtureDir - Directory containing nvidia-smi.txt, nvidia-smi-list.txt, vulkaninfo.txt.
 * @returns {Promise<object>} GpuInventory
 */
export async function probeWindows(fixtureDir) {
  const inventory = {
    detectedAt: 0, // populated at call time in production; deterministic 0 here for stable test output
    cuda: { available: false, devices: [], driverVersion: undefined, cudaVersion: undefined },
    rocm: { available: false, devices: [], rocmVersion: undefined },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 0, ramMb: 0 },
  };

  // CUDA — nvidia-smi CSV.
  const csvPath = join(fixtureDir, 'nvidia-smi.txt');
  if (existsSync(csvPath)) {
    const raw = await readFile(csvPath, 'utf8');
    const { devices, driverVersion } = parseNvidiaSmiCsv(raw);
    inventory.cuda.devices = devices;
    inventory.cuda.driverVersion = driverVersion;
    inventory.cuda.available = devices.length > 0;
  }

  // CUDA cross-check — nvidia-smi -L. We don't merge UUIDs into the device
  // records (Phase 2's responsibility) but we DO validate the count matches.
  // The spike only asserts the parser ran; smoke-test.mjs checks
  // count parity.
  const listPath = join(fixtureDir, 'nvidia-smi-list.txt');
  if (existsSync(listPath)) {
    const raw = await readFile(listPath, 'utf8');
    const list = parseNvidiaSmiList(raw);
    // Stash on the partial inventory so the smoke test can assert parity.
    inventory.cuda.devices = inventory.cuda.devices.map((device, i) => ({
      ...device,
      uuid: list[i]?.uuid,
    }));
  }

  // Vulkan — vulkaninfo --summary.
  const vkPath = join(fixtureDir, 'vulkaninfo.txt');
  if (existsSync(vkPath)) {
    const raw = await readFile(vkPath, 'utf8');
    const devices = parseVulkanInfoSummary(raw);
    inventory.vulkan.devices = devices;
    inventory.vulkan.available = devices.length > 0;
  }

  return inventory;
}

// ────────────────────────────────────────────────────────────────────────────
// CLI entry — `node probe-windows.mjs <fixture-dir>`
// ────────────────────────────────────────────────────────────────────────────

if (argv[1]?.endsWith('probe-windows.mjs')) {
  const fixtureDir = argv[2];
  if (!fixtureDir) {
    console.error('Usage: node probe-windows.mjs <fixture-dir>');
    console.error(
      '       e.g. node scripts/spike-S2/probe-windows.mjs docs/spikes/S2-fixtures/_synthetic/windows-nvidia',
    );
    process.exit(2);
  }
  probeWindows(resolve(fixtureDir))
    .then((inv) => {
      console.log(JSON.stringify(inv, null, 2));
    })
    .catch((err) => {
      console.error(`probe-windows failed: ${err.message}`);
      process.exit(1);
    });
}
