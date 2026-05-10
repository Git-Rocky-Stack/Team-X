/**
 * Agentic tools — main-process read-only tool closures for the
 * agentic loop (`@team-x/intelligence/loop`).
 *
 * Each tool wraps an existing repo with:
 *   - a zod schema that validates the LLM's raw JSON args,
 *   - a concise natural-language description the loop inlines into
 *     the system prompt,
 *   - a `execute(args, ctx)` closure that projects DB rows into a
 *     JSON-safe, capped window (`{ rows, truncated }`).
 *
 * Architectural invariants:
 *   - READ-ONLY. No tool in this module may invoke a mutating repo
 *     method. The loop itself cannot mutate org state in M31; write-
 *     side Task Planner tools (decompose / delegate / review) ship
 *     in M32 under their own service layer.
 *   - Results are always capped at `MAX_ROWS` per call with an
 *     explicit `truncated` marker so the LLM can decide whether to
 *     narrow its filters and re-query.
 *   - All returned values are JSON-serializable primitives — no
 *     Drizzle row objects, no Date instances, no Buffers — so the
 *     loop's transcript and event bus can round-trip them safely.
 *   - Every tool re-filters `isSystem === false` defensively on the
 *     employees path (belt-and-suspenders on top of T0's
 *     `listVisibleByCompany`).
 *
 * Phase 5 — M31 — T2.
 */

import type { Tool, ToolContext } from '@team-x/intelligence';
import { EVENT_TYPES, type EventType } from '@team-x/shared-types';
import { z } from 'zod';

import type { createAuditRepo } from '../db/repos/audit.js';
import type { createEmployeesRepo } from '../db/repos/employees.js';
import type { createMeetingsRepo } from '../db/repos/meetings.js';
import type { createProjectsRepo } from '../db/repos/projects.js';
import type { createTicketsRepo } from '../db/repos/tickets.js';
import type { createVaultRepo } from '../db/repos/vault.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rows returned from any single tool invocation. */
export const MAX_ROWS = 50;

/** Payload summaries in `query_events` truncate to this many characters. */
export const PAYLOAD_SUMMARY_MAX = 200;

/** Level values accepted by the employees tool. Mirrors role-pack levels. */
const EMPLOYEE_LEVELS = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
  'ic',
] as const;

/** Ticket status union — mirrors the DB CHECK set. */
const TICKET_STATUSES = ['open', 'in-progress', 'blocked', 'done'] as const;

/** Ticket priority union. */
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

/** Project status union — mirrors the DB CHECK set. */
const PROJECT_STATUSES = ['planning', 'active', 'completed', 'archived'] as const;

/** Meeting status union. */
const MEETING_STATUSES = ['active', 'ended'] as const;

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/**
 * Uniform return shape for every agentic tool. `truncated` is `true`
 * when the caller's filter matched more rows than `MAX_ROWS` (or the
 * user-supplied `limit`, whichever is smaller). The LLM uses this
 * signal to either accept the window or tighten its filters.
 */
