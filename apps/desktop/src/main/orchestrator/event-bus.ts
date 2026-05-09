/**
 * Event bus — append-only, DB-backed, in-memory fan-out.
 *
 * This module is the ONLY thing the orchestrator and agent workers talk to
 * when they want to emit a dashboard event. It owns two responsibilities:
 *
 *   1. Persistence — every emitted event is written to the `events` table
 *      via the events repo. That table is the source of truth for the live
 *      cockpit (CLAUDE.md invariant #6: "Events table is append-only.
 *      Orchestrator writes; renderer subscribes.").
 *
 *   2. Fan-out — after a successful persist, the event is dispatched
 *      synchronously to every in-memory subscriber. This is what lets the
 *      main process hand events to the renderer IPC forwarder without the
 *      renderer having to poll SQLite on a timer.
 *
 * Ordering guarantee: a subscriber NEVER sees an event before that event
 * has been durably persisted. If the DB insert throws, the event is not
 * fanned out — the caller receives the throw and can retry. This is the
 * property the orchestrator relies on: "if a listener saw it, it's in the
 * log".
 *
 * Listener isolation: a listener that throws is caught and logged. One bad
 * subscriber cannot break fan-out to the rest. This matters because the
 * forwarder-to-renderer subscriber (Task 36) sits alongside orchestrator
 * internal listeners, and a webContents.send() on a destroyed window
 * throws — that should never cascade into the runtime.
 *
 * Timestamp fidelity: the bus uses the `createdAt` returned by the events
 * repo — NOT a fresh `Date.now()`. See events.ts AppendEventResult for the
 * full rationale. Short version: if the bus and the repo each called
 * Date.now() independently, the fan-out event and the persisted row could
 * differ by a ms, and a late `replaySince(busTimestamp)` would either
 * duplicate-deliver or silently drop the event.
 *
 * Why not an EventEmitter? Node's EventEmitter uses a `Map<string, Listener[]>`
 * keyed by event name. We have exactly ONE channel (every subscriber wants
 * every event — the renderer filters downstream), so a `Set<Listener>` is
 * both simpler and avoids the `maxListeners` warning that EventEmitter
 * logs once a bus grows past 10 subscribers.
 */

import type { ActorKind, DashboardEvent, EventType } from '@team-x/shared-types';

import type { AppendEventInput, AppendEventResult, EventRow } from '../db/repos/events.js';

/**
 * Minimal structural shape the bus needs from the events repo. The real
 * `createEventsRepo` factory is generic over the underlying SQLite driver
 * (`TRunResult`), but the bus only needs the two methods, neither of
 * which references that generic parameter — so we hand-roll the interface
 * here. This keeps tests decoupled (a fake repo can be a plain object
 * with two methods) AND avoids leaking driver-specific types into the
 * orchestrator layer.
 */
export interface EventsRepoLike {
  append(input: AppendEventInput): AppendEventResult;
  since(cursor: number): EventRow[];
}

/**
 * Input to `emit` — the caller supplies the semantic fields; the bus
 * stamps `id` and `createdAt` from the repo's persisted row.
 *
 * Generic `T` mirrors `DashboardEvent<T>` so payloads can be typed at
 * call sites (e.g. `emit<TokenDeltaPayload>({ type: 'token.delta', ... })`).
 */
export interface EmitInput<T = unknown> {
  type: EventType;
  companyId: string;
  actorId: string;
  actorKind: ActorKind;
  payload: T;
  /**
   * Optional W3C trace ID. Persisted into `events.trace_id` and echoed
   * onto the fanned-out `DashboardEvent` so subscribers can correlate
   * with `runs.trace_id`. Propagated by post-H4 orchestrator code; absent
   * for emit calls that fall outside a logical orchestrator request
   * (e.g. one-shot system events). Audit 2026-05-07 H4.
   */
  traceId?: string;
}

/** A subscriber function. The bus calls it synchronously on every emit. */
export type EventListener = (event: DashboardEvent) => void;

/** Returned from `subscribe` — call to remove the listener. Idempotent. */
export type Unsubscribe = () => void;

