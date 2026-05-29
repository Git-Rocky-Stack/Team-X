/**
 * Local model watch-folders repository — folder sources scanned for GGUF
 * files (v3.3.0 local GGUF support, spec § 7). Paths are stored verbatim,
 * including UNC (\\\\NAS\\share) and mapped-drive paths.
 */

import { asc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { WatchFolder, WatchFolderStatus } from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { localModelWatchFolders } from '../schema.js';

export interface InsertWatchFolderInput {
  path: string;
  recursive?: boolean;
}

type WatchFoldersDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function mapRow(row: typeof localModelWatchFolders.$inferSelect): WatchFolder {
  return { ...row, status: row.status as WatchFolderStatus };
}

export function createLocalModelWatchFoldersRepo<TRunResult>(db: WatchFoldersDb<TRunResult>) {
  function getById(id: string): WatchFolder | null {
    const row = db
      .select()
      .from(localModelWatchFolders)
      .where(eq(localModelWatchFolders.id, id))
      .get();
    return row ? mapRow(row) : null;
  }

  function readBack(id: string): WatchFolder {
    const row = getById(id);
    if (!row) throw new Error(`local_model_watch_folders row ${id} not found after write`);
    return row;
  }

  return {
    /** Insert a watched folder (recursive defaults to true) and return it. */
    insert(input: InsertWatchFolderInput): WatchFolder {
      const id = nanoid();
      const now = Date.now();
      db.insert(localModelWatchFolders)
        .values({
          id,
          path: input.path,
          recursive: input.recursive ?? true,
          status: 'unknown',
          lastScanAt: null,
          lastScanError: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return readBack(id);
    },

    /** Return the watched folder with a matching id, or null if none exists. */
    getById,

    /** Every watched folder, oldest first (stable ordering for the UI list). */
    list(): WatchFolder[] {
      return db
        .select()
        .from(localModelWatchFolders)
        .orderBy(asc(localModelWatchFolders.createdAt))
        .all()
        .map(mapRow);
    },

    /** Record a scan result; stamps last_scan_at = now. */
    updateStatus(
      id: string,
      status: WatchFolderStatus,
      lastScanError: string | null,
    ): WatchFolder {
      const now = Date.now();
      db.update(localModelWatchFolders)
        .set({ status, lastScanAt: now, lastScanError, updatedAt: now })
        .where(eq(localModelWatchFolders.id, id))
        .run();
      return readBack(id);
    },

    /** Flip the recursive-scan flag. */
    updateRecursive(id: string, recursive: boolean): WatchFolder {
      db.update(localModelWatchFolders)
        .set({ recursive, updatedAt: Date.now() })
        .where(eq(localModelWatchFolders.id, id))
        .run();
      return readBack(id);
    },

    /** Hard-delete a watched folder. No-op on unknown id. */
    remove(id: string): void {
      db.delete(localModelWatchFolders).where(eq(localModelWatchFolders.id, id)).run();
    },
  };
}

export type LocalModelWatchFoldersRepo = ReturnType<typeof createLocalModelWatchFoldersRepo>;
