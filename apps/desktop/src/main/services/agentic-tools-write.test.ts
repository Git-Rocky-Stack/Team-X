/**
 * Unit tests for `agentic-tools-write.ts` — Phase 5 — M32 — T2.
 *
 * Coverage targets (per M32 plan T2):
 *   1. Workload-score determinism (10 cases — same inputs, same outputs).
 *   2. `decompose_project` max-tickets clamp.
 *   3. `decompose_project` max-depth clamp.
 *   4. `decompose_project` approval-level gating.
 *   5. `delegate_subtask` escalation trigger on threshold.
 *   6. Role-fit extraction from a mock employee title (no `capabilities` key).
 *   7. JSON-safe envelope round-trip (no Date / Buffer / Drizzle rows).
 *   8. `buildWriteSideTools` composer — level-gated subsets.
 *   9. `delegate_subtask` fallback chain selects next available employee.
 *  10. `review_deliverable` rejects unfinished tickets.
 *  11. `review_deliverable` reject path with planId emits `task.escalated` on threshold.
 *  12. Bus emit failures are non-fatal.
 *
 * Repos are stubbed with hand-rolled fakes (mirrors `agentic-tools.test.ts`
 * discipline). The provider seam is a deterministic `WriteSideCompleteFn`
 * that returns canned JSON — no AI SDK in unit tests.
 */

import type { ToolContext } from '@team-x/intelligence';
import type { Capability, RoleSpec } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  type AgenticToolsWriteDeps,
  type DecomposedPlan,
  type DelegationResult,
  type EscalationTracker,
  PLANNER_DEFAULTS,
  type PlannerSettings,
  type ReviewResult,
  SCORING_WEIGHTS,
  type ScorerEmployee,
  type SubtaskHint,
  type WriteSideEventBus,
  type WriteSideOrchestrator,
  type WriteSideWorkloadProvider,
  buildDecomposeProjectTool,
  buildDelegateSubtaskTool,
  buildReviewDeliverableTool,
  buildWriteSideTools,
  computeRoleFit,
  createInMemoryEscalationTracker,
  defaultPlanner,
  scoreEmployee,
} from './agentic-tools-write.js';

// ---------------------------------------------------------------------------
// Shared fakes.
// ---------------------------------------------------------------------------

interface FakeEmployee {
  id: string;
  companyId: string;
  name: string;
  title: string;
  level: string;
  status: string;
  isSystem: boolean;
  roleId?: string;
}

