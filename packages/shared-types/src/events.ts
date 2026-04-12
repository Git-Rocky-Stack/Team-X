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
  | 'meeting.ended';

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
