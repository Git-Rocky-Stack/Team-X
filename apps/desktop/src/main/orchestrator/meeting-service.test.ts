/**
 * Meeting service tests — full lifecycle against real repos + orchestrator.
 */

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import type { DashboardEvent } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMeetingsRepo } from '../db/repos/meetings.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { LOCAL_OWNER_OPERATOR_ID } from '../services/operator-access-service.js';

import { createEventBus } from './event-bus.js';
import { type MeetingServiceOptions, createMeetingService } from './meeting-service.js';

import { type Orchestrator, buildOrchestrator } from './index.js';

function makeFakeProvider(deltas: string[], usage: StreamUsage): ProviderStreamFn {
  return async function* () {
    for (const d of deltas) yield { delta: d };
    yield { done: true, usage };
  };
}

interface Fixture {
  ctx: TestDbHandle;
  runsRepo: ReturnType<typeof createRunsRepo>;
  orchestrator: Orchestrator;
  meetingService: ReturnType<typeof createMeetingService>;
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  meetingsRepo: ReturnType<typeof createMeetingsRepo>;
  messagesRepo: ReturnType<typeof createMessagesRepo>;
  threadsRepo: ReturnType<typeof createThreadsRepo>;
  ticketsRepo: ReturnType<typeof createTicketsRepo>;
  events: DashboardEvent[];
  companyId: string;
  ceoId: string;
  ctoId: string;
}

/**
 * `minutes` builds the meeting service's model-minutes deps from the live
 * fixture (so a test can reach `runsRepo`); omit it for the transcript-only
 * posture the original suite pins.
 */
async function buildFixture(
  minutes?: (deps: {
    runsRepo: ReturnType<typeof createRunsRepo>;
  }) => Pick<MeetingServiceOptions, 'minutes' | 'logger'>,
): Promise<Fixture> {
  const ctx = await makeTestDb();
  const companiesRepo = createCompaniesRepo(ctx.db);
  const employeesRepo = createEmployeesRepo(ctx.db);
  const threadsRepo = createThreadsRepo(ctx.db);
  const messagesRepo = createMessagesRepo(ctx.db);
  const runsRepo = createRunsRepo(ctx.db);
  const eventsRepo = createEventsRepo(ctx.db);
  const meetingsRepo = createMeetingsRepo(ctx.db);
  const ticketsRepo = createTicketsRepo(ctx.db);
  const bus = createEventBus({ repo: eventsRepo });

  const companyId = companiesRepo.create({
    name: 'Strategia-X',
    slug: 'strategia-x',
  });

  const ceoId = employeesRepo.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha-ceo',
    level: 'Officer',
    name: 'Alice',
    title: 'CEO',
  });

  const ctoId = employeesRepo.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'cto',
    roleMdSha: 'sha-cto',
    level: 'Officer',
    name: 'Bob',
    title: 'CTO',
  });

  const orchestrator = buildOrchestrator({
    bus,
    messagesRepo,
    runsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    calcCost: () => '0.001',
    resolveSystemPrompt: async ({ employee }) => `You are ${employee.name}.`,
    resolveProvider: async () => ({
      providerName: 'fake',
      model: 'fake-model',
      stream: makeFakeProvider(['ok'], { promptTokens: 1, completionTokens: 1 }),
    }),
    slots: 2,
  });

  const events: DashboardEvent[] = [];
  bus.subscribe((e) => events.push(e));

  const meetingService = createMeetingService({
    orchestrator,
    bus,
    meetingsRepo,
    threadsRepo,
    messagesRepo,
    employeesRepo,
    ticketsRepo,
    humanUserId: 'user-rocky',
    ...(minutes ? minutes({ runsRepo }) : {}),
  });

  return {
    ctx,
    runsRepo,
    orchestrator,
    meetingService,
    companiesRepo,
    employeesRepo,
    meetingsRepo,
    messagesRepo,
    threadsRepo,
    ticketsRepo,
    bus,
    events,
    companyId,
    ceoId,
    ctoId,
  };
}

