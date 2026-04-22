import type { Employee } from '@team-x/shared-types';

import { MessageSquare, Plus, Users } from 'lucide-react';

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
        'flex w-full items-center gap-3 rounded-[18px] border border-transparent px-3 py-2.5 text-left transition-all',
        isSelected
          ? 'border-brand/20 bg-brand/10 text-foreground'
          : 'text-muted-foreground hover:border-white/10 hover:bg-surface-100 hover:text-foreground',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-black/25 text-xs font-semibold">
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
    <aside className="mission-chrome-panel flex w-64 shrink-0 flex-col rounded-[30px] border border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-brand" />
            Team
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Employee rail
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 rounded-full border border-brand/20 bg-brand/10 px-3 text-xs font-semibold text-brand hover:bg-brand/15 hover:text-brand"
          onClick={onHireClick}
        >
          <Plus className="h-3.5 w-3.5" />
          Hire
        </Button>
      </div>

      <div className="px-4 pb-4">
        <div className="mission-control-row flex items-center justify-between rounded-[22px] border border-white/10 px-3 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Status
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {employees.length === 0
                ? 'Awaiting first hire'
                : `${employees.length} employees online`}
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-right text-[11px]">
            {thinkingCount > 0 ? (
              <span className="font-semibold text-brand">{thinkingCount} busy</span>
            ) : (
              <span className="font-semibold text-foreground">All clear</span>
            )}
          </div>
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {employees.map((emp) => (
          <EmployeeItem key={emp.id} employee={emp} />
        ))}
        {employees.length === 0 && (
          <p className="px-3 py-6 text-center text-xs leading-6 text-muted-foreground">
            No employees yet.
            <br />
            Click + Hire to get started.
          </p>
        )}
      </div>

      <Separator className="bg-white/10" />

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => useAppStore.getState().openThreadList()}
          className="flex w-full items-center gap-2 rounded-[18px] border border-transparent px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/10 hover:bg-surface-100 hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4 text-brand" />
          Threads
        </button>
      </div>

      <Separator className="bg-white/10" />

      <output
        className="flex items-center gap-3 px-4 py-3 text-[11px] text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
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
