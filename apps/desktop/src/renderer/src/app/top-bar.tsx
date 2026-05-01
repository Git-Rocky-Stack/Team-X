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

import { Badge } from '@/components/ui/badge.js';
import { MissionControlRow } from '@/features/mission/mission-shell.js';
import { WorkspaceSwitcher } from '@/features/workspace/workspace-switcher.js';
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

  return (
    <header
      className="mission-topbar relative z-10 shrink-0 border-b border-white/10 bg-black px-3 pb-3 pt-3"
      data-top-bar-shell=""
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="mission-chrome-panel flex min-w-[240px] items-center gap-3 rounded-[28px] border border-white/10 bg-black px-4 py-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-black text-brand">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-sm font-semibold tracking-[0.02em]"
                data-testid="app-brand-name"
              >
                Strategia-X
              </span>
              <Badge
                variant="outline"
                className="border-white/10 bg-black px-1.5 py-0 text-[10px] font-mono uppercase tracking-[0.22em]"
              >
                Phase 6
              </Badge>
            </div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
              Operational command shell
            </p>
          </div>
        </div>

        <div className="min-w-[260px] flex-1 xl:max-w-[320px]">
          <WorkspaceSwitcher />
        </div>

        <nav className="order-3 w-full xl:order-none xl:flex-1" data-top-bar-nav="">
          <MissionControlRow className="min-h-[56px] flex-nowrap justify-start gap-1.5 overflow-x-auto px-2 py-2 scrollbar-thin">
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
                    'group flex shrink-0 items-center gap-2 rounded-[18px] px-3.5 py-2 text-xs font-semibold transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    isActive
                      ? 'border border-brand/30 bg-black text-brand shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]'
                      : tab.disabled
                        ? 'cursor-not-allowed text-muted-foreground/50'
                        : 'border border-transparent text-muted-foreground hover:border-white/10 hover:bg-black hover:text-foreground',
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
                'group flex shrink-0 items-center gap-2 rounded-[18px] px-3.5 py-2 text-xs font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                copilotSidebarOpen
                  ? 'border border-brand/30 bg-black text-brand shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]'
                  : 'border border-transparent text-brand hover:border-brand/25 hover:bg-black',
              )}
            >
              <span className="hidden text-sm font-semibold lg:inline">Copilot</span>
            </button>
          </MissionControlRow>
        </nav>

        <div className="flex items-center gap-3 shrink-0 ml-auto">
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
