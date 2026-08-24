/**
 * Native file and folder picker IPC handlers.
 *
 * `system.selectDirectory` used to live inline in `main/index.ts` with a
 * hardcoded `title: 'Select skill folder'`. That was accurate for its single
 * caller (the skill installer) and became wrong the moment anything else
 * needed a folder — the model library asking for a GGUF directory would have
 * put "Select skill folder" on the operator's screen. The title is now the
 * caller's to supply.
 *
 * `system.selectGgufFile` is new: `localGguf.library.addFile` takes a path to
 * one model file, and nothing in the bridge could produce one.
 *
 * The dialog itself is injected so these are unit-testable without Electron.
 * The window-owner lookup stays in the composition root, which is the only
 * place that knows about `BrowserWindow`.
 */

import type { IpcMain } from 'electron';

export const SYSTEM_DIALOG_CHANNELS = ['system.selectDirectory', 'system.selectGgufFile'] as const;

/** The slice of Electron's `dialog.showOpenDialog` these handlers consume. */
export type ShowOpenDialogFn = (
  options: Electron.OpenDialogOptions,
) => Promise<{ canceled: boolean; filePaths: string[] }>;

export interface SystemDialogDeps {
  showOpenDialog: ShowOpenDialogFn;
}

const DEFAULT_DIRECTORY_TITLE = 'Select folder';
const DEFAULT_GGUF_TITLE = 'Select a GGUF model file';

export function registerSystemDialogHandlers(ipc: IpcMain, deps: SystemDialogDeps): void {
  ipc.handle(
    'system.selectDirectory',
    async (
      _event,
      options?: { title?: string },
    ): Promise<{ canceled: boolean; folderPath: string | null }> => {
      const result = await deps.showOpenDialog({
        title: options?.title ?? DEFAULT_DIRECTORY_TITLE,
        properties: ['openDirectory', 'createDirectory'],
      });
      return {
        canceled: result.canceled,
        // `null`, never `''` — an empty string is a path the caller might
        // pass on to the filesystem, where it resolves to the cwd.
        folderPath: result.filePaths[0] ?? null,
      };
    },
  );

  ipc.handle(
    'system.selectGgufFile',
    async (
      _event,
      options?: { title?: string },
    ): Promise<{ canceled: boolean; filePath: string | null }> => {
      const result = await deps.showOpenDialog({
        title: options?.title ?? DEFAULT_GGUF_TITLE,
        properties: ['openFile'],
        filters: [
          { name: 'GGUF models', extensions: ['gguf'] },
          // Split shard sets in the wild carry names the extension filter can
          // still match, but a few publishers ship no extension at all. The
          // filter is a sensible default, not a cage.
          { name: 'All files', extensions: ['*'] },
        ],
      });
      return {
        canceled: result.canceled,
        filePath: result.filePaths[0] ?? null,
      };
    },
  );
}
