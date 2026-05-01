import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createAuditRepo } from './audit.js';
import { createEventsRepo } from './events.js';

describe('audit repo', () => {
  let ctx: TestDbHandle;
  let audit: ReturnType<typeof createAuditRepo>;
  let events: ReturnType<typeof createEventsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    audit = createAuditRepo(ctx.db);
    events = createEventsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  /** Seed a batch of events for filter testing. */
  function seedEvents() {
    events.append({
      companyId: 'co-1',
      actorId: 'rocky',
      actorKind: 'user',
      eventType: 'employee.hired',
      payload: { name: 'Alice' },
    });
    events.append({
      companyId: 'co-1',
      actorId: 'emp-1',
      actorKind: 'employee',
      eventType: 'ticket.created',
      payload: { title: 'Fix bug' },
    });
    events.append({
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      eventType: 'work.completed',
      payload: { ms: 120 },
    });
    events.append({
      companyId: 'co-2',
      actorId: 'rocky',
      actorKind: 'user',
      eventType: 'employee.hired',
      payload: { name: 'Bob' },
    });
  }

  describe('list', () => {
    it('returns events for the specified company only', () => {
      seedEvents();
      const rows = audit.list({ companyId: 'co-1' });
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.companyId).toBe('co-1');
      }
    });

    it('returns events newest-first', () => {
      seedEvents();
      const rows = audit.list({ companyId: 'co-1' });
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1]?.createdAt).toBeGreaterThanOrEqual(rows[i]?.createdAt);
      }
    });

    it('filters by event types', () => {
      seedEvents();
      const rows = audit.list({ companyId: 'co-1', eventTypes: ['employee.hired'] });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.eventType).toBe('employee.hired');
    });

    it('filters by actor id', () => {
      seedEvents();
      const rows = audit.list({ companyId: 'co-1', actorId: 'emp-1' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actorId).toBe('emp-1');
    });

    it('respects limit and offset', () => {
      seedEvents();
      const page1 = audit.list({ companyId: 'co-1', limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      const page2 = audit.list({ companyId: 'co-1', limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
      // No overlap
      const ids1 = new Set(page1.map((r) => r.id));
      for (const r of page2) {
        expect(ids1.has(r.id)).toBe(false);
      }
    });

    it('filters by date range', () => {
      seedEvents();
      const all = audit.list({ companyId: 'co-1' });
      const midTime = all[1]?.createdAt;
      const filtered = audit.list({ companyId: 'co-1', fromMs: midTime });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      for (const r of filtered) {
        expect(r.createdAt).toBeGreaterThanOrEqual(midTime);
      }
    });
  });

  describe('stats', () => {
    it('returns correct total count', () => {
      seedEvents();
      const s = audit.stats('co-1');
      expect(s.totalEvents).toBe(3);
    });

    it('counts events today', () => {
      seedEvents();
      // All seed events are created "now" so they should be today
      const s = audit.stats('co-1');
      expect(s.eventsToday).toBe(3);
    });

    it('returns top event types sorted by count descending', () => {
      seedEvents();
      // Add more employee.hired events
      events.append({
        companyId: 'co-1',
        actorId: 'rocky',
        actorKind: 'user',
        eventType: 'employee.hired',
        payload: { name: 'Charlie' },
      });
      const s = audit.stats('co-1');
      expect(s.topEventTypes[0]?.eventType).toBe('employee.hired');
      expect(s.topEventTypes[0]?.count).toBe(2);
    });

    it('returns empty stats for company with no events', () => {
      const s = audit.stats('co-nonexistent');
      expect(s.totalEvents).toBe(0);
      expect(s.eventsToday).toBe(0);
      expect(s.topEventTypes).toHaveLength(0);
    });
  });

  describe('exportJson', () => {
    it('returns valid JSON string', () => {
      seedEvents();
      const json = audit.exportJson({ companyId: 'co-1' });
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });

    it('respects filters in export', () => {
      seedEvents();
      const json = audit.exportJson({
        companyId: 'co-1',
        eventTypes: ['ticket.created'],
      });
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('exportCsv', () => {
    it('returns CSV with header and data rows', () => {
      seedEvents();
      const csv = audit.exportCsv({ companyId: 'co-1' });
      const lines = csv.split('\n');
      // Header + 3 data rows
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('id,companyId,actorId,actorKind,eventType,createdAt,payload');
    });

    it('escapes double quotes in payload', () => {
      events.append({
        companyId: 'co-1',
        actorId: 'rocky',
        actorKind: 'user',
        eventType: 'test.event',
        payload: { key: 'value with "quotes"' },
      });
      const csv = audit.exportCsv({ companyId: 'co-1' });
      // JSON-stringified payload stores \" which CSV doubling turns into ""
      // The stored payloadJson contains: {"key":"value with \"quotes\""}
      // After CSV escaping (replace " with ""): {""key"":""value with \""quotes\""}
      expect(csv).toContain('""key""');
    });
  });

  describe('distinctEventTypes', () => {
    it('returns sorted unique event types for a company', () => {
      seedEvents();
      const types = audit.distinctEventTypes('co-1');
      expect(types).toEqual(['employee.hired', 'ticket.created', 'work.completed']);
    });

    it('returns empty array for unknown company', () => {
      const types = audit.distinctEventTypes('co-nonexistent');
      expect(types).toHaveLength(0);
    });
  });
});
