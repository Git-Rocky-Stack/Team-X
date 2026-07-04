import type { Employee, Ticket, TicketStatus } from '@team-x/shared-types';
import { Plus } from 'lucide-react';

import { TicketCard } from './ticket-card.js';

import { LampTile, type LampTone, RecessedWell, Tag } from '@/components/console/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useUpdateTicketStatus } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_TONE: Record<TicketStatus, LampTone> = {
  open: 'hold',
  'in-progress': 'exec',
  blocked: 'nogo',
  done: 'go',
};

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: 'open', label: 'Open' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
];

interface KanbanBoardProps {
  tickets: Ticket[];
  employees: Employee[];
  onCreateClick: () => void;
}

export function KanbanBoard({ tickets, employees, onCreateClick }: KanbanBoardProps) {
  const setActiveTicketId = useAppStore((s) => s.setActiveTicketId);
  const updateStatus = useUpdateTicketStatus();

  function handleDragStart(e: React.DragEvent, ticketId: string) {
    e.dataTransfer.setData('text/plain', ticketId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, targetStatus: TicketStatus) {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData('text/plain');
    if (!ticketId) return;
    const ticket = tickets.find((candidate) => candidate.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;
    updateStatus.mutate({ ticketId, status: targetStatus });
  }

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4" data-tickets-board="">
      {COLUMNS.map((column) => {
        const columnTickets = tickets.filter((ticket) => ticket.status === column.status);
        return (
          <RecessedWell
            key={column.status}
            data-tickets-column={column.status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.status)}
            className="flex w-[18rem] shrink-0 flex-col overflow-hidden p-0"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <LampTile
                    label={column.label}
                    tone={STATUS_TONE[column.status]}
                    small
                    interactive={false}
                  />
                  <Tag mono>{columnTickets.length}</Tag>
                </div>
                <p className="text-caption text-silver-mute">
                  {column.status === 'done'
                    ? 'Delivered work and closed follow-through.'
                    : 'Drag work here to update operational status.'}
                </p>
              </div>

              {column.status === 'open' ? (
                <button
                  type="button"
                  onClick={onCreateClick}
                  className="cap flex h-9 w-9 shrink-0 items-center justify-center"
                  aria-label="Create ticket"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <ScrollArea className="flex-1 px-3 py-3">
              <div className="flex flex-col gap-3">
                {columnTickets.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-card border border-dashed border-[var(--hairline)] text-center text-caption text-silver-mute">
                    {column.status === 'open'
                      ? 'No backlog yet. File the first ticket to seed this queue.'
                      : 'No tickets in this lane right now.'}
                  </div>
                ) : null}

                {columnTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ticket.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <TicketCard
                      ticket={ticket}
                      employees={employees}
                      onClick={() => setActiveTicketId(ticket.id)}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </RecessedWell>
        );
      })}
    </div>
  );
}
