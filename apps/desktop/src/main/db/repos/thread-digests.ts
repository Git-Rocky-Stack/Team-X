import type { ThreadDigestFreshnessState } from '@team-x/shared-types';
import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { threadDigests } from '../schema.js';

export type ThreadDigestRow = typeof threadDigests.$inferSelect;

export interface UpsertThreadDigestInput {
  companyId: string;
  threadId: string;
  summary: string;
  pinnedFactsJson?: string;
  lastSummarizedMessageId?: string | null;
  estimatedTokens?: number;
  freshness?: ThreadDigestFreshnessState;
}

type ThreadDigestsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createThreadDigestsRepo<TRunResult>(db: ThreadDigestsDb<TRunResult>) {
  return {
    getByCompanyThread(companyId: string, threadId: string): ThreadDigestRow | null {
      return (
        db
          .select()
          .from(threadDigests)
          .where(and(eq(threadDigests.companyId, companyId), eq(threadDigests.threadId, threadId)))
          .get() ?? null
      );
    },

    upsert(input: UpsertThreadDigestInput): ThreadDigestRow {
      const existing = this.getByCompanyThread(input.companyId, input.threadId);
      const now = Date.now();
      if (existing) {
        const next: ThreadDigestRow = {
          ...existing,
          summary: input.summary,
          pinnedFactsJson: input.pinnedFactsJson ?? existing.pinnedFactsJson,
          lastSummarizedMessageId:
            input.lastSummarizedMessageId === undefined
              ? existing.lastSummarizedMessageId
              : input.lastSummarizedMessageId,
          estimatedTokens: input.estimatedTokens ?? existing.estimatedTokens,
          freshness: input.freshness ?? existing.freshness,
          updatedAt: now,
        };
        db.update(threadDigests)
          .set({
            summary: next.summary,
            pinnedFactsJson: next.pinnedFactsJson,
            lastSummarizedMessageId: next.lastSummarizedMessageId,
            estimatedTokens: next.estimatedTokens,
            freshness: next.freshness,
            updatedAt: next.updatedAt,
          })
          .where(eq(threadDigests.id, existing.id))
          .run();
        return next;
      }

      const row: ThreadDigestRow = {
        id: nanoid(),
        companyId: input.companyId,
        threadId: input.threadId,
        summary: input.summary,
        pinnedFactsJson: input.pinnedFactsJson ?? '[]',
        lastSummarizedMessageId: input.lastSummarizedMessageId ?? null,
        estimatedTokens: input.estimatedTokens ?? 0,
        freshness: input.freshness ?? 'stale',
        createdAt: now,
        updatedAt: now,
      };
      db.insert(threadDigests).values(row).run();
      return row;
    },
  };
}

export type ThreadDigestsRepo = ReturnType<typeof createThreadDigestsRepo>;
