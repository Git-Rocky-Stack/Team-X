/**
 * copilot.* IPC handlers — thin request/response surface on top of the
 * M33 T1 `CopilotInsightsRepo` and the T4 `CopilotAnalyzerService`.
 *
 * Phase 5 — M33 T5.
 *
 * Kept in a sibling module (not folded into the monolithic
 * `handlers.ts`) for the same reason `rag-handlers.ts` is — the
 * Copilot subsystem is a distinct feature surface with its own
 * runtime dependencies (analyzer singleton, bus emit for dismissals,
 * test-mode gate on the manual-tick IPC) and its own lifecycle
 * (the analyzer schedules per-company timers; dismissals are
 * user-driven, scheduled ticks run on their own interval). Isolating
 * the four handlers here keeps `handlers.ts` from acquiring a
 * dependency on the analyzer and keeps the Copilot unit tests
 * sharp-focused.
 *
 * Shape contract (invariant #11 alignment):
 *
 *   - `copilot.insights`   — read-only. Wraps `listActive` with
 *                            cursor-based pagination; no bus emit.
 *   - `copilot.dismiss`    — mutates a row. MUST emit `copilot.dismissed`
 *                            on the bus so the renderer React Query
 *                            cache invalidates and the audit trail
 *                            captures the dismissal.
 *   - `copilot.ask`        — T5 stub. Throws `COPILOT_ASK_NOT_IMPLEMENTED`
 *                            until T6 wires the agentic-loop round-trip.
 *                            The IPC slot + TeamXApi shape are final so
 *                            T6 is purely additive.
 *   - `copilot.configure`  — test-only manual-tick. Feature-flagged via
 *                            `isTestMode()` — production callers get a
 *                            clear error directing them to
 *                            `settings.setCopilot` (T7).
 *
 * The factory is pure — it takes its repo + service callbacks as
 * dependencies and returns a record of async functions. Unit-tested
 * against hand-rolled fakes in `copilot-handlers.test.ts`. The
 * Electron `ipcMain.handle` wiring lives in `main/index.ts` alongside
 * the other sibling handler registrations (`rag`, composition root).
 */

import type {
  ActorKind,
  AuditEvent,
  CopilotAskArgs,
  CopilotAskResult,
  CopilotCategory,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotDismissedPayload,
  CopilotFeedbackApplied,
  CopilotFeedbackSuggestion,
  CopilotInsight,
  CopilotInsightListArgs,
  CopilotInsightListResult,
  CopilotSeverity,
  CopilotWeightsChangedPayload,
  DashboardEvent,
  EventType,
} from '@team-x/shared-types';
import { COPILOT_CATEGORIES, COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Dependency shapes — structurally narrow so tests pass plain fakes
// ---------------------------------------------------------------------------

/**
 * Minimal row shape the list handler consumes. Matches the `CopilotInsightRow`
 * fields 1:1 without importing the repo module — keeps this file free of
 * Drizzle inference and electron imports so the unit tests run under
 * plain Node.
 */
export interface CopilotInsightHandlerRow {
  id: string;
  companyId: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  actionSuggestion: string | null;
  actionIntent: string | null;
  actionEntitiesJson: string | null;
  dismissedAt: number | null;
  createdAt: number;
  expiresAt: number;
}

export interface CopilotInsightsHandlerRepo {
  /**
   * Newest-first active rows for the company. The handler applies
   * cursor + limit on top of this return — the repo is free to
   * over-return as long as the ordering is correct.
   */
  listActive(filter: {
    companyId: string;
    category?: CopilotCategory;
    severity?: CopilotSeverity;
    limit?: number;
    now?: number;
  }): CopilotInsightHandlerRow[];
  /**
   * Single-row lookup for the dismiss handler — returns `null` for
   * unknown ids so the handler can emit a typed error instead of
   * letting the repo throw.
   */
  getById(id: string): CopilotInsightHandlerRow | null;
  /**
   * Mark a row as dismissed. Implementations are expected to be
   * idempotent — a second dismiss on the same id is a no-op and
   * preserves the original `dismissedAt`.
   */
  dismiss(id: string, now?: number): void;
}

/** Analyzer surface — only what `copilot.configure` calls. */
export interface CopilotAnalyzerHandlerLike {
  tick(
    companyId: string,
    opts?: { reason?: 'manual' },
  ): Promise<{
    runId: string;
    insightsProposed: number;
    insightsGenerated: number;
    insightsMerged: number;
    insightsExpired: number;
  }>;
}

/** Event bus surface — only `emit`, no subscribe. */
export interface CopilotHandlerEventBus {
  emit<T>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: ActorKind;
    payload: T;
  }): DashboardEvent<T>;
}

