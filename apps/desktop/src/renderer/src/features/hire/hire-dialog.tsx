import { useQueryClient } from '@tanstack/react-query';
import { getLevelRank } from '@team-x/shared-types';
import { UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SubviewState, Tag } from '@/components/console/index.js';
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
import { useEmployeeEventSync, useEmployees } from '@/hooks/use-employees.js';
import { useHireEmployee } from '@/hooks/use-hire.js';
import { type RoleOption, useRoles } from '@/hooks/use-roles.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';

/** Display label per role-pack level (frontmatter is hyphenated lowercase). */
const LEVEL_LABEL: Record<string, string> = {
  officer: 'Officer',
  'senior-management': 'Senior Management',
  management: 'Management',
  supervisor: 'Supervisor',
  lead: 'Lead',
  ic: 'IC',
};

/** Unknown levels (a future role pack) sort after every ranked level. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

interface HireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

export function HireDialog({ open, onOpenChange, companyId }: HireDialogProps) {
  const { rolesByLevel } = useRoles();
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [roleQuery, setRoleQuery] = useState('');
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEmployeeEventSync(companyId);
  const { data: employees = [] } = useEmployees(companyId);
  const queryClient = useQueryClient();
  const hireMutation = useHireEmployee();

  // Catalog grouped most-senior-first (LEVEL_RANK), filtered by the search
  // box. Empty groups drop out so a narrow query reads as a short list.
  const visibleGroups = useMemo(() => {
    const needle = roleQuery.trim().toLowerCase();
    return Array.from(rolesByLevel.entries())
      .map(([level, roles]) => ({
        level,
        label: LEVEL_LABEL[level] ?? level,
        roles:
          needle.length === 0
            ? roles
            : roles.filter(
                (role) => role.name.toLowerCase().includes(needle) || role.id.includes(needle),
              ),
      }))
      .filter((group) => group.roles.length > 0)
      .sort((a, b) => (getLevelRank(a.level) ?? UNRANKED) - (getLevelRank(b.level) ?? UNRANKED));
  }, [rolesByLevel, roleQuery]);

  function handleClose() {
    setSelectedRole(null);
    setRoleQuery('');
    setName('');
    setManagerId('');
    setSubmitError(null);
    setIsSubmitting(false);
    hireMutation.reset();
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!selectedRole || !companyId || name.trim().length === 0 || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await hireMutation.mutateAsync({
        companyId,
        roleId: selectedRole.id,
        name: name.trim(),
      });
      if (managerId.length > 0) {
        await ipc.employees.setManager({ employeeId: result.employeeId, managerId: managerId });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employees', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orgchart', companyId] }),
      ]);
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message || 'Failed to hire employee.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand" />
            Hire Employee
          </DialogTitle>
          <DialogDescription>Choose a role and assign a name.</DialogDescription>
        </DialogHeader>

        {/* Role selection — the full non-system catalog, grouped by level */}
        <div className="space-y-2 py-2">
          <Input
            type="search"
            value={roleQuery}
            onChange={(e) => setRoleQuery(e.target.value)}
            placeholder="Search roles"
            aria-label="Search roles"
            data-hire-role-search=""
          />
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1" data-hire-role-list="">
            {visibleGroups.length === 0 ? (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="No roles match that search."
                className="min-h-0 p-4"
              />
            ) : (
              visibleGroups.map((group) => (
                <fieldset
                  key={group.level}
                  aria-label={group.label}
                  className="space-y-1.5 border-0 p-0"
                >
                  <legend className="flex w-full items-center justify-between">
                    <span className="text-label text-silver-mute">{group.label}</span>
                    <Tag mono>{group.roles.length}</Tag>
                  </legend>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {group.roles.map((role) => {
                      const isSelected = selectedRole?.id === role.id;
                      return (
                        <label
                          key={role.id}
                          className={cn(
                            'cursor-pointer rounded-control border px-3 py-2 text-body-strong transition-colors focus-within:ring-2 focus-within:ring-brand/60',
                            isSelected
                              ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground'
                              : 'border-[var(--hairline)] text-muted-foreground hover:border-[var(--hairline-strong)] hover:text-foreground',
                          )}
                        >
                          <input
                            type="radio"
                            name="hire-role"
                            value={role.id}
                            checked={isSelected}
                            data-hire-role={role.id}
                            onChange={() => {
                              setSelectedRole(role);
                              if (name.length === 0) setName(role.name);
                            }}
                            className="sr-only"
                          />
                          <span>{role.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            )}
          </div>
        </div>

        {/* Name input — shown when a role is selected */}
        {selectedRole && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="hire-name" className="text-label text-muted-foreground">
                Employee name
              </label>
              <Input
                id="hire-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Iris Kovac"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="hire-manager" className="text-label text-muted-foreground">
                Reports to (optional)
              </label>
              <select
                id="hire-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="well-input flex h-10 w-full px-3 py-2"
                data-hire-manager-select=""
              >
                <option value="">No manager</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} - {employee.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {submitError ? <p className="text-caption text-destructive">{submitError}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={
              !selectedRole || name.trim().length === 0 || hireMutation.isPending || isSubmitting
            }
          >
            {hireMutation.isPending || isSubmitting ? 'Hiring...' : 'Confirm Hire'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
