/**
 * Test-mode canned agentic tool registry — deterministic `Tool[]` for
 * Playwright E2E runs and `AgenticLoopService` unit tests.
 *
 * The production `createAgenticTools` factory wires each tool to a
 * live DB repo (employees / tickets / projects / meetings / vault /
 * events). That is the correct shape for dev + prod, but under
 * `NODE_ENV === 'test'` the composition root needs a variant that:
 *
 *   1. Returns the SAME tool names, descriptions, and zod schemas
 *      (so the system prompt the loop builds in
 *      `packages/intelligence/src/loop/prompt.ts` is byte-identical to
 *      the prod path).
 *   2. Never touches the DB — every tool resolves to a deterministic
 *      canned envelope. Lets E2E specs boot with an empty, freshly-
 *      migrated SQLite user-data-dir and still get predictable loop
 *      behaviour.
 *
 * Mirrors the three-tier posture of `test-classifier.ts` and
 * `test-agentic-provider.ts`:
 *
 *   1. Sentinel override — a tool arg containing
 *      `__ECHO_AGENT_TOOL__:<json>` makes the tool return the parsed
 *      JSON verbatim as the `rows`/`truncated` envelope. Lets specs
 *      pin a specific result shape on a per-invocation basis without
 *      a code change. The sentinel MUST be in a string-valued arg;
 *      the JSON payload MUST parse to `{rows: unknown[], truncated?:
 *      boolean}`. Malformed JSON falls through to the canned table.
 *   2. Canned table — per-tool fixtures keyed on the tool name.
 *      Deterministic, repo-free default envelopes for each of the
 *      six read-only tools.
 *   3. Fallback — every unmatched tool invocation returns
 *      `{rows: [], truncated: false}`. Keeps the tool contract
 *      never-throw; the loop can still reason against an empty
 *      envelope and either re-query with different filters or
 *      answer directly.
 *
 * Only loaded when `isTestMode()` returns true. Production + dev use
 * `createAgenticTools`. A runtime guard logs a warning if this module
 * is imported outside `NODE_ENV === 'test'` so accidental production
 * wiring surfaces loudly in logs rather than silently swapping the
 * tool set.
 *
 * Phase 5 — M31 — T8.
 */

import type { Tool, ToolContext } from '@team-x/intelligence';
import { z } from 'zod';

import type {
  AgenticToolResult,
  EmployeeProjection,
  EventProjection,
  MeetingProjection,
  ProjectProjection,
  TicketProjection,
  VaultProjection,
} from './agentic-tools.js';
import { MAX_ROWS } from './agentic-tools.js';

// ---------------------------------------------------------------------------
// Runtime guard — log loudly if a non-test caller imports this module.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'test') {
  // Intentional: not a throw. The composition-root `isTestMode()` branch
  // is the one line this invariant depends on; if it ever regresses we
  // want the warning in logs rather than an app crash that masks the
  // underlying swap bug.
  console.warn(
    '[test-agentic-tools] imported outside NODE_ENV=test — ' +
      'production path should use createAgenticTools from ./agentic-tools.js',
  );
}

// ---------------------------------------------------------------------------
// Sentinel — per-invocation override wired through any string arg.
// ---------------------------------------------------------------------------

/** Sentinel prefix. Embed `__ECHO_AGENT_TOOL__:{"rows":[...]}` in any
 *  string-valued arg to override the canned envelope on a single call. */
export const ECHO_AGENT_TOOL_SENTINEL = '__ECHO_AGENT_TOOL__:';

function extractSentinelEnvelope(args: Record<string, unknown>): AgenticToolResult<unknown> | null {
  for (const v of Object.values(args)) {
    if (typeof v !== 'string') continue;
    const idx = v.indexOf(ECHO_AGENT_TOOL_SENTINEL);
    if (idx < 0) continue;
    const payload = v.slice(idx + ECHO_AGENT_TOOL_SENTINEL.length).trim();
    if (payload.length === 0) continue;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (parsed === null || typeof parsed !== 'object') return null;
      const obj = parsed as { rows?: unknown; truncated?: unknown };
      if (!Array.isArray(obj.rows)) return null;
      return {
        rows: obj.rows as readonly unknown[],
        truncated: obj.truncated === true,
      };
    } catch {
      return null;
    }
  }
  return null;
}

function checkAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) {
    throw new Error('canceled');
  }
}

// ---------------------------------------------------------------------------
// Canned fixtures — deterministic envelopes per tool.
// ---------------------------------------------------------------------------

/** Fixed roster returned by `query_employees` in test mode. Mirrors the
 *  Phase-1 seed (CEO + Senior Fullstack Engineer) so specs can assert on
 *  a stable, human-recognisable team. */
const FIXTURE_EMPLOYEES: readonly EmployeeProjection[] = Object.freeze([
  Object.freeze({
    id: 'emp-test-ceo',
    name: 'Iris Kovač',
    title: 'Chief Executive Officer',
    level: 'officer',
    status: 'active',
  }),
  Object.freeze({
    id: 'emp-test-swe',
    name: 'Mateo Reyes',
    title: 'Senior Fullstack Engineer',
    level: 'ic',
    status: 'active',
  }),
]);

