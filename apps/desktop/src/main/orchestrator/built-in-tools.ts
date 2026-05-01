/**
 * Built-in orchestrator tools — tools injected into every agent's
 * tool set alongside MCP tools. These are NOT subject to
 * tools_allowed/tools_denied (which filter MCP tools only).
 *
 * M11 ships two built-ins:
 *
 *   1. `send_message_to_colleague` — lets an agent message another
 *      employee. The orchestrator handles thread resolution, message
 *      persistence, event emission, and recipient work-item enqueueing.
 *
 *   2. `list_colleagues` — lets an agent discover who else works in
 *      the same company (id, name, title, level) so it can decide
 *      whom to message.
 *
 * Built-in tools use the same `ToolSpec` shape from provider-router
 * so they merge seamlessly with MCP-derived specs inside
 * `buildProviderTools`. The orchestrator wiring (T4) concatenates
 * both arrays before passing them to `buildProviderTools`.
 */

import type { ToolSpec } from '@team-x/provider-router';
import type { AgentMessagePayload } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';
import type { AppendMessageInput } from '../db/repos/messages.js';
import type { GetOrCreateEmployeeDmThreadInput } from '../db/repos/threads.js';

import type { EventBus } from './event-bus.js';
import type { ExecutionToolDeps } from './execution-tools.js';
import { buildExecutionTools } from './execution-tools.js';

// ---------------------------------------------------------------------------
// Dependency interfaces — narrowed to exactly what the tools need
// ---------------------------------------------------------------------------

export interface BuiltInToolEmployeesRepo {
  getById(id: string): EmployeeRow | null;
  listByCompany(companyId: string): EmployeeRow[];
}

export interface BuiltInToolMessagesRepo {
  append(input: AppendMessageInput): string;
}

export interface BuiltInToolThreadsRepo {
  getOrCreateEmployeeDmThread(input: GetOrCreateEmployeeDmThreadInput): string;
  updateLastMessageAt(threadId: string, timestamp: number): void;
}

/**
 * Callback the send_message tool invokes to enqueue a work item for
 * the recipient employee. Wired to the orchestrator's internal
 * `enqueueAgentReply` in T4.
 */
export type EnqueueAgentReplyFn = (args: {
  threadId: string;
  employeeId: string;
  triggerMessageId: string;
}) => Promise<void>;

export type DelegatedMessagePriority = 'low' | 'medium' | 'high' | 'critical';

export interface ColleagueAssignmentIntent {
  shouldCreateTicket: boolean;
  ticketTitle: string;
  priority: DelegatedMessagePriority;
  labels: string[];
}

export interface MaterializeColleagueAssignmentInput {
  companyId: string;
  senderEmployeeId: string;
  recipientEmployeeId: string;
  dmThreadId: string;
  dmMessageId: string;
  message: string;
  subject?: string;
  ticketTitle: string;
  priority: DelegatedMessagePriority;
  labels: string[];
}

export interface MaterializedColleagueAssignment {
  ticketId: string;
  ticketThreadId: string;
  triggerMessageId: string;
}

export type MaterializeColleagueAssignmentFn = (
  input: MaterializeColleagueAssignmentInput,
) => Promise<MaterializedColleagueAssignment | null>;

export interface BuiltInToolDeps {
  bus: EventBus;
  employees: BuiltInToolEmployeesRepo;
  messages: BuiltInToolMessagesRepo;
  threads: BuiltInToolThreadsRepo;
  enqueueAgentReply: EnqueueAgentReplyFn;
  materializeColleagueAssignment?: MaterializeColleagueAssignmentFn;
  /** Execution-tool deps — optional so tests that only need messaging tools stay minimal. */
  execution?: ExecutionToolDeps;
}

// ---------------------------------------------------------------------------
// Tool builders
// ---------------------------------------------------------------------------

interface SendMessageArgs {
  recipientEmployeeId: string;
  message: string;
  subject?: string;
}

const ASSIGNMENT_PATTERNS = [
  /\bassign(?:ing|ed)?\s+you\b/i,
  /\bdelegat(?:e|ing|ed)\b/i,
  /\byour\s+immediate\s+task\b/i,
  /\bi\s+need\s+(?:you\s+to|a|an|the)\b/i,
  /\bplease\s+(?:audit|review|build|fix|ship|implement|investigate|determine|ensure|prepare|report)\b/i,
  /\breport\s+back\b/i,
  /\bcritical\s+project\b/i,
  /\bblocker(?:s)?\b/i,
  /\basap\b/i,
] as const;

