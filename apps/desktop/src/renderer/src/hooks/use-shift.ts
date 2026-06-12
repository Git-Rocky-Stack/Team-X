import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Company } from '@team-x/shared-types';
import { useCallback, useEffect, useMemo } from 'react';

import type { Shift } from '@/components/console';
import { useCompanies } from '@/hooks/use-companies.js';
import { ipc } from '@/lib/ipc.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Console shift ⇄ company theme bridge (sweep Phase 2 — Task 11).
 *
 * The design system speaks in *shifts* — Night Ops (dark) and Day Shift
 * (light silver) — while persistence lives on the existing company
 * `theme: 'dark' | 'light'` field (already editable in
 * `company-settings.tsx` + `create-company-dialog.tsx` via
 * `ipc.companies.update`). This hook is the single bridge: it derives the
 * active shift from the active company's theme, writes the theme back
 * through the EXISTING company update mutation, and owns the runtime
 * `documentElement` `.dark` class so chrome (the top-bar `ShiftToggle`)
 * can reach Day Shift without any new IPC.
 *
 * The boot default (`document.documentElement.classList.add('dark')` in
 * `main.tsx`) is unchanged — this hook's effect is the *runtime* writer
 * that re-syncs the class whenever the active company's theme changes.
 */

/** Company theme is the persistence; shift is the console vocabulary. */
export const shiftFromTheme = (theme: string | undefined): Shift =>
  theme === 'light' ? 'day' : 'night';

export const themeFromShift = (shift: Shift): 'dark' | 'light' =>
  shift === 'day' ? 'light' : 'dark';

/** Single writer for the documentElement theme class (boot default in main.tsx). */
export const applyShiftClass = (shift: Shift, el: HTMLElement = document.documentElement) => {
  el.classList.toggle('dark', shift === 'night');
};

export function useShift(): { shift: Shift; setShift: (next: Shift) => void } {
  const queryClient = useQueryClient();

  // Active company — same source the WorkspaceSwitcher uses: the global
  // `['companies']` query joined to the app-store `companyId`.
  const { data: companies = [] } = useCompanies();
  const activeCompanyId = useAppStore((s) => s.companyId);
  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const shift = shiftFromTheme(activeCompany?.theme);

  // Mirror company-settings.tsx's update mutation (no new IPC).
  const updateMutation = useMutation({
    mutationFn: (theme: 'dark' | 'light') => {
      if (!activeCompany) throw new Error('No active company to set shift on.');
      return ipc.companies.update({
        companyId: activeCompany.id,
        theme,
        settings: { ...activeCompany.settings, theme },
      });
    },
  });

  // Runtime writer: re-sync the documentElement class to the active
  // company's theme. The optimistic cache write below flips `shift`
  // synchronously, so the class follows the toggle instantly.
  useEffect(() => {
    applyShiftClass(shift);
  }, [shift]);

  const setShift = useCallback(
    (next: Shift) => {
      // No company → chrome toggle is a visual no-op (acceptable for the
      // app shell). Guard the mutation so we never fire a write with no
      // target company.
      if (!activeCompany) return;
      if (next === shift) return;

      const theme = themeFromShift(next);

      // Optimistic cache update mirrors company-settings.tsx so the toggle
      // (and the documentElement class via the effect) flips instantly,
      // then reconciles against the IPC write.
      queryClient.setQueryData<Company[]>(['companies'], (current = []) =>
        current.map((item) =>
          item.id === activeCompany.id
            ? { ...item, theme, settings: { ...item.settings, theme } }
            : item,
        ),
      );

      updateMutation.mutate(theme, {
        onSettled: () => {
          void queryClient.invalidateQueries({ queryKey: ['companies'] });
        },
      });
    },
    [activeCompany, shift, queryClient, updateMutation],
  );

  return { shift, setShift };
}
