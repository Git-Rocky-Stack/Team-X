import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useRuntimeProfiles(companyId: string | null) {
  return useQuery({
    queryKey: ['runtime-profiles', companyId],
    queryFn: () => ipc.runtimeProfiles.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.runtimeProfiles.create,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useUpdateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.runtimeProfiles.update,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useDeleteRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => ipc.runtimeProfiles.delete(profileId),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useBindEmployeeRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.runtimeProfiles.bindEmployee,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}

export function useValidateRuntimeProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.runtimeProfiles.validate,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['runtime-profiles', companyId] });
    },
  });
}
