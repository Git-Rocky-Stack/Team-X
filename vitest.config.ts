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
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      // Production source only (audit 2026-10-07 P1-6): counting test files
      // as covered input inflated every total. Every file under these roots
      // is measured, loaded by a test or not, so untested code shows as 0%.
      include: ['apps/desktop/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/test-utils/**',
        '**/__fixtures__/**',
        'apps/desktop/e2e/**',
        // Pure type declarations and generated SQL carry no executable lines.
        'packages/shared-types/src/**',
      ],
      // Ratchet, not aspiration: each floor sits just under what the suite
      // measured on 2026-10-08, so coverage cannot quietly fall. Raise a
      // floor when its module's coverage rises; never lower one to land a
      // change. Trust-boundary modules carry their own, higher floors.
      thresholds: {
        lines: 58,
        statements: 56,
        functions: 47,
        branches: 47,
        'apps/desktop/src/main/security/**': {
          lines: 98,
          statements: 98,
          functions: 98,
          branches: 95,
        },
        'apps/desktop/src/main/services/local-gguf/local-network*.ts': {
          lines: 90,
          statements: 85,
          functions: 80,
          branches: 80,
        },
        'apps/desktop/src/main/db/**': { lines: 84, statements: 82, functions: 76, branches: 78 },
        'apps/desktop/src/main/orchestrator/**': {
          lines: 84,
          statements: 82,
          functions: 82,
          branches: 68,
        },
        'apps/desktop/src/main/services/**': {
          lines: 81,
          statements: 79,
          functions: 84,
          branches: 67,
        },
        'packages/intelligence/src/rag/**': {
          lines: 74,
          statements: 72,
          functions: 68,
          branches: 67,
        },
        'packages/role-schema/src/**': { lines: 95, statements: 94, functions: 98, branches: 87 },
        'packages/local-gguf-runtime/src/**': {
          lines: 92,
          statements: 89,
          functions: 90,
          branches: 80,
        },
        'packages/provider-router/src/**': {
          lines: 83,
          statements: 82,
          functions: 84,
          branches: 70,
        },
      },
    },
  },
});
