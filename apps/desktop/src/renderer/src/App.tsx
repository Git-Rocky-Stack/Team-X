import { useEffect, useRef, useState } from 'react';


import { AppLayout } from './app/layout.js';
import { ErrorBoundary } from './components/error-boundary.js';
import { AuditView } from './features/audit/audit-view.js';
import { AutonomyView } from './features/autonomy/autonomy-view.js';
import { ChatDrawer } from './features/chat/chat-drawer.js';
import { ChatView } from './features/chat/chat-view.js';
import { CommandPalette } from './features/command/command-palette.js';
import { CopilotSidebar } from './features/copilot/copilot-sidebar.js';
import { CommandsView } from './features/dashboard/commands-view.js';
import { DashboardSubtabs } from './features/dashboard/dashboard-subtabs.js';
import { FloorView } from './features/dashboard/floor-view.js';
import { MissionControlDashboard } from './features/dashboard/mission-control-dashboard.js';
import { StreamView } from './features/dashboard/stream-view.js';
import { TimelineView } from './features/dashboard/timeline-view.js';
import { HireDialog } from './features/hire/hire-dialog.js';
import { MeetingsView } from './features/meetings/meetings-view.js';
import { OrgChartView } from './features/orgchart/org-chart-view.js';
import { ProjectsView } from './features/projects/projects-view.js';
import { SettingsView } from './features/settings/settings-view.js';
import { TelemetryView } from './features/telemetry/telemetry-view.js';
import { TicketsView } from './features/tickets/tickets-view.js';
import { UserGuideView } from './features/user-guide/user-guide-view.js';
import { VaultView } from './features/vault/vault-view.js';

import { useCompanies } from '@/hooks/use-companies.js';
import { useDashboardEvents } from '@/hooks/use-dashboard-events.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Root application component. Phase 3 expands routing to all top-level
 * tabs and dashboard subviews (Cards / Timeline / Stream / Floor).
 */
