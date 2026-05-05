import type { Employee } from '@team-x/shared-types';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

interface FireDialogProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFire: (employeeId: string) => Promise<void>;
  error?: string | null;
}

export function FireDialog({ employee, open, onOpenChange, onFire, error }: FireDialogProps) {
  const [confirmName, setConfirmName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(
    function resetConfirmation() {
      if (open) setConfirmName('');
    },
    [open],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || confirmName !== employee.name) return;
    setIsSubmitting(true);
    try {
      await onFire(employee.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-fire-dialog="">
        <DialogHeader>
          <DialogTitle>Fire employee</DialogTitle>
          <DialogDescription>
            This permanently removes {employee?.name ?? 'this employee'} from the workspace.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-foreground" htmlFor="fire-confirm-name">
            Type the employee name to confirm
          </label>
          <input
            id="fire-confirm-name"
            className="w-full rounded-md border border-border bg-surface-100 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            data-fire-confirm-name=""
          />

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!employee || confirmName !== employee.name || isSubmitting}
            >
              Confirm fire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
