import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

describe('autonomy heavy panels aesthetic sweep (Phase 4b)', () => {
  it('runtime-profiles: console hardware + VU + selectors preserved, no legacy', () => {
    const src = read('runtime-profiles-panel.tsx');
    // console-present
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('well-input');
    // Diagnostic tone is applied on an INNER <span>, never Tag's className —
    // guards the c4caf3e fix (cn()/tailwind-merge collapses Tag's text-* tokens,
    // dropping the chip's font-size, when a tone color is passed through className).
    expect(src).toContain('<span className={diagnosticToneClass(row.tone)}>');
    // selectors preserved
    expect(src).toContain('data-runtime-profiles-panel');
    expect(src).toContain('data-runtime-profile-card={profile.id}');
    expect(src).toContain('data-runtime-adapter-diagnostics={profile.id}');
    expect(src).toContain('data-runtime-validation-result={profile.id}');
    expect(src).toContain('data-runtime-employee-binding={employee.id}');
    // legacy-absent
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toMatch(/border-white\/\d/);
    expect(src).not.toContain('font-mono');
    expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  });

  it('routines: console hardware + VU + selectors preserved, no legacy', () => {
    const src = read('routines-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('well-input');
    expect(src).toContain('data-routines-panel');
    expect(src).toContain('data-routine-card={routine.id}');
    expect(src).toContain('data-routine-run={run.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toMatch(/border-white\/\d/);
    expect(src).not.toContain('font-mono');
    expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
    expect(src).not.toContain('rounded-full');
  });

  it('budgets: console hardware + burn VU + selectors preserved, no legacy', () => {
    const src = read('budgets-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('well-input');
    expect(src).toContain('data-budgets-panel');
    expect(src).toContain('data-budget-policy={policy.id}');
    expect(src).toContain('data-budget-ledger={entry.id}');
    expect(src).toContain('data-budget-approval={approval.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toMatch(/border-white\/\d/);
    expect(src).not.toContain('font-mono');
    expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
    expect(src).not.toContain('rounded-full');
  });

  it('runtime-operations: console hardware + utilization VU + selectors preserved, no legacy', () => {
    const src = read('runtime-operations-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('data-runtime-operations-panel');
    expect(src).toContain('data-runtime-session={session.id}');
    expect(src).toContain('data-runtime-checkout={checkout.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toMatch(/border-white\/\d/);
    expect(src).not.toContain('font-mono');
    expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  });

  it('the whole 4b heavy-panel cluster is free of Mission* and legacy composition', () => {
    const files = [
      'runtime-profiles-panel.tsx',
      'routines-panel.tsx',
      'budgets-panel.tsx',
      'runtime-operations-panel.tsx',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, `${file} imports mission-shell`).not.toContain('mission-shell.js');
      expect(src, `${file} uses a Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
      expect(src, `${file} has bg-black`).not.toMatch(/\bbg-black\b/);
      expect(src, `${file} has border-white/N`).not.toMatch(/border-white\/\d/);
      expect(src, `${file} has font-mono`).not.toContain('font-mono');
      expect(src, `${file} has raw status color`).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
      expect(src, `${file} has rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
    }
  });
});
