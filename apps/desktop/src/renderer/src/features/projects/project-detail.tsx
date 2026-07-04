import type {
  Employee,
  Goal,
  ProjectDetail,
  ProjectPriority,
  ProjectStatus,
} from '@team-x/shared-types';
import { ArrowLeft, CalendarDays, Pencil, Save, Target, Trash2, User, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import {
  LampTile,
  type LampTone,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useDeleteProject, useProjectDetail, useUpdateProject } from '@/hooks/use-projects.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_TONE: Record<ProjectStatus, LampTone> = {
  planning: 'hold',
  active: 'exec',
  completed: 'go',
  archived: 'off',
};

const PRIORITY_TONE: Record<ProjectPriority, LampTone> = {
  critical: 'nogo',
  high: 'hold',
  medium: 'off',
  low: 'off',
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
    <RecessedWell className="flex flex-col gap-1.5 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-eyebrow-sm text-silver-mute">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={`text-caption ${muted ? 'text-silver-mute' : 'text-[var(--display-fg)]'}`}>
        {value}
      </span>
    </RecessedWell>
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
      <div className="flex h-full items-center justify-center border-l border-border p-6">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading project…" />
      </div>
    );
  }

  const project = detail;
  const activeDraft = draft ?? toDraft(project);
  const lead = project.lead;
  const targetDate = project.targetDate ? new Date(project.targetDate).toLocaleDateString() : null;
  const progressRatio =
    project.ticketCounts.total > 0 ? project.ticketCounts.done / project.ticketCounts.total : 0;

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
          className="cap flex h-8 w-8 shrink-0 items-center justify-center"
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
          className="cap flex h-8 w-8 shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-50"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4 text-led-nogo" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {isEditing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="project-edit-title" className="text-label text-silver-mute">
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
              <label htmlFor="project-edit-description" className="text-label text-silver-mute">
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
                <label htmlFor="project-edit-status" className="text-label text-silver-mute">
                  Status
                </label>
                <select
                  id="project-edit-status"
                  value={activeDraft.status}
                  onChange={(event) => updateDraft({ status: event.target.value as ProjectStatus })}
                  className="well-input mt-1 w-full px-3 py-2 text-body"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="project-edit-priority" className="text-label text-silver-mute">
                  Priority
                </label>
                <select
                  id="project-edit-priority"
                  value={activeDraft.priority}
                  onChange={(event) =>
                    updateDraft({ priority: event.target.value as ProjectPriority })
                  }
                  className="well-input mt-1 w-full px-3 py-2 text-body"
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
              <label htmlFor="project-edit-lead" className="text-label text-silver-mute">
                Lead
              </label>
              <select
                id="project-edit-lead"
                value={activeDraft.leadId}
                onChange={(event) => updateDraft({ leadId: event.target.value })}
                className="well-input mt-1 w-full px-3 py-2 text-body"
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
              <label htmlFor="project-edit-goal" className="text-label text-silver-mute">
                Goal
              </label>
              <select
                id="project-edit-goal"
                value={activeDraft.goalId}
                onChange={(event) => updateDraft({ goalId: event.target.value })}
                className="well-input mt-1 w-full px-3 py-2 text-body"
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
              <label htmlFor="project-edit-target-date" className="text-label text-silver-mute">
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
              <LampTile
                label={project.status}
                tone={STATUS_TONE[project.status] ?? 'off'}
                small
                interactive={false}
              />
              <LampTile
                label={project.priority}
                tone={PRIORITY_TONE[project.priority] ?? 'off'}
                small
                interactive={false}
              />
            </div>

            {project.description ? (
              <p className="text-caption text-silver-mute">{project.description}</p>
            ) : (
              <p className="text-caption text-silver-mute">No description added.</p>
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
              <span className="text-eyebrow text-silver-mute">Lead</span>
              {lead ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-card border border-[var(--hairline)] text-caption font-bold text-foreground">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-caption font-medium text-foreground">{lead.name}</p>
                    <p className="text-caption text-silver-mute">{lead.title}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-silver-mute">
                  <User className="h-3.5 w-3.5" />
                  <span className="text-caption">No lead assigned</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-eyebrow text-silver-mute">Ticket Progress</span>
              <div className="flex items-center gap-2">
                <VuMeter
                  className="flex-1"
                  variant="progress"
                  label="Ticket progress"
                  value={progressRatio}
                />
                <span className="text-caption font-medium text-silver-mute">
                  {project.ticketCounts.done}/{project.ticketCounts.total}
                </span>
              </div>
            </div>

            {project.ticketIds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-eyebrow text-silver-mute">
                  Linked Tickets ({project.ticketIds.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {project.ticketIds.map((ticketId) => (
                    <Tag mono key={ticketId}>
                      {ticketId.slice(0, 8)}…
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            <div className="text-caption text-silver-mute">
              Created {new Date(project.createdAt).toLocaleDateString()} | Updated{' '}
              {new Date(project.updatedAt).toLocaleDateString()}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
