import type { Employee, ProjectStatus } from '@team-x/shared-types';
import { ArrowLeft, Trash2 } from 'lucide-react';

import {
  LampTile,
  type LampTone,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useDeleteGoal, useGoalDetail } from '@/hooks/use-goals.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_TONE: Record<string, LampTone> = {
  active: 'exec',
  achieved: 'go',
  abandoned: 'off',
};

const PROJECT_STATUS_TONE: Record<ProjectStatus, LampTone> = {
  planning: 'hold',
  active: 'exec',
  completed: 'go',
  archived: 'off',
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
      <div className="flex h-full items-center justify-center border-l border-border p-6">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading goal…" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveGoalId(null)}
          className="cap flex h-8 w-8 shrink-0 items-center justify-center"
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
          className="cap flex h-8 w-8 shrink-0 items-center justify-center"
          aria-label="Delete goal"
        >
          <Trash2 className="h-4 w-4 text-led-nogo" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <LampTile
              label={detail.status}
              tone={STATUS_TONE[detail.status] ?? 'off'}
              small
              interactive={false}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow text-silver-mute">Progress</span>
            <div className="flex items-center gap-2">
              <VuMeter className="flex-1" label="Goal progress" value={detail.progressPct / 100} />
              <span className="text-caption font-semibold text-foreground">
                {detail.progressPct}%
              </span>
            </div>
          </div>

          {detail.description && (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow text-silver-mute">Description</span>
              <p className="text-caption text-silver-mute">{detail.description}</p>
            </div>
          )}

          {detail.targetDate && (
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow text-silver-mute">Target Date</span>
              <p className="text-caption text-foreground">
                {new Date(detail.targetDate).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow text-silver-mute">
              Projects ({detail.projects.length})
            </span>
            {detail.projects.length === 0 ? (
              <p className="text-caption text-silver-mute">No projects linked to this goal.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detail.projects.map((project) => {
                  const lead = project.leadId
                    ? employees.find((e) => e.id === project.leadId)
                    : null;
                  return (
                    <RecessedWell key={project.id} className="flex items-center gap-2 px-3 py-2">
                      <LampTile
                        label={project.status}
                        tone={PROJECT_STATUS_TONE[project.status] ?? 'off'}
                        small
                        interactive={false}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-medium text-foreground">
                          {project.title}
                        </p>
                        {lead ? (
                          <p className="truncate text-caption text-silver-mute">{lead.name}</p>
                        ) : null}
                      </div>
                      <Tag mono>{project.id.slice(0, 6)}</Tag>
                    </RecessedWell>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-caption text-silver-mute">
            Created {new Date(detail.createdAt).toLocaleDateString()}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
