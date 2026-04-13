/**
 * Audit repository — read-only queries on the append-only `events` table
 * for the audit log UI. Adds filtered listing, stats aggregation, and
 * export capabilities on top of the base events repo.
 *
 * Does not write to events — that remains the orchestrator's job via
 * the event bus (invariant #6).
 */

import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Schema } from '../client.js';
import { events } from '../schema.js';

export type { EventRow } from './events.js';

export interface AuditFilter {
  companyId: string;
  eventTypes?: string[];
  actorId?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEvents: number;
  eventsToday: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
}

type AuditDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createAuditRepo<TRunResult>(db: AuditDb<TRunResult>) {
  return {
    /**
     * Filtered, paginated event listing for the audit log.
     * Supports filtering by event type, actor, and date range.
     */
    list(filter: AuditFilter) {
      const conditions = [eq(events.companyId, filter.companyId)];

      if (filter.actorId) {
        conditions.push(eq(events.actorId, filter.actorId));
      }
      if (filter.fromMs !== undefined) {
        conditions.push(gte(events.createdAt, filter.fromMs));
      }
      if (filter.toMs !== undefined) {
        conditions.push(lte(events.createdAt, filter.toMs));
      }

      let rows = db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(desc(events.createdAt), desc(events.id))
        .all();

      // Filter by event types in-memory (Drizzle doesn't have IN() for dynamic arrays easily)
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        const types = new Set(filter.eventTypes);
        rows = rows.filter((r) => types.has(r.eventType));
      }

      // Apply offset + limit
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      return rows.slice(offset, offset + limit);
    },

    /**
     * Aggregate statistics for the audit summary cards.
     */
    stats(companyId: string): AuditStats {
      const allEvents = db.select().from(events).where(eq(events.companyId, companyId)).all();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();
      const eventsToday = allEvents.filter((e) => e.createdAt >= todayMs).length;

      // Count by event type
      const typeCounts = new Map<string, number>();
      for (const e of allEvents) {
        typeCounts.set(e.eventType, (typeCounts.get(e.eventType) ?? 0) + 1);
      }
      const topEventTypes = Array.from(typeCounts.entries())
        .map(([eventType, count]) => ({ eventType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalEvents: allEvents.length,
        eventsToday,
        topEventTypes,
      };
    },

    /**
     * Export events as JSON string (for file save).
     */
    exportJson(filter: AuditFilter): string {
      const rows = this.list({ ...filter, limit: 10000 });
      return JSON.stringify(rows, null, 2);
    },

    /**
     * Export events as CSV string (for file save).
     */
    exportCsv(filter: AuditFilter): string {
      const rows = this.list({ ...filter, limit: 10000 });
      const header = 'id,companyId,actorId,actorKind,eventType,createdAt,payload';
      const lines = rows.map((r) => {
        const payload = r.payloadJson.replace(/"/g, '""');
        return `${r.id},${r.companyId},${r.actorId},${r.actorKind},${r.eventType},${r.createdAt},"${payload}"`;
      });
      return [header, ...lines].join('\n');
    },

    /**
     * Get distinct event types for a company (for filter chip population).
     */
    distinctEventTypes(companyId: string): string[] {
      const rows = db
        .select({ eventType: events.eventType })
        .from(events)
        .where(eq(events.companyId, companyId))
        .all();
      return [...new Set(rows.map((r) => r.eventType))].sort();
    },
  };
}
