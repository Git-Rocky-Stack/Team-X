/**
 * Copilot IPC wire-types (Phase 5 — M33 T5).
 *
 * The Copilot surface (M33 T4's `CopilotAnalyzerService` + T1's
 * `CopilotInsightsRepo`) exposes insights to the renderer through four
 * IPC channels:
 *
 *   - `copilot.insights`   — paginated `listActive` projection.
 *   - `copilot.dismiss`    — mark-as-dismissed proxy; fires `copilot.dismissed`
 *                            on the bus per architectural invariant #11.
 *   - `copilot.ask`        — routes through `AgenticLoopService.start` with the
 *                            `system-copilot` actor; returns the same
 *                            `{ runId, threadId }` shape as M31's
 *                            `complex_request` path so M34's sidebar can
 *                            attach the step-stream with zero wire-format
 *                            divergence. T5 ships the **stub** — T6 wires the
 *                            full agentic-loop round-trip.
 *   - `copilot.configure`  — **test-only** manual-tick IPC: resolves when
 *                            `CopilotAnalyzerService.tick(companyId, { reason: 'manual' })`
 *                            completes so the T9 Playwright spec can force an
 *                            analysis without waiting for the scheduled
 *                            interval. Feature-flagged via `isTestMode()` —
 *                            production callers receive a clear error
 *                            directing them to `settings.setCopilot` (T7).
 *   - `copilot.export`     — read-only local JSON/CSV export of active insights
 *                            for the current company or all companies. Emits no
 *                            bus event because it does not mutate app state.
 *
 * Wire-type discipline (M33 T5 note 4): these types are deliberately
 * DISTINCT from the Drizzle `CopilotInsightRow` shape in
 * `apps/desktop/src/main/db/repos/copilot-insights.ts`. The wire types
 * are JSON-safe by construction (`number | null` for timestamps rather
 * than Drizzle's column-inference, no `Date` objects, no references to
 * the runtime repo type). Mirrors the separation vault.ts /
 * TicketAttachment / Goal keep between row and bridge shapes.
 *
 * The category + severity unions here are re-exported from
 * `./events.js` where the canonical copy lives alongside the bus event
 * payloads — keeping a single source of truth for both the Drizzle
 * CHECK constraint and the wire contract.
 */

import type { CopilotCategory, CopilotSeverity } from './events.js';

// ---------------------------------------------------------------------------
// Wire shape — one row as the renderer sees it
// ---------------------------------------------------------------------------

/**
 * JSON-safe projection of a single copilot insight row.
 *
 * Matches `CopilotInsightRow` field-for-field but fixes the numeric
 * types so the shape round-trips through `structuredClone` (the
 * Electron `contextBridge` serializer) with no surprises.
 *
 * `dismissedAt` is `null` for active rows and a millisecond timestamp
 * once the user dismisses the insight. `expiresAt` is always populated
 * (hard TTL enforced by `CopilotInsightsRepo.expireStale`).
 */
