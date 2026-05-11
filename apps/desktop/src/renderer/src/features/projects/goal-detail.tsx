import type { Employee } from '@team-x/shared-types';
import { ArrowLeft, FolderKanban, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useDeleteGoal, useGoalDetail } from '@/hooks/use-goals.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-brand/10 text-brand',
  achieved: 'bg-green-500/10 text-green-400',
  abandoned: 'bg-zinc-500/10 text-zinc-400',
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planning: 'text-brand',
  active: 'text-yellow-400',
  completed: 'text-green-400',
  archived: 'text-zinc-400',
};

interface GoalDetailPanelProps {
  goalId: string;
  employees: Employee[];
}

export function GoalDetailPanel({ goalId, employees }: GoalDetailPanelProps) {
  const setActiveGoalId = useAppStore((s) => s.setActiveGoalId);
  const { data: detail, isLoading } = useGoalDetail(goalId);
  const deleteGoal = useDeleteGoal();

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center border-l border-border bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const statusColor = STATUS_COLORS[detail.status] ?? STATUS_COLORS.active;
  const progressColor =
    detail.progressPct > 66
      ? 'bg-green-500'
      : detail.progressPct > 33
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveGoalId(null)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          aria-label="Close detail panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 truncate text-h3 text-foreground">{detail.title}</h2>
        <button
          type="button"
          onClick={() => {
            deleteGoal.mutate(detail.id, {
              onSuccess: () => setActiveGoalId(null),
            });
          }}
          className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label="Delete goal"
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
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow-sm text-muted-foreground/70">Progress</span>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${progressColor}`}
                  style={{ width: `${detail.progressPct}%` }}
                />
              </div>
              <span className="text-caption font-semibold text-foreground">
                {detail.progressPct}%
              </span>
            </div>
          </div>

          {detail.description && (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow-sm text-muted-foreground/70">Description</span>
              <p className="text-caption text-muted-foreground">{detail.description}</p>
            </div>
          )}

          {detail.targetDate && (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow-sm text-muted-foreground/70">Target Date</span>
              <p className="text-caption text-foreground">
                {new Date(detail.targetDate).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow-sm text-muted-foreground/70">
              Projects ({detail.projects.length})
            </span>
            {detail.projects.length === 0 ? (
              <p className="text-caption text-muted-foreground/50">
                No projects linked to this goal.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detail.projects.map((project) => {
                  const lead = project.leadId
                    ? employees.find((e) => e.id === project.leadId)
                    : null;
                  const projectStatusColor =
                    PROJECT_STATUS_COLORS[project.status] ?? PROJECT_STATUS_COLORS.planning;
                  return (
                    <div
                      key={project.id}
                      className="flex items-center gap-2 rounded-md bg-surface-50 px-3 py-2"
                    >
                      <FolderKanban className={`h-3.5 w-3.5 ${projectStatusColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-medium text-foreground">
                          {project.title}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {project.status}
                          {lead ? ` \u00B7 ${lead.name}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-caption text-muted-foreground/50">
            Created {new Date(detail.createdAt).toLocaleDateString()}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
