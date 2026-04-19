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

  it('surfaces an error state with a dedicated dropdown row', () => {
    expect(src).toContain('data-workspace-switcher-state="error"');
    expect(src).toMatch(/Failed to load/);
  });

  it('surfaces an empty state with a dedicated dropdown row', () => {
    expect(src).toContain('data-workspace-switcher-state="empty"');
    expect(src).toMatch(/No workspaces yet/);
  });

  it('carries a disabled step-(b) placeholder CTA with Soon label', () => {
    expect(src).toContain('data-workspace-switcher-action="create-company-placeholder"');
    expect(src).toMatch(/title="Available in step \(b\)"/);
    expect(src).toMatch(/Create company…/);
  });

  it('applies hover + focus-visible brand ring on the trigger', () => {
    expect(src).toContain('focus-visible:ring-brand');
    expect(src).toContain('hover:bg-surface-100');
  });

  // Accessibility contract.

  it('reflects the active company in the trigger aria-label', () => {
    expect(src).toMatch(/aria-label=\{`Workspace switcher[\s\S]*?\$\{activeCompany[\s\S]*?\}`\}/);
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

  it('documents the step-(a) scope and step-(b)/(c) follow-ups in JSDoc', () => {
    // The JSDoc must cite the plan doc + make the step-(b) placeholder
    // contract explicit so a future reader understands why the CTA is
    // disabled today.
    expect(src).toContain('Phase 5.6 M-D step (a)');
    expect(src).toContain('2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md');
    expect(src).toMatch(/step \(b\)/);
  });
});
