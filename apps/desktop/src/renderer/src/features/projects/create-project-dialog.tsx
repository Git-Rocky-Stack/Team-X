import type { Employee, Goal } from '@team-x/shared-types';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Dialog } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useCreateProject } from '@/hooks/use-projects.js';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  employees: Employee[];
  goals: Goal[];
}

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function CreateProjectDialog({
  open,
  onOpenChange,
  companyId,
  employees,
  goals,
}: CreateProjectDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [leadId, setLeadId] = useState('');
  const [goalId, setGoalId] = useState('');
  const createProject = useCreateProject();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !title.trim()) return;
    createProject.mutate(
      {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        leadId: leadId || undefined,
        goalId: goalId || undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setPriority('medium');
          setLeadId('');
          setGoalId('');
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`} aria-hidden={!open}>
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => onOpenChange(false)}
          onKeyDown={() => {}}
          role="presentation"
        />
        <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl">
          <h2 className="text-base font-semibold text-foreground">Create Project</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a new project and optionally link it to a goal.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="project-title" className="text-xs font-medium text-muted-foreground">
                Title *
              </label>
              <Input
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project name"
                className="mt-1 text-sm"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="project-desc" className="text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Project scope and objectives..."
                className="mt-1 min-h-[80px] text-sm"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  htmlFor="project-priority"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Priority
                </label>
                <select
                  id="project-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label htmlFor="project-lead" className="text-xs font-medium text-muted-foreground">
                  Lead
                </label>
                <select
                  id="project-lead"
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                >
                  <option value="">No lead</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.title})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="project-goal" className="text-xs font-medium text-muted-foreground">
                Link to Goal
              </label>
              <select
                id="project-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              >
                <option value="">Standalone project</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || createProject.isPending}>
                {createProject.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
