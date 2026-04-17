/**
 * CopilotEventWindow — in-memory rolling buffer of dashboard events,
 * keyed per company, feeding the T4 CopilotAnalyzerService. Bounded
 * deque (100 events) with FIFO eviction + warm-start hydration from
 * the append-only events table so a freshly-booted app does not start
 * the analyzer with an empty window.
 *
 * Phase 5 — M33 T3.
 *
 * Design notes:
 *
 *   1. Why a standalone subscriber vs. piggybacking the event bus?
 *      The bus fans out to every subscriber on every emit. The window
 *      is a write-heavy per-company accumulator with defensive-copy
 *      reads — keeping it as its own subscriber isolates the
 *      accumulator semantics from fan-out semantics and keeps the bus
 *      free of per-consumer buffering.
 *
 *   2. Why exclude token.delta? Token deltas fire per character during
 *      streaming (~50-500 events per chat turn). Admitting them would
 *      pin the 100-event window to streaming noise and evict every
 *      meaningful signal the analyzer cares about. This mirrors the
 *      (stale-JSDoc) intent of `events.repo.listByCompany` — the
 *      JSDoc documents the filter, the implementation lost it; we
 *      apply it here deliberately for the analyzer's benefit.
 *
 *   3. Why a defensive copy from snapshot()? T4's analyzer iterates
 *      the snapshot while building prompts (100-500 ms on a cold LLM
 *      path). If snapshot returned the internal array by reference, a
 *      live push() + shift() overflow would mutate the iterated array
 *      — classic use-after-mutate. Copying is cheap (<= 100 events,
 *      each a few hundred bytes).
 *
 *   4. Why warm-start + hydrated Set? Post-reboot, the window is
 *      empty; the analyzer's first tick would produce no signal.
 *      Warm-start fills it from the events log. The `hydrated` Set
 *      prevents re-hydration on subsequent snapshot() calls — both
 *      wasteful AND would stamp newer in-memory events with stale
 *      history ordering.
 *
 *   5. `companies.archive` wiring — landed. The `companies.archive`
 *      IPC handler (M33 F3) now calls, in order:
 *
 *        (1) `CopilotAnalyzerService.stop(companyId)` — kill the
 *            per-company timer and abort any in-flight tick so a
 *            racing analyze call cannot observe the buffer mid-clear.
 *        (2) `CopilotEventWindow.clear(companyId)` — this method —
 *            drops the rolling buffer + `hydrated` flag.
 *        (3) `companiesRepo.archive(companyId)` — flips the row to
 *            `status = 'archived'` so the orchestrator dispatcher
 *            stops scheduling for the company on the next pass.
 *        (4) `bus.emit('company.archived', ...)` — fans out the
 *            lifecycle event (architectural invariant #11).
 *
 *      Ordering matters: (1) MUST precede (2) or a tick can re-hydrate
 *      from the events log the moment we clear it. (2) MUST precede
 *      (3) because the analyzer also reads the row's status; clearing
 *      the buffer before the row flips keeps the "was running, now
 *      gone" semantics atomic from the copilot's perspective.
 *
 *      The IPC contract widens `CompanyStatus` with `'archived'`
 *      (see `@team-x/shared-types/entities.ts`). The handler is
 *      idempotent — re-archiving an already-archived company re-runs
 *      every step (1)-(4) and re-emits the bus event. That is
 *      intentional: we would rather repeat the cleanup than silently
 *      skip it on a retry.
 */

import type { ActorKind, DashboardEvent, EventType } from '@team-x/shared-types';

import type { EventRow } from '../db/repos/events.js';

const MAX_EVENTS_PER_COMPANY = 100;

const EXCLUDED_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>(['token.delta']);

export interface CopilotEventWindowBus {
  subscribe(listener: (event: DashboardEvent) => void): () => void;
}

export interface CopilotEventWindowEventsRepo {
  listByCompany(companyId: string, cursor: number | undefined, limit: number): EventRow[];
}

export interface CopilotEventWindowDeps {
  bus: CopilotEventWindowBus;
  eventsRepo: CopilotEventWindowEventsRepo;
}

export interface CopilotEventWindow {
  start(): void;
  stop(): void;
  snapshot(companyId: string): DashboardEvent[];
  clear(companyId: string): void;
}

export function createCopilotEventWindow(deps: CopilotEventWindowDeps): CopilotEventWindow {
  const buffers = new Map<string, DashboardEvent[]>();
  const hydrated = new Set<string>();
  let unsubscribe: (() => void) | null = null;

  const push = (event: DashboardEvent): void => {
    if (EXCLUDED_EVENT_TYPES.has(event.type)) return;
    const existing = buffers.get(event.companyId);
    const deque = existing ?? [];
    deque.push(event);
    if (deque.length > MAX_EVENTS_PER_COMPANY) deque.shift();
    if (!existing) buffers.set(event.companyId, deque);
  };

  const hydrate = (companyId: string): void => {
    const historical = deps.eventsRepo.listByCompany(companyId, undefined, MAX_EVENTS_PER_COMPANY);
    // listByCompany returns newest-first; the deque needs oldest-first
    // so analyzer prompt-builders can read in chronological order.
    const parsed: DashboardEvent[] = [];
    for (let i = historical.length - 1; i >= 0; i--) {
      const row = historical[i];
      if (!row) continue;
      const type = row.eventType as EventType;
      if (EXCLUDED_EVENT_TYPES.has(type)) continue;
      parsed.push(parseRow(row));
    }
    // Merge with any live events that arrived between start() and the
    // first snapshot() — they are chronologically newer than history
    // so they go AFTER the parsed historical events.
    const live = buffers.get(companyId) ?? [];
    const merged = parsed.concat(live);
    while (merged.length > MAX_EVENTS_PER_COMPANY) merged.shift();
    buffers.set(companyId, merged);
  };

  return {
    start(): void {
      if (unsubscribe) return;
      unsubscribe = deps.bus.subscribe(push);
    },
    stop(): void {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
    snapshot(companyId: string): DashboardEvent[] {
      if (!hydrated.has(companyId)) {
        hydrate(companyId);
        hydrated.add(companyId);
      }
      const deque = buffers.get(companyId) ?? [];
      return [...deque];
    },
    clear(companyId: string): void {
      buffers.delete(companyId);
      hydrated.delete(companyId);
    },
  };
}

/**
 * EventRow → DashboardEvent — mirrors the `parseRow` helper in
 * `main/orchestrator/event-bus.ts`. Duplicated here because the
 * original is module-private; extracting it to a shared module for
 * one helper would widen the events surface unnecessarily. If a third
 * consumer needs this, move both copies to `db/repos/events.ts` as
 * `parseEventRow` and export it.
 */
function parseRow(row: EventRow): DashboardEvent {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payloadJson);
  } catch {
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
  };
}

/** Exposed for tests only — NEVER depend on this from production code. */
export const __TEST_INTERNALS__ = {
  MAX_EVENTS_PER_COMPANY,
  EXCLUDED_EVENT_TYPES,
} as const;