export interface CopilotHandlerAuditRepo {
  list(filter: {
    companyId: string;
    eventTypes?: string[];
    fromMs?: number;
    limit?: number;
  }): Pick<AuditEvent, 'eventType' | 'payloadJson' | 'createdAt'>[];
}

export interface CopilotHandlerSettingsRepo {
  getCopilotWeights(): { weights: Record<CopilotCategory, number> };
  /**
   * H14 (audit 2026-05-07): persist a partial-weights patch and return
   * the resulting full weights map. Optional on the dep surface so the
   * pre-H14 advisory path keeps working with fakes that have not been
   * extended; the auto-apply path requires it AND throws a typed error
   * if it is missing — surfacing the dep gap loudly.
   */
  setCopilotWeights?(input: {
    companyId: string;
    weights: Partial<Record<CopilotCategory, number>>;
  }): { weights: Record<CopilotCategory, number> };
}

/**
 * Agentic-loop entry point — mirrors the shape `CommandService` already
 * uses for `agenticLoopStart`. T5 wires a **stub** that throws; T6
 * replaces it with the real call into `AgenticLoopService.start`.
 */
export type CopilotAgenticLoopStart = (req: {
  companyId: string;
  text: string;
}) => Promise<CopilotAskResult>;

export interface CopilotHandlersDeps {
  copilotInsightsRepo: CopilotInsightsHandlerRepo;
  copilotAnalyzerService: CopilotAnalyzerHandlerLike;
  bus: CopilotHandlerEventBus;
  auditRepo: CopilotHandlerAuditRepo;
  settingsRepo: CopilotHandlerSettingsRepo;
  /**
   * Resolves the test-mode gate at call time (not at factory-build
   * time) so the handler observes `NODE_ENV` exactly as the provider
   * factory does. Returning `false` causes `copilot.configure` to
   * throw before touching the analyzer.
   */
  isTestMode: () => boolean;
  /**
   * Optional clock override for tests — the dismiss handler reads
   * this once per call and passes it through to the repo + the bus
   * event payload. Production leaves this `undefined` and the repo
   * falls back to `Date.now()`.
   */
  now?: () => number;
  /**
   * Agentic-loop entry point for `copilot.ask`. T5 wires a **stub**
   * closure that throws — T6 swaps it for the real call via the
   * composition root. Keeping the dep on the factory surface means T6
   * lands without touching this file.
   */
  agenticLoopStart?: CopilotAgenticLoopStart;
  /**
   * H14 (audit 2026-05-07): pluggable read-time getter for the
   * "auto-apply dismissal feedback" toggle. Default (`undefined` → OFF)
   * preserves the existing advisory UX — the dismiss handler returns
   * `feedbackSuggestion` and the user clicks Apply manually. When this
   * returns `true`, the handler closes the loop autonomously: the
   * suggested weight is persisted via `setCopilotWeights`, a
   * `copilot.weights.changed` bus event fires, and the response carries
   * `feedbackApplied` instead of `feedbackSuggestion`. The toggle is
   * read at call time (not factory-build time) so an operator can flip
   * it without restarting the app.
   */
  autoApplyDismissalFeedback?: () => boolean;
}

// ---------------------------------------------------------------------------
// Public handler surface
// ---------------------------------------------------------------------------

