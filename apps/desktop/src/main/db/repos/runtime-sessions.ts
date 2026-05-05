import type { RuntimeProfileKind, RuntimeSessionStatus } from '@team-x/shared-types';
import { desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { runtimeHeartbeats, runtimeSessions } from '../schema.js';

export type RuntimeSessionRow = typeof runtimeSessions.$inferSelect;
export type RuntimeHeartbeatRow = typeof runtimeHeartbeats.$inferSelect;

export const LIVE_RUNTIME_SESSION_STATUSES = [
  'starting',
  'idle',
  'working',
  'blocked',
] as const satisfies readonly RuntimeSessionStatus[];

export interface CreateRuntimeSessionInput {
  companyId: string;
  employeeId: string;
  runtimeProfileId?: string | null;
  adapterKind: RuntimeProfileKind;
  status?: RuntimeSessionStatus;
  currentRunId?: string | null;
  currentTicketId?: string | null;
  pid?: number | null;
  endpointUrl?: string | null;
  workspacePath?: string | null;
  capabilitiesJson?: string;
  leaseExpiresAt?: number | null;
  now?: number;
}

export interface RecordRuntimeHeartbeatInput {
  sessionId: string;
  status?: RuntimeSessionStatus;
  currentRunId?: string | null;
  currentTicketId?: string | null;
  costDeltaJson?: string;
  message?: string | null;
  leaseExpiresAt?: number | null;
  now?: number;
}

export interface UpdateRuntimeSessionInput {
  status?: RuntimeSessionStatus;
  currentRunId?: string | null;
  currentTicketId?: string | null;
  pid?: number | null;
  endpointUrl?: string | null;
  workspacePath?: string | null;
  capabilitiesJson?: string;
  leaseExpiresAt?: number | null;
  failureReason?: string | null;
  endedAt?: number | null;
}

type RuntimeSessionsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function isLiveStatus(status: string): status is (typeof LIVE_RUNTIME_SESSION_STATUSES)[number] {
  return LIVE_RUNTIME_SESSION_STATUSES.includes(
    status as (typeof LIVE_RUNTIME_SESSION_STATUSES)[number],
  );
}

export function createRuntimeSessionsRepo<TRunResult>(db: RuntimeSessionsDb<TRunResult>) {
  return {
    create(input: CreateRuntimeSessionInput): string {
      const id = nanoid();
      const now = input.now ?? Date.now();
      db.insert(runtimeSessions)
        .values({
          id,
          companyId: input.companyId,
          employeeId: input.employeeId,
          runtimeProfileId: input.runtimeProfileId ?? null,
          adapterKind: input.adapterKind,
          status: input.status ?? 'starting',
          currentRunId: input.currentRunId ?? null,
          currentTicketId: input.currentTicketId ?? null,
          pid: input.pid ?? null,
          endpointUrl: input.endpointUrl ?? null,
          workspacePath: input.workspacePath ?? null,
          capabilitiesJson: input.capabilitiesJson ?? '{}',
          lastHeartbeatAt: null,
          leaseExpiresAt: input.leaseExpiresAt ?? null,
          failureReason: null,
          startedAt: now,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): RuntimeSessionRow | null {
      return db.select().from(runtimeSessions).where(eq(runtimeSessions.id, id)).get() ?? null;
    },

    listByCompany(companyId: string): RuntimeSessionRow[] {
      return db
        .select()
        .from(runtimeSessions)
        .where(eq(runtimeSessions.companyId, companyId))
        .orderBy(desc(runtimeSessions.updatedAt))
        .all();
    },

    listLiveByCompany(companyId: string): RuntimeSessionRow[] {
      return this.listByCompany(companyId).filter(
        (row) => row.endedAt === null && isLiveStatus(row.status),
      );
    },

    update(
      id: string,
      patch: UpdateRuntimeSessionInput,
      now = Date.now(),
    ): RuntimeSessionRow | null {
      const existing = this.getById(id);
      if (!existing) return null;
      const next: Record<string, unknown> = { updatedAt: now };
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.currentRunId !== undefined) next.currentRunId = patch.currentRunId;
      if (patch.currentTicketId !== undefined) next.currentTicketId = patch.currentTicketId;
      if (patch.pid !== undefined) next.pid = patch.pid;
      if (patch.endpointUrl !== undefined) next.endpointUrl = patch.endpointUrl;
      if (patch.workspacePath !== undefined) next.workspacePath = patch.workspacePath;
      if (patch.capabilitiesJson !== undefined) next.capabilitiesJson = patch.capabilitiesJson;
      if (patch.leaseExpiresAt !== undefined) next.leaseExpiresAt = patch.leaseExpiresAt;
      if (patch.failureReason !== undefined) next.failureReason = patch.failureReason;
      if (patch.endedAt !== undefined) next.endedAt = patch.endedAt;
      db.update(runtimeSessions).set(next).where(eq(runtimeSessions.id, id)).run();
      return this.getById(id);
    },

    recordHeartbeat(input: RecordRuntimeHeartbeatInput): RuntimeHeartbeatRow {
      return db.transaction((tx) => {
        const session = tx
          .select()
          .from(runtimeSessions)
          .where(eq(runtimeSessions.id, input.sessionId))
          .get();
        if (!session) {
          throw new Error(`[runtime-sessions] session not found: ${input.sessionId}`);
        }

        const now = input.now ?? Date.now();
        const status = input.status ?? (session.status as RuntimeSessionStatus);
        const currentRunId = input.currentRunId ?? session.currentRunId;
        const currentTicketId = input.currentTicketId ?? session.currentTicketId;
        const heartbeatId = nanoid();
        const heartbeat: RuntimeHeartbeatRow = {
          id: heartbeatId,
          sessionId: session.id,
          companyId: session.companyId,
          employeeId: session.employeeId,
          runtimeProfileId: session.runtimeProfileId,
          status,
          currentRunId,
          currentTicketId,
          costDeltaJson: input.costDeltaJson ?? '{}',
          message: input.message ?? null,
          createdAt: now,
        };
        tx.insert(runtimeHeartbeats).values(heartbeat).run();
        tx.update(runtimeSessions)
          .set({
            status,
            currentRunId,
            currentTicketId,
            lastHeartbeatAt: now,
            leaseExpiresAt: input.leaseExpiresAt ?? session.leaseExpiresAt,
            updatedAt: now,
          })
          .where(eq(runtimeSessions.id, session.id))
          .run();
        return heartbeat;
      });
    },

    listHeartbeats(sessionId: string, limit = 50): RuntimeHeartbeatRow[] {
      return db
        .select()
        .from(runtimeHeartbeats)
        .where(eq(runtimeHeartbeats.sessionId, sessionId))
        .orderBy(desc(runtimeHeartbeats.createdAt))
        .limit(limit)
        .all();
    },

    markEnded(
      id: string,
      input: { status?: RuntimeSessionStatus; failureReason?: string | null; now?: number } = {},
    ): RuntimeSessionRow | null {
      const now = input.now ?? Date.now();
      return this.update(
        id,
        {
          status: input.status ?? 'ended',
          failureReason: input.failureReason ?? null,
          endedAt: now,
          leaseExpiresAt: null,
        },
        now,
      );
    },

    markStaleBefore(input: {
      companyId?: string;
      staleBefore: number;
      now?: number;
      reason?: string;
    }): RuntimeSessionRow[] {
      const now = input.now ?? Date.now();
      const candidates = input.companyId
        ? this.listByCompany(input.companyId)
        : db.select().from(runtimeSessions).all();
      const staleRows = candidates.filter(
        (row) =>
          row.endedAt === null &&
          isLiveStatus(row.status) &&
          (row.lastHeartbeatAt === null || row.lastHeartbeatAt <= input.staleBefore),
      );
      for (const row of staleRows) {
        db.update(runtimeSessions)
          .set({
            status: 'stale',
            failureReason: input.reason ?? 'runtime heartbeat is stale',
            updatedAt: now,
          })
          .where(eq(runtimeSessions.id, row.id))
          .run();
      }
      return staleRows
        .map((row) => this.getById(row.id))
        .filter((row): row is RuntimeSessionRow => row !== null);
    },
  };
}

export type RuntimeSessionsRepo = ReturnType<typeof createRuntimeSessionsRepo>;
