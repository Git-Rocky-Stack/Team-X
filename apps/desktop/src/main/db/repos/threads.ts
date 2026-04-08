/**
 * Threads repository — CRUD for the `threads` table plus membership
 * writes/reads against `thread_members`. A "thread" is any conversation
 * primitive in Team-X: direct message, group chat, meeting transcript,
 * ticket discussion, or broadcast. The `kind` column discriminates.
 *
 * Membership is a many-to-many edge between threads and
 * users/employees. The `thread_members` table stores
 * `(threadId, memberId, memberKind, roleInThread?)` rows. Because Phase 1
 * does not need per-member metadata beyond what's on the edge itself, we
 * expose `addMember` and `listMembers` here rather than carving out a
 * separate `threadMembersRepo`.
 *
 * Cross-driver generic typing — same pattern as companies/employees,
 * see docs/plans/... Task 21 decision for the full rationale.
 */

import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { threadMembers, threads } from '../schema.js';

export type ThreadRow = typeof threads.$inferSelect;
export type ThreadMemberRow = typeof threadMembers.$inferSelect;

export type ThreadKind = 'dm' | 'group' | 'meeting' | 'ticket' | 'broadcast';

export interface CreateThreadInput {
  companyId: string;
  kind: ThreadKind;
  createdBy: string;
  subject?: string;
}

export interface AddThreadMemberInput {
  threadId: string;
  memberId: string;
  memberKind: 'user' | 'employee';
  roleInThread?: string;
}

type ThreadsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createThreadsRepo<TRunResult>(db: ThreadsDb<TRunResult>) {
  return {
    /**
     * Insert a new thread and return its id. Throws if `companyId` does
     * not reference an existing company (FK enforced via pragma).
     */
    create(input: CreateThreadInput): string {
      const id = nanoid();
      db.insert(threads)
        .values({
          id,
          companyId: input.companyId,
          kind: input.kind,
          subject: input.subject ?? null,
          createdBy: input.createdBy,
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    /** Return the thread with a matching id, or null if none exists. */
    getById(id: string): ThreadRow | null {
      const row = db.select().from(threads).where(eq(threads.id, id)).get();
      return row ?? null;
    },

    /** Return every thread belonging to a given company. */
    listByCompany(companyId: string): ThreadRow[] {
      return db.select().from(threads).where(eq(threads.companyId, companyId)).all();
    },

    /**
     * Add a member (user or employee) to a thread. Throws if `threadId`
     * does not reference an existing thread (FK enforced via pragma).
     */
    addMember(input: AddThreadMemberInput): void {
      db.insert(threadMembers)
        .values({
          threadId: input.threadId,
          memberId: input.memberId,
          memberKind: input.memberKind,
          roleInThread: input.roleInThread ?? null,
        })
        .run();
    },

    /** Return every member of a given thread. */
    listMembers(threadId: string): ThreadMemberRow[] {
      return db.select().from(threadMembers).where(eq(threadMembers.threadId, threadId)).all();
    },
  };
}
