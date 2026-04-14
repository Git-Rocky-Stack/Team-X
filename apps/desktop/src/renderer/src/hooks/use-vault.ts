import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useVaultFiles(companyId: string | null) {
  return useQuery({
    queryKey: ['vault', 'files', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.vault.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useVaultSearch(companyId: string | null, query: string) {
  return useQuery({
    queryKey: ['vault', 'search', companyId, query],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.vault.search(companyId!, query),
    enabled: companyId !== null && companyId.length > 0 && query.trim().length > 0,
  });
}

export function useVaultStats(companyId: string | null) {
  return useQuery({
    queryKey: ['vault', 'stats', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.vault.stats(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useVaultUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { companyId: string; sourcePath: string; tags?: string[] }) =>
      ipc.vault.upload(req),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vault', 'files', variables.companyId] });
      queryClient.invalidateQueries({ queryKey: ['vault', 'stats', variables.companyId] });
    },
  });
}

export function useVaultDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => ipc.vault.delete(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault'] });
    },
  });
}

export function useVaultVerify() {
  return useMutation({
    mutationFn: (fileId: string) => ipc.vault.verify(fileId),
  });
}

/**
 * Subscribe to main-process vault event fan-out and invalidate the
 * React Query vault cache when a `vault.file_created` /
 * `vault.file_deleted` event lands for the current company.
 *
 * Why this exists: the E2E spec (and, in the future, any main-process
 * writer other than `useVaultUpload`/`useVaultDelete` — e.g., agent
 * tools, restored backups) bypasses the mutation pipeline's
 * `onSuccess` invalidation. Without a main→renderer signal the query
 * cache is stale until the next manual refetch. Driving invalidation
 * off the append-only event bus matches architectural invariant #6
 * (events are source of truth for realtime state).
 *
 * Mount once inside `VaultView`; the hook scopes its filter to the
 * active `companyId` so multi-company setups don't cross-invalidate.
 *
 * Added M30 T0 to close the vault-backup E2E staleness regression.
 * See `docs/plans/2026-04-13-vault-backup-regression-findings.md`.
 */
export function useVaultEventSync(companyId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (event.type !== 'vault.file_created' && event.type !== 'vault.file_deleted') return;
      queryClient.invalidateQueries({ queryKey: ['vault', 'files', companyId] });
      queryClient.invalidateQueries({ queryKey: ['vault', 'stats', companyId] });
      queryClient.invalidateQueries({ queryKey: ['vault', 'search', companyId] });
    });
    return unsubscribe;
  }, [companyId, queryClient]);
}
