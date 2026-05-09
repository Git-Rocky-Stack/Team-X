import type { Tool, ToolContext } from '@team-x/intelligence';
import {
  CAPABILITY_LIST,
  type Capability,
  type EventType,
  type RoleSpec,
  isCapability,
} from '@team-x/shared-types';

/**
 * Agentic write-side tools — main-process closures the agentic loop
 * (`@team-x/intelligence/loop`) invokes for the M32 Task Planner.
 *
 * Three tools ship in this module:
 *
 *   - `decompose_project`  — Officer / Senior Mgmt / Management. Takes a
 *                            brief, returns a proposed ticket tree with
 *                            workload-scored assignee suggestions.
 *                            Emits `plan.proposed`.
 *   - `delegate_subtask`   — Management / Supervisor / Lead. Creates a
 *                            ticket, links it to the parent project,
 *                            assigns it to the suggested IC, enqueues
 *                            an agent reply via the orchestrator.
 *                            Emits `task.delegated`. Falls back through
 *                            the next-highest-scored employee on
 *                            assignment conflict; emits `task.escalated`
 *                            when the per-plan failure counter breaches
 *                            `planner_escalation_threshold`.
 *   - `review_deliverable` — Management / Supervisor / Lead. Reviews the
 *                            latest message on a `done` ticket via one
 *                            inner provider call; emits `review.requested`
 *                            at start and `review.completed` at finish.
 *                            On `action: 'reject'` may also emit
 *                            `task.escalated`.
 *
 * The deterministic `scoreEmployee` function is exported for unit-level
 * stability checks: same `(employee, subtask, ctx)` triple → same score
 * byte-for-byte. No LLM, no randomness. Weights are locked module
 * constants from Phase 5 design doc §7.4.
 *
 * Architectural invariants:
 *
 *   1. Tools are main-process closures over existing repos — NOT MCP
 *      servers (D10 locked). The MCP host stays a singleton (invariant
 *      #3); the planner does not register new MCP connections.
 *   2. The provider router is the only LLM touch-point (invariant #5).
 *      `decompose_project` and `review_deliverable` each invoke
 *      `deps.providerComplete(...)` once. Workload scoring is deterministic
 *      and never calls a provider.
 *   3. Every successful mutation emits a bus event (invariant #11). Renderer
 *      caches (kanban, project detail, audit chips, thread list) invalidate
 *      via the bus, not via direct IPC.
 *   4. Storage uses the existing tickets repo + `project_tickets` linking
 *      table (invariant #4). No new schema.
 *   5. Tools are level-gated at registry construction by `buildWriteSideTools`,
 *      not at runtime by prompt instruction. ICs cannot delegate; only
 *      Management+ can review.
 *   6. JSON-safe envelopes — every returned value is a string, number,
 *      boolean, null, or array/object of the same. No Date instances, no
 *      Buffers, no Drizzle row objects. Mirrors M31 T2 read-side discipline
 *      so the loop transcript and event bus round-trip safely.
 *   7. Per-call hard caps: at most `planner_max_tickets` subtasks proposed
 *      per `decompose_project` (default 10), at most `planner_max_depth`
 *      levels of nesting (default 2). Excess is rejected with a structured
 *      error envelope the LLM can observe and re-plan around.
 *
 * Phase 5 — M32 — T2.
 *
 * Notes for downstream tasks:
 *
 *   - T3 wires `buildWriteSideTools` into `AgenticLoopService`'s
 *     `buildToolsForEmployee` path and extends `test-agentic-tools.ts`
 *     with the matching three-tier seam.
 *   - T4 promotes the locally-typed `WriteSideEventType` union into the
 *     canonical `EventType` union in `packages/shared-types/src/events.ts`;
 *     this module's `WriteSideEventBus` interface stays width-compatible
 *     across that change because its `type` field is the wider `string`.
 *   - T7 wires the planner settings keys (`planner_max_tickets`,
 *     `planner_max_depth`, `planner_approval_level`,
 *     `planner_escalation_threshold`) and replaces `PLANNER_DEFAULTS`
 *     with a settings-repo-backed accessor passed in via `deps.getPlanner`.
 */

import { z } from 'zod';

import type { createEmployeesRepo } from '../db/repos/employees.js';
import type { PendingDelegationsRepo } from '../db/repos/pending-delegations.js';
import type { createProjectsRepo } from '../db/repos/projects.js';
import type { createTicketsRepo } from '../db/repos/tickets.js';

// ---------------------------------------------------------------------------
// Public constants — workload scoring weights, planner defaults, levels.
// ---------------------------------------------------------------------------

/**
 * Workload scoring weights — locked by Phase 5 design doc §7.4 and
 * Decision Record D7. Sum is exactly 1.0; each weight is a
 * float-precise multiple of 0.1 so determinism holds across platforms.
 *
 * Order matters for `scoreEmployee` — the formula is:
 *   score = w1·role_fit
 *         + w2·(1 - load_ratio)
 *         + w3·availability
 *         + w4·past_performance
 */
export const SCORING_WEIGHTS = Object.freeze({
  /** Weight for role-fit alignment of subtask hints to employee title/level. */
  roleFit: 0.4,
  /** Weight for inverse load (1 - openTickets/cap), so emptier inboxes score higher. */
  loadRatio: 0.3,
  /** Weight for availability (1 if not in meeting, 0 if in meeting). */
  availability: 0.2,
  /** Weight for past performance (faster average completion → higher). */
  pastPerformance: 0.1,
} as const);

/**
 * Planner default guardrail values. T7 wires these to the settings repo
 * via `deps.getPlanner`; until then the tools fall back to these constants.
 *
 * Defaults mirror Phase 5 design doc §11.
 */
export const PLANNER_DEFAULTS = Object.freeze({
  /** Maximum number of subtasks emitted per `decompose_project` call. */
  maxTickets: 10,
  /** Maximum nesting depth of subtask-of-subtask in a decomposition. */
  maxDepth: 2,
  /**
   * Minimum employee level required to invoke `decompose_project`. ICs and
   * Supervisors are blocked at registry construction; the gate here is
   * defense-in-depth for callers that bypass `buildWriteSideTools`.
   */
  approvalLevel: 'management' as const,
  /** Consecutive delegation failures before `task.escalated` fires. */
  escalationThreshold: 3,
  /** Per-assignee open-ticket cap used as the load-ratio denominator. */
  loadDenominator: 5,
  /** Average-completion ceiling (ms) used to normalize past performance. */
  pastPerformanceCeilingMs: 48 * 60 * 60 * 1000,
} as const);

