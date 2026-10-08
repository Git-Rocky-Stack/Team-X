/**
 * Unexpected console output fails the test (audit 2026-10-07 P2-7).
 *
 * A passing run used to print stack traces and warnings: MCP connection
 * failures, keychain cleanup, backup fallbacks, audit-bus fallbacks. Some
 * were expected, some were not, and nobody could tell which, so a real
 * regression could scroll past in green. Now any `console.error` or
 * `console.warn` a test did not ask for fails that test, naming the call.
 *
 * A test that exercises a path which is supposed to log captures it, and
 * asserts it when the message matters:
 *
 *   const error = vi.spyOn(console, 'error').mockImplementation(() => {});
 *   ...
 *   expect(error).toHaveBeenCalledWith(expect.stringContaining('[mcp]'), expect.any(Error));
 *
 * Every workspace project registers this file through `setupFiles` in its
 * own vitest.config.ts: a folder project does not inherit the root config's
 * test options, so a root-level registration would reach none of them.
 */
import { format } from 'node:util';

import { afterEach, beforeEach } from 'vitest';

const original = { error: console.error, warn: console.warn };
let unexpected: string[] = [];

beforeEach(() => {
  unexpected = [];
  console.error = (...args: unknown[]) => {
    unexpected.push(`console.error: ${format(...args).split('\n')[0]}`);
  };
  console.warn = (...args: unknown[]) => {
    unexpected.push(`console.warn: ${format(...args).split('\n')[0]}`);
  };
});

afterEach(() => {
  console.error = original.error;
  console.warn = original.warn;
  if (unexpected.length > 0) {
    const calls = unexpected;
    unexpected = [];
    throw new Error(
      `Unexpected console output (capture it with vi.spyOn(console, …).mockImplementation and assert it if it is expected):\n  ${calls.join('\n  ')}`,
    );
  }
});
