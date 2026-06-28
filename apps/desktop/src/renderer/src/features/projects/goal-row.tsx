import type { Goal, GoalStatus } from '@team-x/shared-types';
import { Calendar, FolderKanban, Target } from 'lucide-react';

import { LampTile, type LampTone, VuMeter } from '@/components/console/index.js';

const STATUS_TONE: Record<GoalStatus, LampTone> = {
  active: 'exec',
  achieved: 'go',
  abandoned: 'off',
};

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'Active',
  achieved: 'Achieved',
  abandoned: 'Abandoned',
};

interface GoalRowProps {
  goal: Goal;
  projectCount: number;
  onClick: () => void;
  isActive: boolean;
}

export function GoalRow({ goal, projectCount, onClick, isActive }: GoalRowProps) {
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
  const isOverdue = targetDate && targetDate.getTime() < Date.now() && goal.status === 'active';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-card border px-4 py-3 text-left transition-all hover:shadow-md ${
        isActive
          ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)]'
          : 'border-[var(--hairline)] hover:border-[var(--hairline-strong)]'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-[var(--hairline)]">
        <Target className="h-4 w-4 text-silver-mute" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-body-strong text-foreground">{goal.title}</h4>
          <LampTile
            label={STATUS_LABEL[goal.status] ?? 'Active'}
            tone={STATUS_TONE[goal.status] ?? 'off'}
            small
            interactive={false}
            className="shrink-0"
          />
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <VuMeter
              className="max-w-[200px] flex-1"
              label="Goal progress"
              value={goal.progressPct / 100}
            />
            <span className="text-caption font-medium text-silver-mute">{goal.progressPct}%</span>
          </div>

          <div className="flex items-center gap-3 text-caption text-silver-mute">
            <span className="flex items-center gap-1">
              <FolderKanban className="h-3 w-3" />
              {projectCount}
            </span>
            {targetDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-led-nogo' : ''}`}>
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
