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

  return (
    <div className="flex items-center gap-1 border-b border-border bg-surface-50 px-6 py-1.5">
      {SUBTABS.map((tab) => {
        const isActive = tab.subview === activeSubview;
        const Icon = tab.icon;
        return (
          <button
            type="button"
            key={tab.subview}
            onClick={() => setSubview(tab.subview)}
            className={`
              flex items-center gap-1.5 rounded-md px-3 py-1.5 text-button-sm transition-colors
              ${
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
              }
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
