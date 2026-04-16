/**
 * Copilot insights repository — CRUD + dedup-aware upsert for the
 * `copilot_insights` table (Phase 5 — M33 T1).
 *
 * Same cross-driver generic typing as the other repos: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * Lifecycle:
 *   create → (user dismiss | analyzer expireStale) → physical delete on
 *   the next `expireStale` sweep. The append-only `events` table is the
 *   authoritative history surface (architectural invariant #6); insights
 *   are mutable rows by design.
 *
 * Dedup contract for `upsertWithDedup` (Phase 5 §8.4 + M33 plan T1):
 *
 *   1. Category-scoped — candidates must share `category` with the draft.
 *      An "operational" insight is never merged with an "anomaly" insight
 *      purely on title overlap.
 *   2. Numeric-drift guard — extracted digit runs in the titles MUST
 *      match. Prevents "Alice has 3 blocked tickets" and "Alice has 4
 *      blocked tickets" from collapsing into a single drifting row, which
 *      would mask the actual change in count from the user.
 *   3. Jaccard bigram > 0.8 over normalized titles. Cheap, deterministic,
 *      stable across LLM phrasing variance, and tunable in one place if
 *      the analyzer ever wants a different threshold.
 *
 * On merge: `severity`, `detail`, `actionSuggestion`, `actionIntent`,
 * `actionEntitiesJson`, and `expiresAt` are refreshed from the draft (the
 * analyzer is the authoritative source for the latest state). `created_at`
 * is preserved so the user keeps seeing the original surfacing time, not
 * the latest re-confirmation.
 */

import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { copilotInsights } from '../schema.js';

export type CopilotInsightRow = typeof copilotInsights.$inferSelect;

export type CopilotCategory = 'operational' | 'cost' | 'org' | 'workflow' | 'anomaly';
export type CopilotSeverity = 'critical' | 'warning' | 'info';

/** Authoritative category set — kept in sync with the SQL CHECK constraint in 0011. */
export const COPILOT_CATEGORIES: readonly CopilotCategory[] = Object.freeze([
  'operational',
  'cost',
  'org',
  'workflow',
  'anomaly',
]);

/** Authoritative severity set — kept in sync with the SQL CHECK constraint in 0011. */
export const COPILOT_SEVERITIES: readonly CopilotSeverity[] = Object.freeze([
  'critical',
  'warning',
  'info',
]);

/** Default insight TTL — 24 hours. Overridable per-call via `expiresAt`. */
export const DEFAULT_INSIGHT_TTL_MS = 24 * 60 * 60 * 1000;

/** Jaccard threshold — strictly greater-than is a merge. Locked by Phase 5 §8.4. */
export const JACCARD_MERGE_THRESHOLD = 0.8;

export interface CreateCopilotInsightInput {
  companyId: string;
  category: CopilotCategory;
  severity: CopilotSeverity;
  title: string;
  detail: string;
  actionSuggestion?: string | null;
  actionIntent?: string | null;
  actionEntitiesJson?: string | null;
  /** Optional override — defaults to `now + DEFAULT_INSIGHT_TTL_MS`. */
  expiresAt?: number;
  /** Optional clock override — defaults to `Date.now()`. Test seam. */
  now?: number;
}

export interface ListActiveFilter {
  companyId: string;
  category?: CopilotCategory;
  severity?: CopilotSeverity;
  /** Optional row cap — applied AFTER the newest-first sort. */
  limit?: number;
  /** Optional clock override — defaults to `Date.now()`. Test seam. */
  now?: number;
  /**
   * When `true`, the query WIDENS past the default `dismissed_at IS NULL`
   * predicate and returns dismissed rows alongside active ones (still
   * subject to the `expires_at > now` TTL filter). Defaults to `false`
   * (M33 T1 behaviour — active-only).
   *
   * Added in M33 T6 for the `query_copilot_insights` agentic tool, which
   * opts in when the LLM wants historical context (e.g., "what insights
   * has Rocky dismissed today that might still matter?"). The renderer's
   * Copilot card list still calls `listActive` with the default so
   * dismissed rows never leak back into the feed.
   */
  includeDismissed?: boolean;
}

export interface UpsertContext {
  /** Optional clock override — defaults to `Date.now()` (or `draft.now`). */
  now?: number;
}

