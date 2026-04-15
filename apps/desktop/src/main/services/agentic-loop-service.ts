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

// ---------------------------------------------------------------------------
// Narrow structural contracts — mirror the meeting-service pattern so
// tests can inject hand-rolled fakes without pulling the full drizzle
// repo types into the test surface.
// ---------------------------------------------------------------------------

export interface AgenticLoopEmployeesRepo {
  findSystemByRoleId(companyId: string, roleId: string): { id: string } | null;
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
  }): DashboardEvent<T>;
}

export interface AgenticLoopOrchestratorLike {
  isCompanyPaused(companyId: string): boolean;
}

export interface AgenticLoopBudgets {
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
  bus: AgenticLoopEventBus;
  orchestrator: AgenticLoopOrchestratorLike;
  /** Build the read-only tool set for this loop run, scoped to `companyId`. */
  buildTools(args: { companyId: string; signal: AbortSignal }): readonly Tool[];
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
}

export interface StartArgs {
  companyId: string;
  userText: string;
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
        });
      } catch (err) {
        logger.warn('[agentic-loop] agentic.failed emit failed', err);
      }
    }
  }

  async function start(args: StartArgs): Promise<StartResult> {
    const systemAgent = deps.employeesRepo.findSystemByRoleId(args.companyId, SYSTEM_AGENT_ROLE_ID);
    if (!systemAgent) {
      throw new Error(
        `[agentic-loop] No system-agent employee for company "${args.companyId}". Did system-agent-bootstrap run on company creation?`,
      );
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
      memberId: systemAgent.id,
      memberKind: 'employee',
    });

    const userMessageId = deps.messagesRepo.append({
      threadId,
      authorId: deps.humanUserId,
      authorKind: 'user',
      content: args.userText,
    });

    try {
      deps.bus.emit({
        type: 'message.persisted',
        companyId: args.companyId,
        actorId: deps.humanUserId,
        actorKind: 'user',
        payload: { threadId, messageId: userMessageId },
      });
    } catch (err) {
      logger.warn('[agentic-loop] message.persisted emit failed', err);
    }

    // Resolve provider BEFORE writing the runs row so the row carries
    // the actual provider/model identity (telemetry depends on this).
    // A resolver error here propagates — no runs row is written.
    const resolved = await deps.resolveComplete({
      companyId: args.companyId,
      systemAgentId: systemAgent.id,
    });

    const runId = deps.runsRepo.start({
      employeeId: systemAgent.id,
      provider: resolved.provider,
      model: resolved.model,
      threadId,
    });

    const controller = new AbortController();
    const startedAt = now();
    const state: AgenticLoopRunState = {
      runId,
      threadId,
      companyId: args.companyId,
      systemAgentId: systemAgent.id,
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
    });

    const loop: AgenticLoop = createAgenticLoop({
      complete: pauseAwareComplete,
      tools,
      model: resolved.model,
      maxSteps: budgets.maxSteps,
      maxTokens: budgets.maxTokens,
      timeoutMs: budgets.timeoutMs,
      now,
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
          authorId: systemAgent.id,
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
          actorId: systemAgent.id,
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
