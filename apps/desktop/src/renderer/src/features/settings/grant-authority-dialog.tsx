import type { AuthorityPermission, AuthorityResourceKind, Employee } from '@team-x/shared-types';
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
  initialScopeKind?: 'company' | 'employee';
  initialEmployeeId?: string | null;
  initialResourceKind?: AuthorityResourceKind;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const COMMON_CAPABILITIES = [
  'browse',
  'context7',
  'filesystem',
  'filesystem.read',
  'filesystem.write',
  'filesystem.execute',
  'mcp.call',
  'network',
  'process.spawn',
  'shell',
  'supabase',
  'secrets',
  'email',
  'calendar',
  'send_message_to_colleague',
] as const;

export function GrantAuthorityDialog({
  open,
  onOpenChange,
  companyId,
  employees,
  initialScopeKind = 'company',
  initialEmployeeId = null,
  initialResourceKind = 'capability',
}: GrantAuthorityDialogProps) {
  const createGrant = useCreateAuthorityGrant();
  const [scopeKind, setScopeKind] = useState<'company' | 'employee'>('company');
  const [employeeId, setEmployeeId] = useState('');
  const [resourceKind, setResourceKind] = useState<AuthorityResourceKind>('capability');
  const [capability, setCapability] = useState<string>(COMMON_CAPABILITIES[0]);
  const [customCapability, setCustomCapability] = useState('');
  const [permission, setPermission] = useState<AuthorityPermission>('allow');
  const [resourceId, setResourceId] = useState('');

  useEffect(() => {
    if (employees.length > 0 && !employeeId) {
      setEmployeeId(employees[0]?.id ?? '');
    }
  }, [employeeId, employees]);

  useEffect(() => {
    if (!open) return;
    const nextEmployeeId =
      initialEmployeeId && employees.some((employee) => employee.id === initialEmployeeId)
        ? initialEmployeeId
        : (employees[0]?.id ?? '');
    setScopeKind(initialScopeKind === 'employee' && nextEmployeeId ? 'employee' : 'company');
    setEmployeeId(nextEmployeeId);
    setResourceKind(initialResourceKind);
    setCapability(COMMON_CAPABILITIES[0]);
    setCustomCapability('');
    setPermission('allow');
    setResourceId('');
  }, [employees, initialEmployeeId, initialResourceKind, initialScopeKind, open]);

  function resetForm() {
    setScopeKind(initialScopeKind);
    setEmployeeId(employees[0]?.id ?? '');
    setResourceKind(initialResourceKind);
    setCapability(COMMON_CAPABILITIES[0]);
    setCustomCapability('');
    setPermission('allow');
    setResourceId('');
  }

  function currentResourceId(): string {
    if (resourceKind === 'path') return resourceId.trim();
    if (capability === 'custom') return customCapability.trim();
    return capability.trim();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const trimmedResource = currentResourceId();
    if (!trimmedResource) return;
    const scopeId = scopeKind === 'company' ? companyId : employeeId;
    if (!scopeId) return;
    createGrant.mutate(
      {
        companyId,
        scopeKind,
        scopeId,
        resourceKind,
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
          <DialogTitle>Grant Authority</DialogTitle>
          <DialogDescription>
            Add a workspace default or employee override for a capability or file path.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="authority-scope-kind"
              className="text-xs font-medium text-muted-foreground"
            >
              Grant Scope
            </label>
            <select
              id="authority-scope-kind"
              value={scopeKind}
              onChange={(event) => setScopeKind(event.target.value as 'company' | 'employee')}
              className={selectClass}
              data-authority-scope-kind=""
            >
              <option value="company">Workspace default</option>
              <option value="employee" disabled={employees.length === 0}>
                Employee override
              </option>
            </select>
          </div>

          {scopeKind === 'employee' && (
            <div className="space-y-1.5">
              <label
                htmlFor="authority-employee"
                className="text-xs font-medium text-muted-foreground"
              >
                Employee
              </label>
              <select
                id="authority-employee"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className={selectClass}
                data-authority-employee=""
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
            <label
              htmlFor="authority-resource-kind"
              className="text-xs font-medium text-muted-foreground"
            >
              Resource Type
            </label>
            <select
              id="authority-resource-kind"
              value={resourceKind}
              onChange={(event) => setResourceKind(event.target.value as 'capability' | 'path')}
              className={selectClass}
              data-authority-resource-kind=""
            >
              <option value="capability">Capability</option>
              <option value="path">File or directory path</option>
            </select>
          </div>

          {resourceKind === 'capability' ? (
            <div className="space-y-1.5">
              <label
                htmlFor="authority-capability"
                className="text-xs font-medium text-muted-foreground"
              >
                Capability
              </label>
              <select
                id="authority-capability"
                value={capability}
                onChange={(event) => setCapability(event.target.value)}
                className={selectClass}
                data-authority-capability=""
              >
                {COMMON_CAPABILITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="custom">Custom capability...</option>
              </select>
            </div>
          ) : null}

          {resourceKind === 'capability' && capability === 'custom' ? (
            <div className="space-y-1.5">
              <label
                htmlFor="authority-custom-capability"
                className="text-xs font-medium text-muted-foreground"
              >
                Custom Capability
              </label>
              <Input
                id="authority-custom-capability"
                value={customCapability}
                onChange={(event) => setCustomCapability(event.target.value)}
                placeholder="tool.or.capability"
                className="font-mono text-sm"
                data-authority-custom-capability=""
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="authority-permission"
              className="text-xs font-medium text-muted-foreground"
            >
              Permission
            </label>
            <select
              id="authority-permission"
              value={permission}
              onChange={(event) => setPermission(event.target.value as 'allow' | 'deny' | 'prompt')}
              className={selectClass}
              data-authority-permission=""
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="prompt">Prompt</option>
            </select>
          </div>

          {resourceKind === 'path' ? (
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
                data-authority-path=""
              />
            </div>
          ) : null}

          {createGrant.isError && (
            <p className="text-xs text-destructive">
              Failed to save authority grant. Check the scope and resource, then try again.
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
                !currentResourceId() ||
                createGrant.isPending ||
                (scopeKind === 'employee' && !employeeId)
              }
              data-authority-grant-submit=""
            >
              {createGrant.isPending ? 'Saving...' : 'Save Grant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
