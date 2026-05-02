import type { ActorKind, TicketStatus } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
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
      },
    ]);
  });
});
