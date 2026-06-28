import type { Employee } from '@team-x/shared-types';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CreateGoalDialog } from './create-goal-dialog.js';
import { GoalDetailPanel } from './goal-detail.js';
import { GoalRow } from './goal-row.js';

import { SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useGoalEventSync, useGoals } from '@/hooks/use-goals.js';
import { useProjects } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

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
      <div className="flex h-full items-center justify-center p-6">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading goals…" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-y-auto ${activeGoalId ? 'hidden lg:block' : ''}`}>
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-h2 text-foreground">Company Goals ({goals.length})</h2>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Goal
            </Button>
          </div>

          {goals.length === 0 ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No goals yet"
              description="Create a goal to start tracking progress across projects."
            />
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
