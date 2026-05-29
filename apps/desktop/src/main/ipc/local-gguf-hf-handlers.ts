/**
 * IPC handlers for the localGguf.hf.* channels (Hugging Face Hub browser).
 *
 * Phase 1: typed not-implemented stubs. Phase 7 (HF browser) replaces them
 * with real implementations against the HfService and moves the placeholder
 * types below into @team-x/shared-types.
 */

import type { IpcMain } from 'electron';

import { notImplemented } from './local-gguf-not-implemented.js';

// --- Placeholder types — Phase 7 promotes these to @team-x/shared-types. ---
export interface HfSearchResult {
  repoId: string;
  downloads: number;
  likes: number;
  description: string;
  tags: string[];
}

export interface HfModelCard {
  repoId: string;
  description: string;
  license: string | null;
  siblings: Array<{ rfilename: string; sizeBytes: number | null }>;
}

export interface DownloadProgress {
  handleId: string;
  repoId: string;
  filename: string;
  bytesReceived: number;
  bytesTotal: number;
  state: 'pending' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'failed';
  errorMessage: string | null;
}

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
  ipc.handle('localGguf.hf.search', async (): Promise<HfSearchResult[]> =>
    notImplemented('localGguf.hf.search'),
  );
  ipc.handle('localGguf.hf.modelCard', async (): Promise<HfModelCard> =>
    notImplemented('localGguf.hf.modelCard'),
  );
  ipc.handle('localGguf.hf.startDownload', async (): Promise<{ handleId: string }> =>
    notImplemented('localGguf.hf.startDownload'),
  );
  ipc.handle('localGguf.hf.pauseDownload', async (): Promise<void> =>
    notImplemented('localGguf.hf.pauseDownload'),
  );
  ipc.handle('localGguf.hf.resumeDownload', async (): Promise<void> =>
    notImplemented('localGguf.hf.resumeDownload'),
  );
  ipc.handle('localGguf.hf.cancelDownload', async (): Promise<void> =>
    notImplemented('localGguf.hf.cancelDownload'),
  );
  ipc.handle('localGguf.hf.activeDownloads', async (): Promise<DownloadProgress[]> =>
    notImplemented('localGguf.hf.activeDownloads'),
  );
}
