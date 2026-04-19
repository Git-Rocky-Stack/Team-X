import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useGoals(companyId: string | null) {
  return useQuery({
    queryKey: ['goals', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.goals.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useGoalDetail(goalId: string | null) {
  return useQuery({
    queryKey: ['goal-detail', goalId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.goals.get(goalId!),
    enabled: goalId !== null && goalId.length > 0,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.goals.create>[0]) => ipc.goals.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.goals.update>[0]) => ipc.goals.update(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-detail'] });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => ipc.goals.delete(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query goals cache when a lifecycle or indirectly-related
 * event lands for the current company.
 *
 * Subscribed events:
 * - `goal.created` — direct lifecycle emit from `goals.create`
 * - `goal.updated` — direct lifecycle emit from `goals.update`
 *   (carries recomputed normalized progress 0..1)
 * - `goal.deleted` — direct lifecycle emit from `goals.delete`
 * - `plan.approved` — plan approval rolls up to linked goal progress
 * - `task.delegated` — M32 planner writes a ticket that may belong
 *   to a project linked to a goal (affects aggregate progress)
 *
 * Why this exists: goal progress is a derived aggregate over linked
 * projects + tickets. When an agent tool lands a ticket via the M32
 * planner, the goal's aggregate progress may change on the next
 * `goalsRepo.get()` call even though no direct `goal.*` event was
 * emitted. Subscribing to the indirect events gets the renderer close
 * to real-time without waiting on a cache refetch.
 *
 * Phase 5.6 M-C step f (2026-04-18) closed the FOLLOWUP-P1 main-side
 * gap surfaced by `docs/qa/2026-04-18-ground-zero-audit.md` §3.1 —
 * `goal.*` lifecycle events now land on the bus and are subscribed
 * here alongside the pre-existing indirect events.
 */
export function useGoalEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'goal.created' &&
        event.type !== 'goal.updated' &&
        event.type !== 'goal.deleted' &&
        event.type !== 'plan.approved' &&
        event.type !== 'task.delegated'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['goals', companyId] });
      qc.invalidateQueries({ queryKey: ['goal-detail'] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
