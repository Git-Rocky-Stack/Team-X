import type { Employee } from '@team-x/shared-types';
import { BookOpenText, MessageSquare, Plus, Users, Workflow } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';
import {
  guideCompletionSummary,
  userGuidePreferencesFromCompanySettings,
} from '@/features/user-guide/guide-progress.js';
import { useCompanies } from '@/hooks/use-companies.js';
import {
  useAuthorityGrants,
  useAuthorityRequests,
  useInstalledExtensions,
} from '@/hooks/use-extensions.js';
import { useProviders } from '@/hooks/use-providers.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

function statusColor(status: string): string {
  switch (status) {
    case 'thinking':
      return 'bg-[var(--armed-lit)] animate-pulse-slow';
    case 'blocked':
      return 'bg-[var(--led-hold)]';
    case 'error':
      return 'bg-[var(--led-warn)]';
    default:
      return 'bg-[var(--graphite)]';
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

function EmployeeItem({ employee }: { employee: Employee }) {
  const selectedId = useAppStore((s) => s.selectedEmployeeId);
  const setSelected = useAppStore((s) => s.setSelectedEmployee);
  const liveState = useAppStore((s) => s.employeeLive[employee.id]);
  const displayStatus = liveState?.status ?? employee.status;
  const isSelected = selectedId === employee.id;

  // aria-label format mirrors `EmployeeCard` (features/dashboard/employee-card.tsx):
  // `{name}, {title} — {status}. Click to open|close chat.`
  // Two reasons:
  //   1. Accessibility — screen-reader users hear name + title + state in
  //      one announcement instead of three orphaned text fragments.
  //   2. Stable e2e anchor — smoke / rag-flow / ticket-flow specs all pin
  //      `button[aria-label^="{name}, {title}"]` per the convention
  //      documented in `e2e/smoke.spec.ts` header. The dashboard
  //      `CardsView` was retired in favor of `MissionControlDashboard`
  //      (ops stats, no per-employee cards), so the sidenav rail is the
  //      surviving carrier of that contract.
  const ariaLabel = `${employee.name}, ${employee.title} — ${statusLabel(displayStatus)}. Click to ${
    isSelected ? 'close' : 'open'
  } chat.`;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setSelected(isSelected ? null : employee.id)}
      className={cn(
        'nav-tile flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-all',
        isSelected && 'nav-tile-active',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] bg-[var(--carbon-800)] text-caption font-semibold">
        {employee.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body-strong">{employee.name}</span>
          <span className={cn('h-2 w-2 shrink-0 rounded-full', statusColor(displayStatus))} />
        </div>
        <span className="block truncate text-caption text-muted-foreground">{employee.title}</span>
      </div>
    </button>
  );
}

interface SidenavProps {
  employees: Employee[];
  onHireClick: () => void;
}

export function Sidenav({ employees, onHireClick }: SidenavProps) {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const companyId = useAppStore((s) => s.companyId);
  const employeeLive = useAppStore((s) => s.employeeLive);
  const { data: companies = [] } = useCompanies();
  const providersQuery = useProviders();
  const extensionsQuery = useInstalledExtensions(companyId);
  const authorityQuery = useAuthorityGrants(companyId);
  const authorityRequestsQuery = useAuthorityRequests(companyId);
  const activeCompany = companies.find((company) => company.id === companyId) ?? null;

  const thinkingCount = Object.values(employeeLive).filter((e) => e.status === 'thinking').length;
  const idleCount = employees.length - thinkingCount;
  const guidePreferences = userGuidePreferencesFromCompanySettings(activeCompany?.settings);
  const guideSummary = guideCompletionSummary(guidePreferences.selectedRole, guidePreferences, {
    hasEnabledProvider: (providersQuery.data ?? []).some((provider) => provider.enabled),
    hasEmployees: employees.length > 0,
    hasExtensions: (extensionsQuery.data ?? []).length > 0,
    hasAuthorityActivity:
      (authorityQuery.data ?? []).length > 0 || (authorityRequestsQuery.data ?? []).length > 0,
  });
  const showGuideSummary = activeCompany !== null;

  return (
    <aside className="flex w-64 shrink-0 flex-col rounded-card border border-[var(--hairline)] bg-card">
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-placard">
            <Users className="h-4 w-4 text-primary" />
            Team
          </div>
          <p className="mt-1 text-eyebrow text-muted-foreground">Employee rail</p>
        </div>
        <Button variant="default" size="sm" className="h-8 gap-1 px-3" onClick={onHireClick}>
          <Plus className="h-3.5 w-3.5" />
          Hire
        </Button>
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center justify-between rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-3">
          <div className="min-w-0">
            <p className="text-eyebrow text-muted-foreground">Status</p>
            {employees.length === 0 ? (
              <p className="mt-1 text-body-strong text-foreground">Awaiting first hire</p>
            ) : (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-data tabular-nums text-foreground">{employees.length}</span>
                <span className="text-eyebrow text-muted-foreground">Employees Online</span>
              </div>
            )}
          </div>
          {thinkingCount > 0 ? (
            <span className="lamp lamp-sm lamp-hold">{thinkingCount} BUSY</span>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {employees.map((emp) => (
          <EmployeeItem key={emp.id} employee={emp} />
        ))}
        {employees.length === 0 && (
          <p className="px-3 py-6 text-center text-caption text-muted-foreground">
            No employees yet.
            <br />
            Click + Hire to get started.
          </p>
        )}
      </div>

      <Separator />

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => useAppStore.getState().openThreadList()}
          className={cn(
            'nav-tile stencil flex w-full items-center gap-2 px-3 py-2 text-[10.5px] transition-all',
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Threads
        </button>
      </div>

      <Separator />

      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => setActiveView('autonomy')}
          className={cn(
            'nav-tile stencil mb-2 flex w-full items-start gap-2 px-3 py-2 text-left text-[10.5px] transition-all',
            activeView === 'autonomy' && 'nav-tile-active',
          )}
          data-autonomy-nav=""
        >
          <Workflow
            className={cn('mt-0.5 h-4 w-4 shrink-0', activeView === 'autonomy' && 'text-primary')}
          />
          <div className="min-w-0 flex-1">
            <span className="text-body-strong">Autonomy</span>
            <span className="mt-1 block font-sans text-caption normal-case tracking-normal text-muted-foreground">
              Runtimes, routines, budgets, approvals, artifacts, and operator access.
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('user-guide')}
          className={cn(
            'nav-tile stencil flex w-full items-start gap-2 px-3 py-2 text-left text-[10.5px] transition-all',
            activeView === 'user-guide' && 'nav-tile-active',
          )}
          data-user-guide-nav=""
        >
          <BookOpenText
            className={cn('mt-0.5 h-4 w-4 shrink-0', activeView === 'user-guide' && 'text-primary')}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-strong">User Guide</span>
              {showGuideSummary ? (
                <span className="rounded-pill border border-[var(--hairline)] bg-[var(--carbon-850)] px-2 py-0.5 font-sans text-eyebrow-sm normal-case tracking-normal text-muted-foreground">
                  {guideSummary.coreRemaining > 0 ? `${guideSummary.coreRemaining} left` : 'ready'}
                </span>
              ) : null}
            </div>
            <span className="mt-1 block font-sans text-caption normal-case tracking-normal text-muted-foreground">
              Role-based onboarding, setup checklists, and deep links into the live shell.
            </span>
          </div>
        </button>
      </div>

      <Separator />

      <output
        className="flex items-center gap-3 px-4 py-3 text-caption text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="rounded-pill border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-1">
          {thinkingCount > 0 && (
            <>
              <span className="font-medium text-[var(--armed-lit)]">{thinkingCount} busy</span>
              {' / '}
            </>
          )}
          {idleCount} idle
        </span>
      </output>
    </aside>
  );
}
