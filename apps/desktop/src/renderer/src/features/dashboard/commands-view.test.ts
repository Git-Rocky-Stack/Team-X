/**
 * Unit tests for the Commands subview's pure helpers (Phase 5 — M30 T7).
 *
 * The component itself is not DOM-tested — the renderer package has no
 * React Testing Library infrastructure (see the plan's T6 note). These
 * tests cover the two pure helpers the view depends on:
 *   - `sortByNewestFirst` — defensive re-sort guard
 *   - `formatTimeAgo` — relative-time rendering
 *
 * If a renderer DOM harness lands in a later milestone, add component-
 * level assertions for the empty/loading/error/populated states.
 */

import { describe, expect, it } from 'vitest';

import type { IpcCommandHistoryEntry } from '@team-x/shared-types';

import { formatTimeAgo, sortByNewestFirst, truncateText } from './commands-view-helpers.js';

function makeEntry(id: string, executedAt: string): IpcCommandHistoryEntry {
  return {
    id,
    text: `cmd-${id}`,
    intent: 'check_status',
    entities: {},
    executedAt,
    outcome: 'ok',
    companyId: 'co-1',
    actorId: 'user',
  };
}

describe('sortByNewestFirst', () => {
  it('returns newest-first order regardless of input order', () => {
    const older = makeEntry('a', '2026-04-10T10:00:00.000Z');
    const middle = makeEntry('b', '2026-04-12T10:00:00.000Z');
    const newest = makeEntry('c', '2026-04-13T10:00:00.000Z');

    const sorted = sortByNewestFirst([older, newest, middle]);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('does not mutate the input array', () => {
    const entries = [
      makeEntry('a', '2026-04-10T10:00:00.000Z'),
      makeEntry('b', '2026-04-13T10:00:00.000Z'),
    ];
    const original = entries.map((r) => r.id);
    sortByNewestFirst(entries);
    expect(entries.map((r) => r.id)).toEqual(original);
  });

  it('returns an empty array for empty input (empty-state upstream)', () => {
    expect(sortByNewestFirst([])).toEqual([]);
  });
});

describe('formatTimeAgo', () => {
  const base = Date.parse('2026-04-13T12:00:00.000Z');

  it('returns "just now" for diffs < 10s', () => {
    expect(formatTimeAgo('2026-04-13T11:59:55.000Z', base)).toBe('just now');
    expect(formatTimeAgo('2026-04-13T12:00:00.000Z', base)).toBe('just now');
  });

  it('renders seconds / minutes / hours / days bucketed correctly', () => {
    expect(formatTimeAgo('2026-04-13T11:59:30.000Z', base)).toBe('30s ago');
    expect(formatTimeAgo('2026-04-13T11:57:00.000Z', base)).toBe('3m ago');
    expect(formatTimeAgo('2026-04-13T10:00:00.000Z', base)).toBe('2h ago');
    expect(formatTimeAgo('2026-04-11T12:00:00.000Z', base)).toBe('2d ago');
  });

  it('falls back to the raw string on un-parseable input', () => {
    expect(formatTimeAgo('not-a-date', base)).toBe('not-a-date');
  });
});

describe('truncateText', () => {
  it('returns the trimmed string unchanged when ≤ maxChars', () => {
    expect(truncateText('hire a senior engineer')).toBe('hire a senior engineer');
    expect(truncateText('  padded  ')).toBe('padded');
  });

  it('truncates long strings with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncateText(long, 80);
    expect(result).toHaveLength(80);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles undefined / empty safely', () => {
    expect(truncateText(undefined)).toBe('');
    expect(truncateText('')).toBe('');
  });
});
