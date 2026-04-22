import type { CompanySettings } from '@team-x/shared-types';

export interface DashboardLayoutState {
  agentRuns: boolean;
  employeeQueues: boolean;
}

export type DashboardPanelKey = keyof DashboardLayoutState;

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutState = {
  agentRuns: true,
  employeeQueues: true,
};

export function resolveDashboardLayout(
  layout?: Partial<DashboardLayoutState> | null,
): DashboardLayoutState {
  return {
    agentRuns: layout?.agentRuns ?? DEFAULT_DASHBOARD_LAYOUT.agentRuns,
    employeeQueues: layout?.employeeQueues ?? DEFAULT_DASHBOARD_LAYOUT.employeeQueues,
  };
}

export function setDashboardPanelVisibility(
  layout: Partial<DashboardLayoutState> | null | undefined,
  panel: DashboardPanelKey,
  visible: boolean,
): DashboardLayoutState {
  return {
    ...resolveDashboardLayout(layout),
    [panel]: visible,
  };
}

export function resetDashboardLayout(): DashboardLayoutState {
  return { ...DEFAULT_DASHBOARD_LAYOUT };
}

export function dashboardLayoutFromCompanySettings(
  settings?: CompanySettings | null,
): DashboardLayoutState {
  const persisted = settings?.dashboardLayout;
  if (!persisted || persisted.version !== 1) {
    return resetDashboardLayout();
  }
  return resolveDashboardLayout({
    agentRuns: persisted.showAgentRuns,
    employeeQueues: persisted.showEmployeeQueues,
  });
}

export function withDashboardLayoutInCompanySettings(
  settings: CompanySettings | null | undefined,
  layout: Partial<DashboardLayoutState> | null | undefined,
): CompanySettings {
  const resolved = resolveDashboardLayout(layout);
  return {
    ...(settings ?? {}),
    dashboardLayout: {
      version: 1,
      showAgentRuns: resolved.agentRuns,
      showEmployeeQueues: resolved.employeeQueues,
    },
  };
}

export function visiblePrimaryPanelCount(layout: Partial<DashboardLayoutState> | null): number {
  const resolved = resolveDashboardLayout(layout);
  return Number(resolved.agentRuns) + Number(resolved.employeeQueues);
}
