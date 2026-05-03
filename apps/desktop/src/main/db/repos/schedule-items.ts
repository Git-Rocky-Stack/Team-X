import type {
  AuthorKind,
  ScheduleItemKind,
  ScheduleItemSourceKind,
  ScheduleItemStatus,
  TicketPriority,
} from '@team-x/shared-types';
import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { scheduleItems } from '../schema.js';

export type ScheduleItemRow = typeof scheduleItems.$inferSelect;

export interface CreateScheduleItemInput {
  companyId: string;
  title: string;
  description?: string;
  kind?: ScheduleItemKind;
  status?: ScheduleItemStatus;
  priority?: TicketPriority;
  startsAt: number;
  endsAt?: number | null;
  reminderAt?: number | null;
  ticketId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  assigneeId?: string | null;
  wakeupRequestId?: string | null;
  sourceKind?: ScheduleItemSourceKind;
  sourceId?: string | null;
  createdById: string;
  createdByKind?: AuthorKind;
}

export interface UpdateScheduleItemInput {
  title?: string;
  description?: string;
  kind?: ScheduleItemKind;
  status?: ScheduleItemStatus;
  priority?: TicketPriority;
  startsAt?: number;
  endsAt?: number | null;
  reminderAt?: number | null;
  ticketId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  assigneeId?: string | null;
  wakeupRequestId?: string | null;
  completedAt?: number | null;
}

type ScheduleItemsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createScheduleItemsRepo<TRunResult>(db: ScheduleItemsDb<TRunResult>) {
  return {
    create(input: CreateScheduleItemInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(scheduleItems)
        .values({
          id,
          companyId: input.companyId,
          title: input.title,
          description: input.description ?? '',
          kind: input.kind ?? 'task',
          status: input.status ?? 'scheduled',
          priority: input.priority ?? 'medium',
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          reminderAt: input.reminderAt ?? null,
          ticketId: input.ticketId ?? null,
          projectId: input.projectId ?? null,
          goalId: input.goalId ?? null,
          assigneeId: input.assigneeId ?? null,
          wakeupRequestId: input.wakeupRequestId ?? null,
          sourceKind: input.sourceKind ?? 'manual',
          sourceId: input.sourceId ?? null,
          createdById: input.createdById,
          createdByKind: input.createdByKind ?? 'user',
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        })
        .run();
      return id;
    },

    getById(id: string): ScheduleItemRow | null {
      const row = db.select().from(scheduleItems).where(eq(scheduleItems.id, id)).get();
      return row ?? null;
    },

    listByCompany(companyId: string): ScheduleItemRow[] {
      return db
        .select()
        .from(scheduleItems)
        .where(eq(scheduleItems.companyId, companyId))
        .all()
        .sort((a, b) => a.startsAt - b.startsAt || a.createdAt - b.createdAt);
    },

    update(id: string, patch: UpdateScheduleItemInput): void {
      const next: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.description !== undefined) next.description = patch.description;
      if (patch.kind !== undefined) next.kind = patch.kind;
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.priority !== undefined) next.priority = patch.priority;
      if (patch.startsAt !== undefined) next.startsAt = patch.startsAt;
      if (patch.endsAt !== undefined) next.endsAt = patch.endsAt;
      if (patch.reminderAt !== undefined) next.reminderAt = patch.reminderAt;
      if (patch.ticketId !== undefined) next.ticketId = patch.ticketId;
      if (patch.projectId !== undefined) next.projectId = patch.projectId;
      if (patch.goalId !== undefined) next.goalId = patch.goalId;
      if (patch.assigneeId !== undefined) next.assigneeId = patch.assigneeId;
      if (patch.wakeupRequestId !== undefined) next.wakeupRequestId = patch.wakeupRequestId;
      if (patch.completedAt !== undefined) next.completedAt = patch.completedAt;
      db.update(scheduleItems).set(next).where(eq(scheduleItems.id, id)).run();
    },

    delete(id: string): void {
      db.delete(scheduleItems).where(eq(scheduleItems.id, id)).run();
    },
  };
}

export type ScheduleItemsRepo = ReturnType<typeof createScheduleItemsRepo>;
