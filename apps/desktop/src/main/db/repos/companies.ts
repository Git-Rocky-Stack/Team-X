/**
 * Companies repository — factory-pattern CRUD for the `companies` table.
 *
 * The repo is typed over a generic `BaseSQLiteDatabase<'sync', TRunResult, Schema>`
 * so the same factory accepts both:
 *
 *   - `BetterSQLite3Database<Schema>` returned by `getDb()` at runtime, and
 *   - `SQLJsDatabase<Schema>` returned by `makeTestDb()` under Vitest.
 *
 * This lets us unit-test the repo with real SQL against an in-memory sql.js
 * database without having to load the Electron-ABI better-sqlite3 binding.
 * See `test-helpers.ts` for the rationale.
 *
 * Settings are serialized to a JSON text column. Callers pass/receive
 * plain objects at the repo boundary for `create`, but all read methods
 * return the raw row shape so consumers can parse `settingsJson` lazily
 * and decide their own schema validation strategy. Stricter typed
 * accessors land in later tasks alongside the first consumers.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { companies } from '../schema.js';

export type CompanyRow = typeof companies.$inferSelect;

export interface CreateCompanyInput {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  icon?: string;
  theme?: string;
}

type CompaniesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createCompaniesRepo<TRunResult>(db: CompaniesDb<TRunResult>) {
  return {
    /**
     * Insert a new company and return its generated id. Throws if the
     * slug violates the unique-index constraint.
     */
    create(input: CreateCompanyInput): string {
      const id = nanoid();
      db.insert(companies)
        .values({
          id,
          name: input.name,
          slug: input.slug,
          createdAt: Date.now(),
          settingsJson: JSON.stringify(input.settings ?? {}),
          icon: input.icon ?? null,
          theme: input.theme ?? 'dark',
        })
        .run();
      return id;
    },

    /** Return the company with a matching id, or null if none exists. */
    getById(id: string): CompanyRow | null {
      const row = db.select().from(companies).where(eq(companies.id, id)).get();
      return row ?? null;
    },

    /** Return the company with a matching slug, or null if none exists. */
    getBySlug(slug: string): CompanyRow | null {
      const row = db.select().from(companies).where(eq(companies.slug, slug)).get();
      return row ?? null;
    },

    /** Return every company row. Phase 1 is small enough that pagination is not needed. */
    list(): CompanyRow[] {
      return db.select().from(companies).all();
    },
  };
}