export interface EventBus {
  /**
   * Persist the event, then fan it out to every subscriber. Returns the
   * fully-formed `DashboardEvent` (with `id` and `createdAt` populated by
   * the repo) so the caller can correlate — for example, the chat IPC
   * handler can return the persisted event id to the renderer.
   *
   * Throws if the DB insert fails. Subscribers are not called in that
   * case. Subscriber exceptions are caught internally and logged — they
   * do NOT propagate back out of `emit`.
   */
  emit<T = unknown>(input: EmitInput<T>): DashboardEvent<T>;

  /**
   * Register a listener. Returns an `unsubscribe` function. The listener
   * receives every subsequent event, in the order they were emitted.
   * Listeners registered mid-fan-out are NOT called for the in-flight
   * event (standard snapshot-iteration semantics).
   */
  subscribe(listener: EventListener): Unsubscribe;

  /**
   * Hydrate a subscriber on (re)connect. Returns every event in the DB
   * with `createdAt > cursor`, oldest-first, deserialized into
   * `DashboardEvent<unknown>`. Pass `0` to fetch the entire log.
   *
   * The cursor is an integer ms (`createdAt`) — the same shape emitted
   * events carry, so a renderer can record `lastEvent.createdAt` live
   * and feed it back into `replaySince` on reconnect.
   *
   * Unparseable `payloadJson` (corrupted row, manual DB edit) yields a
   * `null` payload on that one event — replay keeps moving. See the
   * `parseRow` helper for the error path.
   */
  replaySince(cursor: number): DashboardEvent[];
}

interface EventBusOptions {
  repo: EventsRepoLike;
  /**
   * Optional logger hook for listener errors. Defaults to `console.error`.
   * Wired to the main-process logger in Task 36; tests can inject a spy
   * to assert isolation behaviour.
   */
  onListenerError?: (error: unknown, event: DashboardEvent) => void;
}

/**
 * Convert a DB row into a `DashboardEvent`. The DB stores `payloadJson`
 * as text; the bus hands subscribers a parsed `payload`. Downcasting
 * `eventType` to `EventType` is safe because only this module writes to
 * the table — any string that lands in there came from an `EmitInput.type`,
 * which is statically typed. `actorKind` has the same property.
 */
function parseRow(row: EventRow): DashboardEvent {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payloadJson);
  } catch {
    // Corrupted or manually-edited row. Emit a null payload instead of
    // throwing so one bad row cannot break a full replay.
    payload = null;
  }
  return {
    id: row.id,
    type: row.eventType as EventType,
    companyId: row.companyId,
    actorId: row.actorId,
    actorKind: row.actorKind as ActorKind,
    payload,
    createdAt: row.createdAt,
    traceId: row.traceId,
  };
}

export function createEventBus(options: EventBusOptions): EventBus {
  const { repo } = options;
  const onListenerError =
    options.onListenerError ??
    ((error: unknown, event: DashboardEvent) => {
      // Logged via console for now — Task 36 will route this through the
      // structured main-process logger when the orchestrator boots.
      console.error(`[event-bus] listener threw on event ${event.id} (${event.type}):`, error);
    });

  const listeners = new Set<EventListener>();

  return {
    emit<T = unknown>(input: EmitInput<T>): DashboardEvent<T> {
      // Persist FIRST. If this throws, listeners are never notified and
      // the caller gets the failure — no phantom events in flight.
      const { id, createdAt } = repo.append({
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        eventType: input.type,
        payload: input.payload,
        traceId: input.traceId,
      });

      const event: DashboardEvent<T> = {
        id,
        type: input.type,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        payload: input.payload,
        createdAt,
        traceId: input.traceId ?? null,
      };

      // Snapshot the listener set so a subscribe/unsubscribe happening
      // inside a listener callback does NOT mutate the iteration order.
      // (Set iteration ordering is stable for live sets, but mid-iteration
      // additions are still delivered — that's not the semantics we want
      // for a fan-out bus. Explicit snapshot removes all ambiguity.)
      const snapshot = Array.from(listeners);
      for (const listener of snapshot) {
        try {
          listener(event);
        } catch (err) {
          onListenerError(err, event);
        }
      }

      return event;
    },

    subscribe(listener: EventListener): Unsubscribe {
      listeners.add(listener);
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        listeners.delete(listener);
      };
    },

    replaySince(cursor: number): DashboardEvent[] {
      return repo.since(cursor).map(parseRow);
    },
  };
}
