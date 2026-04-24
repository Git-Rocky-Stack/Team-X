import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useOperators(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', companyId],
    queryFn: () => autonomyClient.operators.list(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useSharingReadiness(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', 'sharing-readiness', companyId],
    queryFn: () => autonomyClient.operators.readiness(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useOperatorInvites(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', 'invites', companyId],
    queryFn: () => autonomyClient.operators.listInvites(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateOperatorInvite(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.operators.createInvite,
    onSuccess: () => {
      if (!companyId) return;
      void queryClient.invalidateQueries({ queryKey: ['operators', 'invites', companyId] });
      void queryClient.invalidateQueries({
        queryKey: ['operators', 'sharing-readiness', companyId],
      });
    },
  });
}

export function useRevokeOperatorInvite(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.operators.revokeInvite,
    onSuccess: () => {
      if (!companyId) return;
      void queryClient.invalidateQueries({ queryKey: ['operators', 'invites', companyId] });
      void queryClient.invalidateQueries({
        queryKey: ['operators', 'sharing-readiness', companyId],
      });
    },
  });
}

export function useAcceptOperatorInvite(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.operators.acceptInvite,
    onSuccess: () => {
      if (!companyId) return;
      void queryClient.invalidateQueries({ queryKey: ['operators', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['operators', 'invites', companyId] });
      void queryClient.invalidateQueries({
        queryKey: ['operators', 'sharing-readiness', companyId],
      });
    },
  });
}