export interface CopilotHandlers {
  insights(args: CopilotInsightListArgs): Promise<CopilotInsightListResult>;
  dismiss(args: CopilotDismissArgs): Promise<CopilotDismissResult>;
  ask(args: CopilotAskArgs): Promise<CopilotAskResult>;
  configure(args: CopilotConfigureArgs): Promise<CopilotConfigureResult>;
}

// ---------------------------------------------------------------------------
// Constants + helpers
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DISMISSAL_FEEDBACK_WINDOW_DAYS = 7;
const DISMISSAL_FEEDBACK_WINDOW_MS = DISMISSAL_FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Hard-coded actor id for bus events fired by dismissal. The human
 * user is the actor from the product's perspective — matches the
 * convention M30's `command.executed` event uses when Rocky runs a
 * destructive intent from the palette.
 */
const HUMAN_ACTOR_ID = 'rocky';

/**
 * H14 (audit 2026-05-07): hard-coded actor id for `copilot.weights.changed`
 * events emitted by the auto-apply feedback loop. The mutation is
 * caused by the LOOP, not by a direct user click, so the audit row
 * reads `actorKind='employee'` + `actorId='system-copilot'`. Renderer
 * surfaces (audit chip, toast banner) distinguish auto-applies from
 * manual applies by inspecting these two fields.
 */
const SYSTEM_COPILOT_ACTOR_ID = 'system-copilot';

/**
 * Project a repo row onto the JSON-safe wire shape. Runtime-identical
 * today (both sides use `number | null` timestamps and nullable
 * strings for the optional action columns) but the cast narrows the
 * `category` / `severity` strings into the exported unions so
 * renderer consumers get discriminated types without a second
 * validation layer.
 */
