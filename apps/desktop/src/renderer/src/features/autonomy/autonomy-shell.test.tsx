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
const ARTIFACTS_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-artifacts.ts');
const MEMORY_HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-memory.ts');
const CLIENT_PATH = join(currentDirname, 'autonomy-client.ts');
const VIEW_PATH = join(currentDirname, 'autonomy-view.tsx');
const RUNTIME_PANEL_PATH = join(currentDirname, 'runtime-profiles-panel.tsx');
const ROUTINES_PANEL_PATH = join(currentDirname, 'routines-panel.tsx');
const BUDGETS_PANEL_PATH = join(currentDirname, 'budgets-panel.tsx');
const APPROVALS_PANEL_PATH = join(currentDirname, 'approvals-panel.tsx');
const ARTIFACTS_PANEL_PATH = join(currentDirname, 'artifacts-panel.tsx');
const MEMORY_PANEL_PATH = join(currentDirname, 'memory-panel.tsx');
const MEMORY_FORMATTERS_PATH = join(currentDirname, '..', 'memory', 'memory-formatters.ts');

const appSrc = readFileSync(APP_PATH, 'utf8');
const storeSrc = readFileSync(STORE_PATH, 'utf8');
const sidenavSrc = readFileSync(SIDENAV_PATH, 'utf8');
const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');
const hookSrc = readFileSync(HOOK_PATH, 'utf8');
const runtimeHookSrc = readFileSync(RUNTIME_HOOK_PATH, 'utf8');
const routinesHookSrc = readFileSync(ROUTINES_HOOK_PATH, 'utf8');
const budgetsHookSrc = readFileSync(BUDGETS_HOOK_PATH, 'utf8');
const approvalsHookSrc = readFileSync(APPROVALS_HOOK_PATH, 'utf8');
const artifactsHookSrc = readFileSync(ARTIFACTS_HOOK_PATH, 'utf8');
const memoryHookSrc = readFileSync(MEMORY_HOOK_PATH, 'utf8');
const clientSrc = readFileSync(CLIENT_PATH, 'utf8');
const viewSrc = readFileSync(VIEW_PATH, 'utf8');
const runtimePanelSrc = readFileSync(RUNTIME_PANEL_PATH, 'utf8');
const routinesPanelSrc = readFileSync(ROUTINES_PANEL_PATH, 'utf8');
const budgetsPanelSrc = readFileSync(BUDGETS_PANEL_PATH, 'utf8');
const approvalsPanelSrc = readFileSync(APPROVALS_PANEL_PATH, 'utf8');
const artifactsPanelSrc = readFileSync(ARTIFACTS_PANEL_PATH, 'utf8');
const memoryPanelSrc = readFileSync(MEMORY_PANEL_PATH, 'utf8');
const memoryFormattersSrc = readFileSync(MEMORY_FORMATTERS_PATH, 'utf8');

