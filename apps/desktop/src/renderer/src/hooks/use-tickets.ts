import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useTickets(companyId: string | null) {
  return useQuery({
    queryKey: ['tickets', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.tickets.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useTicketDetail(ticketId: string | null) {
  return useQuery({
    queryKey: ['ticket-detail', ticketId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.tickets.get(ticketId!),
    enabled: ticketId !== null && ticketId.length > 0,
    refetchInterval: 3000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.tickets.create>[0]) => ipc.tickets.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAssignTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; assigneeId: string }) => ipc.tickets.assign(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    },
  });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; status: string }) =>
      ipc.tickets.update({ ticketId: req.ticketId, status: req.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    },
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => ipc.tickets.close(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    },
  });
}

export function useAddTicketComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; content: string }) => ipc.tickets.addComment(req),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket-detail', variables.ticketId] });
    },
  });
}

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query tickets cache when an event that mutates tickets lands
 * for the current company.
 *
 * Subscribed events:
 * - `task.delegated` — M32 planner tool writes a new ticket
 * - `task.escalated` — M32 planner bumps a subtask up the org chart
 *
 * Why this exists: React Query's `onSuccess` invalidation only fires
 * for mutations triggered from this renderer. When an agent tool
 * (M32 `delegate_subtask`), orchestrator, or E2E spec writes a ticket
 * directly through IPC, the query cache stays stale until the next
 * manual refetch. Per architectural invariant #11, the renderer must
 * listen to the append-only bus for invalidation when mutation origin
 * is not local.
 *
 * Mount once inside `TicketsView`; the hook scopes its filter to the
 * active `companyId` so multi-company setups don't cross-invalidate.
 *
 * FOLLOWUP-P1 (main-side Invariant #11 gap): The `tickets.create`,
 * `tickets.update`, `tickets.close`, `tickets.reopen`, `tickets.assign`,
 * `tickets.addComment` IPC handlers do NOT currently emit bus events.
 * A `ticket.closed` literal appears in JSDoc but is NOT in the
 * `EventType` union today. Once those events are added on the main
 * side this subscription list expands to include them.
 *
 * Added 2026-04-18 per `docs/qa/2026-04-18-ground-zero-audit.md` §3.1.
 */
export function useTicketEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (event.type !== 'task.delegated' && event.type !== 'task.escalated') {
        return;
      }
      qc.invalidateQueries({ queryKey: ['tickets', companyId] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