interface FakeTicket {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  reporterId: string;
  reporterKind: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

interface FakeBusCall {
  type: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  payload: unknown;
}

interface MakeDepsOpts {
  companyId?: string;
  actorId?: string;
  actorLevel?: string;
  employees?: FakeEmployee[];
  tickets?: FakeTicket[];
  workload?: Partial<WriteSideWorkloadProvider>;
  providerText?: string;
  providerImpl?: AgenticToolsWriteDeps['providerComplete'];
  roleSpecs?: Map<string, readonly Capability[]>;
  planner?: Partial<PlannerSettings>;
  busThrows?: boolean;
}

function makeDeps(opts: MakeDepsOpts = {}): {
  deps: AgenticToolsWriteDeps;
  busCalls: FakeBusCall[];
  ticketsByCo: Map<string, FakeTicket[]>;
  links: Array<{ projectId: string; ticketId: string }>;
  ids: { next: number };
} {
  const companyId = opts.companyId ?? 'co-1';
  const actorId = opts.actorId ?? 'emp-actor';
  const actorLevel = opts.actorLevel ?? 'management';
  const employees: FakeEmployee[] = [
    {
      id: actorId,
      companyId,
      name: 'Actor Manager',
      title: 'Engineering Manager',
      level: actorLevel,
      status: 'idle',
      isSystem: false,
    },
    ...(opts.employees ?? []),
  ];
  const ticketsByCo = new Map<string, FakeTicket[]>();
  for (const t of opts.tickets ?? []) {
    const arr = ticketsByCo.get(t.companyId) ?? [];
    arr.push(t);
    ticketsByCo.set(t.companyId, arr);
  }
  const ticketIndex = new Map<string, FakeTicket>();
  for (const arr of ticketsByCo.values()) for (const t of arr) ticketIndex.set(t.id, t);

  const employeesRepo = {
    listByCompany: (cid: string) => employees.filter((e) => e.companyId === cid),
    getById: (id: string) => employees.find((e) => e.id === id) ?? null,
  } as unknown as AgenticToolsWriteDeps['employeesRepo'];

  const idCounter = { next: 1 };
  const ticketsRepo = {
    create: (input: {
      companyId: string;
      title: string;
      description?: string;
      priority?: string;
      assigneeId?: string | null;
      reporterId: string;
      reporterKind?: string;
    }) => {
      const id = `t-${idCounter.next++}`;
      const now = 1_700_000_000_000;
      const ticket: FakeTicket = {
        id,
        companyId: input.companyId,
        title: input.title,
        description: input.description ?? '',
        status: 'open',
        priority: input.priority ?? 'medium',
        assigneeId: input.assigneeId ?? null,
        reporterId: input.reporterId,
        reporterKind: input.reporterKind ?? 'user',
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      };
      const arr = ticketsByCo.get(input.companyId) ?? [];
      arr.push(ticket);
      ticketsByCo.set(input.companyId, arr);
      ticketIndex.set(id, ticket);
      return id;
    },
    assign: (id: string, assigneeId: string) => {
      const t = ticketIndex.get(id);
      if (t) {
        t.assigneeId = assigneeId;
        t.status = 'in-progress';
        t.updatedAt = 1_700_000_000_001;
      }
    },
    getById: (id: string) => ticketIndex.get(id) ?? null,
  } as unknown as AgenticToolsWriteDeps['ticketsRepo'];

  const links: Array<{ projectId: string; ticketId: string }> = [];
  const projectsRepo = {
    linkTicket: (projectId: string, ticketId: string) => {
      links.push({ projectId, ticketId });
    },
  } as unknown as AgenticToolsWriteDeps['projectsRepo'];

  const busCalls: FakeBusCall[] = [];
  const bus: WriteSideEventBus = {
    emit(input) {
      if (opts.busThrows) throw new Error('bus offline');
      busCalls.push(input as FakeBusCall);
      return undefined;
    },
  };

  const orchestrator: WriteSideOrchestrator = {
    enqueueAgentReply: vi.fn().mockResolvedValue(undefined),
    isCompanyPaused: () => false,
  };

  const providerComplete = opts.providerImpl ?? (async () => ({ text: opts.providerText ?? '[]' }));

  const workload: WriteSideWorkloadProvider = {
    openTicketCount: opts.workload?.openTicketCount ?? (() => 0),
    inMeeting: opts.workload?.inMeeting ?? (() => false),
    avgCompletionMs: opts.workload?.avgCompletionMs ?? (() => null),
  };

  const planner: PlannerSettings = { ...defaultPlanner(), ...(opts.planner ?? {}) };

  let ticker = 1_000;
  const deps: AgenticToolsWriteDeps = {
    companyId,
    actorId,
    actorKind: 'agent',
    employeesRepo,
    ticketsRepo,
    projectsRepo,
    bus,
    orchestrator,
    providerComplete,
    workload,
    roleLookup: {
      getSpec(roleId: string) {
        const capabilities = opts.roleSpecs?.get(roleId);
        if (!capabilities) return null;
        return {
          frontmatter: { capabilities },
        } as RoleSpec;
      },
    },
    getPlanner: () => planner,
    newId: () => `id-${ticker++}`,
    now: () => 1_700_000_000_000,
  };

  return { deps, busCalls, ticketsByCo, links, ids: idCounter };
}

function makeCtx(signal?: AbortSignal): ToolContext {
  return { signal: signal ?? new AbortController().signal, runId: 'test-run' };
}

// ---------------------------------------------------------------------------
// 1. Workload-score determinism — 10 round-trip cases.
// ---------------------------------------------------------------------------

describe('scoreEmployee — determinism + formula', () => {
  const baseEmp: ScorerEmployee = {
    id: 'e1',
    name: 'Engineer One',
    title: 'Senior Software Engineer',
    level: 'ic',
    status: 'idle',
    isSystem: false,
  };
  const baseHint: SubtaskHint = { title: 'Implement auth module', type: 'implement' };
  const baseCtx = { openTicketCount: 0, inMeeting: false, avgCompletionMs: null };

  it('returns identical scores across 10 repeated calls (no randomness)', () => {
    const cases = [
      { emp: baseEmp, hint: baseHint, ctx: baseCtx },
      { emp: { ...baseEmp, level: 'management' }, hint: baseHint, ctx: baseCtx },
      { emp: baseEmp, hint: baseHint, ctx: { ...baseCtx, openTicketCount: 3 } },
      { emp: baseEmp, hint: baseHint, ctx: { ...baseCtx, inMeeting: true } },
      { emp: baseEmp, hint: baseHint, ctx: { ...baseCtx, avgCompletionMs: 60_000 } },
      { emp: baseEmp, hint: { title: 'Design API', type: 'design' }, ctx: baseCtx },
      { emp: baseEmp, hint: { title: 'Write docs', type: 'document' }, ctx: baseCtx },
      { emp: { ...baseEmp, status: 'archived' }, hint: baseHint, ctx: baseCtx },
      { emp: { ...baseEmp, isSystem: true }, hint: baseHint, ctx: baseCtx },
      { emp: baseEmp, hint: baseHint, ctx: { ...baseCtx, openTicketCount: 100 } },
    ];
    for (const c of cases) {
      const first = scoreEmployee(c.emp, c.hint, c.ctx);
      for (let i = 0; i < 10; i++) {
        const next = scoreEmployee(c.emp, c.hint, c.ctx);
        expect(next).toBe(first);
      }
    }
  });

  it('weights sum to exactly 1.0', () => {
    const sum =
      SCORING_WEIGHTS.roleFit +
      SCORING_WEIGHTS.loadRatio +
      SCORING_WEIGHTS.availability +
      SCORING_WEIGHTS.pastPerformance;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('returns 0 for system agents and archived employees', () => {
    expect(scoreEmployee({ ...baseEmp, isSystem: true }, baseHint, baseCtx)).toBe(0);
    expect(scoreEmployee({ ...baseEmp, status: 'archived' }, baseHint, baseCtx)).toBe(0);
    expect(scoreEmployee({ ...baseEmp, status: 'fired' }, baseHint, baseCtx)).toBe(0);
  });

  it('availability term zeroes when employee is in a meeting', () => {
    const out = scoreEmployee(baseEmp, baseHint, baseCtx);
    const inMtg = scoreEmployee(baseEmp, baseHint, { ...baseCtx, inMeeting: true });
    expect(out).toBeGreaterThan(inMtg);
    expect(out - inMtg).toBeCloseTo(SCORING_WEIGHTS.availability, 5);
  });

  it('load-ratio penalises high open-ticket counts monotonically', () => {
    const low = scoreEmployee(baseEmp, baseHint, { ...baseCtx, openTicketCount: 0 });
    const mid = scoreEmployee(baseEmp, baseHint, { ...baseCtx, openTicketCount: 3 });
    const high = scoreEmployee(baseEmp, baseHint, { ...baseCtx, openTicketCount: 100 });
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });

  it('past-performance defaults to 0.5 when avgCompletionMs is null', () => {
    const noHistory = scoreEmployee(baseEmp, baseHint, { ...baseCtx, avgCompletionMs: null });
    const fast = scoreEmployee(baseEmp, baseHint, { ...baseCtx, avgCompletionMs: 0 });
    const slow = scoreEmployee(baseEmp, baseHint, {
      ...baseCtx,
      avgCompletionMs: PLANNER_DEFAULTS.pastPerformanceCeilingMs,
    });
    // Fast (1.0) > no-history (0.5) > slow (0).
    expect(fast).toBeGreaterThan(noHistory);
    expect(noHistory).toBeGreaterThan(slow);
  });

  it('capability role-fit changes only the locked role_fit term', () => {
    const emp: ScorerEmployee = {
      id: 'backend',
      name: 'Backend',
      title: 'No Keyword Title',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['backend_engineering'],
    };

    const score = scoreEmployee(
      emp,
      { title: 'API work', requiredCapabilities: ['backend_engineering'] },
      baseCtx,
    );

    expect(score).toBeCloseTo(0.4 * 1 + 0.3 * 1 + 0.2 * 1 + 0.1 * 0.5, 10);
  });

  it('keeps the M32 keyword score for subtasks without required capabilities', () => {
    const score = scoreEmployee(baseEmp, baseHint, baseCtx);

    expect(score).toBeCloseTo(0.4 * 0.9 + 0.3 * 1 + 0.2 * 1 + 0.1 * 0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// 6. Role-fit extraction from a mock employee title.
// ---------------------------------------------------------------------------

describe('computeRoleFit — title heuristic (no capabilities key)', () => {
  it('matches engineer titles to implement subtasks above baseline', () => {
    const emp: ScorerEmployee = {
      id: 'e2',
      name: 'A',
      title: 'Senior Software Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
    };
    const fit = computeRoleFit(emp, { title: 'Implement payment flow', type: 'implement' });
    expect(fit).toBeGreaterThan(0.5);
    expect(fit).toBeLessThanOrEqual(1);
  });

  it('returns level baseline when no keywords match', () => {
    const emp: ScorerEmployee = {
      id: 'e3',
      name: 'A',
      title: 'Office Manager',
      level: 'management',
      status: 'idle',
      isSystem: false,
    };
    const fit = computeRoleFit(emp, { title: 'Build CI pipeline', type: 'implement' });
    // Management baseline is 0.55, no engineer keyword in 'Office Manager' for 'implement'.
    // (Matches "manager" only for the 'review' bucket, not 'implement'.)
    expect(fit).toBe(0.55);
  });

  it('returns 0 for the system agent', () => {
    const emp: ScorerEmployee = {
      id: 'sys',
      name: 'Copilot',
      title: 'System Agent',
      level: 'system',
      status: 'idle',
      isSystem: true,
    };
    expect(computeRoleFit(emp, { title: 'anything', type: 'implement' })).toBe(0);
  });
});

describe('computeRoleFit — capabilities v2', () => {
  it('returns 1.0 when employee capabilities exactly cover required capabilities', () => {
    const emp: ScorerEmployee = {
      id: 'backend',
      name: 'Backend',
      title: 'Office Generalist',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['backend_engineering', 'api_design'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Build service contract',
        type: 'implement',
        requiredCapabilities: ['backend_engineering', 'api_design'],
      }),
    ).toBe(1);
  });

  it('uses Jaccard overlap for partial capability matches', () => {
    const emp: ScorerEmployee = {
      id: 'fullstack',
      name: 'Fullstack',
      title: 'Senior Fullstack Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['backend_engineering', 'api_design'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Build typed UI client',
        requiredCapabilities: ['frontend_engineering', 'api_design'],
      }),
    ).toBeCloseTo(1 / 3, 10);
  });

  it('falls back to the M32 keyword heuristic when required capabilities are absent', () => {
    const emp: ScorerEmployee = {
      id: 'legacy',
      name: 'Legacy',
      title: 'Senior Software Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['content_marketing'],
    };

    expect(
      computeRoleFit(emp, { title: 'Implement auth module', type: 'implement' }),
    ).toBeGreaterThan(0.5);
  });

  it('falls back to the M32 keyword heuristic when required capabilities are empty', () => {
    const emp: ScorerEmployee = {
      id: 'legacy-empty',
      name: 'Legacy Empty',
      title: 'Senior Software Engineer',
      level: 'ic',
      status: 'idle',
      isSystem: false,
      capabilities: ['content_marketing'],
    };

    expect(
      computeRoleFit(emp, {
        title: 'Implement auth module',
        type: 'implement',
        requiredCapabilities: [],
      }),
    ).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// 2 + 3 + 4. decompose_project — clamps + approval gate.
// ---------------------------------------------------------------------------

describe('decompose_project', () => {
  it('clamps subtasks to planner_max_tickets and emits truncated=true', async () => {
    // Provider returns 12 subtasks; planner cap is 5.
    const subtasks = Array.from({ length: 12 }, (_, i) => ({
      title: `Task ${i + 1}`,
      description: 'desc',
      complexity: 'M',
      dependsOn: [],
    }));
    const { deps, busCalls } = makeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Eng',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
      ],
      providerText: JSON.stringify(subtasks),
      planner: { maxTickets: 5 },
    });
    const tool = buildDecomposeProjectTool(deps);
    const result = (await tool.execute({ brief: 'Big launch' }, makeCtx())) as DecomposedPlan;
    expect(result.subtasks.length).toBe(5);
    expect(result.truncated).toBe(true);
    expect(busCalls.length).toBe(1);
    expect(busCalls[0].type).toBe('plan.proposed');
  });

  it('rejects requests at or above planner_max_depth', async () => {
    const { deps } = makeDeps({ planner: { maxDepth: 2 } });
    const tool = buildDecomposeProjectTool(deps);
    const result = await tool.execute({ brief: 'b', depth: 2 }, makeCtx());
    expect(result).toEqual(expect.objectContaining({ error: 'planner_max_depth_exceeded' }));
  });

  it('rejects when actor level is below planner_approval_level', async () => {
    const { deps } = makeDeps({
      actorLevel: 'ic',
      planner: { approvalLevel: 'management' },
    });
    const tool = buildDecomposeProjectTool(deps);
    const result = await tool.execute({ brief: 'b' }, makeCtx());
    expect(result).toEqual(expect.objectContaining({ error: 'planner_approval_level_blocked' }));
  });

  it('returns a JSON-safe envelope (no Date / Buffer / Drizzle row leaks)', async () => {
    const subtasks = [
      { title: 'A', description: 'a', complexity: 'S', dependsOn: [] },
      { title: 'B', description: 'b', complexity: 'M', dependsOn: [0] },
    ];
    const { deps } = makeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Eng',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
      ],
      providerText: JSON.stringify(subtasks),
    });
    const tool = buildDecomposeProjectTool(deps);
    const result = (await tool.execute({ brief: 'x' }, makeCtx())) as DecomposedPlan;
    // JSON round-trip must succeed without loss.
    const json = JSON.stringify(result);
    const back = JSON.parse(json);
    expect(back.subtasks.length).toBe(2);
    expect(back.subtasks[0].title).toBe('A');
    expect(back.subtasks[1].dependsOn).toEqual([0]);
  });

  it('passes requiredCapabilities from provider output into role-fit scoring', async () => {
    const subtasks = [
      {
        title: 'Backend API',
        description: 'Build API',
        complexity: 'M',
        dependsOn: [],
        requiredCapabilities: ['backend_engineering', 'api_design'],
      },
    ];
    const roleSpecs = new Map<string, readonly Capability[]>([
      ['backend-developer', ['backend_engineering', 'api_design']],
      ['content-strategist', ['content_marketing']],
    ]);
    const { deps } = makeDeps({
      employees: [
        {
          id: 'backend',
          companyId: 'co-1',
          name: 'Backend Dev',
          title: 'Generalist',
          level: 'ic',
          status: 'idle',
          isSystem: false,
          roleId: 'backend-developer',
        },
        {
          id: 'content',
          companyId: 'co-1',
          name: 'Content',
          title: 'Senior Software Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
          roleId: 'content-strategist',
        },
      ],
      providerText: JSON.stringify(subtasks),
      roleSpecs,
    });

    const tool = buildDecomposeProjectTool(deps);
    const result = (await tool.execute({ brief: 'Build API' }, makeCtx())) as DecomposedPlan;

    expect(result.subtasks[0]?.assigneeId).toBe('backend');
  });

  it('drops invalid provider-required capabilities before scoring', async () => {
    const roleSpecs = new Map<string, readonly Capability[]>([
      ['backend-developer', ['backend_engineering']],
    ]);
    const { deps } = makeDeps({
      employees: [
        {
          id: 'backend',
          companyId: 'co-1',
          name: 'Backend Dev',
          title: 'Office Generalist',
          level: 'ic',
          status: 'idle',
          isSystem: false,
          roleId: 'backend-developer',
        },
      ],
      providerText: JSON.stringify([
        {
          title: 'Backend API',
          description: 'Build API',
          complexity: 'M',
          dependsOn: [],
          requiredCapabilities: ['backend_engineering', 'not_real'],
        },
      ]),
      roleSpecs,
    });

    const tool = buildDecomposeProjectTool(deps);
    const result = (await tool.execute({ brief: 'Build API' }, makeCtx())) as DecomposedPlan;

    expect(result.subtasks[0]?.assigneeId).toBe('backend');
    expect(result.subtasks[0]?.assigneeScore).toBeCloseTo(0.95, 10);
  });
});

// ---------------------------------------------------------------------------
// 5 + 9. delegate_subtask — escalation + fallback.
// ---------------------------------------------------------------------------

describe('delegate_subtask', () => {
  function setup(opts?: { tracker?: EscalationTracker; planner?: Partial<PlannerSettings> }) {
    return makeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Primary',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
        {
          id: 'e2',
          companyId: 'co-1',
          name: 'Fallback',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
      ],
      planner: opts?.planner,
    });
  }

  it('creates the ticket and emits task.delegated on the happy path', async () => {
    const { deps, busCalls } = setup();
    const tool = buildDelegateSubtaskTool(deps);
    const result = (await tool.execute(
      { planId: 'p1', subtaskTitle: 'Build auth', assigneeId: 'e1' },
      makeCtx(),
    )) as DelegationResult;
    expect(result.ticketId).toMatch(/^t-/);
    expect(result.assigneeId).toBe('e1');
    expect(result.status).toBe('created');
    expect(result.fallbackUsed).toBe(false);
    expect(busCalls.some((c) => c.type === 'task.delegated')).toBe(true);
  });

  it('falls back to next assignee when the primary is over the load cap', async () => {
    const { deps, busCalls } = makeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Overloaded',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
        {
          id: 'e2',
          companyId: 'co-1',
          name: 'Available',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
      ],
      workload: {
        // e1 has way more than 2× loadDenominator open tickets.
        openTicketCount: (id: string) => (id === 'e1' ? 100 : 0),
      },
    });
    const tool = buildDelegateSubtaskTool(deps);
    const result = (await tool.execute(
      {
        planId: 'p1',
        subtaskTitle: 'Build auth',
        assigneeId: 'e1',
        fallbackAssigneeIds: ['e2'],
      },
      makeCtx(),
    )) as DelegationResult;
    expect(result.assigneeId).toBe('e2');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attemptCount).toBe(2);
    expect(busCalls.some((c) => c.type === 'task.delegated')).toBe(true);
  });

  it('emits task.escalated when failure counter hits planner_escalation_threshold', async () => {
    const { deps, busCalls } = makeDeps({
      employees: [],
      planner: { escalationThreshold: 2 },
    });
    const tool = buildDelegateSubtaskTool(deps);
    // Three failed delegations to the same plan.
    for (let i = 0; i < 3; i++) {
      await tool.execute(
        { planId: 'p-escalate', subtaskTitle: 'x', assigneeId: 'missing' },
        makeCtx(),
      );
    }
    const escalations = busCalls.filter((c) => c.type === 'task.escalated');
    expect(escalations.length).toBeGreaterThanOrEqual(1);
  });

  it('links the ticket to a parent project when parentProjectId is supplied', async () => {
    const { deps, links } = setup();
    const tool = buildDelegateSubtaskTool(deps);
    const result = (await tool.execute(
      {
        planId: 'p1',
        subtaskTitle: 'Build auth',
        assigneeId: 'e1',
        parentProjectId: 'proj-1',
      },
      makeCtx(),
    )) as DelegationResult;
    expect(links).toContainEqual({ projectId: 'proj-1', ticketId: result.ticketId });
  });
});

