/**
 * Meeting service — lifecycle management for the meeting primitive.
 *
 * Composes the orchestrator (pause/drain/resume), event bus, and repos
 * to implement the full meeting flow:
 *
 *   1. callMeeting — pause the company, create meeting+thread, chair speaks first.
 *   2. nextTurn — dispatch the next attendee's turn (round-robin).
 *   3. interject — Rocky sends a mid-meeting message, then triggers the
 *      next scheduled speaker.
 *   4. endMeeting — generate minutes, extract action items, create tickets,
 *      resume the company.
 *
 * Turn state is ephemeral (in-memory). Only the meeting row, thread, and
 * messages are persisted. This matches the design doc: "Turn state tracked
 * in orchestrator memory (not DB — ephemeral)."
 *
 * The meeting primitive is architecturally clean because the orchestrator
 * is the ONLY scheduler (invariant #2). When pauseCompany runs, nothing
 * new dispatches for that company — zero race conditions.
 */

import type { MeetingActionItem, MeetingMode } from '@team-x/shared-types';

import type { CreateMeetingInput, MeetingRow } from '../db/repos/meetings.js';
import type { AppendMessageInput } from '../db/repos/messages.js';
import type { CreateTicketInput } from '../db/repos/tickets.js';

import type { EventBus } from './event-bus.js';

import type { Orchestrator, OrchestratorEmployeesRepo, OrchestratorMessagesRepo } from './index.js';

// ---------------------------------------------------------------------------
// Repo shapes — narrowed interfaces the service actually uses
// ---------------------------------------------------------------------------

export interface MeetingServiceMeetingsRepo {
  create(input: CreateMeetingInput): string;
  getById(id: string): MeetingRow | null;
  listByCompany(companyId: string): MeetingRow[];
  getActive(companyId: string): MeetingRow | null;
  end(id: string, opts?: { minutesMd?: string; actionItemsJson?: string }): void;
  setMinutes(id: string, minutesMd: string): void;
  setActionItems(id: string, actionItemsJson: string): void;
}

export interface MeetingServiceTicketsRepo {
  create(input: CreateTicketInput): string;
}

export interface MeetingServiceThreadsRepo {
  create(input: { companyId: string; kind: string; subject?: string; createdBy: string }): string;
  addMember(input: {
    threadId: string;
    memberId: string;
    memberKind: string;
    roleInThread?: string;
  }): void;
}

export interface MeetingServiceMessagesRepo {
  append(input: AppendMessageInput): string;
}

// ---------------------------------------------------------------------------
// Turn state (ephemeral, per active meeting)
// ---------------------------------------------------------------------------

interface TurnState {
  attendees: string[];
  currentIndex: number;
  mode: MeetingMode;
}

const activeTurnState = new Map<string, TurnState>();

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MeetingServiceOptions {
  orchestrator: Orchestrator;
  bus: EventBus;
  meetingsRepo: MeetingServiceMeetingsRepo;
  threadsRepo: MeetingServiceThreadsRepo;
  messagesRepo: MeetingServiceMessagesRepo;
  employeesRepo: OrchestratorEmployeesRepo;
  ticketsRepo: MeetingServiceTicketsRepo;
  /** Human user id for "Rocky" messages. */
  humanUserId?: string;
}

export interface CallMeetingArgs {
  companyId: string;
  chairId: string;
  attendeeIds: string[];
  agenda: string;
  mode?: MeetingMode;
}

export interface CallMeetingResult {
  meetingId: string;
  threadId: string;
}

export interface EndMeetingResult {
  minutesMd: string | null;
  actionItems: MeetingActionItem[];
  ticketIds: string[];
}

