/**
 * Source-string audit for `WorkspaceSwitcher` (Phase 5.6 M-D step a).
 *
 * Per the repo-wide renderer-test convention (see `top-bar.test.tsx`,
 * `audit-event-chip.test.tsx`, `event-sync-hooks.test.ts` — every
 * renderer test runs under `environment: 'node'` with pure source-
 * string audits rather than jsdom / RTL). This test pins the contract
 * of the switcher so a future refactor that accidentally drops a
 * subscription, state, or ARIA attribute fails first, cheapest, with
 * a clear error. Visual + interactive behavior is covered by the
 * step-(g) E2E spec (`workspace-switcher.spec.ts`).
 *
 * Regression guards:
 *   1. Mounts `useCompanyEventSync` exactly once (invariant #11).
 *   2. Consumes `useCompanies()` data + `useAppStore`'s `companyId` /
 *      `setCompanyId`.
 *   3. Implements the five F10 states (loading / error / empty /
 *      disabled / hover) — each state has a stable `data-*` selector
 *      anchor for the E2E spec that lands in step (g).
 *   4. Active-row accessibility: `aria-current="true"` + `aria-label`
 *      on trigger reflect the active company.
 *   5. The step-(b) placeholder CTA is disabled today (so user-
 *      clicks cannot race ahead of the create-company IPC wiring).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const SWITCHER_PATH = join(currentDirname, 'workspace-switcher.tsx');
const src = readFileSync(SWITCHER_PATH, 'utf8');

describe('WorkspaceSwitcher (features/workspace/workspace-switcher.tsx)', () => {
  it('exports the WorkspaceSwitcher component', () => {
    expect(src).toContain('export function WorkspaceSwitcher()');
  });

  it('mounts useCompanyEventSync exactly once (invariant #11)', () => {
    // A single call anchors the global-scope subscription to the
    // persistent top-bar mount. More than one call would double-
    // subscribe; zero calls would leave the switcher stale on cross-
    // process company writes.
    const matches = src.match(/useCompanyEventSync\s*\(\s*\)/g);
    expect(matches).toBeTruthy();
    expect(matches?.length).toBe(1);
  });

  it('reads companies via useCompanies()', () => {
    expect(src).toMatch(/const\s+{\s*data:\s*companies[\s\S]*?}\s*=\s*useCompanies\(\)/);
  });

  it('reads the active companyId + setCompanyId from the store', () => {
    expect(src).toContain('useAppStore((s) => s.companyId)');
    expect(src).toContain('useAppStore((s) => s.setCompanyId)');
  });

  it('dispatches setCompanyId on item select', () => {
    expect(src).toMatch(/onSelect=\{\(\)\s*=>\s*setCompanyId\(company\.id\)\}/);
  });

  // F10 states — one data-* anchor per state for the step-(g) E2E.

  it('renders a loading Skeleton in the trigger when isLoading', () => {
    // Trigger disabled while loading so a mid-load click cannot race.
    expect(src).toContain('disabled={isLoading}');
    expect(src).toMatch(/<Skeleton\s+className="h-3\.5 w-24"\s*\/>/);
  });

  it('surfaces an error state with an actionable Retry row (2026-04-19 P2.1 closure)', () => {
    // The error row must be actionable — onSelect prevents default
    // + calls refetch from useCompanies. "Failed to load — retry in a
    // moment" passive copy is explicitly REMOVED per the audit
    // remediation; new copy reads "Retry loading workspaces".
    expect(src).toContain('data-workspace-switcher-state="error"');
    expect(src).toMatch(/Retry loading workspaces/);
    expect(src).toMatch(
      /onSelect=\{\s*\(e\)\s*=>\s*\{[\s\S]*?e\.preventDefault\(\);[\s\S]*?refetch\(\)/,
    );
    // Negative assertion: the passive "in a moment" copy from the
    // pre-remediation version must not reappear in a future refactor.
    expect(src).not.toMatch(/retry in a moment/);
  });

  it('surfaces an empty state with a dedicated dropdown row', () => {
    expect(src).toContain('data-workspace-switcher-state="empty"');
    expect(src).toMatch(/No workspaces yet/);
  });

  it('opens CreateCompanyDialog via a LIVE Create CTA (no disabled Soon placeholder)', () => {
    // The 2026-04-19 audit + Rocky's iron-rule directive closed the
    // disabled-placeholder shortcut: the Create CTA must be live,
    // wired to setCreateOpen(true), and open the CreateCompanyDialog.
    expect(src).toContain('data-workspace-switcher-action="create-company"');
    expect(src).toMatch(/Create workspace…/);
    expect(src).toMatch(/onSelect=\{\(\)\s*=>\s*setCreateOpen\(true\)\}/);
    // Negative assertions: the disabled placeholder attributes +
    // "Soon" badge + step-(b) tooltip MUST NOT reappear.
    expect(src).not.toContain('data-workspace-switcher-action="create-company-placeholder"');
    expect(src).not.toMatch(/title="Available in step \(b\)"/);
    expect(src).not.toMatch(/>Soon</);
  });

  it('renders the CreateCompanyDialog as a sibling of the menu', () => {
    // Dialog is a sibling inside a fragment — always mounted so the
    // dropdown-menu's focus-trap never conflicts with the dialog's
    // on open.
    expect(src).toContain('import { CreateCompanyDialog }');
    expect(src).toMatch(
      /<CreateCompanyDialog\s+open=\{createOpen\}\s+onOpenChange=\{setCreateOpen\}\s*\/>/,
    );
  });

  it('applies hover + focus-visible brand ring on the trigger', () => {
    expect(src).toContain('focus-visible:ring-brand');
    expect(src).toContain('hover:bg-black');
  });

  // Accessibility contract.

  it('reflects the active company AND the error state in the trigger aria-label (2026-04-19 P3.1 closure)', () => {
    // aria-label must switch to an error-specific string when isError
    // so screen readers announce what sighted users see — not stay
    // on the pre-refetch active-company name.
    expect(src).toMatch(/aria-label=\{triggerAriaLabel\}/);
    expect(src).toMatch(/triggerAriaLabel\s*=\s*isError[\s\S]*?workspaces failed to load/);
    expect(src).toMatch(/active:\s*\$\{activeCompany\.name\}/);
  });

  it('marks the active row with aria-current="true"', () => {
    expect(src).toMatch(/aria-current=\{isActive\s*\?\s*'true'\s*:\s*undefined\}/);
  });

  it('anchors each company row with a stable data-* selector for E2E', () => {
    expect(src).toMatch(/data-workspace-switcher-item=\{company\.id\}/);
  });

  it('anchors the trigger + content with stable data-* selectors for E2E', () => {
    expect(src).toContain('data-workspace-switcher-trigger=""');
    expect(src).toContain('data-workspace-switcher-content=""');
  });

  // Composition contract.

  it('imports the dropdown-menu primitive set (not a bespoke menu)', () => {
    for (const name of [
      'DropdownMenu',
      'DropdownMenuTrigger',
      'DropdownMenuContent',
      'DropdownMenuItem',
      'DropdownMenuLabel',
      'DropdownMenuSeparator',
    ]) {
      expect(src, `WorkspaceSwitcher must import ${name}`).toContain(name);
    }
  });

  it('uses memoization to avoid re-finding the active company on every render', () => {
    expect(src).toMatch(/useMemo\(\s*\(\)\s*=>\s*companies\.find/);
  });

  it('documents the step (a+b) collapse + 2026-04-19 audit remediation in JSDoc', () => {
    // The JSDoc must cite BOTH the plan doc AND the 2026-04-19 ground-
    // zero audit (the forcing function behind the step-b collapse +
    // the P1/P2/P3 closures). Future readers must see the resolution
    // history, not the pre-closure open-gap framing.
    expect(src).toContain('Phase 5.6 M-D step');
    expect(src).toContain('2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md');
    expect(src).toContain('2026-04-19-m-d-step-a-ground-zero-audit.md');
    expect(src).toMatch(/iron[-\s]rule/i);
  });
});
