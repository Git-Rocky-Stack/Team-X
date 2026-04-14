/**
 * sqlite-vec initializer — creates the `vec_embeddings` virtual table
 * for ANN (approximate nearest neighbor) vector search.
 *
 * sqlite-vec is a loadable extension. In production (better-sqlite3),
 * we attempt to load it. In test environments it may not be available,
 * so this function catches errors gracefully — same best-effort pattern
 * as FTS5 in `fts5-init.ts`.
 *
 * When sqlite-vec is unavailable, the RAG retriever falls back to
 * brute-force cosine similarity in TypeScript (slower but functional).
 *
 * Phase 5 — M28.
 */

import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from './client.js';

export function initVec<TRunResult>(
  db: BaseSQLiteDatabase<'sync', TRunResult, Schema>,
  dimension: number,
): boolean {
  try {
    db.run(
      sql.raw(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${dimension}]
      )
    `),
    );
    return true;
  } catch (err) {
    console.warn(
      '[vec] sqlite-vec extension not available, RAG retrieval will use brute-force fallback:',
      err,
    );
    return false;
  }
}
