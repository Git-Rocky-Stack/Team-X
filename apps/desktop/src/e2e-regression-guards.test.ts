/**
 * M35 T9 — Regression hardening for the E2E spec suite.
 *
 * Two mechanical guards that prevent the Playwright specs under
 * `apps/desktop/e2e/` from silently regressing in two well-known
 * failure modes:
 *
 *   1. Flaky-test audit — `page.waitForTimeout(N)` (and the equivalent
 *      `window.waitForTimeout(N)` / `frame.waitForTimeout(N)`) with
 *      `N > 100` is the #1 source of flake in this suite. It's a
 *      fixed-duration sleep that does not wait for the actual state
 *      it's ostensibly pacing against; fast CI machines race past it
 *      and slow ones time out. Prefer `expect.poll`, `expect(…).toPass`,
 *      or `locator.waitFor` — they wait for the real state transition
 *      and terminate early. 100 ms is the negotiated floor (drag-drop
 *      settling latency legitimately sits in the 50–100 ms range);
 *      anything beyond that should have a comment explaining why, but
 *      this guard just bans it outright to force the explicit fix.
 *
 *   2. Stable-selector sweep — the M30 `data-step-kind`, M33
 *      `data-copilot-insight-id`, and M34 `data-copilot-toolbar-toggle`
 *      convention locks E2E assertions against attributes that don't
 *      move under i18n, styling, or copy edits. Every spec must have
 *      at least one `[data-*]` attribute locator. Text-content matchers
 *      (`getByText`, `getByRole({ name })`) are fine as secondary
 *      matchers — but each spec needs one stable anchor.
 *
 * Placement rationale: this test lives under `apps/desktop/src/` (not
 * `apps/desktop/e2e/`) because the per-workspace
 * `apps/desktop/vitest.config.ts` explicitly excludes `e2e/**` — the
 * root workspace config gives Playwright ownership of that directory
 * and Vitest owns everything under `src/`. A regression-guards test
 * placed under `e2e/` would simply never run, silently neutering the
 * guard. Keep it here.
 *
 * Why pure Node + fs (no jsdom, no React): same source-string-audit
 * pattern as M35 T3 (audit-event-chip-helpers) and M35 T8 (top-bar
 * freeze). The vitest environment is `node`; all we're doing is
 * regex-scanning on-disk files. No DOM, no renderer.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// `apps/desktop/src/e2e-regression-guards.test.ts` → `apps/desktop/e2e/`
const E2E_DIR = join(HERE, '..', 'e2e');

function listE2eSpecs(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort();
}

function readSpec(filename: string): string {
  return readFileSync(join(E2E_DIR, filename), 'utf8');
}

/**
 * Matches every `.waitForTimeout(N)` invocation regardless of receiver
 * (page, window, frame, popup, etc.). Capturing group 1 is the
 * numeric milliseconds argument.
 *
 * Deliberately does NOT try to identify `setTimeout` calls — every
 * spec in this suite uses `setTimeout(resolve, 5000)` inside an
 * `afterEach` `Promise.race` shutdown guard, and those are not
 * synchronization primitives but upper-bound safety nets. Flagging
 * them would require semantic analysis; flagging `waitForTimeout`
 * alone catches the real flake vector without false positives.
 */
const WAIT_FOR_TIMEOUT_RE = /\.waitForTimeout\s*\(\s*(\d+)/g;

/**
 * Matches any `[data-<kebab-case-name>...` attribute selector. Kebab
 * case is the HTML attribute convention; lowercase-first-letter with
 * digits and hyphens allowed after (e.g. `[data-copilot-insight-id]`,
 * `[data-step-kind="answer"]`, `[data-event-type=...]`).
 */
const DATA_ATTR_SELECTOR_RE = /\[data-[a-z][a-z0-9-]*/;

/**
 * The 100 ms floor: drag-drop settling, CSS transition end, and
 * React-reconciliation timing legitimately sit at or below this
 * threshold in Playwright test bodies. Anything above it should be
 * a real state wait (`expect.poll`, `toPass`, `locator.waitFor`) so
 * the test fails fast rather than sleeping past a race.
 */
const FLAKE_FLOOR_MS = 100;

describe('E2E regression guards (M35 T9)', () => {
  test('no spec uses `waitForTimeout(N)` with N > 100 ms', () => {
    const offenders: Array<{ file: string; ms: number }> = [];
    for (const file of listE2eSpecs()) {
      const src = readSpec(file);
      for (const match of src.matchAll(WAIT_FOR_TIMEOUT_RE)) {
        const ms = Number.parseInt(match[1] ?? '0', 10);
        if (ms > FLAKE_FLOOR_MS) offenders.push({ file, ms });
      }
    }
    expect(
      offenders,
      `E2E specs with .waitForTimeout(N > ${FLAKE_FLOOR_MS}ms) — replace with expect.poll / expect(...).toPass / locator.waitFor for deterministic waits: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  test('every spec uses at least one [data-*] attribute locator', () => {
    const specs = listE2eSpecs();
    expect(specs.length, 'e2e/ must contain at least one .spec.ts file').toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of specs) {
      const src = readSpec(file);
      if (!DATA_ATTR_SELECTOR_RE.test(src)) offenders.push(file);
    }
    expect(
      offenders,
      `E2E specs missing a [data-*] attribute locator — add a stable-selector anchor (e.g. [data-copilot-toolbar-toggle], [data-step-kind], [data-copilot-insight-id]) per the M30 / M33 / M34 convention: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
});
