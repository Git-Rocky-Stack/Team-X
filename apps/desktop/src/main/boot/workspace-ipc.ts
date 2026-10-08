/**
 * Sibling IPC registrations for workspace-level features that do not belong
 * on the `IpcHandlers` DI surface: the Paperclip import bridge, private
 * operator access planning, and the native file pickers.
 */

import { mkdir as fsMkdir, writeFile as fsWriteFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BrowserWindow, app, dialog, ipcMain } from 'electron';

import { userDataDir } from '../db/paths.js';
import { buildPaperclipHandlers } from '../ipc/paperclip-handlers.js';
import { buildPrivateOperatorHandlers } from '../ipc/private-operator-handlers.js';
import { registerSystemDialogHandlers } from '../ipc/system-dialogs.js';
import {
  loadPaperclipExportFolder,
  previewPaperclipImportBridge,
} from '../services/paperclip-import-bridge.js';
import { createPrivateOperatorAccessService } from '../services/private-operator-access-service.js';

import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';

export function registerPaperclipIpcHandlers(): void {
  // ---- Paperclip import bridge IPC handler -----------------------------
  //
  // Preview only. Converts a Paperclip export folder into a CompanyPackage
  // plus the same CompanyImportPreview the portability panel already renders,
  // and writes nothing — committing stays with
  // `companyPortability.importPackage`, which owns secret binding and the
  // per-entity plan. Two write paths that can create a workspace would be one
  // too many.
  const paperclipPackageDir = join(userDataDir(), 'portability');
  const paperclipHandlers = buildPaperclipHandlers({
    loadExportFolder: loadPaperclipExportFolder,
    previewBridge: previewPaperclipImportBridge,
    appVersion: app.getVersion(),
    // `paperclip.savePackage` writes the converted package where the
    // operator chooses, opening in Portability's own export folder; the
    // Portability panel then imports that file.
    showSaveDialog: async (options) => {
      await fsMkdir(paperclipPackageDir, { recursive: true });
      const owner = BrowserWindow.getFocusedWindow() ?? undefined;
      return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options);
    },
    writeFile: (path, contents) => fsWriteFile(path, contents, 'utf8'),
    defaultSaveDir: paperclipPackageDir,
  });
  ipcMain.handle('paperclip.preview', async (_evt, request) => paperclipHandlers.preview(request));
  ipcMain.handle('paperclip.savePackage', async (_evt, request) =>
    paperclipHandlers.savePackage(request),
  );
}

export function registerPrivateOperatorIpcHandlers(
  deps: Pick<PlatformServices, 'operatorAccessService'> &
    Pick<GovernanceServices, 'runtimeOperationsService'>,
): void {
  const { operatorAccessService, runtimeOperationsService } = deps;

  // ---- Private operator access IPC handlers ----------------------------
  //
  // Read-only planning for supervising this workspace from a device that is
  // not the workstation running it. The service is pure: it reads operator
  // membership and runtime state and returns a decision record — which
  // actions the requested exposure mode would permit, which it blocks, and
  // the guardrails that stay true regardless. It opens no listener, so
  // registering these channels does not put the workspace on a network.
  //
  // Registered here rather than through `createIpcHandlers` for the same
  // reason the RAG block (boot/rag.ts) is: two read-only channels backed by a pure
  // function do not justify growing the `IpcHandlers` DI surface.
  const privateOperatorHandlers = buildPrivateOperatorHandlers({
    privateOperatorAccessService: createPrivateOperatorAccessService({
      operatorAccessService,
      runtimeOperationsService,
    }),
  });
  ipcMain.handle('privateOperator.plan', async (_evt, request) =>
    privateOperatorHandlers.plan(request),
  );
  ipcMain.handle('privateOperator.snapshot', async (_evt, request) =>
    privateOperatorHandlers.snapshot(request),
  );
}

export function registerNativeDialogIpcHandlers(): void {
  // Native pickers. The handlers live in `ipc/system-dialogs.ts` so they are
  // unit-testable without Electron; the window-owner lookup stays here,
  // because this is the only layer that knows about BrowserWindow. Parenting
  // the dialog to the owning window is what makes it modal to Team-X rather
  // than a stray OS-level sheet.
  registerSystemDialogHandlers(ipcMain, {
    showOpenDialog: (options) => {
      const owner = BrowserWindow.getFocusedWindow() ?? undefined;
      return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options);
    },
  });
}