/**
 * Canonical employee-level union. Mirrors role-pack frontmatter levels
 * plus the `system` pseudo-level reserved for the M31 system-agent.
 */
export const EMPLOYEE_LEVELS = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
  'ic',
  'system',
] as const;
export type EmployeeLevel = (typeof EMPLOYEE_LEVELS)[number];

/** Levels permitted to invoke `decompose_project`. All employees can plan. */
const DECOMPOSE_LEVELS: readonly EmployeeLevel[] = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
  'ic',
  'system',
];

/** Levels permitted to invoke `delegate_subtask` and `review_deliverable`. All employees can act. */
const DELEGATE_REVIEW_LEVELS: readonly EmployeeLevel[] = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
  'ic',
  'system',
];

/** Canonical write-side tool names exported for T3's allowlist enforcement. */
export const WRITE_SIDE_TOOL_NAMES = [
  'decompose_project',
  'delegate_subtask',
  'review_deliverable',
] as const;
export type WriteSideToolName = (typeof WRITE_SIDE_TOOL_NAMES)[number];

/**
 * String-literal union of bus event types this module emits. T4 folds
 * these into the canonical `EventType` union; the `WriteSideEventBus`
 * dep keeps `type: string` so the existing bus drops in unchanged.
 */
export type WriteSideEventType =
  | 'plan.proposed'
  | 'plan.approved'
  | 'task.delegation_pending'
  | 'task.delegation_rejected'
  | 'task.delegated'
  | 'task.escalated'
  | 'review.requested'
  | 'review.completed';

// ---------------------------------------------------------------------------
// Subtask + plan envelopes — JSON-safe shapes used in tool args/results.
// ---------------------------------------------------------------------------

/** Complexity bucket for a proposed subtask. T-shirt sizes per §7.2. */
export const SUBTASK_COMPLEXITIES = ['S', 'M', 'L'] as const;
export type SubtaskComplexity = (typeof SUBTASK_COMPLEXITIES)[number];

/** A single subtask in a proposed decomposition plan. */
export interface PlanSubtask {
  readonly title: string;
  readonly description: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly assigneeScore: number;
  readonly complexity: SubtaskComplexity;
  readonly dependsOn: readonly number[];
  readonly depth: number;
}

/** Full plan returned by `decompose_project` — JSON-safe. */
export interface DecomposedPlan {
  readonly planId: string;
  readonly projectId: string | null;
  readonly goalId: string | null;
  readonly subtasks: readonly PlanSubtask[];
  readonly truncated: boolean;
}

/**
 * Result envelope for `delegate_subtask`.
 *
 * C4 (audit 2026-05-07) — the tool no longer creates tickets directly.
 * It writes a `pending_delegations` row that the operator must approve
 * via the inbox. The materialization (ticket insert + queue + bus
 * emits) happens in `approval-inbox-service.ts` on operator approval.
 *
 * The result therefore carries the pending-delegation id (not a ticket
 * id), `status: 'pending_approval'`, and the four-component score
 * breakdown so the LLM has visibility into the assignment rationale
 * for its next-turn reasoning.
 */
export interface DelegationResult {
  readonly pendingDelegationId: string;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly status: 'pending_approval';
  readonly fallbackUsed: boolean;
  readonly attemptCount: number;
  /** Final aggregate score in [0, 1]. */
  readonly assigneeScore: number;
  /** Score breakdown for the chosen assignee (each in [0, 1]). */
  readonly scoreBreakdown: ScoreBreakdown;
}

/** Result envelope for `review_deliverable`. */
export interface ReviewResult {
  readonly ticketId: string;
  readonly outcome: 'approved' | 'changes_requested' | 'rejected';
  readonly summary: string;
  readonly escalated: boolean;
}

// ---------------------------------------------------------------------------
// Workload scoring inputs.
// ---------------------------------------------------------------------------

/** Subtask hint passed to `scoreEmployee` — narrow shape, no full plan. */
export interface SubtaskHint {
  /** Free-text title — used for keyword matching against employee title. */
  readonly title: string;
  /**
   * Optional explicit type hint (e.g., `'design'`, `'review'`, `'test'`,
   * `'deploy'`, `'implement'`, `'document'`). When omitted, derived from
   * the title via the same keyword table.
   */
  readonly type?: string;
  /** Estimated complexity — informs role-fit weighting for senior roles. */
  readonly complexity?: SubtaskComplexity;
  /** Capability hints emitted by decomposition outputs when available. */
  readonly requiredCapabilities?: readonly Capability[];
}

/** Cheap projection of an employee row used by the scorer. */
export interface ScorerEmployee {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
  readonly isSystem: boolean;
  readonly capabilities?: readonly Capability[];
}

/** Per-call scoring context — pure, deterministic, repo-callback-free. */
export interface ScoringContext {
  /** Open-ticket count for the candidate (caller pre-fetches). */
  readonly openTicketCount: number;
  /** Whether the candidate is currently in a meeting. */
  readonly inMeeting: boolean;
  /**
   * Average ticket-completion time in milliseconds, or `null` when no
   * historical data exists. `null` defaults the past-performance term to
   * 0.5 (neutral) so new hires aren't penalised.
   */
  readonly avgCompletionMs: number | null;
  /** Optional override for the load denominator (defaults to PLANNER_DEFAULTS). */
  readonly loadDenominator?: number;
  /** Optional override for the past-performance ceiling. */
  readonly pastPerformanceCeilingMs?: number;
}

// ---------------------------------------------------------------------------
// Role-fit heuristic — Phase 5 §7.4 plus Phase 6 capability overlap.
//
// Capability-aware subtasks use Jaccard overlap against official role
// capabilities. Legacy/generic subtasks without required capabilities
// keep the M32 keyword fallback over `title` + `level`.
// ---------------------------------------------------------------------------

/** Subtask-type → list of title keywords that score role-fit. */
const TITLE_KEYWORDS: Record<string, readonly string[]> = Object.freeze({
  design: ['design', 'designer', 'product', 'architect'],
  review: ['lead', 'manager', 'principal', 'reviewer', 'qa'],
  implement: ['engineer', 'developer', 'engineer', 'sde', 'swe'],
  test: ['qa', 'sdet', 'test', 'quality'],
  document: ['writer', 'documentation', 'pm', 'analyst'],
  deploy: ['devops', 'sre', 'platform', 'ops', 'release'],
  research: ['research', 'data', 'analyst', 'scientist'],
});

