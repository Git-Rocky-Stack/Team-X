import { Building2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Separator } from '@/components/ui/separator.js';
import { type ActiveView, useAppStore } from '@/store/app-store.js';

interface TabDef {
  label: string;
  view?: ActiveView;
  disabled?: boolean;
}

const TABS: TabDef[] = [
  { label: 'Dashboard', view: 'dashboard' },
  { label: 'Projects', disabled: true },
  { label: 'Tickets', view: 'tickets' },
  { label: 'Meetings', disabled: true },
  { label: 'Telemetry', disabled: true },
];

export function TopBar() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-surface-50 px-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-brand" />
        <span className="text-sm font-semibold">Strategia-X</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
          Phase 2
        </Badge>
      </div>

      <Separator orientation="vertical" className="mx-4 h-6" />

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = tab.view === activeView;
          return (
            <button
              type="button"
              key={tab.label}
              disabled={tab.disabled}
              onClick={tab.view ? () => setActiveView(tab.view!) : undefined}
              className={`
                rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : tab.disabled
                      ? 'cursor-not-allowed text-muted-foreground/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
                }
              `}
              title={tab.disabled ? 'Coming in Phase 3+' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
