import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useRuntimeProfiles(companyId: string | null) {
  return useQuery({
    queryKey: ['runtime-profiles', companyId],
    queryFn: () => autonomyClient.runtimeProfiles.list(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.runtimeProfiles.create,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useUpdateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.runtimeProfiles.update,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useDeleteRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => autonomyClient.runtimeProfiles.delete(profileId),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useBindEmployeeRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.runtimeProfiles.bindEmployee,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useValidateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.runtimeProfiles.validate,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}
