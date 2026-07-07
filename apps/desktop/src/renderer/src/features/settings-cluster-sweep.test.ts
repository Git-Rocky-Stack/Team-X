/**
 * Phase 7b Settings-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard + amoled-menu-surface recipe check
 * land with the final task (Phase-3 lesson 5: global pins land last).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('settings-view shell sweep', () => {
  const src = readSrc('settings/settings-view.tsx');

  it('drops the amoled shell for a console layout', () => {
    expect(src).toContain('<Faceplate');
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toMatch(/\bbg-black\b/);
    // NOTE: `text-h1 text-foreground` is a CURRENT Carbon type token, not legacy —
    // the console recompose KEEPS the <h1> title inside the Faceplate body.
  });

  it('preserves all 15 scroll targets + the focus effect', () => {
    for (const sel of [
      'data-settings-section="enhanced-ai"',
      'data-settings-section="extensions"',
      'data-settings-section="portability"',
      'data-settings-section="memory"',
      'data-settings-section="providers"',
    ]) {
      expect(src).toContain(sel);
    }
    expect(src).toContain('settingsFocusSection');
    expect(src).toContain('scrollIntoView');
    expect(src).toContain('componentName="UpdaterSection"');
  });
});

describe('updater-section sweep', () => {
  const src = readSrc('settings/updater-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('bg-[var(--go-soft)]');
    expect(src).toContain('bg-[var(--armed-soft)]');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('bg-surface-100');
    expect(src).not.toContain('bg-brand/5');
    expect(src).not.toContain('text-brand');
    expect(src).not.toMatch(/\b(text|bg|border)-(red|green|blue)-[0-9]/);
  });

  it('preserves update handlers + copy', () => {
    expect(src).toContain('checkUpdate.mutate()');
    expect(src).toContain('installUpdate.mutate()');
    expect(src).toContain('Check for Updates');
    expect(src).toContain('Install & Restart');
    expect(src).toContain('Team-X never phones home');
  });
});

describe('runtime-section sweep', () => {
  const src = readSrc('settings/runtime-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy composition', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-brand');
  });

  it('preserves strategy wiring + hardware readouts', () => {
    expect(src).toContain('setRuntime.mutate({ strategy: opt.value })');
    expect(src).toContain('orchestrator slot');
    expect(src).toContain('{hw.cpuCores} cores');
    expect(src).toContain('{hw.totalRamGb} GB');
  });
});

describe('privacy-section sweep', () => {
  const src = readSrc('settings/privacy-section.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
    expect(src).toContain('TIER_LED');
  });

  it('carries zero brand-selected or legacy palette', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-destructive');
  });

  it('preserves tier wiring + provider availability', () => {
    expect(src).toContain('setPrivacy.mutate({ maxTier: opt.value })');
    expect(src).toContain('Allowed');
    expect(src).toContain('Blocked');
    expect(src).toContain('Local Only');
  });
});
