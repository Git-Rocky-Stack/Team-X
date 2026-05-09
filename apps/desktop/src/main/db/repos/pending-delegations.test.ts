/**
 * Pending-delegations repo unit tests (C4 — audit 2026-05-07).
 *
 * The repo is the persistence half of the write-side amber gate. The
 * approval-inbox-service does the materialization (ticket insert +
 * queue + bus emits) and these tests ONLY pin storage semantics: insert,
 * read back, list-by-company-and-status, idempotent-by-design state
 * transitions, and the explicit error path when the operator double-acts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import {
  type PendingDelegationsRepo,
  createPendingDelegationsRepo,
} from './pending-delegations.js';

describe('pending-delegations repo (C4)', () => {
  let ctx: TestDbHandle;
  let pending: PendingDelegationsRepo;
  let companies: ReturnType<typeof createCompaniesRepo>;
  let employees: ReturnType<typeof createEmployeesRepo>;

  let companyId: string;
  let employeeId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    companies = createCompaniesRepo(ctx.db);
    employees = createEmployeesRepo(ctx.db);
    pending = createPendingDelegationsRepo(ctx.db);

    companyId = companies.create({ name: 'Acme', slug: 'acme' });
    employeeId = employees.create({
      companyId,
      rolePackId: 'pack',
      roleId: 'eng',
      roleMdSha: 'sha',
      level: 'ic',
      name: 'Lucas',
      title: 'Engineer',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  function makeBaseInput() {
    return {
      companyId,
      planId: 'plan-1',
      subtaskTitle: 'Implement login',
      assigneeId: employeeId,
      assigneeName: 'Lucas',
      score: 0.82,
      roleFit: 0.9,
      loadRatio: 0.2,
      availability: 1,
      pastPerformance: 0.55,
      reporterId: 'emp-actor',
    };
  }

  describe('create', () => {
    it('inserts a pending row and returns its id', () => {
      const id = pending.create(makeBaseInput());
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const row = pending.getById(id);
      expect(row).not.toBeNull();
      expect(row?.id).toBe(id);
      expect(row?.companyId).toBe(companyId);
      expect(row?.planId).toBe('plan-1');
      expect(row?.subtaskTitle).toBe('Implement login');
      expect(row?.assigneeId).toBe(employeeId);
      expect(row?.assigneeName).toBe('Lucas');
      expect(row?.status).toBe('pending');
      expect(row?.ticketId).toBeNull();
    });

    it('persists the four-component score breakdown verbatim', () => {
      const id = pending.create({
        ...makeBaseInput(),
        score: 0.7,
        roleFit: 0.95,
        loadRatio: 0.4,
        availability: 0,
        pastPerformance: 0.5,
      });
      const row = pending.getById(id);
      expect(row?.score).toBeCloseTo(0.7, 6);
      expect(row?.roleFit).toBeCloseTo(0.95, 6);
      expect(row?.loadRatio).toBeCloseTo(0.4, 6);
      expect(row?.availability).toBeCloseTo(0, 6);
      expect(row?.pastPerformance).toBeCloseTo(0.5, 6);
    });

    it('defaults priority/description/labels/dependencies and persists fallback flags', () => {
      const id = pending.create({
        ...makeBaseInput(),
        fallbackUsed: true,
        attemptCount: 2,
      });
      const row = pending.getById(id);
      expect(row?.priority).toBe('medium');
      expect(row?.description).toBe('');
      expect(row?.labelsJson).toBe('[]');
      expect(row?.dependenciesJson).toBe('[]');
      expect(row?.fallbackUsed).toBe(1);
      expect(row?.attemptCount).toBe(2);
    });

    it('honors injected `now` for deterministic timestamps', () => {
      const id = pending.create({ ...makeBaseInput(), now: 1_700_000_000_000 });
      const row = pending.getById(id);
      expect(row?.createdAt).toBe(1_700_000_000_000);
      expect(row?.updatedAt).toBe(1_700_000_000_000);
    });

    it('returns null from getById for unknown ids', () => {
      expect(pending.getById('nope')).toBeNull();
    });
  });

  describe('listByCompany / listPendingByCompany', () => {
    it('returns rows in newest-first order, scoped to company + status', async () => {
      const otherCo = companies.create({ name: 'Beta', slug: 'beta' });
      const otherEmp = employees.create({
        companyId: otherCo,
        rolePackId: 'p',
        roleId: 'r',
        roleMdSha: 's',
        level: 'ic',
        name: 'Other',
        title: 'T',
      });
      pending.create({ ...makeBaseInput(), now: 1_000 });
      pending.create({ ...makeBaseInput(), now: 3_000, subtaskTitle: 'Newer' });
      pending.create({ ...makeBaseInput(), now: 2_000, subtaskTitle: 'Middle' });
      pending.create({
        ...makeBaseInput(),
        companyId: otherCo,
        assigneeId: otherEmp,
        subtaskTitle: 'In other co',
      });

      const acme = pending.listByCompany(companyId);
      expect(acme.map((r) => r.subtaskTitle)).toEqual(['Newer', 'Middle', 'Implement login']);
      expect(acme.every((r) => r.companyId === companyId)).toBe(true);
    });

    it('listPendingByCompany filters out approved + rejected rows', () => {
      const aId = pending.create(makeBaseInput());
      const bId = pending.create({ ...makeBaseInput(), subtaskTitle: 'B' });
      const cId = pending.create({ ...makeBaseInput(), subtaskTitle: 'C' });

      pending.markApproved(aId, { operatorId: 'op-1', ticketId: 'tkt-x' });
      pending.markRejected(cId, { operatorId: 'op-1', rationale: 'no' });

      const onlyPending = pending.listPendingByCompany(companyId);
      expect(onlyPending).toHaveLength(1);
      expect(onlyPending[0]?.id).toBe(bId);
    });
  });

  describe('markApproved', () => {
    it('records the resolving operator + ticketId + flips status to approved', () => {
      const id = pending.create(makeBaseInput());
      const updated = pending.markApproved(id, {
        operatorId: 'op-1',
        ticketId: 'tkt-42',
        rationale: 'looks good',
        now: 5_000,
      });
      expect(updated.status).toBe('approved');
      expect(updated.resolvedByOperatorId).toBe('op-1');
      expect(updated.ticketId).toBe('tkt-42');
      expect(updated.rationale).toBe('looks good');
      expect(updated.resolvedAt).toBe(5_000);
      expect(updated.updatedAt).toBe(5_000);
    });

    it('throws when called against a missing row', () => {
      expect(() =>
        pending.markApproved('nope', { operatorId: 'op-1', ticketId: 'tkt' }),
      ).toThrowError(/row not found/);
    });

    it('throws when called against an already-resolved row', () => {
      const id = pending.create(makeBaseInput());
      pending.markApproved(id, { operatorId: 'op-1', ticketId: 'tkt-1' });
      expect(() =>
        pending.markApproved(id, { operatorId: 'op-2', ticketId: 'tkt-2' }),
      ).toThrowError(/already approved/);
    });
  });

  describe('markRejected', () => {
    it('flips status to rejected and stores the operator + rationale', () => {
      const id = pending.create(makeBaseInput());
      const updated = pending.markRejected(id, {
        operatorId: 'op-1',
        rationale: 'wrong assignee',
        now: 9_000,
      });
      expect(updated.status).toBe('rejected');
      expect(updated.resolvedByOperatorId).toBe('op-1');
      expect(updated.rationale).toBe('wrong assignee');
      expect(updated.resolvedAt).toBe(9_000);
      expect(updated.ticketId).toBeNull();
    });

    it('refuses to reject an already-approved row', () => {
      const id = pending.create(makeBaseInput());
      pending.markApproved(id, { operatorId: 'op-1', ticketId: 'tkt-1' });
      expect(() =>
        pending.markRejected(id, { operatorId: 'op-2', rationale: 'second-thought' }),
      ).toThrowError(/already approved/);
    });

    it('refuses to re-reject an already-rejected row (idempotency guard)', () => {
      const id = pending.create(makeBaseInput());
      pending.markRejected(id, { operatorId: 'op-1', rationale: 'no' });
      expect(() =>
        pending.markRejected(id, { operatorId: 'op-1', rationale: 'no again' }),
      ).toThrowError(/already rejected/);
    });
  });
});
