import type { ActorKind, TicketStatus } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX,
  AGENT_IMPROVEMENT_LABEL,
  createAgentImprovementService,
} from './agent-improvement-service.js';

const NOW = 1_900_000_000_000;
const COMPANY_ID = 'company-1';
const REPORTER_ID = 'system-agent';

interface FakeTicketRow {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigneeId: string | null;
  reporterId: string;
  reporterKind: 'user' | 'employee' | 'system';
  labelsJson: string;
  dependenciesJson: string;
  slaHours: number | null;
  dueAt: number | null;
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

interface FakeEventRow {
  id: string;
  companyId: string;
  actorId: string;
  actorKind: ActorKind;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

interface CreatedTicketInput {
  companyId: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  assigneeId?: string | null;
  reporterId: string;
  reporterKind?: string;
  labelsJson?: string;
  dependenciesJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
  threadId?: string | null;
  closedAt?: number | null;
}

function makeTicket(overrides: Partial<FakeTicketRow> = {}): FakeTicketRow {
  return {
    id: 'ticket-1',
    companyId: COMPANY_ID,
    title: 'Existing ticket',
    description: 'Existing description',
    status: 'open',
    priority: 'medium',
    assigneeId: null,
    reporterId: 'rocky',
    reporterKind: 'user',
    labelsJson: '[]',
    dependenciesJson: '[]',
    slaHours: null,
    dueAt: null,
    threadId: null,
    createdAt: NOW - 10_000,
    updatedAt: NOW - 10_000,
    closedAt: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<FakeEventRow> = {}): FakeEventRow {
  return {
    id: 'event-1',
    companyId: COMPANY_ID,
    actorId: 'iris',
    actorKind: 'employee',
    eventType: 'work.failed',
    payloadJson: JSON.stringify({
      employeeId: 'iris',
      threadId: 'thread-1',
      message: 'provider stalled',
    }),
    createdAt: NOW - 1_000,
    ...overrides,
  };
}

function createFixture(args?: { tickets?: FakeTicketRow[]; events?: FakeEventRow[] }) {
  const tickets = [...(args?.tickets ?? [])];
  const events = [...(args?.events ?? [])];
  const createdTickets: CreatedTicketInput[] = [];
  const bus = { emit: vi.fn() };

  const service = createAgentImprovementService({
    now: () => NOW,
    reporterId: REPORTER_ID,
    ticketsRepo: {
      listByCompany: (companyId) => tickets.filter((ticket) => ticket.companyId === companyId),
      create: (input) => {
        const id = `created-${createdTickets.length + 1}`;
        createdTickets.push(input);
        tickets.push(
          makeTicket({
            id,
            companyId: input.companyId,
            title: input.title,
            description: input.description ?? '',
            status: (input.status as TicketStatus | undefined) ?? 'open',
            priority: (input.priority as FakeTicketRow['priority'] | undefined) ?? 'medium',
            assigneeId: input.assigneeId ?? null,
            reporterId: input.reporterId,
            reporterKind:
              (input.reporterKind as FakeTicketRow['reporterKind'] | undefined) ?? 'user',
            labelsJson: input.labelsJson ?? '[]',
            dependenciesJson: input.dependenciesJson ?? '[]',
          }),
        );
        return id;
      },
    },
    eventsRepo: {
      listByCompany: (companyId, _cursor, limit) =>
        events.filter((event) => event.companyId === companyId).slice(0, limit),
    },
    bus,
  });

  return { service, createdTickets, bus };
}

describe('agent improvement service', () => {
  it('opens one deduped self-improvement ticket for repeated work failures', () => {
    const { service, createdTickets, bus } = createFixture({
      events: [
        makeEvent({ id: 'event-2', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-1', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(result.createdTicketIds).toEqual(['created-1']);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      signalKind: 'work_failures',
      sourceCount: 2,
      createdTicketId: 'created-1',
      existingTicketId: null,
    });
    expect(createdTickets).toHaveLength(1);
    expect(createdTickets[0]).toMatchObject({
      companyId: COMPANY_ID,
      title: 'Reduce recent agent work failures',
      priority: 'high',
      reporterId: REPORTER_ID,
      reporterKind: 'system',
    });
    expect(JSON.parse(createdTickets[0]?.labelsJson ?? '[]')).toEqual(
      expect.arrayContaining([
        AGENT_IMPROVEMENT_LABEL,
        'self-improvement',
        'agent-improvement:work-failures',
      ]),
    );
    expect(createdTickets[0]?.description).toContain('event-1');
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.improvementRun',
        companyId: COMPANY_ID,
        actorId: REPORTER_ID,
        actorKind: 'system',
      }),
    );
  });

  it('does not duplicate an open improvement ticket for the same signal', () => {
    const existing = makeTicket({
      id: 'existing-improvement',
      labelsJson: JSON.stringify([AGENT_IMPROVEMENT_LABEL, 'agent-improvement:work-failures']),
    });
    const { service, createdTickets } = createFixture({
      tickets: [existing],
      events: [
        makeEvent({ id: 'event-2', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-1', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toEqual([]);
    expect(result.createdTicketIds).toEqual([]);
    expect(result.skippedExistingTicketIds).toEqual(['existing-improvement']);
    expect(result.recommendations[0]).toMatchObject({
      signalKind: 'work_failures',
      existingTicketId: 'existing-improvement',
      createdTicketId: null,
    });
  });

  it('persists the H12 cause-hash label on every newly created improvement ticket', () => {
    const { service, createdTickets } = createFixture({
      events: [
        makeEvent({ id: 'event-2', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-1', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(result.createdTicketIds).toEqual(['created-1']);
    const labels = JSON.parse(createdTickets[0]?.labelsJson ?? '[]') as string[];
    const causeLabels = labels.filter((label) =>
      label.startsWith(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX),
    );
    expect(causeLabels).toHaveLength(1);
    const hash = causeLabels[0]?.slice(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX.length) ?? '';
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.dedupedCauseHashes).toEqual([]);
    expect(result.recommendations[0]?.labels).toEqual(expect.arrayContaining(causeLabels));
  });

  it('lists open improvement tickets and recent loop history', () => {
    const { service } = createFixture({
      tickets: [
        makeTicket({
          id: 'open-improvement',
          labelsJson: JSON.stringify([
            AGENT_IMPROVEMENT_LABEL,
            'agent-improvement:blocked-tickets',
          ]),
          createdAt: NOW - 5_000,
        }),
        makeTicket({
          id: 'closed-improvement',
          status: 'done',
          closedAt: NOW - 1_000,
          labelsJson: JSON.stringify([AGENT_IMPROVEMENT_LABEL, 'agent-improvement:work-failures']),
        }),
      ],
      events: [
        makeEvent({
          id: 'run-event-1',
          actorId: REPORTER_ID,
          actorKind: 'system',
          eventType: 'agent.improvementRun',
          payloadJson: JSON.stringify({
            recommendationCount: 2,
            createdTicketIds: ['created-1'],
            inspectedEventCount: 20,
            inspectedTicketCount: 5,
          }),
          createdAt: NOW - 500,
        }),
      ],
    });

    const snapshot = service.list({ companyId: COMPANY_ID, limit: 10 });

    expect(snapshot.openTickets.map((ticket) => ticket.id)).toEqual(['open-improvement']);
    expect(snapshot.openTicketCount).toBe(1);
    expect(snapshot.recentRuns).toEqual([
      {
        eventId: 'run-event-1',
        ranAt: NOW - 500,
        recommendationCount: 2,
        createdTicketCount: 1,
        createdTicketIds: ['created-1'],
        inspectedEventCount: 20,
        inspectedTicketCount: 5,
        // H12 audit (2026-05-07): pre-fix run events that didn't carry
        // `dedupedCauseCount` backfill to 0 — truthful pre-fix state.
        dedupedCauseCount: 0,
      },
    ]);
  });
});

// H12 audit (2026-05-07): the agent self-improvement loop must NOT cycle
// on identical signals nor spawn new improvement tickets in response to
// failures of improvement work itself. Two pillars of the fix:
//   1. Recursion-via-DB block — events whose payload.ticketId or
//      payload.threadId belongs to an improvement ticket are excluded
//      from candidate-signal generation.
//   2. Causation-chain dedup — every created improvement ticket carries
//      a deterministic 8-hex-char cause hash label computed over its
//      sorted sourceRefs. Future runs scan all improvement tickets
//      (open + closed) for those labels and skip any candidate signal
//      whose hash has already been seen.
describe('agent-improvement-service — H12 audit (2026-05-07): causation-chain dedup', () => {
  it('excludes work.failed events whose threadId matches an open improvement ticket', () => {
    const improvementTicket = makeTicket({
      id: 'improve-thread-owner',
      threadId: 'improvement-thread-1',
      labelsJson: JSON.stringify([AGENT_IMPROVEMENT_LABEL]),
      status: 'in-progress',
    });
    const { service, createdTickets } = createFixture({
      tickets: [improvementTicket],
      events: [
        makeEvent({
          id: 'self-1',
          payloadJson: JSON.stringify({
            employeeId: 'iris',
            threadId: 'improvement-thread-1',
            message: 'failure during improvement work',
          }),
        }),
        makeEvent({
          id: 'self-2',
          payloadJson: JSON.stringify({
            employeeId: 'iris',
            threadId: 'improvement-thread-1',
            message: 'second failure',
          }),
        }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.dedupedCauseHashes).toEqual([]);
  });

  it('excludes runtime.execution.failed events whose ticketId matches an improvement ticket', () => {
    const improvementTicket = makeTicket({
      id: 'improve-ticket-1',
      labelsJson: JSON.stringify([AGENT_IMPROVEMENT_LABEL]),
    });
    const { service, createdTickets } = createFixture({
      tickets: [improvementTicket],
      events: [
        makeEvent({
          id: 'self-runtime-1',
          eventType: 'runtime.execution.failed',
          payloadJson: JSON.stringify({
            ticketId: 'improve-ticket-1',
            runId: 'run-1',
            threadId: null,
            employeeId: 'iris',
          }),
        }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('still surfaces external runtime failures alongside self-caused ones', () => {
    const improvementTicket = makeTicket({
      id: 'improve-ticket-1',
      labelsJson: JSON.stringify([AGENT_IMPROVEMENT_LABEL]),
    });
    const { service, createdTickets } = createFixture({
      tickets: [improvementTicket],
      events: [
        makeEvent({
          id: 'self-runtime-1',
          eventType: 'runtime.execution.failed',
          payloadJson: JSON.stringify({
            ticketId: 'improve-ticket-1',
            employeeId: 'iris',
          }),
        }),
        makeEvent({
          id: 'real-runtime-1',
          eventType: 'runtime.execution.failed',
          payloadJson: JSON.stringify({
            ticketId: 'real-ticket-99',
            employeeId: 'iris',
          }),
        }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      signalKind: 'runtime_failures',
      sourceCount: 1,
    });
    expect(result.recommendations[0]?.sourceRefs ?? []).toEqual(
      expect.arrayContaining([expect.stringContaining('real-runtime-1')]),
    );
    expect(createdTickets).toHaveLength(1);
  });

  it('dedups identical evidence after the prior improvement ticket has been closed', () => {
    // Compute the cause hash deterministically from the two source refs we
    // know the service will emit. The eventRef format is documented as
    // `${id} | ${eventType} | employee=${employeeId} | thread=${threadId}`.
    const refOne = 'event-1 | work.failed | employee=iris | thread=thread-1';
    const refTwo = 'event-2 | work.failed | employee=iris | thread=thread-1';
    const sorted = [refOne, refTwo].sort();
    const joined = sorted.join('\x1f');
    let hash = 5381;
    for (let i = 0; i < joined.length; i += 1) {
      hash = ((hash << 5) + hash) ^ joined.charCodeAt(i);
    }
    const expectedHash = (hash >>> 0).toString(16).padStart(8, '0');

    const closedImprovement = makeTicket({
      id: 'closed-improvement',
      status: 'done',
      closedAt: NOW - 5_000,
      labelsJson: JSON.stringify([
        AGENT_IMPROVEMENT_LABEL,
        'agent-improvement:work-failures',
        `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}${expectedHash}`,
      ]),
    });
    const { service, createdTickets, bus } = createFixture({
      tickets: [closedImprovement],
      events: [
        makeEvent({ id: 'event-1', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-2', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.dedupedCauseHashes).toEqual([expectedHash]);
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent.improvementRun',
        payload: expect.objectContaining({
          dedupedCauseCount: 1,
          dedupedCauseHashes: [expectedHash],
        }),
      }),
    );
  });

  it('cause hash is order-independent: identical evidence in any sort order dedups', () => {
    // First run produces a cause hash. Second run with the same events in a
    // different insertion order must produce the same hash and dedup.
    const firstRun = createFixture({
      events: [
        makeEvent({ id: 'event-1', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-2', createdAt: NOW - 1_000 }),
      ],
    });
    const firstResult = firstRun.service.run({ companyId: COMPANY_ID, eventLimit: 50 });
    const firstLabels = JSON.parse(firstRun.createdTickets[0]?.labelsJson ?? '[]') as string[];
    const firstCauseLabel = firstLabels.find((label) =>
      label.startsWith(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX),
    );
    expect(firstCauseLabel).toBeDefined();
    const firstHash = firstCauseLabel?.slice(AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX.length) ?? '';

    // Now re-run from a clean fixture with the same evidence in REVERSED
    // creation order. The cause hash must match because we sort sourceRefs
    // before hashing.
    const closedFromFirstRun = makeTicket({
      id: 'closed-prior',
      status: 'done',
      closedAt: NOW - 500,
      labelsJson: JSON.stringify([
        AGENT_IMPROVEMENT_LABEL,
        firstCauseLabel ?? '',
      ]),
    });
    const secondRun = createFixture({
      tickets: [closedFromFirstRun],
      events: [
        // reversed order vs. first run
        makeEvent({ id: 'event-2', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-1', createdAt: NOW - 1_000 }),
      ],
    });
    const secondResult = secondRun.service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(firstResult.createdTicketIds).toHaveLength(1);
    expect(secondResult.createdTicketIds).toHaveLength(0);
    expect(secondResult.dedupedCauseHashes).toEqual([firstHash]);
  });

  it('does not dedup a fresh signal with a different evidence set', () => {
    const closedWithStaleHash = makeTicket({
      id: 'closed-old',
      status: 'done',
      closedAt: NOW - 10_000,
      labelsJson: JSON.stringify([
        AGENT_IMPROVEMENT_LABEL,
        // Some hash from a prior, different evidence set
        `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}deadbeef`,
      ]),
    });
    const { service, createdTickets } = createFixture({
      tickets: [closedWithStaleHash],
      events: [
        // Brand new evidence — different IDs and threadId from the closed
        // ticket's hash, so the cause hash must differ.
        makeEvent({
          id: 'event-new-1',
          payloadJson: JSON.stringify({
            employeeId: 'iris',
            threadId: 'fresh-thread',
            message: 'new failure',
          }),
        }),
        makeEvent({
          id: 'event-new-2',
          payloadJson: JSON.stringify({
            employeeId: 'iris',
            threadId: 'fresh-thread',
            message: 'another new failure',
          }),
        }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toHaveLength(1);
    expect(result.dedupedCauseHashes).toEqual([]);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.createdTicketId).toBe('created-1');
  });

  it('open improvement ticket with same signal still routes through existing-skip path (not dedup)', () => {
    // The existing `findExistingSignalTicket` behavior takes precedence:
    // if an open ticket exists for the same signalKind, the result reports
    // `skippedExistingTicketIds` and a recommendation with `existingTicketId`.
    // This is distinct from H12 dedup (which produces zero recommendations).
    const openImprovement = makeTicket({
      id: 'open-improvement',
      status: 'open',
      labelsJson: JSON.stringify([
        AGENT_IMPROVEMENT_LABEL,
        'agent-improvement:work-failures',
        `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}feedface`,
      ]),
    });
    const { service, createdTickets } = createFixture({
      tickets: [openImprovement],
      events: [
        makeEvent({ id: 'event-1', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-2', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    expect(createdTickets).toHaveLength(0);
    expect(result.skippedExistingTicketIds).toEqual(['open-improvement']);
    expect(result.dedupedCauseHashes).toEqual([]);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      existingTicketId: 'open-improvement',
      createdTicketId: null,
    });
  });

  it('dryRun still computes dedup but writes zero tickets', () => {
    // Compute the same hash that the service will produce so the ticket's
    // cause label dedups the dry-run signal.
    const refOne = 'event-1 | work.failed | employee=iris | thread=thread-1';
    const refTwo = 'event-2 | work.failed | employee=iris | thread=thread-1';
    const sorted = [refOne, refTwo].sort();
    const joined = sorted.join('\x1f');
    let hash = 5381;
    for (let i = 0; i < joined.length; i += 1) {
      hash = ((hash << 5) + hash) ^ joined.charCodeAt(i);
    }
    const expectedHash = (hash >>> 0).toString(16).padStart(8, '0');

    const closedPrior = makeTicket({
      id: 'closed-prior',
      status: 'done',
      closedAt: NOW - 1_000,
      labelsJson: JSON.stringify([
        AGENT_IMPROVEMENT_LABEL,
        `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}${expectedHash}`,
      ]),
    });
    const { service, createdTickets } = createFixture({
      tickets: [closedPrior],
      events: [
        makeEvent({ id: 'event-1', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-2', createdAt: NOW - 1_000 }),
      ],
    });

    const result = service.run({ companyId: COMPANY_ID, eventLimit: 50, dryRun: true });

    expect(createdTickets).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.dedupedCauseHashes).toEqual([expectedHash]);
  });

  it('improvementRun event payload carries dedupedCauseCount + dedupedCauseHashes', () => {
    const refOne = 'event-1 | work.failed | employee=iris | thread=thread-1';
    const refTwo = 'event-2 | work.failed | employee=iris | thread=thread-1';
    const sorted = [refOne, refTwo].sort();
    const joined = sorted.join('\x1f');
    let hash = 5381;
    for (let i = 0; i < joined.length; i += 1) {
      hash = ((hash << 5) + hash) ^ joined.charCodeAt(i);
    }
    const expectedHash = (hash >>> 0).toString(16).padStart(8, '0');

    const { service, bus } = createFixture({
      tickets: [
        makeTicket({
          id: 'closed-prior',
          status: 'done',
          closedAt: NOW - 1_000,
          labelsJson: JSON.stringify([
            AGENT_IMPROVEMENT_LABEL,
            `${AGENT_IMPROVEMENT_CAUSE_LABEL_PREFIX}${expectedHash}`,
          ]),
        }),
      ],
      events: [
        makeEvent({ id: 'event-1', createdAt: NOW - 2_000 }),
        makeEvent({ id: 'event-2', createdAt: NOW - 1_000 }),
      ],
    });

    service.run({ companyId: COMPANY_ID, eventLimit: 50 });

    const emitCall = bus.emit.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === 'agent.improvementRun',
    );
    expect(emitCall).toBeDefined();
    const payload = (emitCall?.[0] as { payload: Record<string, unknown> } | undefined)?.payload;
    expect(payload).toMatchObject({
      dedupedCauseCount: 1,
      dedupedCauseHashes: [expectedHash],
      recommendationCount: 0,
      createdTicketCount: 0,
    });
  });

  it('snapshot.recentRuns backfills dedupedCauseCount=0 for events emitted before H12', () => {
    const { service } = createFixture({
      events: [
        makeEvent({
          id: 'pre-h12-run',
          eventType: 'agent.improvementRun',
          actorId: REPORTER_ID,
          actorKind: 'system',
          // Pre-H12 payload — no dedupedCauseCount field
          payloadJson: JSON.stringify({
            recommendationCount: 1,
            createdTicketIds: ['legacy-1'],
            inspectedEventCount: 5,
            inspectedTicketCount: 2,
          }),
          createdAt: NOW - 1_000,
        }),
      ],
    });

    const snapshot = service.list({ companyId: COMPANY_ID, limit: 5 });
    expect(snapshot.recentRuns).toHaveLength(1);
    expect(snapshot.recentRuns[0]?.dedupedCauseCount).toBe(0);
  });
});
