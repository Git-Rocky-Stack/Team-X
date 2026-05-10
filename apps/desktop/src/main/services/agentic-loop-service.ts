/**
 * AgenticLoopService — main-process front-door for the `complex_request`
 * path. Resolves the company's `system-agent` pseudo-employee, creates
 * a per-query DM thread on it, wraps the provider into a
 * `LoopCompleteFn`, instantiates the pure `createAgenticLoop` from
 * `@team-x/intelligence`, and runs the ReAct loop in the background.
 *
 * Architectural role:
 *
 *   - Composition root for the agentic loop. The loop itself is pure
 *     (no DB, no Electron, no network). This service wires in the
 *     concrete deps — repos, event bus, orchestrator gate.
 *
 *   - Event-bus emitter. Every step fans out as `agent.step`; terminal
 *     states fire exactly one `agentic.completed` or `agentic.failed`.
 *     Per CLAUDE.md invariant #11, callers invalidate via the bus, not
 *     the IPC return.
 *
 *   - Orchestrator-pause observer. Before every provider completion,
 *     the service awaits `orchestrator.isCompanyPaused === false`. If
 *     a meeting starts mid-run, the NEXT completion call blocks until
 *     the meeting ends — the already-emitted steps persist, and the
 *     loop resumes cleanly. This is the intent from the M31 plan:
 *     "the next providerRouter.runStream call will observe the pause
 *     gate and block".
 *
 *   - Thread persistence. Every step writes a message row so the
 *     thread view can render the full transcript after the palette
 *     closes. Plan / answer steps are authored by the system-agent
 *     (`authorKind: 'employee'`); tool_call / tool_result / error
 *     steps also author as the system-agent with a `[tool_*]` prefix
 *     in the content so the renderer can style them distinctly later.
 *
 * Contract:
 *
 *   start({ companyId, userText }): Promise<{ runId, threadId }>
 *     — synchronous setup (thread + user message + runs row), then
 *       fire-and-forget the loop. Returns before the loop completes.
 *
 *   stop(runId)
 *     — aborts the AbortController for the run; the next loop step
 *       emits `{ kind: 'error', reason: 'canceled' }`, the run
 *       terminates, `agentic.failed` fires.
 *
 *   getRun(runId)
 *     — in-memory snapshot of `AgenticLoopRunState`. Returns `null`
 *       for unknown ids. Callers should treat `steps` as read-only.
 *
 *   waitForRun(runId)
 *     — resolves when the background loop has fully terminated and
 *       `runs.finish` + terminal event have been emitted. Primarily
 *       exists for tests + synchronous callers; production renderers
 *       subscribe to the bus instead.
 *
 * Phase 5 — M31 — T3.
 */

import {
  type AgenticLoop,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  type LoopCompleteFn,
  type LoopRun,
  type LoopStatus,
  type LoopStep,
  type Tool,
  createAgenticLoop,
} from '@team-x/intelligence';
import type {
  ActorKind,
  AgentStepKind,
  AgentStepPayload,
  AgenticCompletedPayload,
  AgenticFailedPayload,
  AgenticRunSnapshot,
  DashboardEvent,
  EventType,
} from '@team-x/shared-types';
import { generateTraceId } from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Narrow structural contracts — mirror the meeting-service pattern so
// tests can inject hand-rolled fakes without pulling the full drizzle
// repo types into the test surface.
// ---------------------------------------------------------------------------

/**
 * Minimal employee projection used by the loop to (a) author messages
 * + bus events with the actor's identity, and (b) hand the level-aware
 * `buildTools` closure enough information to gate the write-side tool
 * registry. Phase 5 — M32 T3.
 */
export interface AgenticLoopEmployeeContext {
  readonly id: string;
  readonly level: string;
  readonly isSystem: boolean;
}

/**
 * Lookup row returned by `getById`. Adds `companyId` so the service
 * can guard against an employee from a different company being passed
 * in as an explicit `employeeId` on `start()`.
 */
export interface AgenticLoopEmployeeLookup extends AgenticLoopEmployeeContext {
  readonly companyId: string;
}

