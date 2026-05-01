import type { ActorKind, DashboardEvent, EventType } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';


import type { EventRow } from '../db/repos/events.js';

import {
  type CopilotEventWindowBus,
  type CopilotEventWindowEventsRepo,
  __TEST_INTERNALS__,
  createCopilotEventWindow,
} from './copilot-event-window.js';

function makeEvent(overrides: Partial<DashboardEvent> = {}): DashboardEvent {
  return {
    id: overrides.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
    type: (overrides.type ?? 'work.completed') as EventType,
    companyId: overrides.companyId ?? 'co-1',
    actorId: overrides.actorId ?? 'emp-1',
    actorKind: (overrides.actorKind ?? 'agent') as ActorKind,
    payload: overrides.payload ?? {},
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

function makeEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: overrides.id ?? `evt-row-${Math.random().toString(36).slice(2, 10)}`,
    companyId: overrides.companyId ?? 'co-1',
    actorId: overrides.actorId ?? 'emp-1',
    actorKind: overrides.actorKind ?? 'agent',
    eventType: overrides.eventType ?? 'work.completed',
    payloadJson: overrides.payloadJson ?? '{}',
    createdAt: overrides.createdAt ?? Date.now(),
  } as EventRow;
}

class FakeBus implements CopilotEventWindowBus {
  private readonly listeners = new Set<(event: DashboardEvent) => void>();

  subscribe(listener: (event: DashboardEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: DashboardEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function makeEventsRepo(rows: EventRow[] = []): CopilotEventWindowEventsRepo {
  return {
    listByCompany: vi.fn((companyId: string, _cursor: number | undefined, limit: number) => {
      return rows
        .filter((r) => r.companyId === companyId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    }),
  };
}

describe('CopilotEventWindow — bounds', () => {
  it('admits events up to MAX_EVENTS_PER_COMPANY without eviction', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo();
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    const MAX = __TEST_INTERNALS__.MAX_EVENTS_PER_COMPANY;
    for (let i = 0; i < MAX - 1; i++) {
      bus.emit(makeEvent({ id: `e-${i}`, createdAt: i + 1 }));
    }
    expect(win.snapshot('co-1')).toHaveLength(MAX - 1);
  });

  it('holds exactly MAX_EVENTS_PER_COMPANY events at the boundary', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo();
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    const MAX = __TEST_INTERNALS__.MAX_EVENTS_PER_COMPANY;
    for (let i = 0; i < MAX; i++) {
      bus.emit(makeEvent({ id: `e-${i}`, createdAt: i + 1 }));
    }
    expect(win.snapshot('co-1')).toHaveLength(MAX);
  });

  it('drops oldest on overflow, preserving chronological suffix', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo();
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    const MAX = __TEST_INTERNALS__.MAX_EVENTS_PER_COMPANY;
    for (let i = 0; i < MAX + 5; i++) {
      bus.emit(makeEvent({ id: `e-${i}`, createdAt: i + 1 }));
    }
    const snap = win.snapshot('co-1');
    expect(snap).toHaveLength(MAX);
    // First retained event should be `e-5` (ids 0-4 evicted).
    expect(snap[0]?.id).toBe('e-5');
    expect(snap[snap.length - 1]?.id).toBe(`e-${MAX + 4}`);
  });
});

describe('CopilotEventWindow — per-company isolation', () => {
  it('events pushed to company A do not appear in company B snapshot', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo();
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    bus.emit(makeEvent({ id: 'a-1', companyId: 'co-A', createdAt: 1 }));
    bus.emit(makeEvent({ id: 'a-2', companyId: 'co-A', createdAt: 2 }));
    bus.emit(makeEvent({ id: 'b-1', companyId: 'co-B', createdAt: 3 }));

    expect(win.snapshot('co-A').map((e) => e.id)).toEqual(['a-1', 'a-2']);
    expect(win.snapshot('co-B').map((e) => e.id)).toEqual(['b-1']);
  });

  it('clear(A) leaves company B window untouched', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo();
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    bus.emit(makeEvent({ id: 'a-1', companyId: 'co-A', createdAt: 1 }));
    bus.emit(makeEvent({ id: 'b-1', companyId: 'co-B', createdAt: 2 }));

    win.clear('co-A');

    expect(win.snapshot('co-A')).toEqual([]);
    expect(win.snapshot('co-B').map((e) => e.id)).toEqual(['b-1']);
  });
});

describe('CopilotEventWindow — warm-start hydration', () => {
  it('first snapshot hydrates from eventsRepo in chronological order', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo([
      makeEventRow({ id: 'h-1', companyId: 'co-1', createdAt: 100 }),
      makeEventRow({ id: 'h-2', companyId: 'co-1', createdAt: 200 }),
      makeEventRow({ id: 'h-3', companyId: 'co-1', createdAt: 300 }),
    ]);
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    const snap = win.snapshot('co-1');
    expect(snap.map((e) => e.id)).toEqual(['h-1', 'h-2', 'h-3']);
    expect(eventsRepo.listByCompany).toHaveBeenCalledWith(
      'co-1',
      undefined,
      __TEST_INTERNALS__.MAX_EVENTS_PER_COMPANY,
    );
  });

  it('second snapshot returns a defensive copy and does NOT re-hydrate', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo([
      makeEventRow({ id: 'h-1', companyId: 'co-1', createdAt: 100 }),
    ]);
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    const s1 = win.snapshot('co-1');
    // Mutate the snapshot — must not corrupt internal state.
    s1.length = 0;
    s1.push(makeEvent({ id: 'bogus' }));

    const s2 = win.snapshot('co-1');
    expect(s2.map((e) => e.id)).toEqual(['h-1']);
    expect(eventsRepo.listByCompany).toHaveBeenCalledTimes(1);
  });
});

describe('CopilotEventWindow — archive clear', () => {
  it('clear(companyId) empties the window and re-hydrates on next snapshot', () => {
    const bus = new FakeBus();
    const eventsRepo = makeEventsRepo([
      makeEventRow({ id: 'h-1', companyId: 'co-1', createdAt: 100 }),
    ]);
    const win = createCopilotEventWindow({ bus, eventsRepo });
    win.start();

    win.snapshot('co-1'); // hydrates
    win.clear('co-1');
    const post = win.snapshot('co-1'); // should re-hydrate

    expect(post.map((e) => e.id)).toEqual(['h-1']);
    expect(eventsRepo.listByCompany).toHaveBeenCalledTimes(2);
  });
});
