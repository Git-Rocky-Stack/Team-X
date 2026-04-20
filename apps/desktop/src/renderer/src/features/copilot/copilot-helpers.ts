/**
 * Pure helpers for the Copilot UI (Phase 5 — M34).
 *
 * Extracted from `copilot-insight-card.tsx`, `copilot-sidebar.tsx`, and
 * `copilot-dashboard-widget.tsx` so unit tests can cover the logic
 * without DOM/jsdom infrastructure. Mirrors the step-card-narrow.ts
 * pattern established in M32 T6.
 *
 * All functions in this module are pure: no React, no IPC, no side
 * effects. Determinism allows exhaustive test coverage with trivial
 * fixtures.
 */

import type { CopilotCategory, CopilotInsight, CopilotSeverity } from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Severity rank + sort comparator
// ---------------------------------------------------------------------------

/**
 * Rank used by the sidebar feed and dashboard widget — lower is shown
 * first. Critical insights float above warning; warning above info.
 */
export const SEVERITY_RANK: Record<CopilotSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Stable comparator: first by severity rank (critical > warning >
 * info), then by `createdAt` descending (newest within a bucket wins).
 *
 * Input is copied before sorting so callers can pass React Query-owned
 * arrays without mutating the cache. O(n log n) and safe to call every
 * render because `useMemo` already gates the call-sites.
 */
export function sortBySeverity<T extends Pick<CopilotInsight, 'severity' | 'createdAt'>>(
  insights: readonly T[],
): T[] {
  return [...insights].sort((a, b) => {
    const rankDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDelta !== 0) return rankDelta;
    return b.createdAt - a.createdAt;
  });
}

// ---------------------------------------------------------------------------
// Action entity parsing
// ---------------------------------------------------------------------------

/**
 * Insights store their `actionEntities` as a JSON string so the wire
 * stays JSON-safe. The renderer unpacks at dispatch time with
 * defensive parsing — malformed JSON, null, non-objects, and arrays
 * all degrade gracefully to the empty map. We only accept
 * string-valued entries because the downstream `command.execute`
 * contract (`IpcExecuteRequest.entities: Record<string, string>`)
 * rejects anything else.
 */
export function parseActionEntities(raw: string | null): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dashboard widget cap
// ---------------------------------------------------------------------------

/** The dashboard widget always shows at most this many insights. */
export const DASHBOARD_CAP = 3;

/**
 * Project a sorted list into `(topN, hasMore)` for the dashboard
 * widget footer. Single-pass slice.
 */
export function pickDashboardTopN<T>(
  sorted: readonly T[],
  cap: number = DASHBOARD_CAP,
): { topN: T[]; hasMore: boolean; total: number } {
  const total = sorted.length;
  return {
    topN: sorted.slice(0, cap),
    hasMore: total > cap,
    total,
  };
}

// ---------------------------------------------------------------------------
// Feedback weighting labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<CopilotCategory, string> = {
  operational: 'Operational',
  cost: 'Cost',
  org: 'Org Health',
  workflow: 'Workflow',
  anomaly: 'Anomaly',
};

export function formatCopilotWeightLabel(weight: number): string {
  return `${weight.toFixed(1)}x`;
}

export function formatFeedbackSuggestionPrompt(suggestion: {
  category: CopilotCategory;
  suggestedWeight: number;
}): string {
  return `Reduce ${CATEGORY_LABELS[suggestion.category]} insights to ${formatCopilotWeightLabel(
    suggestion.suggestedWeight,
  )}?`;
}
