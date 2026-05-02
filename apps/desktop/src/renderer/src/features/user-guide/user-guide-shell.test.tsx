import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const APP_PATH = join(currentDirname, '..', '..', 'App.tsx');
const STORE_PATH = join(currentDirname, '..', '..', 'store', 'app-store.ts');
const SIDENAV_PATH = join(currentDirname, '..', '..', 'app', 'sidenav.tsx');
const SETTINGS_VIEW_PATH = join(
  currentDirname,
  '..',
  '..',
  'features',
  'settings',
  'settings-view.tsx',
);
const GUIDE_CONTENT_PATH = join(currentDirname, 'guide-content.ts');
const GUIDE_HOOK_PATH = join(currentDirname, 'use-user-guide.ts');

const appSrc = readFileSync(APP_PATH, 'utf8');
const storeSrc = readFileSync(STORE_PATH, 'utf8');
const sidenavSrc = readFileSync(SIDENAV_PATH, 'utf8');
const settingsViewSrc = readFileSync(SETTINGS_VIEW_PATH, 'utf8');
const guideContentSrc = readFileSync(GUIDE_CONTENT_PATH, 'utf8');
const guideHookSrc = readFileSync(GUIDE_HOOK_PATH, 'utf8');

describe('User Guide shell wiring', () => {
  it('adds a dedicated user-guide top-level view plus guide utility actions in the store', () => {
    expect(storeSrc).toContain("| 'user-guide'");
    expect(storeSrc).toContain(
      "export type SettingsSectionFocus = 'providers' | 'extensions' | 'memory' | 'portability';",
    );
    expect(storeSrc).toContain('hireDialogRequestNonce');
    expect(storeSrc).toContain("autonomySubview: 'access'");
    expect(storeSrc).toContain('openSettingsSection: (section: SettingsSectionFocus) => void;');
    expect(storeSrc).toContain('setAutonomySubview: (subview: AutonomySubview) => void;');
    expect(storeSrc).toContain('requestHireDialog: () => void;');
  });

  it('routes the new view through App and auto-opens it for undismissed workspaces', () => {
    expect(appSrc).toContain(
      "import { UserGuideView } from './features/user-guide/user-guide-view.js';",
    );
    expect(appSrc).toContain("setActiveView('user-guide');");
    expect(appSrc).toContain("case 'user-guide':");
    expect(appSrc).toContain('<UserGuideView company={activeCompany} employees={employees} />');
    expect(appSrc).toContain('activeCompany.settings?.userGuide?.welcomeDismissedAt');
  });

  it('adds the guide entry near the bottom of the left rail with a progress affordance', () => {
    expect(sidenavSrc).toContain('data-user-guide-nav=""');
    expect(sidenavSrc).toContain('User Guide');
    expect(sidenavSrc).toContain("setActiveView('user-guide')");
    expect(sidenavSrc).toContain(
      'Role-based onboarding, setup checklists, and deep links into the live shell.',
    );
    expect(sidenavSrc).toContain('guideSummary.coreRemaining');
  });

  it('supports guide-driven settings section focus', () => {
    expect(settingsViewSrc).toContain('data-settings-section="extensions"');
    expect(settingsViewSrc).toContain('data-settings-section="portability"');
    expect(settingsViewSrc).toContain('data-settings-section="memory"');
    expect(settingsViewSrc).toContain('data-settings-section="providers"');
    expect(settingsViewSrc).toContain('document.querySelector<HTMLElement>(');
    expect(settingsViewSrc).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
  });

  it('adds autonomy guide actions with subview deep links through the shared app store', () => {
    expect(guideContentSrc).toContain("id: 'open-settings-memory'");
    expect(guideContentSrc).toContain("id: 'open-settings-portability'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-doctor'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-benchmarks'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-improvement'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-access'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-runtimes'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-approvals'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-artifacts'");
    expect(guideContentSrc).toContain("id: 'open-autonomy-memory'");
    expect(guideContentSrc).toContain("id: 'autonomy-control-plane'");
    expect(guideContentSrc).toContain("id: 'long-run-memory'");
    expect(guideContentSrc).toContain("id: 'portability-sharing'");
    expect(guideContentSrc).toContain("id: 'portability-reviewed'");
    expect(guideContentSrc).toContain("id: 'improvement-loop-reviewed'");
    expect(guideContentSrc).toContain(
      'Queue shared operator invites in Autonomy > Access before expecting invited or cloud posture to become actionable.',
    );
    expect(guideContentSrc).toContain(
      'Use Doctor before long-running external agents so database, backup, runtime, secret, provider, MCP, and budget posture is checked in one report.',
    );
    expect(guideContentSrc).toContain(
      'Use Improve to run the agent self-improvement loop. It inspects recent work failures, runtime failures, blocked tickets, and stale in-progress tickets, then opens deduped correction tickets through the normal queue.',
    );
    expect(guideContentSrc).toContain(
      'When a human comments on a ticket, Team-X wakes every employee participant and historical employee author on that ticket thread, not just the last pair of speakers.',
    );
    expect(guideContentSrc).toContain(
      'Right-click misspelled words in editable fields to use Chromium spelling suggestions, Add to Dictionary, and standard edit actions.',
    );
    expect(guideHookSrc).toContain("if (action.view === 'autonomy' && action.autonomySubview) {");
    expect(guideHookSrc).toContain('setAutonomySubview(action.autonomySubview);');
  });
});