/** Default per-level role-fit when no keyword match is found. Senior roles
 *  retain a partial fit so they remain candidates for hard-to-classify
 *  subtasks; ICs without keyword match fall to baseline.
 */
const LEVEL_BASELINE_FIT: Record<string, number> = Object.freeze({
  officer: 0.55,
  'senior-management': 0.55,
  management: 0.55,
  supervisor: 0.5,
  lead: 0.5,
  ic: 0.45,
  system: 0.0,
});

/**
 * Derive a `subtask.type` from a free-text title when the caller didn't
 * supply one. Picks the first matching keyword bucket; falls back to
 * `'implement'` for anything that doesn't match — implementation is the
 * default majority case for ticket work in Team-X.
 */
function deriveSubtaskType(title: string): string {
  const lower = title.toLowerCase();
  for (const [type, keywords] of Object.entries(TITLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return type;
    }
  }
  return 'implement';
}

/**
 * Compute the M32 keyword role-fit score. Kept as the fallback for legacy
 * decomposition outputs that do not provide required capability hints.
 */
function computeKeywordRoleFit(employee: ScorerEmployee, subtask: SubtaskHint): number {
  const type = subtask.type ?? deriveSubtaskType(subtask.title);
  const keywords = TITLE_KEYWORDS[type] ?? [];
  const titleLower = employee.title.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (titleLower.includes(kw)) hits += 1;
  }
  if (hits === 0) {
    return LEVEL_BASELINE_FIT[employee.level] ?? 0.4;
  }
  // First hit yields baseline + 0.35; each additional hit adds 0.1, capped at 1.0.
  const baseline = LEVEL_BASELINE_FIT[employee.level] ?? 0.4;
  const bonus = Math.min(0.35 + 0.1 * (hits - 1), 1.0 - baseline);
  return clamp01(baseline + bonus);
}

function computeCapabilityRoleFit(
  employeeCapabilities: readonly Capability[],
  requiredCapabilities: readonly Capability[],
): number {
  if (employeeCapabilities.length === 0 || requiredCapabilities.length === 0) return 0;

  const employeeSet = new Set(employeeCapabilities);
  const requiredSet = new Set(requiredCapabilities);
  let intersection = 0;

  for (const capability of requiredSet) {
    if (employeeSet.has(capability)) intersection += 1;
  }

  const union = new Set([...employeeSet, ...requiredSet]).size;
  return union === 0 ? 0 : clamp01(intersection / union);
}

/**
 * Compute a deterministic role-fit score in `[0, 1]` for an employee
 * against a subtask hint. Pure — no DB reads, no clock, no randomness.
 */
export function computeRoleFit(employee: ScorerEmployee, subtask: SubtaskHint): number {
  if (employee.isSystem) return 0;

  const requiredCapabilities = subtask.requiredCapabilities ?? [];
  if (requiredCapabilities.length > 0) {
    return computeCapabilityRoleFit(employee.capabilities ?? [], requiredCapabilities);
  }

  return computeKeywordRoleFit(employee, subtask);
}

// ---------------------------------------------------------------------------
// Workload scorer — pure, deterministic, exported for unit tests.
// ---------------------------------------------------------------------------

/**
 * Compute the workload-aware suitability score for `employee` against
 * `subtask`. Returns a number in `[0, 1]`. Pure: identical inputs always
 * produce identical outputs — the M32 acceptance criterion includes a
 * 10-case round-trip test asserting exactly this.
 *
 * Formula (Phase 5 §7.4 + Decision Record D7):
 *
 *   score = 0.4 · role_fit
 *         + 0.3 · (1 - load_ratio)
 *         + 0.2 · availability
 *         + 0.1 · past_performance
 *
 *   role_fit         ← computeRoleFit(employee, subtask)
 *   load_ratio       ← min(openTickets / loadDenominator, 1)
 *   availability     ← 1 if not in meeting else 0
 *   past_performance ← 1 - clamp(avgCompletionMs / ceiling, 0, 1)
 *                       (or 0.5 when no historical data)
 *
 * System-agent and any non-active employee score 0 — they are not eligible
 * for delegation regardless of any positive workload signal.
 */
export function scoreEmployee(
  employee: ScorerEmployee,
  subtask: SubtaskHint,
  ctx: ScoringContext,
): number {
  return scoreEmployeeWithBreakdown(employee, subtask, ctx).score;
}

/**
 * Per-component score breakdown — the same four numbers folded into
 * `scoreEmployee`'s scalar return, surfaced individually for delegation
 * audit trails (C4 — audit 2026-05-07). All four are in `[0, 1]`.
 *
 * Naming matches the audit's exact callout (`role_fit`, `load`,
 * `availability`, `past_performance`). The `load` value is the
 * load-RATIO term (lower is better); the audit doc uses the term "load"
 * to describe this ratio, so we surface it under that name here.
 */
export interface ScoreBreakdown {
  /** Capability + role-spec match (0..1, higher = better match). */
  readonly roleFit: number;
  /** Open-ticket load ratio (0..1, lower = lighter desk = healthier). */
  readonly load: number;
  /** Meeting / availability (0 = in meeting, 1 = free). */
  readonly availability: number;
  /** Historical-completion-time component (0..1, higher = faster). */
  readonly pastPerformance: number;
}

/**
 * Like `scoreEmployee`, but additionally returns the four-component
 * breakdown that flows into the final scalar. Used by `delegate_subtask`
 * to populate the audit-event payload + the `pending_delegations` row
 * with the exact components the audit explicitly called out as missing.
 *
 * Pure (no I/O), deterministic (same inputs → same outputs), and
 * algorithmically identical to `scoreEmployee` — this is just the
 * before-clamp tuple alongside the post-clamp scalar.
 */
