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
  Users2,
  Workflow,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { BoardMessageQueue } from './board-message-queue.js';

import { ShiftToggle } from '@/components/console';
import { Badge } from '@/components/ui/badge.js';
import { WorkspaceSwitcher } from '@/features/workspace/workspace-switcher.js';
import { useShift } from '@/hooks/use-shift.js';
import { cn } from '@/lib/utils.js';
import { type ActiveView, useAppStore } from '@/store/app-store.js';

import brandLogo from '/logo.png';

interface TabDef {
  label: string;
  icon: ComponentType<{ className?: string }>;
  view: ActiveView;
  disabled?: boolean;
}

const TABS: TabDef[] = [
  { label: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { label: 'Autonomy', icon: Workflow, view: 'autonomy' },
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
  const { shift, setShift } = useShift();

  return (
    <header
      className="relative z-10 shrink-0 border-b border-[var(--hairline)] bg-card px-3 py-2"
      data-top-bar-shell=""
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] items-center gap-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] bg-[var(--carbon-800)] text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-placard" data-testid="app-brand-name">
                Strategia-X
              </span>
              <Badge variant="outline" className="border-[var(--hairline)] px-1.5 py-0">
                Phase 6
              </Badge>
            </div>
            <p className="mt-1 text-eyebrow text-muted-foreground">Operational command shell</p>
          </div>
        </div>

        <div className="min-w-[260px] flex-1 xl:max-w-[320px]">
          <WorkspaceSwitcher />
        </div>

        <nav className="order-3 w-full xl:order-none xl:flex-1" data-top-bar-nav="">
          <div className="flex flex-nowrap items-center justify-start gap-1.5 overflow-x-auto px-1 py-1 scrollbar-thin">
            {TABS.map((tab) => {
              const isActive = tab.view === activeView;
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.label}
                  disabled={tab.disabled}
                  onClick={() => setActiveView(tab.view)}
                  className={cn(
                    'nav-tile stencil inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10.5px]',
                    'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'nav-tile-active',
                    tab.disabled && 'cursor-not-allowed opacity-40',
                  )}
                  title={tab.disabled ? 'Coming soon' : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCopilotSidebarOpen(!copilotSidebarOpen)}
              aria-label="Toggle Copilot sidebar (Cmd+Shift+K)"
              aria-pressed={copilotSidebarOpen}
              title="Copilot (Cmd+Shift+K)"
              data-copilot-toolbar-toggle=""
              className={cn(
                'cap stencil inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10.5px]',
                copilotSidebarOpen && 'cap-select',
              )}
            >
              <span className="hidden lg:inline">Copilot</span>
            </button>
          </div>
        </nav>

        <span
          aria-hidden="true"
          className="well hidden items-center gap-1 rounded-control px-2 py-1 text-shortcut text-[var(--display-fg)] lg:inline-flex"
        >
          Ctrl K
        </span>

        <div className="flex shrink-0 items-center gap-3 ml-auto">
          <ShiftToggle shift={shift} onToggle={setShift} />
          <BoardMessageQueue />
          <img
            src={brandLogo}
            alt="Strategia-X"
            className="h-[67px] w-auto opacity-90 hover:opacity-100 transition-opacity"
          />
        </div>
      </div>
    </header>
  );
}
