import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createCompaniesRepo } from './companies.js';
import { createMessagesRepo } from './messages.js';
import { createThreadsRepo } from './threads.js';

describe('messages repo', () => {
  let ctx: TestDbHandle;
  let messages: ReturnType<typeof createMessagesRepo>;
  let threadId: string;
  let otherThreadId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const threads = createThreadsRepo(ctx.db);
    messages = createMessagesRepo(ctx.db);
    const companyId = companies.create({ name: 'X', slug: 'x' });
    threadId = threads.create({ companyId, kind: 'dm', createdBy: 'u' });
    otherThreadId = threads.create({ companyId, kind: 'group', createdBy: 'u' });
  });

  afterEach(() => {
    ctx.close();
  });

  describe('append', () => {
    it('returns a non-empty id and persists content', () => {
      const id = messages.append({
        threadId,
        authorId: 'emp-1',
        authorKind: 'employee',
        content: 'Hello from Team-X',
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const all = messages.listByThread(threadId);
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(id);
      expect(all[0]?.content).toBe('Hello from Team-X');
    });

    it('stores author fields verbatim', () => {
      const id = messages.append({
        threadId,
        authorId: 'user-abc',
        authorKind: 'user',
        content: 'hi',
      });
      const got = messages.listByThread(threadId).find((m) => m.id === id);
      expect(got?.authorId).toBe('user-abc');
      expect(got?.authorKind).toBe('user');
    });

    it('defaults toolCallsJson and parentId to null when omitted', () => {
      const id = messages.append({
        threadId,
        authorId: 'emp-1',
        authorKind: 'employee',
        content: 'no tools here',
      });
      const got = messages.listByThread(threadId).find((m) => m.id === id);
      expect(got?.toolCallsJson).toBeNull();
      expect(got?.parentId).toBeNull();
    });

    it('serializes toolCalls to JSON when provided', () => {
      const calls = [{ name: 'read_file', args: { path: 'a.txt' }, result: 'ok' }];
      const id = messages.append({
        threadId,
        authorId: 'emp-1',
        authorKind: 'employee',
        content: 'called a tool',
        toolCalls: calls,
      });
      const got = messages.listByThread(threadId).find((m) => m.id === id);
      expect(got?.toolCallsJson).not.toBeNull();
      expect(JSON.parse(got?.toolCallsJson ?? 'null')).toEqual(calls);
    });

    it('stores parentId when provided', () => {
      const parentId = messages.append({
        threadId,
        authorId: 'emp-1',
        authorKind: 'employee',
        content: 'parent',
      });
      const childId = messages.append({
        threadId,
        authorId: 'emp-2',
        authorKind: 'employee',
        content: 'child',
        parentId,
      });
      const child = messages.listByThread(threadId).find((m) => m.id === childId);
      expect(child?.parentId).toBe(parentId);
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const id = messages.append({
        threadId,
        authorId: 'u',
        authorKind: 'user',
        content: 'hi',
      });
      const after = Date.now();
      const got = messages.listByThread(threadId).find((m) => m.id === id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('enforces the foreign key to threads (throws on unknown threadId)', () => {
      expect(() =>
        messages.append({
          threadId: 'no-such-thread',
          authorId: 'u',
          authorKind: 'user',
          content: 'hi',
        }),
      ).toThrow();
    });
  });

  describe('listByThread', () => {
    it('returns an empty array for a thread with no messages', () => {
      expect(messages.listByThread(threadId)).toEqual([]);
    });

    it('returns only messages belonging to the given thread', () => {
      messages.append({ threadId, authorId: 'u', authorKind: 'user', content: 'a' });
      messages.append({ threadId, authorId: 'u', authorKind: 'user', content: 'b' });
      messages.append({
        threadId: otherThreadId,
        authorId: 'u',
        authorKind: 'user',
        content: 'c',
      });
      expect(messages.listByThread(threadId)).toHaveLength(2);
      expect(messages.listByThread(otherThreadId)).toHaveLength(1);
    });

    it('orders messages by createdAt ascending (oldest first)', async () => {
      const a = messages.append({ threadId, authorId: 'u', authorKind: 'user', content: 'a' });
      // Small delay to guarantee distinct createdAt values under ms resolution.
      await new Promise((r) => setTimeout(r, 2));
      const b = messages.append({ threadId, authorId: 'u', authorKind: 'user', content: 'b' });
      await new Promise((r) => setTimeout(r, 2));
      const c = messages.append({ threadId, authorId: 'u', authorKind: 'user', content: 'c' });
      const ordered = messages.listByThread(threadId).map((m) => m.id);
      expect(ordered).toEqual([a, b, c]);
    });
  });

  describe('updateContent', () => {
    it('overwrites the content of an existing message (streaming use case)', () => {
      const id = messages.append({
        threadId,
        authorId: 'emp-1',
        authorKind: 'employee',
        content: 'Hel',
      });
      messages.updateContent(id, 'Hello');
      messages.updateContent(id, 'Hello from Team-X');
      const got = messages.listByThread(threadId).find((m) => m.id === id);
      expect(got?.content).toBe('Hello from Team-X');
    });

    it('is a no-op on unknown id (does not throw)', () => {
      expect(() => messages.updateContent('nope', 'anything')).not.toThrow();
    });
  });
});