describe('meeting service', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await buildFixture();
  });

  afterEach(() => {
    f.orchestrator.resumeCompany(f.companyId); // cleanup
    f.ctx.close();
  });

  describe('callMeeting', () => {
    it('creates a meeting, thread, and pauses the company', async () => {
      const result = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId, f.ctoId],
        agenda: 'Q1 review',
      });

      expect(result.meetingId).toBeTruthy();
      expect(result.threadId).toBeTruthy();

      // Company is paused
      expect(f.orchestrator.isCompanyPaused(f.companyId)).toBe(true);
      expect(f.companiesRepo.getById(f.companyId)?.status).toBe('meeting');

      // Meeting row persisted
      const meeting = f.meetingsRepo.getById(result.meetingId);
      expect(meeting?.status).toBe('active');
      expect(meeting?.chairId).toBe(f.ceoId);
      expect(meeting?.agenda).toBe('Q1 review');
      expect(JSON.parse(meeting?.attendeesJson ?? '[]')).toEqual([f.ceoId, f.ctoId]);

      // Thread has members (Rocky + 2 employees)
      const thread = f.threadsRepo.getById(result.threadId);
      expect(thread).toBeDefined();
      expect(thread?.kind).toBe('meeting');

      // Agenda message posted
      const messages = f.messagesRepo.listByThread(result.threadId);
      expect(messages.some((m) => m.content.includes('Q1 review'))).toBe(true);

      // meeting.started event emitted
      const startEvents = f.events.filter((e) => e.type === 'meeting.started');
      expect(startEvents).toHaveLength(1);
    });

    it('auto-includes chair in attendees if missing', async () => {
      const result = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ctoId], // chair not listed
        agenda: 'Sprint planning',
      });

      const meeting = f.meetingsRepo.getById(result.meetingId);
      const attendees = JSON.parse(meeting?.attendeesJson ?? '[]');
      expect(attendees).toContain(f.ceoId);
      expect(attendees).toContain(f.ctoId);
    });
  });

  describe('nextTurn', () => {
    it('dispatches turns in round-robin order', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId, f.ctoId],
        agenda: 'Test',
      });

      // First turn: CEO (chair)
      const first = await f.meetingService.nextTurn(meetingId);
      expect(first).toBe(f.ceoId);

      // Second turn: CTO
      const second = await f.meetingService.nextTurn(meetingId);
      expect(second).toBe(f.ctoId);

      // Third turn: wraps back to CEO
      const third = await f.meetingService.nextTurn(meetingId);
      expect(third).toBe(f.ceoId);

      // Turn events emitted
      const turnEvents = f.events.filter((e) => e.type === 'meeting.turn');
      expect(turnEvents).toHaveLength(3);
    });

    it('returns null for non-existent meeting', async () => {
      expect(await f.meetingService.nextTurn('fake-id')).toBeNull();
    });
  });

  describe('interject', () => {
    it('posts Rocky message and emits interjection event', async () => {
      const { meetingId, threadId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId, f.ctoId],
        agenda: 'Review',
      });

      const result = f.meetingService.interject(meetingId, 'Focus on Q2 targets');
      expect(result.messageId).toBeTruthy();

      const messages = f.messagesRepo.listByThread(threadId);
      const rocky = messages.find((m) => m.authorId === 'user-rocky' && m.content.includes('Q2'));
      expect(rocky).toBeDefined();

      const interjections = f.events.filter((e) => e.type === 'meeting.interjection');
      expect(interjections).toHaveLength(1);
    });

    it('defaults to the local owner operator id the rest of the app uses', async () => {
      // The default was 'user-rocky' while chat, tickets, audit and
      // operator access all use 'rocky', so the operator's meeting messages,
      // thread membership and filed tickets did not match theirs anywhere else.
      const service = createMeetingService({
        orchestrator: f.orchestrator,
        bus: f.bus,
        meetingsRepo: f.meetingsRepo,
        threadsRepo: f.threadsRepo,
        messagesRepo: f.messagesRepo,
        employeesRepo: f.employeesRepo,
        ticketsRepo: f.ticketsRepo,
      });
      const { meetingId, threadId } = await service.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId, f.ctoId],
        agenda: 'Review',
      });

      service.interject(meetingId, 'Focus on Q2 targets');

      const mine = f.messagesRepo
        .listByThread(threadId)
        .find((m) => m.content.includes('Q2 targets'));
      expect(mine?.authorId).toBe(LOCAL_OWNER_OPERATOR_ID);
    });

    it('throws for ended meeting', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Quick',
      });

      await f.meetingService.endMeeting(meetingId);

      expect(() => f.meetingService.interject(meetingId, 'Late')).toThrow(/not active/);
    });
  });

  describe('endMeeting', () => {
    it('generates minutes, resumes company, emits ended event', async () => {
      const { meetingId, threadId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Wrap-up',
      });

      // Add a message so minutes have content
      f.messagesRepo.append({
        threadId,
        authorId: f.ceoId,
        authorKind: 'employee',
        content: 'We should ship Phase 3 this week.',
      });

      const result = await f.meetingService.endMeeting(meetingId);

      // Minutes generated
      expect(result.minutesMd).toContain('Meeting Minutes');
      expect(result.minutesMd).toContain('Alice');
      expect(result.minutesMd).toContain('ship Phase 3');

      // Meeting row updated
      const meeting = f.meetingsRepo.getById(meetingId);
      expect(meeting?.status).toBe('ended');
      expect(meeting?.endedAt).toBeGreaterThan(0);
      expect(meeting?.minutesMd).toBe(result.minutesMd);

      // Company resumed
      expect(f.orchestrator.isCompanyPaused(f.companyId)).toBe(false);
      expect(f.companiesRepo.getById(f.companyId)?.status).toBe('running');

      // meeting.ended event
      const endEvents = f.events.filter((e) => e.type === 'meeting.ended');
      expect(endEvents).toHaveLength(1);
    });

    it('labels the human operator "You" in the minutes transcript', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Sync',
      });
      f.meetingService.interject(meetingId, 'Keep it short.');

      const result = await f.meetingService.endMeeting(meetingId);

      expect(result.minutesMd).toContain('**You:** Keep it short.');
      expect(result.minutesMd).not.toContain('Rocky');
    });

    it('throws for already-ended meeting', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Quick',
      });

      await f.meetingService.endMeeting(meetingId);
      await expect(f.meetingService.endMeeting(meetingId)).rejects.toThrow(/already ended/);
    });

    it('throws for non-existent meeting', async () => {
      await expect(f.meetingService.endMeeting('fake')).rejects.toThrow(/not found/);
    });
  });

  describe('getActive', () => {
    it('returns active meeting', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Check',
      });

      const active = f.meetingService.getActive(f.companyId);
      expect(active?.id).toBe(meetingId);
    });

    it('returns null after meeting ends', async () => {
      const { meetingId } = await f.meetingService.callMeeting({
        companyId: f.companyId,
        chairId: f.ceoId,
        attendeeIds: [f.ceoId],
        agenda: 'Done',
      });

      await f.meetingService.endMeeting(meetingId);
      expect(f.meetingService.getActive(f.companyId)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// End-of-meeting minutes from the chair's model
//
// Minutes used to be a raw transcript with `actionItems = []` hard-coded,
// so the ticket-creation loop never ran. On end, the chair's provider now
// summarizes the meeting and extracts action items as JSON; the existing
// loop turns those into tickets. Any failure — budget refusal, provider
// error, unparseable reply — falls back to the transcript-only minutes and
// never fails the meeting end.
// ---------------------------------------------------------------------------

describe('meeting service — model-generated minutes', () => {
  interface MinutesHarness {
    f: Fixture;
    providerCalls: Array<{ system: string; messages: StreamMessage[] }>;
    resolvedFor: string[];
    budget: {
      assertExecutionAllowed: ReturnType<typeof vi.fn>;
      recordRunSpend: ReturnType<typeof vi.fn>;
    };
    warn: ReturnType<typeof vi.fn>;
  }

  async function buildHarness(opts: {
    /** Canned model reply; a function form can embed fixture ids (attendee ids). */
    reply?: string | ((f: Fixture) => string);
    resolveThrows?: boolean;
    budgetAllowed?: boolean;
  }): Promise<MinutesHarness> {
    const providerCalls: MinutesHarness['providerCalls'] = [];
    const resolvedFor: string[] = [];
    const budget = {
      assertExecutionAllowed: vi.fn(async () => ({
        allowed: opts.budgetAllowed ?? true,
        policy: null,
        reason: opts.budgetAllowed === false ? 'monthly cap reached' : null,
        approvalItem: null,
      })),
      recordRunSpend: vi.fn(async () => undefined),
    };
    const warn = vi.fn();
    let fixture: Fixture | null = null;
    const stream: ProviderStreamFn = async function* (args) {
      providerCalls.push({ system: args.system, messages: args.messages });
      const reply = typeof opts.reply === 'function' && fixture ? opts.reply(fixture) : opts.reply;
      yield { delta: typeof reply === 'string' ? reply : '' };
      yield { done: true, usage: { promptTokens: 120, completionTokens: 40 } };
    };
    const f = await buildFixture(({ runsRepo }) => ({
      minutes: {
        resolveProvider: async (employee) => {
          resolvedFor.push(employee.id);
          if (opts.resolveThrows) throw new Error('no API key configured');
          return { providerName: 'fake', model: 'fake-model', stream };
        },
        runsRepo,
        calcCost: () => '0.002500',
        budgetGovernance: budget,
      },
      logger: { warn },
    }));
    fixture = f;
    return { f, providerCalls, resolvedFor, budget, warn };
  }

  async function holdMeeting(f: Fixture): Promise<{ meetingId: string; threadId: string }> {
    const ids = await f.meetingService.callMeeting({
      companyId: f.companyId,
      chairId: f.ceoId,
      attendeeIds: [f.ceoId, f.ctoId],
      agenda: 'Launch readiness',
    });
    f.messagesRepo.append({
      threadId: ids.threadId,
      authorId: f.ceoId,
      authorKind: 'employee',
      content: 'We launch Friday if the payment flow is green.',
    });
    f.messagesRepo.append({
      threadId: ids.threadId,
      authorId: f.ctoId,
      authorKind: 'employee',
      content: 'I will finish the payment flow load test by Thursday.',
    });
    return ids;
  }

  const TRANSCRIPT_ONLY_MINUTES =
    '# Meeting Minutes\n\n**Agenda:** Launch readiness\n\n## Discussion\n\n' +
    '**Alice:** We launch Friday if the payment flow is green.\n\n' +
    '**Bob:** I will finish the payment flow load test by Thursday.';

  let h: MinutesHarness | null = null;
  afterEach(() => {
    h?.f.orchestrator.resumeCompany(h.f.companyId);
    h?.f.ctx.close();
    h = null;
  });

  // endMeeting checks `status === 'active'` and then awaits the chair's
  // minutes call (up to 60 s) before marking the meeting ended. A second end
  // in that window passed the same check, paid for a second minutes call,
  // filed the action items twice and emitted meeting.ended twice.
  it('ends a meeting once when two ends race the minutes call', async () => {
    h = await buildHarness({ reply: 'not minutes json' });
    const { meetingId } = await holdMeeting(h.f);

    const results = await Promise.allSettled([
      h.f.meetingService.endMeeting(meetingId),
      h.f.meetingService.endMeeting(meetingId),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(
      String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason),
    ).toMatch(/already end/);
    expect(h.providerCalls).toHaveLength(1);
    expect(h.f.events.filter((e) => e.type === 'meeting.ended')).toHaveLength(1);
  });

  it('refuses an interjection while the meeting is ending', async () => {
    h = await buildHarness({ reply: 'not minutes json' });
    const { meetingId } = await holdMeeting(h.f);

    const ending = h.f.meetingService.endMeeting(meetingId);
    expect(() => h?.f.meetingService.interject(meetingId, 'One more thing')).toThrow(/ending/);
    await ending;
  });

  it('stores the chair-model summary + action items and creates tickets from them', async () => {
    const harness = await buildHarness({
      reply: (fx) =>
        [
          'Here are the minutes:',
          '```json',
          JSON.stringify({
            summary: 'Launch is set for Friday, gated on the payment flow load test.',
            actionItems: [
              { title: 'Finish payment flow load test', assigneeId: fx.ctoId, priority: 'high' },
              { title: 'Draft launch announcement' },
            ],
          }),
          '```',
        ].join('\n'),
    });
    h = harness;
    const { f } = harness;
    const { meetingId } = await holdMeeting(f);

    const result = await f.meetingService.endMeeting(meetingId);

    // The chair's provider was asked, with the transcript in the prompt.
    expect(harness.resolvedFor).toEqual([f.ceoId]);
    expect(harness.providerCalls).toHaveLength(1);
    const userPrompt = String(harness.providerCalls[0]?.messages[0]?.content ?? '');
    expect(userPrompt).toContain('Launch readiness');
    expect(userPrompt).toContain('payment flow load test by Thursday');
    expect(userPrompt).toContain(f.ctoId);

    // Summary + action items land in the minutes and the result.
    expect(result.minutesMd).toContain('## Summary');
    expect(result.minutesMd).toContain('Launch is set for Friday');
    expect(result.minutesMd).toContain('## Action Items');
    expect(result.minutesMd).toContain('Finish payment flow load test');
    expect(result.minutesMd).toContain('## Discussion');
    expect(result.actionItems).toEqual([
      { title: 'Finish payment flow load test', assigneeId: f.ctoId, priority: 'high' },
      { title: 'Draft launch announcement' },
    ]);

    // The existing ticket-creation loop ran for each item.
    expect(result.ticketIds).toHaveLength(2);
    const tickets = f.ticketsRepo.listByCompany(f.companyId);
    const loadTest = tickets.find((t) => t.title === 'Finish payment flow load test');
    expect(loadTest?.assigneeId).toBe(f.ctoId);
    expect(loadTest?.priority).toBe('high');
    expect(tickets.find((t) => t.title === 'Draft launch announcement')?.priority).toBe('medium');

    const meeting = f.meetingsRepo.getById(meetingId);
    expect(meeting?.minutesMd).toBe(result.minutesMd);
    expect(JSON.parse(meeting?.actionItemsJson ?? '[]')).toEqual(result.actionItems);

    // Budget governance: admitted against the chair, spend recorded on a run row.
    expect(harness.budget.assertExecutionAllowed).toHaveBeenCalledWith({
      companyId: f.companyId,
      employeeId: f.ceoId,
      executionKind: 'agentic',
    });
    expect(harness.budget.recordRunSpend).toHaveBeenCalledTimes(1);
    const runId = harness.budget.recordRunSpend.mock.calls[0]?.[0] as string;
    const run = f.runsRepo.getById(runId);
    expect(run?.employeeId).toBe(f.ceoId);
    expect(run?.status).toBe('success');
    expect(run?.costUsd).toBe('0.002500');
    expect(harness.warn).not.toHaveBeenCalled();
  });

  it('drops an assignee that is not a meeting attendee instead of failing the ticket', async () => {
    h = await buildHarness({
      reply: JSON.stringify({
        summary: 'Short sync.',
        actionItems: [{ title: 'Follow up with legal', assigneeId: 'emp-not-in-meeting' }],
      }),
    });
    const { meetingId } = await holdMeeting(h.f);

    const result = await h.f.meetingService.endMeeting(meetingId);

    expect(result.actionItems).toEqual([{ title: 'Follow up with legal' }]);
    expect(h.f.ticketsRepo.listByCompany(h.f.companyId)[0]?.assigneeId ?? null).toBeNull();
  });

  it('falls back to transcript-only minutes when the reply is not valid minutes JSON', async () => {
    h = await buildHarness({
      reply: JSON.stringify({
        summary: 'ok',
        actionItems: [{ title: 'Ship it', priority: 'urgent' }],
      }),
    });
    const { meetingId } = await holdMeeting(h.f);

    const result = await h.f.meetingService.endMeeting(meetingId);

    expect(result.minutesMd).toBe(TRANSCRIPT_ONLY_MINUTES);
    expect(result.actionItems).toEqual([]);
    expect(result.ticketIds).toEqual([]);
    expect(h.f.ticketsRepo.listByCompany(h.f.companyId)).toHaveLength(0);
    expect(h.f.meetingsRepo.getById(meetingId)?.status).toBe('ended');
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to transcript-only minutes when the provider cannot be resolved', async () => {
    h = await buildHarness({ resolveThrows: true });
    const { meetingId } = await holdMeeting(h.f);

    const result = await h.f.meetingService.endMeeting(meetingId);

    expect(result.minutesMd).toBe(TRANSCRIPT_ONLY_MINUTES);
    expect(result.ticketIds).toEqual([]);
    expect(h.f.meetingsRepo.getById(meetingId)?.status).toBe('ended');
    expect(h.f.orchestrator.isCompanyPaused(h.f.companyId)).toBe(false);
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('does not call the model when budget governance refuses the run', async () => {
    h = await buildHarness({
      budgetAllowed: false,
      reply: JSON.stringify({ summary: 'never used', actionItems: [] }),
    });
    const { meetingId } = await holdMeeting(h.f);

    const result = await h.f.meetingService.endMeeting(meetingId);

    expect(h.providerCalls).toHaveLength(0);
    expect(result.minutesMd).toBe(TRANSCRIPT_ONLY_MINUTES);
    expect(h.budget.recordRunSpend).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledTimes(1);
  });
});
