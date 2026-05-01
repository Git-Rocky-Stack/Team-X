import type {
  RuntimeOperationsSnapshot,
  TicketCheckout,
  TicketCheckoutStatus,
} from '@team-x/shared-types';

import type { TicketCheckoutRow, TicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';

import type { RuntimeSessionService } from './runtime-session-service.js';

export interface RuntimeOperationsServiceDeps {
  runtimeSessionService: RuntimeSessionService;
  ticketCheckoutsRepo: Pick<TicketCheckoutsRepo, 'expireStale' | 'listActiveByCompany'>;
  now?: () => number;
  staleSessionMs?: number;
}

const DEFAULT_STALE_SESSION_MS = 2 * 60 * 1000;

function rowToTicketCheckout(row: TicketCheckoutRow): TicketCheckout {
  return {
    id: row.id,
    companyId: row.companyId,
    ticketId: row.ticketId,
    employeeId: row.employeeId,
    runtimeSessionId: row.runtimeSessionId,
    runId: row.runId,
    status: row.status as TicketCheckoutStatus,
    claimedAt: row.claimedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    expiresAt: row.expiresAt,
    releasedAt: row.releasedAt,
    releaseReason: row.releaseReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createRuntimeOperationsService({
  runtimeSessionService,
  ticketCheckoutsRepo,
  now = Date.now,
  staleSessionMs = DEFAULT_STALE_SESSION_MS,
}: RuntimeOperationsServiceDeps) {
  return {
    snapshot(companyId: string): RuntimeOperationsSnapshot {
      const generatedAt = now();
      ticketCheckoutsRepo.expireStale({ companyId, now: generatedAt });
      runtimeSessionService.reapStale({
        companyId,
        staleBefore: generatedAt - staleSessionMs,
        now: generatedAt,
      });

      return {
        companyId,
        generatedAt,
        sessions: runtimeSessionService
          .list(companyId)
          .filter((session) => session.endedAt === null),
        activeCheckouts: ticketCheckoutsRepo
          .listActiveByCompany(companyId)
          .map(rowToTicketCheckout),
      };
    },
  };
}

export type RuntimeOperationsService = ReturnType<typeof createRuntimeOperationsService>;
