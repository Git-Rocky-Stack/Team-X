/**
 * SettingsView — top-level Settings tab.
 *
 * Phase 3 — M18: providers management section.
 * Phase 3 — M19: runtime strategy, privacy tier, concurrency sections.
 * Phase 4 — M23: backup & restore section.
 * Phase 4 — M25: updater section.
 * Phase 5 — M29: RAG configuration section.
 */

import { BackupSection } from './backup-section.js';
import { ConcurrencySection } from './concurrency-section.js';
import { PrivacySection } from './privacy-section.js';
import { ProvidersSection } from './providers-section.js';
import { RagSection } from './rag-section.js';
import { RuntimeSection } from './runtime-section.js';
import { UpdaterSection } from './updater-section.js';

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
        <UpdaterSection />
        <RuntimeSection />
        <PrivacySection />
        <RagSection />
        <ConcurrencySection />
        <ProvidersSection />
        <BackupSection />
      </div>
    </div>
  );
}
