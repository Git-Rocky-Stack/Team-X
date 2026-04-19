import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { useTicketEventSync, useTickets } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

import { CreateTicketDialog } from './create-ticket-dialog.js';
import { KanbanBoard } from './kanban-board.js';
import { TicketDetailPanel } from './ticket-detail.js';

interface TicketsViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function TicketsView({ companyId, employees }: TicketsViewProps) {
  const { data: tickets = [], isLoading, isError, refetch } = useTickets(companyId);
  useTicketEventSync(companyId);
  const activeTicketId = useAppStore((s) => s.activeTicketId);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading tickets...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-muted-foreground">Failed to load tickets</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-hidden ${activeTicketId ? 'hidden lg:block' : ''}`}>
        <KanbanBoard
          tickets={tickets}
          employees={employees}
          onCreateClick={() => setCreateOpen(true)}
        />
      </div>

      {activeTicketId && (
        <div className="w-full lg:w-[400px] shrink-0">
          <TicketDetailPanel ticketId={activeTicketId} employees={employees} />
        </div>
      )}

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        employees={employees}
      />
    </div>
  );
}
