/**
 * Meeting minutes — chair-model summary + action-item extraction.
 *
 * On meeting end the meeting service asks the chair's configured model to
 * summarize the transcript and extract action items as JSON. This module
 * owns the prompt, the governed model call, and the strict reply parser;
 * the meeting service owns the fallback (transcript-only minutes) and the
 * ticket-creation loop that turns the extracted items into tickets.
 *
 * Governance mirrors an orchestrator turn: the call is admitted through
 * `budgetGovernance.assertExecutionAllowed` against the chair (the actor
 * whose provider is spent), recorded on a `runs` row with real token usage
 * and cost, and the spend is posted with `recordRunSpend(runId)` — so the
 * minutes call counts against the same budgets and shows up in telemetry.
 *
 * Every failure (budget refusal, unresolvable provider, stream error,
 * timeout, unparseable reply) is thrown as a descriptive Error; the caller
 * catches, logs, and falls back. Nothing here mutates meeting state.
 */

import { streamAgent } from '@team-x/provider-router';
import type { MeetingActionItem, TicketPriority } from '@team-x/shared-types';
import { generateTraceId } from '@team-x/shared-types';
import { z } from 'zod';

import type { EmployeeRow } from '../db/repos/employees.js';

import type { CostCalculator } from './run-agent.js';

import type { BuildOrchestratorOptions, OrchestratorRunsRepo, ResolveProvider } from './index.js';

/** Model deps for minutes generation — composed from the orchestrator's own seams. */
export interface MeetingMinutesModelDeps {
  /** Same resolver the orchestrator uses for agent turns. */
  resolveProvider: ResolveProvider;
  runsRepo: OrchestratorRunsRepo;
  calcCost: CostCalculator;
  budgetGovernance?: BuildOrchestratorOptions['budgetGovernance'];
  /** Abort the call after this long; default 60s so a stuck provider cannot hang meeting end. */
  timeoutMs?: number;
  now?: () => number;
}

export interface MeetingMinutesAttendee {
  id: string;
  name: string;
  title: string;
}

export interface ParsedMeetingMinutes {
  summary: string;
  actionItems: MeetingActionItem[];
}

const DEFAULT_MINUTES_TIMEOUT_MS = 60_000;

/**
 * Transcript budget sent to the model. Long meetings keep the most recent
 * discussion (where decisions and owners tend to land) and mark the cut,
 * rather than overflowing a small local model's context window.
 */
const MAX_TRANSCRIPT_CHARS = 24_000;

/** Ticket-flood guard: a runaway reply cannot open more than this many tickets. */
export const MAX_MEETING_ACTION_ITEMS = 20;

const TICKET_PRIORITIES = [
  'low',
  'medium',
  'high',
  'critical',
] as const satisfies readonly TicketPriority[];

export const MINUTES_SYSTEM_PROMPT = [
  'You are the chair of a company meeting, writing the official minutes.',
  'Reply with ONE JSON object and nothing else, shaped exactly like:',
  '{"summary": string, "actionItems": [{"title": string, "assigneeId"?: string, "priority"?: "low" | "medium" | "high" | "critical"}]}',
  'Rules:',
  '- "summary": 2-5 sentences covering decisions made and open questions.',
  '- "actionItems": only concrete follow-up work someone committed to or was asked to do. Use [] when there is none.',
  '- "title": a short imperative ticket title (under 120 characters).',
  '- "assigneeId": copy an attendee id from the attendee list exactly; omit it when the owner is unclear.',
  '- Lines from "You" are the human operator who called the meeting.',
].join('\n');

export function buildMinutesUserPrompt(args: {
  agenda: string;
  attendees: readonly MeetingMinutesAttendee[];
  transcript: string;
}): string {
  const transcript =
    args.transcript.length > MAX_TRANSCRIPT_CHARS
      ? `[earlier discussion truncated]\n\n${args.transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
      : args.transcript;
  const attendees = args.attendees.map((a) => `- ${a.name} (${a.title}) — id: ${a.id}`).join('\n');
  return [
    `Agenda: ${args.agenda || '(none)'}`,
    '',
    'Attendees:',
    attendees,
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reply parsing — tolerant of prose/code fences, strict on fields
// ---------------------------------------------------------------------------

const actionItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
});

const minutesReplySchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  actionItems: z.array(actionItemSchema).max(MAX_MEETING_ACTION_ITEMS),
});

/**
 * Parse the chair model's reply. Accepts the JSON bare, wrapped in a
 * ```json fence, or preceded/followed by prose (small local models do all
 * three) by taking the outermost `{…}` span. Field validation is strict:
 * a wrong type, an unknown priority, an empty title, or too many items
 * rejects the whole reply (returns null) so the caller falls back to the
 * transcript rather than filing half-understood tickets.
 *
 * An `assigneeId` that is not one of `attendeeIds` is dropped (the item is
 * kept, unassigned): the model only sees attendee ids, so anything else is
 * a hallucination, and assigning a ticket to it would either fail the
 * foreign key or hand work to someone who was not in the room.
 */
export function parseMinutesReply(
  raw: string,
  attendeeIds: ReadonlySet<string>,
): ParsedMeetingMinutes | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = minutesReplySchema.safeParse(json);
  if (!parsed.success) return null;
  return {
    summary: parsed.data.summary,
    actionItems: parsed.data.actionItems.map((item) => {
      const out: MeetingActionItem = { title: item.title };
      if (item.assigneeId && attendeeIds.has(item.assigneeId)) out.assigneeId = item.assigneeId;
      if (item.priority) out.priority = item.priority;
      return out;
    }),
  };
}