const FIXTURE_TICKETS: readonly TicketProjection[] = Object.freeze([]);
const FIXTURE_PROJECTS: readonly ProjectProjection[] = Object.freeze([]);
const FIXTURE_MEETINGS: readonly MeetingProjection[] = Object.freeze([]);
const FIXTURE_VAULT: readonly VaultProjection[] = Object.freeze([]);
const FIXTURE_EVENTS: readonly EventProjection[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Schemas — MUST match the production zod shapes so the system prompt
// and tool-registry validation behaviour are identical in tests.
// The shapes below are a conservative superset of the production schemas;
// the loop only checks `.safeParse(args).success`, so any args the
// production schema accepts must also parse here.
// ---------------------------------------------------------------------------

const EMPLOYEE_LEVELS = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
  'ic',
] as const;
const TICKET_STATUSES = ['open', 'in-progress', 'blocked', 'done'] as const;
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const PROJECT_STATUSES = ['planning', 'active', 'completed', 'archived'] as const;
const MEETING_STATUSES = ['active', 'ended'] as const;

const queryEmployeesSchema = z
  .object({
    level: z.enum(EMPLOYEE_LEVELS).optional(),
    searchName: z.string().trim().min(1).optional(),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

const queryTicketsSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    assigneeId: z.string().trim().min(1).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    projectId: z.string().trim().min(1).optional(),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

const queryProjectsSchema = z
  .object({
    status: z.enum(PROJECT_STATUSES).optional(),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

const queryMeetingsSchema = z
  .object({
    status: z.enum(MEETING_STATUSES).optional(),
    since: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

const queryVaultSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

const queryEventsSchema = z
  .object({
    type: z.string().trim().min(1).optional(),
    since: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(MAX_ROWS).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export interface TestAgenticToolsDeps {
  /** Scoped to the loop run's company — unused at runtime (no repo
   *  access) but kept in the signature so the composition-root swap is
   *  literal-for-literal with `createAgenticTools`. */
  readonly companyId: string;
}

type TestTool<TArgs extends Record<string, unknown>, TRow> = Tool<TArgs, AgenticToolResult<TRow>>;

function buildTestTool<TArgs extends Record<string, unknown>, TRow>(
  name: string,
  description: string,
  schema: z.ZodType<TArgs>,
  defaultRows: readonly TRow[],
): TestTool<TArgs, TRow> {
  return {
    name,
    description,
    schema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const override = extractSentinelEnvelope(args as Record<string, unknown>);
      if (override !== null) {
        return {
          rows: override.rows as readonly TRow[],
          truncated: override.truncated,
        };
      }
      return { rows: defaultRows, truncated: false };
    },
  };
}

/**
 * Build the full test-mode tool set. Same tool names / descriptions /
 * schemas as `createAgenticTools`, so the loop's system prompt and
 * registry-collision contract are identical.
 */
export function createTestAgenticTools(_deps: TestAgenticToolsDeps): readonly Tool[] {
  // `_deps.companyId` is intentionally unused — kept only for call-
  // site symmetry with `createAgenticTools`. Void-reference to keep
  // strict-unused-vars happy without a `// biome-ignore` pragma.
  void _deps;

  return [
    buildTestTool(
      'query_employees',
      'List employees in the current company. Optional filters: `level` ' +
        '(officer|senior-management|management|supervisor|lead|ic), ' +
        '`searchName` (case-insensitive substring), `limit` (1-50). ' +
        'Returns id, name, title, level, status.',
      queryEmployeesSchema,
      FIXTURE_EMPLOYEES,
    ),
    buildTestTool(
      'query_tickets',
      'List tickets in the current company, newest updates first. Optional filters: ' +
        '`status` (open|in-progress|blocked|done), `assigneeId`, ' +
        '`priority` (low|medium|high|critical), `projectId`, `limit` (1-50). ' +
        'Returns id, title, status, priority, assigneeId, createdAt, updatedAt.',
      queryTicketsSchema,
      FIXTURE_TICKETS,
    ),
    buildTestTool(
      'query_projects',
      'List projects in the current company, newest updates first. Optional filters: ' +
        '`status` (planning|active|completed|archived), `limit` (1-50). ' +
        'Returns id, title, description, status, ticketCount, progressPercent.',
      queryProjectsSchema,
      FIXTURE_PROJECTS,
    ),
    buildTestTool(
      'query_meetings',
      'List meetings in the current company, newest first. Optional filters: ' +
        '`status` (active|ended), `since` (Unix ms timestamp — include meetings started at or after), ' +
        '`limit` (1-50). Returns id, agenda, attendeeCount, status, startedAt, endedAt.',
      queryMeetingsSchema,
      FIXTURE_MEETINGS,
    ),
    buildTestTool(
      'query_vault',
      'Full-text search the file vault. Required: `query` (non-empty search string). ' +
        'Optional: `limit` (1-50). Uses FTS5 when available, degrades to LIKE ' +
        'under test harnesses without FTS5. Returns id, name, mimeType, sizeBytes, relevanceScore.',
      queryVaultSchema,
      FIXTURE_VAULT,
    ),
    buildTestTool(
      'query_events',
      'List recent audit events in the current company, newest first. Optional filters: ' +
        '`type` (event_type equality), `since` (Unix ms timestamp), `limit` (1-50). ' +
        'Payload is summarised to a short preview. Returns id, type, actorId, actorName, payloadSummary, createdAt.',
      queryEventsSchema,
      FIXTURE_EVENTS,
    ),
  ];
}
