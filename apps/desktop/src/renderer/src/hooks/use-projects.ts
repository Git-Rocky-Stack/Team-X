import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

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

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query projects cache when an event that mutates project
 * state lands for the current company.
 *
 * Subscribed events:
 * - `plan.proposed` — M32 `decompose_project` tool outputs a plan
 * - `plan.approved` — plan gets approved (M33 prep)
 * - `task.delegated` — M32 planner links a new ticket into a project
 *
 * Why this exists: the M32 task planner writes tickets and links them
 * to projects via the agentic loop — these flows never pass through
 * the renderer, so React Query `onSuccess` invalidation is blind to
 * them. Per invariant #11 the renderer listens to the append-only bus
 * for cross-process mutation signals.
 *
 * FOLLOWUP-P1: The `projects.create` / `projects.update` /
 * `projects.delete` IPC handlers currently do NOT emit bus events.
 * That is a main-side Invariant #11 gap flagged for a follow-up
 * milestone. This renderer sync hook catches the agentic flows today;
 * when the main-side gap closes the subscription set expands.
 *
 * Added 2026-04-18 per `docs/qa/2026-04-18-ground-zero-audit.md` §3.1.
 */
export function useProjectEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'plan.proposed' &&
        event.type !== 'plan.approved' &&
        event.type !== 'task.delegated'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['projects', companyId] });
      qc.invalidateQueries({ queryKey: ['project-detail'] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
