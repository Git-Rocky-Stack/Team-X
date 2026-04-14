/**
 * Pure helpers extracted from `commands-view.tsx` so they can be unit
 * tested without pulling in the renderer's `@/*` path aliases (Vitest
 * resolves imports from the workspace root, not the renderer's
 * `vite.config`, so aliased imports fail at module-load time).
 *
 * Phase 5 — M30 T7.
 */

import type { IpcCommandHistoryEntry } from '@team-x/shared-types';

/**
 * Render a human-readable "time ago" relative to now. Falls back to
 * the absolute date if parse fails. Mirrors the compact format used
 * by Stream/Timeline ("just now", "3m ago", "2h ago").
 */
export function formatTimeAgo(iso: string, nowMs = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Sort rows newest-first. The repo query already orders by
 * `executedAt DESC`, but we re-sort defensively so this component
 * still behaves if a future caller pipes unsorted data through.
 */
export function sortByNewestFirst(
  rows: readonly IpcCommandHistoryEntry[],
): IpcCommandHistoryEntry[] {
  return [...rows].sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1));
}

/**
 * Truncate text to `maxChars` with ellipsis; safe for an undefined /
 * empty input (returns an empty string).
 */
export function truncateText(text: string | undefined, maxChars = 80): string {
  const s = text?.trim() ?? '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 3))}...`;
}
