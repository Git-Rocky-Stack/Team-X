import type { Employee, Ticket, TicketStatus } from '@team-x/shared-types';
import { Plus } from 'lucide-react';

import { TicketCard } from './ticket-card.js';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useUpdateTicketStatus } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';


const COLUMNS: {
  status: TicketStatus;
  label: string;
  accentClassName: string;
  badgeClassName: string;
}[] = [
  {
    status: 'open',
    label: 'Open',
    accentClassName: 'border-sky-500/30',
    badgeClassName: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  },
  {
    status: 'in-progress',
    label: 'In Progress',
    accentClassName: 'border-amber-500/30',
    badgeClassName: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  },
  {
    status: 'blocked',
    label: 'Blocked',
    accentClassName: 'border-red-500/30',
    badgeClassName: 'border-red-500/20 bg-red-500/10 text-red-200',
  },
  {
    status: 'done',
    label: 'Done',
    accentClassName: 'border-emerald-500/30',
    badgeClassName: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  },
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
          <div
            key={column.status}
            className={`mission-chrome-panel flex w-[18rem] shrink-0 flex-col rounded-[24px] border bg-black/15 ${column.accentClassName}`}
            data-tickets-column={column.status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.status)}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {column.label}
                  </h3>
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold ${column.badgeClassName}`}
                  >
                    {columnTickets.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {column.status === 'done'
                    ? 'Delivered work and closed follow-through.'
                    : 'Drag work here to update operational status.'}
                </p>
              </div>

              {column.status === 'open' ? (
                <button
                  type="button"
                  onClick={onCreateClick}
                  className="rounded-[14px] border border-white/10 bg-black/20 p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                  aria-label="Create ticket"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <ScrollArea className="flex-1 px-3 py-3">
              <div className="flex flex-col gap-3">
                {columnTickets.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/10 text-center text-[11px] leading-5 text-muted-foreground/70">
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
          </div>
        );
      })}
    </div>
  );
}
