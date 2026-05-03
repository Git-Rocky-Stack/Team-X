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
      qc.invalidateQueries({ queryKey: ['schedule'] });
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
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useAddTicketParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; employeeId: string }) => ipc.tickets.addParticipant(req),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', variables.ticketId] });
    },
  });
}

export function useRemoveTicketParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; employeeId: string }) =>
      ipc.tickets.removeParticipant(req),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', variables.ticketId] });
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
      qc.invalidateQueries({ queryKey: ['schedule'] });
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
      qc.invalidateQueries({ queryKey: ['schedule'] });
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
 * - `ticket.created` — direct lifecycle emit from `tickets.create`
 * - `ticket.updated` — direct lifecycle emit from `tickets.update`
 * - `ticket.assigned` — direct lifecycle emit from `tickets.assign`
 *   (also fires inside `tickets.create` when immediate-assign is used)
 * - `ticket.participantAdded` / `ticket.participantRemoved` — direct
 *   lifecycle emits from the ticket participant menu
 * - `ticket.closed` — direct lifecycle emit from `tickets.close`
 * - `ticket.reopened` — direct lifecycle emit from `tickets.reopen`
 * - `ticket.commentAdded` — direct lifecycle emit from `tickets.addComment`
 * - `ticket.attachmentAdded` — direct lifecycle emit from `tickets.attachFile`
 *   (FOLLOWUP-P1-extended; invalidates `['ticket-attachments', ticketId]`)
 * - `ticket.attachmentRemoved` — direct lifecycle emit from `tickets.detachFile`
 *   (FOLLOWUP-P1-extended; invalidates `['ticket-attachments', ticketId]`)
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
 * Phase 5.6 M-C step f (2026-04-18) closed the FOLLOWUP-P1 main-side
 * gap surfaced by `docs/qa/2026-04-18-ground-zero-audit.md` §3.1 —
 * `ticket.*` lifecycle events now land on the bus and are subscribed
 * here alongside the pre-existing M32 planner events.
 *
 * Phase 5.6 M-C FOLLOWUP-P1-extended (2026-04-18) closed the attachment
 * portion of the FOLLOWUP-P1 gap (BUG-011 from
 * `docs/qa/2026-04-18-autonomous-run-report.md` §4.3) — attachment adds
 * and removes now fire bus events and invalidate the
 * `['ticket-attachments', ticketId]` query keyed per-ticket.
 */
export function useTicketEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'ticket.created' &&
        event.type !== 'ticket.updated' &&
        event.type !== 'ticket.assigned' &&
        event.type !== 'ticket.participantAdded' &&
        event.type !== 'ticket.participantRemoved' &&
        event.type !== 'ticket.closed' &&
        event.type !== 'ticket.reopened' &&
        event.type !== 'ticket.commentAdded' &&
        event.type !== 'ticket.attachmentAdded' &&
        event.type !== 'ticket.attachmentRemoved' &&
        event.type !== 'task.delegated' &&
        event.type !== 'task.escalated'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['tickets', companyId] });
      qc.invalidateQueries({ queryKey: ['ticket-detail'] });
      // Narrow attachment-specific invalidation — keyed per-ticket so
      // detail panels refresh immediately without pulling the parent
      // ticket-list query twice.
      if (event.type === 'ticket.attachmentAdded' || event.type === 'ticket.attachmentRemoved') {
        const payload = event.payload as { ticketId?: string } | undefined;
        if (payload && typeof payload.ticketId === 'string' && payload.ticketId.length > 0) {
          qc.invalidateQueries({ queryKey: ['ticket-attachments', payload.ticketId] });
        }
      }
    });
    return unsubscribe;
  }, [companyId, qc]);
}
