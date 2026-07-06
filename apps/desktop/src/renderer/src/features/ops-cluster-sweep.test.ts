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

describe('employee-telemetry sweep', () => {
  const src = readSrc('telemetry/employee-telemetry.tsx');

  it('renders the sortable table inside a display well', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('text-[var(--display-fg)]');
    expect(src).toContain('border-[var(--display-border)]');
    expect(src).toContain('tabular-nums');
  });

  it('carries zero mission-family or raw-chrome legacy', () => {
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
    expect(src).not.toContain('rounded-[20px]');
    expect(src).not.toContain('text-foreground');
  });

  it('preserves state selectors and sort wiring', () => {
    expect(src).toContain('data-telemetry-employees-state="loading"');
    expect(src).toContain('data-telemetry-employees-state="error"');
    expect(src).toContain('data-telemetry-employees-state="empty"');
    expect(src).toContain('onClick={() => onClick(col)}');
    expect(src).toContain('function toggleSort');
  });
});

describe('cost-breakdown sweep', () => {
  const src = readSrc('telemetry/cost-breakdown.tsx');

  it('composes range chips, themed charts, and the summary table from console vocabulary', () => {
    expect(src).toContain("'nav-tile px-3 py-1.5 text-button-sm'");
    expect(src).toContain('getProviderSeriesColor');
    expect(src).toContain('CHART_TOOLTIP_STYLE');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<SubviewState');
  });

  it('carries zero mission-family legacy, raw hex, or raw chrome', () => {
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(src).not.toContain('PROVIDER_COLORS');
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
  });

  it('preserves state selectors and range wiring', () => {
    expect(src).toContain('data-telemetry-cost-state="loading"');
    expect(src).toContain('data-telemetry-cost-state="error"');
    expect(src).toContain('data-telemetry-cost-state="empty"');
    expect(src).toContain('onClick={() => setRange(option.value)}');
  });
});

describe('audit-event-chip sweep', () => {
  const helpersSrc = readSrc('audit/audit-event-chip-helpers.ts');
  const chipSrc = readSrc('audit/audit-event-chip.tsx');

  it('tones every event type from the LED display family', () => {
    expect(helpersSrc).toContain('var(--led-go-edge)');
    expect(helpersSrc).toContain('var(--led-nogo-edge)');
    expect(helpersSrc).toContain('var(--led-scope-edge)');
    expect(helpersSrc).not.toMatch(
      /bg-(green|red|blue|cyan|yellow|sky|rose|emerald|purple|orange|amber|slate|indigo|teal|violet|zinc|gray)-600/,
    );
  });

  it('keeps the chip shell contract', () => {
    expect(chipSrc).toContain('aria-label={ariaLabel}');
    expect(chipSrc).toContain('data-event-type={eventType}');
    expect(chipSrc).not.toContain('text-xs');
  });
});
