/**
 * Shared setup for the console jsdom suites — import FIRST in every
 * `@vitest-environment jsdom` test file in this directory.
 *
 * Registers the jest-dom matchers and an explicit `afterEach(cleanup)`:
 * the workspace vitest config runs with `globals: false`, so Testing
 * Library's automatic cleanup (which hooks a global `afterEach`) never
 * registers — without this, each render leaks into the next test's DOM
 * and same-label queries collide across tests.
 *
 * The `@vitest-environment jsdom` pragma itself cannot live here — it is
 * per-file — so each suite still carries it in its own header.
 */
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

afterEach(cleanup);

/**
 * Radix's own accessibility warnings fail the test that caused them (audit
 * 2026-10-07 P2-1). They used to scroll past in a passing run: a dialog
 * with no accessible name is a real defect for a screen-reader user, not
 * console noise.
 */
const RADIX_A11Y_WARNING =
  /`DialogContent` requires a `DialogTitle`|Missing `Description` or `aria-describedby/;
let a11yWarnings: string[] = [];

beforeEach(() => {
  a11yWarnings = [];
  for (const level of ['error', 'warn'] as const) {
    const original = console[level];
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (RADIX_A11Y_WARNING.test(text)) a11yWarnings.push(text.split('\n')[0] ?? text);
      original(...args);
    });
  }
});

afterEach(() => {
  vi.mocked(console.error).mockRestore?.();
  vi.mocked(console.warn).mockRestore?.();
  if (a11yWarnings.length > 0) {
    throw new Error(`Accessibility warning(s) during this test:\n${a11yWarnings.join('\n')}`);
  }
});
