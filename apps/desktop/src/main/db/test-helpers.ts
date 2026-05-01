/**
 * Test helpers for the DB layer — in-memory SQLite built on sql.js.
 *
 * Why sql.js and not better-sqlite3:
 *
 * The better-sqlite3 native binding in this workspace is built against
 * Electron's ABI only (see Task 18 — we intentionally do NOT allowlist
 * better-sqlite3's Node-ABI install script, because both install scripts
 * target the same `build/Release/better_sqlite3.node` path and the second
 * writer wins). That means Vitest running under plain Node cannot
 * `require('better-sqlite3')` at all — it would fail with a
 * NODE_MODULE_VERSION mismatch.
 *
 * sql.js is a pure-JavaScript/WASM SQLite engine. Zero native bindings,
 * runs in any JS runtime, supports in-memory databases, and Drizzle ships
 * a first-class `drizzle-orm/sql-js` driver that reads the exact same
 * dialect-agnostic schema definitions from `schema.ts`. The drizzle-kit
 * migrations generated for better-sqlite3 also apply cleanly under sql.js
 * because they are plain SQLite DDL.
 *
 * Trade-off: sql.js ships with a recent but not bleeding-edge SQLite
 * version and runs slightly slower than native. Neither matters for repo
 * unit tests. Edge cases that depend on specific better-sqlite3 type
 * coercion or native-level behavior must be covered by integration tests
 * under `pnpm dev` instead (same pattern as the Task 18 smoke run).
 *
 * Repos that need to work across both drivers are typed over a generic
 * `BaseSQLiteDatabase<'sync', TRunResult, Schema>` so the same factory
 * function accepts `BetterSQLite3Database<Schema>` at runtime and
 * `SQLJsDatabase<Schema>` under tests.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type SQLJsDatabase, drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs, { type Database as RawSqlJsDatabase } from 'sql.js';

import * as schema from './schema.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(thisDir, 'migrations');

let _SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/**
 * Lazily initialize the sql.js WASM module once per test process. Subsequent
 * calls reuse the cached module and create new in-memory databases cheaply.
 *
 * Note: In production (bundled Electron), we need to tell sql.js where to
 * find its WASM file. The WASM file is copied to out/main/sql-wasm.wasm
 * during the build process.
 */
async function getSqlModule() {
  if (_SQL !== null) return _SQL;

  // Determine the correct WASM file path based on the environment
  _SQL = await initSqlJs({
    locateFile: (file) => {
      // In the bundled app, thisDir is out/main/db/, so we go up two levels to out/main/
      // The WASM file is copied directly to out/main/sql-wasm.wasm
      const bundledPath = join(thisDir, '..', '..', file);
      // In dev (unbundled), use node_modules path
      const nodeModulesPath = join(
        thisDir,
        '..',
        '..',
        '..',
        'node_modules',
        'sql.js',
        'dist',
        file,
      );

      // In production, the WASM file will be in the same directory as the bundled JS.
      // In Vitest/dev, use the package asset from node_modules.
      return existsSync(bundledPath) ? bundledPath : nodeModulesPath;
    },
  });
  return _SQL;
}

export interface TestDbHandle {
  db: SQLJsDatabase<typeof schema>;
  raw: RawSqlJsDatabase;
  close: () => void;
}

/**
 * Create a fresh in-memory SQLite database with every Team-X migration
 * applied, wrapped in the Drizzle sql-js driver. Each test should create
 * its own handle in `beforeEach` and close it in `afterEach`.
 */
export async function makeTestDb(): Promise<TestDbHandle> {
  const SQL = await getSqlModule();
  const raw = new SQL.Database();
  // Match the runtime pragmas from `createDb` that are meaningful under
  // sql.js. `journal_mode=WAL` and `synchronous=NORMAL` are no-ops in an
  // in-memory database, but `foreign_keys=ON` is essential — without it
  // FK-enforcement tests silently pass invalid inserts.
  raw.run('PRAGMA foreign_keys = ON');
  const db = drizzle(raw, { schema });
  migrate(db, { migrationsFolder });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}
