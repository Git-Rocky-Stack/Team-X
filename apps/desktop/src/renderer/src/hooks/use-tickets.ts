import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
