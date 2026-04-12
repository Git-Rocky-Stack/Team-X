import type { Employee, Ticket, TicketStatus } from '@team-x/shared-types';
import { Plus } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useUpdateTicketStatus } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

import { TicketCard } from './ticket-card.js';

const COLUMNS: { status: TicketStatus; label: string; accent: string }[] = [
  { status: 'open', label: 'Open', accent: 'border-t-blue-500' },
  { status: 'in-progress', label: 'In Progress', accent: 'border-t-yellow-500' },
  { status: 'blocked', label: 'Blocked', accent: 'border-t-red-500' },
  { status: 'done', label: 'Done', accent: 'border-t-green-500' },
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
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;
    updateStatus.mutate({ ticketId, status: targetStatus });
  }

  return (
    <div className="flex h-full gap-4 p-4 overflow-x-auto">
      {COLUMNS.map((col) => {
        const colTickets = tickets.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            className={`flex w-72 shrink-0 flex-col rounded-lg border border-border/50 border-t-2 ${col.accent} bg-background`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h3>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                  {colTickets.length}
                </span>
              </div>
              {col.status === 'open' && (
                <button
                  type="button"
                  onClick={onCreateClick}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                  aria-label="Create ticket"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <ScrollArea className="flex-1 px-2 pb-2">
              <div className="flex flex-col gap-2">
                {colTickets.length === 0 && (
                  <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/40 text-[11px] text-muted-foreground/50">
                    {col.status === 'open' ? 'No open tickets' : 'None'}
                  </div>
                )}
                {colTickets.map((ticket) => (
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
