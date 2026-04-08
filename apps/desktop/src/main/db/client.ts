/**
 * SQLite / Drizzle client for the Team-X main process.
 *
 * Two layers:
 *
 * 1. `createDb(path)` — a pure factory that opens a better-sqlite3 connection,
 *    applies the three pragmas every Team-X database needs
 *    (journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL), wraps the
 *    connection with Drizzle, and returns a { db, raw } handle. This layer
 *    has no side effects on module state and no dependency on Electron,
 *    which is what makes it unit-testable.
 *
 * 2. `initDb / getDb / closeDb` — a thin singleton state machine layered on
 *    top of `createDb`. The main process calls `initDb(dbPath())` once inside
 *    `app.whenReady()`, and every other main-process module accesses the db
 *    via `getDb()`. `closeDb()` is called on `app.will-quit`.
 *
 * Why explicit init: lazy singletons that self-open on first access hide
 * electron-dependent side effects behind a pure-looking call, making them
 * impossible to unit-test without mocking both the electron module and fs.
 * An explicit `initDb` keeps the electron wiring in one place (main/index.ts)
 * and lets tests drive the client with `:memory:` directly.
 *
 * Pragmas chosen:
 * - journal_mode=WAL: concurrent reads while a writer is active. Critical
 *   for the live cockpit which streams events from multiple workers.
 * - foreign_keys=ON: enforces the FK constraints declared in schema.ts.
 *   SQLite defaults to OFF for historical reasons.
 * - synchronous=NORMAL: durability on transaction commit but not every
 *   write. Safe under WAL and substantially faster than FULL.
 */

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export type Schema = typeof schema;
export type TeamXDb = BetterSQLite3Database<Schema>;

export interface DbHandle {
  db: TeamXDb;
  raw: Database.Database;
}

/**
 * Pure factory: opens a database at `path`, applies the standard pragmas,
 * and returns a { db, raw } handle. Callers own the lifecycle.
 */
export function createDb(path: string): DbHandle {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('synchronous = NORMAL');
  const db = drizzle(raw, { schema });
  return { db, raw };
}

let _handle: DbHandle | null = null;

/**
 * Initialize the process-wide singleton. Must be called exactly once,
 * from `main/index.ts` inside `app.whenReady()`. Subsequent callers
 * read the singleton via `getDb()`.
 */
export function initDb(path: string): DbHandle {
  if (_handle !== null) {
    throw new Error('DB already initialized — call closeDb() before re-initializing');
  }
  _handle = createDb(path);
  return _handle;
}

/**
 * Return the singleton drizzle db. Throws if `initDb` has not been called.
 * Callers that need the raw connection should import `createDb` or hold on
 * to the handle returned by `initDb`.
 */
export function getDb(): TeamXDb {
  if (_handle === null) {
    throw new Error('DB not initialized — call initDb(path) first');
  }
  return _handle.db;
}

/**
 * Close the underlying connection and reset the singleton. Safe to call
 * before `initDb` — in that case it is a no-op. Idempotent.
 */
export function closeDb(): void {
  if (_handle === null) return;
  _handle.raw.close();
  _handle = null;
}

export { schema };
