/**
 * Event bus tests.
 *
 * Two layers of coverage:
 *
 *   1. Integration with the real events repo (against an in-memory test
 *      DB via `makeTestDb`). These tests prove the bus actually persists
 *      and can replay through Drizzle + better-sqlite3 — exactly the
 *      paths the production main process will exercise.
 *
 *   2. Behavioral tests against a fake `EventsRepoLike` to exercise edge
 *      cases that are inconvenient or non-deterministic on a real DB:
 *      - persistence failure must abort fan-out
 *      - listener exceptions must not break other listeners
 *      - subscribe/unsubscribe inside a listener must not corrupt iteration
 *
 * The split mirrors how the rest of the desktop test suite is organized:
 * fast unit tests with hand-rolled fakes for branching logic, plus a
 * smaller set of repo-backed tests to lock in the contract with the
 * real database driver.
 */

import type { DashboardEvent, TokenDeltaPayload } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AppendEventInput,
  type AppendEventResult,
  type EventRow,
  createEventsRepo,
} from '../db/repos/events.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { type EventsRepoLike, createEventBus } from './event-bus.js';

// ---------------------------------------------------------------------------
// Integration: bus + real events repo
// ---------------------------------------------------------------------------

describe('event bus (integration with events repo)', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createEventsRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createEventsRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  it('emit persists the event to the DB and returns a fully-formed DashboardEvent', () => {
    const bus = createEventBus({ repo });

    const event = bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { threadId: 't1' },
    });

    expect(event.id).toBeTypeOf('string');
    expect(event.id.length).toBeGreaterThan(0);
    expect(event.type).toBe('work.queued');
    expect(event.companyId).toBe('co-1');
    expect(event.actorId).toBe('orchestrator');
    expect(event.actorKind).toBe('orchestrator');
    expect(event.payload).toEqual({ threadId: 't1' });
    expect(event.createdAt).toBeTypeOf('number');
    expect(event.createdAt).toBeGreaterThan(0);

    // The persisted row carries identical values.
    const rows = repo.since(0);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.id).toBe(event.id);
    expect(row?.eventType).toBe('work.queued');
    expect(row?.createdAt).toBe(event.createdAt);
    expect(JSON.parse(row?.payloadJson ?? 'null')).toEqual({ threadId: 't1' });
  });

  it('the createdAt returned by emit equals the persisted row exactly', () => {
    // The bus contract: subscribers see the same createdAt that's in the
    // DB. This codifies the "no live/replay drift" invariant documented
    // in events.ts AppendEventResult.
    const bus = createEventBus({ repo });
    const event = bus.emit({
      type: 'token.delta',
      companyId: 'co-1',
      actorId: 'emp-1',
      actorKind: 'employee',
      payload: { threadId: 't1', messageId: 'm1', delta: 'hi' },
    });
    const row = repo.since(0).find((r) => r.id === event.id);
    expect(row?.createdAt).toBe(event.createdAt);
  });

  it('replaySince returns deserialized DashboardEvents in createdAt order', async () => {
    const bus = createEventBus({ repo });

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { n: 1 },
    });
    await new Promise((r) => setTimeout(r, 3));
    bus.emit({
      type: 'work.started',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { n: 2 },
    });
    await new Promise((r) => setTimeout(r, 3));
    bus.emit({
      type: 'work.completed',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: { n: 3 },
    });

    const replayed = bus.replaySince(0);
    expect(replayed).toHaveLength(3);
    expect(replayed.map((e) => e.type)).toEqual(['work.queued', 'work.started', 'work.completed']);
    expect(replayed.map((e) => (e.payload as { n: number }).n)).toEqual([1, 2, 3]);
    // Each replayed event must have the full DashboardEvent shape.
    for (const evt of replayed) {
      expect(evt.id).toBeTypeOf('string');
      expect(evt.companyId).toBe('co-1');
      expect(evt.actorKind).toBe('orchestrator');
      expect(evt.createdAt).toBeGreaterThan(0);
    }
  });

  it('replaySince(cursor) only returns events newer than cursor', async () => {
    const bus = createEventBus({ repo });
    const first = bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'a',
      actorKind: 'system',
      payload: { n: 1 },
    });
    await new Promise((r) => setTimeout(r, 5));
    const cursor = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    const second = bus.emit({
      type: 'work.started',
      companyId: 'co-1',
      actorId: 'a',
      actorKind: 'system',
      payload: { n: 2 },
    });

    const replayed = bus.replaySince(cursor);
    const ids = replayed.map((e) => e.id);
    expect(ids).toContain(second.id);
    expect(ids).not.toContain(first.id);
  });

  it('replaySince returns an empty array when there are no events', () => {
    const bus = createEventBus({ repo });
    expect(bus.replaySince(0)).toEqual([]);
  });

  it('replaySince yields a null payload for a corrupted row instead of throwing', () => {
    // Manually persist a row with malformed JSON to simulate a corrupted
    // disk write. The bus must keep replaying — one bad row cannot brick
    // a renderer reconnect.
    const bus = createEventBus({ repo });
    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'a',
      actorKind: 'system',
      payload: { ok: true },
    });
    // Bypass the repo to inject corruption — exactly the scenario the
    // parseRow fallback exists for. Use the raw sql.js handle (the
    // Drizzle wrapper does not expose plain-string `run`).
    ctx.raw.run('UPDATE events SET payload_json = "{not-json"');

    const replayed = bus.replaySince(0);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.payload).toBeNull();
  });

  it('emit fans out to a single subscriber synchronously after persist', () => {
    const bus = createEventBus({ repo });
    const received: DashboardEvent[] = [];
    bus.subscribe((evt) => received.push(evt));

    const emitted = bus.emit({
      type: 'token.delta',
      companyId: 'co-1',
      actorId: 'emp-1',
      actorKind: 'employee',
      payload: { threadId: 't1', messageId: 'm1', delta: 'hello' },
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(emitted);
    // Persisted before fan-out — the row exists by the time the listener
    // ran. (We can prove this from outside the listener: the row is in the
    // DB now, after `emit` returned.)
    expect(repo.since(0)).toHaveLength(1);
  });

  it('emit fans out to multiple subscribers in subscribe order', () => {
    const bus = createEventBus({ repo });
    const order: string[] = [];
    bus.subscribe(() => order.push('a'));
    bus.subscribe(() => order.push('b'));
    bus.subscribe(() => order.push('c'));

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('subscribe returns an unsubscribe that removes only that listener', () => {
    const bus = createEventBus({ repo });
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.subscribe(a);
    bus.subscribe(b);

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    expect(a).toHaveBeenCalledTimes(1); // unchanged
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe is idempotent', () => {
    const bus = createEventBus({ repo });
    const listener = vi.fn();
    const unsub = bus.subscribe(listener);
    unsub();
    expect(() => unsub()).not.toThrow();
    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('payload generic on emit propagates into the returned event type', () => {
    // This is a compile-time guarantee. The runtime check exists so that
    // a regression in the generic plumbing produces a test failure rather
    // than a silent type erosion.
    const bus = createEventBus({ repo });
    const event = bus.emit<TokenDeltaPayload>({
      type: 'token.delta',
      companyId: 'co-1',
      actorId: 'emp-1',
      actorKind: 'employee',
      payload: { threadId: 't1', messageId: 'm1', delta: 'x' },
    });
    // TypeScript-level: event.payload.delta is statically `string`. At
    // runtime, just confirm the value round-trips.
    expect(event.payload.delta).toBe('x');
    expect(event.payload.threadId).toBe('t1');
    expect(event.payload.messageId).toBe('m1');
  });

  // -------------------------------------------------------------------------
  // H4 audit 2026-05-07 — traceId propagation
  // -------------------------------------------------------------------------

  it('emit propagates traceId to repo.append, the returned event, and replaySince', () => {
    const bus = createEventBus({ repo });
    const traceId = '0123456789abcdef0123456789abcdef';
    const subscriber = vi.fn<[DashboardEvent], void>();
    bus.subscribe(subscriber);

    const event = bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: {},
      traceId,
    });

    // Returned event carries the trace ID.
    expect(event.traceId).toBe(traceId);
    // Subscriber received the same trace ID.
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0]?.[0]?.traceId).toBe(traceId);
    // Persisted row carries the trace ID.
    const rows = repo.since(0);
    expect(rows[0]?.traceId).toBe(traceId);
    // replaySince surfaces the trace ID on the rehydrated event.
    const replayed = bus.replaySince(0);
    expect(replayed[0]?.traceId).toBe(traceId);
  });

  it('emit() without traceId surfaces null on the returned event and replay (legacy callers)', () => {
    const bus = createEventBus({ repo });
    const event = bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'orchestrator',
      actorKind: 'orchestrator',
      payload: {},
    });
    expect(event.traceId).toBeNull();
    const replayed = bus.replaySince(0);
    expect(replayed[0]?.traceId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Behavioral: bus against a fake repo
// ---------------------------------------------------------------------------

interface FakeRepo extends EventsRepoLike {
  rows: EventRow[];
  appendCalls: AppendEventInput[];
  failNext: boolean;
}

function makeFakeRepo(): FakeRepo {
  const repo: FakeRepo = {
    rows: [],
    appendCalls: [],
    failNext: false,
    append(input: AppendEventInput): AppendEventResult {
      repo.appendCalls.push(input);
      if (repo.failNext) {
        repo.failNext = false;
        throw new Error('persistence failed');
      }
      const id = `id-${repo.rows.length + 1}`;
      const createdAt = 1_700_000_000_000 + repo.rows.length;
      repo.rows.push({
        id,
        companyId: input.companyId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        eventType: input.eventType,
        payloadJson: JSON.stringify(input.payload),
        createdAt,
      });
      return { id, createdAt };
    },
    since(cursor: number): EventRow[] {
      return repo.rows.filter((r) => r.createdAt > cursor);
    },
  };
  return repo;
}

describe('event bus (behavioral with fake repo)', () => {
  it('a persistence failure aborts fan-out and propagates the error', () => {
    const repo = makeFakeRepo();
    repo.failNext = true;
    const listener = vi.fn();
    const bus = createEventBus({ repo });
    bus.subscribe(listener);

    expect(() =>
      bus.emit({
        type: 'work.queued',
        companyId: 'co-1',
        actorId: 'x',
        actorKind: 'system',
        payload: {},
      }),
    ).toThrow('persistence failed');

    // Listener was NOT called — the fan-out only happens on a successful
    // persist. This is the contract the orchestrator depends on.
    expect(listener).not.toHaveBeenCalled();
    // No row was persisted (the fake threw before pushing).
    expect(repo.rows).toHaveLength(0);
  });

  it('a throwing listener does not break other listeners', () => {
    const repo = makeFakeRepo();
    const onListenerError = vi.fn();
    const bus = createEventBus({ repo, onListenerError });

    const a = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('listener boom');
    });
    const c = vi.fn();
    bus.subscribe(a);
    bus.subscribe(bad);
    bus.subscribe(c);

    expect(() =>
      bus.emit({
        type: 'work.queued',
        companyId: 'co-1',
        actorId: 'x',
        actorKind: 'system',
        payload: {},
      }),
    ).not.toThrow();

    expect(a).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    expect(onListenerError).toHaveBeenCalledTimes(1);
    const [err, evt] = onListenerError.mock.calls[0] ?? [];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('listener boom');
    expect((evt as DashboardEvent).type).toBe('work.queued');
  });

  it('subscribe added inside a listener is NOT called for the in-flight event', () => {
    // Snapshot iteration semantics: a listener that subscribes another
    // listener while an emit is in progress should not see that new
    // listener fire until the NEXT emit. This keeps fan-out predictable.
    const repo = makeFakeRepo();
    const bus = createEventBus({ repo });

    const lateListener = vi.fn();
    bus.subscribe(() => {
      bus.subscribe(lateListener);
    });

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    expect(lateListener).not.toHaveBeenCalled();

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    // Now that the late listener was registered before the SECOND emit,
    // it fires once. (And the original outer listener registered ANOTHER
    // copy, so two are pending — confirming snapshot semantics work
    // both ways.)
    expect(lateListener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe inside a listener does not affect the in-flight emit', () => {
    const repo = makeFakeRepo();
    const bus = createEventBus({ repo });

    const a = vi.fn();
    let unsubB: () => void = () => {};
    const b = vi.fn(() => unsubB());
    const c = vi.fn();
    bus.subscribe(a);
    unsubB = bus.subscribe(b);
    bus.subscribe(c);

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    // All three were called for the in-flight event because the snapshot
    // was taken before any listener ran.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    bus.emit({
      type: 'work.queued',
      companyId: 'co-1',
      actorId: 'x',
      actorKind: 'system',
      payload: {},
    });
    // b is gone now.
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it('emit forwards every semantic field to the repo verbatim', () => {
    const repo = makeFakeRepo();
    const bus = createEventBus({ repo });

    bus.emit({
      type: 'employee.status_changed',
      companyId: 'co-zzz',
      actorId: 'emp-9',
      actorKind: 'orchestrator',
      payload: { from: 'idle', to: 'thinking' },
    });

    expect(repo.appendCalls).toHaveLength(1);
    const call = repo.appendCalls[0];
    expect(call).toBeDefined();
    expect(call?.companyId).toBe('co-zzz');
    expect(call?.actorId).toBe('emp-9');
    expect(call?.actorKind).toBe('orchestrator');
    expect(call?.eventType).toBe('employee.status_changed');
    expect(call?.payload).toEqual({ from: 'idle', to: 'thinking' });
  });
});
