/**
 * IPC handlers for the localGguf.hf.* channels (Hugging Face Hub browser).
 *
 * Phase 1: typed not-implemented stubs. Phase 7 (HF browser) replaces them
 * with real implementations against the HfService. The result shapes
 * (`HfSearchResult`, `HfModelCard`, `DownloadProgress`) live in
 * @team-x/shared-types so the preload bridge and renderer share one
 * definition with these handlers.
 */

import type { DownloadProgress, HfModelCard, HfSearchResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

export const LOCAL_GGUF_HF_CHANNELS = [
  'localGguf.hf.search',
  'localGguf.hf.modelCard',
  'localGguf.hf.startDownload',
  'localGguf.hf.pauseDownload',
  'localGguf.hf.resumeDownload',
  'localGguf.hf.cancelDownload',
  'localGguf.hf.activeDownloads',
] as const;

export function registerLocalGgufHfHandlers(ipc: IpcMain): void {
  ipc.handle(
    'localGguf.hf.search',
    async (): Promise<HfSearchResult[]> => notImplemented('localGguf.hf.search'),
  );
  ipc.handle(
    'localGguf.hf.modelCard',
    async (): Promise<HfModelCard> => notImplemented('localGguf.hf.modelCard'),
  );
  ipc.handle(
    'localGguf.hf.startDownload',
    async (): Promise<{ handleId: string }> => notImplemented('localGguf.hf.startDownload'),
  );
  ipc.handle(
    'localGguf.hf.pauseDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.pauseDownload'),
  );
  ipc.handle(
    'localGguf.hf.resumeDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.resumeDownload'),
  );
  ipc.handle(
    'localGguf.hf.cancelDownload',
    async (): Promise<void> => notImplemented('localGguf.hf.cancelDownload'),
  );
  ipc.handle(
    'localGguf.hf.activeDownloads',
    async (): Promise<DownloadProgress[]> => notImplemented('localGguf.hf.activeDownloads'),
  );
}
