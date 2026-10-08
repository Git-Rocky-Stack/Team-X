/**
 * Meeting service — lifecycle management for the meeting primitive.
 *
 * Composes the orchestrator (pause/drain/resume), event bus, and repos
 * to implement the full meeting flow:
 *
 *   1. callMeeting — pause the company, create meeting+thread, chair speaks first.
 *   2. nextTurn — dispatch the next attendee's turn (round-robin).
 *   3. interject — the operator sends a mid-meeting message, then triggers the
 *      next scheduled speaker.
 *   4. endMeeting — ask the chair's model for a summary + action items
 *      (see `meeting-minutes.ts`), create tickets for the items, resume the
 *      company. Without a usable model the minutes are the transcript.
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
import { LOCAL_OWNER_OPERATOR_ID } from '../services/operator-access-service.js';

import type { EventBus } from './event-bus.js';
import { type MeetingMinutesModelDeps, generateMeetingMinutes } from './meeting-minutes.js';

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

/**
 * Meetings whose end is in progress. `endMeeting` awaits the chair's minutes
 * call (up to 60 s) before the row is marked ended; the claim stops a second
 * end, or an interjection, from slipping into that window.
 */
const endingMeetings = new Set<string>();

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
  /**
   * Actor id of the human operator (interjections, thread membership, filed
   * tickets). Defaults to the local owner id the rest of the app uses.
   */
  humanUserId?: string;
  /**
   * Model access for end-of-meeting minutes (chair summary + action-item
   * extraction). Omitted → minutes are the plain transcript and no
   * action-item tickets are created.
   */
  minutes?: MeetingMinutesModelDeps;
  logger?: { warn: (msg: string, err?: unknown) => void };
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
    humanUserId = LOCAL_OWNER_OPERATOR_ID,
    minutes,
    logger = {
      warn: (msg: string, err?: unknown) => console.warn('[meeting-service]', msg, err),
    },
  } = opts;

  /**
   * Run the chair-model minutes call; null (after one log line) on any
   * failure so `endMeeting` falls back to the transcript-only minutes.
   */
  async function generateMinutesOrNull(
    meeting: MeetingRow,
    attendeeIds: string[],
    transcript: string,
  ): Promise<{ summary: string; actionItems: MeetingActionItem[] } | null> {
    if (!minutes) return null;
    try {
      const chair = employeesRepo.getById(meeting.chairId);
      if (!chair) throw new Error(`chair employee not found: ${meeting.chairId}`);
      const attendees = attendeeIds
        .map((id) => employeesRepo.getById(id))
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map((e) => ({ id: e.id, name: e.name, title: e.title }));
      return await generateMeetingMinutes(minutes, {
        companyId: meeting.companyId,
        threadId: meeting.threadId,
        chair,
        agenda: meeting.agenda,
        attendees,
        transcript,
      });
    } catch (err) {
      logger.warn(
        `minutes for meeting ${meeting.id} fell back to the transcript — chair model unavailable or reply invalid`,
        err,
      );
      return null;
    }
  }

  /** Markdown checklist line per action item, naming the assignee when known. */
  function formatActionItems(items: readonly MeetingActionItem[]): string {
    if (items.length === 0) return 'None recorded.';
    return items
      .map((item) => {
        const owner = item.assigneeId ? employeesRepo.getById(item.assigneeId)?.name : undefined;
        const meta = [owner, item.priority].filter(Boolean).join(', ');
        return `- [ ] ${item.title}${meta ? ` (${meta})` : ''}`;
      })
      .join('\n');
  }

  return {
    /**
     * Start a meeting:
     *   1. Pause the company (drain in-flight work).
     *   2. Create a meeting thread (kind='meeting').
     *   3. Add all attendees + the operator as thread members.
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
     * The operator interjects mid-meeting. Posts the message, emits an event,
     * then optionally triggers the next turn.
     */
    interject(meetingId: string, content: string): InterjectResult {
      const meeting = meetingsRepo.getById(meetingId);
      if (!meeting || meeting.status !== 'active') {
        throw new Error(`meeting-service: meeting not active: ${meetingId}`);
      }
      if (endingMeetings.has(meetingId)) {
        throw new Error(`meeting-service: meeting is ending: ${meetingId}`);
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
     *   1. Build the transcript of all non-system messages.
     *   2. Ask the chair's model for a summary + action items. Any failure
     *      falls back to transcript-only minutes — never fails the end.
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
      if (meeting.status !== 'active' || endingMeetings.has(meetingId)) {
        throw new Error(`meeting-service: meeting already ended: ${meetingId}`);
      }
      endingMeetings.add(meetingId);
      try {
        // 1. Transcript of all non-system messages — the minutes' Discussion
        // section and the input to the chair's summary.
        const messages = (messagesRepo as unknown as OrchestratorMessagesRepo).listByThread(
          meeting.threadId,
        );
        const transcript = messages
          .filter((m) => m.authorKind !== 'system')
          .map((m) => {
            const emp = employeesRepo.getById(m.authorId);
            // The human operator reads the minutes, so they are "You" (no
            // user-editable operator display name exists to use instead).
            const speaker = emp ? emp.name : m.authorKind === 'user' ? 'You' : m.authorId;
            return `**${speaker}:** ${m.content}`;
          })
          .join('\n\n');

        // 2. Chair summary + action items. Skipped for an empty meeting
        // (nothing to summarize) or when no model deps are wired.
        const attendeeIds = parseAttendeeIds(meeting.attendeesJson);
        const generated =
          transcript.length > 0 && minutes
            ? await generateMinutesOrNull(meeting, attendeeIds, transcript)
            : null;
        const actionItems: MeetingActionItem[] = generated?.actionItems ?? [];

        const header = `# Meeting Minutes\n\n**Agenda:** ${meeting.agenda || '(none)'}`;
        const discussion = `## Discussion\n\n${transcript}`;
        const minutesMd =
          transcript.length === 0
            ? null
            : generated
              ? [
                  header,
                  `## Summary\n\n${generated.summary}`,
                  `## Action Items\n\n${formatActionItems(actionItems)}`,
                  discussion,
                ].join('\n\n')
              : `${header}\n\n${discussion}`;

        // 3. Create tickets for any action items. One bad row must not fail
        // the meeting end (the company is still paused until step 6), so each
        // insert is isolated and a failure is logged and skipped.
        const ticketIds: string[] = [];
        for (const item of actionItems) {
          try {
            const ticketId = ticketsRepo.create({
              companyId: meeting.companyId,
              title: item.title,
              description: `Action item from the meeting "${meeting.agenda || 'Meeting'}".`,
              priority: item.priority ?? 'medium',
              reporterId: humanUserId,
              reporterKind: 'system',
              assigneeId: item.assigneeId ?? null,
            });
            ticketIds.push(ticketId);
          } catch (err) {
            logger.warn(`could not create a ticket for action item "${item.title}"`, err);
          }
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
      } finally {
        endingMeetings.delete(meetingId);
      }
    },

    /** Get the active meeting for a company (convenience accessor). */
    getActive(companyId: string): MeetingRow | null {
      return meetingsRepo.getActive(companyId);
    },
  };
}

/** Attendee ids from the meeting row; a malformed column yields no attendees. */
function parseAttendeeIds(attendeesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(attendeesJson);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
