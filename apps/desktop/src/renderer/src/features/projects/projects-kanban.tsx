import type { Employee, Project, ProjectStatus } from '@team-x/shared-types';
import { Plus } from 'lucide-react';

import { ProjectCard } from './project-card.js';

import { LampTile, type LampTone, RecessedWell, Tag } from '@/components/console/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useUpdateProject } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_TONE: Record<ProjectStatus, LampTone> = {
  planning: 'hold',
  active: 'exec',
  completed: 'go',
  archived: 'off',
};

const COLUMNS: { status: ProjectStatus; label: string }[] = [
  { status: 'planning', label: 'Planning' },
  { status: 'active', label: 'Active' },
  { status: 'completed', label: 'Completed' },
  { status: 'archived', label: 'Archived' },
];

interface ProjectsKanbanProps {
  projects: Project[];
  employees: Employee[];
  onCreateClick: () => void;
}

export function ProjectsKanban({ projects, employees, onCreateClick }: ProjectsKanbanProps) {
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const updateProject = useUpdateProject();

  function handleDragStart(e: React.DragEvent, projectId: string) {
    e.dataTransfer.setData('text/plain', projectId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, targetStatus: ProjectStatus) {
    e.preventDefault();
    const projectId = e.dataTransfer.getData('text/plain');
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.status === targetStatus) return;
    updateProject.mutate({ projectId, status: targetStatus });
  }

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4">
      {COLUMNS.map((col) => {
        const colProjects = projects.filter((p) => p.status === col.status);
        return (
          <RecessedWell
            key={col.status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.status)}
            className="flex w-72 shrink-0 flex-col overflow-hidden p-0"
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <LampTile
                  label={col.label}
                  tone={STATUS_TONE[col.status]}
                  small
                  interactive={false}
                />
                <Tag mono>{colProjects.length}</Tag>
              </div>
              {col.status === 'planning' && (
                <button
                  type="button"
                  onClick={onCreateClick}
                  className="cap flex h-8 w-8 shrink-0 items-center justify-center"
                  aria-label="Create project"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <ScrollArea className="flex-1 px-2 pb-2 pt-2">
              <div className="flex flex-col gap-2">
                {colProjects.length === 0 && (
                  <div className="flex h-20 items-center justify-center rounded-card border border-dashed border-[var(--hairline)] text-caption text-silver-mute">
                    {col.status === 'planning' ? 'No projects yet' : 'None'}
                  </div>
                )}
                {colProjects.map((project) => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, project.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <ProjectCard
                      project={project}
                      employees={employees}
                      onClick={() => setActiveProjectId(project.id)}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </RecessedWell>
        );
      })}
    </div>
  );
}
