import { defineProject } from 'vitest/config';

// Folder projects do not inherit the root config's test options, so each
// package registers the shared console guard itself: unexpected
// console.error / console.warn fails the test (audit 2026-10-07 P2-7).
export default defineProject({
  test: {
    setupFiles: ['../../test/console-guard.ts'],
  },
});