export interface AgenticToolResult<T> {
  readonly rows: readonly T[];
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// Dependency contract
// ---------------------------------------------------------------------------

type EmployeesRepo = ReturnType<typeof createEmployeesRepo>;
type TicketsRepo = ReturnType<typeof createTicketsRepo>;
type ProjectsRepo = ReturnType<typeof createProjectsRepo>;
type MeetingsRepo = ReturnType<typeof createMeetingsRepo>;
type VaultRepo = ReturnType<typeof createVaultRepo>;
type AuditRepo = ReturnType<typeof createAuditRepo>;

export interface AgenticToolsDeps {
  /** The company the loop is running for — scopes every repo call. */
  readonly companyId: string;
  readonly employeesRepo: EmployeesRepo;
  readonly ticketsRepo: TicketsRepo;
  readonly projectsRepo: ProjectsRepo;
  readonly meetingsRepo: MeetingsRepo;
  readonly vaultRepo: VaultRepo;
  readonly auditRepo: AuditRepo;
}

// ---------------------------------------------------------------------------
// Projection shapes — each tool returns a narrow subset of the full
// repo row so the LLM's context isn't blown by internal JSON columns
// (toolsAllowedJson, labelsJson, attendeesJson, etc.).
// ---------------------------------------------------------------------------

export interface EmployeeProjection {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
}

export interface TicketProjection {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ProjectProjection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly ticketCount: number;
  readonly progressPercent: number;
}

export interface MeetingProjection {
  readonly id: string;
  readonly agenda: string;
  readonly attendeeCount: number;
  readonly status: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface VaultProjection {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly relevanceScore: number;
}

export interface EventProjection {
  readonly id: string;
  readonly type: string;
  readonly actorId: string;
  readonly actorName: string | null;
  readonly payloadSummary: string;
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a user-supplied limit into `[1, MAX_ROWS]`. Undefined → `MAX_ROWS`.
 * Zod already guarantees positive integer ≤ `MAX_ROWS` upstream, so this
 * is a defensive no-op at runtime but centralises the cap for readability.
 */
function effectiveLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_ROWS;
  if (limit <= 0) return 1;
  if (limit > MAX_ROWS) return MAX_ROWS;
  return limit;
}

/**
 * Produce a short, safe summary of a JSON payload. Parses when possible
 * and renders a single-line preview; falls back to the raw string when
 * the payload isn't JSON. Always truncates at `PAYLOAD_SUMMARY_MAX`
 * characters with a trailing ellipsis.
 */
export function summarizePayload(payloadJson: string): string {
  let text: string;
  try {
    const parsed = JSON.parse(payloadJson);
    if (parsed === null || typeof parsed !== 'object') {
      text = String(parsed);
    } else if (Array.isArray(parsed)) {
      text = `array[${parsed.length}]`;
    } else {
      const keys = Object.keys(parsed as Record<string, unknown>);
      text = keys
        .slice(0, 6)
        .map((k) => {
          const v = (parsed as Record<string, unknown>)[k];
          if (v === null || v === undefined) return `${k}=null`;
          if (typeof v === 'string') return `${k}=${v.slice(0, 40)}`;
          if (typeof v === 'number' || typeof v === 'boolean') return `${k}=${String(v)}`;
          return `${k}=…`;
        })
        .join(', ');
      if (keys.length > 6) text += `, +${keys.length - 6} more`;
    }
  } catch {
    text = payloadJson;
  }
  if (text.length > PAYLOAD_SUMMARY_MAX) {
    return `${text.slice(0, PAYLOAD_SUMMARY_MAX - 1)}…`;
  }
  return text;
}

/** Cheap cancellation check used at the top of every `execute`. */
function checkAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) {
    throw new Error('canceled');
  }
}

function safeJsonArrayLength(json: string): number {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const limitSchema = z.number().int().positive().max(MAX_ROWS).optional();

const queryEmployeesSchema = z.object({
  level: z.enum(EMPLOYEE_LEVELS).optional(),
  searchName: z.string().trim().min(1).optional(),
  limit: limitSchema,
});
type QueryEmployeesArgs = z.infer<typeof queryEmployeesSchema>;

const queryTicketsSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assigneeId: z.string().min(1).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  projectId: z.string().min(1).optional(),
  limit: limitSchema,
});
type QueryTicketsArgs = z.infer<typeof queryTicketsSchema>;

const queryProjectsSchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  limit: limitSchema,
});
type QueryProjectsArgs = z.infer<typeof queryProjectsSchema>;

const queryMeetingsSchema = z.object({
  status: z.enum(MEETING_STATUSES).optional(),
  since: z.number().int().nonnegative().optional(),
  limit: limitSchema,
});
type QueryMeetingsArgs = z.infer<typeof queryMeetingsSchema>;

const queryVaultSchema = z.object({
  query: z.string().trim().min(1),
  limit: limitSchema,
});
type QueryVaultArgs = z.infer<typeof queryVaultSchema>;

/**
 * `query_events.type` is a closed enum — audit 2026-05-07 H6.
 *
 * Prior to H6 the field was `z.string().min(1)` and any model typo
 * (`'tikcet.created'`, `'agentic.complete'`) silently matched zero rows
 * with no signal back to the LLM. The repo's `eventTypes` filter takes
 * any string and returns `[]` on no match — perfect storm for a model
 * that thinks its query "ran fine but returned nothing." Tightening to
 * `z.enum(EVENT_TYPES)` flips silent-empty into a structured
 * `invalid_args` tool result with the full set of valid literals in the
 * Zod issue message, which the loop forwards back to the model so it
 * can self-correct.
 *
 * The cast through `[EventType, ...EventType[]]` is required because Zod
 * 3's `z.enum()` signature wants a non-empty mutable tuple, but our
 * source-of-truth `EVENT_TYPES` is a `readonly` `as const` array. The
 * runtime contents are byte-identical; only the TypeScript variance
 * differs.
 */
