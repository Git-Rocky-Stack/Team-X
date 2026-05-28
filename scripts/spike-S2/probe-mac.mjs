#!/usr/bin/env node
/**
 * Spike S2 — macOS GPU probe parser prototype.
 *
 * THROWAWAY: proves the GpuInventory shape (spec § 12.1) is extractable from
 * `system_profiler SPDisplaysDataType` (text + xml/plist variants) on macOS.
 * Phase 2 production code lives at
 * `packages/local-gguf-runtime/src/gpu-probe/metal.ts`.
 *
 * Scope (macOS):
 *   - system_profiler SPDisplaysDataType         → metal.devices (plain-text)
 *   - system_profiler SPDisplaysDataType -xml    → metal.devices (preferred — typed plist)
 *
 * On Apple Silicon (M1/M2/M3/M4), there is no CUDA / ROCm / Vulkan — only
 * Metal. On Intel Macs with an AMD eGPU, Vulkan-via-MoltenVK could in theory
 * work, but Team-X v3.3.0 only ships the Metal backend for macOS (per spec
 * § 12.2 "macOS → metal (no choice on Mac; we don't ship the others on
 * macOS)"). So this probe emits metal devices only.
 *
 * Apple Silicon VRAM caveat:
 *   The GPU shares unified memory with the CPU. There is no `VRAM` line in
 *   SPDisplaysDataType output on Apple Silicon (only Intel Macs with
 *   discrete graphics report `VRAM (Total): N MB`). The Phase 2 service
 *   reads `sysctl hw.memsize`, apportions ~70-75 % to GPU workloads per
 *   Apple's Metal guidance:
 *     https://developer.apple.com/documentation/metal/setting-resource-storage-modes
 *   That apportionment is OUT OF SCOPE for this fixture-only parser; the
 *   spike emits `vramMb: 0` and surfaces the gap in writeup Findings F4.
 *
 * Apple system_profiler reference:
 *   https://ss64.com/mac/system_profiler.html
 * Metal version history (Metal 3 macOS 13+, Metal 4 macOS 26+):
 *   https://developer.apple.com/metal/
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';

// ────────────────────────────────────────────────────────────────────────────
// Plain-text SPDisplaysDataType parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `system_profiler SPDisplaysDataType` plain-text output.
 *
 * Output structure (Apple Silicon, M2 Max example):
 *   Graphics/Displays:
 *
 *       Apple M2 Max:
 *
 *         Chipset Model: Apple M2 Max
 *         Type: GPU
 *         Bus: Built-In
 *         Total Number of Cores: 38
 *         Vendor: Apple (0x106b)
 *         Metal Support: Metal 3
 *         Displays:
 *           PG42UQ:
 *             ...
 *
 * Intel Mac with discrete graphics adds:
 *         VRAM (Total): 8 GB
 *   or
 *         VRAM (Dynamic, Max): 1536 MB
 *
 * Parsing strategy:
 *   1. Locate the `Graphics/Displays:` section.
 *   2. Split into per-device blocks (each starts with `    <Name>:` at
 *      4-space indent — distinct from the 6-space-indented field lines).
 *   3. From each block, read `Chipset Model`, `Type` (filter to GPU),
 *      `Total Number of Cores` (Apple Silicon: GPU cores; Intel: nothing
 *      meaningful — just record), `Vendor`, `Metal Support`, and any
 *      `VRAM (...)` line (discrete graphics only).
 *
 * The plain-text format has whitespace + colon-aligned values that may
 * reformat between macOS versions; the XML variant (parseSystemProfilerXml
 * below) is more robust and is what Phase 2 will use by default.
 *
 * @param {string} raw
 * @returns {object[]} array of Metal devices
 */
export function parseSystemProfilerText(raw) {
  // Strip fixture comments.
  const cleaned = raw
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

  // Locate the Graphics/Displays section.
  const graphicsIdx = cleaned.indexOf('Graphics/Displays:');
  if (graphicsIdx === -1) return [];
  const section = cleaned.slice(graphicsIdx);

  // A device block starts with a 4-space-indented `<Name>:` line (the
  // chipset-name heading). Field lines start with 6+ space indent. We
  // capture each block by scanning for these heading lines.
  const lines = section.split(/\r?\n/);
  const devices = [];
  let currentBlock = [];
  let inBlock = false;

  for (const line of lines) {
    // Match `    <Name>:` exactly — 4-space indent, no deeper indent.
    if (/^ {4}\S.*:\s*$/.test(line) && !/^ {6}/.test(line)) {
      if (inBlock && currentBlock.length > 0) {
        const device = extractFromTextBlock(currentBlock.join('\n'));
        if (device) devices.push(device);
      }
      currentBlock = [line];
      inBlock = true;
      continue;
    }
    if (inBlock) currentBlock.push(line);
  }
  // Flush final block.
  if (inBlock && currentBlock.length > 0) {
    const device = extractFromTextBlock(currentBlock.join('\n'));
    if (device) devices.push(device);
  }

  return devices;
}

