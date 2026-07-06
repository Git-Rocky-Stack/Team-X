/**
 * Console-token Recharts theme (Phase 7a — sweep).
 *
 * Charts are DISPLAY SURFACES: they mount inside RecessedWells and stay dark
 * in both shifts, so every color here reads a display-safe token — ticks are
 * `--display-fg` (never silver/muted, which flip on Day Shift), the grid is
 * the display hairline, and the tooltip is a machined carbon plate.
 *
 * Series semantics: daily token volume burns armed red (usage = the
 * money-burning signal, matching the budget VU precedent); cost trend reads
 * go green. The categorical provider palette draws from the non-armed LED +
 * metal family — armed red stays reserved for LIVE.
 */

import type { CSSProperties } from 'react';

/** CartesianGrid stroke — the display-surface hairline. */
export const CHART_GRID_STROKE = 'var(--display-border)';

/** Axis tick style — phosphor text on the dark well. */
export const CHART_TICK = { fontSize: 10, fill: 'var(--display-fg)' } as const;

/** Tooltip contentStyle — machined plate floating over the well. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--carbon-850)',
  border: '1px solid var(--hairline-strong)',
  borderRadius: 'var(--r-inset)',
  fontSize: '12px',
  color: 'var(--display-fg)',
};

/** Area-series tones. */
export const CHART_SERIES = {
  tokens: 'var(--armed)',
  cost: 'var(--led-go)',
} as const;

/** Known providers → fixed categorical tokens (identity, not status). */
const PROVIDER_SERIES: Record<string, string> = {
  anthropic: 'var(--led-hold)',
  ollama: 'var(--led-go)',
  openai: 'var(--led-scope)',
  google: 'var(--led-warn)',
  groq: 'var(--phosphor)',
  openrouter: 'var(--platinum)',
  together: 'var(--chrome)',
  fireworks: 'var(--led-hold-dim)',
};

/** Display-safe ramp for unknown providers — dim LEDs + metals, no armed. */
const FALLBACK_SERIES = [
  'var(--led-scope-dim)',
  'var(--led-go-dim)',
  'var(--phosphor-dim)',
  'var(--chrome)',
  'var(--platinum)',
  'var(--graphite)',
];

/** Categorical series color — mirrors the legacy getProviderColor contract. */
export function getProviderSeriesColor(provider: string, index: number): string {
  const known = PROVIDER_SERIES[provider.toLowerCase()];
  if (known) return known;
  return FALLBACK_SERIES[index % FALLBACK_SERIES.length] ?? 'var(--graphite)';
}
