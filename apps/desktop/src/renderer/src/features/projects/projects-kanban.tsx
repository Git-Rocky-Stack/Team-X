import type { Employee, Project, ProjectStatus } from '@team-x/shared-types';
import { Plus } from 'lucide-react';

import { ProjectCard } from './project-card.js';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useUpdateProject } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';


const COLUMNS: { status: ProjectStatus; label: string; accent: string }[] = [
  { status: 'planning', label: 'Planning', accent: 'border-t-brand' },
  { status: 'active', label: 'Active', accent: 'border-t-yellow-500' },
  { status: 'completed', label: 'Completed', accent: 'border-t-green-500' },
  { status: 'archived', label: 'Archived', accent: 'border-t-zinc-500' },
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
    <div className="flex h-full gap-4 p-4 overflow-x-auto">
      {COLUMNS.map((col) => {
        const colProjects = projects.filter((p) => p.status === col.status);
        return (
          <div
            key={col.status}
            className={`flex w-72 shrink-0 flex-col rounded-lg border border-border/50 border-t-2 ${col.accent} bg-background`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h3>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                  {colProjects.length}
                </span>
              </div>
              {col.status === 'planning' && (
                <button
                  type="button"
                  onClick={onCreateClick}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
                  aria-label="Create project"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <ScrollArea className="flex-1 px-2 pb-2">
              <div className="flex flex-col gap-2">
                {colProjects.length === 0 && (
                  <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/40 text-[11px] text-muted-foreground/50">
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
          </div>
        );
      })}
    </div>
  );
}
