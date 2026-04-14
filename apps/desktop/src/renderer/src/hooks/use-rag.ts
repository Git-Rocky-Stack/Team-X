/**
 * React Query hooks for the RAG subsystem IPC surface (Phase 5 — M29).
 *
 * Exposes:
 *   - `useRagConfig()` — full RAG configuration snapshot (toggle, top-K,
 *     threshold, max-tokens, embedding provider/model/dimension).
 *   - `useSetRagConfig()` — partial patch; invalidates both config and
 *     stats caches on success so the Settings panel re-reads the
 *     authoritative values from the main process after every write.
 *   - `useRagStats(companyId)` — per-company embedding stats for the
 *     summary card (chunk count, last-indexed-at, enabled flag).
 *   - `useRebuildRag(companyId)` — destructive rebuild-all action.
 *   - `useDeleteRag(companyId)` — destructive wipe-all action.
 *
 * All hooks route through the preload bridge via `@/lib/ipc`. The
 * renderer never reaches for `window.teamx` directly; swapping the
 * bridge or stubbing it for tests is a one-line change in `lib/ipc.ts`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SettingsSetRagConfigRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useRagConfig() {
  return useQuery({
    queryKey: ['rag-config'],
    queryFn: () => ipc.settings.getRagConfig(),
  });
}

export function useSetRagConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetRagConfigRequest) => ipc.settings.setRagConfig(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-config'] });
      queryClient.invalidateQueries({ queryKey: ['rag-stats'] });
    },
  });
}

export function useRagStats(companyId: string | null) {
  return useQuery({
    queryKey: ['rag-stats', companyId],
    queryFn: () => {
      if (!companyId) {
        throw new Error('rag-stats requires a non-null companyId');
      }
      return ipc.rag.stats(companyId);
    },
    enabled: !!companyId,
  });
}

export function useRebuildRag(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!companyId) {
        throw new Error('rag.rebuildAll requires a non-null companyId');
      }
      return ipc.rag.rebuildAll(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-stats', companyId] });
    },
  });
}

export function useDeleteRag(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!companyId) {
        throw new Error('rag.deleteForCompany requires a non-null companyId');
      }
      return ipc.rag.deleteForCompany(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-stats', companyId] });
    },
  });
}
