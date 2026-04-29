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

import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { messages, threadMembers, threads } from '../schema.js';

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

export interface GetOrCreateDmThreadInput {
  /** Company the DM thread belongs to — must match `employeeId`'s employer. */
  companyId: string;
  /** The employee who is the DM counterpart. */
  employeeId: string;
  /**
   * Id + kind of the human user on the other side of the conversation.
   * Phase 1 uses a single hardcoded user (`'rocky'` / `'user'`), but the
   * repo stays agnostic so Phase 2 multi-user support does not require
   * schema changes.
   */
  userId: string;
  userKind?: 'user';
}

export interface GetOrCreateEmployeeDmThreadInput {
  companyId: string;
  /** The employee initiating the conversation. */
  fromEmployeeId: string;
  /** The employee receiving the message. */
  toEmployeeId: string;
}

/** Thread row enriched with its membership list for the listThreads API. */
export interface ThreadWithMembers extends ThreadRow {
  members: ThreadMemberRow[];
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

    /**
     * Look up the DM thread between a user and an employee, creating it
     * if one does not already exist. Returns the thread id in either case.
     *
     * "DM thread" is defined here as: a thread with `kind = 'dm'`, scoped
     * to the employee's company, whose `thread_members` includes the
     * given employee (as an `employee` member) AND the given user (as a
     * `user` member). This is the T33 IPC `chat.send` entry point: the
     * renderer fires a message at an employee, the handler calls
     * `getOrCreateDmThread` to resolve a stable thread id, and appends
     * the message.
     *
     * Matching strategy — two-step:
     *
     *   1. SELECT every DM thread in the company that has the employee
     *      as a member. This filters down to at most one candidate under
     *      Phase 1's single-user assumption. We intentionally scope by
     *      `companyId` so a stale thread that got orphaned by a company
     *      deletion cannot be resurrected here.
     *
     *   2. For each candidate, verify the user is also a member before
     *      returning it. Phase 1 has one user per company so the verify
     *      step is cheap; Phase 2 multi-user will naturally extend the
     *      match by adding the user membership check to the SQL above.
     *
     * If no thread matches, create a new `kind='dm'` thread with
     * `createdBy = userId`, then add both the user and the employee as
     * members in a single `insert().values([...])` call so the three
     * writes (thread + 2 members) land within one micro-transaction.
     *
     * Idempotency: concurrent callers may race to create a duplicate
     * DM thread. Phase 1 runs everything on a single main-process event
     * loop so this cannot happen in practice; Phase 2 will add a
     * composite unique index on (kind, companyId, employee-member) when
     * worker_threads land and the race becomes real.
     */
    getOrCreateDmThread(input: GetOrCreateDmThreadInput): string {
      const userKind = input.userKind ?? 'user';

      // Step 1 — find all DM threads in the company that include the
      // employee. Drizzle's inner-join on `thread_members` would be
      // slightly denser SQL but would require pulling every
      // thread_members row in memory for the verify step, so we do
      // two focused queries instead.
      const candidates = db
        .select({ threadId: threadMembers.threadId })
        .from(threadMembers)
        .innerJoin(threads, eq(threadMembers.threadId, threads.id))
        .where(
          and(
            eq(threadMembers.memberId, input.employeeId),
            eq(threadMembers.memberKind, 'employee'),
            eq(threads.kind, 'dm'),
            eq(threads.companyId, input.companyId),
          ),
        )
        .all();

      for (const { threadId } of candidates) {
        // Step 2 — verify the user is also a member of this candidate.
        const hasUser = db
          .select({ memberId: threadMembers.memberId })
          .from(threadMembers)
          .where(
            and(
              eq(threadMembers.threadId, threadId),
              eq(threadMembers.memberId, input.userId),
              eq(threadMembers.memberKind, userKind),
            ),
          )
          .get();
        if (hasUser) return threadId;
      }

      // Nothing matched — create a new DM thread and add both members.
      const id = nanoid();
      db.insert(threads)
        .values({
          id,
          companyId: input.companyId,
          kind: 'dm',
          subject: null,
          createdBy: input.userId,
          createdAt: Date.now(),
        })
        .run();
      db.insert(threadMembers)
        .values([
          {
            threadId: id,
            memberId: input.userId,
            memberKind: userKind,
            roleInThread: null,
          },
          {
            threadId: id,
            memberId: input.employeeId,
            memberKind: 'employee',
            roleInThread: null,
          },
        ])
        .run();
      return id;
    },

