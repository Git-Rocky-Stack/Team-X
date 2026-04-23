import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const APP_PATH = join(currentDirname, '..', '..', 'App.tsx');
const STORE_PATH = join(currentDirname, '..', '..', 'store', 'app-store.ts');
const SIDENAV_PATH = join(currentDirname, '..', '..', 'app', 'sidenav.tsx');
const TOP_BAR_PATH = join(currentDirname, '..', '..', 'app', 'top-bar.tsx');
const HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-operators.ts');
const RUNTIME_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-runtime-profiles.ts');
const ROUTINES_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-routines.ts');
const BUDGETS_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-budgets.ts');
const APPROVALS_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-approvals.ts');
const VIEW_PATH = join(currentDirname, 'autonomy-view.tsx');
const RUNTIME_PANEL_PATH = join(currentDirname, 'runtime-profiles-panel.tsx');
const ROUTINES_PANEL_PATH = join(currentDirname, 'routines-panel.tsx');
const BUDGETS_PANEL_PATH = join(currentDirname, 'budgets-panel.tsx');
const APPROVALS_PANEL_PATH = join(currentDirname, 'approvals-panel.tsx');

const appSrc = readFileSync(APP_PATH, 'utf8');
const storeSrc = readFileSync(STORE_PATH, 'utf8');
const sidenavSrc = readFileSync(SIDENAV_PATH, 'utf8');
const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');
const hookSrc = readFileSync(HOOK_PATH, 'utf8');
const runtimeHookSrc = readFileSync(RUNTIME_HOOK_PATH, 'utf8');
const routinesHookSrc = readFileSync(ROUTINES_HOOK_PATH, 'utf8');
const budgetsHookSrc = readFileSync(BUDGETS_HOOK_PATH, 'utf8');
const approvalsHookSrc = readFileSync(APPROVALS_HOOK_PATH, 'utf8');
const viewSrc = readFileSync(VIEW_PATH, 'utf8');
const runtimePanelSrc = readFileSync(RUNTIME_PANEL_PATH, 'utf8');
const routinesPanelSrc = readFileSync(ROUTINES_PANEL_PATH, 'utf8');
const budgetsPanelSrc = readFileSync(BUDGETS_PANEL_PATH, 'utf8');
const approvalsPanelSrc = readFileSync(APPROVALS_PANEL_PATH, 'utf8');

