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

import { eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import {
  events,
  commandHistory,
  companies,
  copilotInsights,
  embeddings,
  employees,
  fileVault,
  goals,
  mcpServers,
  meetings,
  messages,
  projectTickets,
  projects,
  runs,
  threadMembers,
  threads,
  ticketAttachments,
  tickets,
} from '../schema.js';

export type CompanyRow = typeof companies.$inferSelect;

export interface CreateCompanyInput {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  icon?: string;
  theme?: string;
  workspaceOriginId?: string;
  companyOriginId?: string;
}

/**
 * Patch shape for `update()`. Every field is optional — only the keys
 * present in the patch get written. Passing an empty patch is a no-op
 * at the SQL layer (the repo returns without issuing an UPDATE).
 *
 * `slug` participates in the URL-safe unique-index constraint at the SQL
 * layer; callers (the IPC handler) should pre-validate against the same
 * `/^[a-z0-9][a-z0-9-]{0,62}$/` regex `create()` enforces so SQL UNIQUE
 * failures surface only for genuine duplicates, not malformed-by-
 * construction slugs.
 */
export interface UpdateCompanyInput {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
  icon?: string | null;
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
      const workspaceOriginId = input.workspaceOriginId ?? id;
      const companyOriginId = input.companyOriginId ?? id;
      db.insert(companies)
        .values({
          id,
          name: input.name,
          slug: input.slug,
          createdAt: Date.now(),
          settingsJson: JSON.stringify(input.settings ?? {}),
          icon: input.icon ?? null,
          theme: input.theme ?? 'dark',
          workspaceOriginId,
          companyOriginId,
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

    /**
     * Set the orchestrator-level status for a company.
     * Used by the meeting primitive: 'meeting' pauses dispatch,
     * 'running' resumes it.
     */
    setStatus(id: string, status: string): void {
      db.update(companies).set({ status }).where(eq(companies.id, id)).run();
    },

    /**
     * Archive a company — soft delete. Sets `status = 'archived'` so
     * the orchestrator stops dispatching for it and the command
     * palette / copilot analyzer treat it as inactive.
     *
     * The status column is the single source of truth for "is this
     * company live?" — it already carries `running` / `meeting` /
     * `paused`, and `archived` slots in cleanly without adding a
     * migration. The column has no CHECK constraint at the schema
     * level (see M3), so this is a pure value-domain extension.
     *
     * **Idempotent:** calling archive on an already-archived company
     * is a no-op write; callers can safely retry. The IPC handler
     * in `companies.archive` calls `CopilotEventWindow.clear(id)` +
     * `CopilotAnalyzerService.stop(id)` BEFORE this write so mid-tick
     * analyzers cannot observe stale buffers post-archive — closes
     * M33 T3 follow-up F3.
     */
    archive(id: string): void {
      db.update(companies).set({ status: 'archived' }).where(eq(companies.id, id)).run();
    },

    /**
     * Update mutable fields of a company row. Only the keys present in
     * `patch` get written; empty patch is a no-op (no UPDATE issued).
     * Phase 5.6 M-C step e — restores Cluster A multi-company CRUD per
     * audit row 10.13. Backs the `companies.update` IPC handler.
     *
     * `settings` is serialized to JSON at the repo boundary (matches
     * `create()`'s convention). `slug` is NOT re-validated here — the
     * IPC handler runs the full URL-safe regex before calling; the SQL
     * UNIQUE constraint is the canonical last-line duplicate guard.
     *
     * No side effects at the repo layer: `company.updated` bus emit
     * lives on the handler so the repo stays free of event-bus imports
     * (same architectural boundary `archive()` observes).
     */
    update(id: string, patch: UpdateCompanyInput): void {
      const set: Record<string, unknown> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.slug !== undefined) set.slug = patch.slug;
      if (patch.settings !== undefined) set.settingsJson = JSON.stringify(patch.settings);
      if (patch.icon !== undefined) set.icon = patch.icon;
      if (patch.theme !== undefined) set.theme = patch.theme;
      if (Object.keys(set).length === 0) return;
      db.update(companies).set(set).where(eq(companies.id, id)).run();
    },

    /**
     * Hard-delete a company and every row scoped to it. Phase 5.6 M-C
     * step e — restores Cluster A multi-company CRUD per audit row 10.15.
     * Destructive sibling of `archive()`; the `companies.delete` IPC
     * handler routes here for user-intent "permanently remove".
     *
     * Integrity contract:
     *
     *   - Runs inside a single `db.transaction(tx => …)` so either every
     *     table loses its company-scoped rows atomically or nothing does.
     *     A mid-sweep throw rolls the whole batch back — callers never
     *     see a half-deleted company.
     *
     *   - `PRAGMA foreign_keys = ON` is active in production + tests, so
     *     deletion order MUST respect FK dependencies (children first,
     *     parents last). The order below is reverse-topological across
     *     the 15 company-scoped tables + their indirect leaves. Order
     *     matters inside the "cross-referencing children" band because
     *     `meetings.threadId` + `tickets.threadId` point at `threads`,
     *     and `meetings.chairId` / `tickets.assigneeId` / `projects.leadId`
     *     point at `employees`:
     *
     *       1. Indirect leaves:     thread_members, messages, runs (via
     *                               thread_id subquery), project_tickets,
     *                               ticket_attachments.
     *       2. Cross-referencing:   meetings + tickets + projects BEFORE
     *                               threads/goals/employees so their
     *                               FK targets remain valid until they
     *                               themselves are gone.
     *       3. Direct children:     threads, goals, file_vault, embeddings,
     *                               command_history.
     *       4. Loose-reference rows: mcp_servers (company-scoped only —
     *                               NULL company_id is a global server
     *                               and MUST be preserved), events (no FK,
     *                               cleaned for data hygiene only).
     *       5. employees — CASCADE-deletes `org_edges` rows on both the
     *          manager and report sides via migration 0013's FKs.
     *       6. copilot_insights — CASCADE-deletes automatically when the
     *          company row drops; explicit DELETE here is belt-and-
     *          suspenders for audit-log parity with the other tables.
     *       7. companies (the target row).
     *
     * No-op on unknown id (the inner DELETE WHERE id = ? matches zero rows
     * and returns cleanly). The handler should pre-check via `getById()`
     * and throw a friendlier "company not found" if the caller expected a
     * hit — matches the employees-promote / employees-setManager pattern
     * where the IPC boundary owns the precondition guard.
     */
    delete(id: string): void {
      db.transaction((tx) => {
        // --- Phase 1: indirect leaves (scoped via children) ------------
        // thread_members + messages cascade from threads, but FK enforcement
        // requires them gone BEFORE threads drop. Same for runs (no FK but
        // threadId points at threads — cleaning here keeps runs from
        // becoming zombies that reference a dead thread id).
        const threadIdRows = tx
          .select({ id: threads.id })
          .from(threads)
          .where(eq(threads.companyId, id))
          .all();
        const threadIds = threadIdRows.map((r) => r.id);
        if (threadIds.length > 0) {
          tx.delete(threadMembers).where(inArray(threadMembers.threadId, threadIds)).run();
          tx.delete(messages).where(inArray(messages.threadId, threadIds)).run();
          tx.delete(runs).where(inArray(runs.threadId, threadIds)).run();
        }

        // ticket_attachments + project_tickets cascade from tickets +
        // projects, but FK enforcement requires them gone BEFORE the
        // parent tables drop.
        const ticketIdRows = tx
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.companyId, id))
          .all();
        const ticketIds = ticketIdRows.map((r) => r.id);
        if (ticketIds.length > 0) {
          tx.delete(ticketAttachments).where(inArray(ticketAttachments.ticketId, ticketIds)).run();
          tx.delete(projectTickets).where(inArray(projectTickets.ticketId, ticketIds)).run();
        }
        const projectIdRows = tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.companyId, id))
          .all();
        const projectIds = projectIdRows.map((r) => r.id);
        if (projectIds.length > 0) {
          tx.delete(projectTickets).where(inArray(projectTickets.projectId, projectIds)).run();
        }

        // --- Phase 2: cross-referencing children ---------------------
        // meetings.threadId + chairId → threads, employees (NOT NULL FKs).
        // tickets.threadId → threads (nullable); assigneeId → employees.
        // projects.goalId → goals (nullable); leadId → employees.
        // All three must drop BEFORE threads / goals / employees so
        // their FK targets remain valid until they themselves are gone.
        tx.delete(meetings).where(eq(meetings.companyId, id)).run();
        tx.delete(tickets).where(eq(tickets.companyId, id)).run();
        tx.delete(projects).where(eq(projects.companyId, id)).run();

        // --- Phase 3: direct company-scoped children ------------------
        tx.delete(threads).where(eq(threads.companyId, id)).run();
        tx.delete(goals).where(eq(goals.companyId, id)).run();
        tx.delete(fileVault).where(eq(fileVault.companyId, id)).run();
        tx.delete(embeddings).where(eq(embeddings.companyId, id)).run();
        tx.delete(commandHistory).where(eq(commandHistory.companyId, id)).run();

        // --- Phase 4: loose-reference rows (no FK, cleaned for hygiene)
        // mcp_servers with NULL companyId are GLOBAL and must survive.
        // Only scoped rows get swept.
        tx.delete(mcpServers).where(eq(mcpServers.companyId, id)).run();
        tx.delete(events).where(eq(events.companyId, id)).run();

        // --- Phase 5: employees (CASCADEs org_edges via migration 0013)
        tx.delete(employees).where(eq(employees.companyId, id)).run();

        // --- Phase 6: copilot_insights (CASCADE via schema.ts; explicit
        //     for audit parity with the other tables)
        tx.delete(copilotInsights).where(eq(copilotInsights.companyId, id)).run();

        // --- Phase 7: the target row itself ---------------------------
        tx.delete(companies).where(eq(companies.id, id)).run();
      });
    },
  };
}
