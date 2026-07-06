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
    // No text-size utility may pass through Badge's cn(): unconfigured twMerge
    // lumps custom sizes (text-caption) with the LED text-colors and drops one.
    // Chips render at Badge's base text-[10px] — the app-wide chip signature.
    expect(chipSrc).not.toContain('text-caption');
  });
});

describe('audit-view sweep', () => {
  const src = readSrc('audit/audit-view.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('bg-[var(--void)]');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy chrome', () => {
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-black');
    expect(src).not.toMatch(/\b(bg|text|border)-zinc-/);
    expect(src).not.toContain('rounded-full');
    expect(src).not.toContain('animate-spin');
  });

  it('preserves the heading, export, and pagination contracts', () => {
    expect(src).toContain('Audit Log');
    expect(src).toContain("handleExport('csv')");
    expect(src).toContain("handleExport('json')");
    expect(src).toContain('<AuditEventChip eventType={event.eventType} />');
    expect(src).toContain('setPage((p) => Math.max(0, p - 1))');
    expect(src).toContain('setPage((p) => p + 1)');
  });

  it('tones chassis-context status text with the shift-aware tag family', () => {
    // The export-success note sits on the chassis faceplate, not a display
    // well — Night LED green goes low-contrast on Day silver (5a defect class).
    expect(src).toContain('text-[var(--tag-go)]');
    expect(src).not.toContain('text-led-go');
  });
});

describe('vault-view sweep', () => {
  const src = readSrc('vault/vault-view.tsx');

  it('composes from console primitives with armed row selection', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<Tag');
    expect(src).toContain('<LampTile');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy status colors or brand-tint selection', () => {
    expect(src).not.toContain('bg-brand/5');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('bg-green-500/10');
    expect(src).not.toContain('bg-red-500/10');
    expect(src).not.toContain('animate-spin');
  });

  it('preserves the E2E text + handler contract', () => {
    expect(src).toContain('File Vault');
    expect(src).toContain("{stats.fileCount} file{stats.fileCount !== 1 ? 's' : ''}");
    expect(src).toContain('onClick={() => setSelectedFile(file)}');
    expect(src).toContain('handleVerify(selectedFile.id)');
    expect(src).toContain('handleDelete(selectedFile.id)');
    expect(src).toContain('Open Location');
  });

  it('tones the chassis-context verify caption with the shift-aware tag family', () => {
    // The verify result sits on the chassis detail panel, not a display well.
    expect(src).toContain('text-[var(--tag-go)]');
    expect(src).toContain('text-[var(--tag-warn)]');
    expect(src).not.toContain('text-led-go');
    expect(src).not.toContain('text-led-nogo');
  });
});

describe('ops cluster cross-file legacy absence', () => {
  const files = [
    'telemetry/telemetry-view.tsx',
    'telemetry/company-telemetry.tsx',
    'telemetry/employee-telemetry.tsx',
    'telemetry/cost-breakdown.tsx',
    'audit/audit-view.tsx',
    'audit/audit-event-chip.tsx',
    'audit/audit-event-chip-helpers.ts',
    'vault/vault-view.tsx',
  ];

  it('keeps the swept ops files free of every legacy composition family', () => {
    for (const file of files) {
      const src = readSrc(file);
      expect(src, file).not.toContain('mission-shell');
      expect(src, file).not.toMatch(/Mission[A-Z]/);
      expect(src, file).not.toContain('brand-selected');
      expect(src, file).not.toContain('amoled-menu-surface');
      expect(src, file).not.toContain('border-white/');
      expect(src, file).not.toMatch(/\bbg-black\b/);
      expect(src, file).not.toMatch(
        /\b(bg|text|border)-(zinc|slate|emerald|rose|sky|violet|indigo|teal|cyan|purple|orange|amber|fuchsia|lime|pink|gray|green|red|blue|yellow)-[0-9]/,
      );
      expect(src, file).not.toMatch(
        /#(c53439|22c55e|d97706|3b82f6|ef4444|a855f7|ec4899|14b8a6|f97316|6366f1|84cc16|06b6d4|f43f5e|8b5cf6|eab308)/i,
      );
    }
  });

  it('confirms zero mission-shell importers remain among the swept ops files', () => {
    // Telemetry was the renderer's last mission-shell consumer cluster;
    // this pin locks the Phase-8 purge gate open.
    for (const file of files) {
      expect(readSrc(file)).not.toContain("from '@/features/mission/mission-shell.js'");
    }
  });
});
