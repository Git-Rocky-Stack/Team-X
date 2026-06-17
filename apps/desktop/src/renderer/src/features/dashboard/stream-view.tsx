import type { Employee } from '@team-x/shared-types';
import { Radio } from 'lucide-react';

import { LampTile, VuMeter } from '@/components/console/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
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
      className="cap flex h-full min-w-[280px] flex-col p-0 text-left"
    >
      <div className="flex items-center gap-2 border-b border-[hsl(var(--hairline))] px-4 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-carbon-900 text-xs font-semibold">
          {employee.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-body-strong text-foreground">{employee.name}</p>
          <p className="truncate text-caption text-silver-mute">{employee.title}</p>
        </div>
        <LampTile
          label={isThinking ? 'LIVE' : 'IDLE'}
          tone={isThinking ? 'exec' : 'off'}
          small
          interactive={false}
        />
      </div>
      <ScrollArea className="flex-1 px-4 py-3">
        {isThinking && live.currentStream.length > 0 ? (
          <pre className="whitespace-pre-wrap rounded-inset bg-[hsl(var(--void))] px-3 py-2 text-code-sm leading-relaxed text-[hsl(var(--display-fg))]">
            {live.currentStream.slice(-800)}
          </pre>
        ) : isThinking ? (
          <div className="flex items-center gap-2 text-caption text-silver-mute">
            <Radio className="h-3.5 w-3.5 animate-pulse text-armed" />
            Thinking...
          </div>
        ) : (
          <p className="text-caption italic text-silver-mute/60">Idle</p>
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
        <p className="text-h3 text-muted-foreground">No employees yet</p>
        <p className="mt-1 text-body text-muted-foreground/70">
          Hire employees to see their live output streams here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[hsl(var(--hairline))] px-6 py-2">
        <Radio className="h-4 w-4 text-armed" />
        <span className="text-caption font-medium text-silver-mute">
          {thinkingCount > 0 ? (
            <>
              <span className="text-armed">{thinkingCount} active</span>
              {' / '}
              {employees.length} total
            </>
          ) : (
            `${employees.length} employees — all idle`
          )}
        </span>
        <VuMeter
          className="ml-auto w-40"
          value={employees.length > 0 ? thinkingCount / employees.length : 0}
          label="Live stream concurrency"
        />
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 scrollbar-thin">
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
