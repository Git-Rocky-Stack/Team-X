import { useEffect, useState } from 'react';

import { useDashboardEvents } from '@/hooks/use-dashboard-events.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { useAppStore } from '@/store/app-store.js';

import { AppLayout } from './app/layout.js';
import { ChatDrawer } from './features/chat/chat-drawer.js';
import { CardsView } from './features/dashboard/cards-view.js';
import { HireDialog } from './features/hire/hire-dialog.js';
import { TicketsView } from './features/tickets/tickets-view.js';

/**
 * Root application component. Wires:
 *   - the dashboard event subscription (mount-once),
 *   - the employees query against the Phase 1 hardcoded company,
 *   - the app shell (top bar + sidenav + content area),
 *   - the feature entry points (dashboard cards, chat drawer, hire
 *     dialog) which land in T41-43.
 *
 * Phase 1 discovers the company id by listing employees for the
 * hardcoded 'strategia-x' slug. The seed guarantees exactly one
 * company exists. Phase 2's workspace switcher will replace this
 * with a proper company-selection flow.
 */
export default function App() {
  // Subscribe to dashboard events once for the app's lifetime.
  useDashboardEvents();

  const companyId = useAppStore((s) => s.companyId);
  const setCompanyId = useAppStore((s) => s.setCompanyId);
  const activeView = useAppStore((s) => s.activeView);
  const [hireOpen, setHireOpen] = useState(false);

  // Phase 1 bootstrap: discover the company id by asking the main
  // process for the list of companies. The seed always creates exactly
  // one; we grab its id to feed the employees query. Phase 2's
  // workspace switcher will replace this with an explicit selection.
  useEffect(() => {
    if (companyId !== null) return;
    window.teamx.companies.list().then((companies) => {
      if (companies.length > 0 && companies[0]) {
        setCompanyId(companies[0].id);
      }
    });
  }, [companyId, setCompanyId]);

  const { data: employees = [], isLoading, isError, refetch } = useEmployees(companyId);

  return (
    <AppLayout employees={employees} onHireClick={() => setHireOpen(true)}>
      {activeView === 'tickets' ? (
        <TicketsView companyId={companyId} employees={employees} />
      ) : isLoading ? (
        <CardsView employees={[]} isLoading />
      ) : isError ? (
        <CardsView employees={[]} isError onRetry={() => refetch()} />
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-muted-foreground">No employees yet</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Click + Hire in the sidebar to get started.
          </p>
        </div>
      ) : (
        <CardsView employees={employees} />
      )}

      <ChatDrawer employees={employees} />
      <HireDialog open={hireOpen} onOpenChange={setHireOpen} companyId={companyId} />
    </AppLayout>
  );
}