describe('Autonomy shell wiring', () => {
  it('adds autonomy as a top-level app destination', () => {
    expect(storeSrc).toContain("| 'autonomy'");
    expect(appSrc).toContain(
      "import { AutonomyView } from './features/autonomy/autonomy-view.js';",
    );
    expect(appSrc).toContain("case 'autonomy':");
    expect(appSrc).toContain('<AutonomyView company={activeCompany} companyId={companyId} />');
  });

  it('exposes the new autonomy entry in the navigation shell', () => {
    expect(sidenavSrc).toContain('data-autonomy-nav=""');
    expect(sidenavSrc).toContain("setActiveView('autonomy')");
    expect(sidenavSrc).toContain(
      'Runtimes, routines, budgets, approvals, artifacts, and operator access.',
    );
    expect(topBarSrc).toContain("{ label: 'Autonomy', icon: Workflow, view: 'autonomy' },");
  });

  it('adds a company-scoped operators hook and autonomy shell content', () => {
    expect(hookSrc).toContain("queryKey: ['operators', companyId]");
    expect(hookSrc).toContain('autonomyClient.operators.list(companyId!)');
    expect(storeSrc).toContain("autonomySubview: 'access'");
    expect(storeSrc).toContain('autonomyMemoryThreadId: string | null;');
    expect(storeSrc).toContain('setAutonomySubview: (subview: AutonomySubview) => void;');
    expect(storeSrc).toContain('setAutonomyMemoryThreadId: (threadId: string | null) => void;');
    expect(storeSrc).toContain('openAutonomyMemory: (threadId: string | null) => void;');
    expect(viewSrc).toContain(
      'const activeSubview = useAppStore((state) => state.autonomySubview);',
    );
    expect(viewSrc).toContain(
      'const setActiveSubview = useAppStore((state) => state.setAutonomySubview);',
    );
    expect(viewSrc).toContain('AUTONOMY_SUBVIEWS');
    expect(viewSrc).toContain('data-autonomy-view=""');
    expect(viewSrc).toContain('data-autonomy-subview={subview.value}');
    expect(viewSrc).toContain('Operator Control Plane');
    expect(viewSrc).toContain('zero-login by default');
    expect(viewSrc).toContain(
      "import { RuntimeProfilesPanel } from './runtime-profiles-panel.js';",
    );
    expect(viewSrc).toContain('<RuntimeProfilesPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { RoutinesPanel } from './routines-panel.js';");
    expect(viewSrc).toContain('<RoutinesPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { BudgetsPanel } from './budgets-panel.js';");
    expect(viewSrc).toContain('<BudgetsPanel companyId={companyId} company={company} />');
    expect(viewSrc).toContain("import { ApprovalsPanel } from './approvals-panel.js';");
    expect(viewSrc).toContain('<ApprovalsPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { ArtifactsPanel } from './artifacts-panel.js';");
    expect(viewSrc).toContain('<ArtifactsPanel companyId={companyId} />');
    expect(viewSrc).toContain("import { MemoryPanel } from './memory-panel.js';");
    expect(viewSrc).toContain('<MemoryPanel companyId={companyId} />');
  });

  it('adds runtime hooks and a runtime panel with native pickers and health posture', () => {
    expect(clientSrc).toContain('export const autonomyClient = {');
    expect(runtimeHookSrc).toContain(
      "import { autonomyClient } from '@/features/autonomy/autonomy-client.js';",
    );
    expect(runtimeHookSrc).toContain("queryKey: ['runtime-profiles', companyId]");
    expect(runtimeHookSrc).toContain('autonomyClient.runtimeProfiles.list(companyId!)');
    expect(runtimeHookSrc).toContain('autonomyClient.runtimeProfiles.create');
    expect(runtimeHookSrc).toContain('autonomyClient.runtimeProfiles.update');
    expect(runtimeHookSrc).toContain('autonomyClient.runtimeProfiles.bindEmployee');
    expect(runtimeHookSrc).toContain('autonomyClient.runtimeProfiles.validate');
    expect(runtimePanelSrc).toContain('Create Runtime Profile');
    expect(runtimePanelSrc).toContain('Employee Bindings');
    expect(runtimePanelSrc).toContain('No explicit runtime profile');
    expect(runtimePanelSrc).toContain('data-runtime-profiles-panel=""');
    expect(runtimePanelSrc).toContain('data-runtime-profile-card={profile.id}');
    expect(runtimePanelSrc).toContain('data-runtime-employee-binding={employee.id}');
    expect(runtimePanelSrc).toContain('lastHealthStatus');
    expect(runtimePanelSrc).toContain(
      'Team-X Internal, Bash Launcher, and HTTP Adapter are execution-backed now.',
    );
  });

  it('adds routine hooks and a routine panel with cadence and run history', () => {
    expect(routinesHookSrc).toContain(
      "import { autonomyClient } from '@/features/autonomy/autonomy-client.js';",
    );
    expect(routinesHookSrc).toContain("queryKey: ['routines', companyId]");
    expect(routinesHookSrc).toContain(
      "queryKey: ['routine-runs', companyId, routineId ?? null, limit]",
    );
    expect(routinesHookSrc).toContain('autonomyClient.routines.list(companyId!)');
    expect(routinesHookSrc).toContain('autonomyClient.routines.create');
    expect(routinesHookSrc).toContain('autonomyClient.routines.update');
    expect(routinesHookSrc).toContain('autonomyClient.routines.runNow');
    expect(routinesPanelSrc).toContain('Create Routine');
    expect(routinesPanelSrc).toContain('Recent Routine Runs');
    expect(routinesPanelSrc).toContain('Recurring Routines create visible work.');
    expect(routinesPanelSrc).toContain('data-routines-panel=""');
    expect(routinesPanelSrc).toContain('data-routine-card={routine.id}');
    expect(routinesPanelSrc).toContain('data-routine-run={run.id}');
    expect(routinesPanelSrc).toContain('Run Now');
  });

  it('adds budget hooks and a budget panel with policy, ledger, and approval surfaces', () => {
    expect(budgetsHookSrc).toContain(
      "import { autonomyClient } from '@/features/autonomy/autonomy-client.js';",
    );
    expect(budgetsHookSrc).toContain("queryKey: ['budgets', 'overview', companyId]");
    expect(budgetsHookSrc).toContain("queryKey: ['budgets', 'policies', companyId]");
    expect(budgetsHookSrc).toContain(
      "queryKey: ['budgets', 'ledger', companyId, scopeKind ?? null, scopeRefId ?? null, limit]",
    );
    expect(budgetsHookSrc).toContain('autonomyClient.budgets.getOverview(companyId!)');
    expect(budgetsHookSrc).toContain('autonomyClient.budgets.listPolicies(companyId!)');
    expect(budgetsHookSrc).toContain('autonomyClient.budgets.createPolicy');
    expect(budgetsHookSrc).toContain('autonomyClient.budgets.updatePolicy');
    expect(budgetsHookSrc).toContain('autonomyClient.budgets.deletePolicy');
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
    expect(approvalsHookSrc).toContain(
      "import { autonomyClient } from '@/features/autonomy/autonomy-client.js';",
    );
    expect(approvalsHookSrc).toContain(
      "queryKey: ['approvals', companyId, kind ?? null, status ?? null]",
    );
    expect(approvalsHookSrc).toContain('autonomyClient.approvals.list');
    expect(approvalsHookSrc).toContain('autonomyClient.approvals.review');
    expect(approvalsPanelSrc).toContain('Unified Approval Queue');
    expect(approvalsPanelSrc).toContain('data-approvals-panel=""');
    expect(approvalsPanelSrc).toContain('data-approval-card={item.id}');
    expect(approvalsPanelSrc).toContain('Approve');
    expect(approvalsPanelSrc).toContain('Deny');
    expect(approvalsPanelSrc).toContain('Latest rationale:');
  });

  it('adds artifact hooks and a real artifacts panel with preview and jump actions', () => {
    expect(artifactsHookSrc).toContain(
      "import { autonomyClient } from '@/features/autonomy/autonomy-client.js';",
    );
    expect(artifactsHookSrc).toContain("queryKey: ['artifacts', companyId, limit]");
    expect(artifactsHookSrc).toContain('autonomyClient.artifacts.list');
    expect(artifactsHookSrc).toContain("event.type !== 'routine.runCompleted'");
    expect(artifactsHookSrc).toContain("event.type !== 'approval.reviewed'");
    expect(artifactsHookSrc).toContain("event.type !== 'vault.file_created'");
    expect(artifactsPanelSrc).toContain('data-artifacts-panel=""');
    expect(artifactsPanelSrc).toContain('data-artifact-card={artifact.id}');
    expect(artifactsPanelSrc).toContain('Hide preview');
    expect(artifactsPanelSrc).toContain('Open ticket');
    expect(artifactsPanelSrc).toContain('Open files');
    expect(viewSrc).toContain('Open approvals');
    expect(viewSrc).toContain('Open budgets');
  });

  it('adds memory hooks and a thread-focused memory panel', () => {
    expect(clientSrc).toContain('memory: {');
    expect(clientSrc).toContain('ipc.memory.getThreadDigest');
    expect(clientSrc).toContain('ipc.memory.listRunCheckpoints');
    expect(clientSrc).toContain('ipc.memory.packThreadContext');
    expect(memoryHookSrc).toContain("queryKey: ['memory', 'digest', companyId, threadId]");
    expect(memoryHookSrc).toContain(
      "queryKey: ['memory', 'checkpoints', companyId, threadId, limit]",
    );
    expect(memoryHookSrc).toContain(
      "queryKey: ['memory', 'packed-context', companyId, threadId, targetTokenBudget ?? null, recentTurnLimit ?? null]",
    );
    expect(memoryHookSrc).toContain('autonomyClient.memory.getThreadDigest');
    expect(memoryHookSrc).toContain('autonomyClient.memory.listRunCheckpoints');
    expect(memoryHookSrc).toContain('autonomyClient.memory.packThreadContext');
    expect(memoryPanelSrc).toContain('data-memory-panel=""');
    expect(memoryPanelSrc).toContain(
      'const selectedThreadId = useAppStore((state) => state.autonomyMemoryThreadId);',
    );
    expect(memoryPanelSrc).toContain(
      'const setSelectedThreadId = useAppStore((state) => state.setAutonomyMemoryThreadId);',
    );
    expect(memoryPanelSrc).toContain('data-memory-thread-select=""');
    expect(memoryPanelSrc).toContain('Refresh memory');
    expect(memoryPanelSrc).toContain('Open chat');
    expect(memoryPanelSrc).toContain('Thread Memory');
    expect(memoryPanelSrc).toContain('Packed Context');
    expect(memoryPanelSrc).toContain('Run Checkpoints');
    expect(memoryPanelSrc).toContain('data-memory-checkpoint={checkpoint.id}');
    expect(memoryPanelSrc).toContain('data-memory-dropped-block={drop.blockId}');
    expect(memoryPanelSrc).toContain('resumeOriginLabel');
    expect(memoryPanelSrc).toContain('resumeOriginHint');
    expect(memoryFormattersSrc).toContain('Resumed from');
  });
});
