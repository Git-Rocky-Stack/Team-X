/**
 * Native file/folder picker handlers.
 *
 * `system.selectDirectory` previously lived inline in `main/index.ts` with a
 * hardcoded `title: 'Select skill folder'` — correct for the one caller it had
 * (the skill installer) and wrong for every other. The model library needs a
 * folder picker of its own, and a `.gguf` file picker that did not exist at
 * all, so the pair moves here behind an injectable dialog and gains a caller-
 * supplied title.
 */

import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  SYSTEM_DIALOG_CHANNELS,
  type ShowOpenDialogFn,
  registerSystemDialogHandlers,
} from './system-dialogs.js';

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

function build(result: { canceled: boolean; filePaths: string[] }) {
  const showOpenDialog = vi.fn(async () => result) as unknown as ShowOpenDialogFn;
  const f = makeFakeIpc();
  registerSystemDialogHandlers(f.ipc, { showOpenDialog });
  return { f, showOpenDialog: showOpenDialog as unknown as ReturnType<typeof vi.fn> };
}

describe('system dialog handlers', () => {
  it('registers both picker channels', () => {
    const { f } = build({ canceled: true, filePaths: [] });
    expect(f.channels().sort()).toEqual([...SYSTEM_DIALOG_CHANNELS].sort());
  });
});

describe('system.selectDirectory', () => {
  it('returns the chosen folder', async () => {
    const { f } = build({ canceled: false, filePaths: ['D:/models'] });
    await expect(f.invoke('system.selectDirectory')).resolves.toEqual({
      canceled: false,
      folderPath: 'D:/models',
    });
  });

  it('reports a cancelled dialog with a null path rather than an empty string', async () => {
    const { f } = build({ canceled: true, filePaths: [] });
    await expect(f.invoke('system.selectDirectory')).resolves.toEqual({
      canceled: true,
      folderPath: null,
    });
  });

  it('opens a directory picker that can create a folder', async () => {
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectDirectory');
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.properties).toContain('openDirectory');
    expect(options.properties).toContain('createDirectory');
  });

  it('uses the caller’s title so the dialog names what is being picked', async () => {
    // The old inline handler always said "Select skill folder", which is wrong
    // wherever it is not the skill installer calling.
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectDirectory', { title: 'Select model folder' });
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.title).toBe('Select model folder');
  });

  it('falls back to a generic title when the caller supplies none', async () => {
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectDirectory');
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.title).toBeTruthy();
    expect(options.title).not.toMatch(/skill/i);
  });
});

describe('system.selectGgufFile', () => {
  it('returns the chosen file', async () => {
    const { f } = build({ canceled: false, filePaths: ['D:/models/qwen3-8b.Q4_K_M.gguf'] });
    await expect(f.invoke('system.selectGgufFile')).resolves.toEqual({
      canceled: false,
      filePath: 'D:/models/qwen3-8b.Q4_K_M.gguf',
    });
  });

  it('reports a cancelled dialog with a null path', async () => {
    const { f } = build({ canceled: true, filePaths: [] });
    await expect(f.invoke('system.selectGgufFile')).resolves.toEqual({
      canceled: true,
      filePath: null,
    });
  });

  it('filters to .gguf so the picker cannot return something unloadable', async () => {
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectGgufFile');
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.properties).toContain('openFile');
    expect(options.properties).not.toContain('openDirectory');
    expect(options.filters?.[0]?.extensions).toContain('gguf');
  });

  it('offers an all-files escape hatch for oddly-named shards', async () => {
    // Split GGUF sets in the wild carry suffixes like `-00001-of-00003.gguf`,
    // and a few publishers ship no extension at all. The filter is a default,
    // not a cage.
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectGgufFile');
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.filters?.some((filter) => filter.extensions.includes('*'))).toBe(true);
  });

  it('does not allow multi-select, since the channel returns one path', async () => {
    const { f, showOpenDialog } = build({ canceled: true, filePaths: [] });
    await f.invoke('system.selectGgufFile');
    const options = showOpenDialog.mock.calls[0]?.[0] as Electron.OpenDialogOptions;
    expect(options.properties).not.toContain('multiSelections');
  });
});
