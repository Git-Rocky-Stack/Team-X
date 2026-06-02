/**
 * IPC handlers for the localGguf.library.* channels.
 *
 * Phase 3 (library + scanning) — LIVE. Each channel delegates to the injected
 * {@link LibraryService} (GGUF metadata parsing, folder scanning, chokidar
 * watching, network-share resilience), so every handler stays a one-line
 * pass-through. The Phase 1 not-implemented stubs these replaced are gone; the
 * boot sequence constructs the service and passes it in via `deps`.
 *
 * Argument typing mirrors the sibling runtime handlers
 * (`local-gguf-runtime-handlers.ts`): each handler destructures `(_event, ...)`
 * and casts positional args inline to the contract the channel encodes, then
 * returns the service promise directly.
 */

import type { AdvancedParams, SourceType } from '@team-x/shared-types';
import type { IpcMain } from 'electron';

import type { LibraryService } from '../services/local-gguf/library-service.js';

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

/** Service the library channels delegate to (constructed at boot). */
export interface LocalGgufLibraryHandlerDeps {
  library: LibraryService;
}

export function registerLocalGgufLibraryHandlers(
  ipc: IpcMain,
  deps: LocalGgufLibraryHandlerDeps,
): void {
  const { library } = deps;

  // ── read ────────────────────────────────────────────────────────────────
  ipc.handle('localGguf.library.list', () => library.list());
  ipc.handle('localGguf.library.get', (_event, id: string) => library.get(id));
  ipc.handle('localGguf.library.listBySourceType', (_event, sourceType: SourceType) =>
    library.listBySourceType(sourceType),
  );

  // ── add ─────────────────────────────────────────────────────────────────
  ipc.handle('localGguf.library.addFile', (_event, path: string) => library.addFile(path));
  ipc.handle('localGguf.library.addFolder', (_event, path: string, recursive: boolean) =>
    library.addFolder(path, recursive),
  );

  // ── remove ──────────────────────────────────────────────────────────────
  ipc.handle('localGguf.library.removeModel', (_event, id: string) => library.removeModel(id));
  ipc.handle('localGguf.library.removeFolder', (_event, id: string) => library.removeFolder(id));

  // ── scan ────────────────────────────────────────────────────────────────
  ipc.handle('localGguf.library.scanFolder', (_event, id: string) => library.scanFolder(id));

  // ── per-model overrides ─────────────────────────────────────────────────
  ipc.handle('localGguf.library.setSystemPrompt', (_event, id: string, prompt: string | null) =>
    library.setSystemPrompt(id, prompt),
  );
  ipc.handle('localGguf.library.setChatTemplate', (_event, id: string, template: string | null) =>
    library.setChatTemplate(id, template),
  );
  ipc.handle(
    'localGguf.library.setAdvancedParams',
    (_event, id: string, params: Partial<AdvancedParams>) => library.setAdvancedParams(id, params),
  );
  // "Reset to auto": clears the override row, then resolves the recomputed
  // auto-tuned params (never the just-deleted row). See LibraryService.resetAdvanced.
  ipc.handle('localGguf.library.resetAdvanced', (_event, id: string) => library.resetAdvanced(id));
}
