/**
 * Source guard for the main-entry E2E noise suppression (Phase 4a).
 *
 * `main/index.ts` silences two Chromium/Electron dev-diagnostics that
 * are pure stderr noise under the Playwright harness — the
 * "Insecure Content-Security-Policy" security advisory and the GPU
 * command-buffer teardown errors. Both MUST stay gated behind
 * `NODE_ENV === 'test'` so `pnpm dev` and packaged production builds are
 * unaffected, and the GPU disable MUST run at module scope (before the
 * Electron `ready` event) to take effect.
 *
 * Pure source-string audit (same node-fs pattern as
 * `e2e-regression-guards`): importing `index.ts` would boot the whole
 * main process, so we scan it on disk instead. The assertions anchor on
 * the unique `ELECTRON_DISABLE_SECURITY_WARNINGS` assignment to stay
 * robust against the file's other `NODE_ENV === 'test'` provider-mode
 * branches.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_SRC = readFileSync(join(HERE, 'index.ts'), 'utf8');

describe('main entry test-mode noise suppression', () => {
  it('gates the Electron security-warning + GPU suppressions behind NODE_ENV=test', () => {
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

    // The GPU disable lives in the same test-only block, just after it.
    const following = INDEX_SRC.slice(secIdx, secIdx + 200);
    expect(
      following,
      'app.disableHardwareAcceleration() must run inside the same NODE_ENV=test block',
    ).toContain('app.disableHardwareAcceleration()');
  });

  it('does not disable hardware acceleration unconditionally', () => {
    // Guard against a future refactor pulling the call out of the
    // test-only block (which would regress dev/production GPU rendering).
    const occurrences = INDEX_SRC.split('app.disableHardwareAcceleration()').length - 1;
    expect(occurrences, 'disableHardwareAcceleration() should appear exactly once').toBe(1);
  });
});
