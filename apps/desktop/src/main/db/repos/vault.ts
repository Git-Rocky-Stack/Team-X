/**
 * File vault repository — factory-pattern CRUD for the `file_vault` table
 * with FTS5 full-text search via raw SQL.
 *
 * Same cross-driver generic typing as other repos: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * FTS5 notes:
 *   The `file_vault_fts` virtual table is maintained by triggers in the
 *   migration SQL. Search queries hit FTS5 directly via `db.run(sql`...`)`.
 *   Drizzle doesn't model FTS5 tables, so we use raw SQL for search ops.
 */

import { desc, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { fileVault } from '../schema.js';

export type FileVaultRow = typeof fileVault.$inferSelect;

export interface CreateFileVaultInput {
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  vaultPath: string;
  extractedText?: string | null;
  tagsJson?: string;
  uploadedBy: string;
}

export interface UpdateFileVaultInput {
  originalName?: string;
  tagsJson?: string;
  extractedText?: string | null;
}

export interface VaultSearchResult {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rank: number;
}

type VaultDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createVaultRepo<TRunResult>(db: VaultDb<TRunResult>) {
  return {
    /**
     * Insert a new file vault entry and return its id.
     */
    create(input: CreateFileVaultInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(fileVault)
        .values({
          id,
          companyId: input.companyId,
          filename: input.filename,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256,
          vaultPath: input.vaultPath,
          extractedText: input.extractedText ?? null,
          tagsJson: input.tagsJson ?? '[]',
          uploadedBy: input.uploadedBy,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    /** Return the file with the matching id, or null. */
    getById(id: string): FileVaultRow | null {
      const row = db.select().from(fileVault).where(eq(fileVault.id, id)).get();
      return row ?? null;
    },

    /** Return every file for a company, newest first. */
    listByCompany(companyId: string): FileVaultRow[] {
      return db
        .select()
        .from(fileVault)
        .where(eq(fileVault.companyId, companyId))
        .orderBy(desc(fileVault.createdAt), desc(sql`rowid`))
        .all();
    },

    /** Return files for a company filtered by mime type prefix (e.g. 'image/'). */
    listByMimePrefix(companyId: string, prefix: string): FileVaultRow[] {
      return db
        .select()
        .from(fileVault)
        .where(eq(fileVault.companyId, companyId))
        .all()
        .filter((r) => r.mimeType.startsWith(prefix));
    },

    /** Update mutable fields on a vault entry. */
    update(id: string, input: UpdateFileVaultInput): void {
      const sets: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.originalName !== undefined) sets.originalName = input.originalName;
      if (input.tagsJson !== undefined) sets.tagsJson = input.tagsJson;
      if (input.extractedText !== undefined) sets.extractedText = input.extractedText;
      db.update(fileVault).set(sets).where(eq(fileVault.id, id)).run();
    },

    /** Delete a vault entry by id. Caller must also remove the file from disk. */
    delete(id: string): void {
      db.delete(fileVault).where(eq(fileVault.id, id)).run();
    },

    /**
     * Full-text search via FTS5. Returns matching file ids with rank score.
     * The FTS5 table is synced via triggers; we join back to file_vault
     * for the full row data.
     *
     * Note: FTS5 queries use raw SQL because Drizzle doesn't model virtual tables.
     * Under sql-js (tests), FTS5 is not available — the caller should handle
     * the error gracefully or skip FTS in test mode.
     */
    search(companyId: string, query: string): VaultSearchResult[] {
      try {
        const stmt = sql`
          SELECT fv.id, fv.original_name, fv.mime_type, fv.size_bytes, fts.rank
          FROM file_vault_fts fts
          JOIN file_vault fv ON fv.rowid = fts.rowid
          WHERE file_vault_fts MATCH ${query}
            AND fv.company_id = ${companyId}
          ORDER BY fts.rank
          LIMIT 50
        `;
        const rows = db.all<{
          id: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          rank: number;
        }>(stmt);
        return rows.map((r) => ({
          id: r.id,
          originalName: r.original_name,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          rank: r.rank,
        }));
      } catch {
        // FTS5 not available (e.g. sql-js in tests) — fall back to LIKE
        return db
          .select({
            id: fileVault.id,
            originalName: fileVault.originalName,
            mimeType: fileVault.mimeType,
            sizeBytes: fileVault.sizeBytes,
          })
          .from(fileVault)
          .where(eq(fileVault.companyId, companyId))
          .all()
          .filter((r) => r.originalName.toLowerCase().includes(query.toLowerCase()) || false)
          .map((r) => ({ ...r, rank: 0 }));
      }
    },

    /** Count total files for a company. */
    count(companyId: string): number {
      const rows = db.select().from(fileVault).where(eq(fileVault.companyId, companyId)).all();
      return rows.length;
    },

    /** Get total size in bytes for a company. */
    totalSize(companyId: string): number {
      const rows = db
        .select({ sizeBytes: fileVault.sizeBytes })
        .from(fileVault)
        .where(eq(fileVault.companyId, companyId))
        .all();
      return rows.reduce((sum, r) => sum + r.sizeBytes, 0);
    },
  };
}
