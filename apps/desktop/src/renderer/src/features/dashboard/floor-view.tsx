import type { Employee } from '@team-x/shared-types';

import { Faceplate, LcdWell, StripeHeader } from '@/components/console/index.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'officer':
      return 'border-[hsl(var(--armed-edge))]';
    case 'senior-management':
      return 'border-[hsl(var(--led-hold-edge))]';
    case 'management':
      return 'border-[hsl(var(--led-scope-edge))]';
    case 'supervisor':
      return 'border-[hsl(var(--led-scope-edge))]';
    case 'lead':
      return 'border-[hsl(var(--led-go-edge))]';
    default:
      return 'border-[hsl(var(--hairline))]';
  }
}

function levelLabel(level: string): string {
  switch (level.toLowerCase()) {
    case 'officer':
      return 'C-Suite';
    case 'senior-management':
      return 'Sr. Mgmt';
    case 'management':
      return 'Mgmt';
    case 'supervisor':
      return 'Supvr';
    case 'lead':
      return 'Lead';
    case 'ic':
      return 'IC';
    default:
      return level;
  }
}

function statusIndicator(status: string): { color: string; label: string } {
  switch (status) {
    case 'thinking':
      return { color: 'bg-led-scope', label: 'Thinking' };
    case 'meeting':
      return { color: 'bg-led-go', label: 'In meeting' };
    case 'blocked':
      return { color: 'bg-led-hold', label: 'Blocked' };
    case 'error':
      return { color: 'bg-led-warn', label: 'Error' };
    default:
      return { color: 'bg-graphite', label: 'Idle' };
  }
}

interface FloorCellProps {
  employee: Employee;
}

function FloorCell({ employee }: FloorCellProps) {
  const setSelected = useAppStore((s) => s.setSelectedEmployee);
  const liveState = useAppStore((s) => s.employeeLive[employee.id]);
  const displayStatus = liveState?.status ?? employee.status;
  const { color, label } = statusIndicator(displayStatus);

  return (
    <button
      type="button"
      onClick={() => setSelected(employee.id)}
      className={cn('cap flex flex-col items-center gap-2 p-3', levelColor(employee.level))}
    >
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-carbon-900 text-xs font-bold">
          {employee.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </div>
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-pill border-2 border-background',
            color,
          )}
          title={label}
        />
      </div>
      <div className="w-full text-center">
        <p className="truncate text-body-strong text-foreground">{employee.name}</p>
        <p className="truncate text-caption text-silver-mute">{employee.title}</p>
      </div>
      <span className="rounded-control bg-carbon-900 px-2 py-0.5 text-eyebrow-sm font-medium text-silver-mute">
        {levelLabel(employee.level)}
      </span>
    </button>
  );
}

interface FloorViewProps {
  employees: Employee[];
}

export function FloorView({ employees }: FloorViewProps) {
  const employeeLive = useAppStore((s) => s.employeeLive);

  const thinkingCount = Object.values(employeeLive).filter((e) => e.status === 'thinking').length;
  const idleCount = employees.length - thinkingCount;

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-h3 text-muted-foreground">No employees yet</p>
        <p className="mt-1 text-body text-muted-foreground/70">
          Hire employees to see the office floor.
        </p>
      </div>
    );
  }

  // Group by level for visual clustering
  const levels = ['officer', 'senior-management', 'management', 'supervisor', 'lead', 'ic'];
  const grouped = new Map<string, Employee[]>();
  for (const level of levels) {
    const group = employees.filter((e) => e.level.toLowerCase() === level);
    if (group.length > 0) grouped.set(level, group);
  }
  // Catch any employees with unrecognized levels
  const knownLevels = new Set(levels);
  const other = employees.filter((e) => !knownLevels.has(e.level.toLowerCase()));
  if (other.length > 0) grouped.set('other', other);

  return (
    <Faceplate kicker="OFFICE FLOOR" serial="LIVE" bodyClassName="space-y-6">
      <div className="flex items-center gap-4 text-caption text-silver-mute">
        <LcdWell className="px-3 py-1.5">
          <span className="text-label tabular-nums">{employees.length} EMP</span>
        </LcdWell>
        {thinkingCount > 0 && (
          <LcdWell tone="amber" className="px-3 py-1.5">
            <span className="text-label tabular-nums">
              {thinkingCount} BUSY / {idleCount} IDLE
            </span>
          </LcdWell>
        )}
        <div className="ml-auto flex items-center gap-3">
          {levels
            .filter((l) => grouped.has(l))
            .map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-pill border', levelColor(l))} />
                {levelLabel(l)}
              </span>
            ))}
        </div>
      </div>

      {[...grouped.entries()].map(([level, group]) => (
        <div key={level}>
          <StripeHeader kicker={`${levelLabel(level)} (${group.length})`} className="mb-3" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {group.map((emp) => (
              <FloorCell key={emp.id} employee={emp} />
            ))}
          </div>
        </div>
      ))}
    </Faceplate>
  );
}
