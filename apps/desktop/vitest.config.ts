/**
 * Per-workspace Vitest config for `apps/desktop`.
 *
 * Why this exists: the root `vitest.workspace.ts` resolves each
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
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'e2e/**'],
  },
});
