import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createThreadsRepo } from './threads.js';

describe('threads repo', () => {
  let ctx: TestDbHandle;
  let threads: ReturnType<typeof createThreadsRepo>;
  let companyId: string;
  let otherCompanyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    threads = createThreadsRepo(ctx.db);
    companyId = companies.create({ name: 'Strategia-X', slug: 'strategia-x' });
    otherCompanyId = companies.create({ name: 'Other Corp', slug: 'other-corp' });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('create', () => {
    it('returns a non-empty id and persists required fields', () => {
      const id = threads.create({
        companyId,
        kind: 'dm',
        createdBy: 'user-1',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const got = threads.getById(id);
      expect(got).not.toBeNull();
      expect(got?.companyId).toBe(companyId);
      expect(got?.kind).toBe('dm');
      expect(got?.createdBy).toBe('user-1');
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const id = threads.create({ companyId, kind: 'group', createdBy: 'u' });
      const after = Date.now();
      const got = threads.getById(id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('accepts all five valid thread kinds', () => {
      const kinds = ['dm', 'group', 'meeting', 'ticket', 'broadcast'] as const;
      for (const kind of kinds) {
        const id = threads.create({ companyId, kind, createdBy: 'u' });
        expect(threads.getById(id)?.kind).toBe(kind);
      }
    });

    it('stores an optional subject when provided', () => {
      const id = threads.create({
        companyId,
        kind: 'meeting',
        createdBy: 'u',
        subject: 'Weekly all-hands',
      });
      expect(threads.getById(id)?.subject).toBe('Weekly all-hands');
    });

    it('stores null subject when omitted', () => {
      const id = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      expect(threads.getById(id)?.subject).toBeNull();
    });

    it('enforces the foreign key to companies (throws on unknown companyId)', () => {
      expect(() =>
        threads.create({ companyId: 'does-not-exist', kind: 'dm', createdBy: 'u' }),
      ).toThrow();
    });
  });

  describe('getById', () => {
    it('returns null for an unknown id', () => {
      expect(threads.getById('not-real')).toBeNull();
    });
  });

  describe('listByCompany', () => {
    it('returns an empty array when a company has no threads', () => {
      expect(threads.listByCompany(companyId)).toEqual([]);
    });

    it('returns only threads belonging to the given company', () => {
      threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      threads.create({ companyId, kind: 'group', createdBy: 'u' });
      threads.create({ companyId: otherCompanyId, kind: 'dm', createdBy: 'u' });
      expect(threads.listByCompany(companyId)).toHaveLength(2);
      expect(threads.listByCompany(otherCompanyId)).toHaveLength(1);
    });
  });

  describe('addMember / listMembers', () => {
    it('adds a member and lists it back', () => {
      const tid = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      threads.addMember({ threadId: tid, memberId: 'emp-1', memberKind: 'employee' });
      const members = threads.listMembers(tid);
      expect(members).toHaveLength(1);
      expect(members[0]?.threadId).toBe(tid);
      expect(members[0]?.memberId).toBe('emp-1');
      expect(members[0]?.memberKind).toBe('employee');
      expect(members[0]?.roleInThread).toBeNull();
    });

    it('stores an optional roleInThread when provided', () => {
      const tid = threads.create({ companyId, kind: 'meeting', createdBy: 'u' });
      threads.addMember({
        threadId: tid,
        memberId: 'emp-1',
        memberKind: 'employee',
        roleInThread: 'facilitator',
      });
      const members = threads.listMembers(tid);
      expect(members[0]?.roleInThread).toBe('facilitator');
    });

    it('listMembers returns empty for a thread with no members', () => {
      const tid = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      expect(threads.listMembers(tid)).toEqual([]);
    });

    it('listMembers filters by threadId', () => {
      const t1 = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      const t2 = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      threads.addMember({ threadId: t1, memberId: 'a', memberKind: 'user' });
      threads.addMember({ threadId: t1, memberId: 'b', memberKind: 'user' });
      threads.addMember({ threadId: t2, memberId: 'c', memberKind: 'user' });
      expect(threads.listMembers(t1)).toHaveLength(2);
      expect(threads.listMembers(t2)).toHaveLength(1);
    });

    it('enforces the foreign key to threads (addMember throws on unknown threadId)', () => {
      expect(() =>
        threads.addMember({
          threadId: 'no-such-thread',
          memberId: 'emp-1',
          memberKind: 'employee',
        }),
      ).toThrow();
    });
  });
});
