import type { AdvancedParams, LocalModel, SourceType, WatchFolder } from '@team-x/shared-types';
import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { LibraryService } from '../services/local-gguf/library-service.js';
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

/**
 * Build a fake LibraryService where every method is a `vi.fn()` resolving to a
 * channel-specific sentinel. Delegation tests assert (a) the handler called the
 * right method with the right args and (b) returned that method's result.
 */
function makeFakeLibrary() {
  const sentinels = {
    list: [{ id: 'm1' }] as unknown as LocalModel[],
    get: { id: 'm1' } as unknown as LocalModel,
    listBySourceType: [{ id: 'm2' }] as unknown as LocalModel[],
    addFile: { id: 'm3' } as unknown as LocalModel,
    addFolder: { id: 'f1' } as unknown as WatchFolder,
    removeModel: undefined,
    removeFolder: undefined,
    scanFolder: { addedCount: 2, removedCount: 1 },
    setSystemPrompt: { id: 'm4' } as unknown as LocalModel,
    setChatTemplate: { id: 'm5' } as unknown as LocalModel,
    setAdvancedParams: { modelId: 'm6' } as unknown as AdvancedParams,
    resetAdvanced: { modelId: 'm7' } as unknown as AdvancedParams,
  };
  const library = {
    list: vi.fn().mockResolvedValue(sentinels.list),
    get: vi.fn().mockResolvedValue(sentinels.get),
    listBySourceType: vi.fn().mockResolvedValue(sentinels.listBySourceType),
    addFile: vi.fn().mockResolvedValue(sentinels.addFile),
    addFolder: vi.fn().mockResolvedValue(sentinels.addFolder),
    removeModel: vi.fn().mockResolvedValue(sentinels.removeModel),
    removeFolder: vi.fn().mockResolvedValue(sentinels.removeFolder),
    scanFolder: vi.fn().mockResolvedValue(sentinels.scanFolder),
    setSystemPrompt: vi.fn().mockResolvedValue(sentinels.setSystemPrompt),
    setChatTemplate: vi.fn().mockResolvedValue(sentinels.setChatTemplate),
    setAdvancedParams: vi.fn().mockResolvedValue(sentinels.setAdvancedParams),
    resetAdvanced: vi.fn().mockResolvedValue(sentinels.resetAdvanced),
    dispose: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof LibraryService, ReturnType<typeof vi.fn>>;
  return { library: library as unknown as LibraryService, mocks: library, sentinels };
}

describe('localGguf library IPC handlers (Phase 3 - LibraryService delegations)', () => {
  it('registers every library channel exactly once', () => {
    const f = makeFakeIpc();
    const { library } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    expect(f.channels().sort()).toEqual([...LOCAL_GGUF_LIBRARY_CHANNELS].sort());
    expect(f.channels()).toHaveLength(12);
  });

  it('localGguf.library.list -> library.list() and returns its result', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.list');
    expect(mocks.list).toHaveBeenCalledWith();
    expect(result).toBe(sentinels.list);
  });

  it('localGguf.library.get -> library.get(id)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.get', 'model-1');
    expect(mocks.get).toHaveBeenCalledWith('model-1');
    expect(result).toBe(sentinels.get);
  });

  it('localGguf.library.listBySourceType -> library.listBySourceType(sourceType)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const sourceType: SourceType = 'folder-entry';
    const result = await f.invoke('localGguf.library.listBySourceType', sourceType);
    expect(mocks.listBySourceType).toHaveBeenCalledWith(sourceType);
    expect(result).toBe(sentinels.listBySourceType);
  });

  it('localGguf.library.addFile -> library.addFile(path)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.addFile', 'C:/models/m.gguf');
    expect(mocks.addFile).toHaveBeenCalledWith('C:/models/m.gguf');
    expect(result).toBe(sentinels.addFile);
  });

  it('localGguf.library.addFolder -> library.addFolder(path, recursive)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.addFolder', '//nas/share', true);
    expect(mocks.addFolder).toHaveBeenCalledWith('//nas/share', true);
    expect(result).toBe(sentinels.addFolder);
  });

  it('localGguf.library.removeModel -> library.removeModel(id)', async () => {
    const f = makeFakeIpc();
    const { library, mocks } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    await f.invoke('localGguf.library.removeModel', 'model-9');
    expect(mocks.removeModel).toHaveBeenCalledWith('model-9');
  });

  it('localGguf.library.removeFolder -> library.removeFolder(id)', async () => {
    const f = makeFakeIpc();
    const { library, mocks } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    await f.invoke('localGguf.library.removeFolder', 'folder-9');
    expect(mocks.removeFolder).toHaveBeenCalledWith('folder-9');
  });

  it('localGguf.library.scanFolder -> library.scanFolder(id) and returns its result', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.scanFolder', 'folder-1');
    expect(mocks.scanFolder).toHaveBeenCalledWith('folder-1');
    expect(result).toBe(sentinels.scanFolder);
  });

  it('localGguf.library.setSystemPrompt -> library.setSystemPrompt(id, prompt)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.setSystemPrompt', 'm', 'be terse');
    expect(mocks.setSystemPrompt).toHaveBeenCalledWith('m', 'be terse');
    expect(result).toBe(sentinels.setSystemPrompt);
  });

  it('localGguf.library.setSystemPrompt forwards a null prompt (clear override)', async () => {
    const f = makeFakeIpc();
    const { library, mocks } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    await f.invoke('localGguf.library.setSystemPrompt', 'm', null);
    expect(mocks.setSystemPrompt).toHaveBeenCalledWith('m', null);
  });

  it('localGguf.library.setChatTemplate -> library.setChatTemplate(id, template)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.setChatTemplate', 'm', '{{prompt}}');
    expect(mocks.setChatTemplate).toHaveBeenCalledWith('m', '{{prompt}}');
    expect(result).toBe(sentinels.setChatTemplate);
  });

  it('localGguf.library.setChatTemplate forwards a null template (clear override)', async () => {
    const f = makeFakeIpc();
    const { library, mocks } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    await f.invoke('localGguf.library.setChatTemplate', 'm', null);
    expect(mocks.setChatTemplate).toHaveBeenCalledWith('m', null);
  });

  it('localGguf.library.setAdvancedParams -> library.setAdvancedParams(id, params)', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const params: Partial<AdvancedParams> = { nCtx: 4096, nGpuLayers: 33 };
    const result = await f.invoke('localGguf.library.setAdvancedParams', 'm', params);
    expect(mocks.setAdvancedParams).toHaveBeenCalledWith('m', params);
    expect(result).toBe(sentinels.setAdvancedParams);
  });

  it('localGguf.library.resetAdvanced -> library.resetAdvanced(id) and returns its result', async () => {
    const f = makeFakeIpc();
    const { library, mocks, sentinels } = makeFakeLibrary();
    registerLocalGgufLibraryHandlers(f.ipc, { library });
    const result = await f.invoke('localGguf.library.resetAdvanced', 'm');
    expect(mocks.resetAdvanced).toHaveBeenCalledWith('m');
    expect(result).toBe(sentinels.resetAdvanced);
  });
});