export interface AgenticLoopEmployeesRepo {
  findSystemByRoleId(companyId: string, roleId: string): { id: string } | null;
  /**
   * Lookup any employee by id. REQUIRED only when `start()` is called
   * with an explicit `employeeId` — when omitted, the loop falls back
   * to `findSystemByRoleId` and the M31 system-agent path. M32 T3.
   */
  getById?(id: string): AgenticLoopEmployeeLookup | null;
}

export interface AgenticLoopThreadsRepo {
  create(input: {
    companyId: string;
    kind: string;
    subject?: string;
    createdBy: string;
  }): string;
  addMember(input: {
    threadId: string;
    memberId: string;
    memberKind: string;
    roleInThread?: string;
  }): void;
}

export interface AgenticLoopMessagesRepoAppendInput {
  threadId: string;
  authorId: string;
  authorKind: 'user' | 'employee' | 'system';
  content: string;
  toolCalls?: unknown;
}

export interface AgenticLoopMessagesRepo {
  append(input: AgenticLoopMessagesRepoAppendInput): string;
}

export interface AgenticLoopRunsRepoStartInput {
  employeeId: string;
  provider: string;
  model: string;
  threadId?: string;
  kind?: 'work' | 'agentic' | 'copilot';
  /**
   * W3C-format trace ID propagated by the orchestrator that opened this
   * run. Threaded into `runs.start` and onto every event emitted during
   * the run so `runs.trace_id ⋈ events.trace_id` reconstructs the
   * end-to-end flow. Audit 2026-05-07 H4.
   */
  traceId?: string;
}

export interface AgenticLoopRunsRepoFinishInput {
  status: 'success' | 'error' | 'cancelled';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: string;
  toolCallsCount?: number;
  error?: string;
}

export interface AgenticLoopRunsRepo {
  start(input: AgenticLoopRunsRepoStartInput): string;
  finish(id: string, input: AgenticLoopRunsRepoFinishInput): void;
}

export interface AgenticLoopEventBus {
  emit<T>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: ActorKind;
    payload: T;
    /**
     * Optional W3C trace ID. Propagated to `events.trace_id` so the
     * dashboard can join `runs ⋈ events ON trace_id` for end-to-end
     * forensic reconstruction. Audit 2026-05-07 H4.
     */
    traceId?: string;
  }): DashboardEvent<T>;
}

export interface AgenticLoopOrchestratorLike {
  isCompanyPaused(companyId: string): boolean;
}

