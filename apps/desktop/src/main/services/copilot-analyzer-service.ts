/**
 * CopilotAnalyzerService — the headline M33 service. Periodic +
 * event-triggered analyzer that turns the rolling event window (T3)
 * into proactive, dedup-aware copilot insights (T1) persisted to
 * `copilot_insights` and fanned out on the bus as `copilot.insight`,
 * `copilot.analyzed`, `copilot.expired` (T4 EventType extensions).
 *
 * Architectural role:
 *
 *   - Composition root for the analyzer. The pure ingredients (T1 repo,
 *     T3 window) are wired here; the service owns scheduling, the Zod
 *     contract on LLM output, the pause-aware provider wrapper, and
 *     the runs-table integration.
 *
 *   - Mirror of `AgenticLoopService` (M31 T3). Same pause-poll shape,
 *     same AbortController-driven cancel, same `runs.finish` + terminal
 *     bus-event emission discipline. Diverges only where the analyzer
 *     is a non-streaming, JSON-output call (vs. ReAct tool loop).
 *
 *   - Observer of the orchestrator pause gate. Every provider call
 *     awaits `orchestrator.isCompanyPaused === false`. If a meeting
 *     starts mid-tick, the cycle no-ops cleanly with reason
 *     `'company_paused'` in the terminal event — the scheduled
 *     interval picks up the next minute.
 *
 * Contract:
 *
 *   start(companyId): void
 *     — idempotent. Registers a periodic interval that calls
 *       `tick(companyId, { reason: 'scheduled' })` every
 *       `interval_minutes` per the settings dep.
 *
 *   stop(companyId): void
 *     — clears the per-company interval. Any in-flight tick is
 *       aborted via the tick's AbortController; its terminal event
 *       still fires so subscribers see the transition.
 *
 *   tick(companyId, opts?): Promise<CopilotAnalyzerTickResult>
 *     — one analysis pass. The canonical entry point for scheduled,
 *       event-triggered, test, and IPC-forced ticks. Always resolves
 *       (never rejects) — failures are reflected in the terminal event
 *       payload and the tick result.
 *
 *   getLastAnalysisAt(companyId): number | null
 *     — `Date.now()`-stamped on `copilot.analyzed` emit. `null` until
 *       first tick lands. Drives the Copilot UI "last analyzed at" label.
 *
 *   restart(companyId): void
 *     — stop + start. Called by T7 `settings.setCopilot` when the
 *       interval changes.
 *
 * Phase 5 — M33 — T4.
 */


