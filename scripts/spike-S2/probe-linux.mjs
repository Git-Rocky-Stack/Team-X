#!/usr/bin/env node
/**
 * Spike S2 — Linux GPU probe parser prototype.
 *
 * THROWAWAY: proves the GpuInventory shape (spec § 12.1) is extractable from
 * Linux probe outputs. Phase 2 production code lives at
 * `packages/local-gguf-runtime/src/gpu-probe/{nvidia,rocm,vulkan}.ts`.
 *
 * Scope (Linux):
 *   - nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap
 *     --format=csv,noheader  → cuda.devices + cuda.driverVersion
 *   - rocminfo               → rocm.devices + rocm.rocmVersion
 *   - vulkaninfo --summary   → vulkan.devices
 *
 * The nvidia-smi and vulkaninfo CSV/summary outputs are identical across
 * Windows and Linux — those parsers are re-exported from probe-windows.mjs
 * to avoid duplication. rocminfo is Linux-only (and is the most format-
 * variable of the four — see the parser docstring for the multi-agent
 * sectioning strategy).
 *
 * NVIDIA-smi reference:
 *   https://docs.nvidia.com/deploy/nvidia-smi/index.html
 * ROCm rocminfo reference:
 *   https://github.com/ROCm/rocm-systems/tree/develop/projects/rocminfo
 * Vulkan VkPhysicalDeviceType enum:
 *   https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VkPhysicalDeviceType.html
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';

import { parseNvidiaSmiCsv, parseNvidiaSmiList, parseVulkanInfoSummary } from './probe-windows.mjs';

// ────────────────────────────────────────────────────────────────────────────
// rocminfo parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `rocminfo` output → array of ROCm GPU devices.
 *
 * Output structure (stable across ROCm 4.x – 7.x):
 *   ROCk module is loaded
 *   =====================
 *   HSA System Attributes
 *   =====================
 *   ...
 *   ==========
 *   HSA Agents
 *   ==========
 *   *******
 *   Agent 1
 *   *******
 *     Name:                    AMD Ryzen ...
 *     Marketing Name:          AMD Ryzen ...
 *     Device Type:             CPU
 *     ...
 *   *******
 *   Agent 2
 *   *******
 *     Name:                    gfx1100
 *     Marketing Name:          AMD Radeon RX 7900 XTX
 *     Device Type:             GPU
 *     Pool Info:
 *       Pool 1
 *         Segment:                 GLOBAL; FLAGS: COARSE GRAINED
 *         Size:                    25165824(0x1800000) KB
 *         ...
 *     ISA Info:
 *       ISA 1
 *         Name:                    amdgcn-amd-amdhsa--gfx1100
 *   *** Done ***
 *
 * Parsing strategy:
 *   1. Drop the System Attributes block (header before "HSA Agents").
 *   2. Split on `Agent N` headers into per-agent blocks.
 *   3. For each block, read `Device Type` — keep only `GPU`.
 *   4. From kept blocks, read `Name:` (the gfxNNNN target) and
 *      `Marketing Name:` (display string).
 *   5. Inside the `Pool Info:` sub-block, find the Pool with
 *      `Segment: GLOBAL` AND `FLAGS: COARSE GRAINED` — that's the
 *      addressable VRAM pool (24 GB on the RX 7900 XTX). `Size:` is
 *      reported in KB (`25165824(0x1800000) KB`); we convert to MiB.
 *
 * The "GLOBAL; COARSE GRAINED" pool is the canonical VRAM pool for
 * discrete GPUs. APUs (Ryzen AI MAX+, Steam Deck) report GLOBAL+FINE-GRAINED
 * AND COARSE-GRAINED with identical sizes (since they share system memory);
 * we still pick COARSE GRAINED first because it's the pool llama.cpp's HIP
 * backend actually allocates from.
 *
 * Reference:
 *   https://rocm.docs.amd.com/projects/HIP/en/latest/how-to/hip_runtime_api/memory_management.html
 *
 * The parser also extracts `gfxTarget` from the ISA Info block — Phase 2
 * uses it to look up backend compatibility (gfx1100 = RDNA3 supports rocBLAS;
 * gfx900 = Vega does not, fall back to Vulkan).
 *
 * @param {string} raw
 * @returns {{devices: object[], rocmVersion: string | undefined}}
 */
