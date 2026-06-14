import { useQueryClient } from '@tanstack/react-query';
import type { DashboardEvent } from '@team-x/shared-types';
import { useEffect } from 'react';

import { isBoardQueueEvent } from '@/app/board-queue-unread.js';
import { ipc } from '@/lib/ipc.js';

/**
 * Board-queue event sync — the single subscription definition shared by the
 * BoardMessageQueue panel and the annunciator QUE lamp. Mirrors the
 * `useTicketEventSync` / `useMeetingEventSync` family: each consuming surface
 * mounts it with the active companyId, and React Query dedupes the refetches
 * when more than one surface is mounted. Replaces the two byte-identical
 * inline subscriptions that previously lived in `board-message-queue.tsx` and
 * `annunciator-rail-data.ts`.
 */
export function useBoardQueueEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.companyId !== companyId || !isBoardQueueEvent(event.type)) return;
      qc.invalidateQueries({ queryKey: ['threads', companyId] });
      qc.invalidateQueries({ queryKey: ['tickets', companyId] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