const queryEventsSchema = z.object({
  type: z.enum([...EVENT_TYPES] as [EventType, ...EventType[]]).optional(),
  since: z.number().int().nonnegative().optional(),
  limit: limitSchema,
});
type QueryEventsArgs = z.infer<typeof queryEventsSchema>;

// ---------------------------------------------------------------------------
// Individual tool builders — kept as named exports so they can be
// composed independently in tests + the test-agentic-tools seam (T8).
// ---------------------------------------------------------------------------

export function buildQueryEmployeesTool(
  deps: AgenticToolsDeps,
): Tool<QueryEmployeesArgs, AgenticToolResult<EmployeeProjection>> {
  return {
    name: 'query_employees',
    description:
      'List employees in the current company. Optional filters: ' +
      '`level` (one of officer|senior-management|management|supervisor|lead|ic), ' +
      '`searchName` (case-insensitive substring match on display name), ' +
      '`limit` (1-50). Returns id, name, title, level, status.',
    schema: queryEmployeesSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const all = deps.employeesRepo.listByCompany(deps.companyId);
      let rows = all.filter((r) => !r.isSystem);
      if (args.level !== undefined) {
        rows = rows.filter((r) => r.level === args.level);
      }
      if (args.searchName !== undefined) {
        const needle = args.searchName.toLowerCase();
        rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
      }
      const limit = effectiveLimit(args.limit);
      const truncated = rows.length > limit;
      const projected: EmployeeProjection[] = rows.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        level: r.level,
        status: r.status,
      }));
      return { rows: projected, truncated };
    },
  };
}

export function buildQueryTicketsTool(
  deps: AgenticToolsDeps,
): Tool<QueryTicketsArgs, AgenticToolResult<TicketProjection>> {
  return {
    name: 'query_tickets',
    description:
      'List tickets in the current company, newest updates first. Optional filters: ' +
      '`status` (open|in-progress|blocked|done), `assigneeId`, ' +
      '`priority` (low|medium|high|critical), `projectId`, `limit` (1-50). ' +
      'Returns id, title, status, priority, assigneeId, createdAt, updatedAt.',
    schema: queryTicketsSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      let rows = deps.ticketsRepo.listByCompany(deps.companyId);
      if (args.status !== undefined) {
        rows = rows.filter((r) => r.status === args.status);
      }
      if (args.assigneeId !== undefined) {
        rows = rows.filter((r) => r.assigneeId === args.assigneeId);
      }
      if (args.priority !== undefined) {
        rows = rows.filter((r) => r.priority === args.priority);
      }
      if (args.projectId !== undefined) {
        const linked = new Set(deps.projectsRepo.listTickets(args.projectId));
        rows = rows.filter((r) => linked.has(r.id));
      }
      rows = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = effectiveLimit(args.limit);
      const truncated = rows.length > limit;
      const projected: TicketProjection[] = rows.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        assigneeId: r.assigneeId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      return { rows: projected, truncated };
    },
  };
}

export function buildQueryProjectsTool(
  deps: AgenticToolsDeps,
): Tool<QueryProjectsArgs, AgenticToolResult<ProjectProjection>> {
  return {
    name: 'query_projects',
    description:
      'List projects in the current company, newest updates first. Optional filters: ' +
      '`status` (planning|active|completed|archived), `limit` (1-50). ' +
      'Returns id, title, description, status, ticketCount, progressPercent.',
    schema: queryProjectsSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      let rows = deps.projectsRepo.listByCompany(deps.companyId);
      if (args.status !== undefined) {
        rows = rows.filter((r) => r.status === args.status);
      }
      rows = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = effectiveLimit(args.limit);
      const truncated = rows.length > limit;
      const projected: ProjectProjection[] = rows.slice(0, limit).map((r) => {
        const counts = deps.projectsRepo.countTicketsByStatus(r.id);
        const progressPercent =
          counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          ticketCount: counts.total,
          progressPercent,
        };
      });
      return { rows: projected, truncated };
    },
  };
}

export function buildQueryMeetingsTool(
  deps: AgenticToolsDeps,
): Tool<QueryMeetingsArgs, AgenticToolResult<MeetingProjection>> {
  return {
    name: 'query_meetings',
    description:
      'List meetings in the current company, newest first. Optional filters: ' +
      '`status` (active|ended), `since` (Unix ms timestamp — include meetings started at or after), ' +
      '`limit` (1-50). Returns id, agenda, attendeeCount, status, startedAt, endedAt.',
    schema: queryMeetingsSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      let rows = deps.meetingsRepo.listByCompany(deps.companyId);
      if (args.status !== undefined) {
        rows = rows.filter((r) => r.status === args.status);
      }
      if (args.since !== undefined) {
        const since = args.since;
        rows = rows.filter((r) => r.startedAt >= since);
      }
      const limit = effectiveLimit(args.limit);
      const truncated = rows.length > limit;
      const projected: MeetingProjection[] = rows.slice(0, limit).map((r) => ({
        id: r.id,
        agenda: r.agenda,
        attendeeCount: safeJsonArrayLength(r.attendeesJson),
        status: r.status,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      }));
      return { rows: projected, truncated };
    },
  };
}

