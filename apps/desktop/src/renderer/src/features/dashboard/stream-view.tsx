import type { Employee } from '@team-x/shared-types';

import { Radio } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { type EmployeeLiveState, useAppStore } from '@/store/app-store.js';

interface StreamPaneProps {
  employee: Employee;
  live: EmployeeLiveState;
}

function StreamPane({ employee, live }: StreamPaneProps) {
  const setSelected = useAppStore((s) => s.setSelectedEmployee);
  const isThinking = live.status === 'thinking';

  return (
    <button
      type="button"
      onClick={() => setSelected(employee.id)}
      className="flex h-full min-w-[280px] flex-col rounded-xl border border-border bg-surface-50 transition-colors hover:border-brand/30"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold">
          {employee.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-foreground">{employee.name}</p>
          <p className="truncate text-xs text-muted-foreground">{employee.title}</p>
        </div>
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            isThinking ? 'bg-brand animate-pulse-slow' : 'bg-zinc-500',
          )}
        />
      </div>
      <ScrollArea className="flex-1 px-4 py-3">
        {isThinking && live.currentStream.length > 0 ? (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
            {live.currentStream.slice(-800)}
          </pre>
        ) : isThinking ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 animate-pulse text-brand" />
            Thinking...
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">Idle</p>
        )}
      </ScrollArea>
    </button>
  );
}

interface StreamViewProps {
  employees: Employee[];
}

export function StreamView({ employees }: StreamViewProps) {
  const employeeLive = useAppStore((s) => s.employeeLive);

  // Sort: thinking employees first, then idle
  const sorted = [...employees].sort((a, b) => {
    const aThinking = employeeLive[a.id]?.status === 'thinking' ? 0 : 1;
    const bThinking = employeeLive[b.id]?.status === 'thinking' ? 0 : 1;
    return aThinking - bThinking;
  });

  const thinkingCount = Object.values(employeeLive).filter((e) => e.status === 'thinking').length;

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">No employees yet</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Hire employees to see their live output streams here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-2">
        <Radio className="h-4 w-4 text-brand" />
        <span className="text-xs font-medium text-muted-foreground">
          {thinkingCount > 0 ? (
            <>
              <span className="text-brand">{thinkingCount} active</span>
              {' / '}
              {employees.length} total
            </>
          ) : (
            `${employees.length} employees — all idle`
          )}
        </span>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full gap-4" style={{ minWidth: `${sorted.length * 296}px` }}>
          {sorted.map((emp) => (
            <StreamPane
              key={emp.id}
              employee={emp}
              live={
                employeeLive[emp.id] ?? {
                  status: 'idle' as const,
                  currentStream: '',
                  lastThreadId: null,
                  lastMessageId: null,
                }
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
