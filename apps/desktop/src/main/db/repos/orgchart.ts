/**
 * Org-edges repository — factory-pattern CRUD for the `org_edges`
 * table plus a `wouldCycle` guard that prevents the caller from
 * introducing directed cycles into the reporting graph.
 *
 * Shipped under Phase 5.6 M-C step (c) to restore the Cluster B
 * (M9 org chart) backend surface per audit rows 2.16 / 2.21. The
 * `org_edges` table itself was restored by step (a) (migration 0013);
 * this repo is the SQL-facing surface that `orgchart.get` IPC +
 * `employees.setManager` IPC (shipping in step d) call into.
 *
 * Design notes:
 *
 * - Single-manager-per-report is enforced at the SQL layer by the
 *   UNIQUE constraint on `report_id`. `setManager` therefore has
 *   upsert semantics: if an edge already exists for the given
 *   reportId, update its managerId in place; otherwise insert a
 *   new row.
 *
 * - Cycle detection runs BEFORE every write. `wouldCycle` walks
 *   up the manager chain starting from the proposed new manager
 *   and returns true if it ever lands on the reportId (directed
 *   cycle) OR revisits any node (defense against pre-existing
 *   data corruption). The SQL layer cannot catch this — a
 *   recursive CTE would work but embedding the check in a trigger
 *   would surprise non-app callers (drizzle-studio, raw queries).
 *
 * - Cross-driver generic typing: same pattern as `companies.ts` /
 *   `employees.ts`. Accepts both `BetterSQLite3Database<Schema>`
 *   at runtime and `SQLJsDatabase<Schema>` under Vitest so unit
 *   tests run without the Electron-ABI better-sqlite3 binding.
 *
 * The companion `orgchart.get` IPC handler composes this repo with
 * the employees repo to project the full tree (employees +
 * edges + root ids) in one round-trip. Tree-building lives in the
 * handler — not here — because the handler needs to filter
 * framework-internal system pseudo-employees (is_system = 1) out
 * of the response, and the repo stays pure SQL.
 */

import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { orgEdges } from '../schema.js';

export type OrgEdgeRow = typeof orgEdges.$inferSelect;

export interface SetManagerInput {
  companyId: string;
  managerId: string;
  reportId: string;
}

type OrgEdgesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

/**
 * Defensive upper bound on the manager-chain walk inside
 * `wouldCycle`. A healthy org tree rooted at a single CEO will be
 * far shallower than this (F10 companies cap around 8 levels); the
 * cap exists purely to make sure `wouldCycle` terminates on
 * pathological pre-existing data that somehow slipped past the
 * guard in earlier writes. Paired with the `visited` set below —
 * either mechanism alone would be sufficient; having both keeps
 * the guard boring.
 */
const MAX_CHAIN_DEPTH = 256;

