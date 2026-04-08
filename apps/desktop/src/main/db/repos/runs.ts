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

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { runs } from '../schema.js';

export type RunRow = typeof runs.$inferSelect;

export type RunStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface StartRunInput {
  employeeId: string;
  provider: string;
  model: string;
  threadId?: string;
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

type RunsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

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

    /** Return every run row for a given employee. Phase 1 does not paginate. */
    listByEmployee(employeeId: string): RunRow[] {
      return db.select().from(runs).where(eq(runs.employeeId, employeeId)).all();
    },
  };
}
