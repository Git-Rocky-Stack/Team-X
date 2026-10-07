/**
 * Embeddings repository — CRUD for the `embeddings` table.
 *
 * Ranking is NOT done here. Callers read rows via `listByCompany` and rank
 * them with brute-force cosine similarity in
 * `packages/intelligence/src/rag/retriever.ts`.
 *
 * This repo previously carried `similaritySearch`, `populateVecTable` and
 * `findDuplicates`, all of which queried an `embeddings_vec` sqlite-vec
 * virtual table. That table never existed at runtime: its migration
 * (`0022_sqlite_vec_integration.sql`) was never listed in
 * `migrations/meta/_journal.json`, so drizzle never applied it; it collided
 * on index 0022 with `0022_long_run_resume_origin`; it INSERTed into a
 * `migration_metadata` table that is defined nowhere; and the `sqlite-vec`
 * extension was never loaded (`client.ts` sets three pragmas and nothing
 * else). Every call therefore threw `no such table: embeddings_vec` and was
 * swallowed by the brute-force fallback in `rag/service.ts`. The dead
 * methods, the dead migration and the dead dependency were removed rather
 * than left standing as an unearned performance claim.
 *
 * Phase 5 — M28.
 */

import { count, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { embeddings } from '../schema.js';

export type EmbeddingRow = typeof embeddings.$inferSelect;
export type EmbeddingInsert = typeof embeddings.$inferInsert;

type EmbeddingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createEmbeddingsRepo<TRunResult>(db: EmbeddingsDb<TRunResult>) {
  // Declared as a closure rather than reached through `this` inside the
  // returned literal: callers routinely destructure this repo (and the
  // `RagRepo` structural interface in rag/service.ts takes the methods by
  // reference), which would leave `this` undefined at call time.
  function upsertOne(input: EmbeddingInsert): string {
    db.insert(embeddings)
      .values(input)
      .onConflictDoUpdate({
        target: [embeddings.sourceId, embeddings.chunkIndex],
        set: {
          contentText: input.contentText,
          embedding: input.embedding,
          createdAt: input.createdAt,
        },
      })
      .run();
    return input.id;
  }

  return {
    upsert: upsertOne,

    getById(id: string): EmbeddingRow | null {
      return db.select().from(embeddings).where(eq(embeddings.id, id)).get() ?? null;
    },

    listBySource(sourceId: string): EmbeddingRow[] {
      return db
        .select()
        .from(embeddings)
        .where(eq(embeddings.sourceId, sourceId))
        .orderBy(embeddings.chunkIndex)
        .all();
    },

    deleteBySource(sourceId: string): number {
      // Count-then-delete: drizzle-orm's `.run()` return shape differs across
      // drivers (better-sqlite3 returns `{ changes }`, sql-js returns void).
      // Count first so the caller gets a consistent number on both runtimes.
      const before = (db
        .select({ value: count() })
        .from(embeddings)
        .where(eq(embeddings.sourceId, sourceId))
        .get()?.value ?? 0) as number;
      db.delete(embeddings).where(eq(embeddings.sourceId, sourceId)).run();
      return before;
    },

    listByCompany(companyId: string): EmbeddingRow[] {
      return db.select().from(embeddings).where(eq(embeddings.companyId, companyId)).all();
    },

    countByCompany(companyId: string): number {
      const result = db
        .select({ value: count() })
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .get();
      return result?.value ?? 0;
    },

    /**
     * Upsert many rows in one call. This is a convenience loop over
     * `upsert`, not a batched statement — it saves the caller a loop, not
     * round trips.
     *
     * @param inputs - Array of embedding records to insert
     * @returns Array of inserted IDs
     */
    batchUpsert(inputs: EmbeddingInsert[]): string[] {
      return inputs.map(upsertOne);
    },

    /**
     * Get statistics about the embeddings table for monitoring.
     *
     * One row is one chunk, so `totalEmbeddings` and `totalChunks` are the
     * same number by construction; both are kept because callers read them
     * under both names. `avgChunksPerSource` divides that total by the count
     * of DISTINCT `source_id` values — previously it divided by the row count
     * itself, which made the average identically 1.0 whenever a companyId was
     * passed and identically `total` when one was not.
     */
    getStats(companyId?: string): {
      totalEmbeddings: number;
      totalChunks: number;
      bySourceType: Record<string, number>;
      avgChunksPerSource: number;
    } {
      const whereClause = companyId ? sql`WHERE company_id = ${companyId}` : sql``;

      const total = (db
        .select({ value: count() })
        .from(embeddings)
        .where(companyId ? eq(embeddings.companyId, companyId) : undefined)
        .get()?.value ?? 0) as number;

      const byType = db.all(
        sql`
            SELECT source_type, COUNT(*) as count
            FROM embeddings
            ${whereClause}
            GROUP BY source_type
          `,
      ) as Array<{ source_type: string; count: number }>;

      const bySourceType: Record<string, number> = {};
      for (const row of byType) {
        bySourceType[row.source_type] = row.count;
      }

      const distinct = db.get(
        sql`SELECT COUNT(DISTINCT source_id) AS value FROM embeddings ${whereClause}`,
      ) as { value: number } | undefined;
      const uniqueSources = distinct?.value ?? 0;

      return {
        totalEmbeddings: total,
        totalChunks: total,
        bySourceType: bySourceType,
        avgChunksPerSource: uniqueSources > 0 ? total / uniqueSources : 0,
      };
    },

    /**
     * Delete all embeddings for a company.
     * Use with caution - this is not recoverable without backups.
     */
    deleteByCompany(companyId: string): number {
      const before = (db
        .select({ value: count() })
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .get()?.value ?? 0) as number;
      db.delete(embeddings).where(eq(embeddings.companyId, companyId)).run();
      return before;
    },
  };
}

export type EmbeddingsRepo = ReturnType<typeof createEmbeddingsRepo>;
