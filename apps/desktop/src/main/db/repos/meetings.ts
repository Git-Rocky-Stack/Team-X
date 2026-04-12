/**
 * Meetings repository — factory-pattern CRUD for the `meetings` table.
 *
 * Same cross-driver generic typing as other repos: accepts both
 * `BetterSQLite3Database<Schema>` at runtime and `SQLJsDatabase<Schema>`
 * under tests via `BaseSQLiteDatabase<'sync', TRunResult, Schema>`.
 *
 * Meeting lifecycle:
 *   active → ended
 *
 * The repo is persistence-only. Orchestrator pause/drain, turn dispatch,
 * and minutes generation live in the meeting service layer.
 */

import { desc, eq, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { meetings } from '../schema.js';

export type MeetingRow = typeof meetings.$inferSelect;

export interface CreateMeetingInput {
  companyId: string;
  threadId: string;
  chairId: string;
  agenda?: string;
  mode?: string;
  attendeesJson: string;
}

type MeetingsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createMeetingsRepo<TRunResult>(db: MeetingsDb<TRunResult>) {
  return {
    /**
     * Insert a new meeting and return its id. The meeting starts as 'active'.
     */
    create(input: CreateMeetingInput): string {
      const id = nanoid();
      db.insert(meetings)
        .values({
          id,
          companyId: input.companyId,
          threadId: input.threadId,
          chairId: input.chairId,
          agenda: input.agenda ?? '',
          mode: input.mode ?? 'round-robin',
          status: 'active',
          attendeesJson: input.attendeesJson,
          actionItemsJson: '[]',
          startedAt: Date.now(),
        })
        .run();
      return id;
    },

    /** Return the meeting with the matching id, or null. */
    getById(id: string): MeetingRow | null {
      const row = db.select().from(meetings).where(eq(meetings.id, id)).get();
      return row ?? null;
    },

    /** Return every meeting for a company, newest first. */
    listByCompany(companyId: string): MeetingRow[] {
      return db
        .select()
        .from(meetings)
        .where(eq(meetings.companyId, companyId))
        .orderBy(desc(meetings.startedAt), desc(sql`rowid`))
        .all();
    },

    /** Return the currently active meeting for a company, or null. */
    getActive(companyId: string): MeetingRow | null {
      const row = db
        .select()
        .from(meetings)
        .where(eq(meetings.companyId, companyId))
        .all()
        .find((r) => r.status === 'active');
      return row ?? null;
    },

    /** End a meeting — set status, endedAt, and optionally minutes + action items. */
    end(id: string, opts?: { minutesMd?: string; actionItemsJson?: string }): void {
      db.update(meetings)
        .set({
          status: 'ended',
          endedAt: Date.now(),
          minutesMd: opts?.minutesMd ?? null,
          actionItemsJson: opts?.actionItemsJson ?? '[]',
        })
        .where(eq(meetings.id, id))
        .run();
    },

    /** Update minutes markdown after end. */
    setMinutes(id: string, minutesMd: string): void {
      db.update(meetings).set({ minutesMd }).where(eq(meetings.id, id)).run();
    },

    /** Update action items JSON after extraction. */
    setActionItems(id: string, actionItemsJson: string): void {
      db.update(meetings).set({ actionItemsJson }).where(eq(meetings.id, id)).run();
    },
  };
}
