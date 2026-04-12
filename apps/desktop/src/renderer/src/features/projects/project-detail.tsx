import type { Employee } from '@team-x/shared-types';
import { ArrowLeft, Trash2, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useDeleteProject, useProjectDetail } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-400',
  active: 'bg-yellow-500/10 text-yellow-400',
  completed: 'bg-green-500/10 text-green-400',
  archived: 'bg-zinc-500/10 text-zinc-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400',
  high: 'bg-orange-500/10 text-orange-400',
  medium: 'bg-yellow-500/10 text-yellow-400',
  low: 'bg-muted/50 text-muted-foreground',
};

interface ProjectDetailPanelProps {
  projectId: string;
  employees: Employee[];
}

export function ProjectDetailPanel({ projectId }: ProjectDetailPanelProps) {
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const { data: detail, isLoading } = useProjectDetail(projectId);
  const deleteProject = useDeleteProject();

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center border-l border-border bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const lead = detail.lead;
  const statusColor = STATUS_COLORS[detail.status] ?? STATUS_COLORS.planning;
  const priorityColor = PRIORITY_COLORS[detail.priority] ?? PRIORITY_COLORS.medium;

  const progressPct =
    detail.ticketCounts.total > 0
      ? Math.round((detail.ticketCounts.done / detail.ticketCounts.total) * 100)
      : 0;

  const progressColor =
    progressPct > 66 ? 'bg-green-500' : progressPct > 33 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveProjectId(null)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          aria-label="Close detail panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{detail.title}</h2>
        <button
          type="button"
          onClick={() => {
            deleteProject.mutate(detail.id, {
              onSuccess: () => setActiveProjectId(null),
            });
          }}
          className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`border-0 text-[10px] ${statusColor}`}>
              {detail.status}
            </Badge>
            <Badge variant="outline" className={`border-0 text-[10px] ${priorityColor}`}>
              {detail.priority}
            </Badge>
          </div>

          {detail.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{detail.description}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Lead
            </span>
            {lead ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-[11px] font-bold text-brand">
                  {lead.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{lead.name}</p>
                  <p className="text-[10px] text-muted-foreground">{lead.title}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground/50">
                <User className="h-3.5 w-3.5" />
                <span className="text-xs">No lead assigned</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Ticket Progress
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full transition-all ${progressColor}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                {detail.ticketCounts.done}/{detail.ticketCounts.total}
              </span>
            </div>
          </div>

          {detail.ticketIds.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Linked Tickets ({detail.ticketIds.length})
              </span>
              <div className="flex flex-col gap-1">
                {detail.ticketIds.map((tid) => (
                  <div
                    key={tid}
                    className="rounded-md bg-surface-50 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  >
                    {tid.slice(0, 8)}...
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground/50">
            Created {new Date(detail.createdAt).toLocaleDateString()}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
