import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
