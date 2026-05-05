/**
 * Embeddings repository — CRUD for the `embeddings` table with
 * sqlite-vec accelerated similarity search.
 *
 * Phase 5 — M28 (updated with sqlite-vec integration).
 */

import { count, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { embeddings } from '../schema.js';

export type EmbeddingRow = typeof embeddings.$inferSelect;
export type EmbeddingInsert = typeof embeddings.$inferInsert;

type EmbeddingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/**
 * Similarity search result with pre-computed distance score.
 * Note: sqlite-vec returns distance (lower is better), not similarity.
 * We convert to similarity (1 - distance) for consistency.
 */
export interface SimilarityHit {
  id: string;
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  contentText: string;
  similarity: number; // 0-1, higher is better
  distance: number; // Raw distance from sqlite-vec
}

export interface SimilaritySearchInput {
  companyId: string;
  queryVector: Float32Array; // Must be normalized, 1536 dimensions
  topK: number;
  threshold: number; // Minimum similarity (0-1)
  excludeSourceIds?: string[];
}

export function createEmbeddingsRepo<TRunResult>(db: EmbeddingsDb<TRunResult>) {
  return {
    upsert(input: EmbeddingInsert): string {
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
    },

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
     * Fast similarity search using sqlite-vec.
     *
     * This is O(log n) with HNSW indexing instead of O(n) brute force.
     * Returns results sorted by similarity (highest first).
     *
     * @param input - Search parameters including query vector
     * @returns Promise of similarity hits
     */
    async similaritySearch(input: SimilaritySearchInput): Promise<SimilarityHit[]> {
      const { companyId, queryVector, topK, threshold, excludeSourceIds = [] } = input;

      // Validate query vector dimensions
      if (queryVector.length !== 1536) {
        throw new Error(`Query vector must be 1536 dimensions, got ${queryVector.length}`);
      }

      // Build exclusion clause
      const excludeClause = excludeSourceIds.length > 0
        ? sql`AND e.source_id NOT IN ${sql.join(excludeSourceIds.map(id => sql`${id}`), sql`, `)}`
        : sql``;

      // Convert threshold from similarity to distance
      // sqlite-vec uses Euclidean distance: distance = sqrt(2 * (1 - similarity))
      // For normalized vectors, we can use the simpler approximation
      const maxDistance = Math.sqrt(2 * (1 - threshold));

      // Perform similarity search using sqlite-vec
      // The vec0 extension provides the distance() function
      const results = db
        .all(
          sql`
            SELECT
              e.id,
              e.source_id,
              e.source_type,
              e.chunk_index,
              e.content_text,
              v.distance
            FROM embeddings e
            INNER JOIN embeddings_vec v ON e.rowid = v.rowid
            WHERE e.company_id = ${companyId}
              ${excludeClause}
              AND v.distance <= ${maxDistance}
            ORDER BY v.distance ASC
            LIMIT ${topK}
          `
        ) as Array<{
          id: string;
          source_id: string;
          source_type: string;
          chunk_index: number;
          content_text: string;
          distance: number;
        }>;

      // Convert distance to similarity (0-1, higher is better)
      return results.map((row) => {
        const similarity = 1 - (row.distance * row.distance) / 2;
        return {
          id: row.id,
          sourceId: row.source_id,
          sourceType: row.source_type,
          chunkIndex: row.chunk_index,
          contentText: row.content_text,
          similarity: Math.max(0, Math.min(1, similarity)),
          distance: row.distance,
        };
      });
    },

    /**
     * Batch insert embeddings with automatic vec table population.
     * More efficient than individual upserts for bulk operations.
     *
     * @param inputs - Array of embedding records to insert
     * @returns Array of inserted IDs
     */
    batchUpsert(inputs: EmbeddingInsert[]): string[] {
      if (inputs.length === 0) return [];

      const ids: string[] = [];
      for (const input of inputs) {
        ids.push(this.upsert(input));
      }
      return ids;
    },

    /**
     * Populate the vec table with existing embeddings.
     * Use this after migration 0022 to index existing data.
     *
     * @returns Number of embeddings indexed
     */
    populateVecTable(companyId?: string): number {
      let query = sql`INSERT OR IGNORE INTO embeddings_vec (rowid, embedding_float) SELECT rowid, embedding FROM embeddings`;

      if (companyId) {
        query = sql`${query} WHERE company_id = ${companyId}`;
      }

      const result = db.run(query) as unknown as { changes: number };
      return result.changes;
    },

    /**
     * Get statistics about the embeddings table for monitoring.
     */
    getStats(companyId?: string): {
      totalEmbeddings: number;
      totalChunks: number;
      bySourceType: Record<string, number>;
      avgChunksPerSource: number;
    } {
      const whereClause = companyId
        ? sql`WHERE company_id = ${companyId}`
        : sql``;

      const total = (db
        .select({ value: count() })
        .from(embeddings)
        .where(companyId ? eq(embeddings.companyId, companyId) : undefined)
        .get()?.value ?? 0) as number;

      const byType = db
        .all(
          sql`
            SELECT source_type, COUNT(*) as count
            FROM embeddings
            ${whereClause}
            GROUP BY source_type
          `
        ) as Array<{ source_type: string; count: number }>;

      const bySourceType: Record<string, number> = {};
      for (const row of byType) {
        bySourceType[row.source_type] = row.count;
      }

      const uniqueSources = companyId
        ? (db
            .select({ value: count() })
            .from(embeddings)
            .where(eq(embeddings.companyId, companyId))
            .get()?.value ?? 1) as number
        : 1;

      return {
        totalEmbeddings: total,
        totalChunks: total,
        bySourceType: bySourceType,
        avgChunksPerSource: total / uniqueSources,
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

    /**
     * Find potential duplicate embeddings using similarity threshold.
     * Useful for data quality analysis.
     */
    findDuplicates(companyId: string, threshold: number = 0.98): Array<{
      id1: string;
      id2: string;
      sourceId1: string;
      sourceId2: string;
      similarity: number;
    }> {
      // This is a self-join using vec distance to find near-duplicates
      const results = db
        .all(
          sql`
            SELECT
              e1.id AS id1,
              e2.id AS id2,
              e1.source_id AS source_id1,
              e2.source_id AS source_id2,
              (1 - (POWER(v1.distance, 2) / 2)) AS similarity
            FROM embeddings e1
            INNER JOIN embeddings_vec v1 ON e1.rowid = v1.rowid
            INNER JOIN embeddings e2 ON e1.company_id = e2.company_id
            INNER JOIN embeddings_vec v2 ON e2.rowid = v2.rowid
            WHERE e1.company_id = ${companyId}
              AND e1.rowid < e2.rowid
              AND v1.distance <= ${Math.sqrt(2 * (1 - threshold))}
            ORDER BY similarity DESC
            LIMIT 100
          `
        ) as Array<{
          id1: string;
          id2: string;
          source_id1: string;
          source_id2: string;
          similarity: number;
        }>;

      return results.map((r) => ({
        id1: r.id1,
        id2: r.id2,
        sourceId1: r.source_id1,
        sourceId2: r.source_id2,
        similarity: Math.max(0, Math.min(1, r.similarity)),
      }));
    },
  };
}

export type EmbeddingsRepo = ReturnType<typeof createEmbeddingsRepo>;