export function parseRocminfo(raw) {
  // Strip ANSI color sequences (real rocminfo on a TTY emits them); the
  // public sample we modeled the fixture on had `\x1b[37m` before
  // `ROCk module is loaded`.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes.
  const cleaned = raw.replace(/\x1b\[[0-9;]*m/g, '');

  // Drop fixture comment lines (`# ...`) that aren't part of real output.
  const withoutComments = cleaned
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  // Find the start of HSA Agents section so we only parse agents (not the
  // System Attributes block, which contains a `Runtime Ext Version` line we
  // could mis-attribute as a rocm version).
  const agentsIdx = withoutComments.search(/^HSA Agents\s*$/m);
  if (agentsIdx === -1) {
    // Real rocminfo always prints HSA Agents; missing it means the file is
    // either a header-only stub or the runtime failed mid-print. Return
    // empty inventory — Phase 2 surfaces this as an "rocminfo produced no
    // device output" toast.
    return { devices: [], rocmVersion: parseRuntimeVersion(withoutComments) };
  }

  const agentsBody = withoutComments.slice(agentsIdx);

  // Split into per-agent blocks. The `*******` header lines surround each
  // `Agent N` label; using the literal `Agent N` line as the split anchor
  // is robust against minor whitespace variation.
  const blocks = agentsBody.split(/^\s*Agent\s+\d+\s*$/m).slice(1);

  const devices = [];
  for (const block of blocks) {
    const deviceType = pickField(block, 'Device Type');
    if (deviceType !== 'GPU') continue;

    const gfxName = pickField(block, 'Name'); // e.g. "gfx1100"
    const marketingName = pickField(block, 'Marketing Name'); // e.g. "AMD Radeon RX 7900 XTX"
    if (!marketingName && !gfxName) continue;

    const vramMb = parseVramFromPools(block);

    devices.push({
      name: marketingName || gfxName,
      vramMb,
      backend: 'rocm',
      gfxTarget: gfxName, // shape extension: gfxNNNN — drives backend ranking
    });
  }

  return { devices, rocmVersion: parseRuntimeVersion(withoutComments) };
}

/**
 * Extract a field value from a rocminfo agent block.
 *
 * rocminfo emits lines like:
 *   `  Marketing Name:          AMD Radeon RX 7900 XTX`
 *   `  Device Type:             GPU                                `
 *
 * Trailing whitespace is preserved by rocminfo (the values are
 * right-padded to a fixed column). We strip that.
 *
 * @param {string} block
 * @param {string} fieldName
 * @returns {string | undefined}
 */
function pickField(block, fieldName) {
  const re = new RegExp(`^\\s*${escapeRegex(fieldName)}:\\s+(.+?)\\s*$`, 'm');
  const match = block.match(re);
  return match ? match[1].trim() : undefined;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse VRAM from a rocminfo GPU agent's Pool Info block.
 *
 * Strategy: find the first Pool with both `Segment: GLOBAL` and
 * `COARSE GRAINED` in the same FLAGS line; convert its Size from KB
 * (rocminfo's unit) to MiB.
 *
 * Real Pool Info line shape:
 *       Segment:                 GLOBAL; FLAGS: COARSE GRAINED
 *       Size:                    25165824(0x1800000) KB
 *
 * @param {string} block
 * @returns {number}
 */
function parseVramFromPools(block) {
  // Carve out the `Pool Info:` sub-block (everything from `Pool Info:` up to
  // the next top-level key like `ISA Info:` or end-of-block).
  const poolStart = block.indexOf('Pool Info:');
  if (poolStart === -1) return 0;
  const afterPool = block.slice(poolStart);
  const isaIdx = afterPool.indexOf('ISA Info:');
  const poolSection = isaIdx === -1 ? afterPool : afterPool.slice(0, isaIdx);

  // Split into per-pool stanzas. Each pool starts with `Pool N`.
  const pools = poolSection.split(/^\s*Pool\s+\d+\s*$/m).slice(1);

  for (const pool of pools) {
    const segLine = pool.match(/^\s*Segment:\s*(.+?)\s*$/m);
    if (!segLine) continue;
    // We want GLOBAL + COARSE GRAINED. We do NOT want GROUP (LDS) or
    // FINE GRAINED (CPU-coherent) for VRAM accounting.
    if (!/GLOBAL/.test(segLine[1])) continue;
    if (!/COARSE GRAINED/.test(segLine[1])) continue;

    const sizeLine = pool.match(/^\s*Size:\s*(\d+)\s*\([0x0-9a-fA-F]+\)\s*KB\s*$/m);
    if (!sizeLine) continue;

    const sizeKb = Number(sizeLine[1]);
    return Math.round(sizeKb / 1024);
  }

  return 0;
}

/**
 * Parse `Runtime Ext Version: 1.4` → "1.4" or undefined.
 *
 * Note: this is the HSA runtime version, not the ROCm release version. ROCm
 * releases (e.g. "6.4.2", "7.2") aren't exposed by rocminfo directly. Phase 2
 * will read `/opt/rocm/.info/version` for that. The runtime-ext version we
 * surface here is still useful — it tells us we're on HSA 1.x.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
function parseRuntimeVersion(text) {
  const match = text.match(/^Runtime Ext Version:\s+([0-9.]+)\s*$/m);
  return match ? match[1] : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregator: produces a partial GpuInventory shape for Linux.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read fixture files for one Linux scenario and produce a partial
 * GpuInventory.
 *
 * @param {string} fixtureDir
 * @returns {Promise<object>} GpuInventory
 */
export async function probeLinux(fixtureDir) {
  const inventory = {
    detectedAt: 0,
    cuda: { available: false, devices: [], driverVersion: undefined, cudaVersion: undefined },
    rocm: { available: false, devices: [], rocmVersion: undefined },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 0, ramMb: 0 },
  };

  const csvPath = join(fixtureDir, 'nvidia-smi.txt');
  if (existsSync(csvPath)) {
    const raw = await readFile(csvPath, 'utf8');
    const { devices, driverVersion } = parseNvidiaSmiCsv(raw);
    inventory.cuda.devices = devices;
    inventory.cuda.driverVersion = driverVersion;
    inventory.cuda.available = devices.length > 0;
  }

  const listPath = join(fixtureDir, 'nvidia-smi-list.txt');
  if (existsSync(listPath)) {
    const raw = await readFile(listPath, 'utf8');
    const list = parseNvidiaSmiList(raw);
    inventory.cuda.devices = inventory.cuda.devices.map((device, i) => ({
      ...device,
      uuid: list[i]?.uuid,
    }));
  }

  const rocmPath = join(fixtureDir, 'rocminfo.txt');
  if (existsSync(rocmPath)) {
    const raw = await readFile(rocmPath, 'utf8');
    const { devices, rocmVersion } = parseRocminfo(raw);
    inventory.rocm.devices = devices;
    inventory.rocm.rocmVersion = rocmVersion;
    inventory.rocm.available = devices.length > 0;
  }

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
// CLI entry — `node probe-linux.mjs <fixture-dir>`
// ────────────────────────────────────────────────────────────────────────────

if (argv[1]?.endsWith('probe-linux.mjs')) {
  const fixtureDir = argv[2];
  if (!fixtureDir) {
    console.error('Usage: node probe-linux.mjs <fixture-dir>');
    process.exit(2);
  }
  probeLinux(resolve(fixtureDir))
    .then((inv) => {
      console.log(JSON.stringify(inv, null, 2));
    })
    .catch((err) => {
      console.error(`probe-linux failed: ${err.message}`);
      process.exit(1);
    });
}
