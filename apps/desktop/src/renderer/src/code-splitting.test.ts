/**
 * Renderer code splitting (audit 2026-10-07 P2-2).
 *
 * The renderer shipped as one 3.5 MB entry that parsed every view before the
 * first paint. App.tsx now loads each destination on first visit; only the
 * shell, the default dashboard and the always-mounted overlays stay in the
 * entry. These pins keep a stray static import from folding a view back into
 * the entry; scripts/check-bundle-budget.mjs caps the built result.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) => readFileSync(join(here, ...p), 'utf8');

/** Feature modules App.tsx may import statically: mounted on every screen. */
const EAGER = new Set([
  './features/chat/chat-drawer.js',
  './features/command/command-palette.js',
  './features/copilot/copilot-sidebar.js',
  './features/dashboard/dashboard-subtabs.js',
  './features/dashboard/mission-control-dashboard.js',
  './features/hire/hire-dialog.js',
]);

const LAZY_VIEWS = [
  './features/audit/audit-view.js',
  './features/autonomy/autonomy-view.js',
  './features/chat/chat-view.js',
  './features/dashboard/commands-view.js',
  './features/dashboard/floor-view.js',
  './features/dashboard/stream-view.js',
  './features/dashboard/timeline-view.js',
  './features/meetings/meetings-view.js',
  './features/models/models-view.js',
  './features/orgchart/org-chart-view.js',
  './features/projects/projects-view.js',
  './features/settings/settings-view.js',
  './features/telemetry/telemetry-view.js',
  './features/tickets/tickets-view.js',
  './features/user-guide/user-guide-view.js',
  './features/vault/vault-view.js',
];

describe('App.tsx code splitting', () => {
  const app = read('App.tsx');
  const staticFeatureImports = [...app.matchAll(/^import [^;]+ from '(\.\/features\/[^']+)';$/gm)]
    .map((m) => m[1])
    .filter((spec): spec is string => spec !== undefined);

  it('statically imports only the always-mounted shell features', () => {
    expect(staticFeatureImports.filter((spec) => !EAGER.has(spec))).toEqual([]);
  });

  it.each(LAZY_VIEWS)('loads %s on first visit', (spec) => {
    expect(app).toContain(`lazy(() =>\n  import('${spec}')`);
  });

  it('shows a console loading well while a view loads, and retries a failed load', () => {
    expect(app).toContain('<Suspense fallback={viewLoading}>');
    expect(app).toContain('lampLabel="STBY"');
    expect(app).toMatch(/<ErrorBoundary key=\{`\$\{activeView\}:\$\{dashboardSubview\}`\}/);
  });
});

describe('always-mounted modules stay off the User Guide copy', () => {
  it('the sidenav badge reads guide-summary, not the full guide content', () => {
    const sidenav = read('app', 'sidenav.tsx');
    expect(sidenav).toContain("from '@/features/user-guide/guide-summary.js'");
    expect(sidenav).not.toMatch(/user-guide\/guide-(content|progress)\.js/);
    const summary = read('features', 'user-guide', 'guide-summary.ts');
    expect(summary).not.toContain('guide-content');
  });
});