// ---------------------------------------------------------------------------
// 10 + 11. review_deliverable — guards + escalation.
// ---------------------------------------------------------------------------

describe('review_deliverable', () => {
  it('rejects tickets that are not in done status', async () => {
    const { deps } = makeDeps({
      tickets: [
        {
          id: 't-open',
          companyId: 'co-1',
          title: 'WIP',
          description: '',
          status: 'in-progress',
          priority: 'medium',
          assigneeId: 'emp-actor',
          reporterId: 'emp-actor',
          reporterKind: 'user',
          createdAt: 0,
          updatedAt: 0,
          closedAt: null,
        },
      ],
    });
    const tool = buildReviewDeliverableTool(deps);
    const result = await tool.execute({ ticketId: 't-open', action: 'approve' }, makeCtx());
    expect(result).toEqual(expect.objectContaining({ error: 'ticket_not_done' }));
  });

  it('emits review.requested + review.completed on the happy path', async () => {
    const { deps, busCalls } = makeDeps({
      providerText: 'Looks great. Approving with minor notes.',
      tickets: [
        {
          id: 't-done',
          companyId: 'co-1',
          title: 'Auth complete',
          description: 'PR #123',
          status: 'done',
          priority: 'medium',
          assigneeId: 'emp-actor',
          reporterId: 'emp-actor',
          reporterKind: 'user',
          createdAt: 0,
          updatedAt: 0,
          closedAt: 0,
        },
      ],
    });
    const tool = buildReviewDeliverableTool(deps);
    const result = (await tool.execute(
      { ticketId: 't-done', action: 'approve' },
      makeCtx(),
    )) as ReviewResult;
    expect(result.outcome).toBe('approved');
    expect(busCalls.find((c) => c.type === 'review.requested')).toBeDefined();
    expect(busCalls.find((c) => c.type === 'review.completed')).toBeDefined();
  });

  it('emits task.escalated when reject crosses the escalation threshold', async () => {
    const tracker = createInMemoryEscalationTracker();
    // Pre-seed 2 failures so the first reject crosses threshold=3.
    tracker.recordFailure('p-x');
    tracker.recordFailure('p-x');
    const { deps, busCalls } = makeDeps({
      providerText: 'Rejected.',
      tickets: [
        {
          id: 't-done',
          companyId: 'co-1',
          title: 'Bad work',
          description: '',
          status: 'done',
          priority: 'medium',
          assigneeId: 'emp-actor',
          reporterId: 'emp-actor',
          reporterKind: 'user',
          createdAt: 0,
          updatedAt: 0,
          closedAt: 0,
        },
      ],
      planner: { escalationThreshold: 3 },
    });
    deps.escalationTracker = tracker;
    const tool = buildReviewDeliverableTool(deps);
    const result = (await tool.execute(
      { ticketId: 't-done', action: 'reject', planId: 'p-x' },
      makeCtx(),
    )) as ReviewResult;
    expect(result.escalated).toBe(true);
    expect(busCalls.find((c) => c.type === 'task.escalated')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. buildWriteSideTools — composer level gating.
// ---------------------------------------------------------------------------

describe('buildWriteSideTools — composer', () => {
  function depsFor(_level: string) {
    return makeDeps().deps;
  }

  it('returns empty array for ICs', () => {
    expect(buildWriteSideTools({ level: 'ic' }, depsFor('ic'))).toEqual([]);
  });

  it('returns decompose only for Officer / Senior Mgmt', () => {
    const officer = buildWriteSideTools({ level: 'officer' }, depsFor('officer'));
    const sm = buildWriteSideTools({ level: 'senior-management' }, depsFor('senior-management'));
    expect(officer.map((t) => t.name)).toEqual(['decompose_project']);
    expect(sm.map((t) => t.name)).toEqual(['decompose_project']);
  });

  it('returns delegate + review for Supervisor / Lead', () => {
    const sup = buildWriteSideTools({ level: 'supervisor' }, depsFor('supervisor'));
    const lead = buildWriteSideTools({ level: 'lead' }, depsFor('lead'));
    expect(sup.map((t) => t.name)).toEqual(['delegate_subtask', 'review_deliverable']);
    expect(lead.map((t) => t.name)).toEqual(['delegate_subtask', 'review_deliverable']);
  });

  it('returns all three for Management and the system agent', () => {
    const mgmt = buildWriteSideTools({ level: 'management' }, depsFor('management'));
    const sys = buildWriteSideTools({ level: 'system' }, depsFor('system'));
    expect(mgmt.map((t) => t.name)).toEqual([
      'decompose_project',
      'delegate_subtask',
      'review_deliverable',
    ]);
    expect(sys.map((t) => t.name)).toEqual([
      'decompose_project',
      'delegate_subtask',
      'review_deliverable',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 12. Bus emit failures are non-fatal.
// ---------------------------------------------------------------------------

describe('bus emit failures', () => {
  it('does not throw when bus.emit throws on plan.proposed', async () => {
    const { deps } = makeDeps({
      employees: [
        {
          id: 'e1',
          companyId: 'co-1',
          name: 'Eng',
          title: 'Engineer',
          level: 'ic',
          status: 'idle',
          isSystem: false,
        },
      ],
      providerText: '[{"title":"A","description":"a","complexity":"S","dependsOn":[]}]',
      busThrows: true,
    });
    const tool = buildDecomposeProjectTool(deps);
    await expect(tool.execute({ brief: 'b' }, makeCtx())).resolves.toBeDefined();
  });
});
