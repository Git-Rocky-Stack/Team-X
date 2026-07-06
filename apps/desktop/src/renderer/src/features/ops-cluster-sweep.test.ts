/**
 * Phase 7a Ops-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard lands with the final sweep task.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('telemetry-view sweep', () => {
  const src = readSrc('telemetry/telemetry-view.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain("'nav-tile px-3 py-1.5 text-button-sm'");
    expect(src).toContain('<Tag');
    expect(src).toContain('<LampTile');
  });

  it('carries zero mission-family or raw-chrome legacy', () => {
    expect(src).not.toContain('mission-shell');
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
  });

  it('preserves the full selector contract', () => {
    for (const sel of [
      'data-telemetry-view=""',
      'data-telemetry-view-state="no-company"',
      'data-telemetry-subtabs=""',
      'data-telemetry-subtab={tab.view}',
      'data-telemetry-kind-filter-row=""',
      'data-telemetry-kind-filter={filter}',
      'aria-pressed={filter === active}',
      'data-telemetry-controls=""',
      'data-telemetry-governance=""',
    ]) {
      expect(src).toContain(sel);
    }
  });
});

describe('company-telemetry sweep', () => {
  const src = readSrc('telemetry/company-telemetry.tsx');

  it('composes from console primitives with themed charts', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('CHART_SERIES.tokens');
    expect(src).toContain('CHART_SERIES.cost');
    expect(src).toContain('CHART_TOOLTIP_STYLE');
    expect(src).toContain('stroke={CHART_GRID_STROKE}');
  });

  it('carries zero mission-family legacy or hardcoded chart hex', () => {
    expect(src).not.toContain('mission-shell');
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('hsl(var(--card))');
  });

  it('preserves the three per-state selectors', () => {
    expect(src).toContain('data-telemetry-company-state="loading"');
    expect(src).toContain('data-telemetry-company-state="error"');
    expect(src).toContain('data-telemetry-company-state="empty"');
  });
});
