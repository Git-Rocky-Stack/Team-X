import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useTicketAttachments(ticketId: string | null) {
  return useQuery({
    queryKey: ['ticket-attachments', ticketId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.tickets.listAttachments(ticketId!),
    enabled: ticketId !== null && ticketId.length > 0,
  });
}

export function useAttachFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; fileId: string }) => ipc.tickets.attachFile(req),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-attachments', variables.ticketId] });
    },
  });
}

export function useDetachFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { ticketId: string; fileId: string }) => ipc.tickets.detachFile(req),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-attachments', variables.ticketId] });
    },
  });
}
