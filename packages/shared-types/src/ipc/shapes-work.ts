/**
 * Request/response shapes: org chart, events, tickets, proactive execution,
 * schedule, goals and projects, meetings.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type {
  ChatMessage,
  Employee,
  Goal,
  Meeting,
  MeetingActionItem,
  MeetingMode,
  Project,
  ScheduleItemKind,
  ScheduleItemStatus,
  Ticket,
  TicketPriority,
} from '../entities.js';
import type { DashboardEvent } from '../events.js';

// ---------------------------------------------------------------------------
// Org chart shapes (Phase 2 — M9; restored Phase 5.6 M-C step c)
// ---------------------------------------------------------------------------

/**
 * Request for the full org-chart projection of a given company. The
 * handler filters out framework-internal pseudo-employees (is_system = 1)
 * so the returned `employees` array is renderer-ready and every
 * `OrgchartEdge` references employees that appear in the same payload.
 */
export interface OrgchartGetRequest {
  companyId: string;
}

/**
 * Wire shape of one `org_edges` row — the public projection that the
 * `orgchart.get` IPC response carries. `companyId` is implicit (the
 * request scoped everything to one company), so the wire type drops it
 * to keep the payload compact for rehydrating renderer tree views.
 */
export interface OrgchartEdge {
  id: string;
  managerId: string;
  reportId: string;
  createdAt: number;
}

/**
 * Full org-chart projection response. `employees` contains every
 * non-system employee in the company (same filter `employees.list` uses
 * via `listVisibleByCompany`); `edges` is every `(managerId, reportId)`
 * relationship in the company's reporting graph; `rootIds` is the
 * convenience set of employees with no manager edge (graph roots — the
 * CEO in the canonical case, but also any freshly-hired employee before
 * their reporting line is wired).
 *
 * Keeping the three as flat parallel arrays rather than pre-building a
 * nested tree lets the renderer choose its own layout (indented list,
 * tree view, Sankey, reports-to-card grid) without a follow-up IPC
 * round-trip. Tree building is an O(n) pass over `edges` keyed by
 * `managerId`.
 */
export interface OrgchartGetResponse {
  employees: Employee[];
  edges: OrgchartEdge[];
  rootIds: string[];
}

// ---------------------------------------------------------------------------
// Events / timeline shapes (Phase 3 — M14)
// ---------------------------------------------------------------------------

/**
 * Cursor-based pagination request for the timeline activity feed.
 * `cursor` is the `createdAt` timestamp of the last event in the
 * previous page — pass `undefined` for the first page. Results are
 * returned newest-first.
 */
export interface ListEventsRequest {
  companyId: string;
  /** createdAt of the last event from the previous page, or undefined for the first page. */
  cursor?: number;
  /** Maximum events to return. Defaults to 50 in the handler. */
  limit?: number;
}

/**
 * Paginated event list for the timeline view.
 * `nextCursor` is `null` when there are no more pages.
 */
export interface ListEventsResponse {
  events: DashboardEvent[];
  nextCursor: number | null;
}

// ---------------------------------------------------------------------------
// Ticket-related shapes
// ---------------------------------------------------------------------------

export interface CreateTicketRequest {
  companyId: string;
  title: string;
  description?: string;
  /** Defaults to 'medium'. Accepts TicketPriority values. */
  priority?: string;
  /** Optional: assign immediately on creation. */
  assigneeId?: string;
  labelsJson?: string;
  slaHours?: number;
  dueAt?: number;
}

export interface CreateTicketResponse {
  ticketId: string;
}

export interface UpdateTicketRequest {
  ticketId: string;
  title?: string;
  description?: string;
  /** Use TicketPriority union or raw string — the handler validates. */
  priority?: string;
  /** Use TicketStatus union or raw string — the handler validates. */
  status?: string;
  labelsJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
}

export interface AssignTicketRequest {
  ticketId: string;
  assigneeId: string;
}

export interface AddTicketParticipantRequest {
  ticketId: string;
  employeeId: string;
}

export interface RemoveTicketParticipantRequest {
  ticketId: string;
  employeeId: string;
}

export interface CloseTicketRequest {
  ticketId: string;
}

export interface ReopenTicketRequest {
  ticketId: string;
}

export interface AddTicketCommentRequest {
  ticketId: string;
  content: string;
}

export interface AddTicketCommentResponse {
  messageId: string;
}

export interface ListTicketsRequest {
  companyId: string;
}

export interface GetTicketRequest {
  ticketId: string;
}

/** Full ticket with its associated thread messages for the detail panel. */
export interface TicketDetail extends Ticket {
  messages: ChatMessage[];
  assignee: Employee | null;
  participants: Employee[];
}

// ---------------------------------------------------------------------------
// Proactive execution shapes (Phase 6 — Slice 3)
// ---------------------------------------------------------------------------

