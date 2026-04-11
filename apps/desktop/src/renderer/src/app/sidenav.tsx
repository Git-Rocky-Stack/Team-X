import type { Employee } from '@team-x/shared-types';

import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

function statusColor(status: string): string {
  switch (status) {
    case 'thinking':
      return 'bg-brand animate-pulse-slow';
    case 'blocked':
      return 'bg-amber-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-zinc-500';
  }
}

function EmployeeItem({ employee }: { employee: Employee }) {
  const selectedId = useAppStore((s) => s.selectedEmployeeId);
  const setSelected = useAppStore((s) => s.setSelectedEmployee);
  const liveState = useAppStore((s) => s.employeeLive[employee.id]);
  const displayStatus = liveState?.status ?? employee.status;
  const isSelected = selectedId === employee.id;

  return (
    <button
      type="button"
      onClick={() => setSelected(isSelected ? null : employee.id)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        isSelected
          ? 'bg-brand/10 text-foreground'
          : 'text-muted-foreground hover:bg-surface-100 hover:text-foreground',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold">
        {employee.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{employee.name}</span>
          <span className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(displayStatus))} />
        </div>
        <span className="block truncate text-xs text-muted-foreground">{employee.title}</span>
      </div>
    </button>
  );
}

interface SidenavProps {
  employees: Employee[];
  onHireClick: () => void;
}

export function Sidenav({ employees, onHireClick }: SidenavProps) {
  const employeeLive = useAppStore((s) => s.employeeLive);

  const thinkingCount = Object.values(employeeLive).filter((e) => e.status === 'thinking').length;
  const idleCount = employees.length - thinkingCount;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-50">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Users className="h-4 w-4" />
          Team
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-brand hover:text-brand"
          onClick={onHireClick}
        >
          <Plus className="h-3.5 w-3.5" />
          Hire
        </Button>
      </div>

      <Separator />

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 scrollbar-thin">
        {employees.map((emp) => (
          <EmployeeItem key={emp.id} employee={emp} />
        ))}
        {employees.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No employees yet.
            <br />
            Click + Hire to get started.
          </p>
        )}
      </div>

      <Separator />

      <output
        className="flex items-center gap-3 px-4 py-2 text-[11px] text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          {thinkingCount > 0 && (
            <>
              <span className="font-medium text-brand">{thinkingCount} busy</span>
              {' / '}
            </>
          )}
          {idleCount} idle
        </span>
      </output>
    </aside>
  );
}
