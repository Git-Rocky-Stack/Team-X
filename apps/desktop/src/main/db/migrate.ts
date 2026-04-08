/**
 * Thin wrapper around Drizzle's better-sqlite3 migrator. Kept as its own
 * module so main/index.ts can call it without importing the migrator at
 * the top level (which pulls in better-sqlite3 eagerly), and so unit tests
 * can mock the migrator while testing the call-through contract.
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { TeamXDb } from './client.js';

/**
 * Apply all pending migrations to the given database. The migrations
 * folder must contain drizzle-kit output — a `meta/_journal.json` plus
 * `NNNN_*.sql` files. The caller is responsible for resolving the folder
 * path; in dev the path is relative to the compiled main-process bundle,
 * in production it will resolve to an electron-builder extraResource
 * (landing in Task 49).
 */
export function runMigrations(db: TeamXDb, migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}
