import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CHART_GRID_STROKE,
  CHART_SERIES,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  getProviderSeriesColor,
} from './chart-theme.js';

describe('chart-theme console tokens', () => {
  it('draws grid and ticks from display-surface tokens (never silver/muted)', () => {
    expect(CHART_GRID_STROKE).toBe('var(--display-border)');
    expect(CHART_TICK.fill).toBe('var(--display-fg)');
    expect(CHART_TICK.fontSize).toBe(10);
  });

  it('styles the tooltip as a void plate from the displays-stay-dark family', () => {
    // Codex Stage-3 [P2]: --carbon-850 flips light on Day Shift while the
    // tooltip text stays --display-fg — the plate must come from the
    // shift-stable display family since charts mount in always-dark wells.
    expect(CHART_TOOLTIP_STYLE.backgroundColor).toBe('var(--void)');
    expect(CHART_TOOLTIP_STYLE.border).toBe('1px solid var(--chrome-edge)');
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe('var(--r-inset)');
    expect(CHART_TOOLTIP_STYLE.color).toBe('var(--display-fg)');
  });

  it('tones the two area series: token burn = armed, cost = go', () => {
    expect(CHART_SERIES.tokens).toBe('var(--armed)');
    expect(CHART_SERIES.cost).toBe('var(--led-go)');
  });

  it('maps known providers onto the non-armed shift-stable LED family', () => {
    expect(getProviderSeriesColor('anthropic', 0)).toBe('var(--led-hold)');
    expect(getProviderSeriesColor('ollama', 0)).toBe('var(--led-go)');
    expect(getProviderSeriesColor('openai', 0)).toBe('var(--led-scope)');
    // Codex Stage-3 [P2]: --platinum flips near-black on Day Shift and
    // vanished against the always-dark well — openrouter rides the stable
    // NO-GO brick instead (identity, not status).
    expect(getProviderSeriesColor('openrouter', 0)).toBe('var(--led-nogo)');
    // Case-insensitive, mirroring the legacy getProviderColor contract.
    expect(getProviderSeriesColor('Anthropic', 0)).toBe('var(--led-hold)');
  });

  it('cycles a display-safe fallback ramp for unknown providers, never armed red', () => {
    const a = getProviderSeriesColor('unknown-a', 0);
    const b = getProviderSeriesColor('unknown-b', 1);
    expect(a).toMatch(/^var\(--/);
    expect(a).not.toBe(b);
    for (let i = 0; i < 12; i++) {
      expect(getProviderSeriesColor('x', i)).not.toContain('--armed');
    }
  });

  it('reads only shift-stable tokens — never Day-flipping metals or chassis carbons', () => {
    // --platinum/--graphite/--carbon-*/--silver/--hairline* all change value
    // between Night Ops and Day Shift; chart surfaces are always-dark wells,
    // so any of them here is a Day-Shift contrast defect (Codex Stage-3).
    const src = readFileSync(new URL('./chart-theme.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/--(platinum|graphite|carbon-|silver|surface|hairline)/);
  });

  it('contains zero hardcoded hex colors', () => {
    const everything = JSON.stringify({
      CHART_GRID_STROKE,
      CHART_SERIES,
      CHART_TICK,
      CHART_TOOLTIP_STYLE,
    });
    expect(everything).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
