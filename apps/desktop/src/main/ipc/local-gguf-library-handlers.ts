/**
 * IPC handlers for the localGguf.library.* channels.
 *
 * Phase 1: every handler is a typed stub that throws a not-implemented
 * error so callers fail fast and visibly. Phase 3 (library + scanning)
 * replaces these with real implementations against the LibraryService —
 * the registration function grows a `deps` argument at that point and the
 * single boot call-site in main/index.ts is updated.
 *
 * Return-type annotations encode the contract each channel must satisfy
 * once implemented; `notImplemented` returns `never`, which is assignable
 * to every annotated Promise.
 */

import type { AdvancedParams, LocalModel, WatchFolder } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_LIBRARY_CHANNELS = [
  'localGguf.library.list',
  'localGguf.library.get',
  'localGguf.library.addFile',
  'localGguf.library.addFolder',
  'localGguf.library.removeModel',
  'localGguf.library.removeFolder',
  'localGguf.library.scanFolder',
  'localGguf.library.setSystemPrompt',
  'localGguf.library.setChatTemplate',
  'localGguf.library.setAdvancedParams',
  'localGguf.library.resetAdvanced',
  'localGguf.library.listBySourceType',
] as const;

export function registerLocalGgufLibraryHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.library.list',
    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.list'),
  );
  ipc.handle(
    'localGguf.library.get',
    async (): Promise<LocalModel | null> => notImplemented('localGguf.library.get'),
  );
  ipc.handle(
    'localGguf.library.addFile',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.addFile'),
  );
  ipc.handle(
    'localGguf.library.addFolder',
    async (): Promise<WatchFolder> => notImplemented('localGguf.library.addFolder'),
  );
  ipc.handle(
    'localGguf.library.removeModel',
    async (): Promise<void> => notImplemented('localGguf.library.removeModel'),
  );
  ipc.handle(
    'localGguf.library.removeFolder',
    async (): Promise<void> => notImplemented('localGguf.library.removeFolder'),
  );
  ipc.handle(
    'localGguf.library.scanFolder',
    async (): Promise<{ addedCount: number; removedCount: number }> =>
      notImplemented('localGguf.library.scanFolder'),
  );
  ipc.handle(
    'localGguf.library.setSystemPrompt',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.setSystemPrompt'),
  );
  ipc.handle(
    'localGguf.library.setChatTemplate',
    async (): Promise<LocalModel> => notImplemented('localGguf.library.setChatTemplate'),
  );
  ipc.handle(
    'localGguf.library.setAdvancedParams',
    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.setAdvancedParams'),
  );
  ipc.handle(
    'localGguf.library.resetAdvanced',
    async (): Promise<AdvancedParams> => notImplemented('localGguf.library.resetAdvanced'),
  );
  ipc.handle(
    'localGguf.library.listBySourceType',
    async (): Promise<LocalModel[]> => notImplemented('localGguf.library.listBySourceType'),
  );
}
