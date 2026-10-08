/**
 * `paperclip.*` IPC handlers — read a Paperclip export folder, show what
 * importing it into Team-X would produce, and save the converted package.
 *
 * `paperclip.preview` converts an export folder into a `CompanyPackage` plus
 * the same `CompanyImportPreview` the portability flow renders. It writes
 * nothing.
 *
 * `paperclip.savePackage` writes that package to a `.teamx-package.json` the
 * operator chooses — the file format `companyPortability.importPackage`
 * reads. Committing the import stays that flow's job: it already asks for
 * secret bindings and shows a per-entity plan, and a second path that can
 * create a workspace would be one too many. Before this channel the preview
 * told the operator to import "from the Portability panel", which only reads
 * a package file, and nothing ever produced one — the flow dead-ended.
 *
 * Kept out of the monolithic `handlers.ts` for the reason the rag block gives:
 * one read-only channel backed by a pure function plus a filesystem read does
 * not justify growing the `IpcHandlers` DI surface.
 *
 * Both bridge functions are injected rather than imported directly so this is
 * unit-testable without touching a disk.
 */

import { join } from 'node:path';

import type { PaperclipSavePackageResponse } from '@team-x/shared-types';

import type {
  PaperclipExportBundle,
  PaperclipImportBridgeOptions,
  PaperclipImportBridgePreview,
} from '../services/paperclip-import-bridge.js';

/** Extension of a Team-X company package, as Portability names them. */
const PACKAGE_EXTENSION = '.teamx-package.json';

export interface PaperclipHandlersDeps {
  loadExportFolder(folderPath: string): Promise<PaperclipExportBundle>;
  previewBridge(
    bundle: PaperclipExportBundle,
    options: PaperclipImportBridgeOptions,
  ): PaperclipImportBridgePreview;
  /** Stamped onto the produced package as `sourceAppVersion`. */
  appVersion: string;
  /** Native save dialog, parented to the app window by the composition root. */
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
  writeFile(path: string, contents: string): Promise<void>;
  /** Where the save dialog opens — Portability's own export folder. */
  defaultSaveDir: string;
}

export interface PaperclipHandlers {
  /** `paperclip.preview` — convert an export folder into an import preview. */
  preview(req: { folderPath: string }): Promise<PaperclipImportBridgePreview>;
  /** `paperclip.savePackage` — write the converted package where the operator chooses. */
  savePackage(req: { folderPath: string }): Promise<PaperclipSavePackageResponse>;
}

export function buildPaperclipHandlers(deps: PaperclipHandlersDeps): PaperclipHandlers {
  /**
   * Load and convert the folder. Shared by both channels so the saved package
   * is rebuilt from disk in the main process — never taken from the renderer,
   * which is the untrusted side of the bridge.
   */
  async function convert(
    channel: string,
    req: { folderPath: string },
  ): Promise<PaperclipImportBridgePreview> {
    const folderPath = req?.folderPath;
    // Guard before the bridge, not inside it: `resolve('')` is the process
    // cwd, so an empty string would make this scan wherever the app was
    // launched from and report the result as a Paperclip export.
    if (typeof folderPath !== 'string' || folderPath.length === 0) {
      throw new Error(`[ipc] ${channel}: folderPath is required`);
    }

    let bundle: PaperclipExportBundle;
    try {
      bundle = await deps.loadExportFolder(folderPath);
    } catch (error) {
      // Name the folder. The bare ENOENT that `readFile` throws does not say
      // which directory the operator picked, and "no such file or directory"
      // with no path is the least actionable error in the app.
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`[ipc] ${channel}: could not read "${folderPath}" — ${detail}`);
    }

    return deps.previewBridge(bundle, { sourceAppVersion: deps.appVersion });
  }

  return {
    preview: (req) => convert('paperclip.preview', req),

    async savePackage(req) {
      const preview = await convert('paperclip.savePackage', req);
      const slug = preview.importPreview.suggestedSlug || 'paperclip-import';

      const chosen = await deps.showSaveDialog({
        title: 'Save Team-X package',
        defaultPath: join(deps.defaultSaveDir, `${slug}${PACKAGE_EXTENSION}`),
        filters: [{ name: 'Team-X package', extensions: ['json'] }],
      });
      if (chosen.canceled || !chosen.filePath) return { canceled: true, packagePath: null };

      const packagePath = chosen.filePath.toLowerCase().endsWith('.json')
        ? chosen.filePath
        : `${chosen.filePath}${PACKAGE_EXTENSION}`;
      await deps.writeFile(packagePath, `${JSON.stringify(preview.packageData, null, 2)}\n`);
      return { canceled: false, packagePath };
    },
  };
}
