import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useCloudWorkspaceLink(companyId: string | null) {
  return useQuery({
    queryKey: ['cloud-link', companyId],
    queryFn: () => autonomyClient.cloud.getWorkspaceLink(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

function invalidateCloudLink(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  if (!companyId) return;
  void qc.invalidateQueries({ queryKey: ['cloud-link', companyId] });
}

export function useLinkWorkspace(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      autonomyClient.cloud.linkWorkspace({ companyId: requireString(companyId, 'companyId') }),
    onSuccess: () => invalidateCloudLink(queryClient, companyId),
  });
}

export function useUnlinkWorkspace(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      autonomyClient.cloud.unlinkWorkspace({ companyId: requireString(companyId, 'companyId') }),
    onSuccess: () => invalidateCloudLink(queryClient, companyId),
  });
}

export function useReconnectWorkspace(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      autonomyClient.cloud.reconnectWorkspace({
        companyId: requireString(companyId, 'companyId'),
      }),
    onSuccess: () => invalidateCloudLink(queryClient, companyId),
  });
}
