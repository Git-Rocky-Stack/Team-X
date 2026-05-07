import type { Employee, Ticket } from '@team-x/shared-types';
import { AlertTriangle, ArrowUpCircle, Clock, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';

const PRIORITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    color: 'text-red-300',
    background: 'border-red-500/20 bg-red-500/10',
    label: 'Critical',
  },
  high: {
    icon: ArrowUpCircle,
    color: 'text-orange-300',
    background: 'border-orange-500/20 bg-orange-500/10',
    label: 'High',
  },
  medium: {
    icon: Minus,
    color: 'text-yellow-200',
    background: 'border-yellow-500/20 bg-yellow-500/10',
    label: 'Medium',
  },
  low: {
    icon: Minus,
    color: 'text-muted-foreground',
    background: 'border-white/10 bg-black/20',
    label: 'Low',
  },
} as const;

interface TicketCardProps {
  ticket: Ticket;
  employees: Employee[];
  onClick: () => void;
}

export function TicketCard({ ticket, employees, onClick }: TicketCardProps) {
  const priority = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium;
  const PriorityIcon = priority.icon;
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
      <Card className="mission-chrome-panel group cursor-pointer rounded-[20px] border border-white/10 bg-black/10 p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-[0_24px_60px_-42px_hsl(var(--mission-red)/0.85)]">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-body-strong leading-snug text-foreground">
            {ticket.title}
          </h4>
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 border text-[10px] ${priority.background} ${priority.color}`}
          >
            <PriorityIcon className="h-3 w-3" />
            {priority.label}
          </Badge>
        </div>

        {ticket.description ? (
          <p className="mt-2 line-clamp-2 text-caption text-muted-foreground">
            {ticket.description}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {assignee ? (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-brand/10 text-[10px] font-semibold text-brand">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-caption text-muted-foreground">{assignee.name}</span>
              </div>
            ) : (
              <span className="text-caption italic text-muted-foreground/70">Unassigned</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {labels.length > 0 ? (
              <Badge
                variant="outline"
                className="border-white/10 bg-black/20 px-1.5 py-0 text-[9px] text-muted-foreground"
              >
                {labels[0]}
                {labels.length > 1 ? ` +${labels.length - 1}` : ''}
              </Badge>
            ) : null}
            {hasSla || isOverdue ? (
              <Clock
                className={`h-3.5 w-3.5 ${isOverdue ? 'text-red-300' : 'text-muted-foreground/60'}`}
              />
            ) : null}
          </div>
        </div>
      </Card>
    </button>
  );
}
