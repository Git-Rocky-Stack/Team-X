import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 2 exits non-zero on empty test suites by default; remove this flag
    // once test files exist in every workspace package.
    passWithNoTests: true,
    globals: false,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', '.idea', '.git', '.cache'],
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
