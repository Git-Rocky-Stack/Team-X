/**
 * Meeting service tests — full lifecycle against real repos + orchestrator.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProviderStreamFn, StreamUsage } from '@team-x/provider-router';
import type { DashboardEvent } from '@team-x/shared-types';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMeetingsRepo } from '../db/repos/meetings.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createEventBus } from './event-bus.js';
import { type Orchestrator, buildOrchestrator } from './index.js';
import { createMeetingService } from './meeting-service.js';

function makeFakeProvider(deltas: string[], usage: StreamUsage): ProviderStreamFn {
  return async function* () {
    for (const d of deltas) yield { delta: d };
    yield { done: true, usage };
  };
}

interface Fixture {
  ctx: TestDbHandle;
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

async function buildFixture(): Promise<Fixture> {
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
  });

  return {
    ctx,
    orchestrator,
    meetingService,
    companiesRepo,
    employeesRepo,
    meetingsRepo,
    messagesRepo,
    threadsRepo,
    ticketsRepo,
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