function extractFromTextBlock(block) {
  const type = pickKey(block, 'Type');
  if (type !== 'GPU') return null;

  const chipset = pickKey(block, 'Chipset Model');
  if (!chipset) return null;

  const cores = pickKey(block, 'Total Number of Cores');
  const vendor = pickKey(block, 'Vendor');
  const metalSupport = pickKey(block, 'Metal Support');
  const vramLine = block.match(/^\s+VRAM\s*\([^)]+\):\s*(.+?)\s*$/m);
  const vramMb = vramLine ? parseVramValue(vramLine[1]) : 0;

  return {
    name: chipset,
    vramMb,
    backend: 'metal',
    coreCount: cores ? Number(cores) : undefined,
    vendor,
    metalSupport,
  };
}

function pickKey(block, fieldName) {
  const re = new RegExp(`^\\s+${escapeRegex(fieldName)}:\\s*(.+?)\\s*$`, 'm');
  const match = block.match(re);
  return match ? match[1].trim() : undefined;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a VRAM value string like "8 GB" or "1536 MB" → MiB.
 *
 * macOS reports VRAM with mixed units (older Intel GPUs: MB; modern AMD: GB).
 * We treat "MB" as MiB (close enough for the rounding the UI shows) and
 * convert GB → MiB by ×1024.
 *
 * @param {string} value
 * @returns {number}
 */
function parseVramValue(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB|TB)$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'MB') return Math.round(n);
  if (unit === 'GB') return Math.round(n * 1024);
  if (unit === 'TB') return Math.round(n * 1024 * 1024);
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// XML/plist SPDisplaysDataType parser (preferred — see spec § 12.1 note)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse `system_profiler SPDisplaysDataType -xml` output. The plist is a
 * standard Apple plist 1.0 document with a top-level `<array>` containing
 * one `<dict>` per data type; inside that, `_items` is an array of devices.
 *
 * We avoid pulling a plist library — the GpuInventory consumer only needs
 * a handful of well-known keys, so we extract them with focused regexes
 * against the typed elements:
 *   sppci_model                       (Chipset Model)
 *   sppci_bus                         (Bus)
 *   sppci_cores                       (GPU core count, as <string>)
 *   sppci_vendor                      (Vendor identifier — Apple/AMD/NVIDIA)
 *   spdisplays_mtlgpufamilysupport    (Metal version key)
 *
 * The Metal version key is encoded in `spdisplays_metal3` / `_metal4` /
 * `_metalfamily28` form; we translate to a human label.
 *
 * Each <dict> inside _items is one GPU. The keys may appear in any order
 * (Apple does not guarantee key order in plist serialisation).
 *
 * Reference (Apple plist 1.0 DTD):
 *   https://www.apple.com/DTDs/PropertyList-1.0.dtd
 *
 * @param {string} raw
 * @returns {object[]}
 */
export function parseSystemProfilerXml(raw) {
  // Find the <key>_items</key><array>...</array> block.
  const itemsMatch = raw.match(/<key>_items<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!itemsMatch) return [];
  const itemsBlock = itemsMatch[1];

  // Walk top-level <dict>...</dict> children. We need a depth-aware scan
  // because some dicts can nest (e.g. `_properties` is `<dict/>`). A simple
  // counter avoids pulling an XML parser.
  const devices = [];
  let depth = 0;

  // Iterate via a regex tokenizer. Each token is either an opening
  // <dict>, closing </dict>, a text run, or some other XML tag.
  const tokenRe = /<dict>|<\/dict>|[^<]+|<[^>]+>/g;
  let dictBuf = '';
  let inDict = false;
  let token = tokenRe.exec(itemsBlock);
  while (token !== null) {
    const t = token[0];
    if (t === '<dict>') {
      if (depth === 0) {
        dictBuf = '<dict>';
        inDict = true;
      } else if (inDict) {
        dictBuf += t;
      }
      depth += 1;
    } else if (t === '</dict>') {
      depth -= 1;
      if (inDict) dictBuf += t;
      if (depth === 0 && inDict) {
        const device = extractFromXmlDict(dictBuf);
        if (device) devices.push(device);
        dictBuf = '';
        inDict = false;
      }
    } else if (inDict) {
      dictBuf += t;
    }
    token = tokenRe.exec(itemsBlock);
  }

  return devices;
}

