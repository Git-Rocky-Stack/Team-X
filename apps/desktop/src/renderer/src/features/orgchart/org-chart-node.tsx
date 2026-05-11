import type { Employee } from '@team-x/shared-types';
import { ChevronRight, MessageSquare } from 'lucide-react';
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
  managerOptions: Employee[];
  onChat: (employeeId: string) => void;
  onProfile: (employee: Employee) => void;
  onPromote: (employee: Employee) => void;
  onFire: (employee: Employee) => void;
  onSetManager: (employeeId: string, managerId: string | null) => void;
  children?: React.ReactNode;
}

export function OrgChartNode({
  employee,
  depth,
  childCount,
  managerOptions,
  onChat,
  onProfile,
  onPromote,
  onFire,
  onSetManager,
  children,
}: OrgChartNodeProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const normalizedLevel = employee.level.toLowerCase().trim().replace(/\s+/g, '-');
  const levelClass = levelPalette[normalizedLevel] ?? levelPalette.ic;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActionsOpen((open) => !open);
    }
  }

  function handleDragStart(event: React.DragEvent<HTMLLIElement>) {
    event.stopPropagation();
    event.dataTransfer.setData('application/x-teamx-employee-id', employee.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event: React.DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(event: React.DragEvent<HTMLLIElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedEmployeeId = event.dataTransfer.getData('application/x-teamx-employee-id');
    if (draggedEmployeeId.length === 0 || draggedEmployeeId === employee.id) return;
    onSetManager(draggedEmployeeId, employee.id);
  }

  return (
    <li
      className="relative"
      data-org-chart-node={employee.id}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={childCount > 0 ? true : undefined}
      aria-selected={undefined}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'group flex min-h-14 items-center gap-3 border-b border-border/60 px-4 py-3 outline-none transition-colors hover:bg-surface-100 focus-visible:bg-surface-100 focus-visible:ring-2 focus-visible:ring-brand',
        )}
        style={{ paddingLeft: `${1 + depth * 1.75}rem` }}
        data-org-chart-drag-handle={employee.id}
      >
        <button
          type="button"
          onClick={() => setActionsOpen((open) => !open)}
          onKeyDown={handleKeyDown}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-200 text-caption font-semibold text-foreground/80">
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
              <span className="truncate text-body-strong text-foreground">{employee.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded-md border px-1.5 py-0.5 text-eyebrow-sm',
                  levelClass,
                )}
              >
                {normalizedLevel}
              </span>
            </div>
            <p className="mt-0.5 truncate pl-5 text-caption text-muted-foreground">
              {employee.title}
            </p>
          </div>
        </button>

        <div
          className={cn(
            'hidden shrink-0 items-center gap-1 text-caption text-muted-foreground group-hover:flex group-focus-within:flex',
            actionsOpen && 'flex',
          )}
          data-org-chart-actions={employee.id}
        >
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-muted-foreground/70 transition-colors hover:bg-surface-200 hover:text-foreground"
            onClick={() => onChat(employee.id)}
          >
            <MessageSquare className="inline h-3 w-3" aria-hidden="true" />
            Chat
          </button>
          <button
            type="button"
            className="rounded-md border border-brand/30 px-2 py-1 text-brand transition-colors hover:bg-brand/10"
            data-org-chart-profile=""
            onClick={() => onProfile(employee)}
          >
            Details
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-muted-foreground/70 transition-colors hover:bg-surface-200 hover:text-foreground"
            data-org-chart-promote=""
            onClick={() => onPromote(employee)}
          >
            Promote
          </button>
          <button
            type="button"
            className="rounded-md border border-red-500/50 px-2 py-1 text-red-300 transition-colors hover:bg-red-500/10"
            data-org-chart-fire=""
            onClick={() => onFire(employee)}
          >
            Fire
          </button>
          <select
            aria-label={`Reassign manager for ${employee.name}`}
            className="max-w-40 rounded-md border border-border bg-surface-100 px-2 py-1 text-caption text-foreground outline-none"
            data-org-chart-manager-select=""
            defaultValue=""
            onChange={(event) => {
              const nextManagerId =
                event.target.value.length === 0 || event.target.value === '__root__'
                  ? null
                  : event.target.value;
              onSetManager(employee.id, nextManagerId);
              event.currentTarget.value = '';
            }}
          >
            <option value="">Reassign manager</option>
            <option value="__root__">Make root</option>
            {managerOptions
              .filter((manager) => manager.id !== employee.id)
              .map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {childCount > 0 ? <ul>{children}</ul> : null}
    </li>
  );
}