export interface AgenticLoopBudgets {
  /**
   * Operator-facing cap on tool-turn iterations (one LLM call + tool
   * dispatches per iteration). Default `DEFAULT_MAX_ITERATIONS = 8`.
   * Optional so existing callers passing only `{ maxSteps, maxTokens,
   * timeoutMs }` keep working — the service falls back to the default.
   * Audit 2026-05-07 H9.
   */
  maxIterations?: number;
  /**
   * Hard ceiling on emitted `LoopStep` entries (safety net for runaway
   * parallel fan-out within a single iteration). Default 64 — see
   * `LoopBudget` doc-comment in `@team-x/intelligence` for the dual-cap
   * rationale. Audit 2026-05-07 H9.
   */
  maxSteps: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface AgenticLoopResolvedComplete {
  complete: LoopCompleteFn;
  provider: string;
  model: string;
}

export interface AgenticLoopLogger {
  warn(msg: string, err?: unknown): void;
  error(msg: string, err?: unknown): void;
}

export interface AgenticLoopServiceDeps {
  employeesRepo: AgenticLoopEmployeesRepo;
  threadsRepo: AgenticLoopThreadsRepo;
  messagesRepo: AgenticLoopMessagesRepo;
  runsRepo: AgenticLoopRunsRepo;
  budgetGovernance?: {
    assertExecutionAllowed(input: {
      companyId: string;
      employeeId?: string | null;
      routineId?: string | null;
      executionKind: 'agentic';
    }): Promise<{ allowed: boolean; reason: string | null }>;
    recordRunSpend(runId: string): Promise<void>;
  };
  bus: AgenticLoopEventBus;
  orchestrator: AgenticLoopOrchestratorLike;
  /**
   * Build the per-run tool registry. Receives the resolved actor employee
   * so the composition root can level-gate the write-side tools per
   * Phase 5 §7.1 (M32 T3). The composition root composes
   * `[...readSideTools(companyId), ...buildWriteSideTools(employee, ...)]`
   * — the loop itself is agnostic to which subset of tools is exposed.
   */
  buildTools(args: {
    companyId: string;
    signal: AbortSignal;
    employee: AgenticLoopEmployeeContext;
  }): readonly Tool[];
  /**
   * Resolve the provider + model + `LoopCompleteFn` for this run. Wrapping
   * `streamAgent` from the provider router happens here; the service
   * never touches the provider router directly.
   */
  resolveComplete(args: {
    companyId: string;
    systemAgentId: string;
  }): Promise<AgenticLoopResolvedComplete>;
  /**
   * Returns current budget caps. Defaults to the intelligence package's
   * `DEFAULT_*` constants if omitted. T7 wires up the real settings repo.
   */
  getBudgets?(): AgenticLoopBudgets;
  /** Actor id used for the human user ("rocky" in Phase 1 single-user mode). */
  humanUserId: string;
  /** Subject prefix for the per-query thread. Defaults to `Copilot: `. */
  threadSubjectPrefix?: string;
  /** Poll interval for the orchestrator-pause gate. Defaults to 250ms. */
  pauseGatePollMs?: number;
  /** Injectable id generator + clock for tests. */
  newId?(): string;
  now?(): number;
  logger?: AgenticLoopLogger;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Canonical system-agent role id. Re-exported from the bootstrap so every
 * consumer of this service uses the same symbol. Kept local to avoid
 * an import cycle with `system-agent-bootstrap.ts`, which consumes
 * `createEmployeesRepo` that consumes schema that consumes… you get it.
 */
export const SYSTEM_AGENT_ROLE_ID = 'system-agent';

const DEFAULT_THREAD_SUBJECT_PREFIX = 'Copilot: ';
const DEFAULT_PAUSE_POLL_MS = 250;
const SUBJECT_MAX_LENGTH = 80;

/** Public status shape. Mirrors `LoopStatus` plus a pre-loop `running`. */
export type AgenticLoopStatus =
  | 'running'
  | 'completed'
  | 'budget_exhausted'
  | 'failed'
  | 'canceled';

export interface AgenticLoopRunState {
  readonly runId: string;
  readonly threadId: string;
  readonly companyId: string;
  readonly systemAgentId: string;
  readonly provider: string;
  readonly model: string;
  readonly startedAt: number;
  endedAt: number | null;
  status: AgenticLoopStatus;
  answer: string | null;
  errorReason: string | null;
  errorMessage: string | null;
  steps: LoopStep[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  toolCallsCount: number;
  /**
   * W3C-format trace ID generated at run-start. Threaded through every
   * `runs.*` write and every `bus.emit` for the duration of the run so
   * the dashboard can JOIN runs ↔ events on trace_id for end-to-end
   * forensic reconstruction. Audit 2026-05-07 H4.
   */
  readonly traceId: string;
}

export interface StartArgs {
  companyId: string;
  userText: string;
  /**
   * Explicit actor employee id. When omitted (the M31 default), resolves
   * to the company's `system-agent` pseudo-employee and the loop authors
   * messages + bus events under that identity. When provided, the service
   * looks the employee up via `employeesRepo.getById`, validates the
   * employee belongs to `companyId`, and hands the employee context to
   * `deps.buildTools` so the registry composer can level-gate the
   * write-side tool set per Phase 5 §7.1. Phase 5 — M32 T3.
   */
  employeeId?: string;
}

export interface StartResult {
  runId: string;
  threadId: string;
}

export interface AgenticLoopService {
  start(args: StartArgs): Promise<StartResult>;
  stop(runId: string): void;
  getRun(runId: string): AgenticLoopRunState | null;
  /**
   * Point-in-time projection of a run's persisted step history and its
   * terminal bus-event payload (when finished). Phase 5 — M32 T0 / F1.
   *
   * Shape matches the live bus stream exactly — each step is the same
   * `AgentStepPayload` the `agent.step` event emits, and `terminal`
   * latches to whichever of `agentic.completed` / `agentic.failed` the
   * `finishRun` helper would emit. The renderer hook merges the snapshot
   * with incoming bus events by `(runId, stepIndex)` to fix the race
   * where a fast provider completes before `ipc.events.onDashboard`
   * attaches — see `useAgentStepStream`.
   *
   * Returns `null` for unknown or evicted runs. Idempotent, no side-effects.
   */
  getRunSnapshot(runId: string): AgenticRunSnapshot | null;
  /**
   * Resolves when the background loop for `runId` terminates and all
   * terminal side-effects (runs.finish + agentic.completed|failed) have
   * fired. Resolves immediately with no-op if `runId` is unknown.
   */
  waitForRun(runId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers — pure; hoisted so tests can import if needed.
// ---------------------------------------------------------------------------

const LOOP_STATUS_TO_PUBLIC: Record<LoopStatus, AgenticLoopStatus> = {
  completed: 'completed',
  budget_exhausted: 'budget_exhausted',
  failed: 'failed',
  canceled: 'canceled',
};

function truncateSubject(text: string, max = SUBJECT_MAX_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

interface StepProjection {
  readonly kind: AgentStepKind;
  readonly data: unknown;
}

function projectStepBody(step: LoopStep): StepProjection {
  switch (step.kind) {
    case 'plan':
      return { kind: 'plan', data: { text: step.text } };
    case 'tool_call':
      return {
        kind: 'tool_call',
        data: {
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          args: step.args,
        },
      };
    case 'tool_result':
      return {
        kind: 'tool_result',
        data: {
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          result: step.result,
        },
      };
    case 'answer':
      return { kind: 'answer', data: { text: step.text } };
    case 'error':
      return {
        kind: 'error',
        data: { reason: step.reason, message: step.message },
      };
  }
}

interface StepMessage {
  readonly content: string;
  readonly toolCalls?: unknown;
}

function stepToMessage(step: LoopStep): StepMessage {
  switch (step.kind) {
    case 'plan':
      return { content: `[plan] ${step.text}` };
    case 'tool_call':
      return {
        content: `[tool_call] ${step.toolName}`,
        toolCalls: {
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          args: step.args,
        },
      };
    case 'tool_result':
      return {
        content: `[tool_result] ${step.toolName}`,
        toolCalls: {
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          result: step.result,
        },
      };
    case 'answer':
      return { content: step.text };
    case 'error':
      return {
        content: `[error:${step.reason}] ${step.message}`,
      };
  }
}

/**
 * Format a costUsd float as the `numeric(18,6)` string the runs table
 * expects. Six fractional digits matches the precision guaranteed by
 * `telemetry-core.calcCostUsd` — truncating here would lose sub-cent
 * detail for cheap local runs.
 */
function formatCostUsd(costUsd: number): string {
  return Number.isFinite(costUsd) ? costUsd.toFixed(6) : '0.000000';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgenticLoopService(deps: AgenticLoopServiceDeps): AgenticLoopService {
  const now = deps.now ?? Date.now;
  const logger: AgenticLoopLogger = deps.logger ?? {
    warn: (msg: string, err?: unknown) => console.warn(msg, err),
    error: (msg: string, err?: unknown) => console.error(msg, err),
  };
  const threadSubjectPrefix = deps.threadSubjectPrefix ?? DEFAULT_THREAD_SUBJECT_PREFIX;
  const pausePollMs = deps.pauseGatePollMs ?? DEFAULT_PAUSE_POLL_MS;

  interface RegisteredRun {
    state: AgenticLoopRunState;
    controller: AbortController;
    completion: Promise<void>;
  }

  const runs = new Map<string, RegisteredRun>();

  function resolveBudgets(): AgenticLoopBudgets {
    if (deps.getBudgets) return deps.getBudgets();
    return {
      // Operator-facing iteration cap — H9 audit 2026-05-07.
      maxIterations: DEFAULT_MAX_ITERATIONS,
      maxSteps: DEFAULT_MAX_STEPS,
      maxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }

  async function waitUntilUnpaused(companyId: string, signal: AbortSignal): Promise<void> {
    while (deps.orchestrator.isCompanyPaused(companyId)) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, pausePollMs);
        const onAbort = (): void => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const cleanup = (): void => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  function finishRun(state: AgenticLoopRunState): void {
    const endedAt = state.endedAt ?? now();
    state.endedAt = endedAt;
    const latencyMs = endedAt - state.startedAt;

    const runStatus: AgenticLoopRunsRepoFinishInput['status'] =
      state.status === 'completed'
        ? 'success'
        : state.status === 'canceled'
          ? 'cancelled'
          : 'error';

    try {
      deps.runsRepo.finish(state.runId, {
        status: runStatus,
        promptTokens: state.promptTokens,
        completionTokens: state.completionTokens,
        latencyMs,
        costUsd: formatCostUsd(state.costUsd),
        toolCallsCount: state.toolCallsCount,
        error: state.errorMessage ?? undefined,
      });
    } catch (err) {
      logger.warn('[agentic-loop] runs.finish failed', err);
    }

    // Always invoke recordRunSpend when a budget-governance dep is wired in.
    // Cancelled runs accumulate real cost in `state.costUsd` across every
    // iteration's tool turns (state.costUsd += step.telemetry.costUsd above);
    // the runs row written in `runsRepo.finish` carries that cost, and the
    // ledger must capture it too or `SUM(runs) ≠ SUM(ledger)` for any company
    // whose users hit the stop button. The function-side guard at
    // budget-governance-service.ts skips zero-cost cancels and in-flight runs.
    // Audit 2026-05-07 H8 — paired with the function-side change at
    // `budget-governance-service.ts:625` so the cost-ledger decision lives in
    // exactly one place.
    if (deps.budgetGovernance) {
      void deps.budgetGovernance.recordRunSpend(state.runId).catch((err) => {
        logger.warn('[agentic-loop] budget recordRunSpend failed', err);
      });
    }

    if (state.status === 'completed') {
      try {
        deps.bus.emit<AgenticCompletedPayload>({
          type: 'agentic.completed',
          companyId: state.companyId,
          actorId: state.systemAgentId,
          actorKind: 'employee',
          payload: {
            runId: state.runId,
            threadId: state.threadId,
            answer: state.answer ?? '',
            totalSteps: state.steps.length,
            tokensIn: state.promptTokens,
            tokensOut: state.completionTokens,
            costUsd: state.costUsd,
            durationMs: latencyMs,
          },
          traceId: state.traceId,
        });
      } catch (err) {
        logger.warn('[agentic-loop] agentic.completed emit failed', err);
      }
    } else {
      try {
        deps.bus.emit<AgenticFailedPayload>({
          type: 'agentic.failed',
          companyId: state.companyId,
          actorId: state.systemAgentId,
          actorKind: 'employee',
          payload: {
            runId: state.runId,
            threadId: state.threadId,
            reason: state.errorReason ?? state.status,
            message: state.errorMessage ?? '',
            totalSteps: state.steps.length,
            tokensIn: state.promptTokens,
            tokensOut: state.completionTokens,
            costUsd: state.costUsd,
            durationMs: latencyMs,
          },
          traceId: state.traceId,
        });
      } catch (err) {
        logger.warn('[agentic-loop] agentic.failed emit failed', err);
      }
    }
  }

  async function start(args: StartArgs): Promise<StartResult> {
    // ─── Resolve actor employee (M32 T3) ────────────────────────────────
    // When `employeeId` is provided, look up the actor via the optional
    // `getById` repo method and validate cross-company isolation. When
    // omitted — the M31 default — fall through to the system-agent
    // pseudo-employee. Either path produces an `AgenticLoopEmployeeContext`
    // the loop uses for actor identity AND that the composition-root
    // `buildTools` closure uses to level-gate the write-side registry.
    let actorEmployee: AgenticLoopEmployeeContext;
    if (args.employeeId !== undefined) {
      if (!deps.employeesRepo.getById) {
        throw new Error(
          '[agentic-loop] Explicit employeeId requires employeesRepo.getById; ' +
            'wire it from the composition root or omit employeeId to default to the system-agent.',
        );
      }
      const row = deps.employeesRepo.getById(args.employeeId);
      if (!row) {
        throw new Error(
          `[agentic-loop] No employee "${args.employeeId}" found for company "${args.companyId}".`,
        );
      }
      if (row.companyId !== args.companyId) {
        throw new Error(
          `[agentic-loop] Employee "${args.employeeId}" belongs to company "${row.companyId}", not "${args.companyId}".`,
        );
      }
      actorEmployee = { id: row.id, level: row.level, isSystem: row.isSystem };
    } else {
      const sys = deps.employeesRepo.findSystemByRoleId(args.companyId, SYSTEM_AGENT_ROLE_ID);
      if (!sys) {
        throw new Error(
          `[agentic-loop] No system-agent employee for company "${args.companyId}". Did system-agent-bootstrap run on company creation?`,
        );
      }
      actorEmployee = { id: sys.id, level: 'system', isSystem: true };
    }

    if (deps.budgetGovernance) {
      const admission = await deps.budgetGovernance.assertExecutionAllowed({
        companyId: args.companyId,
        employeeId: actorEmployee.id,
        executionKind: 'agentic',
      });
      if (!admission.allowed) {
        throw new Error(
          admission.reason ??
            `[agentic-loop] run blocked by budget policy for company "${args.companyId}".`,
        );
      }
    }

    const threadId = deps.threadsRepo.create({
      companyId: args.companyId,
      kind: 'dm',
      subject: `${threadSubjectPrefix}${truncateSubject(args.userText)}`,
      createdBy: deps.humanUserId,
    });

    deps.threadsRepo.addMember({
      threadId,
      memberId: deps.humanUserId,
      memberKind: 'user',
    });
    deps.threadsRepo.addMember({
      threadId,
      memberId: actorEmployee.id,
      memberKind: 'employee',
    });

    const userMessageId = deps.messagesRepo.append({
      threadId,
      authorId: deps.humanUserId,
      authorKind: 'user',
      content: args.userText,
    });

    // H4 (audit 2026-05-07) — generate the trace ID ONCE at run-start.
    // Every event below, every runs.start / runs.finish, and the loop
    // itself carry this same id so a future timeline reconstruction can
    // SELECT * FROM events WHERE trace_id = ? — and JOIN against the
    // runs row written below — to render the entire flow.
    const traceId = generateTraceId();

    try {
      deps.bus.emit({
        type: 'message.persisted',
        companyId: args.companyId,
        actorId: deps.humanUserId,
        actorKind: 'user',
        payload: { threadId, messageId: userMessageId },
        traceId,
      });
    } catch (err) {
      logger.warn('[agentic-loop] message.persisted emit failed', err);
    }

    // Resolve provider BEFORE writing the runs row so the row carries
    // the actual provider/model identity (telemetry depends on this).
    // A resolver error here propagates — no runs row is written.
    // NOTE: `systemAgentId` here is the actor employee id (system-agent
    // by default, any employee under M32 T3 explicit-employeeId callers).
    // The dep field name is preserved for M31 contract stability.
    const resolved = await deps.resolveComplete({
      companyId: args.companyId,
      systemAgentId: actorEmployee.id,
    });

    const runId = deps.runsRepo.start({
      employeeId: actorEmployee.id,
      provider: resolved.provider,
      model: resolved.model,
      threadId,
      kind: 'agentic',
      traceId,
    });

    const controller = new AbortController();
    const startedAt = now();
    const state: AgenticLoopRunState = {
      runId,
      threadId,
      companyId: args.companyId,
      systemAgentId: actorEmployee.id,
      provider: resolved.provider,
      model: resolved.model,
      startedAt,
      endedAt: null,
      status: 'running',
      answer: null,
      errorReason: null,
      errorMessage: null,
      steps: [],
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      toolCallsCount: 0,
      traceId,
    };

    const budgets = resolveBudgets();

    // Pause-aware wrapper: honours orchestrator pause on EVERY provider
    // call, not just at start. Matches the invariant #2 contract — the
    // orchestrator is the only scheduler, so the loop yields on pause.
    const pauseAwareComplete: LoopCompleteFn = async (req) => {
      await waitUntilUnpaused(args.companyId, req.signal);
      return resolved.complete(req);
    };

    const tools = deps.buildTools({
      companyId: args.companyId,
      signal: controller.signal,
      employee: actorEmployee,
    });

    const loop: AgenticLoop = createAgenticLoop({
      complete: pauseAwareComplete,
      tools,
      model: resolved.model,
      // Optional in `AgenticLoopBudgets` (callers may pass legacy 3-field
      // budgets); the loop also defaults internally to DEFAULT_MAX_ITERATIONS
      // if undefined. Audit 2026-05-07 H9.
      maxIterations: budgets.maxIterations,
      maxSteps: budgets.maxSteps,
      maxTokens: budgets.maxTokens,
      timeoutMs: budgets.timeoutMs,
      now,
      // H4 — propagate the orchestrator-generated trace into the loop so
      // LoopRun.traceId echoes back. Lets us pin the loop's perspective
      // of the trace in tests independently of the runs/events writes.
      traceId,
    });

    const onStep = (step: LoopStep): void => {
      state.steps.push(step);
      state.promptTokens += step.telemetry.tokensIn;
      state.completionTokens += step.telemetry.tokensOut;
      state.costUsd += step.telemetry.costUsd;
      if (step.kind === 'tool_call') {
        state.toolCallsCount += 1;
      }

      const msg = stepToMessage(step);
      try {
        deps.messagesRepo.append({
          threadId,
          authorId: actorEmployee.id,
          authorKind: 'employee',
          content: msg.content,
          toolCalls: msg.toolCalls,
        });
      } catch (err) {
        logger.warn('[agentic-loop] step message persistence failed', err);
      }

      const body = projectStepBody(step);
      try {
        deps.bus.emit<AgentStepPayload>({
          type: 'agent.step',
          companyId: args.companyId,
          actorId: actorEmployee.id,
          actorKind: 'employee',
          payload: {
            runId,
            threadId,
            stepIndex: step.stepIndex,
            kind: body.kind,
            data: body.data,
            tokensIn: step.telemetry.tokensIn,
            tokensOut: step.telemetry.tokensOut,
            costUsd: step.telemetry.costUsd,
            provider: step.telemetry.provider,
            model: step.telemetry.model,
          },
          traceId,
        });
      } catch (err) {
        logger.warn('[agentic-loop] agent.step emit failed', err);
      }
    };

    const completion = (async (): Promise<void> => {
      let loopRun: LoopRun;
      try {
        loopRun = await loop.run(args.userText, {
          onStep,
          signal: controller.signal,
        });
      } catch (err) {
        // The loop is defensive and does not throw under normal failure
        // modes — it terminates cleanly with an `error` step. Reaching
        // this catch indicates a bug or unexpected infra error; surface
        // it as a `failed` run with `provider_error` so the UX has a
        // reason to display. If the user called stop() the abort path
        // still takes precedence (same coercion as the normal return
        // path below).
        if (controller.signal.aborted) {
          state.status = 'canceled';
          state.errorReason = 'canceled';
          state.errorMessage = 'Run canceled by user';
        } else {
          logger.error('[agentic-loop] loop.run threw (unexpected)', err);
          state.status = 'failed';
          state.errorReason = 'provider_error';
          state.errorMessage = err instanceof Error ? err.message : String(err);
        }
        state.endedAt = now();
        finishRun(state);
        return;
      }

      state.status = LOOP_STATUS_TO_PUBLIC[loopRun.status];
      state.answer = loopRun.answer ?? null;
      const last = loopRun.steps[loopRun.steps.length - 1];
      if (last && last.kind === 'error') {
        state.errorReason = last.reason;
        state.errorMessage = last.message;
      }
      // Coerce to 'canceled' when the user called stop(). The loop
      // may surface an abort as tool_threw / tool_timeout /
      // provider_error depending on which layer was mid-flight when
      // the abort fired; the public contract for stop() is always
      // 'canceled'. A natural 'completed' run is respected even if
      // stop() fired too late — that race goes to the runner.
      if (controller.signal.aborted && state.status !== 'completed') {
        state.status = 'canceled';
        state.errorReason = 'canceled';
        if (state.errorMessage === null) {
          state.errorMessage = 'Run canceled by user';
        }
      }
      state.endedAt = now();
      finishRun(state);
    })();

    // Drop the unhandled-rejection risk on the floor defensively; the
    // completion IIFE already swallows via its inner try/catch.
    completion.catch((err) => {
      logger.error('[agentic-loop] background completion rejected (unreachable)', err);
    });

    runs.set(runId, { state, controller, completion });

    return { runId, threadId };
  }

  function stop(runId: string): void {
    const entry = runs.get(runId);
    if (!entry) return;
    if (entry.state.endedAt !== null) return;
    entry.controller.abort();
  }

  function getRun(runId: string): AgenticLoopRunState | null {
    const entry = runs.get(runId);
    if (!entry) return null;
    return { ...entry.state, steps: entry.state.steps.slice() };
  }

  /**
   * Phase 5 — M32 T0 / F1. Pure projection of an in-memory run onto the
   * wire shapes the bus emits. Keeps byte-for-byte parity with `onStep`
   * (lines ~614–640 in this file) and `finishRun` so merging the backfill
   * with the live stream in the renderer is lossless.
   *
   * Kept intentionally separate from `getRun` — that returns the full
   * service-internal `AgenticLoopRunState` (including `LoopStep[]` which
   * is not JSON-safe over IPC). `getRunSnapshot` returns the public,
   * renderer-consumable projection.
   */
  function getRunSnapshot(runId: string): AgenticRunSnapshot | null {
    const entry = runs.get(runId);
    if (!entry) return null;
    const { state } = entry;

    const steps: AgentStepPayload[] = state.steps.map((step) => {
      const body = projectStepBody(step);
      return {
        runId: state.runId,
        threadId: state.threadId,
        stepIndex: step.stepIndex,
        kind: body.kind,
        data: body.data,
        tokensIn: step.telemetry.tokensIn,
        tokensOut: step.telemetry.tokensOut,
        costUsd: step.telemetry.costUsd,
        provider: step.telemetry.provider,
        model: step.telemetry.model,
      };
    });

    let terminal: AgenticRunSnapshot['terminal'] = null;
    if (state.endedAt !== null) {
      const durationMs = state.endedAt - state.startedAt;
      if (state.status === 'completed') {
        terminal = {
          kind: 'completed',
          payload: {
            runId: state.runId,
            threadId: state.threadId,
            answer: state.answer ?? '',
            totalSteps: state.steps.length,
            tokensIn: state.promptTokens,
            tokensOut: state.completionTokens,
            costUsd: state.costUsd,
            durationMs,
          },
        };
      } else if (state.status !== 'running') {
        terminal = {
          kind: 'failed',
          payload: {
            runId: state.runId,
            threadId: state.threadId,
            reason: state.errorReason ?? state.status,
            message: state.errorMessage ?? '',
            totalSteps: state.steps.length,
            tokensIn: state.promptTokens,
            tokensOut: state.completionTokens,
            costUsd: state.costUsd,
            durationMs,
          },
        };
      }
    }

    return {
      runId: state.runId,
      threadId: state.threadId,
      steps,
      terminal,
    };
  }

  async function waitForRun(runId: string): Promise<void> {
    const entry = runs.get(runId);
    if (!entry) return;
    await entry.completion;
  }

  return { start, stop, getRun, getRunSnapshot, waitForRun };
}
