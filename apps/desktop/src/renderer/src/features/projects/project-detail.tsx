import type {
  Employee,
  Goal,
  ProjectDetail,
  ProjectPriority,
  ProjectStatus,
} from '@team-x/shared-types';
import { ArrowLeft, CalendarDays, Pencil, Save, Target, Trash2, User, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useDeleteProject, useProjectDetail, useUpdateProject } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'bg-brand/10 text-brand',
  active: 'bg-yellow-500/10 text-yellow-400',
  completed: 'bg-green-500/10 text-green-400',
  archived: 'bg-zinc-500/10 text-zinc-400',
};

const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  critical: 'bg-red-500/10 text-red-400',
  high: 'bg-orange-500/10 text-orange-400',
  medium: 'bg-yellow-500/10 text-yellow-400',
  low: 'bg-muted/50 text-muted-foreground',
};

const STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

interface ProjectDraft {
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  leadId: string;
  goalId: string;
  targetDate: string;
}

interface ProjectDetailPanelProps {
  projectId: string;
  employees: Employee[];
  goals: Goal[];
}

function toDateInputValue(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInputToTimestamp(value: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

function toDraft(project: ProjectDetail): ProjectDraft {
  return {
    title: project.title,
    description: project.description,
    status: project.status,
    priority: project.priority,
    leadId: project.leadId ?? '',
    goalId: project.goalId ?? '',
    targetDate: toDateInputValue(project.targetDate),
  };
}

function DetailField({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/45 bg-surface-50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-eyebrow-sm text-muted-foreground/70">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={`text-caption ${muted ? 'text-muted-foreground/60' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

export function ProjectDetailPanel({ projectId, employees, goals }: ProjectDetailPanelProps) {
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const { data: detail, isLoading } = useProjectDetail(projectId);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);

  useEffect(() => {
    if (!detail || isEditing) return;
    setDraft(toDraft(detail));
  }, [detail, isEditing]);

  const linkedGoal = useMemo(() => {
    if (!detail?.goalId) return null;
    return goals.find((goal) => goal.id === detail.goalId) ?? null;
  }, [detail?.goalId, goals]);

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center border-l border-border bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const project = detail;
  const activeDraft = draft ?? toDraft(project);
  const lead = project.lead;
  const statusColor = STATUS_COLORS[project.status] ?? STATUS_COLORS.planning;
  const priorityColor = PRIORITY_COLORS[project.priority] ?? PRIORITY_COLORS.medium;
  const targetDate = project.targetDate ? new Date(project.targetDate).toLocaleDateString() : null;

  const progressPct =
    project.ticketCounts.total > 0
      ? Math.round((project.ticketCounts.done / project.ticketCounts.total) * 100)
      : 0;

  const progressColor =
    progressPct > 66 ? 'bg-green-500' : progressPct > 33 ? 'bg-amber-500' : 'bg-red-500';

  function beginEdit() {
    setDraft(toDraft(project));
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraft(toDraft(project));
    setIsEditing(false);
  }

  function updateDraft(patch: Partial<ProjectDraft>) {
    setDraft((current) => ({ ...(current ?? toDraft(project)), ...patch }));
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!activeDraft.title.trim()) return;
    updateProject.mutate(
      {
        projectId: project.id,
        title: activeDraft.title.trim(),
        description: activeDraft.description.trim(),
        status: activeDraft.status,
        priority: activeDraft.priority,
        leadId: activeDraft.leadId || null,
        goalId: activeDraft.goalId || null,
        targetDate: dateInputToTimestamp(activeDraft.targetDate),
      },
      {
        onSuccess: () => setIsEditing(false),
      },
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveProjectId(null)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          aria-label="Close detail panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 truncate text-h3 text-foreground">{project.title}</h2>
        {isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelEdit}
            className="h-8 px-2 text-button-sm"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={beginEdit}
            className="h-8 px-2 text-button-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
        <button
          type="button"
          onClick={() => {
            deleteProject.mutate(project.id, {
              onSuccess: () => setActiveProjectId(null),
            });
          }}
          disabled={deleteProject.isPending}
          className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {isEditing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="project-edit-title" className="text-label text-muted-foreground">
                Title
              </label>
              <Input
                id="project-edit-title"
                value={activeDraft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                className="mt-1 text-body"
              />
            </div>

            <div>
              <label
                htmlFor="project-edit-description"
                className="text-label text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="project-edit-description"
                value={activeDraft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
                className="mt-1 min-h-[104px] text-body"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="project-edit-status" className="text-label text-muted-foreground">
                  Status
                </label>
                <select
                  id="project-edit-status"
                  value={activeDraft.status}
                  onChange={(event) => updateDraft({ status: event.target.value as ProjectStatus })}
                  className="mission-select mt-1 w-full px-3 py-2 text-body"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="project-edit-priority" className="text-label text-muted-foreground">
                  Priority
                </label>
                <select
                  id="project-edit-priority"
                  value={activeDraft.priority}
                  onChange={(event) =>
                    updateDraft({ priority: event.target.value as ProjectPriority })
                  }
                  className="mission-select mt-1 w-full px-3 py-2 text-body"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="project-edit-lead" className="text-label text-muted-foreground">
                Lead
              </label>
              <select
                id="project-edit-lead"
                value={activeDraft.leadId}
                onChange={(event) => updateDraft({ leadId: event.target.value })}
                className="mission-select mt-1 w-full px-3 py-2 text-body"
              >
                <option value="">No lead assigned</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.title})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="project-edit-goal" className="text-label text-muted-foreground">
                Goal
              </label>
              <select
                id="project-edit-goal"
                value={activeDraft.goalId}
                onChange={(event) => updateDraft({ goalId: event.target.value })}
                className="mission-select mt-1 w-full px-3 py-2 text-body"
              >
                <option value="">Standalone project</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="project-edit-target-date"
                className="text-label text-muted-foreground"
              >
                Target Date
              </label>
              <Input
                id="project-edit-target-date"
                type="date"
                value={activeDraft.targetDate}
                onChange={(event) => updateDraft({ targetDate: event.target.value })}
                className="mt-1 text-body"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!activeDraft.title.trim() || updateProject.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                {updateProject.isPending ? 'Saving...' : 'Save Project'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`border-0 text-[10px] ${statusColor}`}>
                {project.status}
              </Badge>
              <Badge variant="outline" className={`border-0 text-[10px] ${priorityColor}`}>
                {project.priority}
              </Badge>
            </div>

            {project.description ? (
              <p className="text-caption text-muted-foreground">{project.description}</p>
            ) : (
              <p className="text-caption text-muted-foreground/50">No description added.</p>
            )}

            <div className="grid grid-cols-1 gap-2">
              <DetailField
                icon={Target}
                label="Goal"
                value={linkedGoal?.title ?? 'Standalone project'}
                muted={!linkedGoal}
              />
              <DetailField
                icon={CalendarDays}
                label="Target Date"
                value={targetDate ?? 'No target date'}
                muted={!targetDate}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-eyebrow-sm text-muted-foreground/70">Lead</span>
              {lead ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-caption font-bold text-brand">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-caption font-medium text-foreground">{lead.name}</p>
                    <p className="text-caption text-muted-foreground">{lead.title}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground/50">
                  <User className="h-3.5 w-3.5" />
                  <span className="text-caption">No lead assigned</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-eyebrow-sm text-muted-foreground/70">Ticket Progress</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full transition-all ${progressColor}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-caption font-medium text-muted-foreground">
                  {project.ticketCounts.done}/{project.ticketCounts.total}
                </span>
              </div>
            </div>

            {project.ticketIds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-eyebrow-sm text-muted-foreground/70">
                  Linked Tickets ({project.ticketIds.length})
                </span>
                <div className="flex flex-col gap-1">
                  {project.ticketIds.map((ticketId) => (
                    <div
                      key={ticketId}
                      className="rounded-md bg-surface-50 px-2.5 py-1.5 text-caption text-muted-foreground"
                    >
                      {ticketId.slice(0, 8)}...
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-caption text-muted-foreground/50">
              Created {new Date(project.createdAt).toLocaleDateString()} | Updated{' '}
              {new Date(project.updatedAt).toLocaleDateString()}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
