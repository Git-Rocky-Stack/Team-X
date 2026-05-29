#!/usr/bin/env node
/**
 * Spike S2 — synthetic-fixture parser smoke test.
 *
 * Runs each platform probe against its synthetic fixture set and asserts
 * the produced GpuInventory has the expected shape:
 *   1. The expected backend's `devices` array is non-empty.
 *   2. Every emitted GpuDevice has the contract fields:
 *        - name        : non-empty string
 *        - vramMb      : finite non-negative number (0 allowed for Vulkan
 *                        --summary which lacks heap sizes, and for Apple
 *                        Silicon which has unified memory — see writeup
 *                        Findings F1, F4)
 *        - backend     : one of 'cuda' | 'rocm' | 'vulkan' | 'metal'
 *   3. Cross-vendor: e.g. Windows-NVIDIA fixture set produces both a CUDA
 *      device AND a Vulkan device with the same physical GPU name.
 *
 * Exit code 0 on all-pass, 1 on any-fail. Prints a results table.
 *
 * This is NOT a unit test of the parser's correctness against every edge
 * case — that's Phase 2's `gpu-probe.test.ts`. This is a sanity check that
 * the spike scaffolding stays green when Rocky's real captures replace the
 * synthetic fixtures.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeLinux } from './probe-linux.mjs';
import { probeMac } from './probe-mac.mjs';
import { probeWindows } from './probe-windows.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const syntheticDir = resolve(repoRoot, 'docs', 'spikes', 'S2-fixtures', '_synthetic');

const VALID_BACKENDS = new Set(['cuda', 'rocm', 'vulkan', 'metal']);

/**
 * @typedef {{
 *   label: string,
 *   fixtureDir: string,
 *   probe: (dir: string) => Promise<object>,
 *   expectBackends: Array<'cuda' | 'rocm' | 'vulkan' | 'metal'>,
 *   minDevicesPerBackend: Record<string, number>,
 * }} Case
 */

/** @type {Case[]} */
const cases = [
  {
    label: 'windows-nvidia',
    fixtureDir: resolve(syntheticDir, 'windows-nvidia'),
    probe: probeWindows,
    expectBackends: ['cuda', 'vulkan'],
    minDevicesPerBackend: { cuda: 2, vulkan: 1 },
  },
  {
    label: 'linux-nvidia',
    fixtureDir: resolve(syntheticDir, 'linux-nvidia'),
    probe: probeLinux,
    expectBackends: ['cuda', 'vulkan'],
    minDevicesPerBackend: { cuda: 2, vulkan: 1 },
  },
  {
    label: 'linux-amd',
    fixtureDir: resolve(syntheticDir, 'linux-amd'),
    probe: probeLinux,
    expectBackends: ['rocm'],
    minDevicesPerBackend: { rocm: 1 },
  },
  {
    label: 'macos-arm64',
    fixtureDir: resolve(syntheticDir, 'macos-arm64'),
    probe: probeMac,
    expectBackends: ['metal'],
    minDevicesPerBackend: { metal: 1 },
  },
];

/**
 * Validate one case's inventory against expectations.
 *
 * @param {Case} c
 * @param {object} inv
 * @returns {{ passed: boolean, failures: string[], summary: string }}
 */
function validate(c, inv) {
  const failures = [];

  for (const backend of c.expectBackends) {
    const slot = inv[backend];
    if (!slot) {
      failures.push(`missing inventory slot for backend '${backend}'`);
      continue;
    }
    if (!slot.available) {
      failures.push(`backend '${backend}' marked NOT available`);
    }
    const min = c.minDevicesPerBackend[backend] ?? 1;
    if (slot.devices.length < min) {
      failures.push(`backend '${backend}' expected ≥${min} device(s), got ${slot.devices.length}`);
    }

    for (let i = 0; i < slot.devices.length; i += 1) {
      const d = slot.devices[i];
      if (!d.name || typeof d.name !== 'string') {
        failures.push(`${backend}.devices[${i}].name is not a non-empty string`);
      }
      if (!Number.isFinite(d.vramMb) || d.vramMb < 0) {
        failures.push(
          `${backend}.devices[${i}].vramMb is not a finite non-negative number (got ${d.vramMb})`,
        );
      }
      if (!VALID_BACKENDS.has(d.backend)) {
        failures.push(
          `${backend}.devices[${i}].backend is not a valid GpuBackend (got '${d.backend}')`,
        );
      }
    }
  }

  // Spec § 12.1 contract: GpuInventory has all 4 backend slots + cpu slot
  // even when only one backend has devices. Validate the shape isn't
  // accidentally missing a slot.
  for (const requiredSlot of ['cuda', 'rocm', 'vulkan', 'metal', 'cpu']) {
    if (!Object.prototype.hasOwnProperty.call(inv, requiredSlot)) {
      failures.push(`inventory missing required slot '${requiredSlot}'`);
    }
  }

  const summary = c.expectBackends.map((b) => `${b}=${inv[b]?.devices.length ?? 0}`).join(' ');

  return {
    passed: failures.length === 0,
    failures,
    summary,
  };
}

/** ANSI green / red helpers (won't render on Windows cmd.exe pre-Windows 10, but PowerShell handles them). */
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  const results = [];
  for (const c of cases) {
    let inv;
    let runError;
    try {
      inv = await c.probe(c.fixtureDir);
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
    }
    if (runError) {
      results.push({
        label: c.label,
        passed: false,
        failures: [`probe threw: ${runError}`],
        summary: '(probe threw)',
      });
      continue;
    }
    results.push({ label: c.label, ...validate(c, inv) });
  }

  // Print results table.
  const labelW = Math.max(...results.map((r) => r.label.length), 14);
  console.log('');
  console.log(`${'Case'.padEnd(labelW)}  ${'Status'.padEnd(7)}  Summary`);
  console.log(`${'-'.repeat(labelW)}  ${'-'.repeat(7)}  ${'-'.repeat(40)}`);

  let anyFailed = false;
  for (const r of results) {
    const tag = r.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${r.label.padEnd(labelW)}  ${tag.padEnd(16)}  ${r.summary}`);
    if (!r.passed) {
      anyFailed = true;
      for (const f of r.failures) {
        console.log(`${DIM}  └─${RESET} ${f}`);
      }
    }
  }
  console.log('');

  if (anyFailed) {
    console.log(`${RED}${results.filter((r) => !r.passed).length} case(s) failed.${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}All ${results.length} cases passed.${RESET}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`smoke-test fatal: ${err.message}`);
  process.exit(2);
});
