import { defineConfig } from 'vitest/config';

// NOTE: `esbuild: false` disables Vite's `vite:esbuild` plugin so it does NOT
// walk the root `tsconfig.json` `references` graph at config-load time. Phase
// 1 tasks 1-4 lock in a `tsconfig.json` whose references point at
// `packages/*` and `apps/*` workspaces that are scaffolded later in Phase 1.
// Without this override, loading `vitest.workspace.ts` crashes with
// `TSConfckParseError: ENOENT packages/shared-types/tsconfig.json`. Disabling
// the esbuild plugin here keeps Vitest self-contained and unblocks the rest
// of Phase 1 without touching any tsconfig file. Re-enable / refine once the
// referenced packages are scaffolded in Milestone 2.
export default defineConfig({
  esbuild: false,
  test: {
    globals: false,
    environment: 'node',
    passWithNoTests: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-utils/**',
      ],
    },
  },
});
