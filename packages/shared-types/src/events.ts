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
  | 'agentic.failed';

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

export type AgentStepKind = 'plan' | 'tool_call' | 'tool_result' | 'answer' | 'error';

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
   *   - error:       `{ reason: string; message: string }`
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
