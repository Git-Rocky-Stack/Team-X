import type { IpcMain } from 'electron';
import { describe, expect, it } from 'vitest';

import {
  LOCAL_GGUF_LIBRARY_CHANNELS,
  registerLocalGgufLibraryHandlers,
} from './local-gguf-library-handlers.js';

function makeFakeIpc() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const ipc = {
    handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
      handlers.set(channel, fn);
    },
  } as unknown as IpcMain;
  return {
    ipc,
    channels: () => [...handlers.keys()],
    invoke: (channel: string, ...args: unknown[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, ...args);
    },
  };
}

describe('localGguf library IPC handlers (Phase 1 stubs)', () => {
  it('registers every library channel', () => {
    const f = makeFakeIpc();
    registerLocalGgufLibraryHandlers(f.ipc);
    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_LIBRARY_CHANNELS].sort());
  });

  it.each([...LOCAL_GGUF_LIBRARY_CHANNELS])('handler %s throws not-implemented', async (channel) => {
    const f = makeFakeIpc();
    registerLocalGgufLibraryHandlers(f.ipc);
    await expect(f.invoke(channel)).rejects.toThrow(/not implemented/i);
  });
});
