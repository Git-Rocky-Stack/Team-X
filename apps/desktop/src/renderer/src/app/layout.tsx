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
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidenav employees={employees} onHireClick={onHireClick} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
