import type { ComponentType } from 'react';

import {
  Building2,
  FileArchive,
  Gauge,
  GitBranch,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Users2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge.js';
import { Separator } from '@/components/ui/separator.js';
import { WorkspaceSwitcher } from '@/features/workspace/workspace-switcher.js';
import { cn } from '@/lib/utils.js';
import { type ActiveView, useAppStore } from '@/store/app-store.js';

interface TabDef {
  label: string;
  icon: ComponentType<{ className?: string }>;
  view: ActiveView;
  disabled?: boolean;
}

const TABS: TabDef[] = [
  { label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { label: 'Org', icon: GitBranch, view: 'org' },
  { label: 'Projects', icon: KanbanSquare, view: 'projects' },
  { label: 'Tickets', icon: KanbanSquare, view: 'tickets' },
  { label: 'Meetings', icon: Users2, view: 'meetings' },
  { label: 'Chat', icon: MessageSquare, view: 'chat' },
  { label: 'Files', icon: FileArchive, view: 'files' },
  { label: 'Telemetry', icon: Gauge, view: 'telemetry' },
  { label: 'Audit', icon: Shield, view: 'audit' },
  { label: 'Settings', icon: Settings, view: 'settings' },
];

export function TopBar() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const copilotSidebarOpen = useAppStore((s) => s.copilotSidebarOpen);
  const setCopilotSidebarOpen = useAppStore((s) => s.setCopilotSidebarOpen);

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-surface-50 px-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-brand" />
        <span className="text-sm font-semibold" data-testid="app-brand-name">
          Strategia-X
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
          Phase 5
        </Badge>
      </div>

      <Separator orientation="vertical" className="mx-4 h-6" />

      <WorkspaceSwitcher />

      <Separator orientation="vertical" className="mx-4 h-6" />

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = tab.view === activeView;
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.label}
              disabled={tab.disabled}
              onClick={() => setActiveView(tab.view)}
              className={`
                flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : tab.disabled
                      ? 'cursor-not-allowed text-muted-foreground/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
                }
              `}
              title={tab.disabled ? 'Coming soon' : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setCopilotSidebarOpen(!copilotSidebarOpen)}
        aria-label="Toggle Copilot sidebar (Cmd+Shift+K)"
        aria-pressed={copilotSidebarOpen}
        title="Copilot (Cmd+Shift+K)"
        data-copilot-toolbar-toggle=""
        className={cn(
          'ml-auto flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          copilotSidebarOpen
            ? 'bg-brand/10 text-brand'
            : 'text-muted-foreground hover:bg-surface-100 hover:text-foreground',
        )}
      >
        <Sparkles className="h-4 w-4" />
      </button>
    </header>
  );
}