import type {
  ActorKind,
  CopilotAnalyzedPayload,
  CopilotAnalyzedReason,
  CopilotCategory,
  CopilotCategoryWeights,
  CopilotExpiredPayload,
  CopilotInsightPayload,
  CopilotSeverity,
  DashboardEvent,
  EventType,
} from '@team-x/shared-types';
import { COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';
import { z } from 'zod';

import type {
  CopilotInsightRow,
  CreateCopilotInsightInput,
  ListActiveFilter,
  CopilotCategory as RepoCategory,
  CopilotSeverity as RepoSeverity,
  UpsertContext,
  UpsertResult,
} from '../db/repos/copilot-insights.js';
import {
  COPILOT_CATEGORIES,
  COPILOT_SEVERITIES,
  DEFAULT_INSIGHT_TTL_MS,
} from '../db/repos/copilot-insights.js';

// ---------------------------------------------------------------------------
// Structural dep contracts. Narrow mirrors of the production repos so tests
// can inject hand-rolled fakes without pulling full Drizzle row types into
// the test surface — same discipline as AgenticLoopService (M31 T3).
// ---------------------------------------------------------------------------

export interface CopilotAnalyzerEmployeesRepo {
  findSystemByRoleId(companyId: string, roleId: string): { id: string } | null;
}

export interface CopilotAnalyzerRunsRepoStartInput {
  employeeId: string;
  provider: string;
  model: string;
  threadId?: string;
  kind?: 'work' | 'agentic' | 'copilot';
}

export interface CopilotAnalyzerRunsRepoFinishInput {
  status: 'success' | 'error' | 'cancelled';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: string;
  toolCallsCount?: number;
  error?: string;
}

export interface CopilotAnalyzerRunsRepo {
  start(input: CopilotAnalyzerRunsRepoStartInput): string;
  finish(id: string, input: CopilotAnalyzerRunsRepoFinishInput): void;
}

export interface CopilotAnalyzerInsightsRepo {
  listActive(filter: ListActiveFilter): CopilotInsightRow[];
  upsertWithDedup(draft: CreateCopilotInsightInput, ctx?: UpsertContext): UpsertResult;
  expireStale(now: number): number;
  /**
   * Returns a snapshot of rows currently considered stale by `expireStale`,
   * used to emit `copilot.expired` per row BEFORE the physical delete.
   * Called with `now` immediately before `expireStale(now)` on each tick.
   */
  listStale(now: number): CopilotInsightRow[];
}

export interface CopilotAnalyzerEventWindow {
  snapshot(companyId: string): DashboardEvent[];
}

export interface CopilotAnalyzerCompaniesRepo {
  list(): Array<{ id: string; name: string }>;
}

export interface CopilotAnalyzerEventBus {
  emit<T>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: ActorKind;
    payload: T;
  }): DashboardEvent<T>;
}

export interface CopilotAnalyzerOrchestratorLike {
  isCompanyPaused(companyId: string): boolean;
}

export interface CopilotAnalyzerSettings {
  /** Whether the analyzer is enabled for this company. False → tick short-circuits. */
  enabled: boolean;
  /** Interval in minutes between scheduled ticks. Clamp [1, 60] lives in T7 settings. */
  intervalMinutes: number;
  /** Subset of categories the analyzer is allowed to propose. Empty = nothing emitted. */
  categories: readonly CopilotCategory[];
  /** Feedback-derived category multipliers. Phase 6 M38, default 1.0 for every category. */
  categoryWeights: CopilotCategoryWeights;
}

export interface CopilotAnalyzerCompleteRequest {
  system: string;
  user: string;
  signal: AbortSignal;
}

export interface CopilotAnalyzerCompleteResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  provider: string;
  model: string;
}

export type CopilotAnalyzerCompleteFn = (
  req: CopilotAnalyzerCompleteRequest,
) => Promise<CopilotAnalyzerCompleteResult>;

export interface CopilotAnalyzerResolvedComplete {
  complete: CopilotAnalyzerCompleteFn;
  provider: string;
  model: string;
}

export interface CopilotAnalyzerLogger {
  warn(msg: string, err?: unknown): void;
  error(msg: string, err?: unknown): void;
}

