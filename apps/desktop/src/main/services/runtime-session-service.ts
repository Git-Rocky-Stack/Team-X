import type {
  RuntimeHeartbeat,
  RuntimeProfileKind,
  RuntimeSession,
  RuntimeSessionStatus,
} from '@team-x/shared-types';

import type {
  RecordRuntimeHeartbeatInput,
  RuntimeHeartbeatRow,
  RuntimeSessionRow,
  RuntimeSessionsRepo,
} from '../db/repos/runtime-sessions.js';
import type { RuntimeAuditContext, RuntimeAuditNormalizer } from './runtime-audit-normalizer-service.js';

export interface StartRuntimeSessionInput {
  companyId: string;
  employeeId: string;
  runtimeProfileId?: string | null;
  adapterKind: RuntimeProfileKind;
  currentRunId?: string | null;
  currentTicketId?: string | null;
  pid?: number | null;
  endpointUrl?: string | null;
  workspacePath?: string | null;
  capabilities?: Record<string, unknown>;
  leaseExpiresAt?: number | null;
  now?: number;
}

export interface RuntimeSessionServiceDeps {
  runtimeSessionsRepo: RuntimeSessionsRepo;
  runtimeAuditNormalizer?: RuntimeAuditNormalizer;
}

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt runtime diagnostics should not make the control plane unreadable.
  }
  return {};
}

export function rowToRuntimeSession(row: RuntimeSessionRow): RuntimeSession {
  return {
    id: row.id,
    companyId: row.companyId,
    employeeId: row.employeeId,
    runtimeProfileId: row.runtimeProfileId,
    adapterKind: row.adapterKind as RuntimeProfileKind,
    status: row.status as RuntimeSessionStatus,
    currentRunId: row.currentRunId,
    currentTicketId: row.currentTicketId,
    pid: row.pid,
    endpointUrl: row.endpointUrl,
    workspacePath: row.workspacePath,
    capabilities: parseRecord(row.capabilitiesJson),
    lastHeartbeatAt: row.lastHeartbeatAt,
    leaseExpiresAt: row.leaseExpiresAt,
    failureReason: row.failureReason,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToRuntimeHeartbeat(row: RuntimeHeartbeatRow): RuntimeHeartbeat {
  return {
    id: row.id,
    sessionId: row.sessionId,
    companyId: row.companyId,
    employeeId: row.employeeId,
    runtimeProfileId: row.runtimeProfileId,
    status: row.status as RuntimeSessionStatus,
    currentRunId: row.currentRunId,
    currentTicketId: row.currentTicketId,
    costDelta: parseRecord(row.costDeltaJson),
    message: row.message,
    createdAt: row.createdAt,
  };
}

function runtimeAuditContextFromRow(row: RuntimeSessionRow): RuntimeAuditContext {
  return {
    companyId: row.companyId,
    employeeId: row.employeeId,
    runtimeProfileId: row.runtimeProfileId,
    adapterKind: row.adapterKind as RuntimeProfileKind,
    transport: null,
    sessionId: row.id,
    runId: row.currentRunId,
    threadId: null,
    ticketId: row.currentTicketId,
    checkoutId: null,
    workspacePath: row.workspacePath,
    endpointUrl: row.endpointUrl,
    leaseExpiresAt: row.leaseExpiresAt,
  };
}

export function createRuntimeSessionService({
  runtimeSessionsRepo,
  runtimeAuditNormalizer,
}: RuntimeSessionServiceDeps) {
  return {
    start(input: StartRuntimeSessionInput): RuntimeSession {
      const sessionId = runtimeSessionsRepo.create({
        companyId: input.companyId,
        employeeId: input.employeeId,
        runtimeProfileId: input.runtimeProfileId ?? null,
        adapterKind: input.adapterKind,
        currentRunId: input.currentRunId ?? null,
        currentTicketId: input.currentTicketId ?? null,
        pid: input.pid ?? null,
        endpointUrl: input.endpointUrl ?? null,
        workspacePath: input.workspacePath ?? null,
        capabilitiesJson: JSON.stringify(input.capabilities ?? {}),
        leaseExpiresAt: input.leaseExpiresAt ?? null,
        now: input.now,
      });
      const row = runtimeSessionsRepo.getById(sessionId);
      if (!row) {
        throw new Error('[runtime-session-service] session insert did not round-trip');
      }
      return rowToRuntimeSession(row);
    },

    get(sessionId: string): RuntimeSession | null {
      const row = runtimeSessionsRepo.getById(sessionId);
      return row ? rowToRuntimeSession(row) : null;
    },

    list(companyId: string): RuntimeSession[] {
      return runtimeSessionsRepo.listByCompany(companyId).map(rowToRuntimeSession);
    },

    listLive(companyId: string): RuntimeSession[] {
      return runtimeSessionsRepo.listLiveByCompany(companyId).map(rowToRuntimeSession);
    },

    heartbeat(input: RecordRuntimeHeartbeatInput): RuntimeHeartbeat {
      return rowToRuntimeHeartbeat(runtimeSessionsRepo.recordHeartbeat(input));
    },

    end(
      sessionId: string,
      input: { status?: RuntimeSessionStatus; failureReason?: string | null; now?: number } = {},
    ): RuntimeSession | null {
      const row = runtimeSessionsRepo.markEnded(sessionId, input);
      return row ? rowToRuntimeSession(row) : null;
    },

    reapStale(input: {
      companyId?: string;
      staleBefore: number;
      now?: number;
      reason?: string;
    }): RuntimeSession[] {
      return runtimeSessionsRepo.markStaleBefore(input).map((row) => {
        runtimeAuditNormalizer?.emit({
          ...runtimeAuditContextFromRow(row),
          type: 'runtime.session.stale',
          status: 'stale',
          message: row.failureReason ?? input.reason ?? 'runtime heartbeat is stale',
        });
        return rowToRuntimeSession(row);
      });
    },

    recover(
      sessionId: string,
      input: { status?: Exclude<RuntimeSessionStatus, 'stale'>; now?: number } = {},
    ): RuntimeSession | null {
      const before = runtimeSessionsRepo.getById(sessionId);
      const row = runtimeSessionsRepo.update(
        sessionId,
        {
          status: input.status ?? 'idle',
          failureReason: null,
        },
        input.now,
      );
      if (row && before?.status === 'stale') {
        runtimeAuditNormalizer?.emit({
          ...runtimeAuditContextFromRow(row),
          type: 'runtime.session.recovered',
          status: row.status as RuntimeSessionStatus,
          message: 'Runtime session recovered from stale heartbeat state.',
        });
      }
      return row ? rowToRuntimeSession(row) : null;
    },
  };
}

export type RuntimeSessionService = ReturnType<typeof createRuntimeSessionService>;
