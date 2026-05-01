/**
 * SettingsView — top-level Settings tab.
 *
 * Phase 3 — M18: providers management section.
 * Phase 3 — M19: runtime strategy, privacy tier, concurrency sections.
 * Phase 4 — M23: backup & restore section.
 * Phase 4 — M25: updater section.
 * Phase 5 — M29: RAG configuration section.
 * Phase 5 — M31: agentic loop section (budget caps).
 * Phase 5 — M32: task planner section (guardrails).
 */

import { useEffect } from 'react';

import { AgenticSection } from './agentic-section.js';
import { BackupSection } from './backup-section.js';
import { ConcurrencySection } from './concurrency-section.js';
import { CopilotSection } from './copilot-section.js';
import { ExtensionsSection } from './extensions-section.js';
import { MemorySection } from './memory-section.js';
import { PermissionsSection } from './permissions-section.js';
import { PlannerSection } from './planner-section.js';
import { PortabilitySection } from './portability-section.js';
import { PrivacySection } from './privacy-section.js';
import { ProvidersSection } from './providers-section.js';
import { RagSection } from './rag-section.js';
import { RuntimeSection } from './runtime-section.js';
import { UpdaterSection } from './updater-section.js';

import { ErrorBoundary } from '@/components/error-boundary.js';
import { useAppStore } from '@/store/app-store.js';

export function SettingsView() {
  const focusSection = useAppStore((state) => state.settingsFocusSection);
  const setFocusSection = useAppStore((state) => state.setSettingsFocusSection);

  useEffect(() => {
    if (!focusSection) return;
    const section = document.querySelector<HTMLElement>(
      `[data-settings-section="${focusSection}"]`,
    );
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const timer = window.setTimeout(() => setFocusSection(null), 120);
    return () => window.clearTimeout(timer);
  }, [focusSection, setFocusSection]);

  return (
    <div className="amoled-menu-surface flex h-full flex-col bg-black">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage providers, API keys, and system preferences.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        <ErrorBoundary componentName="UpdaterSection">
          <UpdaterSection />
        </ErrorBoundary>
        <ErrorBoundary componentName="RuntimeSection">
          <RuntimeSection />
        </ErrorBoundary>
        <ErrorBoundary componentName="PrivacySection">
          <PrivacySection />
        </ErrorBoundary>
        <ErrorBoundary componentName="RagSection">
          <RagSection />
        </ErrorBoundary>
        <ErrorBoundary componentName="ConcurrencySection">
          <ConcurrencySection />
        </ErrorBoundary>
        <section data-settings-section="extensions">
          <ErrorBoundary componentName="ExtensionsSection">
            <ExtensionsSection />
          </ErrorBoundary>
        </section>
        <ErrorBoundary componentName="PermissionsSection">
          <PermissionsSection />
        </ErrorBoundary>
        <ErrorBoundary componentName="AgenticSection">
          <AgenticSection />
        </ErrorBoundary>
        <ErrorBoundary componentName="PlannerSection">
          <PlannerSection />
        </ErrorBoundary>
        <section data-settings-section="portability">
          <ErrorBoundary componentName="PortabilitySection">
            <PortabilitySection />
          </ErrorBoundary>
        </section>
        <section data-settings-section="memory">
          <ErrorBoundary componentName="MemorySection">
            <MemorySection />
          </ErrorBoundary>
        </section>
        <ErrorBoundary componentName="CopilotSection">
          <CopilotSection />
        </ErrorBoundary>
        <section data-settings-section="providers">
          <ErrorBoundary componentName="ProvidersSection">
            <ProvidersSection />
          </ErrorBoundary>
        </section>
        <ErrorBoundary componentName="BackupSection">
          <BackupSection />
        </ErrorBoundary>
      </div>
    </div>
  );
}
