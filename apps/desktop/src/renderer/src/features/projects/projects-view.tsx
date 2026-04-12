import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { useGoals } from '@/hooks/use-goals.js';
import { useProjects } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

import { GoalsView } from './goals-view.js';

import { CreateProjectDialog } from './create-project-dialog.js';
import { ProjectDetailPanel } from './project-detail.js';
import { ProjectsKanban } from './projects-kanban.js';
import { ProjectsSubtabs } from './projects-subtabs.js';

interface ProjectsViewProps {
  companyId: string | null;
  employees: Employee[];
}

export function ProjectsView({ companyId, employees }: ProjectsViewProps) {
  const { data: projects = [], isLoading, isError, refetch } = useProjects(companyId);
  const { data: goals = [] } = useGoals(companyId);
  const projectsSubview = useAppStore((s) => s.projectsSubview);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <ProjectsSubtabs />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading projects...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col">
        <ProjectsSubtabs />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-muted-foreground">Failed to load projects</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSubview() {
    if (projectsSubview === 'goals') {
      return <GoalsView companyId={companyId} employees={employees} />;
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
            <ProjectDetailPanel projectId={activeProjectId} employees={employees} />
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
