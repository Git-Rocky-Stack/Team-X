/**
 * Tickets repository — factory-pattern CRUD for the `tickets` table.
 *
 * Same cross-driver generic typing as `employees.ts`: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * Ticket lifecycle:
 *   open → in-progress → done   (happy path)
 *   open → in-progress → blocked → in-progress → done  (with blocks)
 *   done → open  (reopen)
 *
 * The `assign` method does NOT enqueue a WorkItem — that orchestrator
 * integration lives in the IPC handler layer so the repo stays
 * persistence-only.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { tickets } from '../schema.js';

export type TicketRow = typeof tickets.$inferSelect;

export interface CreateTicketInput {
  companyId: string;
  title: string;
  description?: string;
  priority?: string;
  assigneeId?: string | null;
  reporterId: string;
  reporterKind?: string;
  labelsJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  labelsJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
}

type TicketsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createTicketsRepo<TRunResult>(db: TicketsDb<TRunResult>) {
  return {
    /**
     * Insert a new ticket and return its id. The `assigneeId` is optional
     * — when set, the IPC handler is responsible for creating the thread
     * and enqueuing the WorkItem (not the repo).
     */
    create(input: CreateTicketInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(tickets)
        .values({
          id,
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? '',
          status: 'open',
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId ?? null,
          reporterId: input.reporterId,
          reporterKind: input.reporterKind ?? 'user',
          labelsJson: input.labelsJson ?? '[]',
          dependenciesJson: '[]',
          slaHours: input.slaHours ?? null,
          dueAt: input.dueAt ?? null,
          threadId: null,
          createdAt: now,
          updatedAt: now,
          closedAt: null,
        })
        .run();
      return id;
    },

    /** Return the ticket with the matching id, or null. */
    getById(id: string): TicketRow | null {
      const row = db.select().from(tickets).where(eq(tickets.id, id)).get();
      return row ?? null;
    },

    /** Return every ticket belonging to a given company, newest first. */
    listByCompany(companyId: string): TicketRow[] {
      return db
        .select()
        .from(tickets)
        .where(eq(tickets.companyId, companyId))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    /** Return every ticket assigned to a given employee. */
    listByAssignee(assigneeId: string): TicketRow[] {
      return db
        .select()
        .from(tickets)
        .where(eq(tickets.assigneeId, assigneeId))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    /**
     * Update mutable ticket fields. Only the fields present in `input`
     * are overwritten — the rest are untouched. Always bumps `updatedAt`.
     */
    update(id: string, input: UpdateTicketInput): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.title !== undefined) set.title = input.title;
      if (input.description !== undefined) set.description = input.description;
      if (input.priority !== undefined) set.priority = input.priority;
      if (input.status !== undefined) set.status = input.status;
      if (input.labelsJson !== undefined) set.labelsJson = input.labelsJson;
      if (input.slaHours !== undefined) set.slaHours = input.slaHours;
      if (input.dueAt !== undefined) set.dueAt = input.dueAt;
      db.update(tickets).set(set).where(eq(tickets.id, id)).run();
    },

    /** Set the assignee. Does NOT create a thread or enqueue work. */
    assign(id: string, assigneeId: string): void {
      db.update(tickets)
        .set({ assigneeId, status: 'in-progress', updatedAt: Date.now() })
        .where(eq(tickets.id, id))
        .run();
    },

    /** Link a discussion thread to this ticket. */
    setThreadId(id: string, threadId: string): void {
      db.update(tickets).set({ threadId, updatedAt: Date.now() }).where(eq(tickets.id, id)).run();
    },

    /** Close a ticket — sets status to 'done' and stamps closedAt. */
    close(id: string): void {
      const now = Date.now();
      db.update(tickets)
        .set({ status: 'done', closedAt: now, updatedAt: now })
        .where(eq(tickets.id, id))
        .run();
    },

    /** Reopen a closed ticket — sets status to 'open', clears closedAt. */
    reopen(id: string): void {
      db.update(tickets)
        .set({ status: 'open', closedAt: null, updatedAt: Date.now() })
        .where(eq(tickets.id, id))
        .run();
    },
  };
}
