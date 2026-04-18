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

import { and, eq } from 'drizzle-orm';
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
  /**
   * Framework-internal pseudo-employee flag. Defaults to `false`. The only
   * production caller that passes `true` is `ensureSystemAgent` — the hire
   * IPC handler rejects any request with `isSystem: true` before reaching
   * this layer.
   */
  isSystem?: boolean;
}

/**
 * Input for the `promote` repo method (Phase 5.6 M-C step d — restores
 * Cluster B per audit row 2.19). The handler resolves the new role spec
 * via the role-loader and projects the relevant fields onto this shape;
 * the repo stays pure SQL and does not import the role-loader.
 *
 * `name` is intentionally absent — promotes are role changes, not rename
 * operations. Callers that want to rename in the same UI flow issue a
 * follow-up `employees.update` (a future channel) or call the repo's
 * forthcoming `rename` method directly.
 *
 * `tools_allowed_json` / `tools_denied_json` are stored as JSON text;
 * the repo serializes the supplied string arrays the same way `create`
 * does, keeping the column-shape contract identical between hire and
 * promote.
 */
export interface PromoteEmployeeInput {
  /** The employee row id to mutate. Caller validates the row exists + is non-system before invoking. */
  employeeId: string;
  /** The role id from the role-pack catalog the employee is promoted into. */
  roleId: string;
  /** The level frontmatter value of the new role (e.g., 'management'). */
  level: string;
  /** The role-pack `name` frontmatter value, used as the employee's display title. */
  title: string;
  /** SHA-256 of the new role.md file contents (rotates on every role-pack edit). */
  roleMdSha: string;
  /** Tool-id allowlist from the new role's frontmatter. Persisted as JSON. */
  toolsAllowed: string[];
  /** Tool-id blocklist from the new role's frontmatter. Persisted as JSON. */
  toolsDenied: string[];
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
          isSystem: input.isSystem ?? false,
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

    /**
     * Return every employee belonging to a given company — system employees
     * included. Callers that should NOT surface system employees (the
     * `employees.list` IPC handler, org-chart builder, NLU entity resolver)
     * must use `listVisibleByCompany` instead.
     */
    listByCompany(companyId: string): EmployeeRow[] {
      return db.select().from(employees).where(eq(employees.companyId, companyId)).all();
    },

    /**
     * Return every non-system employee belonging to a given company. This is
     * the correct surface for anything user-facing — the hire dialog, org
     * chart, delegation pickers, entity resolver. System pseudo-employees
     * (e.g., the agentic-loop `system-agent`) are filtered out by the
     * `is_system = 0` predicate, backed by the partial index added in
     * migration 0010.
     */
    listVisibleByCompany(companyId: string): EmployeeRow[] {
      return db
        .select()
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.isSystem, false)))
        .all();
    },

    /**
     * Return the system employee for a company and roleId, or null if none
     * has been seeded yet. The `ensureSystemAgent` bootstrap calls this
     * before inserting, giving the per-company-per-role-id idempotency
     * guarantee without requiring a unique SQL constraint (which would
     * also need a migration on this mutable table).
     */
    findSystemByRoleId(companyId: string, roleId: string): EmployeeRow | null {
      const row = db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.companyId, companyId),
            eq(employees.roleId, roleId),
            eq(employees.isSystem, true),
          ),
        )
        .get();
      return row ?? null;
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

    /**
     * Promote (or laterally re-role) an employee — atomic UPDATE that
     * swaps the role-bound columns in place: `roleId`, `level`, `title`,
     * `roleMdSha`, `toolsAllowedJson`, `toolsDeniedJson`. Phase 5.6 M-C
     * step d — restores Cluster B per audit row 2.19.
     *
     * Pure SQL — does NOT touch the org-edges table. If the level change
     * implies a different reporting line, the IPC handler issues a
     * follow-up `employees.setManager` call (or the renderer surfaces
     * the request via the manager-picker UI).
     *
     * No-op when the id does not exist — no error, no throw — to mirror
     * `updateStatus`. The IPC-layer caller is expected to `getById`
     * first and surface a 404-style error before reaching this layer.
     * The companion `promote` IPC handler (M-C step d) does exactly that.
     */
    promote(input: PromoteEmployeeInput): void {
      db.update(employees)
        .set({
          roleId: input.roleId,
          level: input.level,
          title: input.title,
          roleMdSha: input.roleMdSha,
          toolsAllowedJson: JSON.stringify(input.toolsAllowed),
          toolsDeniedJson: JSON.stringify(input.toolsDenied),
        })
        .where(eq(employees.id, input.employeeId))
        .run();
    },

    /**
     * Permanently delete an employee row (the "fire" operation).
     * No-op when the id does not exist.
     *
     * Note: the schema has FK references from `tickets.assignee_id`
     * and `projects.lead_id` into `employees.id`, both nullable.
     * Callers that fire an employee with live assignments must first
     * null out those FKs — the palette / CommandService path fires
     * only freshly-hired employees in the M30 spec, so in practice
     * this delete is always FK-clean. Surfaced as `delete` rather
     * than a soft-delete to keep the repo surface symmetric with
     * `create` and to mirror the UX semantics: fire removes them
     * from every list, not merely flips an archive flag.
     */
    delete(id: string): void {
      db.delete(employees).where(eq(employees.id, id)).run();
    },
  };
}
