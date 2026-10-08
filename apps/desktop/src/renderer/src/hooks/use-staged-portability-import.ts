/**
 * Receive a package path another panel staged for the Portability import —
 * Paperclip Import's "Review & import in Portability" — exactly once.
 *
 * The path travels through the app store rather than props because the two
 * sections are siblings in SettingsView with no shared parent state. The value
 * is cleared as soon as it is delivered, so revisiting Settings never replays
 * an old hand-off.
 */

import { useEffect } from 'react';

import { useAppStore } from '@/store/app-store.js';

export function useStagedPortabilityImport(onStaged: (packageRef: string) => void): void {
  const staged = useAppStore((state) => state.portabilityImportRef);
  const clear = useAppStore((state) => state.clearPortabilityImportRef);

  useEffect(() => {
    if (staged === null) return;
    onStaged(staged);
    clear();
  }, [staged, clear, onStaged]);
}
