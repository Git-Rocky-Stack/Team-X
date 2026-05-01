import { Grid3X3, LayoutGrid, Radio, ScrollText, Terminal } from 'lucide-react';
import type { ComponentType } from 'react';


import { type DashboardSubview, useAppStore } from '@/store/app-store.js';

interface SubtabDef {
  label: string;
  icon: ComponentType<{ className?: string }>;
  subview: DashboardSubview;
}

const SUBTABS: SubtabDef[] = [
  { label: 'Mission Control', icon: LayoutGrid, subview: 'cards' },
  { label: 'Timeline', icon: ScrollText, subview: 'timeline' },
  { label: 'Stream', icon: Radio, subview: 'stream' },
  { label: 'Floor', icon: Grid3X3, subview: 'floor' },
  { label: 'Commands', icon: Terminal, subview: 'commands' },
];

export function DashboardSubtabs() {
  const activeSubview = useAppStore((s) => s.dashboardSubview);
  const setSubview = useAppStore((s) => s.setDashboardSubview);

  return (
    <div className="flex items-center gap-1 border-b border-border/70 bg-background/80 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {SUBTABS.map((tab) => {
        const isActive = tab.subview === activeSubview;
        const Icon = tab.icon;
        return (
          <button
            type="button"
            key={tab.subview}
            onClick={() => setSubview(tab.subview)}
            className={`
              flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors
              ${
                isActive
                  ? 'border border-brand/25 bg-brand/10 text-brand'
                  : 'border border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/5 hover:text-foreground'
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