export function createOrgEdgesRepo<TRunResult>(db: OrgEdgesDb<TRunResult>) {
  const repo = {
    /**
     * Return every edge belonging to a given company. Used by the
     * `orgchart.get` handler to project the full reporting graph.
     * No ordering guarantees — the handler sorts client-side.
     */
    listByCompany(companyId: string): OrgEdgeRow[] {
      return db.select().from(orgEdges).where(eq(orgEdges.companyId, companyId)).all();
    },

    /**
     * Return the edge pointing at a given report (i.e., the row whose
     * `report_id = reportId`), or null if the report has no manager
     * assigned yet. O(1) under the UNIQUE index on `report_id`.
     */
    getByReport(reportId: string): OrgEdgeRow | null {
      const row = db.select().from(orgEdges).where(eq(orgEdges.reportId, reportId)).get();
      return row ?? null;
    },

    /**
     * Return every edge whose `manager_id = managerId`, scoped to a
     * company. Used by the `orgchart.get` tree projection and by
     * `wouldCycle` when walking downward in hypothetical extensions.
     * Accelerated by the `idx_org_edges_company_manager` composite
     * index added in migration 0013.
     */
    listReports(companyId: string, managerId: string): OrgEdgeRow[] {
      return db
        .select()
        .from(orgEdges)
        .where(and(eq(orgEdges.companyId, companyId), eq(orgEdges.managerId, managerId)))
        .all();
    },

    /**
     * Set the manager of a given report, inserting a new edge or
     * updating the existing one in place. Returns the edge id.
     *
     * Upsert is keyed on `report_id` (UNIQUE at SQL layer) so every
     * report has at most one manager at any moment. Callers that
     * need to remove a report from the org tree use
     * `removeByReport` instead — passing a null manager is not a
     * supported shape (an edge always points at something).
     *
     * Throws if the edit would introduce a directed cycle — i.e.,
     * when `managerId` already transitively reports to `reportId`.
     * Self-edges (`managerId === reportId`) are trivially cyclic
     * and also rejected.
     */
    setManager(input: SetManagerInput): string {
      if (repo.wouldCycle(input.companyId, input.managerId, input.reportId)) {
        throw new Error(
          `[org-edges] setManager: would create cycle — ${input.managerId} already reports (directly or transitively) to ${input.reportId}`,
        );
      }

      const existing = repo.getByReport(input.reportId);
      if (existing) {
        db.update(orgEdges)
          .set({ managerId: input.managerId })
          .where(eq(orgEdges.reportId, input.reportId))
          .run();
        return existing.id;
      }

      const id = nanoid();
      db.insert(orgEdges)
        .values({
          id,
          companyId: input.companyId,
          managerId: input.managerId,
          reportId: input.reportId,
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    /**
     * Remove the edge pointing at a given report (detaches them from
     * the tree; they become a new root). No-op when no edge exists.
     * Called by `employees.fire` before the employee row is deleted
     * so the CASCADE FK does not surprise consumers.
     */
    removeByReport(reportId: string): void {
      db.delete(orgEdges).where(eq(orgEdges.reportId, reportId)).run();
    },

    /**
     * Remove every edge where `managerId = managerId` — used when a
     * manager is promoted/reassigned and their former reports need
     * to become roots (their new manager will be set by a follow-up
     * `setManager` call for each report).
     */
    removeByManager(companyId: string, managerId: string): void {
      db.delete(orgEdges)
        .where(and(eq(orgEdges.companyId, companyId), eq(orgEdges.managerId, managerId)))
        .run();
    },

    /**
     * Cycle detection — returns true if making `managerId` the
     * manager of `reportId` would create a directed cycle in the
     * reporting graph.
     *
     * Algorithm: walk up the manager chain starting from
     * `managerId`. At each step read the edge whose
     * `report_id = current` to find `current`'s own manager. Stop
     * when we hit a root (no such edge), when we revisit a node
     * (pre-existing cycle — treat as unsafe), or when the chain
     * exceeds `MAX_CHAIN_DEPTH` (should never happen in a healthy
     * tree; belt-and-suspenders guard).
     *
     * If the walk ever lands on `reportId`, the proposed edge
     * would close a cycle — return true.
     *
     * Self-edges (`managerId === reportId`) short-circuit as
     * trivially cyclic. This keeps the caller from having to
     * special-case the "fire and immediately re-hire as their
     * own manager" UI path.
     */
    wouldCycle(companyId: string, managerId: string, reportId: string): boolean {
      if (managerId === reportId) return true;
      const visited = new Set<string>();
      let current: string = managerId;
      for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
        if (current === reportId) return true;
        if (visited.has(current)) return true;
        visited.add(current);
        const edge = db
          .select()
          .from(orgEdges)
          .where(and(eq(orgEdges.companyId, companyId), eq(orgEdges.reportId, current)))
          .get();
        if (!edge) return false;
        current = edge.managerId;
      }
      // Chain deeper than MAX_CHAIN_DEPTH — treat as cyclic to fail closed.
      return true;
    },
  };
  return repo;
}
