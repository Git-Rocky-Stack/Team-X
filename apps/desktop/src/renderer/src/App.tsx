import { useEffect, useState } from 'react';

import { useDashboardEvents } from '@/hooks/use-dashboard-events.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useAppStore } from '@/store/app-store.js';

import { AppLayout } from './app/layout.js';
import { AuditView } from './features/audit/audit-view.js';
import { ChatDrawer } from './features/chat/chat-drawer.js';
import { CardsView } from './features/dashboard/cards-view.js';
import { DashboardSubtabs } from './features/dashboard/dashboard-subtabs.js';
import { FloorView } from './features/dashboard/floor-view.js';
import { StreamView } from './features/dashboard/stream-view.js';
import { TimelineView } from './features/dashboard/timeline-view.js';
import { HireDialog } from './features/hire/hire-dialog.js';
import { MeetingsView } from './features/meetings/meetings-view.js';
import { ProjectsView } from './features/projects/projects-view.js';
import { SettingsView } from './features/settings/settings-view.js';
import { TelemetryView } from './features/telemetry/telemetry-view.js';
import { TicketsView } from './features/tickets/tickets-view.js';
import { VaultView } from './features/vault/vault-view.js';

/**
 * Placeholder view for tabs that will be built in later milestones.
 */
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground/70">Coming in a future milestone.</p>
    </div>
  );
}

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
  const [hireOpen, setHireOpen] = useState(false);

  useEffect(() => {
    if (companyId !== null) return;
    window.teamx.companies.list().then((companies) => {
      if (companies.length > 0 && companies[0]) {
        setCompanyId(companies[0].id);
      }
    });
  }, [companyId, setCompanyId]);

  const { data: employees = [], isLoading, isError, refetch } = useEmployees(companyId);

  function renderDashboard() {
    if (isLoading) return <CardsView employees={[]} isLoading />;
    if (isError) return <CardsView employees={[]} isError onRetry={() => refetch()} />;
    if (employees.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-muted-foreground">No employees yet</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Click + Hire in the sidebar to get started.
          </p>
        </div>
      );
    }

    switch (dashboardSubview) {
      case 'timeline':
        return <TimelineView companyId={companyId} employees={employees} />;
      case 'stream':
        return <StreamView employees={employees} />;
      case 'floor':
        return <FloorView employees={employees} />;
      default:
        return <CardsView employees={employees} />;
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
      case 'tickets':
        return <TicketsView companyId={companyId} employees={employees} />;
      case 'org':
        return <ComingSoon label="Org Chart" />;
      case 'projects':
        return <ProjectsView companyId={companyId} employees={employees} />;
      case 'meetings':
        return <MeetingsView companyId={companyId} employees={employees} />;
      case 'chat':
        return <ComingSoon label="Chat" />;
      case 'files':
        return <VaultView companyId={companyId} />;
      case 'telemetry':
        return <TelemetryView />;
      case 'audit':
        return <AuditView companyId={companyId} employees={employees} />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  }

  return (
    <AppLayout employees={employees} onHireClick={() => setHireOpen(true)}>
      {renderContent()}
      <ChatDrawer employees={employees} />
      <HireDialog open={hireOpen} onOpenChange={setHireOpen} companyId={companyId} />
    </AppLayout>
  );
}