export interface CopilotAnalyzerServiceDeps {
  companiesRepo: CopilotAnalyzerCompaniesRepo;
  employeesRepo: CopilotAnalyzerEmployeesRepo;
  runsRepo: CopilotAnalyzerRunsRepo;
  budgetGovernance?: {
    assertExecutionAllowed(input: {
      companyId: string;
      employeeId?: string | null;
      routineId?: string | null;
      executionKind: 'copilot';
    }): Promise<{ allowed: boolean; reason: string | null }>;
    recordRunSpend(runId: string): Promise<void>;
  };
  copilotInsightsRepo: CopilotAnalyzerInsightsRepo;
  copilotEventWindow: CopilotAnalyzerEventWindow;
  bus: CopilotAnalyzerEventBus;
  orchestrator: CopilotAnalyzerOrchestratorLike;
  /**
   * Resolve provider + model + non-streaming complete fn for the
   * system-copilot actor. Mirror of AgenticLoopService.resolveComplete.
   * In test mode, the composition root wires a canned function that
   * returns scripted JSON text.
   */
  resolveComplete(args: {
    companyId: string;
    systemCopilotId: string;
  }): Promise<CopilotAnalyzerResolvedComplete>;
  /**
   * Per-company settings snapshot. T4 defaults to `{ enabled: true,
   * intervalMinutes: 5, categories: COPILOT_CATEGORIES }` when the
   * settings repo is absent. T7 wires the real settings-repo read.
   */
  getSettings?(companyId: string): CopilotAnalyzerSettings;
  /** Optional clock + id injectors for tests. */
  now?(): number;
  newId?(): string;
  /** Poll interval for the orchestrator-pause gate. Defaults to 250ms. */
  pauseGatePollMs?: number;
  /** Injectable setInterval for tests. Defaults to global setInterval. */
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  logger?: CopilotAnalyzerLogger;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CopilotAnalyzerTickResult {
  runId: string;
  reason: CopilotAnalyzedReason;
  insightsProposed: number;
  insightsGenerated: number;
  insightsMerged: number;
  insightsExpired: number;
  status: 'success' | 'error' | 'cancelled';
  errorMessage: string | null;
}

export interface CopilotAnalyzerService {
  start(companyId: string): void;
  stop(companyId: string): void;
  /**
   * Stop every per-company schedule + abort every in-flight tick.
   * Called on app teardown — mirrors the per-instance equivalent on
   * AgenticLoopService (implicit in nulling the handle) but keeps the
   * analyzer's internal timer map closed.
   */
  stopAll(): void;
  tick(
    companyId: string,
    opts?: { reason?: CopilotAnalyzedReason },
  ): Promise<CopilotAnalyzerTickResult>;
  getLastAnalysisAt(companyId: string): number | null;
  restart(companyId: string): void;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM output. Narrow at the boundary so malformed model
// output never reaches the dedup layer. `expiresInHours` is server-side
// clamped in the draft builder below (not rejected) so models guessing
// "72" for a 1-week cap don't waste a tick on a retry.
// ---------------------------------------------------------------------------

const DRAFT_CATEGORY_ENUM = z.enum(
  COPILOT_CATEGORIES as readonly [CopilotCategory, ...CopilotCategory[]],
);
const DRAFT_SEVERITY_ENUM = z.enum(
  COPILOT_SEVERITIES as readonly [CopilotSeverity, ...CopilotSeverity[]],
);

export const InsightDraftSchema = z.object({
  category: DRAFT_CATEGORY_ENUM,
  severity: DRAFT_SEVERITY_ENUM,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  relatedEntities: z
    .object({
      employeeIds: z.array(z.string()).optional(),
      ticketIds: z.array(z.string()).optional(),
      projectIds: z.array(z.string()).optional(),
      goalIds: z.array(z.string()).optional(),
      meetingIds: z.array(z.string()).optional(),
    })
    .optional(),
  expiresInHours: z.number().optional(),
  actionSuggestion: z.string().optional(),
  actionIntent: z.string().optional(),
});

export const InsightDraftsSchema = z.array(InsightDraftSchema);

export type InsightDraft = z.infer<typeof InsightDraftSchema>;

// ---------------------------------------------------------------------------
// Helpers — pure, hoisted, unit-tested independently.
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_PAUSE_POLL_MS = 250;
const MAX_EVENT_SUMMARY_CHARS = 2000;
const MAX_EXPIRES_IN_HOURS = 168; // 1 week
const MIN_EXPIRES_IN_HOURS = 1;
const MAX_WEIGHTED_DRAFTS_PER_TICK = 5;

const SEVERITY_BASE_SCORE: Record<CopilotSeverity, number> = {
  critical: 1,
  warning: 0.7,
  info: 0.4,
};

function defaultSettings(): CopilotAnalyzerSettings {
  return {
    enabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    categories: COPILOT_CATEGORIES as readonly CopilotCategory[],
    categoryWeights: COPILOT_CATEGORY_WEIGHTS_DEFAULT,
  };
}

/**
 * Deterministic summary of the event window. Same inputs → same string.
 * Truncated to `MAX_EVENT_SUMMARY_CHARS` with a suffix marker so the
 * LLM knows the tail was clipped. Exported for the T4 determinism tests.
 */
export function summarizeEventWindow(events: readonly DashboardEvent[]): string {
  if (events.length === 0) return '(no recent events)';
  const lines: string[] = [];
  for (const e of events) {
    lines.push(`- [${e.type}] actor=${e.actorKind}:${e.actorId} at=${e.createdAt}`);
  }
  const body = lines.join('\n');
  if (body.length <= MAX_EVENT_SUMMARY_CHARS) return body;
  return `${body.slice(0, MAX_EVENT_SUMMARY_CHARS - 16)}\n… (truncated)`;
}

/**
 * Deterministic summary of the active insights the analyzer should NOT
 * re-propose. Fed into the prompt as the "already-surfaced" list so the
 * LLM doesn't waste tokens redundantly restating what the user has
 * already seen (dedup still catches duplicates, but this saves tokens).
 */
export function summarizeActiveInsights(rows: readonly CopilotInsightRow[]): string {
  if (rows.length === 0) return '(no active insights)';
  return rows
    .slice(0, 20)
    .map((r) => `- [${r.category}/${r.severity}] ${r.title}`)
    .join('\n');
}

export function weightInsightDrafts(
  drafts: readonly InsightDraft[],
  weights: CopilotCategoryWeights,
): InsightDraft[] {
  return drafts
    .map((draft, index) => ({
      draft,
      index,
      score: (SEVERITY_BASE_SCORE[draft.severity] ?? 0) * (weights[draft.category] ?? 1),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_WEIGHTED_DRAFTS_PER_TICK)
    .map((item) => item.draft);
}

/**
 * Build the analyzer's LLM prompt. Pure function — deterministic in
 * `events`, `activeInsights`, `companyContext`, `categories`. Kept
 * ≤2000 tokens in normal operation (event-summary truncation enforces
 * the cap). Exported for the T4 determinism tests.
 */
export function buildAnalysisPrompt(args: {
  events: readonly DashboardEvent[];
  activeInsights: readonly CopilotInsightRow[];
  companyContext: { name: string };
  categories: readonly CopilotCategory[];
}): { system: string; user: string } {
  const allowedCategories = args.categories.length
    ? args.categories.join(', ')
    : 'operational, cost, org, workflow, anomaly';
  const system = `You are the Copilot analyzer for an autonomous AI-agent company. Your job is to turn recent events into a small number of actionable, proactive insights for the human CEO. You output ONLY a JSON array of insight drafts — no prose, no markdown fences, no explanation.

Each draft MUST have:
  - category: one of [${allowedCategories}]
  - severity: one of [critical, warning, info]
  - title: ≤200 chars, specific and scannable
  - body: ≤2000 chars, grounded in the events, citing numbers
  - expiresInHours: optional integer in [1, 168]; defaults to 24
  - actionSuggestion: optional short string
  - actionIntent: optional NLU intent name for a one-click action

Do not propose insights that duplicate the "already-active" list. Be terse — quality over quantity. Return [] if nothing new is worth surfacing. Output MUST be valid JSON starting with [ and ending with ].`;
  const user = `Company: ${args.companyContext.name}

Allowed categories: ${allowedCategories}

Already-active insights (do not re-propose):
${summarizeActiveInsights(args.activeInsights)}

Recent events (oldest first):
${summarizeEventWindow(args.events)}

Return the JSON array now.`;
  return { system, user };
}

/**
 * Strip a bare JSON array out of potentially noisy model output. The
 * analyzer prompt insists on raw JSON, but local models sometimes
 * wrap the array in ```json fences or lead with a "Sure, here is…"
 * preamble. Scans for the first `[` and the matching final `]` via
 * brace-depth counting. Returns `null` when no array is found.
 */
export function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse raw LLM text into a validated `InsightDraft[]`. Returns `null`
 * when the text is malformed — driving the one-shot nudge retry path
 * in the tick runner.
 */
export function parseDrafts(text: string): InsightDraft[] | null {
  const slice = extractJsonArray(text);
  if (slice === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(slice);
  } catch {
    return null;
  }
  const parsed = InsightDraftsSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

function clampExpiresInHours(hours: number | undefined): number {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return 24;
  if (hours < MIN_EXPIRES_IN_HOURS) return MIN_EXPIRES_IN_HOURS;
  if (hours > MAX_EXPIRES_IN_HOURS) return MAX_EXPIRES_IN_HOURS;
  return Math.floor(hours);
}

/** Format a float `costUsd` as the `numeric(18,6)` string the runs table expects. */
function formatCostUsd(costUsd: number): string {
  return Number.isFinite(costUsd) ? costUsd.toFixed(6) : '0.000000';
}

/**
 * Build the structured nudge prompt appended on malformed first-attempt
 * output. Concise — short messages bias local models back to JSON faster.
 */
function buildNudgePrompt(
  original: { system: string; user: string },
  raw: string,
): {
  system: string;
  user: string;
} {
  return {
    system: original.system,
    user: `${original.user}

The previous response was NOT valid JSON matching the required schema. Return ONLY a JSON array conforming to the schema. No prose. No fences.

Previous response (truncated): ${raw.slice(0, 400)}`,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const SYSTEM_COPILOT_ROLE_ID = 'system-copilot';

export function createCopilotAnalyzerService(
  deps: CopilotAnalyzerServiceDeps,
): CopilotAnalyzerService {
  const now = deps.now ?? Date.now;
  const logger: CopilotAnalyzerLogger = deps.logger ?? {
    warn: (m, e) => console.warn(m, e),
    error: (m, e) => console.error(m, e),
  };
  const pausePollMs = deps.pauseGatePollMs ?? DEFAULT_PAUSE_POLL_MS;
  const getSettings = deps.getSettings ?? ((): CopilotAnalyzerSettings => defaultSettings());
  const newId = deps.newId ?? ((): string => `tick-${Math.random().toString(36).slice(2, 10)}`);
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;

  /** Per-company schedule handle. `null` means not running. */
  const schedules = new Map<string, NodeJS.Timeout>();
  /** Per-company last-analyzed timestamp (stamped on `copilot.analyzed`). */
  const lastAnalyzedAt = new Map<string, number>();
  /** Per-company in-flight AbortController (so `stop` can cancel a running tick). */
  const inflight = new Map<string, AbortController>();

  async function waitUntilUnpaused(companyId: string, signal: AbortSignal): Promise<void> {
    while (deps.orchestrator.isCompanyPaused(companyId)) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, pausePollMs);
        const onAbort = (): void => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const cleanup = (): void => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  function resolveCompanyContext(companyId: string): { name: string } {
    const list = deps.companiesRepo.list();
    const hit = list.find((c) => c.id === companyId);
    return { name: hit?.name ?? companyId };
  }

  async function runTick(
    companyId: string,
    reason: CopilotAnalyzedReason,
  ): Promise<CopilotAnalyzerTickResult> {
    const settings = getSettings(companyId);
    const tickRunId = newId();
    const startedAt = now();

    // Settings gate — a disabled analyzer or an empty category set still
    // emits `copilot.analyzed` so subscribers see the no-op explicitly.
    if (!settings.enabled || settings.categories.length === 0) {
      const payload: CopilotAnalyzedPayload = {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: 0,
      };
      safeEmitAnalyzed(companyId, companyId, payload);
      return {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        status: 'success',
        errorMessage: null,
      };
    }

    const sys = deps.employeesRepo.findSystemByRoleId(companyId, SYSTEM_COPILOT_ROLE_ID);
    if (!sys) {
      logger.warn(
        `[copilot-analyzer] system-copilot missing for company "${companyId}"; skipping tick.`,
      );
      const payload: CopilotAnalyzedPayload = {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: 0,
      };
      safeEmitAnalyzed(companyId, companyId, payload);
      return {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        status: 'error',
        errorMessage: 'system-copilot missing',
      };
    }
    const systemCopilotId = sys.id;

    if (deps.budgetGovernance) {
      const admission = await deps.budgetGovernance.assertExecutionAllowed({
        companyId,
        employeeId: systemCopilotId,
        executionKind: 'copilot',
      });
      if (!admission.allowed) {
        const payload: CopilotAnalyzedPayload = {
          runId: tickRunId,
          reason,
          insightsProposed: 0,
          insightsGenerated: 0,
          insightsMerged: 0,
          insightsExpired: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          durationMs: 0,
        };
        safeEmitAnalyzed(companyId, systemCopilotId, payload);
        return {
          runId: tickRunId,
          reason,
          insightsProposed: 0,
          insightsGenerated: 0,
          insightsMerged: 0,
          insightsExpired: 0,
          status: 'error',
          errorMessage: admission.reason ?? 'Copilot analysis blocked by budget policy.',
        };
      }
    }

    // Pause gate — observed BEFORE anything expensive. If the company is
    // paused, the tick no-ops and the next scheduled interval picks up.
    if (deps.orchestrator.isCompanyPaused(companyId)) {
      const payload: CopilotAnalyzedPayload = {
        runId: tickRunId,
        reason: 'company_paused',
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: 0,
      };
      safeEmitAnalyzed(companyId, systemCopilotId, payload);
      return {
        runId: tickRunId,
        reason: 'company_paused',
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: 0,
        status: 'success',
        errorMessage: null,
      };
    }

    // Expiry sweep — snapshot the stale rows, emit `copilot.expired`
    // per row, then physically delete. Done BEFORE the prompt build so
    // the listActive pass that feeds "already-active" context excludes
    // rows the analyzer is about to forget.
    const tickNow = now();
    let expiredCount = 0;
    try {
      const stale = deps.copilotInsightsRepo.listStale(tickNow);
      for (const row of stale) {
        safeEmit<CopilotExpiredPayload>(companyId, systemCopilotId, 'copilot.expired', {
          insightId: row.id,
          runId: tickRunId,
          category: row.category as CopilotCategory,
          title: row.title,
        });
      }
      expiredCount = deps.copilotInsightsRepo.expireStale(tickNow);
    } catch (err) {
      logger.warn('[copilot-analyzer] expiry sweep failed', err);
    }

    // Prompt build — pure, deterministic, ≤2000 event summary chars.
    const eventsWindow = deps.copilotEventWindow.snapshot(companyId);
    const activeInsights = deps.copilotInsightsRepo.listActive({ companyId, now: tickNow });
    const companyContext = resolveCompanyContext(companyId);
    const promptPair = buildAnalysisPrompt({
      events: eventsWindow,
      activeInsights,
      companyContext,
      categories: settings.categories,
    });

    // Resolve provider + open runs row with kind='copilot' BEFORE the
    // completion call so the telemetry row is durable even on crash.
    let resolved: CopilotAnalyzerResolvedComplete;
    try {
      resolved = await deps.resolveComplete({ companyId, systemCopilotId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[copilot-analyzer] resolveComplete failed', err);
      const payload: CopilotAnalyzedPayload = {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: expiredCount,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        durationMs: now() - startedAt,
      };
      safeEmitAnalyzed(companyId, systemCopilotId, payload);
      return {
        runId: tickRunId,
        reason,
        insightsProposed: 0,
        insightsGenerated: 0,
        insightsMerged: 0,
        insightsExpired: expiredCount,
        status: 'error',
        errorMessage: msg,
      };
    }

    const controller = new AbortController();
    inflight.set(companyId, controller);

    let runRowId = '';
    try {
      runRowId = deps.runsRepo.start({
        employeeId: systemCopilotId,
        provider: resolved.provider,
        model: resolved.model,
        kind: 'copilot',
      });
    } catch (err) {
      logger.warn('[copilot-analyzer] runs.start failed', err);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let insertedCount = 0;
    let mergedCount = 0;
    let proposedCount = 0;
    let terminalStatus: 'success' | 'error' | 'cancelled' = 'success';
    let terminalReason: CopilotAnalyzedReason = reason;
    let errorMessage: string | null = null;

    try {
      await waitUntilUnpaused(companyId, controller.signal);

      // First attempt
      const first = await resolved.complete({
        system: promptPair.system,
        user: promptPair.user,
        signal: controller.signal,
      });
      promptTokens += first.promptTokens;
      completionTokens += first.completionTokens;
      costUsd += first.costUsd;

      let drafts = parseDrafts(first.text);

      // One-shot nudge retry on malformed output — matches the M31 T1
      // brace-balanced parser nudge discipline. Any second-attempt
      // failure skips the cycle with reason='malformed_output'.
      if (drafts === null) {
        const nudge = buildNudgePrompt(promptPair, first.text);
        const retry = await resolved.complete({
          system: nudge.system,
          user: nudge.user,
          signal: controller.signal,
        });
        promptTokens += retry.promptTokens;
        completionTokens += retry.completionTokens;
        costUsd += retry.costUsd;
        drafts = parseDrafts(retry.text);
      }

      if (drafts === null) {
        terminalStatus = 'success';
        terminalReason = 'malformed_output';
        drafts = [];
      }

      proposedCount = drafts.length;
      const weightedDrafts = weightInsightDrafts(
        drafts.filter((draft) => settings.categories.includes(draft.category)),
        settings.categoryWeights,
      );

      // Dedup pass — emit `copilot.insight` only for inserts (dedup
      // misses). Merges are silent per design: the card title is
      // identical (by definition — Jaccard > 0.8) so no renderer
      // update is required.
      for (const draft of weightedDrafts) {
        // Category-allowlist gate — the classifier may still propose a
        // blocked category if the prompt is stretched. We silently drop.
        if (!settings.categories.includes(draft.category)) continue;
        const hours = clampExpiresInHours(draft.expiresInHours);
        const expiresAt = tickNow + hours * 60 * 60 * 1000;
        const createInput: CreateCopilotInsightInput = {
          companyId,
          category: draft.category as RepoCategory,
          severity: draft.severity as RepoSeverity,
          title: draft.title,
          detail: draft.body,
          actionSuggestion: draft.actionSuggestion ?? null,
          actionIntent: draft.actionIntent ?? null,
          actionEntitiesJson: draft.relatedEntities ? JSON.stringify(draft.relatedEntities) : null,
          expiresAt,
          now: tickNow,
        };
        try {
          const result = deps.copilotInsightsRepo.upsertWithDedup(createInput, { now: tickNow });
          if (result.merged) {
            mergedCount++;
          } else {
            insertedCount++;
            safeEmit<CopilotInsightPayload>(companyId, systemCopilotId, 'copilot.insight', {
              insightId: result.id,
              runId: tickRunId,
              category: draft.category,
              severity: draft.severity,
              title: draft.title,
              expiresAt,
            });
          }
        } catch (err) {
          logger.warn('[copilot-analyzer] upsertWithDedup failed for draft', err);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        terminalStatus = 'cancelled';
        terminalReason = reason;
        errorMessage = 'Tick canceled';
      } else {
        terminalStatus = 'error';
        errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('[copilot-analyzer] tick failed', err);
      }
    } finally {
      inflight.delete(companyId);
    }

    // Close the runs row with final metrics.
    if (runRowId !== '') {
      try {
        deps.runsRepo.finish(runRowId, {
          status: terminalStatus,
          promptTokens,
          completionTokens,
          latencyMs: now() - startedAt,
          costUsd: formatCostUsd(costUsd),
          error: errorMessage ?? undefined,
        });
      } catch (err) {
        logger.warn('[copilot-analyzer] runs.finish failed', err);
      }
      if (terminalStatus !== 'cancelled' && deps.budgetGovernance) {
        try {
          await deps.budgetGovernance.recordRunSpend(runRowId);
        } catch (err) {
          logger.warn('[copilot-analyzer] budget recordRunSpend failed', err);
        }
      }
    }

    const durationMs = now() - startedAt;
    const analyzedAt = now();
    lastAnalyzedAt.set(companyId, analyzedAt);

    const payload: CopilotAnalyzedPayload = {
      runId: tickRunId,
      reason: terminalReason,
      insightsProposed: proposedCount,
      insightsGenerated: insertedCount,
      insightsMerged: mergedCount,
      insightsExpired: expiredCount,
      tokensIn: promptTokens,
      tokensOut: completionTokens,
      costUsd,
      durationMs,
    };
    safeEmitAnalyzed(companyId, systemCopilotId, payload);

    return {
      runId: tickRunId,
      reason: terminalReason,
      insightsProposed: proposedCount,
      insightsGenerated: insertedCount,
      insightsMerged: mergedCount,
      insightsExpired: expiredCount,
      status: terminalStatus,
      errorMessage,
    };
  }

  function safeEmit<T>(companyId: string, actorId: string, type: EventType, payload: T): void {
    try {
      deps.bus.emit<T>({ type, companyId, actorId, actorKind: 'employee', payload });
    } catch (err) {
      logger.warn(`[copilot-analyzer] ${type} emit failed`, err);
    }
  }

  function safeEmitAnalyzed(
    companyId: string,
    actorId: string,
    payload: CopilotAnalyzedPayload,
  ): void {
    safeEmit<CopilotAnalyzedPayload>(companyId, actorId, 'copilot.analyzed', payload);
  }

  function start(companyId: string): void {
    if (schedules.has(companyId)) return;
    const settings = getSettings(companyId);
    const intervalMs = Math.max(1, settings.intervalMinutes) * 60 * 1000;
    const timer = setIntervalFn(() => {
      runTick(companyId, 'scheduled').catch((err) => {
        logger.error('[copilot-analyzer] scheduled tick rejected (unreachable)', err);
      });
    }, intervalMs);
    schedules.set(companyId, timer);
  }

  function stop(companyId: string): void {
    const timer = schedules.get(companyId);
    if (timer) {
      clearIntervalFn(timer);
      schedules.delete(companyId);
    }
    const ctrl = inflight.get(companyId);
    if (ctrl) {
      ctrl.abort();
      inflight.delete(companyId);
    }
  }

  function restart(companyId: string): void {
    stop(companyId);
    start(companyId);
  }

  function stopAll(): void {
    for (const timer of schedules.values()) {
      clearIntervalFn(timer);
    }
    schedules.clear();
    for (const ctrl of inflight.values()) {
      ctrl.abort();
    }
    inflight.clear();
  }

  async function tick(
    companyId: string,
    opts?: { reason?: CopilotAnalyzedReason },
  ): Promise<CopilotAnalyzerTickResult> {
    return runTick(companyId, opts?.reason ?? 'manual');
  }

  function getLastAnalysisAt(companyId: string): number | null {
    return lastAnalyzedAt.get(companyId) ?? null;
  }

  return { start, stop, stopAll, tick, getLastAnalysisAt, restart };
}

/** Exposed for tests only — NEVER depend on this from production code. */
export const __TEST_INTERNALS__ = {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_PAUSE_POLL_MS,
  MAX_EVENT_SUMMARY_CHARS,
  MAX_EXPIRES_IN_HOURS,
  MIN_EXPIRES_IN_HOURS,
  DEFAULT_INSIGHT_TTL_MS,
  clampExpiresInHours,
  formatCostUsd,
  defaultSettings,
} as const;
