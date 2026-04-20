/**
 * Source-string audit for Phase 5.6 M-D step (e): OrgChartView read-side.
 *
 * Renderer tests run in Node, so this pins the component/hook contracts
 * cheaply. Playwright owns the end-to-end rendering pass.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const ORG_VIEW_PATH = join(currentDirname, 'org-chart-view.tsx');
const ORG_TREE_PATH = join(currentDirname, 'org-chart-tree.tsx');
const ORG_NODE_PATH = join(currentDirname, 'org-chart-node.tsx');
const USE_ORG_CHART_PATH = join(currentDirname, '..', '..', 'hooks', 'use-org-chart.ts');
const APP_PATH = join(currentDirname, '..', '..', 'App.tsx');
const TOP_BAR_PATH = join(currentDirname, '..', '..', 'app', 'top-bar.tsx');

const orgViewExists = existsSync(ORG_VIEW_PATH);
const orgTreeExists = existsSync(ORG_TREE_PATH);
const orgNodeExists = existsSync(ORG_NODE_PATH);
const useOrgChartExists = existsSync(USE_ORG_CHART_PATH);

const orgViewSrc = orgViewExists ? readFileSync(ORG_VIEW_PATH, 'utf8') : '';
const orgTreeSrc = orgTreeExists ? readFileSync(ORG_TREE_PATH, 'utf8') : '';
const orgNodeSrc = orgNodeExists ? readFileSync(ORG_NODE_PATH, 'utf8') : '';
const useOrgChartSrc = useOrgChartExists ? readFileSync(USE_ORG_CHART_PATH, 'utf8') : '';
const appSrc = readFileSync(APP_PATH, 'utf8');
const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');

describe('useOrgChart hook', () => {
  it('queries orgchart.get with the company-scoped React Query key', () => {
    expect(useOrgChartExists).toBe(true);
    expect(useOrgChartSrc).toContain('export function useOrgChart(companyId: string | null)');
    expect(useOrgChartSrc).toContain("queryKey: ['orgchart', companyId]");
    expect(useOrgChartSrc).toContain('ipc.orgchart.get(companyId!)');
    expect(useOrgChartSrc).toContain('enabled: companyId !== null && companyId.length > 0');
  });

  it('subscribes to employee lifecycle events that mutate the org tree', () => {
    expect(useOrgChartSrc).toContain(
      'export function useOrgChartEventSync(companyId: string | null): void',
    );
    expect(useOrgChartSrc).toContain('ipc.events.onDashboard');
    expect(useOrgChartSrc).toContain("'employee.hired'");
    expect(useOrgChartSrc).toContain("'employee.fired'");
    expect(useOrgChartSrc).toContain("'employee.promoted'");
    expect(useOrgChartSrc).toContain("'employee.managerSet'");
    expect(useOrgChartSrc).toMatch(/event\.companyId\s*!==\s*companyId/);
    expect(useOrgChartSrc).toMatch(
      /invalidateQueries\(\{ queryKey:\s*\['orgchart',\s*companyId\]\s*\}\)/,
    );
  });
});

describe('OrgChartView read-side surface', () => {
  it('exists and renders no-company/loading/error/empty states with stable selectors', () => {
    expect(orgViewExists).toBe(true);
    expect(orgViewSrc).toContain('export function OrgChartView(');
    expect(orgViewSrc).toContain('companyId: string | null');
    expect(orgViewSrc).toContain('useOrgChart(companyId)');
    expect(orgViewSrc).toContain('useOrgChartEventSync(companyId)');
    expect(orgViewSrc).toContain('data-org-chart-view=""');
    expect(orgViewSrc).toContain('data-org-chart-state="no-company"');
    expect(orgViewSrc).toContain('data-org-chart-state="loading"');
    expect(orgViewSrc).toContain('data-org-chart-state="error"');
    expect(orgViewSrc).toContain('data-org-chart-state="empty"');
    expect(orgViewSrc).toContain('data-org-chart-retry=""');
  });

  it('passes orgchart.get employees, edges, and rootIds into OrgChartTree', () => {
    expect(orgViewSrc).toContain('<OrgChartTree');
    expect(orgViewSrc).toContain('employees={orgChart.employees}');
    expect(orgViewSrc).toContain('edges={orgChart.edges}');
    expect(orgViewSrc).toContain('rootIds={orgChart.rootIds}');
  });
});

describe('OrgChartTree read-side derivation', () => {
  it('builds the hierarchy client-side in a memoized O(n) pass', () => {
    expect(orgTreeExists).toBe(true);
    expect(orgTreeSrc).toContain('export function OrgChartTree(');
    expect(orgTreeSrc).toContain('useMemo');
    expect(orgTreeSrc).toContain('childrenByManager');
    expect(orgTreeSrc).toContain('new Map<string, Employee[]>()');
    expect(orgTreeSrc).toContain('rootIds.map');
    expect(orgTreeSrc).toContain('<OrgChartNode');
  });
});

describe('OrgChartNode read-side row', () => {
  it('renders level badges, focusable rows, and keyboard-reachable step-f actions', () => {
    expect(orgNodeExists).toBe(true);
    expect(orgNodeSrc).toContain('export function OrgChartNode(');
    expect(orgNodeSrc).toContain('levelPalette');
    expect(orgNodeSrc).toContain('officer:');
    expect(orgNodeSrc).toContain("'senior-management'");
    expect(orgNodeSrc).toContain('management:');
    expect(orgNodeSrc).toContain('supervisor:');
    expect(orgNodeSrc).toContain('lead:');
    expect(orgNodeSrc).toContain('ic:');
    expect(orgNodeSrc).toContain('data-org-chart-node={employee.id}');
    expect(orgNodeSrc).toContain('onKeyDown={handleKeyDown}');
    expect(orgNodeSrc).toContain("event.key === 'Enter'");
    expect(orgNodeSrc).toContain('Actions ship in step (f)');
  });
});

describe('Org tab step-(e) integration', () => {
  it('enables the Org top-bar tab', () => {
    expect(topBarSrc).toContain("{ label: 'Org', icon: GitBranch, view: 'org' }");
    expect(topBarSrc).not.toContain(
      "{ label: 'Org', icon: GitBranch, view: 'org', disabled: true }",
    );
  });

  it('routes the org view to OrgChartView instead of the ComingSoon placeholder', () => {
    expect(appSrc).toContain(
      "import { OrgChartView } from './features/orgchart/org-chart-view.js'",
    );
    expect(appSrc).toMatch(/case 'org':\s*return <OrgChartView companyId=\{companyId\} \/>/);
    expect(appSrc).not.toMatch(/case 'org':\s*return <ComingSoon label="Org Chart" \/>/);
  });
});
