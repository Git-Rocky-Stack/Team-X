/**
 * Goals repository — factory-pattern CRUD for the `goals` table.
 *
 * Same cross-driver generic typing as `tickets.ts`: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * Goals are the top-level planning primitive. They decompose into
 * projects (via `projects.goalId` FK), and progress is calculated as
 * the weighted average of linked project completion:
 *   progressPct = (completed projects / total projects) * 100
 *
 * Goal lifecycle:
 *   active → achieved   (all linked projects completed)
 *   active → abandoned  (user cancels goal)
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { goals, projects } from '../schema.js';

export type GoalRow = typeof goals.$inferSelect;

export interface CreateGoalInput {
  companyId: string;
  title: string;
  description?: string;
  status?: string;
  targetDate?: number | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  status?: string;
  progressPct?: number;
  targetDate?: number | null;
}

type GoalsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createGoalsRepo<TRunResult>(db: GoalsDb<TRunResult>) {
  return {
    /** Insert a new goal and return its id. */
    create(input: CreateGoalInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(goals)
        .values({
          id,
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? '',
          status: input.status ?? 'active',
          progressPct: 0,
          targetDate: input.targetDate ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    /** Return the goal with the matching id, or null. */
    getById(id: string): GoalRow | null {
      const row = db.select().from(goals).where(eq(goals.id, id)).get();
      return row ?? null;
    },

    /** Return every goal belonging to a given company, newest first. */
    listByCompany(companyId: string): GoalRow[] {
      return db
        .select()
        .from(goals)
        .where(eq(goals.companyId, companyId))
        .all()
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    },

    /**
     * Update mutable goal fields. Only the fields present in `input`
     * are overwritten — the rest are untouched. Always bumps `updatedAt`.
     */
    update(id: string, input: UpdateGoalInput): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.title !== undefined) set.title = input.title;
      if (input.description !== undefined) set.description = input.description;
      if (input.status !== undefined) set.status = input.status;
      if (input.progressPct !== undefined) set.progressPct = input.progressPct;
      if (input.targetDate !== undefined) set.targetDate = input.targetDate;
      db.update(goals).set(set).where(eq(goals.id, id)).run();
    },

    /** Hard-delete a goal by id. */
    delete(id: string): void {
      db.delete(goals).where(eq(goals.id, id)).run();
    },

    /**
     * Recalculate a goal's progressPct from its linked projects.
     * Progress = (completed or archived projects / total projects) * 100.
     * If the goal has no linked projects, progressPct stays at 0.
     */
    recalcProgress(id: string): void {
      const linkedProjects = db.select().from(projects).where(eq(projects.goalId, id)).all();

      if (linkedProjects.length === 0) {
        db.update(goals)
          .set({ progressPct: 0, updatedAt: Date.now() })
          .where(eq(goals.id, id))
          .run();
        return;
      }

      const doneCount = linkedProjects.filter(
        (p) => p.status === 'completed' || p.status === 'archived',
      ).length;
      const pct = Math.round((doneCount / linkedProjects.length) * 100);

      db.update(goals)
        .set({ progressPct: pct, updatedAt: Date.now() })
        .where(eq(goals.id, id))
        .run();
    },
  };
}