// ---------------------------------------------------------------------------
// Governed model call
// ---------------------------------------------------------------------------

/**
 * Ask the chair's model for minutes. Throws on any failure; see the
 * module doc-comment for the governance contract.
 */
export async function generateMeetingMinutes(
  deps: MeetingMinutesModelDeps,
  input: {
    companyId: string;
    threadId: string;
    chair: EmployeeRow;
    agenda: string;
    attendees: readonly MeetingMinutesAttendee[];
    transcript: string;
  },
): Promise<ParsedMeetingMinutes> {
  const now = deps.now ?? Date.now;

  if (deps.budgetGovernance?.assertExecutionAllowed) {
    const admission = await deps.budgetGovernance.assertExecutionAllowed({
      companyId: input.companyId,
      employeeId: input.chair.id,
      executionKind: 'agentic',
    });
    if (!admission.allowed) {
      throw new Error(
        `budget policy blocked the minutes call: ${admission.reason ?? 'execution not allowed'}`,
      );
    }
  }

  const resolved = await deps.resolveProvider(input.chair);
  const runId = deps.runsRepo.start({
    employeeId: input.chair.id,
    provider: resolved.providerName,
    model: resolved.model,
    threadId: input.threadId,
    traceId: generateTraceId(),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_MINUTES_TIMEOUT_MS);
  const startedAt = now();
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedInputTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let streamError: unknown = null;

  try {
    for await (const chunk of streamAgent({
      providerFactory: resolved.stream,
      system: MINUTES_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildMinutesUserPrompt({
            agenda: input.agenda,
            attendees: input.attendees,
            transcript: input.transcript,
          }),
        },
      ],
      signal: controller.signal,
      runId,
      threadId: input.threadId,
      companyId: input.companyId,
      employeeId: input.chair.id,
    })) {
      if (controller.signal.aborted) {
        throw new Error('minutes call timed out');
      }
      if (chunk.kind === 'delta') {
        text += chunk.delta;
      } else if (chunk.kind === 'done') {
        promptTokens = chunk.usage.promptTokens;
        completionTokens = chunk.usage.completionTokens;
        cachedInputTokens = chunk.usage.cachedInputTokens;
        cacheWriteTokens = chunk.usage.cacheWriteTokens;
      }
    }
  } catch (err) {
    streamError = err;
  } finally {
    clearTimeout(timer);
  }

  // Close the run row and post spend whether or not the stream finished —
  // a provider that billed tokens before erroring still spent the budget.
  const costUsd = deps.calcCost({
    provider: resolved.providerName,
    model: resolved.model,
    promptTokens,
    completionTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  });
  deps.runsRepo.finish(runId, {
    status: streamError ? 'error' : 'success',
    promptTokens,
    completionTokens,
    cacheReadTokens: cachedInputTokens ?? 0,
    cacheWriteTokens: cacheWriteTokens ?? 0,
    latencyMs: Math.max(0, now() - startedAt),
    costUsd,
    ...(streamError
      ? { error: streamError instanceof Error ? streamError.message : String(streamError) }
      : {}),
  });
  if (deps.budgetGovernance) {
    void deps.budgetGovernance.recordRunSpend(runId).catch((err) => {
      console.warn('[meeting-minutes] budget recordRunSpend failed:', err);
    });
  }

  if (streamError) throw streamError;

  const parsed = parseMinutesReply(text, new Set(input.attendees.map((a) => a.id)));
  if (!parsed) {
    throw new Error(`chair model reply was not valid minutes JSON: ${text.slice(0, 200)}`);
  }
  return parsed;
}
