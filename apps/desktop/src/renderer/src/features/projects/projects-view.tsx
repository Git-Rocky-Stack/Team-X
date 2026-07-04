import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { CreateProjectDialog } from './create-project-dialog.js';
import { GoalsView } from './goals-view.js';
import { ProjectDetailPanel } from './project-detail.js';
import { ProjectsKanban } from './projects-kanban.js';
import { ProjectsSubtabs } from './projects-subtabs.js';
import { ScheduleView } from './schedule-view.js';

import { SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useGoals } from '@/hooks/use-goals.js';
import { useProjectEventSync, useProjects } from '@/hooks/use-projects.js';
import { useScheduleEventSync } from '@/hooks/use-schedule.js';
import { useTickets } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

interface ProjectsViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function ProjectsView({ companyId, employees }: ProjectsViewProps) {
  const { data: projects = [], isLoading, isError, refetch } = useProjects(companyId);
  const { data: goals = [] } = useGoals(companyId);
  const { data: tickets = [] } = useTickets(companyId);
  useProjectEventSync(companyId);
  useScheduleEventSync(companyId);
  const projectsSubview = useAppStore((s) => s.projectsSubview);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <ProjectsSubtabs />
        <div className="flex flex-1 items-center justify-center p-6">
          <SubviewState lampLabel="STBY" lampTone="hold" title="Loading projects…" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col">
        <ProjectsSubtabs />
        <div className="flex flex-1 items-center justify-center p-6">
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Failed to load projects"
            action={
              <Button type="button" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  function renderSubview() {
    if (projectsSubview === 'goals') {
      return <GoalsView companyId={companyId} employees={employees} />;
    }

    if (projectsSubview === 'schedule') {
      return (
        <ScheduleView
          companyId={companyId}
          employees={employees}
          tickets={tickets}
          projects={projects}
          goals={goals}
        />
      );
    }

    return (
      <div className="flex h-full">
        <div className={`flex-1 overflow-hidden ${activeProjectId ? 'hidden lg:block' : ''}`}>
          <ProjectsKanban
            projects={projects}
            employees={employees}
            onCreateClick={() => setCreateOpen(true)}
          />
        </div>

        {activeProjectId && (
          <div className="w-full shrink-0 lg:w-[400px]">
            <ProjectDetailPanel projectId={activeProjectId} employees={employees} goals={goals} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectsSubtabs />
      <div className="flex-1 overflow-y-auto scrollbar-thin">{renderSubview()}</div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={companyId}
        employees={employees}
        goals={goals}
      />
    </div>
  );
}
