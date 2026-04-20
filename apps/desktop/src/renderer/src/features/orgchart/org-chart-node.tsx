import type { Employee } from '@team-x/shared-types';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils.js';

const levelPalette: Record<string, string> = {
  officer: 'border-brand/40 bg-brand/10 text-brand',
  'senior-management': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
  management: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  supervisor: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  lead: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  ic: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
}

interface OrgChartNodeProps {
  employee: Employee;
  depth: number;
  childCount: number;
  children?: React.ReactNode;
}

export function OrgChartNode({ employee, depth, childCount, children }: OrgChartNodeProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const normalizedLevel = employee.level.toLowerCase().trim().replace(/\s+/g, '-');
  const levelClass = levelPalette[normalizedLevel] ?? levelPalette.ic;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActionsOpen((open) => !open);
    }
  }

  return (
    <li
      className="relative"
      data-org-chart-node={employee.id}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={childCount > 0 ? true : undefined}
    >
      <button
        type="button"
        onClick={() => setActionsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        className={cn(
          'group flex min-h-14 items-center gap-3 border-b border-border/60 px-4 py-3 outline-none transition-colors hover:bg-surface-100 focus-visible:bg-surface-100 focus-visible:ring-2 focus-visible:ring-brand',
        )}
        style={{ paddingLeft: `${1 + depth * 1.75}rem` }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-200 text-xs font-semibold text-foreground/80">
          {initials(employee.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {childCount > 0 ? (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate text-sm font-medium text-foreground">{employee.name}</span>
            <span
              className={cn(
                'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase',
                levelClass,
              )}
            >
              {normalizedLevel}
            </span>
          </div>
          <p className="mt-0.5 truncate pl-5 text-xs text-muted-foreground">{employee.title}</p>
        </div>

        <div
          className={cn(
            'hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground group-hover:flex group-focus-within:flex',
            actionsOpen && 'flex',
          )}
          data-org-chart-actions={employee.id}
        >
          <span>Actions ship in step (f)</span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground/70">
            Chat
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground/70">
            Promote
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground/70">
            Fire
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-muted-foreground/70">
            Reassign manager
          </span>
        </div>
      </button>
      {childCount > 0 ? <ul>{children}</ul> : null}
    </li>
  );
}
