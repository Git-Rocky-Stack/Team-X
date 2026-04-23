import type { ActorKind } from './entities.js';

export type EventType =
  | 'work.queued'
  | 'work.started'
  | 'token.delta'
  | 'message.persisted'
  | 'message.agent_to_agent'
  | 'work.completed'
  | 'work.failed'
  | 'employee.status_changed'
  | 'tool.called'
  | 'tool.result'
  | 'meeting.started'
  | 'meeting.turn'
  | 'meeting.interjection'
  | 'meeting.ended'
  | 'vault.file_created'
  | 'vault.file_deleted'
  | 'command.executed'
  | 'agent.step'
  | 'agentic.completed'
  | 'agentic.failed'
  | 'plan.proposed'
  | 'plan.approved'
  | 'task.delegated'
  | 'task.escalated'
  | 'review.requested'
  | 'review.completed'
  | 'copilot.insight'
  | 'copilot.analyzed'
  | 'copilot.expired'
  | 'copilot.dismissed'
  | 'copilot.weights.changed'
  | 'company.archived'
  | 'company.created'
  | 'company.updated'
  | 'company.deleted'
  | 'employee.promoted'
  | 'employee.managerSet'
  | 'employee.hired'
  | 'employee.fired'
  | 'routine.created'
  | 'routine.updated'
  | 'routine.deleted'
  | 'routine.runStarted'
  | 'routine.runCompleted'
  | 'routine.runFailed'
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.assigned'
  | 'ticket.closed'
  | 'ticket.reopened'
  | 'ticket.commentAdded'
  | 'ticket.attachmentAdded'
  | 'ticket.attachmentRemoved'
  | 'mcp.added'
  | 'mcp.removed'
  | 'mcp.toggled'
  | 'extension.installed'
  | 'skill.assignmentUpdated'
  | 'authority.grant.created'
  | 'authority.grant.deleted'
  | 'authority.request.reviewed'
  | 'authority.violation'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'project.ticketLinked'
  | 'project.ticketUnlinked'
  | 'goal.created'
  | 'goal.updated'
  | 'goal.deleted';

export interface DashboardEvent<T = unknown> {
  id: string;
  type: EventType;
  companyId: string;
  actorId: string;
  actorKind: ActorKind;
  payload: T;
  createdAt: number;
}

export interface TokenDeltaPayload {
  threadId: string;
  messageId: string;
  delta: string;
}

export interface WorkStartedPayload {
  threadId: string;
  employeeId: string;
  provider: string;
  model: string;
}

export interface WorkCompletedPayload {
  threadId: string;
  messageId: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: number;
}

export interface ToolCalledPayload {
  threadId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
}

export interface ToolResultPayload {
  threadId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  success: boolean;
}

export interface AgentMessagePayload {
  fromEmployeeId: string;
  toEmployeeId: string;
  threadId: string;
  messageId: string;
}

// ---------------------------------------------------------------------------
// Meeting event payloads (Phase 3 — M16)
// ---------------------------------------------------------------------------

export interface MeetingStartedPayload {
  meetingId: string;
  threadId: string;
  chairId: string;
  attendees: string[];
  agenda: string;
}

export interface MeetingTurnPayload {
  meetingId: string;
  threadId: string;
  employeeId: string;
  messageId: string;
}

export interface MeetingInterjectionPayload {
  meetingId: string;
  threadId: string;
  messageId: string;
}

export interface MeetingEndedPayload {
  meetingId: string;
  threadId: string;
  minutesMd: string | null;
  actionItemCount: number;
  ticketIds: string[];
}

// ---------------------------------------------------------------------------
// Vault event payloads (Phase 5 — M30 T0)
//
// Emitted by the vault service after the DB row is durably persisted.
// Purpose: align vault with architectural invariant #6 (events table is
// source of truth for realtime dashboard) and drive renderer React Query
// cache invalidation without per-mutation `onSuccess` coupling. See
// `docs/plans/2026-04-13-vault-backup-regression-findings.md` for the
// full root-cause analysis.
// ---------------------------------------------------------------------------

