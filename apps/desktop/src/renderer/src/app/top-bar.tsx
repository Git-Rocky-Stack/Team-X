import { Building2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Separator } from '@/components/ui/separator.js';

const TABS = [
  { label: 'Dashboard', active: true },
  { label: 'Projects', disabled: true },
  { label: 'Tickets', disabled: true },
  { label: 'Meetings', disabled: true },
  { label: 'Telemetry', disabled: true },
] as const;

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-surface-50 px-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-brand" />
        <span className="text-sm font-semibold">Strategia-X</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
          Phase 1
        </Badge>
      </div>

      <Separator orientation="vertical" className="mx-4 h-6" />

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.label}
            disabled={'disabled' in tab && tab.disabled}
            className={`
              rounded-md px-3 py-1.5 text-xs font-medium transition-colors
              ${
                'active' in tab && tab.active
                  ? 'bg-brand/10 text-brand'
                  : 'disabled' in tab && tab.disabled
                    ? 'cursor-not-allowed text-muted-foreground/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
              }
            `}
            title={'disabled' in tab && tab.disabled ? 'Coming in Phase 2+' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
