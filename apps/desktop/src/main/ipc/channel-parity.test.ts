/**
 * Every advertised IPC channel must actually be registered, and every
 * registered channel must actually be torn down.
 *
 * The bridge is described in three places that can drift apart silently:
 *
 *   1. `preload/api.ts`      — CHANNELS, what the renderer is allowed to call
 *   2. `ipc/register.ts`     — REQUEST_CHANNELS, what `unregisterIpc()` tears down
 *   3. `<ipc>.handle(...)`   — the handler that actually answers
 *
 * Nothing checked that these agree. A channel added to the preload table but
 * never registered compiles, typechecks, passes every unit test, and fails only
 * when a user clicks the control that calls it — the exact shape of the fourteen
 * `localGguf.*` channels that advertised a complete namespace while a third of
 * it could only throw.
 *
 * A channel in REQUEST_CHANNELS but never handled is the mirror failure:
 * shutdown removes a listener that was never there, and the renderer's invoke
 * rejects with "no handler registered" instead of a real error.
 *
 * Read as source rather than by importing: registration is spread across
 * `index.ts`, whose handlers cannot be mounted without booting the whole main
 * process. Registration is also not confined to `ipcMain` — `ipc/system-dialogs.ts`
 * registers through an injected `IpcMain` parameter named `ipc` — so the
 * matcher accepts any `<identifier>.handle('channel'` and scans the whole
 * `src/main` tree.
 *
 * The complementary check lives in `teardown.test.ts`, which proves the same
 * invariant behaviourally: it mounts the real registrars against a recording
 * `IpcMain` double and asserts the real teardown closure removes what it
 * mounted. Source scan catches the inline `index.ts` registrations that cannot
 * be replayed; the behavioural test catches everything modular. Neither
 * subsumes the other.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOCAL_GGUF_BENCHMARK_CHANNELS } from './local-gguf-benchmark-handlers.js';
import { LOCAL_GGUF_ENDPOINT_CHANNELS } from './local-gguf-endpoint-handlers.js';
import { LOCAL_GGUF_HF_CHANNELS } from './local-gguf-hf-handlers.js';
import { LOCAL_GGUF_LIBRARY_CHANNELS } from './local-gguf-library-handlers.js';
import { LOCAL_GGUF_RUNTIME_CHANNELS } from './local-gguf-runtime-handlers.js';
import { SYSTEM_DIALOG_CHANNELS } from './system-dialogs.js';

const here = dirname(fileURLToPath(import.meta.url));
const mainDir = join(here, '..');
const registerSrc = readFileSync(join(here, 'register.ts'), 'utf8');
const preloadSrc = readFileSync(join(here, '..', '..', 'preload', 'api.ts'), 'utf8');

/**
 * Drop comments before matching quoted strings.
 *
 * Without this the quote matcher pairs an apostrophe in prose ("the module's
 * own tuple") with the next real quote, silently shifting every subsequent
 * match by one and turning the extracted channel list into garbage that still
 * type-checks and still produces a green-looking array. That is not
 * hypothetical: it happened while closing the teardown gap this file pins, and
 * the only symptom was a parity failure listing 197 nonexistent "channels".
 * The "extracts channel-shaped strings" test below is the assertion that names
 * that corruption directly instead of leaving it to be inferred.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Spreads in the REQUEST_CHANNELS literal, resolved to the tuples they name.
 * `register.ts` composes the list from each sibling registrar's own exported
 * constant so the teardown list cannot drift from what that registrar mounts.
 */
const SPREADABLE: Record<string, readonly string[]> = {
  SYSTEM_DIALOG_CHANNELS,
  LOCAL_GGUF_LIBRARY_CHANNELS,
  LOCAL_GGUF_RUNTIME_CHANNELS,
  LOCAL_GGUF_HF_CHANNELS,
  LOCAL_GGUF_BENCHMARK_CHANNELS,
  LOCAL_GGUF_ENDPOINT_CHANNELS,
};

function mainSources(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(readFileSync(full, 'utf8'));
      }
    }
  };
  walk(mainDir);
  return out.join('\n');
}

const mainSrc = mainSources();

/** The REQUEST_CHANNELS array literal in register.ts, spreads resolved. */
function requestChannels(): string[] {
  const start = registerSrc.indexOf('const REQUEST_CHANNELS = [');
  expect(start, 'REQUEST_CHANNELS declaration not found in register.ts').toBeGreaterThan(-1);
  const end = registerSrc.indexOf('] as const;', start);
  expect(end, 'REQUEST_CHANNELS is not terminated by `] as const;`').toBeGreaterThan(start);
  const block = stripComments(registerSrc.slice(start, end));

  const literals = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const spread = [...block.matchAll(/\.\.\.([A-Z][A-Z0-9_]*)/g)].flatMap((m) => {
    const tuple = SPREADABLE[m[1]];
    expect(tuple, `REQUEST_CHANNELS spreads ${m[1]}, which this test cannot resolve`).toBeDefined();
    return [...(tuple ?? [])];
  });
  return [...spread, ...literals];
}

