import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createTicketCheckoutsRepo } from './ticket-checkouts.js';
import { createTicketsRepo } from './tickets.js';

describe('ticket checkouts repo', () => {
  let ctx: TestDbHandle;
  let checkouts: ReturnType<typeof createTicketCheckoutsRepo>;
  let companyId: string;
  let employeeId: string;
  let secondEmployeeId: string;
  let ticketId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    const tickets = createTicketsRepo(ctx.db);
    checkouts = createTicketCheckoutsRepo(ctx.db);
    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    employeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'cto',
      roleMdSha: 'abc123',
      level: 'Officer',
      name: 'Alice',
      title: 'CTO',
    });
    secondEmployeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'def456',
      level: 'Officer',
      name: 'Bob',
      title: 'CEO',
    });
    ticketId = tickets.create({ companyId, title: 'Build adapter', reporterId: 'rocky' });
  });

  afterEach(() => ctx.close());

  it('claims a ticket when no active checkout exists', () => {
    const result = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      runtimeSessionId: null,
      expiresAt: 1_000,
      now: 100,
    });

    expect(result.outcome).toBe('claimed');
    expect(result.checkout).toEqual(
      expect.objectContaining({
        ticketId,
        employeeId,
        status: 'active',
        claimedAt: 100,
        expiresAt: 1_000,
      }),
    );
    expect(checkouts.getActiveByTicket(ticketId)?.id).toBe(result.checkout.id);
  });

  it('refreshes a self-owned active checkout instead of creating a duplicate', () => {
    const first = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      runtimeSessionId: null,
      runId: null,
      expiresAt: 1_000,
      now: 100,
    });
    const second = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      runtimeSessionId: null,
      runId: null,
      expiresAt: 2_000,
      now: 200,
    });

    expect(second.outcome).toBe('already-owned-by-self');
    expect(second.checkout.id).toBe(first.checkout.id);
    expect(second.checkout.expiresAt).toBe(2_000);
    expect(checkouts.listByTicket(ticketId)).toHaveLength(1);
  });

  it('returns a conflict when another employee owns an unexpired checkout', () => {
    const first = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      expiresAt: 1_000,
      now: 100,
    });
    const second = checkouts.claim({
      companyId,
      ticketId,
      employeeId: secondEmployeeId,
      expiresAt: 1_000,
      now: 200,
    });

    expect(second.outcome).toBe('conflict');
    expect(second.conflictingCheckout.id).toBe(first.checkout.id);
    expect(checkouts.getActiveByTicket(ticketId)?.id).toBe(first.checkout.id);
  });

  it('expires and reclaims a stale active checkout atomically', () => {
    const first = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      expiresAt: 150,
      now: 100,
    });
    const second = checkouts.claim({
      companyId,
      ticketId,
      employeeId: secondEmployeeId,
      expiresAt: 1_000,
      now: 200,
    });

    expect(second.outcome).toBe('expired-reclaimed');
    expect(second.previousCheckout.id).toBe(first.checkout.id);
    expect(checkouts.getById(first.checkout.id)?.status).toBe('expired');
    expect(checkouts.getActiveByTicket(ticketId)?.id).toBe(second.checkout.id);
  });

  it('releases active checkouts with terminal status and reason', () => {
    const claim = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      expiresAt: 1_000,
      now: 100,
    });

    const released = checkouts.release({
      checkoutId: claim.checkout.id,
      status: 'completed',
      releaseReason: 'artifact accepted',
      now: 300,
    });

    expect(released).toEqual(
      expect.objectContaining({
        status: 'completed',
        releasedAt: 300,
        releaseReason: 'artifact accepted',
      }),
    );
    expect(checkouts.getActiveByTicket(ticketId)).toBeNull();
  });

  it('expires active checkouts whose lease has elapsed', () => {
    const claim = checkouts.claim({
      companyId,
      ticketId,
      employeeId,
      expiresAt: 150,
      now: 100,
    });

    const expired = checkouts.expireStale({ companyId, now: 200 });

    expect(expired.map((row) => row.id)).toEqual([claim.checkout.id]);
    expect(checkouts.getById(claim.checkout.id)?.status).toBe('expired');
  });
});
