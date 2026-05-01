/**
 * React Query hooks for the Command palette IPC surface (Phase 5 — M30).
 *
 * Exposes four hooks that wrap `window.teamx.command.*` via the shared
 * `ipc` module (never reaches for `window.teamx` directly):
 *
 *   - `useCommandParse()`     — useMutation over `command.parse`.
 *   - `useCommandExecute()`   — useMutation over `command.execute`.
 *                               Invalidates the command-history cache
 *                               on success so the history picker always
 *                               reflects the newest 20 entries.
 *   - `useCommandHistory()`   — useQuery pinned to the active company.
 *                               Returns newest-first; the palette reads
 *                               `history[i]` directly when the user
 *                               presses ↑ from an empty input.
 *   - `useCommandSuggest()`   — debounced-partial-match useQuery. The
 *                               main process answers from a static
 *                               suggestion table (no LLM call), so this
 *                               is safe to fire on every keystroke once
 *                               the text is short (≤ 40 chars).
 *
 * Every hook is a thin wrapper — business logic lives in the main
 * process CommandService. The renderer's only job is to surface state
 * (loading / error / data) to the palette.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CommandHistoryRequest,
  CommandParseRequest,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
} from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

/** Mutation over `command.parse`. */
export function useCommandParse() {
  return useMutation<IpcParseResult, Error, CommandParseRequest>({
    mutationFn: (req) => ipc.command.parse(req),
  });
}

/**
 * Mutation over `command.execute`. Invalidates the caches any
 * executed command could have mutated so the dashboard / sidebar /
 * tickets view refresh immediately:
 *   - `command-history`  (always, for the Recent Commands subview).
 *   - `employees`        (hire / fire / promote touch the roster).
 *   - `tickets`          (create / assign / close / reopen touch kanban).
 *
 * The invalidations are broad on purpose — React Query's refetch-on-
 * success is cheap, and a mis-targeted invalidation shows up as a
 * stale UI bug faster than a memory regression. If any individual
 * view starts refetching too aggressively, narrow the keyset here.
 */
export function useCommandExecute() {
  const queryClient = useQueryClient();
  return useMutation<IpcExecuteResult, Error, IpcExecuteRequest>({
    mutationFn: (req) => ipc.command.execute(req),
    onSuccess: (_result, req) => {
      queryClient.invalidateQueries({ queryKey: ['command-history', req.companyId] });
      queryClient.invalidateQueries({ queryKey: ['employees', req.companyId] });
      queryClient.invalidateQueries({ queryKey: ['tickets', req.companyId] });
    },
  });
}

/**
 * Newest-first command history for the active company. Returns an
 * empty array while `companyId` is null so the palette can safely
 * read `data ?? []` without guarding.
 */
export function useCommandHistory(companyId: string | null, limit = 20) {
  return useQuery<IpcCommandHistoryEntry[]>({
    queryKey: ['command-history', companyId, limit],
    queryFn: () => {
      if (!companyId) return Promise.resolve([]);
      const req: CommandHistoryRequest = { companyId, limit };
      return ipc.command.history(req);
    },
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

/**
 * Static suggestion matches for a partial input. The main process
 * answers from a local table (no LLM call) so this query is cheap
 * enough to fire on every debounced keystroke.
 */
export function useCommandSuggest(partial: string, companyId: string | null, currentView?: string) {
  return useQuery<IpcSuggestItem[]>({
    queryKey: ['command-suggest', companyId, partial, currentView],
    queryFn: () => {
      if (!companyId || partial.trim().length === 0) return Promise.resolve([]);
      const req: CommandSuggestRequest = { partial, companyId, currentView };
      return ipc.command.suggest(req);
    },
    enabled: !!companyId && partial.trim().length > 0,
    staleTime: 5_000,
  });
}
