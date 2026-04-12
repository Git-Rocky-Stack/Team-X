import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createEventsRepo } from './events.js';

describe('events repo', () => {
  let ctx: TestDbHandle;
  let events: ReturnType<typeof createEventsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    events = createEventsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('append', () => {
    it('returns a non-empty id and persists the row', () => {
      const { id } = events.append({
        companyId: 'co-1',
        actorId: 'orchestrator',
        actorKind: 'orchestrator',
        eventType: 'employee.status_changed',
        payload: { from: 'idle', to: 'thinking' },
      });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
      const all = events.since(0);
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(id);
    });

    it('returns the exact createdAt that was persisted to the row', () => {
      // The event bus depends on the returned createdAt matching the DB row
      // byte-for-byte — otherwise live fan-out and replaySince cursors can
      // drift by a ms and either duplicate-fire or drop events. Codify the
      // invariant here so the repo can never silently regress.
      const { id, createdAt } = events.append({
        companyId: 'co-1',
        actorId: 'orchestrator',
        actorKind: 'orchestrator',
        eventType: 'work.queued',
        payload: {},
      });
      const row = events.since(0).find((e) => e.id === id);
      expect(row?.createdAt).toBe(createdAt);
    });

    it('serializes the payload to JSON text', () => {
      const { id } = events.append({
        companyId: 'co-1',
        actorId: 'emp-1',
        actorKind: 'employee',
        eventType: 'message.streamed',
        payload: { threadId: 't1', tokens: 42 },
      });
      const got = events.since(0).find((e) => e.id === id);
      expect(got?.payloadJson).toBe(JSON.stringify({ threadId: 't1', tokens: 42 }));
      expect(JSON.parse(got?.payloadJson ?? 'null')).toEqual({ threadId: 't1', tokens: 42 });
    });

    it('stores every required scalar verbatim', () => {
      const { id } = events.append({
        companyId: 'co-xyz',
        actorId: 'user-alice',
        actorKind: 'user',
        eventType: 'company.created',
        payload: {},
      });
      const got = events.since(0).find((e) => e.id === id);
      expect(got?.companyId).toBe('co-xyz');
      expect(got?.actorId).toBe('user-alice');
      expect(got?.actorKind).toBe('user');
      expect(got?.eventType).toBe('company.created');
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const { id } = events.append({
        companyId: 'co-1',
        actorId: 'x',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      const after = Date.now();
      const got = events.since(0).find((e) => e.id === id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('does NOT enforce a foreign key on companyId — events survive soft-deletes', () => {
      // Deliberate schema choice documented in schema.ts: events are the
      // append-only history log and must survive company removal. No FK.
      expect(() =>
        events.append({
          companyId: 'no-company-with-this-id',
          actorId: 'x',
          actorKind: 'system',
          eventType: 't',
          payload: {},
        }),
      ).not.toThrow();
    });
  });

  describe('since', () => {
    it('returns an empty array when nothing has been appended', () => {
      expect(events.since(0)).toEqual([]);
    });

    it('since(0) returns every event', () => {
      events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      expect(events.since(0)).toHaveLength(3);
    });

    it('since(cursor) returns only events with createdAt > cursor', async () => {
      const { id: first } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: { n: 1 },
      });
      await new Promise((r) => setTimeout(r, 5));
      const midCursor = Date.now();
      await new Promise((r) => setTimeout(r, 5));
      const { id: second } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: { n: 2 },
      });
      const { id: third } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: { n: 3 },
      });
      const after = events.since(midCursor);
      const ids = after.map((e) => e.id);
      expect(ids).toContain(second);
      expect(ids).toContain(third);
      expect(ids).not.toContain(first);
    });

    it('since(veryLargeCursor) returns empty', () => {
      events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      expect(events.since(Number.MAX_SAFE_INTEGER)).toEqual([]);
    });

    it('returns events ordered oldest-first by createdAt', async () => {
      const { id: a } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      await new Promise((r) => setTimeout(r, 3));
      const { id: b } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      await new Promise((r) => setTimeout(r, 3));
      const { id: c } = events.append({
        companyId: 'c',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      const ordered = events.since(0).map((e) => e.id);
      expect(ordered).toEqual([a, b, c]);
    });
  });

  describe('listByCompany', () => {
    it('returns empty array when no events exist', () => {
      expect(events.listByCompany('co-1', undefined, 50)).toEqual([]);
    });

    it('filters events by companyId', () => {
      events.append({
        companyId: 'co-1',
        actorId: 'a',
        actorKind: 'system',
        eventType: 'work.started',
        payload: {},
      });
      events.append({
        companyId: 'co-2',
        actorId: 'a',
        actorKind: 'system',
        eventType: 'work.started',
        payload: {},
      });
      events.append({
        companyId: 'co-1',
        actorId: 'a',
        actorKind: 'system',
        eventType: 'work.completed',
        payload: {},
      });
      const result = events.listByCompany('co-1', undefined, 50);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.companyId === 'co-1')).toBe(true);
    });

    it('returns events newest-first', async () => {
      const { id: a } = events.append({
        companyId: 'co-1',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      await new Promise((r) => setTimeout(r, 3));
      const { id: b } = events.append({
        companyId: 'co-1',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      await new Promise((r) => setTimeout(r, 3));
      const { id: c } = events.append({
        companyId: 'co-1',
        actorId: 'a',
        actorKind: 'system',
        eventType: 't',
        payload: {},
      });
      const result = events.listByCompany('co-1', undefined, 50);
      const ids = result.map((e) => e.id);
      expect(ids).toEqual([c, b, a]);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        events.append({
          companyId: 'co-1',
          actorId: 'a',
          actorKind: 'system',
          eventType: 't',
          payload: { n: i },
        });
      }
      const result = events.listByCompany('co-1', undefined, 3);
      expect(result).toHaveLength(3);
    });

    it('supports cursor-based pagination', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2));
        const { id } = events.append({
          companyId: 'co-1',
          actorId: 'a',
          actorKind: 'system',
          eventType: 't',
          payload: { n: i },
        });
        ids.push(id);
      }

      // First page: 2 newest
      const page1 = events.listByCompany('co-1', undefined, 2);
      expect(page1).toHaveLength(2);
      expect(page1[0]?.id).toBe(ids[4]);
      expect(page1[1]?.id).toBe(ids[3]);

      // Second page: use last event's createdAt as cursor
      const cursor = page1[1]?.createdAt;
      expect(cursor).toBeDefined();
      const page2 = events.listByCompany('co-1', cursor, 2);
      expect(page2).toHaveLength(2);
      expect(page2[0]?.id).toBe(ids[2]);
      expect(page2[1]?.id).toBe(ids[1]);

      // Third page: last event
      const cursor2 = page2[1]?.createdAt;
      expect(cursor2).toBeDefined();
      const page3 = events.listByCompany('co-1', cursor2, 2);
      expect(page3).toHaveLength(1);
      expect(page3[0]?.id).toBe(ids[0]);
    });
  });
});
