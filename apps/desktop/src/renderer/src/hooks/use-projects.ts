import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useProjects(companyId: string | null) {
  return useQuery({
    queryKey: ['projects', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.projects.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useProjectDetail(projectId: string | null) {
  return useQuery({
    queryKey: ['project-detail', projectId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.projects.get(projectId!),
    enabled: projectId !== null && projectId.length > 0,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.projects.create>[0]) => ipc.projects.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.projects.update>[0]) => ipc.projects.update(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-detail'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-detail'] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => ipc.projects.delete(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-detail'] });
    },
  });
}

export function useLinkTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ticketId }: { projectId: string; ticketId: string }) =>
      ipc.projects.linkTicket(projectId, ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-detail'] });
    },
  });
}

export function useUnlinkTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ticketId }: { projectId: string; ticketId: string }) =>
      ipc.projects.unlinkTicket(projectId, ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-detail'] });
    },
  });
}