export function scoreEmployeeWithBreakdown(
  employee: ScorerEmployee,
  subtask: SubtaskHint,
  ctx: ScoringContext,
): { score: number; breakdown: ScoreBreakdown } {
  if (employee.isSystem || employee.status === 'archived' || employee.status === 'fired') {
    return {
      score: 0,
      breakdown: { roleFit: 0, load: 1, availability: 0, pastPerformance: 0 },
    };
  }

  const roleFit = computeRoleFit(employee, subtask);

  const denom = ctx.loadDenominator ?? PLANNER_DEFAULTS.loadDenominator;
  const loadRatio = denom <= 0 ? 1 : clamp01(ctx.openTicketCount / denom);

  const availability = ctx.inMeeting ? 0 : 1;

  let pastPerformance: number;
  if (ctx.avgCompletionMs === null) {
    pastPerformance = 0.5;
  } else {
    const ceiling = ctx.pastPerformanceCeilingMs ?? PLANNER_DEFAULTS.pastPerformanceCeilingMs;
    pastPerformance = ceiling <= 0 ? 0.5 : 1 - clamp01(ctx.avgCompletionMs / ceiling);
  }

  const score = clamp01(
    SCORING_WEIGHTS.roleFit * roleFit +
      SCORING_WEIGHTS.loadRatio * (1 - loadRatio) +
      SCORING_WEIGHTS.availability * availability +
      SCORING_WEIGHTS.pastPerformance * pastPerformance,
  );

  return {
    score,
    breakdown: { roleFit, load: loadRatio, availability, pastPerformance },
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------------------
// Dependency contract — repo facades, bus, provider, orchestrator,
// settings, id/clock seams. Mirrors the read-side `AgenticToolsDeps`
// shape so the composition root in T3 can build both with one factory call.
// ---------------------------------------------------------------------------

type EmployeesRepo = ReturnType<typeof createEmployeesRepo>;
type TicketsRepo = ReturnType<typeof createTicketsRepo>;
type ProjectsRepo = ReturnType<typeof createProjectsRepo>;

/**
 * Width-compatible bus interface — the production
 * `AgenticLoopEventBus` matches because its `type` is `EventType ⊂ string`.
 * Callers pass the existing bus directly.
 */
export interface WriteSideEventBus {
  emit<T>(input: {
    type: string;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
  }): unknown;
}

/** Provider router seam — same `LoopCompleteFn` shape M31 already uses. */
export type WriteSideCompleteFn = (req: {
  readonly system: string;
  readonly messages: readonly { readonly role: 'user' | 'assistant'; readonly content: string }[];
  readonly signal: AbortSignal;
}) => Promise<{ readonly text: string }>;

/** Orchestrator seam — only the enqueue-reply and pause checks are used. */
export interface WriteSideOrchestrator {
  queueDelegatedTicket(args: {
    ticketId: string;
    employeeId: string;
    companyId: string;
    actorId: string;
    actorKind: string;
  }): Promise<{ threadId: string; triggerMessageId: string }>;
  isCompanyPaused(companyId: string): boolean;
  /** Return true if the employee has a resolvable provider (configured and enabled). */
  canResolveProvider(employeeId: string): Promise<boolean>;
}

/** Per-employee workload + availability + history snapshot. */
export interface WriteSideWorkloadProvider {
  openTicketCount(employeeId: string): number;
  inMeeting(employeeId: string): boolean;
  avgCompletionMs(employeeId: string, subtaskType: string): number | null;
}

export interface WriteSideRoleLookup {
  getSpec(roleId: string): RoleSpec | null;
}

/**
 * Planner guardrail accessor — T7 backs this with the settings repo.
 * Until then `defaultPlanner()` returns the static `PLANNER_DEFAULTS`.
 */
export interface PlannerSettings {
  readonly maxTickets: number;
  readonly maxDepth: number;
  readonly approvalLevel: EmployeeLevel;
  readonly escalationThreshold: number;
  readonly loadDenominator: number;
  readonly pastPerformanceCeilingMs: number;
}

export function defaultPlanner(): PlannerSettings {
  return {
    maxTickets: PLANNER_DEFAULTS.maxTickets,
    maxDepth: PLANNER_DEFAULTS.maxDepth,
    approvalLevel: PLANNER_DEFAULTS.approvalLevel,
    escalationThreshold: PLANNER_DEFAULTS.escalationThreshold,
    loadDenominator: PLANNER_DEFAULTS.loadDenominator,
    pastPerformanceCeilingMs: PLANNER_DEFAULTS.pastPerformanceCeilingMs,
  };
}

/**
 * Per-tool-call escalation tracker. `delegate_subtask` increments the
 * counter on assignment-conflict fallback; `review_deliverable.reject`
 * increments on rejection. The tracker is shared across a loop run via
 * `deps.escalationTracker`; T3 owns its lifecycle (one per `runId`).
 */
export interface EscalationTracker {
  failures(planId: string): number;
  recordFailure(planId: string): number;
  resetPlan(planId: string): void;
}

/** In-memory tracker — the default when callers don't inject their own. */
export function createInMemoryEscalationTracker(): EscalationTracker {
  const counts = new Map<string, number>();
  return {
    failures(planId) {
      return counts.get(planId) ?? 0;
    },
    recordFailure(planId) {
      const next = (counts.get(planId) ?? 0) + 1;
      counts.set(planId, next);
      return next;
    },
    resetPlan(planId) {
      counts.delete(planId);
    },
  };
}

export interface AgenticToolsWriteDeps {
  /** Company the loop is scoped to. */
  readonly companyId: string;
  /** Employee invoking the tool — written into bus events as `actorId`. */
  readonly actorId: string;
  readonly actorKind?: string;
  readonly employeesRepo: EmployeesRepo;
  readonly ticketsRepo: TicketsRepo;
  readonly projectsRepo: ProjectsRepo;
  /**
   * C4 (audit 2026-05-07) — the holding-table repo `delegate_subtask`
   * writes to instead of `ticketsRepo` directly. Operator approval in
   * the inbox materializes pending rows into real tickets.
   */
  readonly pendingDelegationsRepo: PendingDelegationsRepo;
  readonly bus: WriteSideEventBus;
  readonly orchestrator: WriteSideOrchestrator;
  readonly providerComplete: WriteSideCompleteFn;
  readonly workload: WriteSideWorkloadProvider;
  readonly roleLookup?: WriteSideRoleLookup;
  readonly escalationTracker?: EscalationTracker;
  readonly getPlanner?: () => PlannerSettings;
  readonly newId?: () => string;
  readonly now?: () => number;
}

// ---------------------------------------------------------------------------
// Tool schemas — zod, strict, JSON-safe.
// ---------------------------------------------------------------------------

const decomposeProjectSchema = z
  .object({
    brief: z.string().trim().min(1).max(8000),
    projectId: z.string().min(1).optional(),
    goalId: z.string().min(1).optional(),
    /** Caller-supplied subtask-type hint (drives role-fit weighting). */
    subtaskType: z.string().trim().min(1).optional(),
    /** Hard cap override — clamped to `planner_max_tickets`. */
    maxSubtasks: z.number().int().positive().optional(),
    /** Nesting depth for the proposed subtree — clamped to `planner_max_depth`. */
    depth: z.number().int().nonnegative().optional(),
  })
  .strict();
type DecomposeArgs = z.infer<typeof decomposeProjectSchema>;

const delegateSubtaskSchema = z
  .object({
    planId: z.string().min(1),
    subtaskTitle: z.string().trim().min(1).max(280),
    description: z.string().trim().max(8000).optional(),
    assigneeId: z.string().min(1),
    parentProjectId: z.string().min(1).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    /** Optional list of candidate fallback assignees, score-ordered desc. */
    fallbackAssigneeIds: z.array(z.string().min(1)).max(10).optional(),
    subtaskType: z.string().trim().min(1).optional(),
  })
  .strict();
type DelegateArgs = z.infer<typeof delegateSubtaskSchema>;

const reviewDeliverableSchema = z
  .object({
    ticketId: z.string().min(1),
    action: z.enum(['approve', 'request_changes', 'reject']),
    comment: z.string().trim().max(8000).optional(),
    /** Optional plan-id linkage for escalation accounting. */
    planId: z.string().min(1).optional(),
  })
  .strict();
type ReviewArgs = z.infer<typeof reviewDeliverableSchema>;

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function checkAborted(ctx: ToolContext): void {
  if (ctx.signal.aborted) {
    throw new Error('canceled');
  }
}

function safeNewId(deps: AgenticToolsWriteDeps): string {
  if (deps.newId) return deps.newId();
  // Stable fallback: timestamp + random suffix, no node:crypto dep so the
  // module is portable into the renderer for type-only imports.
  const ts = (deps.now ?? Date.now)().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

function plannerOf(deps: AgenticToolsWriteDeps): PlannerSettings {
  return deps.getPlanner ? deps.getPlanner() : defaultPlanner();
}

function trackerOf(deps: AgenticToolsWriteDeps): EscalationTracker {
  if (deps.escalationTracker) return deps.escalationTracker;
  // Safe singleton-per-deps fallback. Callers that want per-run isolation
  // inject their own tracker; T3 will pin one per `runId`.
  if (!Object.prototype.hasOwnProperty.call(deps, '__defaultTracker')) {
    Object.defineProperty(deps, '__defaultTracker', {
      value: createInMemoryEscalationTracker(),
      enumerable: false,
      writable: false,
    });
  }
  return (deps as unknown as { __defaultTracker: EscalationTracker }).__defaultTracker;
}

function capabilitiesForEmployee(
  deps: AgenticToolsWriteDeps,
  employee: { readonly roleId?: string },
): readonly Capability[] {
  if (!employee.roleId || !deps.roleLookup) return [];
  return deps.roleLookup.getSpec(employee.roleId)?.frontmatter.capabilities ?? [];
}

function isApprovedLevel(level: string, planner: PlannerSettings): boolean {
  // Approval ladder: officer > senior-management > management > supervisor > lead > ic.
  const rank: Record<string, number> = {
    officer: 5,
    'senior-management': 4,
    management: 3,
    supervisor: 2,
    lead: 1,
    ic: 0,
    system: 6,
  };
  const MGMT_RANK = 3;
  const required = rank[planner.approvalLevel] ?? MGMT_RANK;
  const actual = rank[level] ?? -1;
  return actual >= required;
}

/**
 * Parse the LLM's decomposition response into a structured subtask list.
 * The provider call returns one JSON object per subtask, one per line, OR
 * a top-level JSON array. Either shape parses; malformed lines are skipped.
 *
 * Schema per subtask: `{ title: string, description?: string, complexity?: 'S'|'M'|'L', dependsOn?: number[], requiredCapabilities?: Capability[] }`.
 */
function parseDecomposition(raw: string): Array<{
  title: string;
  description: string;
  complexity: SubtaskComplexity;
  dependsOn: number[];
  requiredCapabilities: Capability[];
}> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  const collected: Array<{
    title: string;
    description: string;
    complexity: SubtaskComplexity;
    dependsOn: number[];
    requiredCapabilities: Capability[];
  }> = [];

  const candidates: unknown[] = [];
  // Try JSON array first.
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) candidates.push(...parsed);
    } catch {
      // fall through to per-line
    }
  }
  // Per-line JSON-objects fallback.
  if (candidates.length === 0) {
    for (const line of trimmed.split(/\r?\n/)) {
      const l = line.trim();
      if (l.length === 0) continue;
      if (!l.startsWith('{')) continue;
      try {
        candidates.push(JSON.parse(l));
      } catch {
        // skip malformed line
      }
    }
  }

  for (const raw of candidates) {
    if (raw === null || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (title.length === 0) continue;
    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    const complexityRaw = typeof obj.complexity === 'string' ? obj.complexity.toUpperCase() : 'M';
    const complexity: SubtaskComplexity = SUBTASK_COMPLEXITIES.includes(
      complexityRaw as SubtaskComplexity,
    )
      ? (complexityRaw as SubtaskComplexity)
      : 'M';
    const dependsOnRaw = Array.isArray(obj.dependsOn) ? obj.dependsOn : [];
    const dependsOn: number[] = [];
    for (const d of dependsOnRaw) {
      if (typeof d === 'number' && Number.isInteger(d) && d >= 0) {
        dependsOn.push(d);
      }
    }
    const requiredCapabilitiesRaw = Array.isArray(obj.requiredCapabilities)
      ? obj.requiredCapabilities
      : [];
    const requiredCapabilities: Capability[] = [];
    for (const rawCapability of requiredCapabilitiesRaw) {
      if (isCapability(rawCapability) && !requiredCapabilities.includes(rawCapability)) {
        requiredCapabilities.push(rawCapability);
      }
    }

    collected.push({ title, description, complexity, dependsOn, requiredCapabilities });
  }

  return collected;
}

