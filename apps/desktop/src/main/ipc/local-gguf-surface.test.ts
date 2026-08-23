/**
 * Source-pin guard for the `localGguf.*` IPC surface.
 *
 * Every one of the 26 channels now delegates to a real service. Fourteen of
 * them — endpoint (5), hf (7) and benchmark (2) — spent three phases as
 * registered handlers that threw `"is not implemented yet (Phase 1 stub)"`,
 * which meant the preload bridge advertised a complete namespace while a third
 * of it could only fail at the moment a user reached it.
 *
 * This file reads the handler modules as source and asserts the stub thrower
 * is gone and stays gone. It is a source pin rather than a behavioural test on
 * purpose: a reintroduced stub would still *register* a handler, so a
 * channel-count assertion would pass while the channel was dead again. Same
 * technique as the renderer cluster sweeps.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const HANDLER_MODULES = [
  'local-gguf-library-handlers.ts',
  'local-gguf-runtime-handlers.ts',
  'local-gguf-endpoint-handlers.ts',
  'local-gguf-hf-handlers.ts',
  'local-gguf-benchmark-handlers.ts',
] as const;

function read(file: string): string {
  return readFileSync(join(here, file), 'utf8');
}

describe('localGguf IPC surface', () => {
  it('no longer ships the shared Phase 1 stub thrower', () => {
    expect(existsSync(join(here, 'local-gguf-not-implemented.ts'))).toBe(false);
  });

  it.each(HANDLER_MODULES)('%s does not import the stub thrower', (file) => {
    expect(read(file)).not.toContain('local-gguf-not-implemented');
  });

  it.each(HANDLER_MODULES)('%s registers no handler that throws not-implemented', (file) => {
    const source = read(file);
    // Match the thrower by call site, not by its message: the message lives in
    // the doc comments of these very files as history, and pinning on the
    // prose would fail on documentation alone.
    expect(source).not.toMatch(/\bnotImplemented\s*\(/);
  });

  it.each(HANDLER_MODULES)('%s takes its service through injected deps', (file) => {
    // Every live module registers with `(ipc, deps)`. A handler module that
    // needs no deps is a handler module that cannot be delegating anywhere.
    expect(read(file)).toMatch(/export function register\w+\(\s*ipc: IpcMain,\s*deps:/);
  });
});
