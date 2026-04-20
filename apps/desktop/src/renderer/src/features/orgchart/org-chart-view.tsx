import type { Employee } from '@team-x/shared-types';

import { AlertCircle, GitBranch, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useFireEmployee } from '@/hooks/use-fire-employee.js';
import { useOrgChart, useOrgChartEventSync } from '@/hooks/use-org-chart.js';
import { usePromoteEmployee } from '@/hooks/use-promote-employee.js';
import { ROLE_OPTIONS } from '@/hooks/use-roles.js';
import { useSetManager } from '@/hooks/use-set-manager.js';
import { useAppStore } from '@/store/app-store.js';

import { FireDialog } from './fire-dialog.js';
import { OrgChartTree } from './org-chart-tree.js';
import { PromoteDialog } from './promote-dialog.js';

interface OrgChartViewProps {
  companyId: string | null;
}

export function OrgChartView({ companyId }: OrgChartViewProps) {
  useOrgChartEventSync(companyId);
  const { data: orgChart, isLoading, isError, refetch } = useOrgChart(companyId);
  const fireEmployee = useFireEmployee(companyId ?? '');
  const promoteEmployee = usePromoteEmployee(companyId ?? '');
  const setManager = useSetManager(companyId ?? '');
  const setSelectedEmployee = useAppStore((state) => state.setSelectedEmployee);
  const [toast, setToast] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Employee | null>(null);
  const [fireTarget, setFireTarget] = useState<Employee | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [fireError, setFireError] = useState<string | null>(null);

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function handleSetManager(employeeId: string, managerId: string | null) {
    try {
      setToast(null);
      await setManager.mutateAsync({ employeeId, managerId });
      setToast('Reporting line updated.');
    } catch (error) {
      setToast(`Could not update reporting line. ${errorMessage(error)}`);
    }
  }

  async function handlePromote(employeeId: string, roleId: string) {
    const role = ROLE_OPTIONS.find((option) => option.id === roleId);
    try {
      setPromoteError(null);
      await promoteEmployee.mutateAsync({
        employeeId,
        newRoleId: roleId,
        optimisticLevel: role?.level,
        optimisticTitle: role?.name,
      });
      setPromoteTarget(null);
      setToast('Employee role updated.');
    } catch (error) {
      setPromoteError(errorMessage(error));
    }
  }

  async function handleFire(employeeId: string) {
    try {
      setFireError(null);
      await fireEmployee.mutateAsync(employeeId);
      setFireTarget(null);
      setToast('Employee removed.');
    } catch (error) {
      setFireError(errorMessage(error));
    }
  }

  if (companyId === null) {
    return (
      <section
        className="flex h-full flex-col items-center justify-center px-6 text-center"
        data-org-chart-view=""
        data-org-chart-state="no-company"
      >
        <GitBranch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">No workspace selected</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Choose or create a workspace to view its reporting structure.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className="flex h-full flex-col items-center justify-center px-6 text-center"
        data-org-chart-view=""
        data-org-chart-state="loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted-foreground">Loading org chart...</p>
      </section>
    );
  }

  if (isError || !orgChart) {
    return (
      <section
        className="flex h-full flex-col items-center justify-center px-6 text-center"
        data-org-chart-view=""
        data-org-chart-state="error"
      >
        <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Org chart could not load</h2>
        <button
          type="button"
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-100"
          data-org-chart-retry=""
          onClick={() => refetch()}
        >
          Retry
        </button>
      </section>
    );
  }

  if (orgChart.employees.length === 0) {
    return (
      <section
        className="flex h-full flex-col items-center justify-center px-6 text-center"
        data-org-chart-view=""
        data-org-chart-state="empty"
      >
        <GitBranch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">No employees yet</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Hire your first role to build the org chart.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col" data-org-chart-view="">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
            <GitBranch className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Org chart</h2>
            <p className="text-xs text-muted-foreground">
              Reporting lines are shown from company roots down.
            </p>
          </div>
        </div>
      </header>

      <OrgChartTree
        employees={orgChart.employees}
        edges={orgChart.edges}
        rootIds={orgChart.rootIds}
        onChat={setSelectedEmployee}
        onPromote={(employee) => {
          setPromoteError(null);
          setPromoteTarget(employee);
        }}
        onFire={(employee) => {
          setFireError(null);
          setFireTarget(employee);
        }}
        onSetManager={handleSetManager}
      />

      {toast ? (
        <output
          className="fixed bottom-4 right-4 z-50 max-w-md rounded-md border border-border bg-surface-100 px-4 py-3 text-sm text-foreground shadow-lg"
          data-org-chart-toast=""
        >
          {toast}
        </output>
      ) : null}

      <PromoteDialog
        employee={promoteTarget}
        open={promoteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPromoteTarget(null);
        }}
        onPromote={handlePromote}
        error={promoteError}
      />
      <FireDialog
        employee={fireTarget}
        open={fireTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFireTarget(null);
        }}
        onFire={handleFire}
        error={fireError}
      />
    </section>
  );
}