/** Channel string values from the preload CHANNELS table. */
function preloadChannels(): string[] {
  const start = preloadSrc.indexOf('const CHANNELS = {');
  expect(start, 'CHANNELS declaration not found in preload/api.ts').toBeGreaterThan(-1);
  const end = preloadSrc.indexOf('} as const;', start);
  expect(end, 'CHANNELS is not terminated by `} as const;`').toBeGreaterThan(start);
  const block = stripComments(preloadSrc.slice(start, end));
  return [...block.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Channels passed to any `<x>.handle('channel', ...)` anywhere under src/main. */
function registeredChannels(): Set<string> {
  return new Set([...mainSrc.matchAll(/\b\w+\.handle\(\s*\n?\s*'([^']+)'/g)].map((m) => m[1]));
}

/** `namespace.action` — what every channel in this app is named. */
const CHANNEL_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/;

describe('IPC channel parity', () => {
  it('extracts channel-shaped strings, not corrupted prose', () => {
    // Guards the extractors themselves. Every assertion below is only as
    // trustworthy as the lists these produce, and a mis-paired quote yields
    // multi-line fragments that would quietly change what the other tests mean.
    for (const [label, list] of [
      ['REQUEST_CHANNELS', requestChannels()],
      ['preload CHANNELS', preloadChannels()],
      ['registered handlers', [...registeredChannels()]],
    ] as const) {
      const malformed = list.filter((c) => !CHANNEL_SHAPE.test(c));
      expect(malformed, `${label} extraction produced non-channel strings`).toEqual([]);
      expect(list.length, `${label} extraction produced nothing`).toBeGreaterThan(50);
    }
  });

  it('registers a handler for every channel in REQUEST_CHANNELS', () => {
    const handled = registeredChannels();
    const missing = requestChannels().filter((c) => !handled.has(c));
    expect(missing, 'declared for teardown but nothing answers them').toEqual([]);
  });

  /**
   * Push channels, not request channels. `events.dashboard` is main → renderer:
   * the main process calls `webContents.send` and the renderer subscribes with
   * `on`. There is no `handle` to find, and requiring one would be wrong.
   */
  const PUSH_ONLY = new Set(['events.dashboard']);

  it('backs every request-shaped preload channel with a real handler', () => {
    const handled = registeredChannels();
    const dead = preloadChannels().filter((c) => !PUSH_ONLY.has(c) && !handled.has(c));
    expect(dead, 'advertised to the renderer but nothing answers them').toEqual([]);
  });

  /**
   * `unregisterIpc()` iterates REQUEST_CHANNELS and calls `removeHandler` on
   * each, so a channel absent from that list is never torn down.
   *
   * This previously carried a 38-entry exemption list: `system.selectGgufFile`
   * and the 36 `localGguf.*` channels registered from `index.ts` and were never
   * added, plus `events.dashboard`, which is push-only and never belonged.
   * The gap is closed — `register.ts` now spreads each registrar's exported
   * tuple into REQUEST_CHANNELS instead of restating the strings — so the
   * exemption list is gone and this assertion is unconditional.
   */
  it('declares every renderer-callable channel for teardown', () => {
    const declared = new Set(requestChannels());
    const leaked = preloadChannels().filter((c) => !PUSH_ONLY.has(c) && !declared.has(c));
    expect(leaked, 'callable by the renderer but unregisterIpc() will leak them').toEqual([]);
  });

  it('declares the channels the sibling registrar modules mount', () => {
    // Named explicitly: these are the ones the exemption list used to cover,
    // so a partial revert of the spread-composition fix fails here by name
    // rather than only as a count.
    const declared = new Set(requestChannels());
    for (const channel of [
      'system.selectDirectory',
      'system.selectGgufFile',
      'localGguf.library.list',
      'localGguf.runtime.gpuInventory',
      'localGguf.pool.load',
      'localGguf.hf.search',
      'localGguf.benchmark.run',
      'localGguf.endpoint.list',
    ]) {
      expect(declared.has(channel), `${channel} missing from REQUEST_CHANNELS`).toBe(true);
    }
  });

  it('lists no channel twice for teardown', () => {
    // A literal left behind after its tuple was spread in would remove the
    // same handler twice. Harmless today, but it is the signature of a
    // half-applied edit and it hides which source is authoritative.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const channel of requestChannels()) {
      if (seen.has(channel)) duplicates.push(channel);
      else seen.add(channel);
    }
    expect(duplicates, 'REQUEST_CHANNELS lists these more than once').toEqual([]);
  });

  it('covers the channels added for the private-operator and paperclip bridges', () => {
    // Named explicitly so this fails loudly if the wiring done for those two
    // previously-orphaned services is ever partially reverted.
    const handled = registeredChannels();
    const declared = new Set(requestChannels());
    for (const channel of [
      'privateOperator.plan',
      'privateOperator.snapshot',
      'paperclip.preview',
    ]) {
      expect(handled.has(channel), `${channel} has no registered handler`).toBe(true);
      expect(declared.has(channel), `${channel} missing from REQUEST_CHANNELS`).toBe(true);
    }
  });
});
