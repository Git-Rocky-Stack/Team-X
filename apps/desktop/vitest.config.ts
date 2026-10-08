/**
 * Per-workspace Vitest config for `apps/desktop`.
 *
 * Why this exists: the root `vitest.config.ts` `projects` list resolves each
 * `apps/*` and `packages/*` directory as an independent Vitest
 * project, and a project's include/exclude globs are evaluated
 * against the project root — NOT the repo root. The root
 * `vitest.config.ts` is consulted for shared coverage/reporters,
 * but its `exclude` does not propagate to a project that has its
 * own `vitest.config.ts`. Without an `e2e/**` exclude scoped to
 * this workspace, Vitest picks up `e2e/smoke.spec.ts` (Playwright
 * owns it) and crashes with `test is not defined` because the file
 * imports `@playwright/test`, not Vitest.
 *
 * `resolve.alias['@']` mirrors the renderer alias from
 * `electron.vite.config.ts` (and `tsconfig.renderer.json` paths) so
 * jsdom component tests (e.g. `components/console/structural.test.tsx`,
 * opted in per-file via the `@vitest-environment jsdom` pragma) can
 * import renderer modules that use the `@/` convention. The global
 * environment stays `node` — existing source-string-audit tests are
 * untouched.
 */
import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/renderer/src'),
    },
  },
  // Renderer tests are type-checked by tsconfig.renderer-test.json, which
  // Vite's per-file tsconfig lookup does not find, so state the automatic
  // JSX runtime here rather than inherit it.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Fail any test that writes an unexpected console.error / console.warn.
    setupFiles: ['../../test/console-guard.ts'],
    exclude: ['node_modules', 'dist', 'out', 'e2e/**'],
    /**
     * Raised from the 5,000ms default on measured evidence, not on a hunch.
     *
     * A full-workspace run of this suite is ~4,100 tests across 328 files, and
     * the per-test cost scales with how loaded the machine is: the same test
     * measured 1,163ms idle and 5,280ms during a parallel sweep — a ~4.5x
     * multiplier — and timed out. That was a real flake, reproduced once in
     * five consecutive full runs.
     *
     * With the userEvent keystroke cost fixed at its source, the slowest
     * remaining test under that same load was 4,412ms ("autonomy benchmark
     * service"), leaving 12% headroom against the default. That is too thin
     * to be stable, and the next timeout would again look like a mystery
     * rather than a slow machine.
     *
     * This buys headroom; it does not weaken anything. No assertion changes,
     * and a genuinely hung test still fails — 10 seconds later.
     */
    testTimeout: 15_000,
  },
});
