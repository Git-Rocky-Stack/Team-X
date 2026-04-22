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
import { Input } from '@/components/ui/input.js';
import { useCreateAuthorityGrant } from '@/hooks/use-extensions.js';

interface GrantAuthorityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  employees: Employee[];
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function GrantAuthorityDialog({
  open,
  onOpenChange,
  companyId,
  employees,
}: GrantAuthorityDialogProps) {
  const createGrant = useCreateAuthorityGrant();
  const [scopeKind, setScopeKind] = useState<'company' | 'employee'>('company');
  const [employeeId, setEmployeeId] = useState('');
  const [permission, setPermission] = useState<'allow' | 'deny' | 'prompt'>('allow');
  const [resourceId, setResourceId] = useState('');

  useEffect(() => {
    if (employees.length > 0 && !employeeId) {
      setEmployeeId(employees[0]?.id ?? '');
    }
  }, [employeeId, employees]);

  function resetForm() {
    setScopeKind('company');
    setEmployeeId(employees[0]?.id ?? '');
    setPermission('allow');
    setResourceId('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const trimmedResource = resourceId.trim();
    if (!trimmedResource) return;
    const scopeId = scopeKind === 'company' ? companyId : employeeId;
    if (!scopeId) return;
    createGrant.mutate(
      {
        companyId,
        scopeKind,
        scopeId,
        resourceKind: 'path',
        resourceId: trimmedResource,
        permission,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Path</DialogTitle>
          <DialogDescription>
            Add a workspace default or employee override for a file or directory path.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="authority-scope-kind" className="text-xs font-medium text-muted-foreground">
              Grant Scope
            </label>
            <select
              id="authority-scope-kind"
              value={scopeKind}
              onChange={(event) => setScopeKind(event.target.value as 'company' | 'employee')}
              className={selectClass}
            >
              <option value="company">Workspace default</option>
              <option value="employee">Employee override</option>
            </select>
          </div>

          {scopeKind === 'employee' && (
            <div className="space-y-1.5">
              <label htmlFor="authority-employee" className="text-xs font-medium text-muted-foreground">
                Employee
              </label>
              <select
                id="authority-employee"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className={selectClass}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="authority-permission" className="text-xs font-medium text-muted-foreground">
              Permission
            </label>
            <select
              id="authority-permission"
              value={permission}
              onChange={(event) =>
                setPermission(event.target.value as 'allow' | 'deny' | 'prompt')
              }
              className={selectClass}
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="prompt">Prompt</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="authority-path" className="text-xs font-medium text-muted-foreground">
              Absolute Path
            </label>
            <Input
              id="authority-path"
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
              placeholder="C:\\Projects\\Client-X"
              className="font-mono text-sm"
            />
          </div>

          {createGrant.isError && (
            <p className="text-xs text-destructive">
              Failed to save authority grant. Check the scope and path, then try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !companyId ||
                !resourceId.trim() ||
                createGrant.isPending ||
                (scopeKind === 'employee' && !employeeId)
              }
            >
              {createGrant.isPending ? 'Saving...' : 'Save Grant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
