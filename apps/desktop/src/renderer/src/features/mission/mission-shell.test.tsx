import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const MISSION_SHELL_PATH = join(currentDirname, 'mission-shell.tsx');
const src = readFileSync(MISSION_SHELL_PATH, 'utf8');

describe('Mission shell primitives (features/mission/mission-shell.tsx)', () => {
  it('exports the shared Wave 1 shell primitives', () => {
    for (const name of [
      'MissionPageShell',
      'MissionHero',
      'MissionPill',
      'MissionSectionCard',
      'MissionRailCard',
      'MissionControlRow',
      'MissionSegmentedButton',
      'MissionIconButton',
      'MissionInsetSurface',
      'MissionSheetHeader',
      'MissionStateBlock',
      'MissionMetricTile',
    ]) {
      expect(src, `mission-shell.tsx must export ${name}`).toContain(`export function ${name}`);
    }
  });

  it('anchors each primitive with a stable data selector', () => {
    for (const selector of [
      'data-mission-page-shell=""',
      'data-mission-hero=""',
      'data-mission-pill=""',
      'data-mission-section-card=""',
      'data-mission-rail-card=""',
      'data-mission-control-row=""',
      'data-mission-segmented-button=""',
      'data-mission-icon-button=""',
      'data-mission-inset-surface=""',
      'data-mission-sheet-header=""',
      'data-mission-state-block=""',
      'data-mission-metric-tile=""',
    ]) {
      expect(src).toContain(selector);
    }
  });

  it('uses the shared mission surface classes rather than per-page styling only', () => {
    expect(src).toContain('mission-shell relative min-h-full overflow-hidden');
    expect(src).toContain('mission-hero overflow-hidden rounded-[28px]');
    expect(src).toContain('mission-pill inline-flex items-center');
    expect(src).toContain('mission-panel rounded-[24px]');
    expect(src).toContain('mission-control-row flex flex-wrap items-center');
    expect(src).toContain('mission-segmented-button rounded-[18px]');
    expect(src).toContain('mission-inset-surface rounded-[22px]');
    expect(src).toContain('mission-sheet-header border-b border-white/10');
    expect(src).toContain('mission-state-block flex flex-col items-center');
    expect(src).toContain('mission-metric-tile group flex flex-col gap-3');
  });
});
