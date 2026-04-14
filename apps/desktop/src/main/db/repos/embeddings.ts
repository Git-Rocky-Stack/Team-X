/**
 * Embeddings repository — CRUD for the `embeddings` table.
 * Phase 5 — M28.
 */

import { count, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { embeddings } from '../schema.js';

export type EmbeddingRow = typeof embeddings.$inferSelect;
export type EmbeddingInsert = typeof embeddings.$inferInsert;

type EmbeddingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

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
      const result = db.delete(embeddings).where(eq(embeddings.sourceId, sourceId)).run();
      return result.changes;
    },

    listByCompany(companyId: string): EmbeddingRow[] {
      return db
        .select()
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .all();
    },

    countByCompany(companyId: string): number {
      const result = db
        .select({ value: count() })
        .from(embeddings)
        .where(eq(embeddings.companyId, companyId))
        .get();
      return result?.value ?? 0;
    },
  };
}

export type EmbeddingsRepo = ReturnType<typeof createEmbeddingsRepo>;
