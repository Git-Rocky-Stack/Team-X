/**
 * Unit tests for Copilot UI pure helpers (Phase 5 — M34 T9).
 *
 * Covers:
 *   - `sortBySeverity` — rank order + tie-break by createdAt.
 *   - `parseActionEntities` — JSON parsing, malformed input, array
 *     rejection, non-string value filtering.
 *   - `pickDashboardTopN` — cap, total, hasMore flag.
 *
 * Matches the step-card-narrow.ts testing pattern established in M32
 * T6 — pure functions, no DOM, no IPC, no React.
 */

import { describe, expect, it } from 'vitest';

import type { CopilotInsight } from '@team-x/shared-types';

import {
  DASHBOARD_CAP,
  SEVERITY_RANK,
  parseActionEntities,
  pickDashboardTopN,
  sortBySeverity,
} from './copilot-helpers.js';

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function makeInsight(overrides: Partial<CopilotInsight> = {}): CopilotInsight {
  return {
    id: 'ins-1',
    companyId: 'co-1',
    category: 'operational',
    severity: 'info',
    title: 'Test insight',
    detail: 'A short detail.',
    actionSuggestion: null,
    actionIntent: null,
    actionEntitiesJson: null,
    dismissedAt: null,
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + 3_600_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sortBySeverity
// ---------------------------------------------------------------------------

describe('sortBySeverity', () => {
  it('sorts critical before warning before info', () => {
    const input = [
      makeInsight({ id: 'a', severity: 'info' }),
      makeInsight({ id: 'b', severity: 'critical' }),
      makeInsight({ id: 'c', severity: 'warning' }),
    ];
    const result = sortBySeverity(input);
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('tie-breaks by createdAt descending within a severity bucket', () => {
    const input = [
      makeInsight({ id: 'old-crit', severity: 'critical', createdAt: 100 }),
      makeInsight({ id: 'new-crit', severity: 'critical', createdAt: 200 }),
      makeInsight({ id: 'mid-crit', severity: 'critical', createdAt: 150 }),
    ];
    const result = sortBySeverity(input);
    expect(result.map((i) => i.id)).toEqual(['new-crit', 'mid-crit', 'old-crit']);
  });

  it('does not mutate the input array', () => {
    const input = [
      makeInsight({ id: 'a', severity: 'info' }),
      makeInsight({ id: 'b', severity: 'critical' }),
    ];
    const snapshot = input.map((i) => i.id);
    sortBySeverity(input);
    expect(input.map((i) => i.id)).toEqual(snapshot);
  });

  it('handles empty input', () => {
    expect(sortBySeverity([])).toEqual([]);
  });

  it('exposes numeric rank constants', () => {
    expect(SEVERITY_RANK.critical).toBeLessThan(SEVERITY_RANK.warning);
    expect(SEVERITY_RANK.warning).toBeLessThan(SEVERITY_RANK.info);
  });
});

// ---------------------------------------------------------------------------
// parseActionEntities
// ---------------------------------------------------------------------------

describe('parseActionEntities', () => {
  it('returns the parsed object for a well-formed JSON string', () => {
    const raw = JSON.stringify({ ticketId: 't-42', assigneeId: 'emp-1' });
    expect(parseActionEntities(raw)).toEqual({
      ticketId: 't-42',
      assigneeId: 'emp-1',
    });
  });

  it('returns empty object for null input', () => {
    expect(parseActionEntities(null)).toEqual({});
  });

  it('returns empty object for malformed JSON', () => {
    expect(parseActionEntities('{not valid json')).toEqual({});
  });

  it('rejects JSON arrays at the top level', () => {
    expect(parseActionEntities(JSON.stringify(['a', 'b']))).toEqual({});
  });

  it('rejects JSON primitives at the top level', () => {
    expect(parseActionEntities(JSON.stringify(42))).toEqual({});
    expect(parseActionEntities(JSON.stringify('string'))).toEqual({});
    expect(parseActionEntities(JSON.stringify(null))).toEqual({});
  });

  it('filters out non-string values from the object', () => {
    const raw = JSON.stringify({ a: 'ok', b: 42, c: null, d: { nested: 'x' }, e: 'fine' });
    expect(parseActionEntities(raw)).toEqual({ a: 'ok', e: 'fine' });
  });

  it('returns empty object for empty string', () => {
    expect(parseActionEntities('')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// pickDashboardTopN
// ---------------------------------------------------------------------------

describe('pickDashboardTopN', () => {
  it('defaults the cap to DASHBOARD_CAP (3)', () => {
    expect(DASHBOARD_CAP).toBe(3);
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = pickDashboardTopN(input);
    expect(result.topN).toEqual(['a', 'b', 'c']);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });

  it('sets hasMore false when total fits under the cap', () => {
    const result = pickDashboardTopN(['a', 'b']);
    expect(result.topN).toEqual(['a', 'b']);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(2);
  });

  it('honours a custom cap', () => {
    const result = pickDashboardTopN(['a', 'b', 'c', 'd', 'e'], 2);
    expect(result.topN).toEqual(['a', 'b']);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });

  it('handles empty input', () => {
    const result = pickDashboardTopN([]);
    expect(result).toEqual({ topN: [], hasMore: false, total: 0 });
  });
});
