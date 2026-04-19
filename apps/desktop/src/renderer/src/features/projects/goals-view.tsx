import type { Employee } from '@team-x/shared-types';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { useGoalEventSync, useGoals } from '@/hooks/use-goals.js';
import { useProjects } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

import { CreateGoalDialog } from './create-goal-dialog.js';
import { GoalDetailPanel } from './goal-detail.js';
import { GoalRow } from './goal-row.js';

interface GoalsViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function GoalsView({ companyId, employees }: GoalsViewProps) {
  const { data: goals = [], isLoading } = useGoals(companyId);
  const { data: projects = [] } = useProjects(companyId);
  useGoalEventSync(companyId);
  const activeGoalId = useAppStore((s) => s.activeGoalId);
  const setActiveGoalId = useAppStore((s) => s.setActiveGoalId);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-xs text-muted-foreground">Loading goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-y-auto ${activeGoalId ? 'hidden lg:block' : ''}`}>
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Company Goals ({goals.length})
            </h3>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Goal
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">No goals yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Create a goal to start tracking progress across projects.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {goals.map((goal) => {
                const goalProjects = projects.filter((p) => p.goalId === goal.id);
                return (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    projectCount={goalProjects.length}
                    onClick={() => setActiveGoalId(goal.id)}
                    isActive={goal.id === activeGoalId}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activeGoalId && (
        <div className="w-full shrink-0 lg:w-[400px]">
          <GoalDetailPanel goalId={activeGoalId} employees={employees} />
        </div>
      )}

      <CreateGoalDialog open={createOpen} onOpenChange={setCreateOpen} companyId={companyId} />
    </div>
  );
}