export interface UpsertResult {
  /** The id of the affected row (existing on merge, fresh on insert). */
  id: string;
  /** True when the draft was merged into an existing row. */
  merged: boolean;
}

type CopilotInsightsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

// ---------------------------------------------------------------------------
// Internal helpers — exported for direct unit testing.
// ---------------------------------------------------------------------------

/**
 * Lowercase + collapse whitespace runs to a single space + trim. Punctuation
 * is preserved — bigram overlap absorbs it cheaply, and stripping it would
 * make "alice's tickets" and "alices tickets" merge spuriously.
 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract every consecutive digit run from a title, in order. Drives the
 * numeric-drift guard: `['3'] !== ['4']` so "3 blocked" vs "4 blocked"
 * never merges, regardless of how high their Jaccard bigram score is.
 */
export function extractDigitRuns(title: string): string[] {
  return title.match(/\d+/g) ?? [];
}

/**
 * Build the bigram set for a normalized title. Returns a `Set<string>`
 * for O(1) intersection. Single-character (or empty) titles degrade to a
 * single sentinel-prefixed bigram so the formula stays defined and
 * different singletons never accidentally collide.
 */
export function bigrams(title: string): Set<string> {
  const text = normalizeTitle(title);
  if (text.length < 2) return new Set([`#${text}`]);
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    out.add(text.slice(i, i + 2));
  }
  return out;
}

/**
 * Jaccard similarity = `|A ∩ B| / |A ∪ B|` over bigram sets.
 * Range `[0, 1]`. Symmetric. Returns 0 for two empty inputs.
 */
export function jaccardBigrams(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersect = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersect++;
  }
  const union = setA.size + setB.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** Two arrays of strings are equal when same length AND same order. */
function digitRunsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * The merge predicate. Locked order: category-scope → numeric-drift guard
 * → Jaccard threshold. Order matters — the cheap rejections fire first
 * so the dedup loop short-circuits on obvious mismatches.
 */
