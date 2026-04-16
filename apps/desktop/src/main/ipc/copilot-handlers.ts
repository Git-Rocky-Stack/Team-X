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
  CopilotAskArgs,
  CopilotAskResult,
  CopilotCategory,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotDismissedPayload,
  CopilotInsight,
  CopilotInsightListArgs,
  CopilotInsightListResult,
  CopilotSeverity,
  DashboardEvent,
  EventType,
} from '@team-x/shared-types';

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

/**
 * Hard-coded actor id for bus events fired by dismissal. The human
 * user is the actor from the product's perspective — matches the
 * convention M30's `command.executed` event uses when Rocky runs a
 * destructive intent from the palette.
 */
const HUMAN_ACTOR_ID = 'rocky';

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

      const payload: CopilotDismissedPayload = { insightId: args.id, dismissedAt: t };
      deps.bus.emit<CopilotDismissedPayload>({
        type: 'copilot.dismissed',
        companyId: existing.companyId,
        actorId: HUMAN_ACTOR_ID,
        actorKind: 'user',
        payload,
      });

      return { id: args.id, dismissedAt: t };
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
