/**
 * Events repository — append-only source of truth for the live cockpit
 * dashboard. Per CLAUDE.md invariant #6: orchestrator writes, renderer
 * subscribes. This file exposes the ONLY write API; all other repos
 * should funnel events through here rather than insert into the events
 * table directly.
 *
 * Intentional schema asymmetry (see the deliberate note in schema.ts):
 * events.company_id is NOT FK-constrained. The event log must survive
 * company soft-delete so audit history is preserved. This is tested in
 * events.test.ts to codify the invariant.
 *
 * Cursor model:
 *
 * The plan originally specified `since(cursor)` using `id > cursor`,
 * but events.id is a nanoid text value — not monotonic. In Phase 1
 * we use `createdAt` (integer ms) as the cursor instead. The renderer
 * calls `since(lastSeenCreatedAt)` to poll for new events.
 *
 * Known limitation: events created at the same ms can tie. `orderBy
 * createdAt ASC, id ASC` gives a deterministic intra-batch order, but
 * if the previous poll returned an event with `createdAt = T` and a
 * new event also has `createdAt = T`, the new one is SKIPPED by
 * `createdAt > T`. Phase 1 accepts this — the renderer polls every
 * 50-200 ms and the lost event is practically invisible. A later
 * phase can introduce a true monotonic `seq INTEGER` column via a
 * new migration; the cursor stays a number and the API does not
 * change.
 *
 * Cross-driver generic typing — same pattern as the other repos.
 */

import { and, asc, gt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { events } from '../schema.js';

export type EventRow = typeof events.$inferSelect;

export type EventActorKind = 'user' | 'employee' | 'system' | 'orchestrator' | 'provider';

export interface AppendEventInput {
  companyId: string;
  actorId: string;
  actorKind: EventActorKind;
  eventType: string;
  payload: unknown;
}

type EventsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createEventsRepo<TRunResult>(db: EventsDb<TRunResult>) {
  return {
    /**
     * Append a new event to the log. Returns the generated id. There
     * is no `update` or `delete` — this table is append-only by design.
     */
    append(input: AppendEventInput): string {
      const id = nanoid();
      db.insert(events)
        .values({
          id,
          companyId: input.companyId,
          actorId: input.actorId,
          actorKind: input.actorKind,
          eventType: input.eventType,
          payloadJson: JSON.stringify(input.payload),
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    /**
     * Return every event with `createdAt > cursor`, ordered oldest-first.
     * Pass `0` to fetch the entire log. See the cursor model note at the
     * top of this file for the ms-tie limitation.
     */
    since(cursor: number): EventRow[] {
      return db
        .select()
        .from(events)
        .where(and(gt(events.createdAt, cursor)))
        .orderBy(asc(events.createdAt), asc(events.id))
        .all();
    },
  };
}