export interface CopilotInsight {
  id: string;
  companyId: string;
  category: CopilotCategory;
  severity: CopilotSeverity;
  title: string;
  detail: string;
  /** Optional human-readable suggestion rendered on the insight card action strip. */
  actionSuggestion: string | null;
  /**
   * Optional NLU intent name the card's primary action dispatches when
   * the user clicks it (M34 wires this to `command.execute`).
   */
  actionIntent: string | null;
  /** Optional JSON-serialized entity map paired with `actionIntent`. */
  actionEntitiesJson: string | null;
  /** Epoch millis of dismissal, or `null` while the insight is active. */
  dismissedAt: number | null;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// `copilot.export` — local JSON/CSV export
// ---------------------------------------------------------------------------

export const COPILOT_EXPORT_FORMATS = ['csv', 'json'] as const;
export type CopilotExportFormat = (typeof COPILOT_EXPORT_FORMATS)[number];

export const COPILOT_EXPORT_SCOPES = ['company', 'all'] as const;
export type CopilotExportScope = (typeof COPILOT_EXPORT_SCOPES)[number];

export interface CopilotExportRequest {
  format: CopilotExportFormat;
  scope: CopilotExportScope;
  companyId?: string;
  category?: CopilotCategory;
  severity?: CopilotSeverity;
}

export interface CopilotExportResponse {
  filePath: string;
  rowCount: number;
  truncated: boolean;
  format: CopilotExportFormat;
  scope: CopilotExportScope;
}

// ---------------------------------------------------------------------------
// `copilot.insights` — paginated list
// ---------------------------------------------------------------------------

/**
 * Pagination request for `copilot.insights`. Cursor is the `createdAt`
 * of the last row from the previous page (newest-first ordering), or
 * `undefined` for the first page. Mirrors M14's `events.list` shape so
 * the renderer can reuse its infinite-query helpers.
 */
export interface CopilotInsightListArgs {
  companyId: string;
  /** Epoch-ms `createdAt` of the last insight from the previous page. */
  cursor?: number;
  /** Page size. Defaults to 50 in the handler. Capped at 100. */
  limit?: number;
  /** Optional category filter — only insights in this category are returned. */
  category?: CopilotCategory;
  /** Optional severity filter — only insights at this severity are returned. */
  severity?: CopilotSeverity;
}

export interface CopilotInsightListResult {
  insights: CopilotInsight[];
  /** `createdAt` of the last insight in this page, or `null` when there are no more pages. */
  nextCursor: number | null;
}

// ---------------------------------------------------------------------------
// `copilot.dismiss` — dismiss an insight
// ---------------------------------------------------------------------------

export interface CopilotDismissArgs {
  /** Insight id. */
  id: string;
}

export interface CopilotFeedbackSuggestion {
  category: CopilotCategory;
  dismissalsInWindow: number;
  windowDays: number;
  currentWeight: number;
  suggestedWeight: number;
  reason: string;
}

/**
 * Result shape for `copilot.dismiss`. Echoes the id + the server-side
 * dismissed-at timestamp so the renderer can optimistically project
 * the dismissal into its cache without a separate read-back.
 */
export interface CopilotDismissResult {
  id: string;
  dismissedAt: number;
  feedbackSuggestion?: CopilotFeedbackSuggestion;
}

// ---------------------------------------------------------------------------
// `copilot.ask` — T6 will wire to AgenticLoopService
// ---------------------------------------------------------------------------

export interface CopilotAskArgs {
  companyId: string;
  /** User's natural-language question. */
  text: string;
}

/**
 * Result shape for `copilot.ask`. Matches M31's `IpcExecuteResult`
 * `complex_request` branch field-for-field so M34's sidebar can reuse
 * the same `useAgentStepStream` hook without a second wire contract.
 */
export interface CopilotAskResult {
  runId: string;
  threadId: string;
}

// ---------------------------------------------------------------------------
// `copilot.configure` — test-only manual-tick IPC
// ---------------------------------------------------------------------------

/**
 * Args for the test-only manual-tick IPC. In production (non-test)
 * mode the handler throws before touching the analyzer — the E2E spec
 * in T9 is the sole intended caller.
 */
export interface CopilotConfigureArgs {
  companyId: string;
}

/** Result echoed back from a successful manual tick. */
export interface CopilotConfigureResult {
  /** runs.id for the tick — correlates to the row the analyzer persisted. */
  runId: string;
  /** Drafts the LLM proposed before dedup. */
  insightsProposed: number;
  /** Drafts that became new rows. */
  insightsGenerated: number;
  /** Drafts merged into existing rows. */
  insightsMerged: number;
  /** Rows that transitioned expired in this tick's sweep. */
  insightsExpired: number;
}

// ---------------------------------------------------------------------------
// Bus event payload — `copilot.dismissed`
// ---------------------------------------------------------------------------

/**
 * Fired on the event bus by the `copilot.dismiss` handler per
 * architectural invariant #11 (IPC mutations must emit a bus event so
 * the renderer's React Query cache can invalidate without coupling
 * every mutation to an `onSuccess`). Consumers are the Copilot UI
 * (M34) and the audit log (already covered by the append-only events
 * table at emit time).
 */
export interface CopilotDismissedPayload {
  insightId: string;
  dismissedAt: number;
  category: CopilotCategory;
  title: string;
}