export interface VaultFileCreatedPayload {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface VaultFileDeletedPayload {
  fileId: string;
}

// ---------------------------------------------------------------------------
// Command event payload (Phase 5 — M30 T4)
//
// Emitted by `CommandService.execute()` after a dispatched natural-
// language command completes — both on success and on failure so the
// append-only audit trail (architectural invariant #6) captures every
// palette invocation, not just the green path.
//
// `outcome` carries the success/failure signal. On `error`, `resultId`
// is absent and the CommandService additionally logs the error code to
// the console; the raw error message itself never enters the event bus
// (PII hygiene — user-entered text stays in `rawText` but handler-side
// error strings may leak row shapes or internal state).
//
// `durationMs` is wall-clock time from `execute()` entry to dispatcher
// return, including `confirmed`-gate checks and history persistence.
// Used by the Telemetry view to surface palette latency p50/p95.
// ---------------------------------------------------------------------------

export interface CommandExecutedPayload {
  companyId: string;
  actorId: string;
  /** Matches `IntentName` from `@team-x/intelligence` — kept loose here to avoid a cross-package dep. */
  intent: string;
  entities: Record<string, string>;
  rawText: string;
  outcome: 'ok' | 'error';
  resultId?: string | number;
  durationMs: number;
  /**
   * Agentic-loop run id — populated only for the `complex_request`
   * intent (M31 T4). Correlates the audit event with the `runs` row
   * the `AgenticLoopService` opened for this invocation, so the Audit
   * view can deep-link from a palette command to the full step log
   * in the Copilot thread.
   */
  runId?: string;
  /**
   * System-agent DM thread id — populated only for the
   * `complex_request` intent (M31 T4). Pairs with `runId` so the
   * renderer can jump straight to the conversation view when a user
   * reopens a historical command-palette entry.
   */
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Agentic loop event payloads (Phase 5 — M31 T3)
//
// Emitted by `AgenticLoopService` when the ReAct loop runs for a
// `complex_request`. `agent.step` fires on every step (plan, tool_call,
// tool_result, answer, error) so the palette + thread view can stream
// reasoning live. `agentic.completed` and `agentic.failed` are the
// terminal markers — exactly one of the two fires per run.
//
// Payload `kind` mirrors `LoopStep['kind']` from `@team-x/intelligence`;
// it is re-typed here as a narrow union to avoid the cross-package
// dependency (same discipline applied to `CommandExecutedPayload.intent`).
//
// `data` is the step-shape-specific body projected to a JSON-safe shape
// so the renderer can round-trip through IPC without reconstructing
// `LoopStep` classes. Callers emit the projected body; consumers read
// it directly without instanceof checks.
// ---------------------------------------------------------------------------

export type AgentStepKind =
  | 'plan'
  | 'tool_call'
  | 'tool_result'
  | 'answer'
  | 'error'
  | 'ticket_created'
  | 'delegation_made'
  | 'review_pending';

export interface AgentStepPayload {
  /** `runs.id` for this agentic invocation — correlates to a row in the runs table. */
  runId: string;
  /** System-agent DM thread this run belongs to. */
  threadId: string;
  /** Sequential step index within the run, starting at 0. */
  stepIndex: number;
  /** Discriminated body kind — matches `LoopStep['kind']`. */
  kind: AgentStepKind;
  /**
   * Step-shape-specific payload. JSON-safe so the renderer can round-trip
   * through the IPC bridge. Shape per kind:
   *   - plan:        `{ text: string }`
   *   - tool_call:   `{ toolCallId: string; toolName: string; args: Record<string, unknown> }`
   *   - tool_result: `{ toolCallId: string; toolName: string; result: unknown }`
   *   - answer:      `{ text: string }`
   *   - error:           `{ reason: string; message: string }`
   *   - ticket_created:  `{ ticketId: string; title: string; assigneeId: string; planId: string }`
   *   - delegation_made: `{ ticketId: string; assigneeId: string; assigneeName: string; planId: string }`
   *   - review_pending:  `{ ticketId: string; reviewerId: string; outcome: string; planId: string | null }`
   */
  data: unknown;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  provider: string;
  model: string;
}

export interface AgenticCompletedPayload {
  runId: string;
  threadId: string;
  answer: string;
  totalSteps: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
}

/**
 * `reason` matches `LoopErrorReason` from `@team-x/intelligence`. Kept as
 * a string here to avoid the cross-package dep; callers copy the value
 * through without widening.
 */
export interface AgenticFailedPayload {
  runId: string;
  threadId: string;
  reason: string;
  message: string;
  totalSteps: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Write-side Task Planner event payloads (Phase 5 — M32 T4)
//
// Emitted by the three write-side agentic tools (decompose_project,
// delegate_subtask, review_deliverable) through the WriteSideEventBus
// interface defined in agentic-tools-write.ts. Each payload is JSON-safe
// with discriminator field `type` for DashboardEvent<T> narrowing.
// ---------------------------------------------------------------------------

export interface PlanProposedPayload {
  planId: string;
  projectId: string;
  goalId?: string;
  subtaskCount: number;
  truncated: boolean;
  subtasks: Array<{
    title: string;
    assigneeId: string;
    assigneeName: string;
    complexity: string;
    dependsOn: string[];
  }>;
}

export interface PlanApprovedPayload {
  planId: string;
  projectId: string;
  approvedBy: string;
  ticketIds: string[];
}

export interface TaskDelegatedPayload {
  ticketId: string;
  planId: string;
  assigneeId: string;
  assigneeName: string;
  parentProjectId: string | null;
  fallbackUsed: boolean;
  attemptCount: number;
}

export interface TaskEscalatedPayload {
  planId: string;
  originalAssigneeId?: string;
  ticketId?: string;
  escalatedTo: string;
  reason: string;
}

export interface ReviewRequestedPayload {
  ticketId: string;
  reviewerId: string;
  planId: string | null;
}

export interface ReviewCompletedPayload {
  ticketId: string;
  reviewerId: string;
  outcome: string;
  summary: string;
  planId: string | null;
  escalated: boolean;
}

// ---------------------------------------------------------------------------
// Copilot event payloads (Phase 5 — M33 T4)
//
// Emitted by the `CopilotAnalyzerService` on every tick — scheduled
// (per-company interval) or event-triggered (30s-debounced on four
// signal types: meeting.ended, ticket.closed, goal.progressChanged,
// agentic.failed with reason='budget_exhausted').
//
// Discipline mirrors the M31/M32 convention:
//   - category-prefixed literals (`copilot.*`).
//   - one exported payload interface per event.
//   - JSON-safe shapes; narrow unions replicated instead of cross-package imports.
//
// Semantics:
//   - `copilot.insight` fires ONCE per newly-inserted row (dedup merges
//     are silent). The insight is already persisted when the event fires;
//     the renderer can optimistically project it into the cache.
//   - `copilot.analyzed` fires EXACTLY ONCE per tick (terminal marker,
//     success OR skipped OR malformed_output). Payload carries the full
//     counts so the renderer can surface "N new / N merged / N expired".
//   - `copilot.expired` fires ONCE per row that transitioned expired in
//     the tick's `expireStale` sweep. Per-row granularity lets the
//     renderer animate individual card removal instead of a bulk reflow.
//   - `copilot.weights.changed` fires after persisted feedback weights
//     change so analyzer/UI consumers can refresh their local snapshots.
// ---------------------------------------------------------------------------

/** Authoritative category set — kept in sync with the SQL CHECK in 0011 + repo constants. */
export type CopilotCategory = 'operational' | 'cost' | 'org' | 'workflow' | 'anomaly';

export type CopilotCategoryWeights = Record<CopilotCategory, number>;

/** Authoritative severity set — kept in sync with the SQL CHECK in 0011 + repo constants. */
export type CopilotSeverity = 'critical' | 'warning' | 'info';

/**
 * Reason a tick was fired. `scheduled` is the periodic interval; the
 * four event-triggered reasons map 1:1 to the signal types the
 * `CopilotEventTrigger` listens for. `manual` is test / IPC-forced ticks.
 * `company_paused` means the tick no-oped because orchestrator.pause was
 * active. `malformed_output` means the LLM returned unparseable JSON on
 * both the initial prompt AND the one-shot nudge retry — the cycle is
 * counted as spent but no insights were generated.
 */
export type CopilotAnalyzedReason =
  | 'scheduled'
  | 'manual'
  | 'meeting.ended'
  | 'ticket.closed'
  | 'goal.progressChanged'
  | 'agentic.budget_exhausted'
  | 'company_paused'
  | 'malformed_output';

export interface CopilotInsightPayload {
  insightId: string;
  runId: string;
  category: CopilotCategory;
  severity: CopilotSeverity;
  title: string;
  expiresAt: number;
}

export interface CopilotAnalyzedPayload {
  runId: string;
  reason: CopilotAnalyzedReason;
  /** Total drafts the LLM proposed (pre-dedup). */
  insightsProposed: number;
  /** Drafts that were newly inserted (dedup miss). */
  insightsGenerated: number;
  /** Drafts that were merged into an existing row. */
  insightsMerged: number;
  /** Rows that transitioned expired in this tick's sweep. */
  insightsExpired: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
}

export interface CopilotExpiredPayload {
  insightId: string;
  runId: string;
  category: CopilotCategory;
  title: string;
}

export interface CopilotWeightsChangedPayload {
  weights: CopilotCategoryWeights;
  changedKeys: CopilotCategory[];
  changedAt: number;
}

// ---------------------------------------------------------------------------
// Company lifecycle event payloads
//
// `company.archived` (M33 T3 follow-up F3) — emitted by `companies.archive`
// AFTER the row is flipped to `status = 'archived'`. The handler has already
// called `CopilotAnalyzerService.stop(companyId)` + `CopilotEventWindow.clear(
// companyId)` BEFORE the row update, so subscribers can treat the company as
// fully quiesced on the copilot side.
//
// `company.created` (Phase 5.6 M-C step b — restores Cluster A multi-company
// CRUD per audit row 10.12) — emitted by `companies.create` AFTER the row
// inserts AND the system-employee bootstrap (`ensureSystemAgent` +
// `ensureSystemCopilot`) returns successfully. The two pseudo-employees
// always exist by the time this event fires, mirroring the seed-flow
// invariant from `seedIfEmpty`. Architectural invariant #11 — IPC channels
// that mutate state must emit a bus event so renderer caches invalidate.
// ---------------------------------------------------------------------------

export interface CompanyArchivedPayload {
  /** The archived company id. Duplicated in the top-level `companyId` for DashboardEvent routing. */
  companyId: string;
  /** Wall-clock timestamp in ms when the archive handler wrote the row. */
  archivedAt: number;
}

export interface CompanyCreatedPayload {
  /** The newly-created company id. Duplicated in the top-level `companyId` for DashboardEvent routing. */
  companyId: string;
  /** The slug the user supplied (unique per app; enforces no-collision invariant at SQL layer). */
  slug: string;
  /** The display name the user supplied. */
  name: string;
  /** The `system-agent` pseudo-employee row id seeded by the bootstrap (M31). Always non-null on success. */
  systemAgentEmployeeId: string;
  /** The `system-copilot` pseudo-employee row id seeded by the bootstrap (M33). Always non-null on success. */
  systemCopilotEmployeeId: string;
  /** Wall-clock timestamp in ms when the create handler wrote the row. */
  createdAt: number;
}

/**
 * `company.updated` — emitted by `companies.update` AFTER the row write
 * succeeds. Phase 5.6 M-C step e — restores Cluster A multi-company CRUD
 * per audit row 10.13. Carries the list of patched keys (not the values —
 * audit-view chips only need the keys to render a delta chip, and
 * omitting the values keeps the bus event small and free of sensitive
 * `settings` payload fragments).
 *
 * Architectural invariant #11 — IPC channels that mutate state must emit
 * a bus event so renderer caches invalidate.
 */
export interface CompanyUpdatedPayload {
  /** The updated company id. Duplicated in the top-level `companyId` for DashboardEvent routing. */
  companyId: string;
  /**
   * Which patch keys landed. Subset of `('name' | 'slug' | 'settings' |
   * 'icon' | 'theme')`. Empty only when the IPC was called with a
   * no-op patch — the handler still emits so the renderer's
   * optimistic-update paths can reconcile timestamp state.
   */
  patchedKeys: Array<'name' | 'slug' | 'settings' | 'icon' | 'theme'>;
  /** Wall-clock timestamp in ms when the update handler wrote the row. */
  updatedAt: number;
}

/**
 * `company.deleted` — emitted by `companies.delete` AFTER the hard-delete
 * transaction commits. Phase 5.6 M-C step e — restores Cluster A multi-
 * company CRUD per audit row 10.15. Destructive sibling of
 * `company.archived`.
 *
 * The handler quiesces the copilot pipeline (analyzer stop + event-window
 * clear) BEFORE the transactional sweep so a mid-tick analyzer cannot
 * observe rows that are about to disappear. By the time this event
 * fires, every company-scoped row across 15 tables is gone (see the
 * `companies.delete()` repo doc for the full list). Subscribers should
 * drop any cached state keyed by this companyId — the data is NOT
 * recoverable short of a backup restore.
 *
 * Architectural invariant #11 — IPC channels that mutate state must emit
 * a bus event so renderer caches invalidate.
 */
export interface CompanyDeletedPayload {
  /** The deleted company id. Duplicated in the top-level `companyId` for DashboardEvent routing. */
  companyId: string;
  /**
   * The slug the deleted company held. Captured BEFORE the row drops so
   * audit-view chips can render the identifier without a follow-up
   * read that would now miss (the row no longer exists).
   */
  slug: string;
  /** The display name the deleted company held. Same capture-before-drop rationale as `slug`. */
  name: string;
  /** Wall-clock timestamp in ms when the delete handler committed the transaction. */
  deletedAt: number;
}

export interface RoutineCreatedPayload {
  routineId: string;
  companyId: string;
  name: string;
  triggerKind: 'interval' | 'daily' | 'weekly';
  nextRunAt: number | null;
  createdAt: number;
}

export interface RoutineUpdatedPayload {
  routineId: string;
  companyId: string;
  patchedKeys: Array<'name' | 'enabled' | 'schedule' | 'workConfig'>;
  nextRunAt: number | null;
  updatedAt: number;
}

export interface RoutineDeletedPayload {
  routineId: string;
  companyId: string;
  name: string;
  deletedAt: number;
}

export interface RoutineRunStartedPayload {
  routineId: string;
  companyId: string;
  runId: string;
  reason: 'scheduled' | 'manual';
  scheduledFor: number | null;
  startedAt: number;
}

export interface RoutineRunCompletedPayload {
  routineId: string;
  companyId: string;
  runId: string;
  reason: 'scheduled' | 'manual';
  ticketId: string | null;
  finishedAt: number;
  nextRunAt: number | null;
}

export interface RoutineRunFailedPayload {
  routineId: string;
  companyId: string;
  runId: string;
  reason: 'scheduled' | 'manual';
  errorMessage: string;
  finishedAt: number;
  nextRunAt: number | null;
}

// ---------------------------------------------------------------------------
// Employee lifecycle event payloads (Phase 5.6 M-C step d — restores Cluster B
// per audit rows 2.19 + 2.20)
//
// `employee.promoted` (audit row 2.19) — emitted by `employees.promote` AFTER
// the row's roleId / level / title / roleMdSha / tools_*_json columns are
// updated in place. Carries both the `previousRoleId` / `previousLevel`
// snapshot AND the post-promote `newRoleId` / `newLevel` so audit-view chips
// can render the full delta without a follow-up `employees.list` round-trip.
//
// `employee.managerSet` (audit row 2.20) — emitted by `employees.setManager`
// AFTER the org-edge upsert (or removal, when `managerId === null`). The
// `previousManagerId` is included so the renderer can animate the move on
// the indented org-tree view; `null` on either field means the report was
// previously / is now a graph root (no manager edge).
//
// Both payloads satisfy architectural invariant #11 — IPC channels that
// mutate state must emit a bus event so renderer caches invalidate.
// ---------------------------------------------------------------------------

export interface EmployeePromotedPayload {
  /** The promoted employee id. */
  employeeId: string;
  /** The role id the employee held BEFORE the promote. */
  previousRoleId: string;
  /** The role id the employee holds NOW. */
  newRoleId: string;
  /** The level the employee held BEFORE the promote (e.g., 'lead'). */
  previousLevel: string;
  /** The level the employee holds NOW (e.g., 'management'). */
  newLevel: string;
  /** The role title the employee held BEFORE the promote. */
  previousTitle: string;
  /** The role title the employee holds NOW (matches the new role-pack `name` frontmatter). */
  newTitle: string;
  /** Wall-clock timestamp in ms when the promote handler wrote the row. */
  promotedAt: number;
}

export interface EmployeeManagerSetPayload {
  /** The report — the employee whose manager edge was set or cleared. */
  employeeId: string;
  /** Companion company-scope id (matches the `companyId` on the DashboardEvent envelope). */
  companyId: string;
  /** The new manager id, or null if the report was detached (made a graph root). */
  managerId: string | null;
  /** The previous manager id, or null if the report was previously a graph root. */
  previousManagerId: string | null;
  /** Wall-clock timestamp in ms when the setManager handler wrote the row. */
  setAt: number;
}

// ---------------------------------------------------------------------------
// Employee hire/fire event payloads (Phase 5.6 M-C FOLLOWUP-P1-extended —
// closes BUG-009 + BUG-010 surfaced by docs/qa/2026-04-18-autonomous-run-
// report.md §4.1 / §4.2)
//
// `employee.hired` — emitted by `employees.create` AFTER the durable repo
// write returns the new employeeId. Carries the resolved role frontmatter
// (level + title from the role-pack spec) so renderer caches can project
// the hire into the org chart without a follow-up read.
//
// `employee.fired` — emitted by `employees.fire` AFTER the durable repo
// delete. Carries a snapshot of `roleId` / `level` / `name` / `title` that
// was captured BEFORE the delete (same capture-before-drop rationale as
// `company.deleted` / `goal.deleted` / `project.deleted`), so audit-view
// chips + renderer optimistic removals have the identifier after the row
// is gone.
//
// Architectural invariant #11 — IPC channels that mutate state must emit
// a bus event so renderer caches invalidate.
// ---------------------------------------------------------------------------

export interface EmployeeHiredPayload {
  /** The newly-hired employee id. */
  employeeId: string;
  /** Companion company-scope id (matches the `companyId` on the DashboardEvent envelope). */
  companyId: string;
  /** The role-pack role id the hire resolved against (matches the spec frontmatter `id`). */
  roleId: string;
  /** The role level the hire resolved to (e.g., 'management', 'lead'). Never 'system' — the handler refuses framework-internal roles. */
  level: string;
  /** The employee's display name (trimmed at the IPC boundary before the write). */
  name: string;
  /** The role title as stored on the row (matches the role-pack spec `name` frontmatter). */
  title: string;
  /** Wall-clock timestamp in ms when the create handler wrote the row. */
  hiredAt: number;
}

export interface EmployeeFiredPayload {
  /** The fired employee id. */
  employeeId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * The role id the fired row held. Captured BEFORE the delete so audit-
   * view chips can render the identifier without a follow-up read (the
   * row no longer exists after this event fires).
   */
  roleId: string;
  /** The role level the fired row held. Same capture-before-drop rationale as `roleId`. */
  level: string;
  /** The display name the fired row held. Same capture-before-drop rationale. */
  name: string;
  /** The role title the fired row held. Same capture-before-drop rationale. */
  title: string;
  /** Wall-clock timestamp in ms when the fire handler committed the delete. */
  firedAt: number;
}

// ---------------------------------------------------------------------------
// Ticket lifecycle event payloads (Phase 5.6 M-C step f — main-side
// Invariant #11 completeness hardening)
//
// Closes the FOLLOWUP-P1 gap surfaced by `docs/qa/2026-04-18-ground-zero-
// audit.md` §3.1. The renderer-side hooks (`useTicketEventSync` from commit
// 30b1520) were wired awaiting these emits; now the main side matches.
//
// Six events, one per state-mutating ticket IPC channel (`tickets.create`,
// `tickets.update`, `tickets.assign`, `tickets.close`, `tickets.reopen`,
// `tickets.addComment`). All payloads carry `companyId` on the DashboardEvent
// envelope; snapshot fields (`title`, `previousAssigneeId`) are captured
// AFTER the durable write but BEFORE the bus emit so any repo error
// aborts the IPC call before any event fan-out.
//
// Architectural invariant #11 — IPC channels that mutate state must emit
// a bus event so renderer caches invalidate.
// ---------------------------------------------------------------------------

export interface TicketCreatedPayload {
  /** The newly-created ticket id. */
  ticketId: string;
  /** Companion company-scope id (matches the `companyId` on the DashboardEvent envelope). */
  companyId: string;
  /** The ticket title as stored on the row. */
  title: string;
  /**
   * The assignee employee id if the create included an immediate assign,
   * else null. A subsequent `tickets.assign` call (with its own
   * `ticket.assigned` emit) covers the late-bind flow.
   */
  assigneeId: string | null;
  /** Wall-clock timestamp in ms when the create handler wrote the row. */
  createdAt: number;
}

export interface TicketUpdatedPayload {
  /** The updated ticket id. */
  ticketId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * Which patch keys landed. Subset of the mutable ticket column set.
   * Empty only when the IPC was called with a no-op patch — the handler
   * still emits so optimistic-update renderer paths can reconcile
   * timestamp state. Mirrors the `companies.update` convention.
   */
  patchedKeys: Array<'title' | 'description' | 'status' | 'priority' | 'assigneeId'>;
  /** Wall-clock timestamp in ms when the update handler wrote the row. */
  updatedAt: number;
}

export interface TicketAssignedPayload {
  /** The assigned ticket id. */
  ticketId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The new assignee employee id (never null — the IPC rejects null assignees). */
  assigneeId: string;
  /**
   * The previous assignee id, or null if the ticket had no prior
   * assignee. Captured BEFORE the repo write so the bus event carries
   * the snapshot without a second read round-trip.
   */
  previousAssigneeId: string | null;
  /** The ticket's DM thread id (created by the assign handler for agent-facing discussion). */
  threadId: string;
  /** Wall-clock timestamp in ms when the assign handler wrote the row. */
  assignedAt: number;
}

export interface TicketClosedPayload {
  /** The closed ticket id. */
  ticketId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** Wall-clock timestamp in ms when the close handler wrote the row. */
  closedAt: number;
}

export interface TicketReopenedPayload {
  /** The reopened ticket id. */
  ticketId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** Wall-clock timestamp in ms when the reopen handler wrote the row. */
  reopenedAt: number;
}

export interface TicketCommentAddedPayload {
  /** The ticket the comment was added to. */
  ticketId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The message row id for the new comment. */
  messageId: string;
  /**
   * The authoring employee id (or `HUMAN_USER_ID` for Rocky-authored
   * comments). Matches the `actorId` on the DashboardEvent envelope
   * when the comment is human-authored; diverges when an agent comment
   * is appended by the orchestrator.
   */
  authorId: string;
  /** Wall-clock timestamp in ms when the comment handler wrote the message row. */
  addedAt: number;
}

// ---------------------------------------------------------------------------
// Ticket attachment lifecycle event payloads (Phase 5.6 M-C FOLLOWUP-P1-
// extended — closes BUG-011 surfaced by docs/qa/2026-04-18-autonomous-
// run-report.md §4.3; known-deferred from step f per its nextStep note)
//
// Two events, one per state-mutating ticket-attachment IPC channel
// (`tickets.attachFile`, `tickets.detachFile`). Attachments are keyed by
// `(ticketId, fileId)` on the join table but also carry a row-level `id`
// (nanoid); emits include the `attachmentId` so renderer optimistic
// animations can target individual rows in the ticket-detail attachment
// list without reloading the full list.
//
// Both payloads thread `companyId` via a ticket fetch in the handler
// (the IPC request shapes carry only `ticketId` + `fileId`); the fetch
// also acts as a phantom-ticket-id validation guard. Matches the
// `projects.linkTicket` / `projects.unlinkTicket` pattern from step f.
//
// `ticket.attachmentRemoved` carries the `attachmentId` captured BEFORE
// the `detachByFile` drop via `listByTicket` + `fileId` match. If no
// matching row exists (no-op detach), `attachmentId` is `null` and the
// handler still emits — empty-patch-still-emits discipline mirrors
// `companies.update` / `tickets.update`.
//
// Architectural invariant #11.
// ---------------------------------------------------------------------------

export interface TicketAttachmentAddedPayload {
  /** The newly-created attachment row id (nanoid from `ticketAttachmentsRepo.attach`). */
  attachmentId: string;
  /** The ticket the file was attached to. */
  ticketId: string;
  /** Companion company-scope id — threaded via `ticketsRepo.getById(ticketId)` in the handler. */
  companyId: string;
  /** The vault file id that was attached. */
  fileId: string;
  /**
   * The employee id that performed the attach. Always `HUMAN_USER_ID`
   * on this channel today — the IPC is invoked only from the human-
   * driven ticket-detail panel. Agent-initiated attaches go through a
   * different repo path and will thread their own actor in a later
   * milestone.
   */
  attachedBy: string;
  /** Wall-clock timestamp in ms when the attach handler wrote the row. */
  attachedAt: number;
}

export interface TicketAttachmentRemovedPayload {
  /**
   * The attachment row id that was removed. Captured via `listByTicket`
   * + `fileId` match BEFORE the detach so the renderer can target the
   * removed row in its cache without a follow-up read. `null` when the
   * detach was a no-op (no matching `(ticketId, fileId)` row existed) —
   * the handler still emits so optimistic-update paths reconcile.
   */
  attachmentId: string | null;
  /** The ticket the file was detached from. */
  ticketId: string;
  /** Companion company-scope id — threaded via `ticketsRepo.getById(ticketId)` in the handler. */
  companyId: string;
  /** The vault file id that was detached. */
  fileId: string;
  /** Wall-clock timestamp in ms when the detach handler committed the drop. */
  removedAt: number;
}

// ---------------------------------------------------------------------------
// Project lifecycle event payloads (Phase 5.6 M-C step f)
//
// Five events, one per state-mutating project IPC channel (`projects.create`,
// `projects.update`, `projects.delete`, `projects.linkTicket`,
// `projects.unlinkTicket`). The delete payload captures `title` BEFORE the
// row drops so audit-view chips can surface the identifier after deletion
// (same capture-before-drop rationale as `company.deleted`).
//
// Architectural invariant #11.
// ---------------------------------------------------------------------------

export interface ProjectCreatedPayload {
  /** The newly-created project id. */
  projectId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The project title as stored on the row. */
  title: string;
  /**
   * The parent goal id, or null if the project was created standalone.
   * A subsequent `projects.update` call can bind a goal later (with its
   * own `project.updated` emit carrying `'goalId'` in `patchedKeys`).
   */
  goalId: string | null;
  /** Wall-clock timestamp in ms when the create handler wrote the row. */
  createdAt: number;
}

export interface ProjectUpdatedPayload {
  /** The updated project id. */
  projectId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * Which patch keys landed. Subset of the mutable project column set.
   * Empty-patch-still-emits mirrors the `companies.update` convention.
   */
  patchedKeys: Array<'title' | 'description' | 'status' | 'goalId' | 'leadId'>;
  /** Wall-clock timestamp in ms when the update handler wrote the row. */
  updatedAt: number;
}

export interface ProjectDeletedPayload {
  /** The deleted project id. */
  projectId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * The project title the deleted row held. Captured BEFORE the row
   * drops (same rationale as `company.deleted`) so audit-view chips can
   * render the identifier without a follow-up read.
   */
  title: string;
  /** Wall-clock timestamp in ms when the delete handler wrote the row. */
  deletedAt: number;
}

export interface ProjectTicketLinkedPayload {
  /** The project the ticket was linked to. */
  projectId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The ticket that was linked. */
  ticketId: string;
  /** Wall-clock timestamp in ms when the link handler wrote the join row. */
  linkedAt: number;
}

export interface ProjectTicketUnlinkedPayload {
  /** The project the ticket was unlinked from. */
  projectId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The ticket that was unlinked (still exists — only the join row dropped). */
  ticketId: string;
  /** Wall-clock timestamp in ms when the unlink handler wrote the delete. */
  unlinkedAt: number;
}

// ---------------------------------------------------------------------------
// Goal lifecycle event payloads (Phase 5.6 M-C step f)
//
// Three events, one per state-mutating goal IPC channel (`goals.create`,
// `goals.update`, `goals.delete`). `goal.updated` additionally includes
// the recomputed normalized progress (0..1) because goal progress is
// derived from linked projects — the renderer cache needs the fresh
// value on every mutation to keep progress bars honest.
//
// Architectural invariant #11.
// ---------------------------------------------------------------------------

export interface GoalCreatedPayload {
  /** The newly-created goal id. */
  goalId: string;
  /** Companion company-scope id. */
  companyId: string;
  /** The goal title as stored on the row. */
  title: string;
  /** Wall-clock timestamp in ms when the create handler wrote the row. */
  createdAt: number;
}

export interface GoalUpdatedPayload {
  /** The updated goal id. */
  goalId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * Which patch keys landed. Subset of the mutable goal column set.
   * `progress` included here as a discriminator — the `progress` field
   * below carries the recomputed value regardless of whether the key
   * was in the patch, because linked-project movement can shift
   * progress without a direct goal-row patch.
   */
  patchedKeys: Array<'title' | 'description' | 'targetDate' | 'status' | 'progress'>;
  /**
   * Normalized progress (0..1) RECOMPUTED post-update from the linked
   * projects. Included in the payload so renderer progress bars can
   * update without a follow-up `goals.get` round-trip. The handler
   * calls `goalsRepo.recalcProgress(goalId)` after the write.
   */
  progress: number;
  /** Wall-clock timestamp in ms when the update handler wrote the row. */
  updatedAt: number;
}

export interface GoalDeletedPayload {
  /** The deleted goal id. */
  goalId: string;
  /** Companion company-scope id. */
  companyId: string;
  /**
   * The goal title the deleted row held. Captured BEFORE the row
   * drops (same rationale as `project.deleted`).
   */
  title: string;
  /** Wall-clock timestamp in ms when the delete handler wrote the row. */
  deletedAt: number;
}

/**
 * Point-in-time projection of an agentic-loop run for renderer backfill
 * on mount (Phase 5 — M32 T0 / F1). Returned by `command.getRunSnapshot`
 * so the palette step-log can replay a run whose bus events fired before
 * the React subscription attached — the canonical root cause of users
 * seeing only the final-answer card on fast providers.
 *
 * `terminal` latches once the run reaches a final state; while the run
 * is still running it stays `null`. Consumers treat the snapshot as
 * read-only and merge it with the live bus stream by `(runId, stepIndex)`.
 */
export interface AgenticRunSnapshot {
  runId: string;
  threadId: string;
  steps: AgentStepPayload[];
  terminal:
    | { kind: 'completed'; payload: AgenticCompletedPayload }
    | { kind: 'failed'; payload: AgenticFailedPayload }
    | null;
}
