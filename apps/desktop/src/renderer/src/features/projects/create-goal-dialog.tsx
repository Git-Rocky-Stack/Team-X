import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Dialog } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useCreateGoal } from '@/hooks/use-goals.js';

interface CreateGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

export function CreateGoalDialog({ open, onOpenChange, companyId }: CreateGoalDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const createGoal = useCreateGoal();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !title.trim()) return;
    createGoal.mutate(
      {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        targetDate: targetDate ? new Date(targetDate).getTime() : undefined,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setTargetDate('');
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
          <h2 className="text-h3 text-foreground">Create Goal</h2>
          <p className="mt-1 text-caption text-muted-foreground">
            Set a company goal to track progress across projects.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="goal-title" className="text-label text-muted-foreground">
                Title *
              </label>
              <Input
                id="goal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you want to achieve?"
                className="mt-1 text-body"
              />
            </div>

            <div>
              <label htmlFor="goal-desc" className="text-label text-muted-foreground">
                Description
              </label>
              <Textarea
                id="goal-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context, success criteria, key results..."
                className="mt-1 min-h-[80px] text-body"
              />
            </div>

            <div>
              <label htmlFor="goal-date" className="text-label text-muted-foreground">
                Target Date
              </label>
              <input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground"
              />
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || createGoal.isPending}>
                {createGoal.isPending ? 'Creating...' : 'Create Goal'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
