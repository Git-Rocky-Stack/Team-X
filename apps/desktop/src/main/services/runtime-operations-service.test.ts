import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createRuntimeSessionsRepo } from '../db/repos/runtime-sessions.js';
import { createTicketCheckoutsRepo } from '../db/repos/ticket-checkouts.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createRuntimeOperationsService } from './runtime-operations-service.js';
import { createRuntimeSessionService } from './runtime-session-service.js';

describe('runtime operations service', () => {
  let ctx: TestDbHandle;
  let companyId: string;
  let employeeId: string;
  let ticketId: string;
  let runtimeSessionService: ReturnType<typeof createRuntimeSessionService>;
  let ticketCheckoutsRepo: ReturnType<typeof createTicketCheckoutsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    const tickets = createTicketsRepo(ctx.db);
    runtimeSessionService = createRuntimeSessionService({
      runtimeSessionsRepo: createRuntimeSessionsRepo(ctx.db),
    });
    ticketCheckoutsRepo = createTicketCheckoutsRepo(ctx.db);

    companyId = companies.create({ name: 'Runtime Co', slug: 'runtime-co' });
    employeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'cto',
      roleMdSha: 'abc123',
      level: 'Officer',
      name: 'Iris',
      title: 'CTO',
    });
    ticketId = tickets.create({ companyId, title: 'Ship runtime surface', reporterId: 'rocky' });
  });

  afterEach(() => ctx.close());

  it('returns live runtime sessions and active ticket checkout leases', () => {
    const service = createRuntimeOperationsService({
      runtimeSessionService,
      ticketCheckoutsRepo,
      now: () => 500,
    });
    const session = runtimeSessionService.start({
      companyId,
      employeeId,
      adapterKind: 'codex',
      currentTicketId: ticketId,
      workspacePath: 'C:\\Team-X\\runtime-home',
      capabilities: { heartbeatContract: 'team-x-runtime-heartbeat/v1' },
      now: 100,
    });
    runtimeSessionService.heartbeat({
      sessionId: session.id,
      status: 'working',
      currentTicketId: ticketId,
      now: 200,
    });
    const checkout = ticketCheckoutsRepo.claim({
      companyId,
      ticketId,
      employeeId,
      runtimeSessionId: session.id,
      expiresAt: 1_000,
      now: 150,
    });

    const snapshot = service.snapshot(companyId);

    expect(snapshot).toEqual(
      expect.objectContaining({
        companyId,
        generatedAt: 500,
      }),
    );
    expect(snapshot.sessions).toEqual([
      expect.objectContaining({
        id: session.id,
        status: 'working',
        currentTicketId: ticketId,
        capabilities: { heartbeatContract: 'team-x-runtime-heartbeat/v1' },
      }),
    ]);
    expect(snapshot.activeCheckouts).toEqual([
      expect.objectContaining({
        id: checkout.checkout.id,
        ticketId,
        runtimeSessionId: session.id,
        status: 'active',
      }),
    ]);
  });

  it('expires stale checkout leases before returning the active snapshot', () => {
    const service = createRuntimeOperationsService({
      runtimeSessionService,
      ticketCheckoutsRepo,
      now: () => 500,
    });
    const checkout = ticketCheckoutsRepo.claim({
      companyId,
      ticketId,
      employeeId,
      expiresAt: 300,
      now: 100,
    });

    const snapshot = service.snapshot(companyId);

    expect(snapshot.activeCheckouts).toEqual([]);
    expect(ticketCheckoutsRepo.getById(checkout.checkout.id)?.status).toBe('expired');
  });

  it('marks stale runtime sessions before projecting Mission Control operations', () => {
    const service = createRuntimeOperationsService({
      runtimeSessionService,
      ticketCheckoutsRepo,
      now: () => 1_000,
      staleSessionMs: 100,
    });
    const session = runtimeSessionService.start({
      companyId,
      employeeId,
      adapterKind: 'codex',
      now: 100,
    });
    runtimeSessionService.heartbeat({
      sessionId: session.id,
      status: 'working',
      now: 200,
    });

    const snapshot = service.snapshot(companyId);

    expect(snapshot.sessions).toEqual([
      expect.objectContaining({
        id: session.id,
        status: 'stale',
        failureReason: 'runtime heartbeat is stale',
      }),
    ]);
  });
});
