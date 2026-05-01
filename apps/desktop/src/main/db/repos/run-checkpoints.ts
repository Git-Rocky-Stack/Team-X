import type { RunCheckpointKind } from '@team-x/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';


import type { Schema } from '../client.js';
import { runCheckpoints } from '../schema.js';

export type RunCheckpointRow = typeof runCheckpoints.$inferSelect;

export interface CreateRunCheckpointInput {
  companyId: string;
  threadId: string;
  runId?: string | null;
  employeeId?: string | null;
  checkpointKind: RunCheckpointKind;
  objective?: string | null;
  progressSummary: string;
  blockersJson?: string;
  nextAction?: string | null;
  activeArtifactRefsJson?: string;
  unresolvedApprovalRefsJson?: string;
  resumeOriginJson?: string | null;
  createdAt?: number;
}

type RunCheckpointsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createRunCheckpointsRepo<TRunResult>(db: RunCheckpointsDb<TRunResult>) {
  return {
    create(input: CreateRunCheckpointInput): string {
      const id = nanoid();
      db.insert(runCheckpoints)
        .values({
          id,
          companyId: input.companyId,
          threadId: input.threadId,
          runId: input.runId ?? null,
          employeeId: input.employeeId ?? null,
          checkpointKind: input.checkpointKind,
          objective: input.objective ?? null,
          progressSummary: input.progressSummary,
          blockersJson: input.blockersJson ?? '[]',
          nextAction: input.nextAction ?? null,
          activeArtifactRefsJson: input.activeArtifactRefsJson ?? '[]',
          unresolvedApprovalRefsJson: input.unresolvedApprovalRefsJson ?? '[]',
          resumeOriginJson: input.resumeOriginJson ?? null,
          createdAt: input.createdAt ?? Date.now(),
        })
        .run();
      return id;
    },

    getById(id: string): RunCheckpointRow | null {
      return db.select().from(runCheckpoints).where(eq(runCheckpoints.id, id)).get() ?? null;
    },

    getLatestByCompanyThread(companyId: string, threadId: string): RunCheckpointRow | null {
      return (
        db
          .select()
          .from(runCheckpoints)
          .where(
            and(eq(runCheckpoints.companyId, companyId), eq(runCheckpoints.threadId, threadId)),
          )
          .orderBy(desc(runCheckpoints.createdAt))
          .get() ?? null
      );
    },

    listByCompanyThread(companyId: string, threadId: string, limit = 10): RunCheckpointRow[] {
      return db
        .select()
        .from(runCheckpoints)
        .where(and(eq(runCheckpoints.companyId, companyId), eq(runCheckpoints.threadId, threadId)))
        .orderBy(desc(runCheckpoints.createdAt))
        .limit(limit)
        .all();
    },
  };
}

export type RunCheckpointsRepo = ReturnType<typeof createRunCheckpointsRepo>;
