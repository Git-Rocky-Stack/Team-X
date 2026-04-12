/**
 * Projects repository — factory-pattern CRUD for the `projects` and
 * `project_tickets` tables.
 *
 * Same cross-driver generic typing as `tickets.ts`: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * Projects sit between goals and tickets in the planning hierarchy:
 *   Goal (0..1) ← Project (1) → Tickets (0..N via project_tickets)
 *
 * Project lifecycle:
 *   planning → active → completed   (happy path)
 *   planning → active → archived    (cancelled)
 *   any → planning                  (revert to planning)
 */

import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { projectTickets, projects, tickets } from '../schema.js';

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectTicketRow = typeof projectTickets.$inferSelect;

export interface CreateProjectInput {
  companyId: string;
  goalId?: string | null;
  title: string;
  description?: string;
  leadId?: string | null;
  priority?: string;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  status?: string;
  goalId?: string | null;
  leadId?: string | null;
  priority?: string;
}

type ProjectsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createProjectsRepo<TRunResult>(db: ProjectsDb<TRunResult>) {
  return {
    /** Insert a new project and return its id. */
    create(input: CreateProjectInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(projects)
        .values({
          id,
          companyId: input.companyId,
          goalId: input.goalId ?? null,
          title: input.title,
          description: input.description ?? '',
          status: 'planning',
          leadId: input.leadId ?? null,
          priority: input.priority ?? 'medium',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    /** Return the project with the matching id, or null. */
    getById(id: string): ProjectRow | null {
      const row = db.select().from(projects).where(eq(projects.id, id)).get();
      return row ?? null;
    },

    /** Return every project belonging to a given company, newest first. */
    listByCompany(companyId: string): ProjectRow[] {
      return db
        .select()
        .from(projects)
        .where(eq(projects.companyId, companyId))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    },

    /** Return every project linked to a given goal. */
    listByGoal(goalId: string): ProjectRow[] {
      return db
        .select()
        .from(projects)
        .where(eq(projects.goalId, goalId))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    },

    /**
     * Update mutable project fields. Only the fields present in `input`
     * are overwritten — the rest are untouched. Always bumps `updatedAt`.
     */
    update(id: string, input: UpdateProjectInput): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.title !== undefined) set.title = input.title;
      if (input.description !== undefined) set.description = input.description;
      if (input.status !== undefined) set.status = input.status;
      if (input.goalId !== undefined) set.goalId = input.goalId;
      if (input.leadId !== undefined) set.leadId = input.leadId;
      if (input.priority !== undefined) set.priority = input.priority;
      db.update(projects).set(set).where(eq(projects.id, id)).run();
    },

    /** Hard-delete a project and its project_tickets links. */
    delete(id: string): void {
      db.delete(projectTickets).where(eq(projectTickets.projectId, id)).run();
      db.delete(projects).where(eq(projects.id, id)).run();
    },

    /**
     * Link a ticket to a project. If the link already exists this is a
     * no-op — checks for existence before inserting since the junction
     * table has no composite unique constraint.
     */
    linkTicket(projectId: string, ticketId: string): void {
      const existing = db
        .select()
        .from(projectTickets)
        .where(and(eq(projectTickets.projectId, projectId), eq(projectTickets.ticketId, ticketId)))
        .get();
      if (existing) return;
      db.insert(projectTickets).values({ projectId, ticketId }).run();
    },

    /** Remove the link between a project and a ticket. */
    unlinkTicket(projectId: string, ticketId: string): void {
      db.delete(projectTickets)
        .where(and(eq(projectTickets.projectId, projectId), eq(projectTickets.ticketId, ticketId)))
        .run();
    },

    /** Return all ticket ids linked to a project. */
    listTickets(projectId: string): string[] {
      return db
        .select({ ticketId: projectTickets.ticketId })
        .from(projectTickets)
        .where(eq(projectTickets.projectId, projectId))
        .all()
        .map((row) => row.ticketId);
    },

    /**
     * Count tickets linked to a project, grouped by done vs total.
     * Used for progress bar calculations on project cards.
     */
    countTicketsByStatus(projectId: string): { total: number; done: number } {
      const ticketIds = db
        .select({ ticketId: projectTickets.ticketId })
        .from(projectTickets)
        .where(eq(projectTickets.projectId, projectId))
        .all()
        .map((row) => row.ticketId);

      if (ticketIds.length === 0) return { total: 0, done: 0 };

      let done = 0;
      for (const tid of ticketIds) {
        const ticket = db.select().from(tickets).where(eq(tickets.id, tid)).get();
        if (ticket && ticket.status === 'done') done++;
      }

      return { total: ticketIds.length, done };
    },
  };
}
