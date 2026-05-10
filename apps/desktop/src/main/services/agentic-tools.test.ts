/**
 * Unit tests for agentic-tools — read-side tool closures that the
 * agentic loop (`@team-x/intelligence/loop`) invokes against the
 * main-process repos.
 *
 * These tests stub every repo with a hand-rolled fake so filter
 * correctness, projection shape, and the truncation marker can be
 * verified without hitting sql.js (faster + isolates tool logic from
 * DB behaviour, which is already exercised by repo-level tests).
 *
 * Phase 5 — M31 — T2.
 */

import type { ToolContext } from '@team-x/intelligence';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AGENTIC_TOOL_NAMES,
  type AgenticToolsDeps,
  MAX_ROWS,
  PAYLOAD_SUMMARY_MAX,
  buildQueryEmployeesTool,
  buildQueryEventsTool,
  buildQueryMeetingsTool,
  buildQueryProjectsTool,
  buildQueryTicketsTool,
  buildQueryVaultTool,
  createAgenticTools,
  summarizePayload,
} from './agentic-tools.js';

// ---------------------------------------------------------------------------
// Tiny in-memory repo fakes. We only implement the methods the tools
// actually call — anything else is `undefined` and would throw if touched,
// which is exactly the read-only guard we want at the test level.
// ---------------------------------------------------------------------------

interface EmployeeRowLike {
  id: string;
  companyId: string;
  name: string;
  title: string;
  level: string;
  status: string;
  isSystem: boolean;
}

interface TicketRowLike {
  id: string;
  companyId: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ProjectRowLike {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  updatedAt: number;
}

interface MeetingRowLike {
  id: string;
  companyId: string;
  agenda: string;
  status: string;
  attendeesJson: string;
  startedAt: number;
  endedAt: number | null;
}

interface VaultSearchRowLike {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rank: number;
}

interface AuditRowLike {
  id: string;
  companyId: string;
  actorId: string;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

interface AuditFilterLike {
  companyId: string;
  eventTypes?: string[];
  actorId?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
  offset?: number;
}

function makeFakeDeps(
  overrides: {
    companyId?: string;
    employees?: EmployeeRowLike[];
    tickets?: TicketRowLike[];
    projects?: ProjectRowLike[];
    meetings?: MeetingRowLike[];
    vaultResults?: VaultSearchRowLike[];
    events?: AuditRowLike[];
    projectTicketMap?: Record<string, string[]>;
    projectCounts?: Record<string, { total: number; done: number }>;
  } = {},
): AgenticToolsDeps {
  const companyId = overrides.companyId ?? 'co-1';
  const employees = overrides.employees ?? [];
  const tickets = overrides.tickets ?? [];
  const projects = overrides.projects ?? [];
  const meetings = overrides.meetings ?? [];
  const vaultResults = overrides.vaultResults ?? [];
  const events = overrides.events ?? [];
  const projectTicketMap = overrides.projectTicketMap ?? {};
  const projectCounts = overrides.projectCounts ?? {};

  const employeesRepo = {
    listByCompany: (cid: string) => employees.filter((e) => e.companyId === cid),
  } as unknown as AgenticToolsDeps['employeesRepo'];

  const ticketsRepo = {
    listByCompany: (cid: string) => tickets.filter((t) => t.companyId === cid),
  } as unknown as AgenticToolsDeps['ticketsRepo'];

  const projectsRepo = {
    listByCompany: (cid: string) => projects.filter((p) => p.companyId === cid),
    listTickets: (projectId: string) => projectTicketMap[projectId] ?? [],
    countTicketsByStatus: (projectId: string) => projectCounts[projectId] ?? { total: 0, done: 0 },
  } as unknown as AgenticToolsDeps['projectsRepo'];

  const meetingsRepo = {
    listByCompany: (cid: string) => meetings.filter((m) => m.companyId === cid),
  } as unknown as AgenticToolsDeps['meetingsRepo'];

  const vaultRepo = {
    search: (_cid: string, _query: string) => vaultResults,
  } as unknown as AgenticToolsDeps['vaultRepo'];

  const auditRepo = {
    list: (filter: AuditFilterLike) => {
      let rows = events.filter((e) => e.companyId === filter.companyId);
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        const types = new Set(filter.eventTypes);
        rows = rows.filter((e) => types.has(e.eventType));
      }
      if (filter.fromMs !== undefined) {
        const since = filter.fromMs;
        rows = rows.filter((e) => e.createdAt >= since);
      }
      rows = [...rows].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.limit !== undefined) rows = rows.slice(0, filter.limit);
      return rows;
    },
  } as unknown as AgenticToolsDeps['auditRepo'];

