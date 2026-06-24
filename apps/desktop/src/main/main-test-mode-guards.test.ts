/**
 * Source guards for the main-entry E2E noise suppression (Phase 4a).
 *
 * `main/index.ts` silences the Chromium/Electron "Insecure
 * Content-Security-Policy" security advisory — pure stderr noise under the
 * Playwright harness — strictly behind `NODE_ENV === 'test'`, so `pnpm dev`
 * and packaged production builds are unaffected.
 *
 * The GPU command-buffer teardown noise is deliberately NOT silenced in
 * main JS: an in-process `app.disableHardwareAcceleration()` runs too late
 * (Chromium commits to spawning the GPU process during argv bootstrap,
 * before the main script loads), so on a GPU-less host the spawn still
 * crashes. The GPU-disable switches live on the Playwright launch argv
 * instead — see `e2e/_launch-helpers.ts`. These guards lock both halves of
 * that design in place.
 *
 * Pure source-string audit (same node-fs pattern as
 * `e2e-regression-guards`): importing `index.ts` would boot the whole main
 * process, so we scan it (and the launch helper) on disk instead.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_SRC = readFileSync(join(HERE, 'index.ts'), 'utf8');
const LAUNCH_HELPERS_SRC = readFileSync(join(HERE, '../../e2e/_launch-helpers.ts'), 'utf8');

describe('main entry test-mode noise suppression', () => {
  it('gates the Electron security-warning suppression behind NODE_ENV=test', () => {
    const secIdx = INDEX_SRC.indexOf("ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'");
    expect(
      secIdx,
      'main/index.ts must set ELECTRON_DISABLE_SECURITY_WARNINGS to suppress the dev CSP advisory in test mode',
    ).toBeGreaterThan(-1);

    // The opening guard sits immediately above the assignment.
    const precedingGuard = INDEX_SRC.slice(Math.max(0, secIdx - 200), secIdx);
    expect(
      precedingGuard,
      "the security-warning suppression must be gated behind `process.env.NODE_ENV === 'test'`",
    ).toContain("process.env.NODE_ENV === 'test'");
  });

  it('does NOT disable hardware acceleration in main JS (too-late timing — handled at launch argv)', () => {
    // app.disableHardwareAcceleration() runs after Chromium has already
    // committed to spawning the GPU process, so it cannot stop a GPU-less
    // host from crashing on that spawn. The fix lives on the launch argv
    // (e2e/_launch-helpers.ts). Scan only the test-mode block BODY (not the
    // explanatory comment above it, which may name the API) so we assert the
    // too-late guard is not re-introduced as live code.
    const secIdx = INDEX_SRC.indexOf("ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'");
    const blockStart = INDEX_SRC.lastIndexOf("process.env.NODE_ENV === 'test'", secIdx);
    const blockEnd = INDEX_SRC.indexOf('}', secIdx);
    const blockBody = INDEX_SRC.slice(blockStart, blockEnd);
    expect(
      blockBody,
      'GPU disabling must not run via app.disableHardwareAcceleration() in main JS — pass --disable-gpu on the launch argv instead',
    ).not.toContain('disableHardwareAcceleration');
  });
});

describe('e2e launch GPU-disable switches (getCiLaunchArgs)', () => {
  it('passes --disable-gpu and --disable-software-rasterizer unconditionally', () => {
    const gpuIdx = LAUNCH_HELPERS_SRC.indexOf("'--disable-gpu'");
    const rasterIdx = LAUNCH_HELPERS_SRC.indexOf("'--disable-software-rasterizer'");
    const gateIdx = LAUNCH_HELPERS_SRC.indexOf("if (process.platform === 'linux'");

    expect(gpuIdx, '--disable-gpu must be a launch switch').toBeGreaterThan(-1);
    expect(rasterIdx, '--disable-software-rasterizer must be a launch switch').toBeGreaterThan(-1);
    expect(gateIdx, 'the Linux-CI tier gate must still exist').toBeGreaterThan(-1);

    // The GPU switches must be declared BEFORE (outside) the Linux-CI gate,
    // so they apply on Windows and other GPU-less hosts too — the exact gap a
    // Stage-3 review caught on a GPU-less Windows host.
    expect(
      gpuIdx,
      '--disable-gpu must be unconditional (declared before the linux/CI gate)',
    ).toBeLessThan(gateIdx);
    expect(rasterIdx).toBeLessThan(gateIdx);
  });

  it('keeps --no-sandbox gated to Linux CI', () => {
    const sandboxIdx = LAUNCH_HELPERS_SRC.indexOf("'--no-sandbox'");
    const gateIdx = LAUNCH_HELPERS_SRC.indexOf("if (process.platform === 'linux'");

    expect(sandboxIdx, '--no-sandbox must remain a launch switch').toBeGreaterThan(-1);
    // --no-sandbox is Linux-CI-only; it must sit AFTER the gate.
    expect(
      sandboxIdx,
      '--no-sandbox must stay gated behind linux + CI (declared after the gate)',
    ).toBeGreaterThan(gateIdx);
  });
});