describe('Autonomy shell wiring', () => {
  it('adds autonomy as a top-level app destination', () => {
    expect(storeSrc).toContain("| 'autonomy'");
    expect(appSrc).toContain("import { AutonomyView } from './features/autonomy/autonomy-view.js';");
    expect(appSrc).toContain("case 'autonomy':");
    expect(appSrc).toContain('<AutonomyView company={activeCompany} companyId={companyId} />');
  });

  it('exposes the new autonomy entry in the navigation shell', () => {
    expect(sidenavSrc).toContain('data-autonomy-nav=""');
    expect(sidenavSrc).toContain("setActiveView('autonomy')");
    expect(sidenavSrc).toContain('Runtimes, routines, budgets, approvals, artifacts, and operator access.');
    expect(topBarSrc).toContain("{ label: 'Autonomy', icon: Workflow, view: 'autonomy' },");
  });

  it('adds a company-scoped operators hook and autonomy shell content', () => {
    expect(hookSrc).toContain("queryKey: ['operators', companyId]");
    expect(hookSrc).toContain('ipc.operators.list(companyId!)');
    expect(viewSrc).toContain("const [activeSubview, setActiveSubview] = useState<AutonomySubview>('access');");
    expect(viewSrc).toContain('AUTONOMY_SUBVIEWS');
    expect(viewSrc).toContain('data-autonomy-view=""');
    expect(viewSrc).toContain('data-autonomy-subview={subview.value}');
    expect(viewSrc).toContain('Operator Control Plane');
    expect(viewSrc).toContain('Team-X stays zero-login by default.');
    expect(viewSrc).toContain("import { RuntimeProfilesPanel } from './runtime-profiles-panel.js';");
    expect(viewSrc).toContain('<RuntimeProfilesPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { RoutinesPanel } from './routines-panel.js';");
    expect(viewSrc).toContain('<RoutinesPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { BudgetsPanel } from './budgets-panel.js';");
    expect(viewSrc).toContain('<BudgetsPanel companyId={companyId} company={company} />');
    expect(viewSrc).toContain("import { ApprovalsPanel } from './approvals-panel.js';");
    expect(viewSrc).toContain('<ApprovalsPanel companyId={companyId} />');
  });

  it('adds runtime hooks and a runtime panel with native pickers and health posture', () => {
    expect(runtimeHookSrc).toContain("queryKey: ['runtime-profiles', companyId]");
    expect(runtimeHookSrc).toContain('ipc.runtimeProfiles.list(companyId!)');
    expect(runtimeHookSrc).toContain('ipc.runtimeProfiles.create');
    expect(runtimeHookSrc).toContain('ipc.runtimeProfiles.update');
    expect(runtimeHookSrc).toContain('ipc.runtimeProfiles.bindEmployee');
    expect(runtimeHookSrc).toContain('ipc.runtimeProfiles.validate');
    expect(runtimePanelSrc).toContain('Create Runtime Profile');
    expect(runtimePanelSrc).toContain('Employee Bindings');
    expect(runtimePanelSrc).toContain('No explicit runtime profile');
    expect(runtimePanelSrc).toContain('data-runtime-profiles-panel=""');
    expect(runtimePanelSrc).toContain('data-runtime-profile-card={profile.id}');
    expect(runtimePanelSrc).toContain('data-runtime-employee-binding={employee.id}');
    expect(runtimePanelSrc).toContain('lastHealthStatus');
    expect(runtimePanelSrc).toContain('Team-X internal is execution-backed in this slice.');
  });

  it('adds routine hooks and a routine panel with cadence and run history', () => {
    expect(routinesHookSrc).toContain("queryKey: ['routines', companyId]");
    expect(routinesHookSrc).toContain("queryKey: ['routine-runs', companyId, routineId ?? null, limit]");
    expect(routinesHookSrc).toContain('ipc.routines.list(companyId!)');
    expect(routinesHookSrc).toContain('ipc.routines.create');
    expect(routinesHookSrc).toContain('ipc.routines.update');
    expect(routinesHookSrc).toContain('ipc.routines.runNow');
    expect(routinesPanelSrc).toContain('Create Routine');
    expect(routinesPanelSrc).toContain('Recent Routine Runs');
    expect(routinesPanelSrc).toContain('Recurring Routines create visible work.');
    expect(routinesPanelSrc).toContain('data-routines-panel=""');
    expect(routinesPanelSrc).toContain('data-routine-card={routine.id}');
    expect(routinesPanelSrc).toContain('data-routine-run={run.id}');
    expect(routinesPanelSrc).toContain('Run Now');
  });

  it('adds budget hooks and a budget panel with policy, ledger, and approval surfaces', () => {
    expect(budgetsHookSrc).toContain("queryKey: ['budgets', 'overview', companyId]");
    expect(budgetsHookSrc).toContain("queryKey: ['budgets', 'policies', companyId]");
    expect(budgetsHookSrc).toContain("queryKey: ['budgets', 'ledger', companyId, scopeKind ?? null, scopeRefId ?? null, limit]");
    expect(budgetsHookSrc).toContain('ipc.budgets.getOverview(companyId!)');
    expect(budgetsHookSrc).toContain('ipc.budgets.listPolicies(companyId!)');
    expect(budgetsHookSrc).toContain('ipc.budgets.createPolicy');
    expect(budgetsHookSrc).toContain('ipc.budgets.updatePolicy');
    expect(budgetsHookSrc).toContain('ipc.budgets.deletePolicy');
    expect(budgetsPanelSrc).toContain('Create Budget Policy');
    expect(budgetsPanelSrc).toContain('Recent Spend Ledger');
    expect(budgetsPanelSrc).toContain('Pending Budget Approvals');
    expect(budgetsPanelSrc).toContain('Provider Mix');
    expect(budgetsPanelSrc).toContain('data-budgets-panel=""');
    expect(budgetsPanelSrc).toContain('data-budget-policy={policy.id}');
    expect(budgetsPanelSrc).toContain('data-budget-ledger={entry.id}');
    expect(budgetsPanelSrc).toContain('data-budget-approval={approval.id}');
  });

  it('adds approval hooks and a unified approvals panel with decision controls', () => {
    expect(approvalsHookSrc).toContain("queryKey: ['approvals', companyId, kind ?? null, status ?? null]");
    expect(approvalsHookSrc).toContain('ipc.approvals.list');
    expect(approvalsHookSrc).toContain('ipc.approvals.review');
    expect(approvalsPanelSrc).toContain('Unified Approval Queue');
    expect(approvalsPanelSrc).toContain('data-approvals-panel=""');
    expect(approvalsPanelSrc).toContain('data-approval-card={item.id}');
    expect(approvalsPanelSrc).toContain('Approve');
    expect(approvalsPanelSrc).toContain('Deny');
    expect(approvalsPanelSrc).toContain('Latest rationale:');
  });
});
