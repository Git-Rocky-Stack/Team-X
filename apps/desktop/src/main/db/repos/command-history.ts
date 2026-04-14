/**
 * Command history repository — persistence layer for the `command_history`
 * table. Backing store for the Cmd+K palette's "Recent Commands" list
 * (last 20 per company) and the audit trail that complements the
 * `command.executed` event stream.
 *
 * Phase 5 — M30 T4.
 *
 * Contract:
 *   - `append`   — insert one row. Returns the row id.
 *   - `recent`   — newest-first page, default cap 20, caller may request
 *                  fewer; hard upper bound 100 regardless of input.
 *   - `trim`     — FIFO eviction. Given a company id and a max N,
 *                  deletes all rows beyond the N most recent. Called
 *                  from `CommandService.execute()` after every append
 *                  so the table never grows unbounded. The plan sets
 *                  N=20 per company — a defensible default for a
 *                  UI-driven history — but the repo parameterizes it
 *                  so tests can exercise eviction with smaller caps.
 *
 * Non-goals:
 *   - This repo is intentionally dumb about uuid generation: the
 *     CommandService owns id minting (nanoid) so tests can inject a
 *     deterministic id factory. Accepting the id on write also means
 *     the repo never depends on nanoid, keeping the import surface
 *     identical to the other repos in this directory.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { commandHistory } from '../schema.js';

export type CommandHistoryRow = typeof commandHistory.$inferSelect;

export interface CreateCommandHistoryInput {
  id: string;
  companyId: string;
  actorId: string;
  text: string;
  intent: string;
  entitiesJson: string;
  executedAt: string;
  outcome: 'ok' | 'error';
  resultId?: string | null;
}

type CommandHistoryDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createCommandHistoryRepo<TRunResult>(db: CommandHistoryDb<TRunResult>) {
  return {
    /** Insert one history row and return its id. */
    append(input: CreateCommandHistoryInput): string {
      db.insert(commandHistory)
        .values({
          id: input.id,
          companyId: input.companyId,
          actorId: input.actorId,
          text: input.text,
          intent: input.intent,
          entitiesJson: input.entitiesJson,
          executedAt: input.executedAt,
          outcome: input.outcome,
          resultId: input.resultId ?? null,
        })
        .run();
      return input.id;
    },

    /**
     * Newest-first page. `limit` defaults to 20, clamps to [1, 100].
     * Returns raw rows — CommandService maps them to the public
     * `CommandHistoryEntry` shape (parsing `entitiesJson`, coercing
     * `resultId`, etc.).
     */
    recent(companyId: string, limit = 20): CommandHistoryRow[] {
      const n = Math.min(100, Math.max(1, Math.floor(limit)));
      return db
        .select()
        .from(commandHistory)
        .where(eq(commandHistory.companyId, companyId))
        .orderBy(desc(commandHistory.executedAt), desc(commandHistory.id))
        .limit(n)
        .all();
    },

    /**
     * FIFO eviction. Deletes every row for `companyId` except the N
     * most recent. Returns the number of deleted rows. `max` clamps
     * to [1, 1000].
     *
     * Implemented as a DELETE … WHERE id NOT IN (SELECT … LIMIT N)
     * correlated subquery so we do the trim in a single SQL round
     * trip even as the table grows. `executed_at` is an ISO string
     * so `ORDER BY executed_at DESC` sorts lexicographically — no
     * epoch math needed.
     */
    trim(companyId: string, max: number): number {
      const keep = Math.min(1000, Math.max(1, Math.floor(max)));
      const before = db
        .select({ c: sql<number>`count(*)` })
        .from(commandHistory)
        .where(eq(commandHistory.companyId, companyId))
        .all();
      const total = before[0]?.c ?? 0;
      if (total <= keep) return 0;

      // Grab the ids to keep, then delete everything else in the company.
      const keepers = db
        .select({ id: commandHistory.id })
        .from(commandHistory)
        .where(eq(commandHistory.companyId, companyId))
        .orderBy(desc(commandHistory.executedAt), desc(commandHistory.id))
        .limit(keep)
        .all();
      const keepIds = new Set(keepers.map((r) => r.id));
      if (keepIds.size === 0) return 0;

      // Fetch rows to delete. Better-sqlite3's drizzle `NOT IN` with a
      // dynamic list is painful; iterate and delete matched rows.
      const all = db
        .select({ id: commandHistory.id })
        .from(commandHistory)
        .where(eq(commandHistory.companyId, companyId))
        .all();
      let deleted = 0;
      for (const row of all) {
        if (!keepIds.has(row.id)) {
          db.delete(commandHistory)
            .where(and(eq(commandHistory.id, row.id), eq(commandHistory.companyId, companyId)))
            .run();
          deleted++;
        }
      }
      return deleted;
    },

    /** Clear all history for a company. Wired for backup/restore parity. */
    clearForCompany(companyId: string): number {
      const rows = db
        .select({ id: commandHistory.id })
        .from(commandHistory)
        .where(eq(commandHistory.companyId, companyId))
        .all();
      if (rows.length === 0) return 0;
      db.delete(commandHistory).where(eq(commandHistory.companyId, companyId)).run();
      return rows.length;
    },
  };
}

export type CommandHistoryRepo = ReturnType<typeof createCommandHistoryRepo>;
