import { useEffect, useMemo, useState } from 'react';

import type { Employee } from '@team-x/shared-types';

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

export interface EmployeeProfileSaveInput {
  employeeId: string;
  name: string;
  title: string;
  roleId: string;
  managerId: string | null;
  modelPref: string | null;
  providerPref: string | null;
  avatar: string | null;
}

interface EmployeeProfileDialogProps {
  employee: Employee | null;
  employees: Employee[];
  currentManagerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: EmployeeProfileSaveInput) => Promise<void>;
  error?: string | null;
}

const fieldClass =
  'h-10 w-full rounded-md border border-border bg-surface-100 px-3 text-sm text-foreground outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/30';

export function EmployeeProfileDialog({
  employee,
  employees,
  currentManagerId,
  open,
  onOpenChange,
  onSave,
  error,
}: EmployeeProfileDialogProps) {
  const { roles, rolesByLevel } = useRoles();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [roleId, setRoleId] = useState('');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [modelPref, setModelPref] = useState('');
  const [providerPref, setProviderPref] = useState('');
  const [avatar, setAvatar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(
    function resetForm() {
      if (!employee || !open) return;
      setName(employee.name);
      setTitle(employee.title);
      setRoleId(employee.roleId);
      setManagerId(currentManagerId);
      setModelPref(employee.modelPref ?? '');
      setProviderPref(employee.providerPref ?? '');
      setAvatar(employee.avatar ?? '');
    },
    [currentManagerId, employee, open],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === roleId) ?? null,
    [roleId, roles],
  );

  function handleRoleChange(nextRoleId: string) {
    const nextRole = roles.find((role) => role.id === nextRoleId);
    setRoleId(nextRoleId);
    if (nextRole && title.trim() === (employee?.title ?? '').trim()) {
      setTitle(nextRole.name);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || name.trim().length === 0 || title.trim().length === 0 || roleId.length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave({
        employeeId: employee.id,
        name: name.trim(),
        title: title.trim(),
        roleId,
        managerId,
        modelPref: modelPref.trim().length > 0 ? modelPref.trim() : null,
        providerPref: providerPref.trim().length > 0 ? providerPref.trim() : null,
        avatar: avatar.trim().length > 0 ? avatar.trim() : null,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-employee-profile-dialog="">
        <DialogHeader>
          <DialogTitle>Employee profile</DialogTitle>
          <DialogDescription>Edit the employee record, role, and reporting line.</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Name</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                data-employee-profile-name=""
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Display title</span>
              <input
                className={fieldClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                data-employee-profile-title=""
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Role</span>
              <select
                className={fieldClass}
                value={roleId}
                onChange={(event) => handleRoleChange(event.target.value)}
                data-employee-profile-role=""
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
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Reports to</span>
              <select
                className={fieldClass}
                value={managerId ?? '__root__'}
                onChange={(event) =>
                  setManagerId(event.target.value === '__root__' ? null : event.target.value)
                }
                data-employee-profile-manager=""
              >
                <option value="__root__">No manager</option>
                {employees
                  .filter((manager) => manager.id !== employee?.id)
                  .map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Provider preference</span>
              <input
                className={fieldClass}
                value={providerPref}
                onChange={(event) => setProviderPref(event.target.value)}
                maxLength={120}
                placeholder="Default"
                data-employee-profile-provider=""
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Model preference</span>
              <input
                className={fieldClass}
                value={modelPref}
                onChange={(event) => setModelPref(event.target.value)}
                maxLength={120}
                placeholder="Default"
                data-employee-profile-model=""
              />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium text-foreground">
            <span>Avatar URL</span>
            <input
              className={fieldClass}
              value={avatar}
              onChange={(event) => setAvatar(event.target.value)}
              maxLength={500}
              placeholder="Optional"
              data-employee-profile-avatar=""
            />
          </label>

          {selectedRole ? (
            <p className="text-xs text-muted-foreground">
              Selected role level:{' '}
              <span className="font-medium text-foreground">{selectedRole.level}</span>
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !employee ||
                name.trim().length === 0 ||
                title.trim().length === 0 ||
                roleId.length === 0 ||
                isSubmitting
              }
              data-employee-profile-save=""
            >
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
