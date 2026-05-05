import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
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
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';

interface RoleOption {
  roleId: string;
  name: string;
  level: string;
  levelLabel: string;
  responsibilities: string[];
}

/**
 * Phase 1 hardcoded role options. The seed creates these two roles
 * from the strategia-official pack. Phase 2 will dynamically load
 * the full ~55-role library from the role-loader.
 */
const PHASE_1_ROLES: RoleOption[] = [
  {
    roleId: 'chief-executive-officer',
    name: 'Chief Executive Officer',
    level: 'officer',
    levelLabel: 'Officer',
    responsibilities: [
      'Set company vision and strategic direction',
      'Make high-level organizational decisions',
      'Coordinate cross-functional initiatives',
      'Report on company health and trajectory',
    ],
  },
  {
    roleId: 'senior-fullstack-engineer',
    name: 'Senior Fullstack Engineer',
    level: 'ic',
    levelLabel: 'IC',
    responsibilities: [
      'Design and implement full-stack features',
      'Write clean, tested, production-ready code',
      'Review code and mentor junior engineers',
      'Drive technical decisions within the team',
    ],
  },
];

interface HireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

export function HireDialog({ open, onOpenChange, companyId }: HireDialogProps) {
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEmployeeEventSync(companyId);
  const { data: employees = [] } = useEmployees(companyId);
  const queryClient = useQueryClient();
  const hireMutation = useHireEmployee();

  function handleClose() {
    setSelectedRole(null);
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
        roleId: selectedRole.roleId,
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

        {/* Role selection */}
        <div className="grid gap-3 py-2">
          {PHASE_1_ROLES.map((role) => {
            const isSelected = selectedRole?.roleId === role.roleId;
            return (
              <button
                key={role.roleId}
                type="button"
                onClick={() => {
                  setSelectedRole(role);
                  if (name.length === 0) setName(role.name);
                }}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
                  isSelected
                    ? 'border-brand/40 bg-brand/5 shadow-sm'
                    : 'border-border bg-surface-50 hover:border-border/80 hover:bg-surface-100',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{role.name}</span>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {role.levelLabel}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {role.responsibilities.map((r) => (
                    <li
                      key={r}
                      className="text-xs leading-relaxed text-muted-foreground before:mr-1.5 before:content-['•']"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Name input — shown when a role is selected */}
        {selectedRole && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="hire-name" className="text-xs font-medium text-muted-foreground">
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
              <label htmlFor="hire-manager" className="text-xs font-medium text-muted-foreground">
                Reports to (optional)
              </label>
              <select
                id="hire-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

        {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={
              !selectedRole || name.trim().length === 0 || hireMutation.isPending || isSubmitting
            }
            className="bg-brand text-white hover:bg-brand/90"
          >
            {hireMutation.isPending || isSubmitting ? 'Hiring...' : 'Confirm Hire'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
