import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Dialog } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useCreateTicket } from '@/hooks/use-tickets.js';

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  employees: Employee[];
}

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

function dateInputToTimestamp(value: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

export function CreateTicketDialog({
  open,
  onOpenChange,
  companyId,
  employees,
}: CreateTicketDialogProps) {
  const createTicket = useCreateTicket();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !title.trim()) return;

    createTicket.mutate(
      {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        dueAt: dateInputToTimestamp(dueDate) ?? undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setPriority('medium');
          setAssigneeId('');
          setDueDate('');
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
          <h2 className="text-h3 text-foreground">File a Ticket</h2>
          <p className="mt-1 text-caption text-muted-foreground">
            Create a new ticket and optionally assign it to a team member.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="ticket-title" className="text-label text-muted-foreground">
                Title *
              </label>
              <Input
                id="ticket-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="mt-1 text-body"
              />
            </div>

            <div>
              <label htmlFor="ticket-desc" className="text-label text-muted-foreground">
                Description
              </label>
              <Textarea
                id="ticket-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide context, requirements, or instructions..."
                className="mt-1 min-h-[80px] text-body"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  htmlFor="ticket-priority"
                  className="text-label text-muted-foreground"
                >
                  Priority
                </label>
                <select
                  id="ticket-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label
                  htmlFor="ticket-assignee"
                  className="text-label text-muted-foreground"
                >
                  Assign to
                </label>
                <select
                  id="ticket-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground"
                >
                  <option value="">Unassigned</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.title})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="ticket-due-date"
                className="text-label text-muted-foreground"
              >
                Due Date
              </label>
              <Input
                id="ticket-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 text-body"
              />
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || createTicket.isPending}>
                {createTicket.isPending ? 'Creating...' : 'Create Ticket'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
