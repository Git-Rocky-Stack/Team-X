import { useState } from 'react';

import { UserPlus } from 'lucide-react';

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
import { useHireEmployee } from '@/hooks/use-hire.js';
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
  const hireMutation = useHireEmployee();

  function handleClose() {
    setSelectedRole(null);
    setName('');
    onOpenChange(false);
  }

  function handleConfirm() {
    if (!selectedRole || !companyId || name.trim().length === 0) return;

    hireMutation.mutate(
      { companyId, roleId: selectedRole.roleId, name: name.trim() },
      {
        onSuccess: () => {
          handleClose();
        },
      },
    );
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
          <div className="space-y-1.5">
            <label htmlFor="hire-name" className="text-xs font-medium text-muted-foreground">
              Employee name
            </label>
            <Input
              id="hire-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Iris Kovac"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedRole || name.trim().length === 0 || hireMutation.isPending}
            className="bg-brand text-white hover:bg-brand/90"
          >
            {hireMutation.isPending ? 'Hiring...' : 'Confirm Hire'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