export interface ProactiveSetEnabledRequest {
  companyId: string;
  enabled: boolean;
}

export interface ProactiveDecomposeGoalRequest {
  companyId: string;
  goalId: string;
}

export interface ProactiveDecomposeGoalResponse {
  success: boolean;
}

export interface ProactiveScanForWorkRequest {
  companyId: string;
}

export interface ProactiveScanForWorkResponse {
  queuedCount: number;
}

export interface ProactiveGetStateRequest {
  companyId: string;
}

export interface ProactiveGetStateResponse {
  enabled: boolean;
  activeWork: number;
  queuedWork: number;
  lastScanAt: number | null;
}

// ---------------------------------------------------------------------------
// Schedule / Calendar shapes
// ---------------------------------------------------------------------------

export interface ListScheduleItemsRequest {
  companyId: string;
  from?: number;
  to?: number;
  includeDerived?: boolean;
}

export interface CreateScheduleItemRequest {
  companyId: string;
  title: string;
  description?: string;
  kind?: ScheduleItemKind;
  priority?: TicketPriority;
  startsAt: number;
  endsAt?: number | null;
  reminderAt?: number | null;
  ticketId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  assigneeId?: string | null;
}

export interface CreateScheduleItemResponse {
  scheduleItemId: string;
  wakeupRequestId: string | null;
}

export interface UpdateScheduleItemRequest {
  scheduleItemId: string;
  title?: string;
  description?: string;
  kind?: ScheduleItemKind;
  status?: ScheduleItemStatus;
  priority?: TicketPriority;
  startsAt?: number;
  endsAt?: number | null;
  reminderAt?: number | null;
  ticketId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  assigneeId?: string | null;
}

export interface CompleteScheduleItemRequest {
  scheduleItemId: string;
}

export interface DeleteScheduleItemRequest {
  scheduleItemId: string;
}

// ---------------------------------------------------------------------------
// Goals & Projects shapes (Phase 3 — M15)
// ---------------------------------------------------------------------------

export interface CreateGoalRequest {
  companyId: string;
  title: string;
  description?: string;
  targetDate?: number | null;
}

export interface CreateGoalResponse {
  goalId: string;
}

export interface UpdateGoalRequest {
  goalId: string;
  title?: string;
  description?: string;
  status?: string;
  progressPct?: number;
  targetDate?: number | null;
}

export interface ListGoalsRequest {
  companyId: string;
}

export interface GetGoalRequest {
  goalId: string;
}

export interface DeleteGoalRequest {
  goalId: string;
}

/** Full goal with its linked projects for the detail view. */
export interface GoalDetail extends Goal {
  projects: Project[];
}

export interface CreateProjectRequest {
  companyId: string;
  goalId?: string | null;
  title: string;
  description?: string;
  leadId?: string | null;
  priority?: string;
  targetDate?: number | null;
}

export interface CreateProjectResponse {
  projectId: string;
}

export interface UpdateProjectRequest {
  projectId: string;
  title?: string;
  description?: string;
  status?: string;
  goalId?: string | null;
  leadId?: string | null;
  priority?: string;
  targetDate?: number | null;
}

export interface ListProjectsRequest {
  companyId: string;
}

export interface GetProjectRequest {
  projectId: string;
}

export interface DeleteProjectRequest {
  projectId: string;
}

export interface LinkTicketToProjectRequest {
  projectId: string;
  ticketId: string;
}

export interface UnlinkTicketFromProjectRequest {
  projectId: string;
  ticketId: string;
}

/** Full project with linked ticket ids and lead employee for the detail view. */
export interface ProjectDetail extends Project {
  ticketIds: string[];
  lead: Employee | null;
  ticketCounts: { total: number; done: number };
}

// ---------------------------------------------------------------------------
// Meeting shapes (Phase 3 — M16)
// ---------------------------------------------------------------------------

export interface CallMeetingRequest {
  companyId: string;
  /** Employee id of the meeting chair. */
  chairId: string;
  /** Employee ids of all attendees (including the chair). */
  attendeeIds: string[];
  agenda: string;
  /** Defaults to 'round-robin'. */
  mode?: MeetingMode;
}

export interface CallMeetingResponse {
  meetingId: string;
  threadId: string;
}

export interface EndMeetingRequest {
  meetingId: string;
}

export interface EndMeetingResponse {
  minutesMd: string | null;
  actionItems: MeetingActionItem[];
  ticketIds: string[];
}

export interface InterjectMeetingRequest {
  meetingId: string;
  content: string;
}

export interface InterjectMeetingResponse {
  messageId: string;
}

export interface ListMeetingsRequest {
  companyId: string;
}

export interface GetMeetingRequest {
  meetingId: string;
}

/** Full meeting detail with its thread messages for the detail panel. */
export interface MeetingDetail extends Meeting {
  messages: ChatMessage[];
  chair: Employee | null;
}
