/**
 * ModelsView — the Models tab: local GGUF models, the Hugging Face browser,
 * remote LAN endpoints, and the runtime/pool controls.
 *
 * Sub-tab styling follows `DashboardSubtabs` (nav-tile row under a hairline),
 * and the selected panel lives in the app store for the same reason the
 * dashboard's does: a view-local `useState` resets every time the operator
 * navigates away and back, which is a small betrayal on a screen where you are
 * mid-way through configuring hardware.
 *
 * Each panel owns its own faceplate, so this file stays a router.
 */

import { Boxes, Cpu, Network, Search } from 'lucide-react';
import type { ComponentType } from 'react';

import { DiscoverPanel } from './discover-panel.js';
import { EndpointsPanel } from './endpoints-panel.js';
import { LibraryPanel } from './library-panel.js';
import { RuntimePanel } from './runtime-panel.js';

import { cn } from '@/lib/utils.js';
import { type ModelsPanel, useAppStore } from '@/store/app-store.js';

interface PanelTab {
  panel: ModelsPanel;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: PanelTab[] = [
  { panel: 'library', label: 'Library', icon: Boxes },
  { panel: 'discover', label: 'Discover', icon: Search },
  { panel: 'endpoints', label: 'Endpoints', icon: Network },
  { panel: 'runtime', label: 'Runtime', icon: Cpu },
];

export function ModelsView() {
  const panel = useAppStore((s) => s.modelsPanel);
  const setPanel = useAppStore((s) => s.setModelsPanel);

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Model subsystem"
        className="flex shrink-0 items-center gap-1 border-b border-[var(--hairline)] px-4 py-2"
      >
        {TABS.map((tab) => {
          const isActive = tab.panel === panel;
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.panel}
              onClick={() => setPanel(tab.panel)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'nav-tile flex items-center gap-1.5 px-3.5 py-1.5 text-button-sm',
                isActive && 'nav-tile-active',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-[var(--sp-4)]">
        {panel === 'library' ? <LibraryPanel /> : null}
        {panel === 'discover' ? <DiscoverPanel /> : null}
        {panel === 'endpoints' ? <EndpointsPanel /> : null}
        {panel === 'runtime' ? <RuntimePanel /> : null}
      </div>
    </div>
  );
}