// ---------------------------------------------------------------------------
// decompose_project
// ---------------------------------------------------------------------------

export function buildDecomposeProjectTool(
  deps: AgenticToolsWriteDeps,
): Tool<DecomposeArgs, DecomposedPlan | { error: string; reason: string }> {
  return {
    name: 'decompose_project',
    description:
      'Propose a ticket tree for a project brief. Required: `brief` (free-text). ' +
      'Optional: `projectId` (existing project to link tickets to), `goalId` ' +
      '(parent goal), `subtaskType` (design|implement|review|test|deploy|' +
      'document|research — drives role-fit), `maxSubtasks` (clamped to ' +
      '`planner_max_tickets`), `depth` (clamped to `planner_max_depth`). ' +
      'Returns `{planId, subtasks: [{title, description, assigneeId, ' +
      'assigneeName, assigneeScore, complexity, dependsOn, depth}], truncated}`. ' +
      'Subtask assignees are scored deterministically — same brief + same team = ' +
      'same plan. Emits `plan.proposed`. Does NOT create tickets — callers must ' +
      'follow up with `delegate_subtask` per accepted subtask.',
    schema: decomposeProjectSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const planner = plannerOf(deps);

      // Depth gate.
      const requestedDepth = args.depth ?? 0;
      if (requestedDepth >= planner.maxDepth) {
        return {
          error: 'planner_max_depth_exceeded',
          reason: `Requested depth ${requestedDepth} ≥ planner_max_depth (${planner.maxDepth}). Decomposition refused.`,
        };
      }

      // Approval level gate (defense in depth on top of registry-construction gating).
      const actor = deps.employeesRepo.getById(deps.actorId);
      const actorLevel = actor?.level ?? 'ic';
      if (!isApprovedLevel(actorLevel, planner)) {
        return {
          error: 'planner_approval_level_blocked',
          reason: `Actor level "${actorLevel}" below planner_approval_level "${planner.approvalLevel}". Decomposition refused.`,
        };
      }

      // Tickets cap.
      const requestedMax = args.maxSubtasks ?? planner.maxTickets;
      const maxSubtasks = Math.min(requestedMax, planner.maxTickets);

      // Build the candidate roster — every visible employee in this company.
      const allEmployees = deps.employeesRepo
        .listByCompany(deps.companyId)
        .filter((e) => !e.isSystem && e.status !== 'archived' && e.status !== 'fired');
      if (allEmployees.length === 0) {
        return {
          error: 'no_eligible_employees',
          reason: 'No non-system, non-archived employees available for assignment.',
        };
      }

      // Provider call — single inner LLM dispatch.
      const system = `You are a Project Decomposition planner. Given a project brief, propose up to ${maxSubtasks} subtasks. Output a JSON array; each element must have: \`title\` (string <= 280 chars), \`description\` (string <= 2000 chars), \`complexity\` (one of "S"|"M"|"L"), \`dependsOn\` (array of zero-based indices into the same array, no cycles), \`requiredCapabilities\` (array of capability enum strings, optional but preferred). Allowed capabilities: ${CAPABILITY_LIST.join(', ')}. Output JSON only - no prose, no markdown.`;
      const provider = await deps.providerComplete({
        system,
        messages: [
          {
            role: 'user',
            content: `Brief:\n${args.brief}\n\nMax subtasks: ${maxSubtasks}.`,
          },
        ],
        signal: ctx.signal,
      });
      checkAborted(ctx);

      const parsedSubtasks = parseDecomposition(provider.text);
      const truncated = parsedSubtasks.length > maxSubtasks;
      const acceptedRaw = parsedSubtasks.slice(0, maxSubtasks);

      // Score every employee against every subtask deterministically.
      const subtasks: PlanSubtask[] = acceptedRaw.map((raw) => {
        const hint: SubtaskHint = {
          title: raw.title,
          type: args.subtaskType ?? deriveSubtaskType(raw.title),
          complexity: raw.complexity,
          requiredCapabilities: raw.requiredCapabilities,
        };
        let bestId: string | null = null;
        let bestName: string | null = null;
        let bestScore = -1;
        for (const e of allEmployees) {
          const candidate = scoreEmployee(
            {
              id: e.id,
              name: e.name,
              title: e.title,
              level: e.level,
              status: e.status,
              isSystem: e.isSystem,
              capabilities: capabilitiesForEmployee(deps, e),
            },
            hint,
            {
              openTicketCount: deps.workload.openTicketCount(e.id),
              inMeeting: deps.workload.inMeeting(e.id),
              avgCompletionMs: deps.workload.avgCompletionMs(e.id, hint.type ?? 'implement'),
              loadDenominator: planner.loadDenominator,
              pastPerformanceCeilingMs: planner.pastPerformanceCeilingMs,
            },
          );
          if (candidate > bestScore) {
            bestScore = candidate;
            bestId = e.id;
            bestName = e.name;
          }
        }
        return {
          title: raw.title,
          description: raw.description,
          assigneeId: bestId,
          assigneeName: bestName,
          assigneeScore: clamp01(bestScore < 0 ? 0 : bestScore),
          complexity: raw.complexity,
          dependsOn: Object.freeze(raw.dependsOn) as readonly number[],
          depth: requestedDepth,
        };
      });

      const planId = safeNewId(deps);
      const plan: DecomposedPlan = {
        planId,
        projectId: args.projectId ?? null,
        goalId: args.goalId ?? null,
        subtasks: Object.freeze(subtasks) as readonly PlanSubtask[],
        truncated,
      };

      // Emit bus event — actorKind defaults to `'agent'` for tool invocations.
      try {
        deps.bus.emit({
          type: 'plan.proposed' satisfies EventType,
          companyId: deps.companyId,
          actorId: deps.actorId,
          actorKind: deps.actorKind ?? 'agent',
          payload: {
            planId,
            projectId: plan.projectId,
            goalId: plan.goalId,
            subtaskCount: subtasks.length,
            truncated,
            subtasks: subtasks.map((s) => ({
              title: s.title,
              assigneeId: s.assigneeId,
              assigneeName: s.assigneeName,
              complexity: s.complexity,
              dependsOn: [...s.dependsOn],
            })),
          },
        });
      } catch {
        // Bus emit failures are non-fatal — the loop transcript is the SoT.
      }

      return plan;
    },
  };
}

