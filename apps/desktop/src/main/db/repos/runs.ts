/**
 * Runs repository — one row per LLM call. Drives the Telemetry tab in
 * the live cockpit: tokens, latency, cost, tool-call count, pass/fail
 * status. Also the raw data for per-employee activity timelines.
 *
 * Lifecycle is two-phase:
 *
 * 1. `start({ employeeId, provider, model, threadId? })` — called by
 *    the orchestrator just before it dispatches the LLM call.
 *    Persists a row with status='running', zeros for every metric,
 *    `startedAt = Date.now()`, and `endedAt = null`. Returns the
 *    generated id.
 *
 * 2. `finish(id, metrics)` — called after the LLM call resolves (or
 *    rejects). Updates the row with final token counts, latency, cost,
 *    tool-call count, status ∈ { success | error | cancelled }, and
 *    stamps `endedAt = Date.now()`. Accepts an optional error string
 *    when status is 'error'. No-op on unknown id so orchestrator cleanup
 *    code paths don't need presence checks.
 *
 * Cost is stored as a decimal string (see schema.ts). Callers should
 * pass the cost as a pre-formatted string from telemetry-core's
 * calcCostUsd helper — not as a JS number, to preserve sub-cent precision.
 *
 * Cross-driver generic typing — same pattern as the other repos.
 */

