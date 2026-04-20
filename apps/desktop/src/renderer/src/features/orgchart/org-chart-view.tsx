import { AlertCircle, GitBranch, Loader2 } from 'lucide-react';

import { useOrgChart, useOrgChartEventSync } from '@/hooks/use-org-chart.js';

import { OrgChartTree } from './org-chart-tree.js';

interface OrgChartViewProps {
  companyId: string | null;
}

export function OrgChartView({ companyId }: OrgChartViewProps) {
  useOrgChartEventSync(companyId);
  const { data: orgChart, isLoading, isError, refetch } = useOrgChart(companyId);

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
      />
    </section>
  );
}
