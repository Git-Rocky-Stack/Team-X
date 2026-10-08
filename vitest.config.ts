import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each workspace package is its own project, resolved against its own root.
    projects: ['packages/*', 'apps/*'],
    // shared-types has no test files; without this the run exits non-zero.
    passWithNoTests: true,
    globals: false,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // `e2e/**` is excluded because Playwright owns those specs — they
    // import `@playwright/test` and would crash Vitest with a missing
    // global `test` reference. The Playwright runner picks them up via
    // `playwright.config.ts` instead. Both relative and `**/e2e/**`
    // patterns are listed because the workspace projects resolve
    // includes/excludes against their own root, so a single `**`
    // pattern is not enough for both root + workspace scopes.
    exclude: [
      'node_modules',
      'dist',
      'out',
      '.idea',
      '.git',
      '.cache',
      '**/e2e/**',
      'e2e/**',
      'apps/desktop/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-utils/**',
      ],
    },
  },
});
