/**
 * Teardown completeness — every handler the app mounts must come back off.
 *
 * `registerIpcHandlers` returns an `unregister` closure that `will-quit`
 * invokes (index.ts:3561). That closure iterates `REQUEST_CHANNELS` and calls
 * `ipcMain.removeHandler` on each entry, so a channel missing from that list
 * is never torn down. Electron throws `Attempted to register a second handler
 * for '<channel>'` on a duplicate `handle`, which makes a leaked mapping a
 * live crash the moment anything re-registers.
 *
 * The sibling parity test reasons about this by reading source text. This one
 * does not: it mounts the real registrars against a recording `IpcMain`
 * double, runs the real teardown closure, and compares the two sets. Mocking
 * `electron` is enough to load `register.ts` under Vitest — the module only
 * needs `ipcMain` and `BrowserWindow` to exist.
 *
 * Scope: the modular registrars (`register.ts` plus the six sibling modules
 * that export their own channel tuple). The handlers `index.ts` mounts inline
 * cannot be replayed without booting the whole main process; `channel-parity`
 * covers those by source scan.
 */

import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { EventBus } from '../orchestrator/event-bus.js';

import type { IpcHandlers } from './handlers.js';
import { registerLocalGgufBenchmarkHandlers } from './local-gguf-benchmark-handlers.js';
import { registerLocalGgufEndpointHandlers } from './local-gguf-endpoint-handlers.js';
import { registerLocalGgufHfHandlers } from './local-gguf-hf-handlers.js';
import { registerLocalGgufLibraryHandlers } from './local-gguf-library-handlers.js';
import { registerLocalGgufRuntimeHandlers } from './local-gguf-runtime-handlers.js';
import { registerIpcHandlers } from './register.js';
import { registerSystemDialogHandlers } from './system-dialogs.js';

// Vitest hoists `vi.mock` above the imports above, so `register.ts` sees this
// factory rather than the real module. Without it the import throws: outside an
// Electron runtime, `require('electron')` yields the path to the binary and
// `ipcMain` is undefined.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));

/** Records what was mounted and what was removed. */
function recordingIpcMain(): {
  ipc: IpcMain;
  handled: string[];
  removed: string[];
} {
  const handled: string[] = [];
  const removed: string[] = [];
  const ipc = {
    handle(channel: string) {
      // Electron throws on a duplicate registration; mirror that so the
      // double cannot hide a double-mount the real runtime would reject.
      if (handled.includes(channel)) {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      }
      handled.push(channel);
    },
    removeHandler(channel: string) {
      removed.push(channel);
    },
  } as unknown as IpcMain;
  return { ipc, handled, removed };
}

/**
 * Every registrar dereferences its deps only inside the handler callbacks it
 * mounts, never at registration time, so a proxy that answers any property
 * with a no-op is a sufficient stand-in for the real service graph.
 */
function anyDeps<T>(): T {
  return new Proxy(
    {},
    {
      get: () => () => undefined,
    },
  ) as T;
}

const stubBus: EventBus = {
  subscribe: () => () => undefined,
} as unknown as EventBus;

/** Entries appearing more than once, in the order the repeats occur. */
function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeats: string[] = [];
  for (const value of values) {
    if (seen.has(value)) repeats.push(value);
    else seen.add(value);
  }
  return repeats;
}

/**
 * Mount everything the composition root mounts through a module boundary,
 * in the same order index.ts does, then hand back the teardown closure.
 */
function registerEverything(ipc: IpcMain): () => void {
  const unregister = registerIpcHandlers(anyDeps<IpcHandlers>(), stubBus);
  registerSystemDialogHandlers(ipc, anyDeps());
  registerLocalGgufLibraryHandlers(ipc, anyDeps());
  registerLocalGgufRuntimeHandlers(ipc, anyDeps());
  registerLocalGgufHfHandlers(ipc, anyDeps());
  registerLocalGgufBenchmarkHandlers(ipc, anyDeps());
  registerLocalGgufEndpointHandlers(ipc, anyDeps());
  return unregister;
}

describe('IPC teardown', () => {
  it('removes every handler the modular registrars mounted', async () => {
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { handle: ReturnType<typeof vi.fn>; removeHandler: ReturnType<typeof vi.fn> };
    };
    const { ipc, handled, removed } = recordingIpcMain();

    // register.ts closes over the module-level `ipcMain`, so route the mocked
    // one at the same recorder the injected registrars write to.
    ipcMain.handle.mockImplementation((channel: string) =>
      (ipc as unknown as { handle: (c: string) => void }).handle(channel),
    );
    ipcMain.removeHandler.mockImplementation((channel: string) =>
      (ipc as unknown as { removeHandler: (c: string) => void }).removeHandler(channel),
    );

    const unregister = registerEverything(ipc);
    expect(handled.length, 'nothing was mounted — the test double is not wired').toBeGreaterThan(
      100,
    );

    unregister();

    const leaked = handled.filter((channel) => !removed.includes(channel));
    expect(leaked, 'mounted but never removed — unregisterIpc() leaks these').toEqual([]);
  });

  it('removes each channel exactly once', async () => {
    const { ipcMain } = (await import('electron')) as unknown as {
      ipcMain: { handle: ReturnType<typeof vi.fn>; removeHandler: ReturnType<typeof vi.fn> };
    };
    const { ipc, handled, removed } = recordingIpcMain();
    ipcMain.handle.mockImplementation((channel: string) =>
      (ipc as unknown as { handle: (c: string) => void }).handle(channel),
    );
    ipcMain.removeHandler.mockImplementation((channel: string) =>
      (ipc as unknown as { removeHandler: (c: string) => void }).removeHandler(channel),
    );

    const unregister = registerEverything(ipc);
    unregister();

    // `index.ts` mounts rag/enhancedAi/command/copilot/paperclip/privateOperator
    // inline, and those are legitimately in REQUEST_CHANNELS without being
    // mounted here, so this test cannot assert removed ⊆ handled outright.
    // What it can assert: teardown never removes the same channel twice, which
    // is what a duplicated REQUEST_CHANNELS entry would produce.
    const duplicates = findDuplicates(removed);
    expect(duplicates, 'REQUEST_CHANNELS lists these more than once').toEqual([]);
    expect(handled.length).toBeGreaterThan(0);
  });
});