    /**
     * Look up the DM thread between two employees, creating it if none
     * exists. Same two-step matching strategy as `getOrCreateDmThread`
     * but both members are `memberKind: 'employee'`.
     *
     * Order-independent: the thread between (A, B) and (B, A) is the
     * same thread. We search for candidates where EITHER employee is
     * a member, then verify the OTHER is also present.
     */
    getOrCreateEmployeeDmThread(input: GetOrCreateEmployeeDmThreadInput): string {
      // Step 1 — find DM threads in the company where fromEmployee is a member.
      const candidates = db
        .select({ threadId: threadMembers.threadId })
        .from(threadMembers)
        .innerJoin(threads, eq(threadMembers.threadId, threads.id))
        .where(
          and(
            eq(threadMembers.memberId, input.fromEmployeeId),
            eq(threadMembers.memberKind, 'employee'),
            eq(threads.kind, 'dm'),
            eq(threads.companyId, input.companyId),
          ),
        )
        .all();

      // Step 2 — verify the toEmployee is also a member.
      for (const { threadId } of candidates) {
        const hasOther = db
          .select({ memberId: threadMembers.memberId })
          .from(threadMembers)
          .where(
            and(
              eq(threadMembers.threadId, threadId),
              eq(threadMembers.memberId, input.toEmployeeId),
              eq(threadMembers.memberKind, 'employee'),
            ),
          )
          .get();
        if (hasOther) return threadId;
      }

      // Create a new employee↔employee DM thread.
      const id = nanoid();
      db.insert(threads)
        .values({
          id,
          companyId: input.companyId,
          kind: 'dm',
          subject: null,
          createdBy: input.fromEmployeeId,
          createdAt: Date.now(),
        })
        .run();
      db.insert(threadMembers)
        .values([
          {
            threadId: id,
            memberId: input.fromEmployeeId,
            memberKind: 'employee',
            roleInThread: null,
          },
          {
            threadId: id,
            memberId: input.toEmployeeId,
            memberKind: 'employee',
            roleInThread: null,
          },
        ])
        .run();
      return id;
    },

    /**
     * Update the `last_message_at` timestamp on a thread. Called after
     * every message append so the thread list can sort by recency.
     */
    updateLastMessageAt(threadId: string, timestamp: number): void {
      db.update(threads).set({ lastMessageAt: timestamp }).where(eq(threads.id, threadId)).run();
    },

    /**
     * Return every thread for a company with its membership list,
     * ordered by effective recency desc (most-recent first). Older DBs
     * can have null `lastMessageAt` on active threads, so we recover
     * from message history and project the repaired timestamp.
     */
    listByCompanyWithMembers(companyId: string): ThreadWithMembers[] {
      const rows = db
        .select()
        .from(threads)
        .where(eq(threads.companyId, companyId))
        .all();

      return rows
        .map((row) => {
          const latestMessage = db
            .select({ createdAt: messages.createdAt })
            .from(messages)
            .where(eq(messages.threadId, row.id))
            .orderBy(desc(messages.createdAt))
            .limit(1)
            .get();

          return {
            ...row,
            lastMessageAt: row.lastMessageAt ?? latestMessage?.createdAt ?? null,
            members: db
              .select()
              .from(threadMembers)
              .where(eq(threadMembers.threadId, row.id))
              .all(),
          };
        })
        .sort((a, b) => {
          const aRecency = a.lastMessageAt ?? Number.NEGATIVE_INFINITY;
          const bRecency = b.lastMessageAt ?? Number.NEGATIVE_INFINITY;
          if (aRecency !== bRecency) return bRecency - aRecency;
          return b.createdAt - a.createdAt;
        });
    },
  };
}
