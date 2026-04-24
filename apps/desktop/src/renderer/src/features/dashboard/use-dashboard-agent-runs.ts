import type { DashboardEvent } from '@team-x/shared-types';

import { useEffect, useState } from 'react';

import { useRecentRuns } from '@/hooks/use-telemetry.js';
import { ipc } from '@/lib/ipc.js';

import {
  type DashboardAgentRun,
  mergeDashboardAgentRuns,
  projectTelemetryRecentRuns,
  reduceDashboardAgentRuns,
} from './agent-runs-projections.js';

export interface UseDashboardAgentRunsResult {
  runs: DashboardAgentRun[];
  isLoading: boolean;
  isError: boolean;
  hasHistoryWarning: boolean;
  errorMessage: string | null;
  retry: () => Promise<unknown>;
}

function agentRunsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  const fallback = String(error);
  return fallback.length > 0 ? fallback : 'Persisted agent runs could not load for this workspace.';
}

export function useDashboardAgentRuns(companyId: string | null): UseDashboardAgentRunsResult {
  const [runs, setRuns] = useState<DashboardAgentRun[]>([]);
  const recentRunsQuery = useRecentRuns(
    companyId
      ? {
          companyId,
          kind: 'agentic',
          limit: 6,
        }
      : null,
  );

  useEffect(() => {
    if (!recentRunsQuery.data) return;
    setRuns((previous) =>
      mergeDashboardAgentRuns(projectTelemetryRecentRuns(recentRunsQuery.data), previous),
    );
  }, [recentRunsQuery.data]);

  useEffect(() => {
    setRuns([]);
    if (!companyId) return;

    const unsubscribe = ipc.events.onDashboard((event: DashboardEvent) => {
      if (event.companyId !== companyId) return;
      setRuns((previous) => reduceDashboardAgentRuns(previous, event));
    });

    return unsubscribe;
  }, [companyId]);

  return {
    runs,
    isLoading: recentRunsQuery.isLoading && runs.length === 0,
    isError: recentRunsQuery.isError && runs.length === 0,
    hasHistoryWarning: recentRunsQuery.isError && runs.length > 0,
    errorMessage: recentRunsQuery.isError ? agentRunsErrorMessage(recentRunsQuery.error) : null,
    retry: () => recentRunsQuery.refetch(),
  };
}
