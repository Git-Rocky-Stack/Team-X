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

import type { ActorKind } from '@team-x/shared-types';
import { and, asc, gt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { events } from '../schema.js';

export type EventRow = typeof events.$inferSelect;

/**
 * Re-export the canonical `ActorKind` from shared-types so callers can
 * import everything from this repo module without reaching across the
 * workspace boundary. Consumers outside `db/repos/` should prefer the
 * direct `@team-x/shared-types` import.
 */
export type { ActorKind };

export interface AppendEventInput {
  companyId: string;
  actorId: string;
  actorKind: ActorKind;
  eventType: string;
  payload: unknown;
}

/**
 * Result of a successful `append`. Carries both the generated id AND
 * the exact `createdAt` that was persisted to the row.
 *
 * Why both? The event bus (see `main/orchestrator/event-bus.ts`)
 * persists, then fans the same event out to in-memory subscribers.
 * Subscribers must receive the authoritative timestamp, not a
 * recomputed one — otherwise a late `replaySince(cursor)` could
 * duplicate-fire or silently drop events when the bus-captured
 * time differed from the DB-captured time by even a single ms.
 */
export interface AppendEventResult {
  id: string;
  createdAt: number;
}

type EventsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createEventsRepo<TRunResult>(db: EventsDb<TRunResult>) {
  return {
    /**
     * Append a new event to the log. Returns the generated id AND the
     * `createdAt` actually persisted — callers that need to stream the
     * same event to in-memory subscribers (e.g. the event bus) must
     * use this returned timestamp, NOT call `Date.now()` again.
     *
     * There is no `update` or `delete` — this table is append-only
     * by design (invariant #6).
     */
    append(input: AppendEventInput): AppendEventResult {
      const id = nanoid();
      const createdAt = Date.now();
      db.insert(events)
        .values({
          id,
          companyId: input.companyId,
          actorId: input.actorId,
          actorKind: input.actorKind,
          eventType: input.eventType,
          payloadJson: JSON.stringify(input.payload),
          createdAt,
        })
        .run();
      return { id, createdAt };
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
