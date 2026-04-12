import type { Employee, Ticket } from '@team-x/shared-types';
import { AlertTriangle, ArrowUpCircle, Clock, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';

const PRIORITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Critical' },
  high: { icon: ArrowUpCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'High' },
  medium: { icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Medium' },
  low: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Low' },
} as const;

interface TicketCardProps {
  ticket: Ticket;
  employees: Employee[];
  onClick: () => void;
}

export function TicketCard({ ticket, employees, onClick }: TicketCardProps) {
  const priority = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.medium;
  const PriorityIcon = priority.icon;
  const assignee = ticket.assigneeId ? employees.find((e) => e.id === ticket.assigneeId) : null;

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
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card className="group cursor-pointer border-border/50 bg-surface-50 p-3 transition-all hover:border-border hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium leading-snug text-foreground line-clamp-2">
            {ticket.title}
          </h4>
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 text-[10px] ${priority.bg} ${priority.color} border-0`}
          >
            <PriorityIcon className="h-3 w-3" />
            {priority.label}
          </Badge>
        </div>

        {ticket.description && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {assignee && (
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px] font-medium text-brand">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] text-muted-foreground">{assignee.name}</span>
              </div>
            )}
            {!assignee && (
              <span className="text-[11px] text-muted-foreground/60 italic">Unassigned</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {labels.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {labels[0]}
                {labels.length > 1 && ` +${labels.length - 1}`}
              </Badge>
            )}
            {(hasSla || isOverdue) && (
              <Clock
                className={`h-3 w-3 ${isOverdue ? 'text-red-400' : 'text-muted-foreground/50'}`}
              />
            )}
          </div>
        </div>
      </Card>
    </button>
  );
}
