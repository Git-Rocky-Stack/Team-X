import type { Employee, Project, ProjectPriority } from '@team-x/shared-types';
import { CalendarDays, User } from 'lucide-react';

import { LampTile, type LampTone, RecessedWell, Tag } from '@/components/console/index.js';

const PRIORITY_TONE: Record<ProjectPriority, LampTone> = {
  critical: 'nogo',
  high: 'hold',
  medium: 'off',
  low: 'off',
};

const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface ProjectCardProps {
  project: Project;
  employees: Employee[];
  onClick: () => void;
}

export function ProjectCard({ project, employees, onClick }: ProjectCardProps) {
  const lead = project.leadId ? employees.find((e) => e.id === project.leadId) : null;
  const targetDate = project.targetDate ? new Date(project.targetDate) : null;
  const isOverdue =
    targetDate &&
    targetDate.getTime() < Date.now() &&
    !['completed', 'archived'].includes(project.status);

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <RecessedWell className="group cursor-pointer space-y-3 p-3 transition-transform hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-body-strong leading-snug text-[var(--display-fg)]">
            {project.title}
          </h4>
          <LampTile
            label={PRIORITY_LABEL[project.priority] ?? 'Medium'}
            tone={PRIORITY_TONE[project.priority] ?? 'off'}
            small
            interactive={false}
            className="shrink-0"
          />
        </div>

        {project.description && (
          <p className="line-clamp-2 text-caption text-silver-mute">{project.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {lead ? (
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-card border border-[var(--hairline)] text-[10px] font-bold text-[var(--display-fg)]">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <Tag>{lead.name}</Tag>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-silver-mute">
              <User className="h-3.5 w-3.5" />
              <span className="text-caption">No lead</span>
            </div>
          )}
          {targetDate && (
            <div
              className={`flex items-center gap-1.5 text-caption ${
                isOverdue ? 'text-led-nogo' : 'text-silver-mute'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{targetDate.toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </RecessedWell>
    </button>
  );
}
