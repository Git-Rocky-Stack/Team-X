import type { Goal, GoalStatus } from '@team-x/shared-types';
import { Calendar, FolderKanban, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';

const STATUS_CONFIG: Record<GoalStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-500/10 text-blue-400' },
  achieved: { label: 'Achieved', color: 'bg-green-500/10 text-green-400' },
  abandoned: { label: 'Abandoned', color: 'bg-zinc-500/10 text-zinc-400' },
};

interface GoalRowProps {
  goal: Goal;
  projectCount: number;
  onClick: () => void;
  isActive: boolean;
}

export function GoalRow({ goal, projectCount, onClick, isActive }: GoalRowProps) {
  const statusConfig = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.active;

  const progressColor =
    goal.progressPct > 66 ? 'bg-green-500' : goal.progressPct > 33 ? 'bg-amber-500' : 'bg-red-500';

  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const isOverdue = targetDate && targetDate.getTime() < Date.now() && goal.status === 'active';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition-all hover:shadow-md ${
        isActive
          ? 'border-brand/50 bg-brand/5'
          : 'border-border/50 bg-surface-50 hover:border-border'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
        <Target className="h-4 w-4 text-brand" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-medium text-foreground">{goal.title}</h4>
          <Badge
            variant="outline"
            className={`shrink-0 border-0 text-[10px] ${statusConfig.color}`}
          >
            {statusConfig.label}
          </Badge>
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 max-w-[200px] rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full transition-all ${progressColor}`}
                style={{ width: `${goal.progressPct}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              {goal.progressPct}%
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {projectCount}
            </span>
            {targetDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : ''}`}>
                <Calendar className="h-3 w-3" />
                {targetDate.toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