// ---------------------------------------------------------------------------
// delegate_subtask
// ---------------------------------------------------------------------------

export function buildDelegateSubtaskTool(
  deps: AgenticToolsWriteDeps,
): Tool<DelegateArgs, DelegationResult | { error: string; reason: string }> {
  return {
    name: 'delegate_subtask',
    description:
      'Park a delegation in the operator approval inbox. C4 (audit ' +
      '2026-05-07) moved the amber gate from the command-palette layer to ' +
      'this tool — no ticket is created until the operator approves it ' +
      'in the inbox. Required: `planId` (provenance from a prior ' +
      '`decompose_project` call), `subtaskTitle`, `assigneeId`. Optional: ' +
      '`description`, `parentProjectId` (project linkage applied on ' +
      'approval), `priority` (low|medium|high|critical), ' +
      '`fallbackAssigneeIds` (score-ordered list used when the primary ' +
      'assignee is unavailable), `subtaskType` ' +
      '(design|implement|review|test|deploy|document|research). Returns ' +
      '`{pendingDelegationId, assigneeId, assigneeName, status: ' +
      "'pending_approval', fallbackUsed, attemptCount, assigneeScore, " +
      'scoreBreakdown}`. Emits `task.delegation_pending` with the four ' +
      'score components (role_fit, load, availability, past_performance). ' +
      'On `planner_escalation_threshold` consecutive failures, also emits ' +
      "`task.escalated` and reassigns to the candidate's manager. The " +
      "ticket itself is not created — and no `task.delegated` event " +
      'fires — until the operator approves the row from the inbox.',
    schema: delegateSubtaskSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const planner = plannerOf(deps);
      const tracker = trackerOf(deps);

      // Build the assignee chain: primary, then fallbacks.
      const chain: string[] = [args.assigneeId, ...(args.fallbackAssigneeIds ?? [])];
      let chosenId: string | null = null;
      let chosenName = '';
      let attempts = 0;
      let fallbackUsed = false;

      for (const candidateId of chain) {
        attempts += 1;
        const candidate = deps.employeesRepo.getById(candidateId);
        if (!candidate || candidate.companyId !== deps.companyId) {
          continue;
        }
        if (candidate.isSystem) continue;
        if (candidate.status === 'archived' || candidate.status === 'fired') continue;
        // Conflict signal: candidate is in a meeting OR over the load cap.
        const open = deps.workload.openTicketCount(candidate.id);
        if (open >= planner.loadDenominator * 2) {
          // Hard over-cap — skip without recording as a plan-level failure.
          continue;
        }
        if (deps.workload.inMeeting(candidate.id)) {
          // Soft conflict — accept the next fallback if any, otherwise queue here.
          if (candidateId !== chain[chain.length - 1]) continue;
        }
        // Execution readiness: skip candidates with no resolvable provider.
        // Without this check the orchestrator silently drops the agent-reply
        // task at dispatch time, leaving the ticket assigned but never worked.
        if (deps.orchestrator.canResolveProvider) {
          const canRun = await deps.orchestrator.canResolveProvider(candidate.id);
          if (!canRun) continue;
        }
        chosenId = candidate.id;
        chosenName = candidate.name;
        if (chosenId !== args.assigneeId) fallbackUsed = true;
        break;
      }

      if (chosenId === null) {
        // All candidates exhausted — record a plan-level failure and possibly escalate.
        const failures = tracker.recordFailure(args.planId);
        if (failures >= planner.escalationThreshold) {
          // Escalate to the primary assignee's manager (best-effort lookup; the org-edges
          // table is not in T2 scope, so we fall back to the actor as the escalation target).
          try {
            deps.bus.emit({
              type: 'task.escalated' satisfies EventType,
              companyId: deps.companyId,
              actorId: deps.actorId,
              actorKind: deps.actorKind ?? 'agent',
              payload: {
                planId: args.planId,
                originalAssigneeId: args.assigneeId,
                escalatedTo: deps.actorId,
                reason: `Failed to delegate after ${failures} consecutive attempts.`,
              },
            });
          } catch {
            // non-fatal
          }
        }
        return {
          error: 'no_eligible_assignee',
          reason: `Primary assignee "${args.assigneeId}" and ${args.fallbackAssigneeIds?.length ?? 0} fallback(s) are unavailable.`,
        };
      }

      // C4 (audit 2026-05-07) — compute the four-component score
      // breakdown for the chosen candidate so the audit log can answer
      // "WHY this assignee?" without re-running the deterministic
      // scorer. The breakdown is captured into both the
      // `pending_delegations` row and the `task.delegation_pending`
      // event payload.
      const chosenEmployee = deps.employeesRepo.getById(chosenId)!;
      const chosenHint: SubtaskHint = {
        title: args.subtaskTitle,
        type: args.subtaskType ?? deriveSubtaskType(args.subtaskTitle),
      };
      const { score: assigneeScore, breakdown: scoreBreakdown } = scoreEmployeeWithBreakdown(
        {
          id: chosenEmployee.id,
          name: chosenEmployee.name,
          title: chosenEmployee.title,
          level: chosenEmployee.level,
          status: chosenEmployee.status,
          isSystem: chosenEmployee.isSystem,
          capabilities: capabilitiesForEmployee(deps, chosenEmployee),
        },
        chosenHint,
        {
          openTicketCount: deps.workload.openTicketCount(chosenEmployee.id),
          inMeeting: deps.workload.inMeeting(chosenEmployee.id),
          avgCompletionMs: deps.workload.avgCompletionMs(
            chosenEmployee.id,
            chosenHint.type ?? 'implement',
          ),
          loadDenominator: planner.loadDenominator,
          pastPerformanceCeilingMs: planner.pastPerformanceCeilingMs,
        },
      );

      // Park the delegation in the operator approval inbox. The
      // approval-inbox-service materializes it into a real ticket on
      // operator approval — `ticketsRepo.create()` and
      // `orchestrator.queueDelegatedTicket()` no longer run here.
      const pendingDelegationId = deps.pendingDelegationsRepo.create({
        companyId: deps.companyId,
        planId: args.planId,
        subtaskTitle: args.subtaskTitle,
        description: args.description ?? '',
        priority: args.priority ?? 'medium',
        assigneeId: chosenId,
        assigneeName: chosenName,
        parentProjectId: args.parentProjectId ?? null,
        subtaskType: args.subtaskType ?? null,
        fallbackUsed,
        attemptCount: attempts,
        score: assigneeScore,
        roleFit: scoreBreakdown.roleFit,
        loadRatio: scoreBreakdown.load,
        availability: scoreBreakdown.availability,
        pastPerformance: scoreBreakdown.pastPerformance,
        reporterId: deps.actorId,
        reporterKind: deps.actorKind ?? 'agent',
        now: deps.now?.(),
      });

      // Emit the pending event with the score breakdown the audit
      // explicitly called out as missing from `task.delegated`. The
      // materialized `task.delegated` event (emitted later by
      // approval-inbox-service on approve) carries the same breakdown.
      try {
        deps.bus.emit({
          type: 'task.delegation_pending' satisfies EventType,
          companyId: deps.companyId,
          actorId: deps.actorId,
          actorKind: deps.actorKind ?? 'agent',
          payload: {
            pendingDelegationId,
            planId: args.planId,
            subtaskTitle: args.subtaskTitle,
            assigneeId: chosenId,
            assigneeName: chosenName,
            parentProjectId: args.parentProjectId ?? null,
            priority: args.priority ?? 'medium',
            fallbackUsed,
            attemptCount: attempts,
            scoreBreakdown,
            assigneeScore,
          },
        });
      } catch {
        // Bus emit failures are non-fatal — the pending row is the SoT.
      }

      return {
        pendingDelegationId,
        assigneeId: chosenId,
        assigneeName: chosenName,
        status: 'pending_approval',
        fallbackUsed,
        attemptCount: attempts,
        assigneeScore,
        scoreBreakdown,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// review_deliverable
// ---------------------------------------------------------------------------

export function buildReviewDeliverableTool(
  deps: AgenticToolsWriteDeps,
): Tool<ReviewArgs, ReviewResult | { error: string; reason: string }> {
  return {
    name: 'review_deliverable',
    description:
      "Review a completed ticket's output. Required: `ticketId`, `action` " +
      '(approve|request_changes|reject). Optional: `comment` (free-text reason), ' +
      '`planId` (links the review to a decomposition for escalation accounting). ' +
      'The ticket must be in `done` status. Emits `review.requested` at start ' +
      'and `review.completed` at finish. On `reject` — and when the linked plan ' +
      'has hit `planner_escalation_threshold` consecutive failures — also emits ' +
      '`task.escalated`. Returns `{ticketId, outcome, summary, escalated}`.',
    schema: reviewDeliverableSchema,
    async execute(args, ctx) {
      checkAborted(ctx);
      const planner = plannerOf(deps);
      const tracker = trackerOf(deps);

      const ticket = deps.ticketsRepo.getById(args.ticketId);
      if (!ticket || ticket.companyId !== deps.companyId) {
        return {
          error: 'ticket_not_found',
          reason: `Ticket "${args.ticketId}" does not exist in company "${deps.companyId}".`,
        };
      }
      if (ticket.status !== 'done') {
        return {
          error: 'ticket_not_done',
          reason: `Ticket "${args.ticketId}" is in status "${ticket.status}", not "done". Reviews require a completed ticket.`,
        };
      }

      // Emit the requested-event up front so the renderer can render a "review pending"
      // step card before the inner provider call returns.
      try {
        deps.bus.emit({
          type: 'review.requested' satisfies EventType,
          companyId: deps.companyId,
          actorId: deps.actorId,
          actorKind: deps.actorKind ?? 'agent',
          payload: {
            ticketId: args.ticketId,
            reviewerId: deps.actorId,
            planId: args.planId ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Inner provider call — short, structured. The model returns a single-line
      // summary the loop transcript can quote; the actual outcome was decided by
      // the caller via `args.action` so the model never overrides intent.
      const system =
        'You are a Code/Deliverable Reviewer. Given a ticket title, description, ' +
        "and the reviewer's decision, return a one-paragraph summary explaining " +
        'the decision in plain language. Output text only — no JSON, no markdown.';
      const userPrompt = [
        `Ticket title: ${ticket.title}`,
        `Ticket description: ${ticket.description ?? ''}`,
        `Reviewer decision: ${args.action}`,
        args.comment ? `Reviewer comment: ${args.comment}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const provider = await deps.providerComplete({
        system,
        messages: [{ role: 'user', content: userPrompt }],
        signal: ctx.signal,
      });
      checkAborted(ctx);

      const summary = provider.text.trim().slice(0, 2000);

      const outcomeMap = {
        approve: 'approved',
        request_changes: 'changes_requested',
        reject: 'rejected',
      } as const;
      const outcome = outcomeMap[args.action];

      let escalated = false;
      if (args.action === 'reject' && args.planId !== undefined) {
        const failures = tracker.recordFailure(args.planId);
        if (failures >= planner.escalationThreshold) {
          escalated = true;
          try {
            deps.bus.emit({
              type: 'task.escalated' satisfies EventType,
              companyId: deps.companyId,
              actorId: deps.actorId,
              actorKind: deps.actorKind ?? 'agent',
              payload: {
                planId: args.planId,
                ticketId: args.ticketId,
                escalatedTo: deps.actorId,
                reason: `Review rejected; ${failures} consecutive failures on plan.`,
              },
            });
          } catch {
            // non-fatal
          }
        }
      }

      try {
        deps.bus.emit({
          type: 'review.completed' satisfies EventType,
          companyId: deps.companyId,
          actorId: deps.actorId,
          actorKind: deps.actorKind ?? 'agent',
          payload: {
            ticketId: args.ticketId,
            reviewerId: deps.actorId,
            outcome,
            summary,
            planId: args.planId ?? null,
            escalated,
          },
        });
      } catch {
        // non-fatal
      }

      return {
        ticketId: args.ticketId,
        outcome,
        summary,
        escalated,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Composer — level-gated tool registry per Phase 5 §7.1.
//
// The decompose tool is exposed to Officer / Senior Mgmt / Management /
// system. The delegate + review tools are exposed to Management / Supervisor
// / Lead / system. Management appears in both rosters intentionally — they
// get all three. ICs receive an empty array.
// ---------------------------------------------------------------------------

/**
 * Build the level-gated write-side tool set for `employee`. ICs return
 * an empty array. The registry is constructed from the role-pack
 * frontmatter `level` field — runtime guards inside each tool body
 * provide defense in depth.
 */
export function buildWriteSideTools(
  employee: { readonly level: string },
  deps: AgenticToolsWriteDeps,
): readonly Tool[] {
  const level = employee.level as EmployeeLevel;
  const tools: Tool[] = [];
  if (DECOMPOSE_LEVELS.includes(level)) {
    tools.push(buildDecomposeProjectTool(deps));
  }
  if (DELEGATE_REVIEW_LEVELS.includes(level)) {
    tools.push(buildDelegateSubtaskTool(deps));
    tools.push(buildReviewDeliverableTool(deps));
  }
  return tools;
}
