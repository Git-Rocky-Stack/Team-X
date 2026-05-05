import type { Employee } from '@team-x/shared-types';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useRoles } from '@/hooks/use-roles.js';

interface PromoteDialogProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromote: (employeeId: string, roleId: string) => Promise<void>;
  error?: string | null;
}

export function PromoteDialog({
  employee,
  open,
  onOpenChange,
  onPromote,
  error,
}: PromoteDialogProps) {
  const { roles, rolesByLevel } = useRoles();
  const [roleId, setRoleId] = useState(employee?.roleId ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(
    function resetSelectedRole() {
      setRoleId(employee?.roleId ?? roles[0]?.id ?? '');
    },
    [employee?.roleId, roles],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === roleId) ?? null,
    [roleId, roles],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || roleId.length === 0) return;
    setIsSubmitting(true);
    try {
      await onPromote(employee.id, roleId);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-promote-dialog="">
        <DialogHeader>
          <DialogTitle>Promote employee</DialogTitle>
          <DialogDescription>Choose the role this employee should hold next.</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-foreground" htmlFor="promote-role">
            New role
          </label>
          <select
            id="promote-role"
            className="w-full rounded-md border border-border bg-surface-100 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            data-promote-role-select=""
          >
            {Array.from(rolesByLevel.entries()).map(([level, levelRoles]) => (
              <optgroup key={level} label={level}>
                {levelRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {selectedRole ? (
            <p className="text-xs text-muted-foreground">
              {selectedRole.name} moves this row to {selectedRole.level}.
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !employee || roleId.length === 0 || roleId === employee.roleId || isSubmitting
              }
            >
              Confirm promote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
