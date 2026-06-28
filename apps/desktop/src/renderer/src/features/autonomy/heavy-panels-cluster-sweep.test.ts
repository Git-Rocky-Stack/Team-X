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
});
