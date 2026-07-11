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

describe('globals.css legacy purge (Wave B)', () => {
  const css = readFileSync(join(featuresDir, '../styles/globals.css'), 'utf8');

  it('carries none of the retired families, even in comments', () => {
    expect(css).not.toContain('.mission-');
    expect(css).not.toContain('brand-selected');
    expect(css).not.toContain('--mission-red');
  });

  it('renames the channel alias to console vocabulary in both shifts', () => {
    expect(css).toContain('--armed-hsl: 358 68% 40%');
    expect(css).toContain('--armed-hsl: 358 75% 51%');
    expect(css).toContain('hsl(var(--armed-hsl) / 0.58)');
  });
});

describe('display-fg-mute token (Wave C)', () => {
  it('defines the always-dark muted text token', () => {
    const css = readFileSync(join(featuresDir, '../styles/globals.css'), 'utf8');
    expect(css).toContain('--display-fg-mute: #8a8a86');
  });

  it('moves in-well muted text off the chassis token', () => {
    expect(readSrc('chat/message-list.tsx')).toContain('text-[var(--display-fg-mute)]');
    expect(readSrc('dashboard/mission-control-dashboard.tsx')).toContain(
      'text-[var(--display-fg-mute)]',
    );
    expect(
      readFileSync(join(featuresDir, '../components/console/subview-state.tsx'), 'utf8'),
    ).toContain('text-[var(--display-fg-mute)]');
  });
});

describe('sidenav dual-form fix (Wave C)', () => {
  const src = readFileSync(join(featuresDir, '../app/sidenav.tsx'), 'utf8');

  it('steady error dot uses the NO-GO fault token, not the alert-red', () => {
    expect(src).toContain('bg-[var(--led-nogo)]');
    expect(src).not.toContain('--led-warn');
  });
});

describe('small polish items (Wave C)', () => {
  it('pluralizes the visible-thread count', () => {
    const src = readSrc('chat/chat-view.tsx');
    expect(src).toContain("'1 visible thread'");
    expect(src).not.toContain('<Tag>{threads.length} visible threads</Tag>');
  });

  it('tokenizes the modal scrim', () => {
    const css = readFileSync(join(featuresDir, '../styles/globals.css'), 'utf8');
    expect(css).toContain('--scrim:');
    expect(readSrc('settings/add-provider-dialog.tsx')).toContain('bg-[var(--scrim)]');
    expect(readSrc('settings/add-provider-dialog.tsx')).not.toContain('bg-black/50');
  });

  it('truncates the MetricTile LCD figure with a full-value tooltip', () => {
    const src = readFileSync(join(featuresDir, '../components/console/metric-tile.tsx'), 'utf8');
    expect(src).toContain('truncate text-numeric');
    expect(src).toContain('title={value}');
  });
});