  return {
    companyId,
    employeesRepo,
    ticketsRepo,
    projectsRepo,
    meetingsRepo,
    vaultRepo,
    auditRepo,
  };
}

function makeCtx(signal?: AbortSignal): ToolContext {
  return {
    signal: signal ?? new AbortController().signal,
    runId: 'test-run',
  };
}

// ---------------------------------------------------------------------------
// query_employees
// ---------------------------------------------------------------------------

describe('query_employees', () => {
  let deps: AgenticToolsDeps;

  beforeEach(() => {
    deps = makeFakeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Alice Johnson',
          title: 'CEO',
          level: 'officer',
          status: 'idle',
          isSystem: false,
        },
        {
          id: 'e2',
          companyId: 'co-1',
          name: 'Bob Smith',
          title: 'CTO',
          level: 'officer',
          status: 'idle',
          isSystem: false,
        },
        {
          id: 'e3',
          companyId: 'co-1',
          name: 'Carol Lee',
          title: 'Senior Engineer',
          level: 'ic',
          status: 'thinking',
          isSystem: false,
        },
        {
          id: 'sys',
          companyId: 'co-1',
          name: 'Team-X Copilot',
          title: 'System Agent',
          level: 'system',
          status: 'idle',
          isSystem: true,
        },
      ],
    });
  });

  it('returns a JSON-safe projection of visible employees', async () => {
    const tool = buildQueryEmployeesTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { id: 'e1', name: 'Alice Johnson', title: 'CEO', level: 'officer', status: 'idle' },
      { id: 'e2', name: 'Bob Smith', title: 'CTO', level: 'officer', status: 'idle' },
      { id: 'e3', name: 'Carol Lee', title: 'Senior Engineer', level: 'ic', status: 'thinking' },
    ]);
  });

  it('excludes system agents even when the repo returns them', async () => {
    const tool = buildQueryEmployeesTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows.find((r) => r.id === 'sys')).toBeUndefined();
  });

  it('filters by level', async () => {
    const tool = buildQueryEmployeesTool(deps);
    const result = await tool.execute({ level: 'officer' }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['e1', 'e2']);
  });

  it('filters by case-insensitive searchName substring', async () => {
    const tool = buildQueryEmployeesTool(deps);
    const result = await tool.execute({ searchName: 'aLiCe' }, makeCtx());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe('e1');
  });

  it('marks truncated=true when more rows exist than limit', async () => {
    const tool = buildQueryEmployeesTool(deps);
    const result = await tool.execute({ limit: 2 }, makeCtx());
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('rejects non-enum level via zod schema', () => {
    const tool = buildQueryEmployeesTool(deps);
    const parsed = tool.schema.safeParse({ level: 'emperor' });
    expect(parsed.success).toBe(false);
  });

  it('rejects limit above MAX_ROWS', () => {
    const tool = buildQueryEmployeesTool(deps);
    const parsed = tool.schema.safeParse({ limit: MAX_ROWS + 1 });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// query_tickets
// ---------------------------------------------------------------------------

describe('query_tickets', () => {
  let deps: AgenticToolsDeps;

  beforeEach(() => {
    deps = makeFakeDeps({
      tickets: [
        {
          id: 't1',
          companyId: 'co-1',
          title: 'Fix login',
          status: 'open',
          priority: 'high',
          assigneeId: 'e1',
          createdAt: 100,
          updatedAt: 300,
        },
        {
          id: 't2',
          companyId: 'co-1',
          title: 'Add dark mode',
          status: 'in-progress',
          priority: 'medium',
          assigneeId: 'e2',
          createdAt: 200,
          updatedAt: 500,
        },
        {
          id: 't3',
          companyId: 'co-1',
          title: 'Ship v2',
          status: 'done',
          priority: 'critical',
          assigneeId: 'e1',
          createdAt: 50,
          updatedAt: 150,
        },
      ],
      projectTicketMap: { p1: ['t2', 't3'] },
    });
  });

  it('projects tickets newest updated first', async () => {
    const tool = buildQueryTicketsTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['t2', 't1', 't3']);
  });

  it('filters by status', async () => {
    const tool = buildQueryTicketsTool(deps);
    const result = await tool.execute({ status: 'open' }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['t1']);
  });

  it('filters by assigneeId', async () => {
    const tool = buildQueryTicketsTool(deps);
    const result = await tool.execute({ assigneeId: 'e1' }, makeCtx());
    expect(result.rows.map((r) => r.id).sort()).toEqual(['t1', 't3']);
  });

  it('filters by priority', async () => {
    const tool = buildQueryTicketsTool(deps);
    const result = await tool.execute({ priority: 'critical' }, makeCtx());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe('t3');
  });

  it('filters by projectId via the junction table', async () => {
    const tool = buildQueryTicketsTool(deps);
    const result = await tool.execute({ projectId: 'p1' }, makeCtx());
    expect(result.rows.map((r) => r.id).sort()).toEqual(['t2', 't3']);
  });

  it('rejects unknown priority via schema', () => {
    const tool = buildQueryTicketsTool(deps);
    expect(tool.schema.safeParse({ priority: 'apocalyptic' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// query_projects
// ---------------------------------------------------------------------------

describe('query_projects', () => {
  it('computes progressPercent as done/total*100', async () => {
    const deps = makeFakeDeps({
      projects: [
        {
          id: 'p1',
          companyId: 'co-1',
          title: 'Auth rebuild',
          description: 'Rewire auth',
          status: 'active',
          updatedAt: 100,
        },
      ],
      projectCounts: { p1: { total: 4, done: 3 } },
    });
    const tool = buildQueryProjectsTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows[0]?.ticketCount).toBe(4);
    expect(result.rows[0]?.progressPercent).toBe(75);
  });

  it('reports 0 progress when project has no linked tickets', async () => {
    const deps = makeFakeDeps({
      projects: [
        {
          id: 'p1',
          companyId: 'co-1',
          title: 'Empty',
          description: '',
          status: 'planning',
          updatedAt: 100,
        },
      ],
      projectCounts: {},
    });
    const tool = buildQueryProjectsTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows[0]?.ticketCount).toBe(0);
    expect(result.rows[0]?.progressPercent).toBe(0);
  });

  it('filters by status', async () => {
    const deps = makeFakeDeps({
      projects: [
        {
          id: 'p1',
          companyId: 'co-1',
          title: 'A',
          description: '',
          status: 'active',
          updatedAt: 100,
        },
        {
          id: 'p2',
          companyId: 'co-1',
          title: 'B',
          description: '',
          status: 'archived',
          updatedAt: 200,
        },
      ],
    });
    const tool = buildQueryProjectsTool(deps);
    const result = await tool.execute({ status: 'active' }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['p1']);
  });

  it('marks truncated=true when rows exceed limit', async () => {
    const projects: ProjectRowLike[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      companyId: 'co-1',
      title: `P${i}`,
      description: '',
      status: 'active',
      updatedAt: i * 10,
    }));
    const deps = makeFakeDeps({ projects });
    const tool = buildQueryProjectsTool(deps);
    const result = await tool.execute({ limit: 2 }, makeCtx());
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// query_meetings
// ---------------------------------------------------------------------------

describe('query_meetings', () => {
  it('parses attendeeCount from JSON and projects shape', async () => {
    const deps = makeFakeDeps({
      meetings: [
        {
          id: 'm1',
          companyId: 'co-1',
          agenda: 'All-hands',
          status: 'ended',
          attendeesJson: JSON.stringify(['e1', 'e2', 'e3']),
          startedAt: 1000,
          endedAt: 2000,
        },
      ],
    });
    const tool = buildQueryMeetingsTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows[0]).toEqual({
      id: 'm1',
      agenda: 'All-hands',
      attendeeCount: 3,
      status: 'ended',
      startedAt: 1000,
      endedAt: 2000,
    });
  });

  it('handles malformed attendeesJson gracefully', async () => {
    const deps = makeFakeDeps({
      meetings: [
        {
          id: 'm1',
          companyId: 'co-1',
          agenda: 'x',
          status: 'active',
          attendeesJson: '{not-json',
          startedAt: 1000,
          endedAt: null,
        },
      ],
    });
    const tool = buildQueryMeetingsTool(deps);
    const result = await tool.execute({}, makeCtx());
    expect(result.rows[0]?.attendeeCount).toBe(0);
  });

  it('filters by since timestamp', async () => {
    const deps = makeFakeDeps({
      meetings: [
        {
          id: 'm1',
          companyId: 'co-1',
          agenda: 'old',
          status: 'ended',
          attendeesJson: '[]',
          startedAt: 100,
          endedAt: 200,
        },
        {
          id: 'm2',
          companyId: 'co-1',
          agenda: 'new',
          status: 'active',
          attendeesJson: '[]',
          startedAt: 1000,
          endedAt: null,
        },
      ],
    });
    const tool = buildQueryMeetingsTool(deps);
    const result = await tool.execute({ since: 500 }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['m2']);
  });

  it('filters by status', async () => {
    const deps = makeFakeDeps({
      meetings: [
        {
          id: 'm1',
          companyId: 'co-1',
          agenda: 'old',
          status: 'ended',
          attendeesJson: '[]',
          startedAt: 100,
          endedAt: 200,
        },
        {
          id: 'm2',
          companyId: 'co-1',
          agenda: 'new',
          status: 'active',
          attendeesJson: '[]',
          startedAt: 1000,
          endedAt: null,
        },
      ],
    });
    const tool = buildQueryMeetingsTool(deps);
    const result = await tool.execute({ status: 'active' }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['m2']);
  });
});

// ---------------------------------------------------------------------------
// query_vault
// ---------------------------------------------------------------------------

describe('query_vault', () => {
  it('projects search results with rank → relevanceScore', async () => {
    const deps = makeFakeDeps({
      vaultResults: [
        {
          id: 'v1',
          originalName: 'design.md',
          mimeType: 'text/markdown',
          sizeBytes: 1024,
          rank: -1.5,
        },
      ],
    });
    const tool = buildQueryVaultTool(deps);
    const result = await tool.execute({ query: 'design' }, makeCtx());
    expect(result.rows[0]).toEqual({
      id: 'v1',
      name: 'design.md',
      mimeType: 'text/markdown',
      sizeBytes: 1024,
      relevanceScore: -1.5,
    });
  });

  it('marks truncated=true when search returns more than limit', async () => {
    const vaultResults: VaultSearchRowLike[] = Array.from({ length: 10 }, (_, i) => ({
      id: `v${i}`,
      originalName: `file${i}.txt`,
      mimeType: 'text/plain',
      sizeBytes: 100,
      rank: -0.1 * i,
    }));
    const deps = makeFakeDeps({ vaultResults });
    const tool = buildQueryVaultTool(deps);
    const result = await tool.execute({ query: 'f', limit: 3 }, makeCtx());
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('rejects empty query via schema', () => {
    const tool = buildQueryVaultTool(makeFakeDeps());
    expect(tool.schema.safeParse({ query: '' }).success).toBe(false);
    expect(tool.schema.safeParse({ query: '   ' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// query_events
// ---------------------------------------------------------------------------

describe('query_events', () => {
  it('resolves actorName from employees and null for unknown actors', async () => {
    const deps = makeFakeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Alice',
          title: 'CEO',
          level: 'officer',
          status: 'idle',
          isSystem: false,
        },
      ],
      events: [
        {
          id: 'ev1',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'employee.hired',
          payloadJson: '{"name":"Bob"}',
          createdAt: 100,
        },
        {
          id: 'ev2',
          companyId: 'co-1',
          actorId: 'unknown',
          eventType: 'system.boot',
          payloadJson: '{}',
          createdAt: 200,
        },
      ],
    });
    const tool = buildQueryEventsTool(deps);
    const result = await tool.execute({}, makeCtx());
    const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
    expect(byId.ev1?.actorName).toBe('Alice');
    expect(byId.ev2?.actorName).toBeNull();
  });

  it('filters by type', async () => {
    const deps = makeFakeDeps({
      events: [
        {
          id: 'ev1',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'employee.hired',
          payloadJson: '{}',
          createdAt: 100,
        },
        {
          id: 'ev2',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'ticket.created',
          payloadJson: '{}',
          createdAt: 200,
        },
      ],
    });
    const tool = buildQueryEventsTool(deps);
    const result = await tool.execute({ type: 'ticket.created' }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['ev2']);
  });

  it('filters by since', async () => {
    const deps = makeFakeDeps({
      events: [
        {
          id: 'ev1',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'x',
          payloadJson: '{}',
          createdAt: 100,
        },
        {
          id: 'ev2',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'x',
          payloadJson: '{}',
          createdAt: 500,
        },
      ],
    });
    const tool = buildQueryEventsTool(deps);
    const result = await tool.execute({ since: 300 }, makeCtx());
    expect(result.rows.map((r) => r.id)).toEqual(['ev2']);
  });

  it('marks truncated=true when more than limit events match', async () => {
    const events: AuditRowLike[] = Array.from({ length: 7 }, (_, i) => ({
      id: `ev${i}`,
      companyId: 'co-1',
      actorId: 'e1',
      eventType: 'x',
      payloadJson: '{}',
      createdAt: 1000 - i,
    }));
    const deps = makeFakeDeps({ events });
    const tool = buildQueryEventsTool(deps);
    const result = await tool.execute({ limit: 3 }, makeCtx());
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('summarises JSON payload and bounds length at PAYLOAD_SUMMARY_MAX', async () => {
    // Pack the preview with six keys whose values each slice to 40 chars
    // so the rendered "k=v, k=v, …" line genuinely exceeds the 200-char cap.
    const longPayload = JSON.stringify({
      a: 'x'.repeat(500),
      b: 'y'.repeat(500),
      c: 'z'.repeat(500),
      d: 'w'.repeat(500),
      e: 'v'.repeat(500),
      f: 'u'.repeat(500),
      g: 'extra',
    });
    const deps = makeFakeDeps({
      events: [
        {
          id: 'ev1',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 't',
          payloadJson: longPayload,
          createdAt: 100,
        },
      ],
    });
    const tool = buildQueryEventsTool(deps);
    const result = await tool.execute({}, makeCtx());
    const summary = result.rows[0]?.payloadSummary ?? '';
    expect(summary.length).toBeLessThanOrEqual(PAYLOAD_SUMMARY_MAX);
    expect(summary.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// query_events — H6 audit (2026-05-07): closed-enum schema for `type`
//
// The schema MUST reject any string outside `EVENT_TYPES` so that a
// model typo flips from silent-empty to a structured `invalid_args`
// tool result that the loop can show back to the model. These tests
// pin the contract independent of the LLM round-trip — directly
// `.safeParse`-ing the schema is the canonical surface, since the
// loop's tool-registry calls `tool.schema.safeParse(rawArgs)` exactly
// once before invoking `execute`.
// ---------------------------------------------------------------------------

describe('query_events — typed-enum schema (H6 audit 2026-05-07)', () => {
  it('accepts a known canonical event type literal', () => {
    const tool = buildQueryEventsTool(makeFakeDeps());
    expect(tool.schema.safeParse({ type: 'ticket.created' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'work.completed' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'agentic.completed' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'employee.hired' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'meeting.ended' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'tool.called' }).success).toBe(true);
  });

  it('accepts a runtime-audit event literal (spread member)', () => {
    // RUNTIME_AUDIT_EVENT_TYPES is spread into EVENT_TYPES — proves the
    // const tuple's spread member survives the as-const narrowing.
    const tool = buildQueryEventsTool(makeFakeDeps());
    expect(tool.schema.safeParse({ type: 'runtime.session.started' }).success).toBe(true);
    expect(tool.schema.safeParse({ type: 'runtime.execution.failed' }).success).toBe(true);
  });

  it('rejects a typo with a structured Zod issue (not silent-empty)', () => {
    const tool = buildQueryEventsTool(makeFakeDeps());
    const parsed = tool.schema.safeParse({ type: 'tikcet.created' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // Issue must be on `type` so the loop's `formatZodIssues` surfaces a
      // path-scoped error the LLM can reason about.
      const typeIssue = parsed.error.issues.find((i) => i.path[0] === 'type');
      expect(typeIssue).toBeDefined();
      expect(typeIssue?.code).toBe('invalid_enum_value');
    }
  });

  it('rejects a free-form non-event string', () => {
    const tool = buildQueryEventsTool(makeFakeDeps());
    expect(tool.schema.safeParse({ type: 'arbitrary' }).success).toBe(false);
    expect(tool.schema.safeParse({ type: '' }).success).toBe(false);
    expect(tool.schema.safeParse({ type: 'ticket' }).success).toBe(false);
  });

  it('still accepts an absent `type` (filter is optional)', () => {
    const tool = buildQueryEventsTool(makeFakeDeps());
    expect(tool.schema.safeParse({}).success).toBe(true);
    expect(tool.schema.safeParse({ since: 100 }).success).toBe(true);
    expect(tool.schema.safeParse({ limit: 10 }).success).toBe(true);
  });

  it('passes a valid type through to the repo filter and returns matches', async () => {
    const deps = makeFakeDeps({
      events: [
        {
          id: 'ev1',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'ticket.created',
          payloadJson: '{}',
          createdAt: 100,
        },
        {
          id: 'ev2',
          companyId: 'co-1',
          actorId: 'e1',
          eventType: 'agentic.completed',
          payloadJson: '{}',
          createdAt: 200,
        },
      ],
    });
    const tool = buildQueryEventsTool(deps);
    // Schema-validate first to mirror the loop's invocation path, then
    // execute on the parsed args — proves typed args flow end-to-end.
    const parsed = tool.schema.safeParse({ type: 'agentic.completed' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const result = await tool.execute(parsed.data, makeCtx());
      expect(result.rows.map((r) => r.id)).toEqual(['ev2']);
    }
  });
});

// ---------------------------------------------------------------------------
// summarizePayload helper — exported surface
// ---------------------------------------------------------------------------

describe('summarizePayload', () => {
  it('previews object keys with k=v pairs', () => {
    const summary = summarizePayload(JSON.stringify({ a: 1, b: 'two', c: true }));
    expect(summary).toContain('a=1');
    expect(summary).toContain('b=two');
    expect(summary).toContain('c=true');
  });

  it('describes arrays by length', () => {
    const summary = summarizePayload(JSON.stringify([1, 2, 3, 4]));
    expect(summary).toBe('array[4]');
  });

  it('falls back to the raw string when payload is not JSON', () => {
    const summary = summarizePayload('not valid json at all');
    expect(summary).toBe('not valid json at all');
  });

  it('truncates at PAYLOAD_SUMMARY_MAX with ellipsis', () => {
    const raw = 'x'.repeat(PAYLOAD_SUMMARY_MAX + 100);
    const summary = summarizePayload(raw);
    expect(summary.length).toBe(PAYLOAD_SUMMARY_MAX);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('handles primitive JSON (number / string / null)', () => {
    expect(summarizePayload('42')).toBe('42');
    expect(summarizePayload('"hello"')).toBe('hello');
    expect(summarizePayload('null')).toBe('null');
  });
});

// ---------------------------------------------------------------------------
// Factory + registry invariants
// ---------------------------------------------------------------------------

describe('createAgenticTools factory', () => {
  it('returns exactly six tools', () => {
    const tools = createAgenticTools(makeFakeDeps());
    expect(tools).toHaveLength(6);
  });

  it('returns tools whose names match AGENTIC_TOOL_NAMES', () => {
    const tools = createAgenticTools(makeFakeDeps());
    const names = tools.map((t) => t.name);
    expect(names).toEqual([...AGENTIC_TOOL_NAMES]);
  });

  it('returns tools with unique names (safe for ToolRegistry)', () => {
    const tools = createAgenticTools(makeFakeDeps());
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it('every tool carries a non-empty description', () => {
    const tools = createAgenticTools(makeFakeDeps());
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('every tool has a zod schema that accepts an empty object when all args are optional', () => {
    const tools = createAgenticTools(makeFakeDeps());
    // query_vault requires `query`, so skip it here.
    const optionalOnly = tools.filter((t) => t.name !== 'query_vault');
    for (const t of optionalOnly) {
      expect(t.schema.safeParse({}).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Cancellation contract — ToolRegistry's per-tool AbortController
// wraps `ctx.signal`; a pre-aborted signal must surface as a thrown
// error (the registry maps thrown errors to `kind: 'threw'`).
// ---------------------------------------------------------------------------

describe('cancellation', () => {
  it('throws "canceled" when ctx.signal is already aborted', async () => {
    const deps = makeFakeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Alice',
          title: 'CEO',
          level: 'officer',
          status: 'idle',
          isSystem: false,
        },
      ],
    });
    const tool = buildQueryEmployeesTool(deps);
    const controller = new AbortController();
    controller.abort();
    await expect(tool.execute({}, makeCtx(controller.signal))).rejects.toThrow(/canceled/);
  });
});
