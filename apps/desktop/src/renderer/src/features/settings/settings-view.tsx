/**
 * SettingsView — top-level Settings tab.
 *
 * Phase 3 — M18: providers management section.
 * Future milestones will add company preferences, runtime mode,
 * privacy filter, and backup/restore sections.
 */

import { ProvidersSection } from './providers-section.js';

export function SettingsView() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage providers, API keys, and system preferences.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        <ProvidersSection />
      </div>
    </div>
  );
}
