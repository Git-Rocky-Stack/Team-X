import type { Employee, Ticket, TicketPriority } from '@team-x/shared-types';
import { Clock } from 'lucide-react';

import { LampTile, type LampTone, RecessedWell, Tag } from '@/components/console/index.js';

const PRIORITY_TONE: Record<TicketPriority, LampTone> = {
  critical: 'nogo',
  high: 'hold',
  medium: 'off',
  low: 'off',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface TicketCardProps {
  ticket: Ticket;
  employees: Employee[];
  onClick: () => void;
}

export function TicketCard({ ticket, employees, onClick }: TicketCardProps) {
  const assignee = ticket.assigneeId
    ? employees.find((employee) => employee.id === ticket.assigneeId)
    : null;

  const labels: string[] = (() => {
    try {
      return JSON.parse(ticket.labelsJson);
    } catch {
      return [];
    }
  })();

  const hasSla = ticket.slaHours !== null && ticket.slaHours > 0;
  const isOverdue = ticket.dueAt !== null && ticket.dueAt > 0 && Date.now() > ticket.dueAt;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left"
      data-ticket-card={ticket.id}
    >
      <RecessedWell className="group cursor-pointer space-y-3 p-3.5 transition-transform hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-body-strong leading-snug text-[var(--display-fg)]">
            {ticket.title}
          </h4>
          <LampTile
            label={PRIORITY_LABEL[ticket.priority] ?? 'Medium'}
            tone={PRIORITY_TONE[ticket.priority] ?? 'off'}
            small
            interactive={false}
            className="shrink-0"
          />
        </div>

        {ticket.description ? (
          <p className="line-clamp-2 text-caption text-silver-mute">{ticket.description}</p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {assignee ? (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-card border border-[var(--hairline)] text-[10px] font-semibold text-[var(--display-fg)]">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-caption text-silver-mute">{assignee.name}</span>
              </div>
            ) : (
              <span className="text-caption italic text-silver-mute">Unassigned</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {labels.length > 0 ? (
              <Tag>
                {labels[0]}
                {labels.length > 1 ? ` +${labels.length - 1}` : ''}
              </Tag>
            ) : null}
            {hasSla || isOverdue ? (
              <Clock
                className={`h-3.5 w-3.5 ${isOverdue ? 'text-led-nogo' : 'text-silver-mute'}`}
              />
            ) : null}
          </div>
        </div>
      </RecessedWell>
    </button>
  );
}
