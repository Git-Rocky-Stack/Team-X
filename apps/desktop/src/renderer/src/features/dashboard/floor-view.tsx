import type { Employee } from '@team-x/shared-types';

import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'officer':
      return 'border-amber-500/50 bg-black';
    case 'senior-management':
      return 'border-purple-500/50 bg-black';
    case 'management':
      return 'border-blue-500/50 bg-black';
    case 'supervisor':
      return 'border-cyan-500/50 bg-black';
    case 'lead':
      return 'border-green-500/50 bg-black';
    case 'ic':
      return 'border-zinc-500/50 bg-black';
    default:
      return 'border-border bg-black';
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
      return { color: 'bg-brand animate-pulse-slow', label: 'Thinking' };
    case 'meeting':
      return { color: 'bg-purple-500', label: 'In meeting' };
    case 'blocked':
      return { color: 'bg-amber-500', label: 'Blocked' };
    case 'error':
      return { color: 'bg-red-500', label: 'Error' };
    default:
      return { color: 'bg-zinc-500', label: 'Idle' };
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
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border p-3 transition-all hover:scale-[1.02] hover:shadow-md',
        levelColor(employee.level),
      )}
    >
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-xs font-bold">
          {employee.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
            color,
          )}
          title={label}
        />
      </div>
      <div className="w-full text-center">
        <p className="truncate text-body-strong text-foreground">{employee.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{employee.title}</p>
      </div>
      <span className="rounded-full bg-black px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
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
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4 text-caption text-muted-foreground">
        <span>
          {employees.length} employee{employees.length !== 1 ? 's' : ''}
        </span>
        {thinkingCount > 0 && (
          <span>
            <span className="font-medium text-brand">{thinkingCount} busy</span>
            {' / '}
            {idleCount} idle
          </span>
        )}
        <div className="flex items-center gap-3 ml-auto">
          {levels
            .filter((l) => grouped.has(l))
            .map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full border',
                    levelColor(l).replace('bg-', 'bg-').split(' ')[0],
                  )}
                />
                {levelLabel(l)}
              </span>
            ))}
        </div>
      </div>

      {[...grouped.entries()].map(([level, group]) => (
        <div key={level}>
          <h3 className="mb-3 text-eyebrow text-muted-foreground">
            {levelLabel(level)} ({group.length})
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {group.map((emp) => (
              <FloorCell key={emp.id} employee={emp} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