export default function App() {
  useDashboardEvents();

  const companyId = useAppStore((s) => s.companyId);
  const setCompanyId = useAppStore((s) => s.setCompanyId);
  const activeView = useAppStore((s) => s.activeView);
  const dashboardSubview = useAppStore((s) => s.dashboardSubview);
  const copilotSidebarOpen = useAppStore((s) => s.copilotSidebarOpen);
  const setCopilotSidebarOpen = useAppStore((s) => s.setCopilotSidebarOpen);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const hireDialogRequestNonce = useAppStore((s) => s.hireDialogRequestNonce);
  const [hireOpen, setHireOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const autoOpenedUserGuideRef = useRef<Set<string>>(new Set());

  // Reactive active-company selection. Replaces the previous one-shot
  // direct preload-bridge fetch so that (a) the source of truth for
  // the company list is a single hook (useCompanies) that the switcher
  // and this auto-selector share, and (b) the effect re-evaluates
  // when the list changes on bus events — closing the Phase 5.6 M-D
  // step (a) P1 finding where a company.deleted event for the ACTIVE
  // company left companyId pointing at a dead row with no recovery.
  // Audit: docs/qa/2026-04-19-m-d-step-a-ground-zero-audit.md §3.1.
  // Auto-select fires when:
  //   (1) no active company (first launch / post-clear), OR
  //   (2) the active company id is no longer in the list (deleted).
  // Zero-company edge case is left to the step (b) Create workspace
  // CTA + step (c) CompanySettings recovery flows.
  const { data: companies } = useCompanies();

  useEffect(() => {
    if (companies === undefined) return; // still loading
    const activeStillExists = companyId !== null && companies.some((c) => c.id === companyId);
    if (activeStillExists) return;
    if (companies.length > 0 && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companyId, setCompanyId, companies]);

  // Global keybindings (mounted once at the shell root so the shortcuts
  // work from any view):
  //   - `Cmd/Ctrl+K`        → toggle the command palette (M30).
  //   - `Cmd/Ctrl+Shift+K`  → toggle the Copilot sidebar (M34).
  //
  // Both share the K key so a single handler dispatches based on the
  // `shiftKey` modifier. Radix's Dialog already closes on Esc — no
  // additional handler needed for dismissal.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Only the K key with the platform meta modifier triggers either shortcut.
      if (event.key !== 'k' && event.key !== 'K') return;
      const isMac = /Mac|iPod|iPhone|iPad/i.test(navigator.platform);
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier) return;

      // Don't hijack Cmd/Ctrl+K (or Shift variant) when focus is inside
      // another dialog (e.g. the Hire dialog). Radix dialogs render
      // inside a portal with role="dialog" — climb from the focused
      // element and bail if we find one. The Copilot sidebar is itself
      // a Radix Sheet (also role="dialog"), so its own toggle key
      // presses must still fire — we check the `data-copilot-sidebar-root`
      // marker first and let those through.
      const target = event.target as HTMLElement | null;
      const inCopilotSidebar = target?.closest('[data-copilot-sidebar-root]');
      if (!inCopilotSidebar && target?.closest('[role="dialog"]')) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        setCopilotSidebarOpen(!copilotSidebarOpen);
      } else {
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copilotSidebarOpen, setCopilotSidebarOpen]);

  const { data: employees = [], isLoading, isError, refetch } = useEmployees(companyId);
  const activeCompany = companies?.find((candidate) => candidate.id === companyId) ?? null;

  useEffect(() => {
    if (hireDialogRequestNonce <= 0) return;
    setHireOpen(true);
  }, [hireDialogRequestNonce]);

  useEffect(() => {
    if (!activeCompany) return;
    const welcomeDismissedAt = activeCompany.settings?.userGuide?.welcomeDismissedAt;
    if (typeof welcomeDismissedAt === 'string' && welcomeDismissedAt.length > 0) return;
    if (autoOpenedUserGuideRef.current.has(activeCompany.id)) return;
    autoOpenedUserGuideRef.current.add(activeCompany.id);
    setActiveView('user-guide');
  }, [activeCompany, setActiveView]);

  function renderDashboard() {
    // Commands subview bypasses the loading/empty-state guards — it
    // reads from `command_history` (M30) which is valuable even before
    // the first employee is hired, and has its own loading/empty UI.
    if (dashboardSubview === 'commands') {
      return <CommandsView companyId={companyId} />;
    }

    switch (dashboardSubview) {
      case 'timeline':
        return <TimelineView companyId={companyId} employees={employees} />;
      case 'stream':
        return <StreamView employees={employees} />;
      case 'floor':
        return <FloorView employees={employees} />;
      default:
        return (
          <MissionControlDashboard
            companyId={companyId}
            company={activeCompany}
            employees={employees}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
        );
    }
  }

  function renderContent() {
    switch (activeView) {
      case 'dashboard':
        return (
          <div className="flex h-full flex-col">
            <DashboardSubtabs />
            <div className="flex-1 overflow-y-auto scrollbar-thin">{renderDashboard()}</div>
          </div>
        );
      case 'autonomy':
        return <AutonomyView company={activeCompany} companyId={companyId} />;
      case 'tickets':
        return <TicketsView companyId={companyId} employees={employees} />;
      case 'org':
        return <OrgChartView companyId={companyId} />;
      case 'projects':
        return <ProjectsView companyId={companyId} employees={employees} />;
      case 'meetings':
        return <MeetingsView companyId={companyId} employees={employees} />;
      case 'chat':
        return <ChatView companyId={companyId} employees={employees} />;
      case 'files':
        return <VaultView companyId={companyId} />;
      case 'telemetry':
        return <TelemetryView />;
      case 'audit':
        return <AuditView companyId={companyId} employees={employees} />;
      case 'user-guide':
        return <UserGuideView company={activeCompany} employees={employees} />;
      case 'settings':
        return (
          <ErrorBoundary componentName="SettingsView">
            <SettingsView />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  }

  return (
    <AppLayout employees={employees} onHireClick={() => setHireOpen(true)}>
      {renderContent()}
      <ChatDrawer employees={employees} />
      <HireDialog open={hireOpen} onOpenChange={setHireOpen} companyId={companyId} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} companyId={companyId} />
      <CopilotSidebar />
    </AppLayout>
  );
}
