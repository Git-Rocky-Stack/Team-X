/**
 * Copilot service — front-door for `copilot.ask` that wraps
 * `AgenticLoopService.start` with the company's `system-copilot`
 * pseudo-employee as the actor.
 *
 * Phase 5 — M33 T6.
 *
 * M31 `CommandService.complex_request` uses `system-agent` as the actor
 * for the ReAct loop. T6 introduces a PARALLEL surface for the Copilot
 * UI: when Rocky asks a natural-language question from the Copilot side
 * panel (M34), the answer is grounded on the same ReAct harness but the
 * actor is `system-copilot` — a second framework-internal pseudo-
 * employee that owns its own Copilot Conversations thread in the
 * sidenav. This service is the one place that resolves the
 * system-copilot employee id per company and passes it through to
 * `AgenticLoopService.start` via the explicit `employeeId` argument
 * (M32 T3 surface). The start call's return is threaded back out
 * unchanged so the wire contract for `copilot.ask` matches the M31
 * `complex_request` branch field-for-field — the M34 sidebar attaches
 * `useAgentStepStream` with no second wire format.
 *
 * The service is intentionally TINY (one method, one repo lookup, one
 * delegation) because:
 *   - Thread resolution is owned by `AgenticLoopService.start` — it
 *     already creates a fresh thread per run and authors the user +
 *     agent membership under the actor employee's identity (see
 *     `agentic-loop-service.ts` line 597-613). No separate thread
 *     helper belongs here.
 *   - The level-gated tool registry is owned by `buildTools` in the
 *     composition root (per M32 T3 pattern); the
 *     `buildCopilotToolRegistry` branch observes
 *     `employee.roleId === SYSTEM_COPILOT_ROLE_ID` and swaps the
 *     write-side tools for the copilot tool set.
 *   - Budget / provider / pause-gate plumbing is shared with the M31
 *     agentic loop by construction — copilot.ask is just a different
 *     actor invoking the same scheduler.
 *
 * The single invariant enforced here: the service MUST fail cleanly
 * when the system-copilot employee is missing (e.g., a company
 * created before migration 0011 / T2's ensureSystemCopilot landed).
 * The analyzer is the other consumer of `findSystemByRoleId` with the
 * same roleId, so the error message format mirrors
 * `copilot-analyzer-service.ts` to give Rocky a single grep target.
 */

import { SYSTEM_COPILOT_ROLE_ID } from '@team-x/shared-types';

// ---------------------------------------------------------------------------
// Dependency surface
// ---------------------------------------------------------------------------

/** Minimal agentic-loop entry point this service calls. Matches the
 *  M31 `AgenticLoopService.start` shape field-for-field but declared
 *  as a narrow interface so tests pass plain object doubles. */
export interface CopilotServiceAgenticLoop {
  start(args: {
    companyId: string;
    userText: string;
    employeeId?: string;
  }): Promise<{ runId: string; threadId: string }>;
}

/** Minimal repo surface — only `findSystemByRoleId` is called. */
export interface CopilotServiceEmployeesRepo {
  findSystemByRoleId(companyId: string, roleId: string): { id: string } | null;
}

/** Where a finished exchange is remembered — `EnhancedAiService.extractAndStoreFacts`. */
export interface CopilotServiceMemory {
  remember(companyId: string, sourceId: string, conversation: string): Promise<unknown>;
}

/** The slice of the event bus this service listens on. */
export interface CopilotServiceBus {
  subscribe(
    listener: (event: { type: string; companyId: string; payload: unknown }) => void,
  ): () => void;
}

export interface CopilotServiceDeps {
  readonly agenticLoopService: CopilotServiceAgenticLoop;
  readonly employeesRepo: CopilotServiceEmployeesRepo;
  /**
   * Long-term memory. With both `memory` and `bus` wired, every completed
   * `copilot.ask` run is handed to memory as a question/answer exchange, so
   * facts it establishes are recalled by later questions. Omitted, asks work
   * exactly as before and nothing is remembered.
   */
  readonly memory?: CopilotServiceMemory;
  readonly bus?: CopilotServiceBus;
  readonly logger?: { warn(message: string, err?: unknown): void };
}

// ---------------------------------------------------------------------------
// Service surface
// ---------------------------------------------------------------------------

export interface CopilotAskRequest {
  readonly companyId: string;
  readonly text: string;
}

export interface CopilotAskResult {
  readonly runId: string;
  readonly threadId: string;
}

export interface CopilotService {
  ask(req: CopilotAskRequest): Promise<CopilotAskResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** How many finished-but-unclaimed runs to hold while their ask() resolves. */
const SETTLED_BUFFER_LIMIT = 50;

export function createCopilotService(deps: CopilotServiceDeps): CopilotService {
  const logger = deps.logger ?? { warn: (message, err) => console.warn(message, err) };

  // Runs this service started and is waiting on, by run id.
  const pending = new Map<string, { companyId: string; text: string }>();
  // Runs that finished before `ask` registered them: a run can complete
  // while `start` is still resolving. `null` marks a failure.
  const settledEarly = new Map<string, string | null>();

  function remember(
    runId: string,
    exchange: { companyId: string; text: string },
    answer: string | null,
  ): void {
    if (!deps.memory || answer === null || answer.trim().length === 0) return;
    void deps.memory
      .remember(
        exchange.companyId,
        `copilot-run:${runId}`,
        `User: ${exchange.text}\nCopilot: ${answer}`,
      )
      .catch((err: unknown) =>
        logger.warn('[copilot-service] remembering an exchange failed', err),
      );
  }

  if (deps.memory && deps.bus) {
    deps.bus.subscribe((event) => {
      if (event.type !== 'agentic.completed' && event.type !== 'agentic.failed') return;
      const payload = event.payload as { runId?: unknown; answer?: unknown } | null;
      if (typeof payload?.runId !== 'string') return;
      const answer =
        event.type === 'agentic.completed' && typeof payload.answer === 'string'
          ? payload.answer
          : null;

      const exchange = pending.get(payload.runId);
      if (exchange) {
        pending.delete(payload.runId);
        remember(payload.runId, exchange, answer);
        return;
      }
      // Not ours yet (or not ours at all). Hold it briefly in case `ask` is
      // about to claim it; the buffer is bounded, oldest first out.
      settledEarly.set(payload.runId, answer);
      if (settledEarly.size > SETTLED_BUFFER_LIMIT) {
        const oldest = settledEarly.keys().next().value;
        if (oldest !== undefined) settledEarly.delete(oldest);
      }
    });
  }

  return {
    async ask(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[copilot-service] ask: companyId is required');
      }
      if (typeof req.text !== 'string' || req.text.trim().length === 0) {
        throw new Error('[copilot-service] ask: text is required');
      }

      const sys = deps.employeesRepo.findSystemByRoleId(req.companyId, SYSTEM_COPILOT_ROLE_ID);
      if (sys === null) {
        throw new Error(
          `[copilot-service] No system-copilot employee for company "${req.companyId}". Did ensureSystemCopilot run on company creation?`,
        );
      }

      const result = await deps.agenticLoopService.start({
        companyId: req.companyId,
        userText: req.text,
        employeeId: sys.id,
      });

      if (deps.memory && deps.bus) {
        const exchange = { companyId: req.companyId, text: req.text };
        if (settledEarly.has(result.runId)) {
          const answer = settledEarly.get(result.runId) ?? null;
          settledEarly.delete(result.runId);
          remember(result.runId, exchange, answer);
        } else {
          pending.set(result.runId, exchange);
        }
      }

      return { runId: result.runId, threadId: result.threadId };
    },
  };
}
