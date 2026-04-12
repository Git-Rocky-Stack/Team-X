import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createThreadsRepo } from './threads.js';
import { createTicketsRepo } from './tickets.js';

describe('tickets repo', () => {
  let ctx: TestDbHandle;
  let tickets: ReturnType<typeof createTicketsRepo>;
  let companyId: string;
  let employeeId: string;
  let threadId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    const threads = createThreadsRepo(ctx.db);
    tickets = createTicketsRepo(ctx.db);
    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    employeeId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'abc123',
      level: 'Officer',
      name: 'Alice',
      title: 'CEO',
    });
    threadId = threads.create({ companyId, kind: 'ticket', createdBy: 'rocky' });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('create', () => {
    it('returns a non-empty id and persists the ticket', () => {
      const id = tickets.create({
        companyId,
        title: 'Fix the login bug',
        reporterId: 'rocky',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const ticket = tickets.getById(id);
      expect(ticket).not.toBeNull();
      expect(ticket?.title).toBe('Fix the login bug');
      expect(ticket?.status).toBe('open');
      expect(ticket?.priority).toBe('medium');
    });

    it('stores optional fields when provided', () => {
      const id = tickets.create({
        companyId,
        title: 'Deploy v2',
        description: 'Ship the new landing page',
        priority: 'high',
        assigneeId: employeeId,
        reporterId: 'rocky',
        reporterKind: 'user',
        labelsJson: '["deploy","urgent"]',
        slaHours: 4,
        dueAt: Date.now() + 86400000,
      });
      const ticket = tickets.getById(id);
      expect(ticket?.description).toBe('Ship the new landing page');
      expect(ticket?.priority).toBe('high');
      expect(ticket?.assigneeId).toBe(employeeId);
      expect(ticket?.labelsJson).toBe('["deploy","urgent"]');
      expect(ticket?.slaHours).toBe(4);
    });

    it('defaults description to empty string', () => {
      const id = tickets.create({ companyId, title: 'Bare', reporterId: 'rocky' });
      expect(tickets.getById(id)?.description).toBe('');
    });

    it('stores createdAt and updatedAt as positive integers', () => {
      const before = Date.now();
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      const after = Date.now();
      const ticket = tickets.getById(id);
      expect(ticket?.createdAt).toBeGreaterThanOrEqual(before);
      expect(ticket?.createdAt).toBeLessThanOrEqual(after);
      expect(ticket?.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getById', () => {
    it('returns null for unknown id', () => {
      expect(tickets.getById('nonexistent')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns empty array when no tickets exist', () => {
      expect(tickets.listByCompany(companyId)).toEqual([]);
    });

    it('returns tickets for the company, newest first', async () => {
      const a = tickets.create({ companyId, title: 'A', reporterId: 'rocky' });
      await new Promise((r) => setTimeout(r, 2));
      const b = tickets.create({ companyId, title: 'B', reporterId: 'rocky' });
      const list = tickets.listByCompany(companyId);
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe(b);
      expect(list[1]?.id).toBe(a);
    });
  });

  describe('listByAssignee', () => {
    it('returns only tickets assigned to the given employee', () => {
      tickets.create({ companyId, title: 'Assigned', reporterId: 'rocky', assigneeId: employeeId });
      tickets.create({ companyId, title: 'Unassigned', reporterId: 'rocky' });
      const list = tickets.listByAssignee(employeeId);
      expect(list).toHaveLength(1);
      expect(list[0]?.title).toBe('Assigned');
    });
  });

  describe('update', () => {
    it('updates only the provided fields', () => {
      const id = tickets.create({ companyId, title: 'Original', reporterId: 'rocky' });
      tickets.update(id, { title: 'Updated', priority: 'critical' });
      const ticket = tickets.getById(id);
      expect(ticket?.title).toBe('Updated');
      expect(ticket?.priority).toBe('critical');
      expect(ticket?.description).toBe('');
    });

    it('bumps updatedAt', async () => {
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      const before = tickets.getById(id)?.updatedAt ?? 0;
      await new Promise((r) => setTimeout(r, 2));
      tickets.update(id, { title: 'T2' });
      const after = tickets.getById(id)?.updatedAt ?? 0;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('assign', () => {
    it('sets the assignee and changes status to in-progress', () => {
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      expect(tickets.getById(id)?.status).toBe('open');
      tickets.assign(id, employeeId);
      const ticket = tickets.getById(id);
      expect(ticket?.assigneeId).toBe(employeeId);
      expect(ticket?.status).toBe('in-progress');
    });
  });

  describe('setThreadId', () => {
    it('links a discussion thread to the ticket', () => {
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      expect(tickets.getById(id)?.threadId).toBeNull();
      tickets.setThreadId(id, threadId);
      expect(tickets.getById(id)?.threadId).toBe(threadId);
    });
  });

  describe('close', () => {
    it('sets status to done and stamps closedAt', () => {
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      const before = Date.now();
      tickets.close(id);
      const ticket = tickets.getById(id);
      expect(ticket?.status).toBe('done');
      expect(ticket?.closedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('reopen', () => {
    it('sets status to open and clears closedAt', () => {
      const id = tickets.create({ companyId, title: 'T', reporterId: 'rocky' });
      tickets.close(id);
      expect(tickets.getById(id)?.closedAt).not.toBeNull();
      tickets.reopen(id);
      const ticket = tickets.getById(id);
      expect(ticket?.status).toBe('open');
      expect(ticket?.closedAt).toBeNull();
    });
  });
});
