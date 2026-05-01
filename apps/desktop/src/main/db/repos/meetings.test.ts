import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import { createEmployeesRepo } from './employees.js';
import { createMeetingsRepo } from './meetings.js';
import { createThreadsRepo } from './threads.js';

describe('meetings repo', () => {
  let ctx: TestDbHandle;
  let meetingsRepo: ReturnType<typeof createMeetingsRepo>;
  let companyId: string;
  let threadId: string;
  let chairId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    const threads = createThreadsRepo(ctx.db);
    meetingsRepo = createMeetingsRepo(ctx.db);

    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    chairId = employees.create({
      companyId,
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'abc123',
      level: 'Officer',
      name: 'Alice',
      title: 'CEO',
    });
    threadId = threads.create({
      companyId,
      kind: 'meeting',
      subject: 'All-Hands',
      createdBy: 'user-1',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns a non-empty id and persists the meeting', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        agenda: 'Review Q1 goals',
        attendeesJson: JSON.stringify([chairId]),
      });
      expect(id).toBeTruthy();

      const row = meetingsRepo.getById(id);
      expect(row).toBeDefined();
      expect(row?.companyId).toBe(companyId);
      expect(row?.threadId).toBe(threadId);
      expect(row?.chairId).toBe(chairId);
      expect(row?.agenda).toBe('Review Q1 goals');
      expect(row?.mode).toBe('round-robin');
      expect(row?.status).toBe('active');
      expect(row?.minutesMd).toBeNull();
      expect(row?.startedAt).toBeGreaterThan(0);
      expect(row?.endedAt).toBeNull();
    });

    it('uses defaults for optional fields', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      const row = meetingsRepo.getById(id);
      expect(row?.agenda).toBe('');
      expect(row?.mode).toBe('round-robin');
    });
  });

  describe('getById', () => {
    it('returns null for non-existent id', () => {
      expect(meetingsRepo.getById('non-existent')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns meetings newest-first', () => {
      const id1 = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      // Small delay to ensure different startedAt
      const id2 = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        agenda: 'Second meeting',
        attendeesJson: '[]',
      });

      const list = meetingsRepo.listByCompany(companyId);
      expect(list).toHaveLength(2);
      // newest first — id2 was created after id1
      expect(list[0]?.id).toBe(id2);
      expect(list[1]?.id).toBe(id1);
    });

    it('returns empty array for company with no meetings', () => {
      expect(meetingsRepo.listByCompany('no-company')).toEqual([]);
    });
  });

  describe('getActive', () => {
    it('returns the active meeting for a company', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      const active = meetingsRepo.getActive(companyId);
      expect(active?.id).toBe(id);
    });

    it('returns null after meeting is ended', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      meetingsRepo.end(id);
      expect(meetingsRepo.getActive(companyId)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('end', () => {
    it('sets status to ended and stamps endedAt', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      meetingsRepo.end(id);

      const row = meetingsRepo.getById(id);
      expect(row?.status).toBe('ended');
      expect(row?.endedAt).toBeGreaterThan(0);
    });

    it('accepts optional minutes and action items', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      const actionItems = JSON.stringify([{ title: 'Fix bug', assigneeId: chairId }]);
      meetingsRepo.end(id, {
        minutesMd: '# Meeting Minutes\n\nDiscussed Q1 goals.',
        actionItemsJson: actionItems,
      });

      const row = meetingsRepo.getById(id);
      expect(row?.minutesMd).toBe('# Meeting Minutes\n\nDiscussed Q1 goals.');
      expect(row?.actionItemsJson).toBe(actionItems);
    });
  });

  describe('setMinutes', () => {
    it('updates minutes_md independently', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      meetingsRepo.setMinutes(id, '# Updated Minutes');
      expect(meetingsRepo.getById(id)?.minutesMd).toBe('# Updated Minutes');
    });
  });

  describe('setActionItems', () => {
    it('updates action_items_json independently', () => {
      const id = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        attendeesJson: '[]',
      });
      const items = JSON.stringify([{ title: 'Deploy v2' }]);
      meetingsRepo.setActionItems(id, items);
      expect(meetingsRepo.getById(id)?.actionItemsJson).toBe(items);
    });
  });
});
