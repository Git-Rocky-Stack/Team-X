import type { Employee } from '@team-x/shared-types';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils.js';
import type { EmployeeLiveState } from '@/store/app-store.js';
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

function statusLabel(status: string): string {
  switch (status) {
    case 'thinking':
      return 'Thinking...';
    case 'blocked':
      return 'Blocked';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

interface EmployeeCardProps {
  employee: Employee;
  live: EmployeeLiveState | undefined;
}

export function EmployeeCard({ employee, live }: EmployeeCardProps) {
  const setSelected = useAppStore((s) => s.setSelectedEmployee);
  const selectedId = useAppStore((s) => s.selectedEmployeeId);
  const isSelected = selectedId === employee.id;

  const displayStatus = live?.status ?? employee.status;
  const streamText = live?.currentStream ?? '';
  const streamTail = streamText.slice(-200);

  const streamRef = useRef<HTMLPreElement>(null);

  // Auto-scroll the stream preview to the bottom when new tokens arrive.
  // streamTail is intentionally in the dep list — it is not read inside the
  // effect, but we need the effect to re-fire whenever new tokens append so
  // the scrollTop stays pinned to the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep
  useEffect(() => {
    const el = streamRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamTail]);

  return (
    <button
      type="button"
      onClick={() => setSelected(isSelected ? null : employee.id)}
      aria-label={`${employee.name}, ${employee.title} — ${statusLabel(displayStatus)}. Click to ${isSelected ? 'close' : 'open'} chat.`}
      className={cn(
        'group relative flex w-full flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200',
        isSelected
          ? 'border-brand/40 bg-black/25 shadow-sm'
          : 'border-border bg-surface-50 hover:border-border/80 hover:bg-surface-100 hover:shadow-sm',
      )}
    >
      {/* Header: avatar + name + status */}
      <div className="flex w-full items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-200 text-sm font-semibold text-foreground/80">
          {initials(employee.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{employee.name}</span>
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(displayStatus))}
              title={statusLabel(displayStatus)}
            />
          </div>
          <span className="block truncate text-xs text-muted-foreground">{employee.title}</span>
        </div>
        <span className="shrink-0 rounded-md bg-surface-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {employee.level}
        </span>
      </div>

      {/* Stream preview — only visible when the employee is actively thinking */}
      {displayStatus === 'thinking' && streamTail.length > 0 && (
        <div className="relative w-full overflow-hidden rounded-lg border border-border/50 bg-background/80">
          <pre
            ref={streamRef}
            className="max-h-[12rem] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/70 scrollbar-thin"
          >
            {streamTail}
          </pre>
          {/* Bottom gradient fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/80 to-transparent" />
        </div>
      )}

      {/* Idle state — subtle hint */}
      {displayStatus === 'idle' && (
        <p className="text-xs text-muted-foreground/60">Ready for work</p>
      )}
    </button>
  );
}
