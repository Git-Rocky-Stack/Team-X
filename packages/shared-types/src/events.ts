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
  | 'company.archived'
  | 'company.created'
  | 'employee.promoted'
  | 'employee.managerSet';

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
// ---------------------------------------------------------------------------

/** Authoritative category set — kept in sync with the SQL CHECK in 0011 + repo constants. */
export type CopilotCategory = 'operational' | 'cost' | 'org' | 'workflow' | 'anomaly';

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
