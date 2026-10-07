/**
 * `paperclip.preview` IPC handler — read a Paperclip export folder and return
 * what importing it into Team-X would produce.
 *
 * Preview only, by design. The handler never writes: it converts an export
 * folder into a `CompanyPackage` plus the same `CompanyImportPreview` the
 * existing portability flow already renders, and hands both back. Committing
 * the import is `companyPortability.importPackage`'s job, which already exists,
 * already asks for secret bindings, and already shows a per-entity plan. Adding
 * a second write path here would mean two places that can create a workspace.
 *
 * Kept out of the monolithic `handlers.ts` for the reason the rag block gives:
 * one read-only channel backed by a pure function plus a filesystem read does
 * not justify growing the `IpcHandlers` DI surface.
 *
 * Both bridge functions are injected rather than imported directly so this is
 * unit-testable without touching a disk.
 */

import type {
  PaperclipExportBundle,
  PaperclipImportBridgeOptions,
  PaperclipImportBridgePreview,
} from '../services/paperclip-import-bridge.js';

export interface PaperclipHandlersDeps {
  loadExportFolder(folderPath: string): Promise<PaperclipExportBundle>;
  previewBridge(
    bundle: PaperclipExportBundle,
    options: PaperclipImportBridgeOptions,
  ): PaperclipImportBridgePreview;
  /** Stamped onto the produced package as `sourceAppVersion`. */
  appVersion: string;
}

export interface PaperclipHandlers {
  /** `paperclip.preview` — convert an export folder into an import preview. */
  preview(req: { folderPath: string }): Promise<PaperclipImportBridgePreview>;
}

export function buildPaperclipHandlers(deps: PaperclipHandlersDeps): PaperclipHandlers {
  return {
    async preview(req) {
      const folderPath = req?.folderPath;
      // Guard before the bridge, not inside it: `resolve('')` is the process
      // cwd, so an empty string would make this scan wherever the app was
      // launched from and report the result as a Paperclip export.
      if (typeof folderPath !== 'string' || folderPath.length === 0) {
        throw new Error('[ipc] paperclip.preview: folderPath is required');
      }

      let bundle: PaperclipExportBundle;
      try {
        bundle = await deps.loadExportFolder(folderPath);
      } catch (error) {
        // Name the folder. The bare ENOENT that `readFile` throws does not say
        // which directory the operator picked, and "no such file or directory"
        // with no path is the least actionable error in the app.
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`[ipc] paperclip.preview: could not read "${folderPath}" — ${detail}`);
      }

      return deps.previewBridge(bundle, { sourceAppVersion: deps.appVersion });
    },
  };
}
