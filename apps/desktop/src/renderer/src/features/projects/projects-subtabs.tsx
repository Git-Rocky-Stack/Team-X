import { CalendarDays, Kanban, Target } from 'lucide-react';
import type { ComponentType } from 'react';

import { type ProjectsSubview, useAppStore } from '@/store/app-store.js';

interface SubtabDef {
  label: string;
  icon: ComponentType<{ className?: string }>;
  subview: ProjectsSubview;
}

const SUBTABS: SubtabDef[] = [
  { label: 'Kanban', icon: Kanban, subview: 'kanban' },
  { label: 'Goals', icon: Target, subview: 'goals' },
  { label: 'Schedule', icon: CalendarDays, subview: 'schedule' },
];

export function ProjectsSubtabs() {
  const activeSubview = useAppStore((s) => s.projectsSubview);
  const setSubview = useAppStore((s) => s.setProjectsSubview);

  // Chassis strip, not a display: bg-background flips with the shift so the
  // nav-tile recipe reads in Day Shift (legacy surface-50 is a static
  // near-black that left the active tile illegible on Day).
  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-6 py-1.5">
      {SUBTABS.map((tab) => {
        const isActive = tab.subview === activeSubview;
        const Icon = tab.icon;
        return (
          <button
            type="button"
            key={tab.subview}
            onClick={() => setSubview(tab.subview)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-button-sm ${
              isActive ? 'nav-tile nav-tile-active' : 'nav-tile'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
