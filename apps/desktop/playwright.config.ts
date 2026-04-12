/**
 * Playwright configuration for the Team-X desktop E2E smoke test.
 *
 * Scope: one full-boot smoke test that launches a real Electron
 * instance against the built `out/main/index.js`, drives the UI
 * through a complete chat round-trip, and verifies persistence. The
 * orchestrator runs the canned `test-mode` provider stream (gated on
 * `NODE_ENV=test`) so the test has zero network dependency on Ollama
 * or Anthropic — CI on any runner can execute it.
 *
 * Execution model:
 *   - `fullyParallel: false` + `workers: 1` — only one Electron
 *     instance can run at a time per host; Playwright must not try
 *     to spawn parallel apps.
 *   - Each test gets its own `userData` directory (see
 *     `e2e/smoke.spec.ts`) via `--user-data-dir=<tmp>` so runs never
 *     collide with Rocky's real dev DB, and tests are independent.
 *
 * CI notes:
 *   - On Linux, wrap the run in `xvfb-run` so Electron has a display.
 *   - Playwright's HTML reporter is disabled in CI to keep the job
 *     output small; the `list` reporter is enough for pass/fail
 *     signal. Local runs use `list` + `html` so Rocky can open the
 *     trace viewer on a failure.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  // A single E2E smoke takes ~10-15s locally (Electron cold-start
  // dominates) — 90s gives us generous headroom for slower CI runners
  // and retries without making local failures take forever.
  timeout: 90_000,
  expect: {
    // Default 5s is too tight for the full chat round-trip (IPC →
    // orchestrator → canned stream → event bus → renderer). The
    // round-trip itself usually completes in well under a second, but
    // the Electron boot + renderer hydration eats most of the budget
    // before the first `toBeVisible` even runs.
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    // Capture a trace on first retry (CI) or on failure (local) so
    // Rocky can open the Playwright trace viewer and inspect the
    // exact renderer state at the point of failure.
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
  },
  // Absolute paths resolved from this config file so the runner
  // works regardless of where pnpm invokes it from.
  outputDir: `${__dirname}/test-results`,
});
