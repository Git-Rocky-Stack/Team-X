/**
 * FTS5 initializer — creates the file_vault_fts virtual table and its
 * content-sync triggers. Runs best-effort after migrations.
 *
 * FTS5 is a compile-time extension in SQLite. The production runtime
 * (better-sqlite3) includes it; the test runtime (sql-js via drizzle)
 * does not. This function catches the "no such module: fts5" error
 * gracefully so tests can run with the base file_vault table only.
 *
 * The vault repo's `search` method falls back to LIKE-based filtering
 * when FTS5 is unavailable.
 */

import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from './client.js';

export function initFts5<TRunResult>(db: BaseSQLiteDatabase<'sync', TRunResult, Schema>): boolean {
  try {
    db.run(sql`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_vault_fts USING fts5(
        original_name,
        extracted_text,
        tags_json,
        content='file_vault',
        content_rowid='rowid'
      )
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS file_vault_fts_insert AFTER INSERT ON file_vault BEGIN
        INSERT INTO file_vault_fts(rowid, original_name, extracted_text, tags_json)
        VALUES (new.rowid, new.original_name, new.extracted_text, new.tags_json);
      END
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS file_vault_fts_delete AFTER DELETE ON file_vault BEGIN
        INSERT INTO file_vault_fts(file_vault_fts, rowid, original_name, extracted_text, tags_json)
        VALUES ('delete', old.rowid, old.original_name, old.extracted_text, old.tags_json);
      END
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS file_vault_fts_update AFTER UPDATE ON file_vault BEGIN
        INSERT INTO file_vault_fts(file_vault_fts, rowid, original_name, extracted_text, tags_json)
        VALUES ('delete', old.rowid, old.original_name, old.extracted_text, old.tags_json);
        INSERT INTO file_vault_fts(rowid, original_name, extracted_text, tags_json)
        VALUES (new.rowid, new.original_name, new.extracted_text, new.tags_json);
      END
    `);

    return true;
  } catch (err) {
    // FTS5 not available (sql-js in tests) — vault search falls back to LIKE
    console.warn('[fts5] FTS5 extension not available, vault search will use fallback:', err);
    return false;
  }
}
