/**
 * Paperclip import bridge — the contract for reading a Paperclip export folder
 * and reporting what importing it into Team-X would produce.
 *
 * These types live in `shared-types` because the preview crosses the IPC
 * boundary: the main process reads the folder, and the renderer shows the
 * operator what would be created before anything is written.
 *
 * A preview is not an import. `packageData` is a `CompanyPackage` the existing
 * `companyPortability.importPackage` flow can consume — the bridge converts,
 * the portability flow commits. Nothing here writes.
 *
 * `PaperclipExportBundle` and the bridge's options stay in the main process:
 * the raw, untyped shape of someone else's export folder is not something the
 * renderer should ever see or reason about.
 */

import type {
  CompanyImportPreview,
  CompanyPackage,
  CompanyPackageMissingSecretRef,
} from './entities.js';

/**
 * An adapter in the export that Team-X has no runtime-profile equivalent for.
 *
 * Surfaced rather than dropped: an import that silently discards a third of the
 * source workspace's integrations looks successful and is not.
 */
export interface PaperclipUnsupportedAdapter {
  id: string;
  name: string;
  type: string;
  reason: string;
}

export interface PaperclipImportBridgePreview {
  /** Feed to `companyPortability.importPackage` to actually commit the import. */
  packageData: CompanyPackage;
  /** The same per-entity plan the portability panel already renders. */
  importPreview: CompanyImportPreview;
  warnings: string[];
  unsupportedAdapters: PaperclipUnsupportedAdapter[];
  missingSecretRefs: CompanyPackageMissingSecretRef[];
  counts: {
    agents: number;
    runtimeProfiles: number;
    tickets: number;
    skills: number;
    unsupportedAdapters: number;
    missingSecrets: number;
  };
}

export interface PaperclipPreviewRequest {
  /** Absolute path to the Paperclip export folder the operator picked. */
  folderPath: string;
}

/**
 * Result of `paperclip.savePackage`. `packagePath` is the written
 * `.teamx-package.json` — the file `companyPortability.importPackage` commits —
 * or null when the operator cancelled the save dialog.
 */
export interface PaperclipSavePackageResponse {
  canceled: boolean;
  packagePath: string | null;
}
