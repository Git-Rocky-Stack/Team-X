/**
 * Messages repository — append-heavy CRUD for the `messages` table.
 *
 * Phase 1 messages have three write paths:
 *
 * 1. `append` — normal case: a new message is added to a thread. Returns
 *    the generated id so callers can reference the row later (for edits,
 *    streaming updates, or parent threading).
 *
 * 2. `updateContent` — streaming update: while an LLM response is being
 *    streamed token-by-token, the orchestrator writes an initial row via
 *    `append` and then repeatedly overwrites its `content` column via
 *    `updateContent` until the stream closes. This keeps a single stable
 *    message id visible to the renderer's event feed rather than creating
 *    a storm of new rows per token.
 *
 * 3. (Future) soft-delete via a `deletedAt` column — not in Phase 1.
 *
 * Reads are `listByThread` only. The messages list is ordered ascending
 * by `createdAt` so the renderer can render oldest-first without
 * re-sorting. Cross-thread queries land in Task 23+ if needed.
 *
 * Cross-driver generic typing — same pattern as companies/employees/threads.
 */

import type { AuthorKind } from '@team-x/shared-types';
import { asc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { messages } from '../schema.js';

export type MessageRow = typeof messages.$inferSelect;

/**
 * Re-export the canonical `AuthorKind` from shared-types so intra-repo
 * callers can import it from this module. Consumers outside `db/repos/`
 * should prefer the direct `@team-x/shared-types` import.
 */
export type { AuthorKind };

export interface AppendMessageInput {
  threadId: string;
  authorId: string;
  authorKind: AuthorKind;
  content: string;
  /** Optional tool-call log. Serialized to JSON on insert. */
  toolCalls?: unknown;
  /** Optional parent message id for threaded replies (meetings, etc.). */
  parentId?: string;
}

type MessagesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createMessagesRepo<TRunResult>(db: MessagesDb<TRunResult>) {
  return {
    /**
     * Append a new message to a thread. Throws if `threadId` does not
     * reference an existing thread (FK enforced via pragma).
     */
    append(input: AppendMessageInput): string {
      const id = nanoid();
      db.insert(messages)
        .values({
          id,
          threadId: input.threadId,
          authorId: input.authorId,
          authorKind: input.authorKind,
          content: input.content,
          toolCallsJson: input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
          parentId: input.parentId ?? null,
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    /**
     * Return every message belonging to a thread, ordered oldest-first
     * by `createdAt`. Phase 1 does not paginate.
     */
    listByThread(threadId: string): MessageRow[] {
      return db
        .select()
        .from(messages)
        .where(eq(messages.threadId, threadId))
        .orderBy(asc(messages.createdAt))
        .all();
    },

    /**
     * Overwrite the `content` of a single message. Intended for streaming
     * LLM responses: append once, update many times as tokens arrive.
     * No-op on unknown id (no throw) so streaming code paths don't need
     * presence checks on the hot path.
     */
    updateContent(id: string, content: string): void {
      db.update(messages).set({ content }).where(eq(messages.id, id)).run();
    },
  };
}
