import type { Employee } from '@team-x/shared-types';
import type { ReactNode } from 'react';

import { Sidenav } from './sidenav.js';
import { TopBar } from './top-bar.js';

interface AppLayoutProps {
  employees: Employee[];
  onHireClick: () => void;
  children: ReactNode;
}

export function AppLayout({ employees, onHireClick, children }: AppLayoutProps) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      {/* AnnunciatorRail mounts here (Phase 2 Task 13) */}
      <div className="relative flex min-h-0 flex-1 gap-3 overflow-hidden px-3 pb-3">
        <Sidenav employees={employees} onHireClick={onHireClick} />
        <main className="min-w-0 flex-1 overflow-y-auto rounded-card border border-[var(--hairline)] bg-card scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
