/**
 * Employees repository — factory-pattern CRUD for the `employees` table.
 *
 * Cross-driver generic typing: same rationale as `companies.ts`. The repo
 * accepts both `BetterSQLite3Database<Schema>` at runtime and
 * `SQLJsDatabase<Schema>` under tests, via a generic
 * `BaseSQLiteDatabase<'sync', TRunResult, Schema>` parameter.
 *
 * `tools_allowed_json` and `tools_denied_json` are stored as JSON text.
 * Callers pass/receive plain string arrays at the `create` boundary;
 * read methods return the raw row shape so consumers that only need
 * scalar fields (status, name, title) can avoid the parse cost.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { employees } from '../schema.js';

export type EmployeeRow = typeof employees.$inferSelect;

export interface CreateEmployeeInput {
  companyId: string;
  rolePackId: string;
  roleId: string;
  roleMdSha: string;
  level: string;
  name: string;
  title: string;
  status?: string;
  modelPref?: string;
  providerPref?: string;
  toolsAllowed?: string[];
  toolsDenied?: string[];
  avatar?: string;
}

type EmployeesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createEmployeesRepo<TRunResult>(db: EmployeesDb<TRunResult>) {
  return {
    /**
     * Insert a new employee linked to a company and return its id.
     * Throws if `companyId` does not reference an existing company
     * (enforced by the `PRAGMA foreign_keys = ON` pragma applied in
     * `createDb` / `makeTestDb`).
     */
    create(input: CreateEmployeeInput): string {
      const id = nanoid();
      db.insert(employees)
        .values({
          id,
          companyId: input.companyId,
          rolePackId: input.rolePackId,
          roleId: input.roleId,
          roleMdSha: input.roleMdSha,
          level: input.level,
          name: input.name,
          title: input.title,
          status: input.status ?? 'idle',
          modelPref: input.modelPref ?? null,
          providerPref: input.providerPref ?? null,
          toolsAllowedJson: JSON.stringify(input.toolsAllowed ?? []),
          toolsDeniedJson: JSON.stringify(input.toolsDenied ?? []),
          avatar: input.avatar ?? null,
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    /** Return the employee with a matching id, or null if none exists. */
    getById(id: string): EmployeeRow | null {
      const row = db.select().from(employees).where(eq(employees.id, id)).get();
      return row ?? null;
    },

    /** Return every employee belonging to a given company. */
    listByCompany(companyId: string): EmployeeRow[] {
      return db.select().from(employees).where(eq(employees.companyId, companyId)).all();
    },

    /**
     * Update the `status` field of a single employee. No-op when the id
     * does not exist — no error, no throw. Orchestrator call sites
     * should decide whether to validate presence beforehand via
     * `getById`.
     */
    updateStatus(id: string, status: string): void {
      db.update(employees).set({ status }).where(eq(employees.id, id)).run();
    },
  };
}
