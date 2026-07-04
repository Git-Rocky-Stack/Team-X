import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

// Raw Tailwind palette colors the recompose must replace with console tones.
const RAW_PALETTE =
  /-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/;

function expectNoLegacy(src: string, file: string) {
  expect(src, `${file}: mission-shell import`).not.toContain('mission-shell');
  expect(src, `${file}: Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src, `${file}: mission-select`).not.toContain('mission-select');
  expect(src, `${file}: mission-chrome-panel`).not.toContain('mission-chrome-panel');
  expect(src, `${file}: mission-grid`).not.toContain('mission-grid');
  expect(src, `${file}: mission-state-block`).not.toContain('mission-state-block');
  expect(src, `${file}: bg-black`).not.toMatch(/\bbg-black\b/);
  expect(src, `${file}: border-white/N`).not.toMatch(/border-white\/\d/);
  expect(src, `${file}: font-mono`).not.toContain('font-mono');
  expect(src, `${file}: rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  expect(src, `${file}: rounded-full`).not.toMatch(/\brounded-full\b/);
  expect(src, `${file}: raw palette color`).not.toMatch(RAW_PALETTE);
}

describe('work & comms cluster sweep (Phase 5b/6)', () => {
  it.todo('per-file describe blocks added in Tasks 2–21');

  // org-chart-tree carries zero legacy markers today (pure memoized tree
  // builder) — its guard is live from the scaffold onward.
  it('org-chart-tree has no legacy composition', () => {
    expectNoLegacy(read('orgchart/org-chart-tree.tsx'), 'org-chart-tree.tsx');
  });
});

describe('org-chart-node', () => {
  it('console rank ramp + well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-node.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--led-nogo)');
    expect(src).toContain('data-org-chart-node={employee.id}');
    expect(src).toContain('data-org-chart-manager-select=""');
    for (const key of [
      'officer:',
      "'senior-management'",
      'management:',
      'supervisor:',
      'lead:',
      'ic:',
    ]) {
      expect(src, `levelPalette key ${key}`).toContain(key);
    }
    expectNoLegacy(src, 'org-chart-node.tsx');
  });
});

describe('org-chart-view', () => {
  it('SubviewState states + console header + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-org-chart-view=""');
    for (const s of ['no-company', 'loading', 'error', 'empty']) {
      expect(src, `missing state ${s}`).toContain(`data-org-chart-state="${s}"`);
    }
    expect(src).toContain('data-org-chart-retry=""');
    expect(src).toContain('data-org-chart-toast=""');
    expect(src).toContain('<output');
    expectNoLegacy(src, 'org-chart-view.tsx');
  });
});

describe('employee-profile-dialog', () => {
  it('well-input fields + selectors preserved, no legacy', () => {
    const src = read('orgchart/employee-profile-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-employee-profile-dialog=""');
    for (const id of [
      'name',
      'title',
      'role',
      'manager',
      'provider',
      'model',
      'runtime',
      'avatar',
      'save',
    ]) {
      expect(src, `missing data-employee-profile-${id}`).toContain(
        `data-employee-profile-${id}=""`,
      );
    }
    expectNoLegacy(src, 'employee-profile-dialog.tsx');
  });
});

describe('promote-dialog', () => {
  it('well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/promote-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-promote-dialog=""');
    expect(src).toContain('promote-role');
    expect(src).toContain('data-promote-role-select=""');
    expectNoLegacy(src, 'promote-dialog.tsx');
  });
});

describe('fire-dialog', () => {
  it('well-input + confirm selectors preserved, no legacy', () => {
    const src = read('orgchart/fire-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-fire-dialog=""');
    expect(src).toContain('data-fire-confirm-name=""');
    expect(src).toContain('Type the employee name to confirm');
    expectNoLegacy(src, 'fire-dialog.tsx');
  });
});
