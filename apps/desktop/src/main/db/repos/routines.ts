import type {
  RoutineLastRunStatus,
  RoutineRunReason,
  RoutineRunStatus,
  RoutineTriggerKind,
  RoutineWorkKind,
} from '@team-x/shared-types';
import { and, desc, eq, lte } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { routineRuns, routines } from '../schema.js';

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineRunRow = typeof routineRuns.$inferSelect;

export interface CreateRoutineInput {
  companyId: string;
  name: string;
  slug: string;
  enabled?: boolean;
  triggerKind: RoutineTriggerKind;
  scheduleJson: string;
  workKind?: RoutineWorkKind;
  workConfigJson: string;
  lastRunStatus?: RoutineLastRunStatus;
  lastRunMessage?: string | null;
  lastRunAt?: number | null;
  nextRunAt?: number | null;
}

export interface UpdateRoutineInput {
  name?: string;
  slug?: string;
  enabled?: boolean;
  triggerKind?: RoutineTriggerKind;
  scheduleJson?: string;
  workKind?: RoutineWorkKind;
  workConfigJson?: string;
  lastRunStatus?: RoutineLastRunStatus;
  lastRunMessage?: string | null;
  lastRunAt?: number | null;
  nextRunAt?: number | null;
}

export interface CreateRoutineRunInput {
  companyId: string;
  routineId: string;
  status: RoutineRunStatus;
  reason: RoutineRunReason;
  workKind?: RoutineWorkKind;
  scheduledFor?: number | null;
  startedAt: number;
  finishedAt?: number | null;
  ticketId?: string | null;
  message?: string | null;
  errorMessage?: string | null;
}

export interface UpdateRoutineRunInput {
  status?: RoutineRunStatus;
  finishedAt?: number | null;
  ticketId?: string | null;
  message?: string | null;
  errorMessage?: string | null;
}

type RoutinesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createRoutinesRepo<TRunResult>(db: RoutinesDb<TRunResult>) {
  return {
    create(input: CreateRoutineInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(routines)
        .values({
          id,
          companyId: input.companyId,
          name: input.name,
          slug: input.slug,
          enabled: input.enabled ?? true,
          triggerKind: input.triggerKind,
          scheduleJson: input.scheduleJson,
          workKind: input.workKind ?? 'ticket',
          workConfigJson: input.workConfigJson,
          lastRunStatus: input.lastRunStatus ?? 'never',
          lastRunMessage: input.lastRunMessage ?? null,
          lastRunAt: input.lastRunAt ?? null,
          nextRunAt: input.nextRunAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): RoutineRow | null {
      const row = db.select().from(routines).where(eq(routines.id, id)).get();
      return row ?? null;
    },

    listByCompany(companyId: string): RoutineRow[] {
      return db
        .select()
        .from(routines)
        .where(eq(routines.companyId, companyId))
        .all()
        .sort((a, b) => {
          const nextA = a.nextRunAt ?? Number.MAX_SAFE_INTEGER;
          const nextB = b.nextRunAt ?? Number.MAX_SAFE_INTEGER;
          return nextA - nextB || a.name.localeCompare(b.name) || a.createdAt - b.createdAt;
        });
    },

    listDueByCompany(companyId: string, now: number): RoutineRow[] {
      return db
        .select()
        .from(routines)
        .where(
          and(
            eq(routines.companyId, companyId),
            eq(routines.enabled, true),
            lte(routines.nextRunAt, now),
          ),
        )
        .all()
        .sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0) || a.createdAt - b.createdAt);
    },

    update(id: string, patch: UpdateRoutineInput): void {
      const next: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.slug !== undefined) next.slug = patch.slug;
      if (patch.enabled !== undefined) next.enabled = patch.enabled;
      if (patch.triggerKind !== undefined) next.triggerKind = patch.triggerKind;
      if (patch.scheduleJson !== undefined) next.scheduleJson = patch.scheduleJson;
      if (patch.workKind !== undefined) next.workKind = patch.workKind;
      if (patch.workConfigJson !== undefined) next.workConfigJson = patch.workConfigJson;
      if (patch.lastRunStatus !== undefined) next.lastRunStatus = patch.lastRunStatus;
      if (patch.lastRunMessage !== undefined) next.lastRunMessage = patch.lastRunMessage;
      if (patch.lastRunAt !== undefined) next.lastRunAt = patch.lastRunAt;
      if (patch.nextRunAt !== undefined) next.nextRunAt = patch.nextRunAt;
      db.update(routines).set(next).where(eq(routines.id, id)).run();
    },

    delete(id: string): void {
      db.delete(routines).where(eq(routines.id, id)).run();
    },

    createRun(input: CreateRoutineRunInput): string {
      const id = nanoid();
      db.insert(routineRuns)
        .values({
          id,
          companyId: input.companyId,
          routineId: input.routineId,
          status: input.status,
          reason: input.reason,
          workKind: input.workKind ?? 'ticket',
          scheduledFor: input.scheduledFor ?? null,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt ?? null,
          ticketId: input.ticketId ?? null,
          message: input.message ?? null,
          errorMessage: input.errorMessage ?? null,
        })
        .run();
      return id;
    },

    getRunById(id: string): RoutineRunRow | null {
      const row = db.select().from(routineRuns).where(eq(routineRuns.id, id)).get();
      return row ?? null;
    },

    getLatestRunByTicketId(ticketId: string): RoutineRunRow | null {
      return (
        db
          .select()
          .from(routineRuns)
          .where(eq(routineRuns.ticketId, ticketId))
          .orderBy(desc(routineRuns.startedAt))
          .limit(1)
          .get() ?? null
      );
    },

    listRunsByCompany(companyId: string, limit = 20): RoutineRunRow[] {
      return db
        .select()
        .from(routineRuns)
        .where(eq(routineRuns.companyId, companyId))
        .orderBy(desc(routineRuns.startedAt))
        .limit(limit)
        .all();
    },

    listRunsByRoutine(companyId: string, routineId: string, limit = 20): RoutineRunRow[] {
      return db
        .select()
        .from(routineRuns)
        .where(and(eq(routineRuns.companyId, companyId), eq(routineRuns.routineId, routineId)))
        .orderBy(desc(routineRuns.startedAt))
        .limit(limit)
        .all();
    },

    updateRun(id: string, patch: UpdateRoutineRunInput): void {
      const next: Record<string, unknown> = {};
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.finishedAt !== undefined) next.finishedAt = patch.finishedAt;
      if (patch.ticketId !== undefined) next.ticketId = patch.ticketId;
      if (patch.message !== undefined) next.message = patch.message;
      if (patch.errorMessage !== undefined) next.errorMessage = patch.errorMessage;
      db.update(routineRuns).set(next).where(eq(routineRuns.id, id)).run();
    },
  };
}

export type RoutinesRepo = ReturnType<typeof createRoutinesRepo>;
