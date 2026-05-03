import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

interface UseScheduleItemsOptions {
  from?: number;
  to?: number;
  includeDerived?: boolean;
}

export function useScheduleItems(companyId: string | null, options: UseScheduleItemsOptions = {}) {
  return useQuery({
    queryKey: [
      'schedule',
      companyId,
      options.from ?? null,
      options.to ?? null,
      options.includeDerived ?? true,
    ],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.schedule.list({ companyId: companyId!, ...options }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.schedule.create>[0]) => ipc.schedule.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useUpdateScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.schedule.update>[0]) => ipc.schedule.update(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useCompleteScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleItemId: string) => ipc.schedule.complete(scheduleItemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useDeleteScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleItemId: string) => ipc.schedule.delete(scheduleItemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useScheduleEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'schedule.created' &&
        event.type !== 'schedule.updated' &&
        event.type !== 'schedule.completed' &&
        event.type !== 'schedule.deleted' &&
        event.type !== 'ticket.created' &&
        event.type !== 'ticket.updated' &&
        event.type !== 'ticket.assigned' &&
        event.type !== 'ticket.closed' &&
        event.type !== 'ticket.reopened' &&
        event.type !== 'project.created' &&
        event.type !== 'project.updated' &&
        event.type !== 'project.deleted' &&
        event.type !== 'goal.created' &&
        event.type !== 'goal.updated' &&
        event.type !== 'goal.deleted'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['schedule', companyId] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
