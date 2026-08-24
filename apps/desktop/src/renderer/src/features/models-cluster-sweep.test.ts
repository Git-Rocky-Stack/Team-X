/**
 * Models-cluster sweep contract (source-string pins).
 *
 * Same shape as the ops / settings / boards sweeps: per-file console-present +
 * legacy-absent + selector contract, plus two rules specific to this cluster.
 *
 *   1. **Dual-form red.** Nothing in the Models view is an unacknowledged
 *      question, so nothing here may blink. Every fault is a settled NO-GO and
 *      burns steady (DESIGN.md §LED semantics).
 *   2. **Honest nulls.** Every nullable figure the local-GGUF contract can
 *      return — VRAM the probe could not read, an unparsed GGUF size, a Hub
 *      file with no declared size, a benchmark with no VRAM reading — must
 *      have a visible "Unknown" / "Not measured" branch. This is the rule the
 *      backend truth audit established, pinned at the render layer so a future
 *      edit cannot quietly turn an absent measurement into a zero.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

const PANELS = [
  'models/library-panel.tsx',
  'models/discover-panel.tsx',
  'models/endpoints-panel.tsx',
  'models/runtime-panel.tsx',
  'models/model-detail.tsx',
  'models/models-view.tsx',
] as const;

describe('models cluster — console vocabulary', () => {
  it.each(PANELS)('%s carries zero legacy composition families', (rel) => {
    const src = readSrc(rel);
    expect(src).not.toContain('mission-shell');
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('amoled-menu-surface');
  });

  it.each(['models/library-panel.tsx', 'models/endpoints-panel.tsx', 'models/runtime-panel.tsx'])(
    '%s composes from a faceplate with console state',
    (rel) => {
      const src = readSrc(rel);
      expect(src).toContain('<Faceplate');
      expect(src).toContain('<SubviewState');
      expect(src).toContain('<LampTile');
    },
  );

  it('the runtime panel uses LCD metric readouts for live figures', () => {
    expect(readSrc('models/runtime-panel.tsx')).toContain('<MetricTile');
  });

  it('the shell styles its sub-tabs with the nav-tile recipe', () => {
    const src = readSrc('models/models-view.tsx');
    expect(src).toContain('nav-tile');
    expect(src).toContain('nav-tile-active');
  });

  it.each(PANELS)('%s uses machined caps rather than ad-hoc buttons', (rel) => {
    const src = readSrc(rel);
    if (!src.includes('<button')) return;
    expect(src).toMatch(/className="[^"]*\bcap(-armed)?\b|nav-tile/);
  });
});

describe('models cluster — dual-form red', () => {
  it.each(PANELS)('%s never blinks: every fault here is settled', (rel) => {
    const src = readSrc(rel);
    expect(src).not.toContain('animate-lamp-blink');
    expect(src).not.toContain('alert={true}');
    // A steady `warn` tone is explicitly forbidden for faults — a settled
    // failure is NO-GO, and warn is blink-only.
    expect(src).not.toContain('tone="warn"');
  });

  it('faults use the NO-GO stencil word', () => {
    for (const rel of [
      'models/library-panel.tsx',
      'models/endpoints-panel.tsx',
      'models/runtime-panel.tsx',
    ]) {
      expect(readSrc(rel)).toContain('NO-GO');
    }
  });
});

describe('models cluster — nullable figures are reported as unknown', () => {
  it('an unreadable VRAM figure is not rendered as zero', () => {
    const src = readSrc('models/runtime-panel.tsx');
    expect(src).toContain("'Unknown'");
    expect(src).toMatch(/vramMb\s*>\s*0/);
  });

  it('an unparsed GGUF size and arch fall back to Unknown', () => {
    const src = readSrc('models/library-panel.tsx');
    expect(src).toContain("'Unknown'");
    expect(src).toContain("?? 'Unknown'");
  });

  it('a Hub file with no declared size reads as Unknown', () => {
    expect(readSrc('models/discover-panel.tsx')).toContain("'Unknown'");
  });

  it('a benchmark with no VRAM reading says so instead of showing 0 MB', () => {
    const src = readSrc('models/model-detail.tsx');
    expect(src).toContain('Not measured');
    expect(src).toMatch(/vramPeakMb === null/);
  });

  it('a download with no known total shows no percentage', () => {
    const src = readSrc('models/discover-panel.tsx');
    expect(src).toMatch(/bytesTotal > 0/);
    expect(src).toMatch(/percent !== null/);
  });
});

describe('models cluster — selector contract', () => {
  it.each([
    ['models/library-panel.tsx', 'data-models-panel="library"'],
    ['models/discover-panel.tsx', 'data-models-panel="discover"'],
    ['models/endpoints-panel.tsx', 'data-models-panel="endpoints"'],
    ['models/runtime-panel.tsx', 'data-models-panel="runtime"'],
  ])('%s carries %s', (rel, selector) => {
    expect(readSrc(rel)).toContain(selector);
  });

  it('rows expose stable per-entity anchors', () => {
    expect(readSrc('models/library-panel.tsx')).toContain('data-model-row=');
    expect(readSrc('models/endpoints-panel.tsx')).toContain('data-endpoint-row=');
    expect(readSrc('models/discover-panel.tsx')).toContain('data-download-row=');
    expect(readSrc('models/discover-panel.tsx')).toContain('data-sibling-row=');
  });
});

describe('models cluster — destructive actions are confirmed', () => {
  it.each([
    ['models/library-panel.tsx', 'removeModel'],
    ['models/endpoints-panel.tsx', 'endpoint removal'],
  ])('%s gates %s behind a second click', (rel) => {
    const src = readSrc(rel);
    expect(src).toContain('confirming');
    expect(src).toContain('cap-armed');
  });
});