import type { TelemetryRunKind } from '@team-x/shared-types';
import { type SQL, and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { employees, messages, runs, threads } from '../schema.js';

export type RunRow = typeof runs.$inferSelect;

export type RunStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface StartRunInput {
  employeeId: string;
  provider: string;
  model: string;
  threadId?: string;
  /**
   * Run discriminator — defaults to `work` (Phase 1 chat). `agentic`
   * for M31 loop runs, `copilot` for M33 analyzer ticks. Added by
   * migration 0012 (M33 T4). Writers that don't pass `kind` land in
   * the `work` bucket courtesy of the SQL DEFAULT, preserving the
   * Phase-1 telemetry shape.
   */
  kind?: 'work' | 'agentic' | 'copilot';
}

export interface FinishRunInput {
  status: 'success' | 'error' | 'cancelled';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** Decimal string — pass through from telemetry-core.calcCostUsd(). */
  costUsd: string;
  toolCallsCount?: number;
  error?: string;
}

export interface RecentRunRow {
  runId: string;
  threadId: string | null;
  threadSubject: string | null;
  employeeId: string;
  employeeName: string;
  employeeTitle: string;
  provider: string;
  model: string;
  status: RunStatus;
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  toolCallsCount: number;
  startedAt: number;
  endedAt: number | null;
}

export const INTERRUPTED_WORK_RUN_MESSAGE =
  "I couldn't complete that reply because the app was interrupted before the provider returned.";
export const INTERRUPTED_WORK_RUN_ERROR = 'app interrupted before completing work run';

type RunsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function withRunKindCondition(
  conditions: SQL<unknown>[],
  kind: TelemetryRunKind | undefined,
): SQL<unknown>[] {
  if (kind !== undefined) {
    conditions.push(eq(runs.kind, kind));
  }
  return conditions;
}

export function createRunsRepo<TRunResult>(db: RunsDb<TRunResult>) {
  return {
    /**
     * Open a new run row with status='running' and zero metrics.
     * Called immediately before dispatching an LLM call.
     */
    start(input: StartRunInput): string {
      const id = nanoid();
      db.insert(runs)
        .values({
          id,
          employeeId: input.employeeId,
          threadId: input.threadId ?? null,
          provider: input.provider,
          model: input.model,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          costUsd: '0',
          toolCallsCount: 0,
          startedAt: Date.now(),
          endedAt: null,
          status: 'running',
          error: null,
          kind: input.kind ?? 'work',
        })
        .run();
      return id;
    },

    /**
     * Close an existing run row with final metrics. No-op on unknown id
     * so orchestrator cleanup paths do not need presence checks on the
     * hot path.
     */
    finish(id: string, input: FinishRunInput): void {
      db.update(runs)
        .set({
          status: input.status,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          latencyMs: input.latencyMs,
          costUsd: input.costUsd,
          toolCallsCount: input.toolCallsCount ?? 0,
          endedAt: Date.now(),
          error: input.error ?? null,
        })
        .where(eq(runs.id, id))
        .run();
    },

    /** Return one run row by id, or null if it does not exist. */
    getById(id: string): RunRow | null {
      return db.select().from(runs).where(eq(runs.id, id)).get() ?? null;
    },

    /**
     * Startup recovery for work runs left open by a crashed or force-quit
     * main process. There is no live in-flight work before the orchestrator
     * is rebuilt, so any persisted `running` work row belongs to a previous
     * process and must be made terminal before the renderer can treat the
     * thread as healthy again.
     */
    recoverInterruptedWorkRuns(input: { now?: number } = {}): number {
      const recoveredAt = input.now ?? Date.now();
      const staleRows = db
        .select()
        .from(runs)
        .where(and(eq(runs.kind, 'work'), eq(runs.status, 'running')))
        .all();

      for (const row of staleRows) {
        db.update(runs)
          .set({
            status: 'error',
            endedAt: recoveredAt,
            latencyMs: Math.max(0, recoveredAt - row.startedAt),
            error: INTERRUPTED_WORK_RUN_ERROR,
          })
          .where(eq(runs.id, row.id))
          .run();

        if (row.threadId !== null) {
          db.update(messages)
            .set({ content: INTERRUPTED_WORK_RUN_MESSAGE })
            .where(
              and(
                eq(messages.threadId, row.threadId),
                eq(messages.authorId, row.employeeId),
                eq(messages.authorKind, 'employee'),
                eq(messages.content, ''),
                gte(messages.createdAt, row.startedAt - 1_000),
                lte(messages.createdAt, recoveredAt),
              ),
            )
            .run();
        }
      }

      return staleRows.length;
    },

    /** Return every run row for a given employee. Phase 1 does not paginate. */
    listByEmployee(employeeId: string): RunRow[] {
      return db.select().from(runs).where(eq(runs.employeeId, employeeId)).all();
    },

    /**
     * Newest-first recent run summaries for one company. Joins
     * employees + threads so dashboard callers can render a durable
     * run card without follow-up lookups.
     */
    recentRuns(companyId: string, limit: number, kind?: TelemetryRunKind): RecentRunRow[] {
      const conditions = withRunKindCondition([eq(employees.companyId, companyId)], kind);

      const rows = db
        .select({
          runId: runs.id,
          threadId: runs.threadId,
          threadSubject: threads.subject,
          employeeId: employees.id,
          employeeName: employees.name,
          employeeTitle: employees.title,
          provider: runs.provider,
          model: runs.model,
          status: runs.status,
          error: runs.error,
          promptTokens: runs.promptTokens,
          completionTokens: runs.completionTokens,
          costUsd: runs.costUsd,
          toolCallsCount: runs.toolCallsCount,
          startedAt: runs.startedAt,
          endedAt: runs.endedAt,
        })
        .from(runs)
        .innerJoin(employees, eq(runs.employeeId, employees.id))
        .leftJoin(threads, eq(runs.threadId, threads.id))
        .where(and(...conditions))
        .orderBy(desc(sql`coalesce(${runs.endedAt}, ${runs.startedAt})`), desc(runs.startedAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        ...row,
        status: row.status as RunStatus,
      }));
    },

    // ------------------------------------------------------------------
    // Telemetry aggregates (Phase 3 — M17)
    // ------------------------------------------------------------------

    /**
     * Company-level summary stats. Only counts completed runs (success/error).
     * Returns zero-value record when no runs exist.
     */
    companyStats(companyId: string, kind?: TelemetryRunKind): CompanyStats {
      const conditions = withRunKindCondition(
        [
          sql`${runs.employeeId} IN (SELECT id FROM employees WHERE company_id = ${companyId})`,
          sql`${runs.status} IN ('success', 'error')`,
        ],
        kind,
      );

      const rows = db
        .select({
          totalRuns: sql<number>`count(*)`.as('total_runs'),
          totalPromptTokens: sql<number>`coalesce(sum(${runs.promptTokens}), 0)`.as(
            'total_prompt_tokens',
          ),
          totalCompletionTokens: sql<number>`coalesce(sum(${runs.completionTokens}), 0)`.as(
            'total_completion_tokens',
          ),
          totalCostUsd: sql<string>`coalesce(sum(cast(${runs.costUsd} as real)), 0)`.as(
            'total_cost_usd',
          ),
          avgLatencyMs: sql<number>`coalesce(avg(${runs.latencyMs}), 0)`.as('avg_latency_ms'),
          totalToolCalls: sql<number>`coalesce(sum(${runs.toolCallsCount}), 0)`.as(
            'total_tool_calls',
          ),
        })
        .from(runs)
        .where(and(...conditions))
        .all();

      const row = rows[0];
      if (!row) {
        return {
          totalRuns: 0,
          totalTokens: 0,
          totalCostUsd: '0',
          avgLatencyMs: 0,
          totalToolCalls: 0,
        };
      }
      return {
        totalRuns: Number(row.totalRuns),
        totalTokens: Number(row.totalPromptTokens) + Number(row.totalCompletionTokens),
        totalCostUsd: String(row.totalCostUsd),
        avgLatencyMs: Math.round(Number(row.avgLatencyMs)),
        totalToolCalls: Number(row.totalToolCalls),
      };
    },

    /**
     * Daily time-series aggregation for a company. Returns one row per
     * calendar day within the date range, ordered oldest-first.
     * `fromMs` and `toMs` are epoch millis.
     */
    dailyUsage(
      companyId: string,
      fromMs: number,
      toMs: number,
      kind?: TelemetryRunKind,
    ): DailyUsageRow[] {
      const conditions = withRunKindCondition(
        [
          sql`${runs.employeeId} IN (SELECT id FROM employees WHERE company_id = ${companyId})`,
          sql`${runs.status} IN ('success', 'error')`,
          gte(runs.startedAt, fromMs),
          lte(runs.startedAt, toMs),
        ],
        kind,
      );

      const rows = db
        .select({
          day: sql<string>`date(${runs.startedAt} / 1000, 'unixepoch')`.as('day'),
          totalRuns: sql<number>`count(*)`.as('total_runs'),
          promptTokens: sql<number>`coalesce(sum(${runs.promptTokens}), 0)`.as('prompt_tokens'),
          completionTokens: sql<number>`coalesce(sum(${runs.completionTokens}), 0)`.as(
            'completion_tokens',
          ),
          costUsd: sql<string>`coalesce(sum(cast(${runs.costUsd} as real)), 0)`.as('cost_usd'),
        })
        .from(runs)
        .where(and(...conditions))
        .groupBy(sql`day`)
        .orderBy(sql`day`)
        .all();

      return rows.map((r) => ({
        day: r.day,
        totalRuns: Number(r.totalRuns),
        promptTokens: Number(r.promptTokens),
        completionTokens: Number(r.completionTokens),
        totalTokens: Number(r.promptTokens) + Number(r.completionTokens),
        costUsd: String(r.costUsd),
      }));
    },

    /**
     * Per-employee breakdown for a company. Returns one row per employee
     * who has at least one completed run.
     */
    employeeStats(companyId: string, kind?: TelemetryRunKind): EmployeeStatsRow[] {
      const conditions = withRunKindCondition(
        [
          sql`${runs.employeeId} IN (SELECT id FROM employees WHERE company_id = ${companyId})`,
          sql`${runs.status} IN ('success', 'error')`,
        ],
        kind,
      );

      const rows = db
        .select({
          employeeId: runs.employeeId,
          totalRuns: sql<number>`count(*)`.as('total_runs'),
          promptTokens: sql<number>`coalesce(sum(${runs.promptTokens}), 0)`.as('prompt_tokens'),
          completionTokens: sql<number>`coalesce(sum(${runs.completionTokens}), 0)`.as(
            'completion_tokens',
          ),
          avgLatencyMs: sql<number>`coalesce(avg(${runs.latencyMs}), 0)`.as('avg_latency_ms'),
          costUsd: sql<string>`coalesce(sum(cast(${runs.costUsd} as real)), 0)`.as('cost_usd'),
          totalToolCalls: sql<number>`coalesce(sum(${runs.toolCallsCount}), 0)`.as(
            'total_tool_calls',
          ),
        })
        .from(runs)
        .where(and(...conditions))
        .groupBy(runs.employeeId)
        .orderBy(sql`total_runs DESC`)
        .all();

      return rows.map((r) => ({
        employeeId: r.employeeId,
        totalRuns: Number(r.totalRuns),
        totalTokens: Number(r.promptTokens) + Number(r.completionTokens),
        avgLatencyMs: Math.round(Number(r.avgLatencyMs)),
        costUsd: String(r.costUsd),
        totalToolCalls: Number(r.totalToolCalls),
      }));
    },

    /**
     * Cost breakdown by provider and model for a company. Supports optional
     * date range filter. Returns rows ordered by cost descending.
     */
    costBreakdown(
      companyId: string,
      fromMs?: number,
      toMs?: number,
      kind?: TelemetryRunKind,
    ): CostBreakdownRow[] {
      const conditions = [
        sql`${runs.employeeId} IN (SELECT id FROM employees WHERE company_id = ${companyId})`,
        sql`${runs.status} IN ('success', 'error')`,
      ];
      if (fromMs !== undefined) conditions.push(gte(runs.startedAt, fromMs));
      if (toMs !== undefined) conditions.push(lte(runs.startedAt, toMs));
      withRunKindCondition(conditions, kind);

      const rows = db
        .select({
          provider: runs.provider,
          model: runs.model,
          totalRuns: sql<number>`count(*)`.as('total_runs'),
          promptTokens: sql<number>`coalesce(sum(${runs.promptTokens}), 0)`.as('prompt_tokens'),
          completionTokens: sql<number>`coalesce(sum(${runs.completionTokens}), 0)`.as(
            'completion_tokens',
          ),
          costUsd: sql<string>`coalesce(sum(cast(${runs.costUsd} as real)), 0)`.as('cost_usd'),
        })
        .from(runs)
        .where(and(...conditions))
        .groupBy(runs.provider, runs.model)
        .orderBy(sql`cost_usd DESC`)
        .all();

      return rows.map((r) => ({
        provider: r.provider,
        model: r.model,
        totalRuns: Number(r.totalRuns),
        totalTokens: Number(r.promptTokens) + Number(r.completionTokens),
        costUsd: String(r.costUsd),
      }));
    },
  };
}

// ------------------------------------------------------------------
// Telemetry aggregate result types
// ------------------------------------------------------------------

export interface CompanyStats {
  totalRuns: number;
  totalTokens: number;
  totalCostUsd: string;
  avgLatencyMs: number;
  totalToolCalls: number;
}

export interface DailyUsageRow {
  day: string;
  totalRuns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: string;
}

export interface EmployeeStatsRow {
  employeeId: string;
  totalRuns: number;
  totalTokens: number;
  avgLatencyMs: number;
  costUsd: string;
  totalToolCalls: number;
}

export interface CostBreakdownRow {
  provider: string;
  model: string;
  totalRuns: number;
  totalTokens: number;
  costUsd: string;
}
