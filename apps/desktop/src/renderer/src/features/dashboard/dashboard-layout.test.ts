import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DASHBOARD_LAYOUT,
  dashboardLayoutFromCompanySettings,
  resetDashboardLayout,
  resolveDashboardLayout,
  setDashboardPanelVisibility,
  visiblePrimaryPanelCount,
  withDashboardLayoutInCompanySettings,
} from './dashboard-layout.js';

describe('dashboard-layout', () => {
  it('resolves missing state to the default hybrid layout', () => {
    expect(resolveDashboardLayout(null)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(resolveDashboardLayout(undefined)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it('toggles a single panel without mutating the other panel', () => {
    expect(setDashboardPanelVisibility(null, 'agentRuns', false)).toEqual({
      agentRuns: false,
      employeeQueues: true,
    });
  });

  it('resets back to the default hybrid layout', () => {
    expect(resetDashboardLayout()).toEqual({
      agentRuns: true,
      employeeQueues: true,
    });
  });

  it('reads persisted dashboard layout from company settings', () => {
    expect(
      dashboardLayoutFromCompanySettings({
        dashboardLayout: {
          version: 1,
          showAgentRuns: false,
          showEmployeeQueues: true,
        },
      }),
    ).toEqual({
      agentRuns: false,
      employeeQueues: true,
    });
  });

  it('writes dashboard layout back into company settings', () => {
    expect(
      withDashboardLayoutInCompanySettings(
        { mission: 'Ship it' },
        { agentRuns: false, employeeQueues: true },
      ),
    ).toEqual({
      mission: 'Ship it',
      dashboardLayout: {
        version: 1,
        showAgentRuns: false,
        showEmployeeQueues: true,
      },
    });
  });

  it('counts visible primary panels after resolution', () => {
    expect(visiblePrimaryPanelCount({ agentRuns: true, employeeQueues: false })).toBe(1);
    expect(visiblePrimaryPanelCount({ agentRuns: false, employeeQueues: false })).toBe(0);
  });
});