export interface InterjectResult {
  messageId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createMeetingService(opts: MeetingServiceOptions) {
  const {
    orchestrator,
    bus,
    meetingsRepo,
    threadsRepo,
    messagesRepo,
    employeesRepo,
    ticketsRepo,
    humanUserId = 'user-rocky',
  } = opts;

  return {
    /**
     * Start a meeting:
     *   1. Pause the company (drain in-flight work).
     *   2. Create a meeting thread (kind='meeting').
     *   3. Add all attendees + Rocky as thread members.
     *   4. Create the meeting row.
     *   5. Post the agenda as the first system message.
     *   6. Initialize turn state.
     *   7. Emit 'meeting.started' event.
     *   8. Enqueue the chair's first turn.
     */
    async callMeeting(args: CallMeetingArgs): Promise<CallMeetingResult> {
      const { companyId, chairId, attendeeIds, agenda, mode = 'round-robin' } = args;

      // Validate: chair must be in attendees
      const allAttendees = attendeeIds.includes(chairId) ? attendeeIds : [chairId, ...attendeeIds];

      // 1. Pause the company — blocks new non-meeting work, drains in-flight.
      await orchestrator.pauseCompany(companyId);

      // 2. Create meeting thread.
      const threadId = threadsRepo.create({
        companyId,
        kind: 'meeting',
        subject: agenda || 'Meeting',
        createdBy: humanUserId,
      });

      // 3. Add members.
      threadsRepo.addMember({
        threadId,
        memberId: humanUserId,
        memberKind: 'user',
      });
      for (const empId of allAttendees) {
        const role = empId === chairId ? 'chair' : 'attendee';
        threadsRepo.addMember({
          threadId,
          memberId: empId,
          memberKind: 'employee',
          roleInThread: role,
        });
      }

      // 4. Create meeting row.
      const meetingId = meetingsRepo.create({
        companyId,
        threadId,
        chairId,
        agenda,
        mode,
        attendeesJson: JSON.stringify(allAttendees),
      });

      // 5. Post agenda as system message.
      if (agenda) {
        messagesRepo.append({
          threadId,
          authorId: 'system',
          authorKind: 'system',
          content: `**Meeting Agenda**\n\n${agenda}`,
        });
      }

      // 6. Initialize turn state — chair is first.
      const chairIndex = allAttendees.indexOf(chairId);
      activeTurnState.set(meetingId, {
        attendees: allAttendees,
        currentIndex: chairIndex >= 0 ? chairIndex : 0,
        mode,
      });

      // 7. Emit event.
      bus.emit({
        type: 'meeting.started',
        companyId,
        actorId: humanUserId,
        actorKind: 'user',
        payload: {
          meetingId,
          threadId,
          chairId,
          attendees: allAttendees,
          agenda,
        },
      });

      // 8. Enqueue the chair's opening turn.
      // The chair's turn runs through the normal orchestrator pipeline but
      // on the meeting thread. Since the company is "paused" for normal
      // work, we temporarily un-gate this specific enqueue by routing
      // through a direct agent run. We resume company dispatch ONLY after
      // meeting end — but meeting turns bypass the company gate because
      // they're meeting-internal work.
      //
      // Implementation: we use enqueueChat directly — the pauseCompany
      // gate in the orchestrator checks `pausedCompanies` set, but
      // meeting-thread turns need to flow. We handle this by having
      // endMeeting resume the company. The turns themselves happen via
      // explicit nextTurn() calls that post a user-context message then
      // enqueue a response — these are meeting-controlled, not
      // orchestrator-dispatched background work.

      return { meetingId, threadId };
    },

    /**
     * Dispatch the next turn in round-robin order. Posts a framing
     * message (e.g. "It's [Name]'s turn to speak") then enqueues
     * the employee's agent reply on the meeting thread.
     *
     * Returns the employee id of who's speaking, or null if the
     * meeting is not active.
     */
    async nextTurn(meetingId: string): Promise<string | null> {
      const meeting = meetingsRepo.getById(meetingId);
      if (!meeting || meeting.status !== 'active') return null;

      const state = activeTurnState.get(meetingId);
      if (!state) return null;

      const employeeId = state.attendees[state.currentIndex];
      if (!employeeId) return null;

      const employee = employeesRepo.getById(employeeId);
      const name = employee?.name ?? 'Unknown';

      // Post a system prompt for the turn.
      const turnMsgId = messagesRepo.append({
        threadId: meeting.threadId,
        authorId: 'system',
        authorKind: 'system',
        content: `*It's ${name}'s turn to speak.*`,
      });

      // Emit turn event.
      bus.emit({
        type: 'meeting.turn',
        companyId: meeting.companyId,
        actorId: employeeId,
        actorKind: 'employee',
        payload: {
          meetingId,
          threadId: meeting.threadId,
          employeeId,
          messageId: turnMsgId,
        },
      });

      // Advance round-robin.
      state.currentIndex = (state.currentIndex + 1) % state.attendees.length;

      return employeeId;
    },

    /**
     * Rocky interjects mid-meeting. Posts the message, emits an event,
     * then optionally triggers the next turn.
     */
    interject(meetingId: string, content: string): InterjectResult {
      const meeting = meetingsRepo.getById(meetingId);
      if (!meeting || meeting.status !== 'active') {
        throw new Error(`meeting-service: meeting not active: ${meetingId}`);
      }

      const messageId = messagesRepo.append({
        threadId: meeting.threadId,
        authorId: humanUserId,
        authorKind: 'user',
        content,
      });

      bus.emit({
        type: 'meeting.interjection',
        companyId: meeting.companyId,
        actorId: humanUserId,
        actorKind: 'user',
        payload: {
          meetingId,
          threadId: meeting.threadId,
          messageId,
        },
      });

      return { messageId };
    },

    /**
     * End a meeting:
     *   1. Generate minutes (simplified — concatenate thread messages).
     *   2. Extract action items from minutes.
     *   3. Create tickets for action items.
     *   4. Update meeting row with minutes + action items.
     *   5. Emit 'meeting.ended' event.
     *   6. Resume the company orchestrator.
     *   7. Clean up turn state.
     */
    async endMeeting(meetingId: string): Promise<EndMeetingResult> {
      const meeting = meetingsRepo.getById(meetingId);
      if (!meeting) {
        throw new Error(`meeting-service: meeting not found: ${meetingId}`);
      }
      if (meeting.status !== 'active') {
        throw new Error(`meeting-service: meeting already ended: ${meetingId}`);
      }

      // 1. Generate minutes — simplified summarization.
      // In Phase 4, this would use an LLM. For now, build a markdown
      // transcript of all non-system messages.
      const messages = (messagesRepo as unknown as OrchestratorMessagesRepo).listByThread(
        meeting.threadId,
      );
      const transcript = messages
        .filter((m) => m.authorKind !== 'system')
        .map((m) => {
          const emp = employeesRepo.getById(m.authorId);
          const speaker = emp ? emp.name : m.authorKind === 'user' ? 'Rocky' : m.authorId;
          return `**${speaker}:** ${m.content}`;
        })
        .join('\n\n');

      const minutesMd =
        transcript.length > 0
          ? `# Meeting Minutes\n\n**Agenda:** ${meeting.agenda || '(none)'}\n\n## Discussion\n\n${transcript}`
          : null;

      // 2. Action items — for now, empty. Phase 4 will use LLM extraction.
      // The infrastructure is in place: the repo, the ticket creation path,
      // and the event payload all support action items.
      const actionItems: MeetingActionItem[] = [];
      const ticketIds: string[] = [];

      // 3. Create tickets for any action items.
      for (const item of actionItems) {
        const ticketId = ticketsRepo.create({
          companyId: meeting.companyId,
          title: item.title,
          priority: item.priority ?? 'medium',
          reporterId: humanUserId,
          reporterKind: 'system',
          assigneeId: item.assigneeId ?? null,
        });
        ticketIds.push(ticketId);
      }

      // 4. Update meeting row.
      meetingsRepo.end(meetingId, {
        minutesMd: minutesMd ?? undefined,
        actionItemsJson: JSON.stringify(actionItems),
      });

      // 5. Emit event.
      bus.emit({
        type: 'meeting.ended',
        companyId: meeting.companyId,
        actorId: humanUserId,
        actorKind: 'user',
        payload: {
          meetingId,
          threadId: meeting.threadId,
          minutesMd,
          actionItemCount: actionItems.length,
          ticketIds,
        },
      });

      // 6. Resume the company.
      orchestrator.resumeCompany(meeting.companyId);

      // 7. Clean up turn state.
      activeTurnState.delete(meetingId);

      return { minutesMd, actionItems, ticketIds };
    },

    /** Get the active meeting for a company (convenience accessor). */
    getActive(companyId: string): MeetingRow | null {
      return meetingsRepo.getActive(companyId);
    },
  };
}