const CRITICAL_PATTERNS = [
  /\bcritical\b/i,
  /\basap\b/i,
  /\bimmediate(?:ly)?\b/i,
  /\burgent(?:ly)?\b/i,
  /\bnow\b/i,
  /\btoday\b/i,
] as const;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimTitle(value: string): string {
  const collapsed = collapseWhitespace(value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+$/g, '');
  if (collapsed.length <= 160) return collapsed;
  return `${collapsed.slice(0, 157).trimEnd()}...`;
}

function sentenceFromPattern(message: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const candidate = match?.[1];
    if (candidate && collapseWhitespace(candidate).length > 0) {
      return candidate;
    }
  }
  return null;
}

function deriveDelegatedTicketTitle(message: string, subject?: string): string {
  if (subject && subject.trim().length > 0) return trimTitle(subject);

  const directTask = sentenceFromPattern(message, [
    /\byour\s+immediate\s+task\s+is\s+to\s+([^.!?\n]+)/i,
    /\bi\s+need\s+you\s+to\s+([^.!?\n]+)/i,
    /\bplease\s+([^.!?\n]+)/i,
    /\btask\s*:\s*([^.!?\n]+)/i,
  ]);
  if (directTask) return trimTitle(directTask);

  const project = sentenceFromPattern(message, [
    /\bassign(?:ing|ed)?\s+you\s+to\s+(?:the\s+)?(?:critical\s+)?project\s*:?\s*["'“”]?([^"'“”\n.]+)/i,
  ]);
  if (project) return trimTitle(project);

  const firstSentence = message.split(/[.!?\n]/).find((part) => part.trim().length > 0);
  return trimTitle(firstSentence ?? 'Delegated team work');
}

export function classifyColleagueAssignment(
  message: string,
  subject?: string,
): ColleagueAssignmentIntent {
  const normalizedMessage = collapseWhitespace(message);
  const shouldCreateTicket = ASSIGNMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const priority: DelegatedMessagePriority = CRITICAL_PATTERNS.some((pattern) =>
    pattern.test(normalizedMessage),
  )
    ? 'critical'
    : 'high';

  return {
    shouldCreateTicket,
    ticketTitle: deriveDelegatedTicketTitle(normalizedMessage, subject),
    priority,
    labels: shouldCreateTicket ? ['agent-delegated', 'agent-message', priority] : [],
  };
}

/**
 * Build the `send_message_to_colleague` tool spec for a given sender.
 * The `senderEmployeeId` and `companyId` are captured in the closure
 * so the agent cannot impersonate another employee.
 */
export function buildSendMessageTool(
  deps: BuiltInToolDeps,
  senderEmployeeId: string,
  companyId: string,
): ToolSpec {
  return {
    name: 'send_message_to_colleague',
    description:
      'Send a message to another employee in your company. Use this when you need to ' +
      'collaborate, ask for input, or share information with a colleague. When the ' +
      'message assigns concrete work, urgent follow-up, blockers, or accountability, ' +
      'Team-X will create an assigned ticket and queue the recipient from that ticket context.',
    inputSchema: {
      type: 'object',
      properties: {
        recipientEmployeeId: {
          type: 'string',
          description: 'The id of the employee to message. Use list_colleagues to find ids.',
        },
        message: {
          type: 'string',
          description: 'The message content to send.',
        },
        subject: {
          type: 'string',
          description: 'Optional subject line for the conversation thread.',
        },
      },
      required: ['recipientEmployeeId', 'message'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as SendMessageArgs;

      // 1. Validate recipient exists and is in the same company.
      const recipient = deps.employees.getById(args.recipientEmployeeId);
      if (!recipient) {
        return { success: false, error: `Employee '${args.recipientEmployeeId}' not found.` };
      }
      if (recipient.companyId !== companyId) {
        return { success: false, error: 'Recipient is not in your company.' };
      }
      if (args.recipientEmployeeId === senderEmployeeId) {
        return { success: false, error: 'You cannot message yourself.' };
      }

      // 2. Resolve or create the employee↔employee DM thread.
      const threadId = deps.threads.getOrCreateEmployeeDmThread({
        companyId,
        fromEmployeeId: senderEmployeeId,
        toEmployeeId: args.recipientEmployeeId,
      });

      // 3. Append the message.
      const now = Date.now();
      const messageId = deps.messages.append({
        threadId,
        authorId: senderEmployeeId,
        authorKind: 'employee',
        content: args.message,
        isAgentInitiated: true,
      });

      // 4. Update thread's last_message_at.
      deps.threads.updateLastMessageAt(threadId, now);

      // 5. Emit the agent-to-agent event.
      const payload: AgentMessagePayload = {
        fromEmployeeId: senderEmployeeId,
        toEmployeeId: args.recipientEmployeeId,
        threadId,
        messageId,
      };
      deps.bus.emit<AgentMessagePayload>({
        type: 'message.agent_to_agent',
        companyId,
        actorId: senderEmployeeId,
        actorKind: 'employee',
        payload,
      });

      // 6. Materialize action-oriented colleague messages into durable ticket work.
      const assignmentIntent = classifyColleagueAssignment(args.message, args.subject);
      let assignment: MaterializedColleagueAssignment | null = null;
      let assignmentError: string | null = null;
      if (assignmentIntent.shouldCreateTicket && deps.materializeColleagueAssignment) {
        try {
          assignment = await deps.materializeColleagueAssignment({
            companyId,
            senderEmployeeId,
            recipientEmployeeId: args.recipientEmployeeId,
            dmThreadId: threadId,
            dmMessageId: messageId,
            message: args.message,
            subject: args.subject,
            ticketTitle: assignmentIntent.ticketTitle,
            priority: assignmentIntent.priority,
            labels: assignmentIntent.labels,
          });
        } catch (err) {
          assignmentError = err instanceof Error ? err.message : String(err);
          console.error('[built-in-tools] failed to materialize delegated message:', err);
        }
      }

      // 7. Enqueue a work item for the recipient.
      // Fire-and-forget — don't await; the sender's turn continues.
      const replyThreadId = assignment?.ticketThreadId ?? threadId;
      const replyTriggerMessageId = assignment?.triggerMessageId ?? messageId;
      deps
        .enqueueAgentReply({
          threadId: replyThreadId,
          employeeId: args.recipientEmployeeId,
          triggerMessageId: replyTriggerMessageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[built-in-tools] failed to enqueue agent reply for ${args.recipientEmployeeId}:`,
            err,
          );
        });

      return {
        success: true,
        threadId,
        messageId,
        recipientName: recipient.name,
        ticketCreated: assignment !== null,
        ticketId: assignment?.ticketId ?? null,
        workThreadId: assignment?.ticketThreadId ?? null,
        assignmentError,
        message:
          assignment !== null
            ? `I created ticket ${assignment.ticketId} for ${recipient.name} and queued their work.`
            : assignmentError
              ? `I sent the message to ${recipient.name}, but the assigned ticket could not be created: ${assignmentError}`
              : `I sent the message to ${recipient.name}.`,
      };
    }) as ToolSpec['execute'],
  };
}

/**
 * Build the `list_colleagues` tool spec for a given employee.
 * Returns all other employees in the same company.
 */
export function buildListColleaguesTool(
  deps: Pick<BuiltInToolDeps, 'employees'>,
  senderEmployeeId: string,
  companyId: string,
): ToolSpec {
  return {
    name: 'list_colleagues',
    description:
      "List all employees in your company. Returns each colleague's id, name, title, " +
      'and level. Use this to discover who you can message with send_message_to_colleague.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: (async (): Promise<unknown> => {
      const all = deps.employees.listByCompany(companyId);
      return all
        .filter((e) => e.id !== senderEmployeeId)
        .map((e) => ({
          id: e.id,
          name: e.name,
          title: e.title,
          level: e.level,
        }));
    }) as ToolSpec['execute'],
  };
}

/**
 * Build all built-in tool specs for a given employee in a given company.
 * The orchestrator calls this during tool resolution and merges the
 * result with MCP-derived specs.
 */
export function buildBuiltInTools(
  deps: BuiltInToolDeps,
  employeeId: string,
  companyId: string,
): ToolSpec[] {
  const core = [
    buildSendMessageTool(deps, employeeId, companyId),
    buildListColleaguesTool(deps, employeeId, companyId),
  ];
  if (deps.execution) {
    core.push(...buildExecutionTools(deps.execution));
  }
  return core;
}