function toWire(row: CopilotInsightHandlerRow): CopilotInsight {
  return {
    id: row.id,
    companyId: row.companyId,
    category: row.category as CopilotCategory,
    severity: row.severity as CopilotSeverity,
    title: row.title,
    detail: row.detail,
    actionSuggestion: row.actionSuggestion,
    actionIntent: row.actionIntent,
    actionEntitiesJson: row.actionEntitiesJson,
    dismissedAt: row.dismissedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export function buildCopilotFeedbackSuggestion(args: {
  category: CopilotCategory;
  dismissalsInWindow: number;
  currentWeight: number;
}): CopilotFeedbackSuggestion | null {
  if (args.dismissalsInWindow < 3) return null;
  const suggestedWeight =
    args.currentWeight <= 0.5 ? 0 : Math.max(0, Math.round(args.currentWeight * 5) / 10);
  if (suggestedWeight === args.currentWeight) return null;
  return {
    category: args.category,
    dismissalsInWindow: args.dismissalsInWindow,
    windowDays: DISMISSAL_FEEDBACK_WINDOW_DAYS,
    currentWeight: args.currentWeight,
    suggestedWeight,
    reason: `You dismissed ${args.dismissalsInWindow} ${args.category} insights in the last 7 days.`,
  };
}

/**
 * H14 (audit 2026-05-07): sweep-all-categories aggregator that turns a
 * dismissal-counts-by-category snapshot into a complete updated weights
 * map. The closing-the-loop step the audit named: dismissals were
 * already RECORDED (audit log + `copilot.dismissed` event) and the
 * per-dismissal `buildCopilotFeedbackSuggestion` already produced a
 * single-category recommendation, but the loop never aggregated the
 * recommendation into actionable weights — the user had to click
 * Apply for each one. This helper crystallizes the aggregation:
 *
 * For each known category, if `dismissalCountsByCategory[cat]`
 * triggers a non-null `buildCopilotFeedbackSuggestion`, the new weight
 * replaces the current. Untouched categories keep their current
 * weight. The output `changedCategories` array is the audit trail —
 * what was lowered, by how much, and why.
 *
 * Pure / hoisted / dependency-free → trivially unit-testable. The
 * dismiss handler invokes it in the auto-apply path (when the
 * `autoApplyDismissalFeedback` toggle is ON) so the persisted weights
 * reflect the full multi-category state, not just the category whose
 * dismissal happened to be the one to cross the threshold.
 */
export function aggregateCategoryWeightsFromDismissals(args: {
  currentWeights: Record<CopilotCategory, number>;
  dismissalCountsByCategory: Partial<Record<CopilotCategory, number>>;
}): {
  weights: Record<CopilotCategory, number>;
  changedCategories: Array<{
    category: CopilotCategory;
    previousWeight: number;
    newWeight: number;
    dismissalsInWindow: number;
    reason: string;
  }>;
} {
  const nextWeights = { ...args.currentWeights };
  const changedCategories: Array<{
    category: CopilotCategory;
    previousWeight: number;
    newWeight: number;
    dismissalsInWindow: number;
    reason: string;
  }> = [];

  for (const category of COPILOT_CATEGORIES) {
    const dismissalsInWindow = args.dismissalCountsByCategory[category] ?? 0;
    if (dismissalsInWindow === 0) continue;
    const currentWeight =
      args.currentWeights[category] ?? COPILOT_CATEGORY_WEIGHTS_DEFAULT[category];
    const suggestion = buildCopilotFeedbackSuggestion({
      category,
      dismissalsInWindow,
      currentWeight,
    });
    if (suggestion === null) continue;
    nextWeights[category] = suggestion.suggestedWeight;
    changedCategories.push({
      category,
      previousWeight: currentWeight,
      newWeight: suggestion.suggestedWeight,
      dismissalsInWindow,
      reason: suggestion.reason,
    });
  }

  return { weights: nextWeights, changedCategories };
}

function readDismissedCategory(event: Pick<AuditEvent, 'payloadJson'>): CopilotCategory | null {
  try {
    const payload = JSON.parse(event.payloadJson) as { category?: unknown };
    return typeof payload.category === 'string' ? (payload.category as CopilotCategory) : null;
  } catch {
    return null;
  }
}

function countRecentDismissalsForCategory(args: {
  auditRepo: CopilotHandlerAuditRepo;
  companyId: string;
  category: CopilotCategory;
  now: number;
}): number {
  const fromMs = args.now - DISMISSAL_FEEDBACK_WINDOW_MS;
  const rows = args.auditRepo.list({
    companyId: args.companyId,
    eventTypes: ['copilot.dismissed'],
    fromMs,
    limit: 500,
  });
  return rows.filter(
    (event) =>
      event.eventType === 'copilot.dismissed' &&
      event.createdAt >= fromMs &&
      readDismissedCategory(event) === args.category,
  ).length;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildCopilotHandlers(deps: CopilotHandlersDeps): CopilotHandlers {
  const now = deps.now ?? (() => Date.now());

  return {
    async insights(args: CopilotInsightListArgs): Promise<CopilotInsightListResult> {
      if (!args || typeof args.companyId !== 'string' || args.companyId.length === 0) {
        throw new Error('copilot.insights: companyId is required');
      }

      const requestedLimit = args.limit ?? DEFAULT_LIMIT;
      const clampedLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)));

      // Over-fetch by one so we can detect end-of-data cheaply. The
      // repo already orders newest-first, so slicing after the cursor
      // predicate preserves ordering.
      const rows = deps.copilotInsightsRepo.listActive({
        companyId: args.companyId,
        category: args.category,
        severity: args.severity,
        // Room for cursor-trimming + the +1 over-fetch without
        // over-growing the in-memory buffer.
        limit: clampedLimit + 1,
      });

      const cursor = args.cursor;
      const trimmed = cursor === undefined ? rows : rows.filter((r) => r.createdAt < cursor);
      const page = trimmed.slice(0, clampedLimit);
      const nextCursor =
        trimmed.length > clampedLimit && page.length > 0
          ? (page[page.length - 1] as CopilotInsightHandlerRow).createdAt
          : null;

      return {
        insights: page.map(toWire),
        nextCursor,
      };
    },

    async dismiss(args: CopilotDismissArgs): Promise<CopilotDismissResult> {
      if (!args || typeof args.id !== 'string' || args.id.length === 0) {
        throw new Error('copilot.dismiss: id is required');
      }

      const existing = deps.copilotInsightsRepo.getById(args.id);
      if (existing === null) {
        throw new Error(`copilot.dismiss: insight not found (id=${args.id})`);
      }

      // Idempotent: if the row is already dismissed, skip the repo
      // call + bus emit and return the prior timestamp. Avoids
      // double-firing `copilot.dismissed` on a UI double-click and
      // preserves the original audit row.
      if (existing.dismissedAt !== null) {
        return { id: existing.id, dismissedAt: existing.dismissedAt };
      }

      const t = now();
      deps.copilotInsightsRepo.dismiss(args.id, t);

      const category = existing.category as CopilotCategory;
      const historicalDismissals = countRecentDismissalsForCategory({
        auditRepo: deps.auditRepo,
        companyId: existing.companyId,
        category,
        now: t,
      });
      const dismissalsInWindow = historicalDismissals + 1;
      const currentWeights = deps.settingsRepo.getCopilotWeights().weights;
      const currentWeight =
        currentWeights[category] ?? COPILOT_CATEGORY_WEIGHTS_DEFAULT[category];
      const feedbackSuggestion = buildCopilotFeedbackSuggestion({
        category,
        dismissalsInWindow,
        currentWeight,
      });

      const payload: CopilotDismissedPayload = {
        insightId: args.id,
        dismissedAt: t,
        category,
        title: existing.title,
      };
      deps.bus.emit<CopilotDismissedPayload>({
        type: 'copilot.dismissed',
        companyId: existing.companyId,
        actorId: HUMAN_ACTOR_ID,
        actorKind: 'user',
        payload,
      });

      if (feedbackSuggestion === null) {
        return { id: args.id, dismissedAt: t };
      }

      // H14 (audit 2026-05-07): if the auto-apply toggle is ON, close
      // the loop autonomously. Aggregate per-category counts (the
      // dismissed category's count is `dismissalsInWindow`; other
      // categories may also have crossed the threshold concurrently,
      // so we sweep them all), persist the new weights, emit
      // `copilot.weights.changed` with the system-copilot actor (the
      // mutation was caused by the LOOP, not a direct user action),
      // and return `feedbackApplied` instead of `feedbackSuggestion`.
      // If `setCopilotWeights` is missing from the dep — a
      // composition-root wiring gap — fall back to the advisory path
      // and surface the gap via console rather than silently swallow.
      const autoApply = deps.autoApplyDismissalFeedback?.() === true;
      if (autoApply) {
        const setter = deps.settingsRepo.setCopilotWeights;
        if (setter === undefined) {
          console.warn(
            '[copilot.dismiss] autoApplyDismissalFeedback returned true but settingsRepo.setCopilotWeights is missing — falling back to advisory suggestion. Wire setCopilotWeights at the composition root.',
          );
          return { id: args.id, dismissedAt: t, feedbackSuggestion };
        }

        // Sweep all categories so a concurrent threshold-cross in a
        // different category lands in the same write. The dismissed
        // category's count is the freshly-incremented one; any other
        // category's count is whatever the audit log shows for the
        // same window. We re-use the audit repo we already have.
        const dismissalCountsByCategory: Partial<Record<CopilotCategory, number>> = {
          [category]: dismissalsInWindow,
        };
        for (const otherCategory of COPILOT_CATEGORIES) {
          if (otherCategory === category) continue;
          const count = countRecentDismissalsForCategory({
            auditRepo: deps.auditRepo,
            companyId: existing.companyId,
            category: otherCategory,
            now: t,
          });
          if (count > 0) dismissalCountsByCategory[otherCategory] = count;
        }

        const aggregation = aggregateCategoryWeightsFromDismissals({
          currentWeights,
          dismissalCountsByCategory,
        });

        // Defensive: aggregation must include the dismissed category
        // (we just confirmed `feedbackSuggestion` is non-null, which
        // means the same logic in the aggregator must produce a
        // change for this category). If not, the advisory path is
        // the safe fallback.
        if (aggregation.changedCategories.length === 0) {
          return { id: args.id, dismissedAt: t, feedbackSuggestion };
        }

        try {
          const persisted = setter({
            companyId: existing.companyId,
            weights: aggregation.weights,
          });
          deps.bus.emit<CopilotWeightsChangedPayload>({
            type: 'copilot.weights.changed',
            companyId: existing.companyId,
            // The loop closes itself — the actor is the system copilot,
            // not the human who dismissed the row. The renderer
            // distinguishes auto-apply from manual apply by inspecting
            // `actorKind === 'employee'` on the audit row.
            actorId: SYSTEM_COPILOT_ACTOR_ID,
            actorKind: 'employee',
            payload: {
              weights: persisted.weights,
              changedKeys: aggregation.changedCategories.map((c) => c.category),
              changedAt: t,
            },
          });
        } catch (err) {
          console.warn(
            '[copilot.dismiss] auto-apply persistence failed; falling back to advisory suggestion:',
            err,
          );
          return { id: args.id, dismissedAt: t, feedbackSuggestion };
        }

        // The dismissed category's row is the one the user just acted
        // on, so it's the most informative element for the renderer's
        // toast/banner. If multiple categories crossed at once, the
        // emitted bus event already carries the full set.
        const primary =
          aggregation.changedCategories.find((c) => c.category === category) ??
          aggregation.changedCategories[0];
        if (primary === undefined) {
          // unreachable — guarded above — but typescript-strict guard
          return { id: args.id, dismissedAt: t, feedbackSuggestion };
        }
        const feedbackApplied: CopilotFeedbackApplied = {
          category: primary.category,
          dismissalsInWindow: primary.dismissalsInWindow,
          windowDays: feedbackSuggestion.windowDays,
          previousWeight: primary.previousWeight,
          newWeight: primary.newWeight,
          reason: primary.reason,
        };
        return { id: args.id, dismissedAt: t, feedbackApplied };
      }

      return { id: args.id, dismissedAt: t, feedbackSuggestion };
    },

    async ask(args: CopilotAskArgs): Promise<CopilotAskResult> {
      if (!args || typeof args.companyId !== 'string' || args.companyId.length === 0) {
        throw new Error('copilot.ask: companyId is required');
      }
      if (typeof args.text !== 'string' || args.text.trim().length === 0) {
        throw new Error('copilot.ask: text is required');
      }

      // T5 stub: the IPC slot is registered + typed, but the agentic
      // round-trip lands in T6. Until then, callers receive a clear
      // error rather than a synthetic runId that would mislead the
      // palette's step-stream hook. The composition root leaves
      // `agenticLoopStart` unset in T5; T6 wires it to
      // `AgenticLoopService.start` with `employeeId = system-copilot`.
      if (deps.agenticLoopStart === undefined) {
        throw new Error(
          'copilot.ask: not implemented — T6 wires AgenticLoopService.start with system-copilot',
        );
      }

      return deps.agenticLoopStart({ companyId: args.companyId, text: args.text });
    },

    async configure(args: CopilotConfigureArgs): Promise<CopilotConfigureResult> {
      if (!args || typeof args.companyId !== 'string' || args.companyId.length === 0) {
        throw new Error('copilot.configure: companyId is required');
      }

      if (!deps.isTestMode()) {
        throw new Error(
          'copilot.configure is a test-only IPC; use settings.setCopilot from T7 for production configuration',
        );
      }

      const tick = await deps.copilotAnalyzerService.tick(args.companyId, { reason: 'manual' });
      return {
        runId: tick.runId,
        insightsProposed: tick.insightsProposed,
        insightsGenerated: tick.insightsGenerated,
        insightsMerged: tick.insightsMerged,
        insightsExpired: tick.insightsExpired,
      };
    },
  };
}
