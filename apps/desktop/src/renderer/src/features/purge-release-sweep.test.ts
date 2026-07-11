/**
 * Phase 8 purge + polish contract (source-string pins).
 * Wave A: proactive mount. Wave B: legacy deletion (file-absence + CSS pins
 * land in the task that deletes them — Phase-3 lesson 5). Wave C: polish pins.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('dashboard proactive mount (Wave A)', () => {
  const src = readSrc('dashboard/mission-control-dashboard.tsx');

  it('mounts ProactiveControls as the fourth secondary-rail cell', () => {
    expect(src).toContain("from '@/features/proactive/proactive-controls.js'");
    expect(src).toContain('<ProactiveControls companyId={companyId} />');
    expect(src).toContain('data-dashboard-secondary-panel="proactive"');
  });

  it('guards the null-workspace case with the panel-state idiom', () => {
    expect(src).toContain('dataState="proactive-unselected"');
  });
});

describe('mission-shell purge (Wave B)', () => {
  it('deletes the legacy primitive library and its test', () => {
    expect(existsSync(join(featuresDir, 'mission/mission-shell.tsx'))).toBe(false);
    expect(existsSync(join(featuresDir, 'mission/mission-shell.test.tsx'))).toBe(false);
  });
});
