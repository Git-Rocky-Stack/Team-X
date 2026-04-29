import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createMessagesRepo } from './messages.js';
import { createThreadsRepo } from './threads.js';

describe('threads repo', () => {
  let ctx: TestDbHandle;
  let threads: ReturnType<typeof createThreadsRepo>;
  let messages: ReturnType<typeof createMessagesRepo>;
  let companyId: string;
  let otherCompanyId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    threads = createThreadsRepo(ctx.db);
    messages = createMessagesRepo(ctx.db);
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

  describe('getOrCreateDmThread', () => {
    it('creates a new DM thread + both members on first call', () => {
      const id = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'rocky',
      });

      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);

      const row = threads.getById(id);
      expect(row).not.toBeNull();
      expect(row?.kind).toBe('dm');
      expect(row?.companyId).toBe(companyId);
      expect(row?.createdBy).toBe('rocky');
      expect(row?.subject).toBeNull();

      const members = threads.listMembers(id);
      expect(members).toHaveLength(2);
      const userMember = members.find((m) => m.memberId === 'rocky');
      const empMember = members.find((m) => m.memberId === 'emp-iris');
      expect(userMember?.memberKind).toBe('user');
      expect(empMember?.memberKind).toBe('employee');
    });

    it('returns the existing DM thread on subsequent calls — idempotent', () => {
      const first = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'rocky',
      });
      const second = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'rocky',
      });
      expect(second).toBe(first);
      // Member rows are not duplicated.
      expect(threads.listMembers(first)).toHaveLength(2);
      // The thread row count for this company is exactly 1.
      expect(threads.listByCompany(companyId)).toHaveLength(1);
    });

    it('creates a separate DM thread for each employee', () => {
      const dmIris = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'rocky',
      });
      const dmMateo = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-mateo',
        userId: 'rocky',
      });
      expect(dmMateo).not.toBe(dmIris);
      expect(threads.listByCompany(companyId)).toHaveLength(2);
    });

    it('isolates DM threads across companies for the same employee + user pair', () => {
      const dmA = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-shared',
        userId: 'rocky',
      });
      const dmB = threads.getOrCreateDmThread({
        companyId: otherCompanyId,
        employeeId: 'emp-shared',
        userId: 'rocky',
      });
      expect(dmA).not.toBe(dmB);
      expect(threads.listByCompany(companyId)).toHaveLength(1);
      expect(threads.listByCompany(otherCompanyId)).toHaveLength(1);
    });

    it('does not match a non-DM thread that happens to share members', () => {
      // Pre-seed a `meeting` thread with the same membership shape — it
      // must NOT be returned as a DM. The lookup-or-create should add a
      // new DM thread alongside it.
      const meetingId = threads.create({ companyId, kind: 'meeting', createdBy: 'rocky' });
      threads.addMember({ threadId: meetingId, memberId: 'rocky', memberKind: 'user' });
      threads.addMember({ threadId: meetingId, memberId: 'emp-iris', memberKind: 'employee' });

      const dmId = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'rocky',
      });
      expect(dmId).not.toBe(meetingId);
      expect(threads.getById(dmId)?.kind).toBe('dm');
      expect(threads.listByCompany(companyId)).toHaveLength(2);
    });

    it('does not match a DM thread that has the employee but a different user', () => {
      // Pre-seed: a DM between alice and emp-iris. A second call with
      // bob + emp-iris must create a NEW thread, not return alice's.
      const aliceDm = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'alice',
      });
      const bobDm = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-iris',
        userId: 'bob',
      });
      expect(bobDm).not.toBe(aliceDm);
      expect(threads.listByCompany(companyId)).toHaveLength(2);
    });
  });

  describe('getOrCreateEmployeeDmThread', () => {
    it('creates a new DM thread with both employees as members', () => {
      const id = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-ceo',
        toEmployeeId: 'emp-swe',
      });

      expect(id).toBeTypeOf('string');
      const row = threads.getById(id);
      expect(row?.kind).toBe('dm');
      expect(row?.companyId).toBe(companyId);
      expect(row?.createdBy).toBe('emp-ceo');

      const members = threads.listMembers(id);
      expect(members).toHaveLength(2);
      expect(members.every((m) => m.memberKind === 'employee')).toBe(true);
      const ids = members.map((m) => m.memberId).sort();
      expect(ids).toEqual(['emp-ceo', 'emp-swe']);
    });

    it('returns the same thread on subsequent calls — idempotent', () => {
      const first = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-ceo',
        toEmployeeId: 'emp-swe',
      });
      const second = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-ceo',
        toEmployeeId: 'emp-swe',
      });
      expect(second).toBe(first);
    });

    it('is order-independent — (A,B) and (B,A) resolve the same thread', () => {
      const ab = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-ceo',
        toEmployeeId: 'emp-swe',
      });
      const ba = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-swe',
        toEmployeeId: 'emp-ceo',
      });
      expect(ba).toBe(ab);
    });

    it('does not collide with a user↔employee DM', () => {
      const userDm = threads.getOrCreateDmThread({
        companyId,
        employeeId: 'emp-swe',
        userId: 'rocky',
      });
      const empDm = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-ceo',
        toEmployeeId: 'emp-swe',
      });
      expect(empDm).not.toBe(userDm);
    });

    it('isolates threads across companies', () => {
      const dmA = threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: 'emp-a',
        toEmployeeId: 'emp-b',
      });
      const dmB = threads.getOrCreateEmployeeDmThread({
        companyId: otherCompanyId,
        fromEmployeeId: 'emp-a',
        toEmployeeId: 'emp-b',
      });
      expect(dmA).not.toBe(dmB);
    });
  });

  describe('updateLastMessageAt', () => {
    it('sets the lastMessageAt timestamp on a thread', () => {
      const id = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      expect(threads.getById(id)?.lastMessageAt).toBeNull();

      const now = Date.now();
      threads.updateLastMessageAt(id, now);
      expect(threads.getById(id)?.lastMessageAt).toBe(now);
    });
  });

  describe('listByCompanyWithMembers', () => {
    it('returns threads sorted by lastMessageAt desc with members', () => {
      const t1 = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      const t2 = threads.create({ companyId, kind: 'group', createdBy: 'u' });
      threads.addMember({ threadId: t1, memberId: 'emp-a', memberKind: 'employee' });
      threads.addMember({ threadId: t2, memberId: 'emp-b', memberKind: 'employee' });
      threads.addMember({ threadId: t2, memberId: 'emp-c', memberKind: 'employee' });

      // t2 has a more recent message
      threads.updateLastMessageAt(t1, 1000);
      threads.updateLastMessageAt(t2, 2000);

      const result = threads.listByCompanyWithMembers(companyId);
      expect(result).toHaveLength(2);
      // Most-recent first
      expect(result[0]?.id).toBe(t2);
      expect(result[0]?.members).toHaveLength(2);
      expect(result[1]?.id).toBe(t1);
      expect(result[1]?.members).toHaveLength(1);
    });

    it('recovers recency from message history when lastMessageAt is missing', () => {
      const staleDirect = threads.create({ companyId, kind: 'dm', createdBy: 'rocky' });
      const agentThread = threads.create({ companyId, kind: 'dm', createdBy: 'emp-a' });
      threads.addMember({ threadId: staleDirect, memberId: 'rocky', memberKind: 'user' });
      threads.addMember({ threadId: staleDirect, memberId: 'emp-a', memberKind: 'employee' });
      threads.addMember({ threadId: agentThread, memberId: 'emp-a', memberKind: 'employee' });
      threads.addMember({ threadId: agentThread, memberId: 'emp-b', memberKind: 'employee' });

      messages.append({
        threadId: staleDirect,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'Iris, are you there?',
      });
      threads.updateLastMessageAt(agentThread, 1);

      const result = threads.listByCompanyWithMembers(companyId);
      expect(result[0]?.id).toBe(staleDirect);
      expect(result[0]?.lastMessageAt).toBeTypeOf('number');
      expect(result[1]?.id).toBe(agentThread);
    });

    it('returns empty array for a company with no threads', () => {
      expect(threads.listByCompanyWithMembers(companyId)).toEqual([]);
    });

    it('excludes threads from other companies', () => {
      threads.create({ companyId, kind: 'dm', createdBy: 'u' });
      threads.create({ companyId: otherCompanyId, kind: 'dm', createdBy: 'u' });
      expect(threads.listByCompanyWithMembers(companyId)).toHaveLength(1);
    });
  });
});
