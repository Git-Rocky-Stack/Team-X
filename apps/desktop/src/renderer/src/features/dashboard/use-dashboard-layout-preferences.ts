import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompaniesUpdateRequest, Company } from '@team-x/shared-types';
import { useState } from 'react';

import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardLayoutState,
  type DashboardPanelKey,
  dashboardLayoutFromCompanySettings,
  resetDashboardLayout,
  setDashboardPanelVisibility,
  withDashboardLayoutInCompanySettings,
} from './dashboard-layout.js';

import { ipc } from '@/lib/ipc.js';

function layoutErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  const fallback = String(error);
  return fallback.length > 0 ? fallback : 'Failed to save dashboard layout.';
}

export function patchCompanyDashboardLayoutCache(
  companies: Company[] | undefined,
  companyId: string,
  layout: DashboardLayoutState,
): Company[] | undefined {
  if (!companies) return companies;
  return companies.map((company) =>
    company.id === companyId
      ? {
          ...company,
          settings: withDashboardLayoutInCompanySettings(company.settings, layout),
        }
      : company,
  );
}

interface UseDashboardLayoutPreferencesResult {
  layout: DashboardLayoutState;
  layoutDirty: boolean;
  isSaving: boolean;
  error: string | null;
  setPanelVisible: (panel: DashboardPanelKey, visible: boolean) => void;
  resetPanels: () => void;
}

export function useDashboardLayoutPreferences(
  company: Company | null,
): UseDashboardLayoutPreferencesResult {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const layout = dashboardLayoutFromCompanySettings(company?.settings);
  const layoutDirty =
    layout.agentRuns !== DEFAULT_DASHBOARD_LAYOUT.agentRuns ||
    layout.employeeQueues !== DEFAULT_DASHBOARD_LAYOUT.employeeQueues;

  const mutation = useMutation<
    void,
    Error,
    CompaniesUpdateRequest,
    { previousCompanies?: Company[] }
  >({
    mutationFn: (req) => ipc.companies.update(req),
    onMutate: (req) => {
      setError(null);
      const previousCompanies = queryClient.getQueryData<Company[]>(['companies']);
      queryClient.setQueryData<Company[]>(['companies'], (current) =>
        patchCompanyDashboardLayoutCache(
          current,
          req.companyId,
          dashboardLayoutFromCompanySettings(req.settings as Company['settings'] | undefined),
        ),
      );
      return { previousCompanies };
    },
    onError: (mutationError, _req, context) => {
      if (context?.previousCompanies) {
        queryClient.setQueryData(['companies'], context.previousCompanies);
      }
      setError(layoutErrorMessage(mutationError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  function persistLayout(nextLayout: DashboardLayoutState) {
    if (!company) return;
    mutation.mutate({
      companyId: company.id,
      settings: withDashboardLayoutInCompanySettings(company.settings, nextLayout) as Record<
        string,
        unknown
      >,
    });
  }

  return {
    layout,
    layoutDirty,
    isSaving: mutation.isPending,
    error,
    setPanelVisible: (panel, visible) => {
      persistLayout(setDashboardPanelVisibility(layout, panel, visible));
    },
    resetPanels: () => {
      persistLayout(resetDashboardLayout());
    },
  };
}
