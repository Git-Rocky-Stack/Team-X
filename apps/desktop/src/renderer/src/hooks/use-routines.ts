import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';

export function useRoutines(companyId: string | null) {
  return useQuery({
    queryKey: ['routines', companyId],
    queryFn: () => autonomyClient.routines.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useRoutineRuns(companyId: string | null, routineId?: string | null, limit = 20) {
  return useQuery({
    queryKey: ['routine-runs', companyId, routineId ?? null, limit],
    queryFn: () =>
      autonomyClient.routines.listRuns({
        companyId: companyId!,
        routineId: routineId ?? undefined,
        limit,
      }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

function invalidateRoutineQueries(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  if (!companyId) return;
  qc.invalidateQueries({ queryKey: ['routines', companyId] });
  qc.invalidateQueries({ queryKey: ['routine-runs', companyId] });
}

export function useCreateRoutine(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.routines.create,
    onSuccess: () => invalidateRoutineQueries(qc, companyId),
  });
}

export function useUpdateRoutine(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.routines.update,
    onSuccess: () => invalidateRoutineQueries(qc, companyId),
  });
}

export function useDeleteRoutine(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => autonomyClient.routines.delete(routineId),
    onSuccess: () => invalidateRoutineQueries(qc, companyId),
  });
}

export function useRunRoutineNow(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.routines.runNow,
    onSuccess: () => invalidateRoutineQueries(qc, companyId),
  });
}
