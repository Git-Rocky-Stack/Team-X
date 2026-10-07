import type { DownloadProgress, HfModelCard, HfSearchResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { HfService } from '../services/local-gguf/hf-service.js';

import { LOCAL_GGUF_HF_CHANNELS, registerLocalGgufHfHandlers } from './local-gguf-hf-handlers.js';

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

function makeFakeHf() {
  const sentinels = {
    search: [{ repoId: 'Qwen/Qwen3-8B-GGUF' }] as unknown as HfSearchResult[],
    modelCard: { repoId: 'Qwen/Qwen3-8B-GGUF' } as unknown as HfModelCard,
    startDownload: { handleId: 'dl-1' },
    pauseDownload: undefined,
    resumeDownload: undefined,
    cancelDownload: undefined,
    activeDownloads: [{ handleId: 'dl-1' }] as unknown as DownloadProgress[],
  };
  const hf = {
    search: vi.fn().mockResolvedValue(sentinels.search),
    modelCard: vi.fn().mockResolvedValue(sentinels.modelCard),
    startDownload: vi.fn().mockResolvedValue(sentinels.startDownload),
    pauseDownload: vi.fn().mockResolvedValue(sentinels.pauseDownload),
    resumeDownload: vi.fn().mockResolvedValue(sentinels.resumeDownload),
    cancelDownload: vi.fn().mockResolvedValue(sentinels.cancelDownload),
    activeDownloads: vi.fn().mockResolvedValue(sentinels.activeDownloads),
    settled: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof HfService, ReturnType<typeof vi.fn>>;
  return { hf: hf as unknown as HfService, mocks: hf, sentinels };
}

describe('localGguf hf IPC handlers (Phase 7 — HfService delegations)', () => {
  it('registers every hf channel exactly once', () => {
    const f = makeFakeIpc();
    const { hf } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_HF_CHANNELS].sort());
    expect(f.channels()).toHaveLength(7);
  });

  it('hf.search forwards the query and the filter object', async () => {
    const f = makeFakeIpc();
    const { hf, mocks, sentinels } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    const filters = { author: 'bartowski', limit: 10 };
    await expect(f.invoke('localGguf.hf.search', 'qwen3', filters)).resolves.toBe(sentinels.search);
    expect(mocks.search).toHaveBeenCalledWith('qwen3', filters);
  });

  it('hf.search defaults absent filters to an empty object', async () => {
    // The preload bridge types `filters` as required, but a renderer built
    // against an older bundle can still invoke the raw channel with one arg.
    const f = makeFakeIpc();
    const { hf, mocks } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await f.invoke('localGguf.hf.search', 'qwen3');
    expect(mocks.search).toHaveBeenCalledWith('qwen3', {});
  });

  it('hf.modelCard forwards the repo id', async () => {
    const f = makeFakeIpc();
    const { hf, mocks, sentinels } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await expect(f.invoke('localGguf.hf.modelCard', 'Qwen/Qwen3-8B-GGUF')).resolves.toBe(
      sentinels.modelCard,
    );
    expect(mocks.modelCard).toHaveBeenCalledWith('Qwen/Qwen3-8B-GGUF');
  });

  it('hf.startDownload forwards the repo, filename and target folder', async () => {
    const f = makeFakeIpc();
    const { hf, mocks, sentinels } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await expect(
      f.invoke('localGguf.hf.startDownload', 'Qwen/Qwen3-8B-GGUF', 'model.gguf', '/models'),
    ).resolves.toBe(sentinels.startDownload);
    expect(mocks.startDownload).toHaveBeenCalledWith('Qwen/Qwen3-8B-GGUF', 'model.gguf', '/models');
  });

  it.each([
    ['localGguf.hf.pauseDownload', 'pauseDownload'],
    ['localGguf.hf.resumeDownload', 'resumeDownload'],
    ['localGguf.hf.cancelDownload', 'cancelDownload'],
  ] as const)('%s forwards the handle id', async (channel, method) => {
    const f = makeFakeIpc();
    const { hf, mocks } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await f.invoke(channel, 'dl-1');
    expect(mocks[method]).toHaveBeenCalledWith('dl-1');
  });

  it('hf.activeDownloads returns the progress snapshot', async () => {
    const f = makeFakeIpc();
    const { hf, mocks, sentinels } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await expect(f.invoke('localGguf.hf.activeDownloads')).resolves.toBe(sentinels.activeDownloads);
    expect(mocks.activeDownloads).toHaveBeenCalledTimes(1);
  });

  it('surfaces a service rejection rather than swallowing it', async () => {
    const f = makeFakeIpc();
    const { hf, mocks } = makeFakeHf();
    mocks.startDownload.mockRejectedValueOnce(new Error('filename must not contain traversal'));
    registerLocalGgufHfHandlers(f.ipc, { hf });

    await expect(
      f.invoke('localGguf.hf.startDownload', 'a/b', '../escape', '/models'),
    ).rejects.toThrow(/traversal/);
  });

  it('no handler answers with the Phase 1 not-implemented error any more', async () => {
    const f = makeFakeIpc();
    const { hf } = makeFakeHf();
    registerLocalGgufHfHandlers(f.ipc, { hf });

    for (const channel of LOCAL_GGUF_HF_CHANNELS) {
      await expect(f.invoke(channel, 'a/b', 'x', '/models')).resolves.not.toThrow();
    }
  });
});
