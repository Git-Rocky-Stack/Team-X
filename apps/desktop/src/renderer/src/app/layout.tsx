import type { ReactNode } from 'react';

import type { Employee } from '@team-x/shared-types';

import { Sidenav } from './sidenav.js';
import { TopBar } from './top-bar.js';

interface AppLayoutProps {
  employees: Employee[];
  onHireClick: () => void;
  children: ReactNode;
}

export function AppLayout({ employees, onHireClick, children }: AppLayoutProps) {
  return (
    <div className="mission-app-shell relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="mission-grid pointer-events-none absolute inset-0 opacity-[0.16]" />
      <TopBar />
      <div className="relative flex flex-1 gap-3 overflow-hidden px-3 pb-3">
        <Sidenav employees={employees} onHireClick={onHireClick} />
        <main className="mission-chrome-panel flex-1 overflow-y-auto rounded-[30px] border border-white/10 bg-black/10 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
