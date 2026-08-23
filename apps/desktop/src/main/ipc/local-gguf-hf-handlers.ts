/**
 * IPC handlers for the localGguf.hf.* channels (Hugging Face Hub browser).
 *
 * Phase 7 (HF browser) — LIVE. Each channel delegates to the injected
 * {@link HfService}, which owns repo-id and filename validation, the Hub API
 * calls, and the resumable download manager. The Phase 1 not-implemented stubs
 * these replaced are gone; the boot sequence constructs the service and passes
 * it in via `deps`.
 *
 * The result shapes (`HfSearchResult`, `HfModelCard`, `DownloadProgress`) live
 * in @team-x/shared-types so the preload bridge and renderer share one
 * definition with these handlers.
 */

import type { DownloadProgress, HfModelCard, HfSearchResult } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import type { HfService } from '../services/local-gguf/hf-service.js';

export const LOCAL_GGUF_HF_CHANNELS = [
  'localGguf.hf.search',
  'localGguf.hf.modelCard',
  'localGguf.hf.startDownload',
  'localGguf.hf.pauseDownload',
  'localGguf.hf.resumeDownload',
  'localGguf.hf.cancelDownload',
  'localGguf.hf.activeDownloads',
] as const;

/** Service the HF channels delegate to (constructed at boot). */
export interface LocalGgufHfHandlerDeps {
  hf: HfService;
}

export function registerLocalGgufHfHandlers(ipc: IpcMain, deps: LocalGgufHfHandlerDeps): void {
  const { hf } = deps;

  // ── browse ──────────────────────────────────────────────────────────────
  ipc.handle(
    'localGguf.hf.search',
    (
      _event,
      query: string,
      // The bridge always sends a filter object, but the raw channel is
      // reachable from a renderer bundle built against an older contract, so
      // the default keeps a one-argument invoke from becoming `undefined`.
      filters: Record<string, unknown> = {},
    ): Promise<HfSearchResult[]> => hf.search(query, filters ?? {}),
  );

  ipc.handle(
    'localGguf.hf.modelCard',
    (_event, repoId: string): Promise<HfModelCard> => hf.modelCard(repoId),
  );

  // ── transfer control ────────────────────────────────────────────────────
  ipc.handle(
    'localGguf.hf.startDownload',
    (
      _event,
      repoId: string,
      filename: string,
      targetFolder: string,
    ): Promise<{ handleId: string }> => hf.startDownload(repoId, filename, targetFolder),
  );

  ipc.handle(
    'localGguf.hf.pauseDownload',
    (_event, handleId: string): Promise<void> => hf.pauseDownload(handleId),
  );

  ipc.handle(
    'localGguf.hf.resumeDownload',
    (_event, handleId: string): Promise<void> => hf.resumeDownload(handleId),
  );

  ipc.handle(
    'localGguf.hf.cancelDownload',
    (_event, handleId: string): Promise<void> => hf.cancelDownload(handleId),
  );

  // ── progress ────────────────────────────────────────────────────────────
  ipc.handle(
    'localGguf.hf.activeDownloads',
    (): Promise<DownloadProgress[]> => hf.activeDownloads(),
  );
}
