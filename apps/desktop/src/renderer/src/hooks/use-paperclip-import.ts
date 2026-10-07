/**
 * React Query hooks for the Paperclip import bridge.
 *
 * Two mutations rather than one query, because both steps are things the
 * operator *does*: picking a folder opens a native dialog, and previewing reads
 * a directory off disk. Neither should run because a component mounted.
 *
 * They stay separate so a cancelled picker cannot cascade into a read. Folding
 * them into one "import" mutation would mean the cancel path had to be handled
 * inside the same call that performs the read, and the easiest way to write
 * that is the wrong way — preview `null` and let the main process reject it.
 *
 * Nothing here writes. `usePaperclipImportPreview` returns a `packageData` that
 * the existing portability import flow can commit; committing is that flow's
 * job, not this one's.
 */

import { useMutation } from '@tanstack/react-query';
import type { PaperclipImportBridgePreview } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

/**
 * The picker's title is the operator's only clue about what the dialog is for.
 * `system.selectDirectory` defaults to a generic "Select folder", which is how
 * the skill installer's title once ended up on the model library's dialog.
 */
const PICKER_TITLE = 'Select a Paperclip export folder';

/**
 * Opens the native folder picker. Resolves to the chosen path, or `null` if the
 * operator cancelled — `null` and not `''`, because an empty string is a path
 * the caller might pass on, and `resolve('')` is the process cwd.
 */
export function useSelectPaperclipFolder() {
  return useMutation<string | null, Error, void>({
    mutationFn: async () => {
      const result = await ipc.system.selectDirectory({ title: PICKER_TITLE });
      if (result.canceled) return null;
      return result.folderPath ?? null;
    },
  });
}

/** Reads the export folder and returns what importing it would produce. */
export function usePaperclipImportPreview() {
  return useMutation<PaperclipImportBridgePreview, Error, string>({
    mutationFn: (folderPath: string) => ipc.paperclip.preview({ folderPath }),
  });
}
