import type { Employee, Project, ProjectPriority } from '@team-x/shared-types';
import { AlertTriangle, ArrowUpCircle, Minus, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';

const PRIORITY_CONFIG: Record<
  ProjectPriority,
  { icon: typeof Minus; color: string; bg: string; label: string }
> = {
  critical: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Critical' },
  high: { icon: ArrowUpCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'High' },
  medium: { icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Medium' },
  low: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Low' },
};

interface ProjectCardProps {
  project: Project;
  employees: Employee[];
  onClick: () => void;
}

export function ProjectCard({ project, employees, onClick }: ProjectCardProps) {
  const priority = PRIORITY_CONFIG[project.priority] ?? PRIORITY_CONFIG.medium;
  const PriorityIcon = priority.icon;
  const lead = project.leadId ? employees.find((e) => e.id === project.leadId) : null;

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <Card className="group cursor-pointer border-border/50 bg-surface-50 p-3 transition-all hover:border-border hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium leading-snug text-foreground line-clamp-2">
            {project.title}
          </h4>
          <Badge
            variant="outline"
            className={`shrink-0 gap-1 text-[10px] ${priority.bg} ${priority.color} border-0`}
          >
            <PriorityIcon className="h-3 w-3" />
            {priority.label}
          </Badge>
        </div>

        {project.description && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {lead ? (
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-[10px] font-bold text-brand">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] text-muted-foreground">{lead.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground/50">
              <User className="h-3.5 w-3.5" />
              <span className="text-[11px]">No lead</span>
            </div>
          )}
        </div>
      </Card>
    </button>
  );
}
