import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type {
  ArtifactOutcomeKind,
  ArtifactRecordKind,
  ArtifactSourceKind,
  ArtifactStatus,
} from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { artifacts } from '../schema.js';

export type ArtifactRow = typeof artifacts.$inferSelect;

export interface CreateArtifactInput {
  companyId: string;
  kind: ArtifactRecordKind;
  outcomeKind: ArtifactOutcomeKind;
  status?: ArtifactStatus;
  title: string;
  summary?: string | null;
  sourceKind: ArtifactSourceKind;
  sourceRefId: string;
  ticketId?: string | null;
  fileId?: string | null;
  approvalItemId?: string | null;
  approvalDecisionId?: string | null;
  uri?: string | null;
  previewJson?: string;
  createdByEmployeeId?: string | null;
  createdByRoutineId?: string | null;
  approvedByOperatorId?: string | null;
  createdAt?: number;
}

export interface ListArtifactsInput {
  companyId: string;
  limit?: number;
}

type ArtifactsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createArtifactsRepo<TRunResult>(db: ArtifactsDb<TRunResult>) {
  function findBySource(
    companyId: string,
    kind: ArtifactRecordKind,
    sourceKind: ArtifactSourceKind,
    sourceRefId: string,
  ): ArtifactRow | null {
    return (
      db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.companyId, companyId),
            eq(artifacts.kind, kind),
            eq(artifacts.sourceKind, sourceKind),
            eq(artifacts.sourceRefId, sourceRefId),
          ),
        )
        .get() ?? null
    );
  }

  return {
    create(input: CreateArtifactInput): string {
      const existing = findBySource(input.companyId, input.kind, input.sourceKind, input.sourceRefId);
      if (existing) return existing.id;

      const id = nanoid();
      const now = input.createdAt ?? Date.now();
      db.insert(artifacts)
        .values({
          id,
          companyId: input.companyId,
          kind: input.kind,
          outcomeKind: input.outcomeKind,
          status: input.status ?? 'ready',
          title: input.title,
          summary: input.summary ?? null,
          sourceKind: input.sourceKind,
          sourceRefId: input.sourceRefId,
          ticketId: input.ticketId ?? null,
          fileId: input.fileId ?? null,
          approvalItemId: input.approvalItemId ?? null,
          approvalDecisionId: input.approvalDecisionId ?? null,
          uri: input.uri ?? null,
          previewJson: input.previewJson ?? '{}',
          createdByEmployeeId: input.createdByEmployeeId ?? null,
          createdByRoutineId: input.createdByRoutineId ?? null,
          approvedByOperatorId: input.approvedByOperatorId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): ArtifactRow | null {
      return db.select().from(artifacts).where(eq(artifacts.id, id)).get() ?? null;
    },

    findBySource,

    listByCompany(input: ListArtifactsInput): ArtifactRow[] {
      return db
        .select()
        .from(artifacts)
        .where(eq(artifacts.companyId, input.companyId))
        .orderBy(desc(artifacts.createdAt), desc(artifacts.updatedAt))
        .limit(input.limit ?? 100)
        .all();
    },
  };
}

export type ArtifactsRepo = ReturnType<typeof createArtifactsRepo>;