export function buildQueryVaultTool(
  deps: AgenticToolsDeps,
): Tool<QueryVaultArgs, AgenticToolResult<VaultProjection>> {
  return {
    name: 'query_vault',
    description:
      'Full-text search the file vault. Required: `query` (non-empty search string). ' +
      'Optional: `limit` (1-50). Uses FTS5 when available, degrades to LIKE ' +
      'under test harnesses without FTS5. Returns id, name, mimeType, sizeBytes, relevanceScore.',
    schema: queryVaultSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const results = deps.vaultRepo.search(deps.companyId, args.query);
      const limit = effectiveLimit(args.limit);
      const truncated = results.length > limit;
      const projected: VaultProjection[] = results.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.originalName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        relevanceScore: r.rank,
      }));
      return { rows: projected, truncated };
    },
  };
}

export function buildQueryEventsTool(
  deps: AgenticToolsDeps,
): Tool<QueryEventsArgs, AgenticToolResult<EventProjection>> {
  return {
    name: 'query_events',
    description:
      'List recent audit events in the current company, newest first. Optional filters: ' +
      '`type` — MUST be one of the canonical event-type literals (e.g., ' +
      '`work.completed`, `tool.called`, `ticket.created`, `agentic.completed`, ' +
      '`employee.hired`, `meeting.ended`, `copilot.insight`); free-form strings ' +
      'are rejected by the schema with the full enum surfaced in the error. ' +
      '`since` (Unix ms timestamp), `limit` (1-50). ' +
      'Payload is summarised to a short preview. Returns id, type, actorId, actorName, payloadSummary, createdAt.',
    schema: queryEventsSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const limit = effectiveLimit(args.limit);
      // Fetch limit+1 rows so we can surface the truncation marker
      // without also issuing a COUNT query against the events table.
      const fetched = deps.auditRepo.list({
        companyId: deps.companyId,
        eventTypes: args.type !== undefined ? [args.type] : undefined,
        fromMs: args.since,
        limit: limit + 1,
      });
      const truncated = fetched.length > limit;
      const displayed = fetched.slice(0, limit);

      // Resolve actor names — audit rows only carry actorId. Build a
      // one-shot lookup against the employees table; non-employee
      // actors (system users, external IDs) resolve to null.
      const actorIds = new Set(displayed.map((r) => r.actorId));
      const employees = deps.employeesRepo.listByCompany(deps.companyId);
      const actorNameById = new Map<string, string>();
      for (const e of employees) {
        if (actorIds.has(e.id)) {
          actorNameById.set(e.id, e.name);
        }
      }

      const projected: EventProjection[] = displayed.map((r) => ({
        id: r.id,
        type: r.eventType,
        actorId: r.actorId,
        actorName: actorNameById.get(r.actorId) ?? null,
        payloadSummary: summarizePayload(r.payloadJson),
        createdAt: r.createdAt,
      }));
      return { rows: projected, truncated };
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level factory
// ---------------------------------------------------------------------------

/**
 * Build the full read-only agentic tool set for a company. The order
 * of the returned array is stable so the registry enforces predictable
 * collision detection — matching the `createToolRegistry` contract in
 * `@team-x/intelligence/loop/tool-registry.ts`.
 */
export function createAgenticTools(deps: AgenticToolsDeps): readonly Tool[] {
  return [
    buildQueryEmployeesTool(deps),
    buildQueryTicketsTool(deps),
    buildQueryProjectsTool(deps),
    buildQueryMeetingsTool(deps),
    buildQueryVaultTool(deps),
    buildQueryEventsTool(deps),
  ];
}

/** Canonical list of tool names exported by this module. Used by T0's role-card
 *  `tools_allowed` validation and T3's service-level allowlist enforcement. */
export const AGENTIC_TOOL_NAMES = [
  'query_employees',
  'query_tickets',
  'query_projects',
  'query_meetings',
  'query_vault',
  'query_events',
] as const;

export type AgenticToolName = (typeof AGENTIC_TOOL_NAMES)[number];