function extractFromXmlDict(dict) {
  const get = (key) => {
    // Match `<key>NAME</key><string>VALUE</string>` (whitespace-tolerant).
    const re = new RegExp(`<key>${escapeRegex(key)}</key>\\s*<(string|integer|real)>([^<]*)</\\1>`);
    const match = dict.match(re);
    return match ? match[2] : undefined;
  };

  // Device-type gate. `sppci_device_type` = "spdisplays_gpu" for GPUs.
  const deviceType = get('sppci_device_type');
  if (deviceType && deviceType !== 'spdisplays_gpu') return null;

  const model = get('sppci_model');
  if (!model) return null;

  const vendorRaw = get('sppci_vendor'); // e.g. "sppci_vendor_Apple"
  const cores = get('sppci_cores');
  const metalKey = get('spdisplays_mtlgpufamilysupport'); // e.g. "spdisplays_metal3"

  return {
    name: model,
    vramMb: 0, // unified memory; Phase 2 sets this from sysctl hw.memsize.
    backend: 'metal',
    coreCount: cores ? Number(cores) : undefined,
    vendor: humanizeVendor(vendorRaw),
    metalSupport: humanizeMetal(metalKey),
  };
}

function humanizeVendor(raw) {
  if (!raw) return undefined;
  // "sppci_vendor_Apple" → "Apple"
  const match = raw.match(/^sppci_vendor_(.+)$/);
  return match ? match[1] : raw;
}

function humanizeMetal(raw) {
  if (!raw) return undefined;
  // "spdisplays_metal3" → "Metal 3"
  const match = raw.match(/^spdisplays_metal(\d+)/);
  if (match) return `Metal ${match[1]}`;
  // "spdisplays_metalfamily28" — newer macOS versions emit a family code; we
  // pass it through.
  return raw;
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregator: produces a partial GpuInventory shape for macOS.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read fixture files for one macOS scenario and produce a partial
 * GpuInventory. Prefers XML/plist over plain-text when both are present,
 * matching the Phase 2 production preference.
 *
 * @param {string} fixtureDir
 * @returns {Promise<object>} GpuInventory
 */
export async function probeMac(fixtureDir) {
  const inventory = {
    detectedAt: 0,
    cuda: { available: false, devices: [], driverVersion: undefined, cudaVersion: undefined },
    rocm: { available: false, devices: [], rocmVersion: undefined },
    vulkan: { available: false, devices: [] },
    metal: { available: false, devices: [] },
    cpu: { cores: 0, ramMb: 0 },
  };

  // Prefer XML if available — typed, robust against whitespace reformats.
  const xmlPath = join(fixtureDir, 'system_profiler-xml.plist');
  if (existsSync(xmlPath)) {
    const raw = await readFile(xmlPath, 'utf8');
    const devices = parseSystemProfilerXml(raw);
    if (devices.length > 0) {
      inventory.metal.devices = devices;
      inventory.metal.available = true;
      return inventory;
    }
  }

  // Fall back to plain-text.
  const txtPath = join(fixtureDir, 'system_profiler.txt');
  if (existsSync(txtPath)) {
    const raw = await readFile(txtPath, 'utf8');
    const devices = parseSystemProfilerText(raw);
    inventory.metal.devices = devices;
    inventory.metal.available = devices.length > 0;
  }

  return inventory;
}

// ────────────────────────────────────────────────────────────────────────────
// CLI entry — `node probe-mac.mjs <fixture-dir>`
// ────────────────────────────────────────────────────────────────────────────

if (argv[1]?.endsWith('probe-mac.mjs')) {
  const fixtureDir = argv[2];
  if (!fixtureDir) {
    console.error('Usage: node probe-mac.mjs <fixture-dir>');
    process.exit(2);
  }
  probeMac(resolve(fixtureDir))
    .then((inv) => {
      console.log(JSON.stringify(inv, null, 2));
    })
    .catch((err) => {
      console.error(`probe-mac failed: ${err.message}`);
      process.exit(1);
    });
}