export function shouldMerge(
  existing: CopilotInsightRow,
  draft: CreateCopilotInsightInput,
): boolean {
  if (existing.category !== draft.category) return false;
  if (!digitRunsEqual(extractDigitRuns(existing.title), extractDigitRuns(draft.title))) {
    return false;
  }
  return jaccardBigrams(existing.title, draft.title) > JACCARD_MERGE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function createCopilotInsightsRepo<TRunResult>(db: CopilotInsightsDb<TRunResult>) {
  /** Internal insert helper — shared by `create` and `upsertWithDedup`. */
  function doInsert(input: CreateCopilotInsightInput): string {
    const id = nanoid();
    const now = input.now ?? Date.now();
    const expiresAt = input.expiresAt ?? now + DEFAULT_INSIGHT_TTL_MS;
    db.insert(copilotInsights)
      .values({
        id,
        companyId: input.companyId,
        category: input.category,
        severity: input.severity,
        title: input.title,
        detail: input.detail,
        actionSuggestion: input.actionSuggestion ?? null,
        actionIntent: input.actionIntent ?? null,
        actionEntitiesJson: input.actionEntitiesJson ?? null,
        dismissedAt: null,
        createdAt: now,
        expiresAt,
      })
      .run();
    return id;
  }

  return {
    /**
     * Insert a new insight and return its id. Does NOT consult existing
     * rows for dedup — use `upsertWithDedup` for that. Caller controls
     * `expiresAt` (default: `now + DEFAULT_INSIGHT_TTL_MS`).
     */
    create(input: CreateCopilotInsightInput): string {
      return doInsert(input);
    },

    /** Return the insight by id, or null. */
    getById(id: string): CopilotInsightRow | null {
      const row = db.select().from(copilotInsights).where(eq(copilotInsights.id, id)).get();
      return row ?? null;
    },

    /**
     * Return active insights for a company — `dismissed_at IS NULL AND
     * expires_at > now`. Newest first. Optional category / severity / limit
     * filters compose with AND. Hits the composite index
     * `idx_insights_company_active`.
     *
     * When `filter.includeDismissed === true` (M33 T6) the
     * `dismissed_at IS NULL` predicate is DROPPED, widening the result
     * to include dismissed-but-not-yet-expired rows. The index still
     * helps on the `(company_id, expires_at)` prefix even when the
     * dismissal predicate is absent.
     */
    listActive(filter: ListActiveFilter): CopilotInsightRow[] {
      const now = filter.now ?? Date.now();
      const conds = [
        eq(copilotInsights.companyId, filter.companyId),
        gt(copilotInsights.expiresAt, now),
      ];
      if (filter.includeDismissed !== true) {
        conds.push(isNull(copilotInsights.dismissedAt));
      }
      if (filter.category !== undefined) {
        conds.push(eq(copilotInsights.category, filter.category));
      }
      if (filter.severity !== undefined) {
        conds.push(eq(copilotInsights.severity, filter.severity));
      }
      const rows = db
        .select()
        .from(copilotInsights)
        .where(and(...conds))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt);
      if (filter.limit !== undefined && filter.limit >= 0) {
        return rows.slice(0, filter.limit);
      }
      return rows;
    },

    /**
     * Stamp `dismissed_at = now` on the row. Idempotent on re-dismissal —
     * the WHERE clause skips already-dismissed rows so the original
     * dismissal time is preserved. Missing-id is a silent no-op (mirrors
     * `update().where()` semantics in the other repos).
     */
    dismiss(id: string, now?: number): void {
      const stamp = now ?? Date.now();
      db.update(copilotInsights)
        .set({ dismissedAt: stamp })
        .where(and(eq(copilotInsights.id, id), isNull(copilotInsights.dismissedAt)))
        .run();
    },

    /**
     * Permanently delete rows whose `expires_at < now`. Returns the count
     * of deleted rows. Called by the analyzer service on every cycle
     * (M33 T4) so the table never accumulates stale rows. Idempotent —
     * the second call returns 0.
     */
    expireStale(now: number): number {
      const stale = db
        .select({ id: copilotInsights.id })
        .from(copilotInsights)
        .where(lt(copilotInsights.expiresAt, now))
        .all();
      if (stale.length === 0) return 0;
      db.delete(copilotInsights).where(lt(copilotInsights.expiresAt, now)).run();
      return stale.length;
    },

    /**
     * Non-mutating snapshot of rows the next `expireStale(now)` call
     * would delete. Used by the `CopilotAnalyzerService` (M33 T4) to
     * emit one `copilot.expired` bus event per row BEFORE the physical
     * delete — per-row granularity lets the renderer animate individual
     * card removal instead of a bulk reflow. Kept as a separate method
     * rather than coupled into `expireStale`'s return shape so T1's
     * `expireStale` contract (returns a count, not rows) is preserved
     * for every caller that doesn't need per-row attribution.
     */
    listStale(now: number): CopilotInsightRow[] {
      return db.select().from(copilotInsights).where(lt(copilotInsights.expiresAt, now)).all();
    },

    /**
     * Insert OR merge — see the contract block at the top of this file.
     * On merge, returns `{ id: <existing>, merged: true }`. On insert,
     * returns `{ id: <new nanoid>, merged: false }`.
     *
     * Walks the company's active rows in undefined order — the predicate
     * is symmetric so the first hit is the merge target. There's no
     * "best match" tie-break because the analyzer's deterministic
     * scoring window keeps the candidate set small (~50 rows max).
     */
    upsertWithDedup(draft: CreateCopilotInsightInput, ctx: UpsertContext = {}): UpsertResult {
      const now = ctx.now ?? draft.now ?? Date.now();
      const existing = db
        .select()
        .from(copilotInsights)
        .where(
          and(
            eq(copilotInsights.companyId, draft.companyId),
            eq(copilotInsights.category, draft.category),
            isNull(copilotInsights.dismissedAt),
            gt(copilotInsights.expiresAt, now),
          ),
        )
        .all();
      for (const row of existing) {
        if (shouldMerge(row, draft)) {
          const expiresAt = draft.expiresAt ?? now + DEFAULT_INSIGHT_TTL_MS;
          db.update(copilotInsights)
            .set({
              severity: draft.severity,
              detail: draft.detail,
              actionSuggestion: draft.actionSuggestion ?? null,
              actionIntent: draft.actionIntent ?? null,
              actionEntitiesJson: draft.actionEntitiesJson ?? null,
              expiresAt,
            })
            .where(eq(copilotInsights.id, row.id))
            .run();
          return { id: row.id, merged: true };
        }
      }
      const id = doInsert({ ...draft, now });
      return { id, merged: false };
    },
  };
}
