/**
 * Copilot "budget exhausted" trigger vs. the reason a real run reports.
 *
 * `CopilotEventTrigger` fires a supplementary analyzer tick when an agentic
 * run fails on a budget. The only emitter of `agentic.failed` is
 * `finishRun` in `agentic-loop-service.ts`, and it reports the loop's
 * terminal `LoopErrorReason` (`budget_steps`, `budget_tokens`, ...), not
 * the run status `budget_exhausted`.
 *
 * So nothing here hand-builds an `agentic.failed` payload. Each case drives
 * the real `createAgenticLoopService` (and the real loop inside it) into a
 * terminal state, lets the service emit on a real `createEventBus` backed
 * by the real events repo, and has the real `createCopilotEventTrigger`
 * subscribed to that same bus. The fakes are the provider completion (the
 * network boundary), the persistence ports the reason never passes
 * through, and the analyzer the trigger dispatches to.
 */

import type {
  LoopCompleteFn,
  LoopErrorReason,
  LoopProviderCompletion,
  Tool,
} from '@team-x/intelligence';
import type { CopilotAnalyzedReason, DashboardEvent } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createEventsRepo } from '../db/repos/events.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createEventBus } from '../orchestrator/event-bus.js';

import {
  type AgenticLoopBudgets,
  type AgenticLoopService,
  budgetsFromAgenticSettings,
  createAgenticLoopService,
} from './agentic-loop-service.js';
import { createCopilotEventTrigger } from './copilot-event-trigger.js';

const COMPANY_ID = 'co-budget';

/** `LoopErrorReason` split on its own naming: the budget caps vs. everything else. */
type BudgetReason = Extract<LoopErrorReason, `budget_${string}`>;
type NonBudgetReason = Exclude<LoopErrorReason, BudgetReason>;

/** One provider turn that asks for `toolName` and reports 15 tokens of usage. */
function toolTurn(toolName: string, args: Record<string, unknown> = {}): LoopCompleteFn {
  let call = 0;
  return async (): Promise<LoopProviderCompletion> => {
    call += 1;
    return {
      text: '',
      toolCalls: [{ toolCallId: `tc_${call}`, toolName, args }],
      usage: { promptTokens: 10, completionTokens: 5 },
      provider: 'fake',
      model: 'fake-model',
      costUsd: 0,
    };
  };
}

/** A provider turn that never returns until the run is aborted. */
const hangUntilAborted: LoopCompleteFn = (req) =>
  new Promise<LoopProviderCompletion>((_resolve, reject) => {
    req.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });

const PROBE_TOOL: Tool = {
  name: 'probe',
  description: 'Probe tool. Requires a numeric `n`.',
  schema: z.object({ n: z.number() }),
  async execute(): Promise<unknown> {
    return { ok: true };
  },
};

const THROWING_TOOL: Tool = {
  name: 'explode',
  description: 'Always throws.',
  schema: z.object({}),
  async execute(): Promise<unknown> {
    throw new Error('tool blew up');
  },
};

const ROOMY: AgenticLoopBudgets = { maxSteps: 64, maxTokens: 8000, timeoutMs: 5000 };

interface Scenario {
  budgets: AgenticLoopBudgets;
  complete: LoopCompleteFn;
  /** Abort the run once it is in flight (drives the `canceled` reason). */
  stop?: boolean;
}

/**
 * One scenario per budget cap the loop enforces. The record is keyed by the
 * budget members of `LoopErrorReason`, so adding a budget reason to the loop
 * without a case here is a compile error.
 */
const BUDGET_SCENARIOS: Record<BudgetReason, Scenario> = {
  budget_iterations: {
    budgets: budgetsFromAgenticSettings({ maxSteps: 2, maxTokens: 8000, timeoutMs: 5000 }),
    complete: toolTurn('probe', { n: 1 }),
  },
  budget_steps: {
    budgets: { maxSteps: 3, maxTokens: 8000, timeoutMs: 5000 },
    complete: toolTurn('probe', { n: 1 }),
  },
  budget_tokens: {
    budgets: { maxSteps: 64, maxTokens: 10, timeoutMs: 5000 },
    complete: toolTurn('probe', { n: 1 }),
  },
  budget_timeout: {
    budgets: { maxSteps: 64, maxTokens: 8000, timeoutMs: 0 },
    complete: toolTurn('probe', { n: 1 }),
  },
};

/**
 * Failures that are NOT a budget cap. Keyed by the rest of `LoopErrorReason`
 * for the same reason. `tool_timeout` is absent on purpose: the service does
 * not expose the loop's 30 s tool timeout, so it cannot be driven here.
 */
const NON_BUDGET_SCENARIOS: Record<Exclude<NonBudgetReason, 'tool_timeout'>, Scenario> = {
  provider_error: {
    budgets: ROOMY,
    complete: async () => {
      throw new Error('provider unreachable');
    },
  },
  tool_unknown: { budgets: ROOMY, complete: toolTurn('no_such_tool') },
  tool_call_invalid: { budgets: ROOMY, complete: toolTurn('probe', { n: 'not-a-number' }) },
  tool_threw: { budgets: ROOMY, complete: toolTurn('explode') },
  canceled: { budgets: ROOMY, complete: hangUntilAborted, stop: true },
};

describe('copilot budget trigger over a real agentic run', () => {
  let ctx: TestDbHandle;

  beforeEach(async () => {
    ctx = await makeTestDb();
  });

  afterEach(() => {
    ctx.close();
  });

  /**
   * Run one scenario through the real service with the real trigger listening
   * on the same real bus. Returns the reason the service reported and every
   * analyzer tick the trigger dispatched once its debounce elapsed.
   */
  async function runScenario(scenario: Scenario): Promise<{
    failedReasons: string[];
    ticks: Array<{ companyId: string; reason: CopilotAnalyzedReason | undefined }>;
  }> {
    const bus = createEventBus({ repo: createEventsRepo(ctx.db) });

    const failedReasons: string[] = [];
    bus.subscribe((event: DashboardEvent) => {
      if (event.type === 'agentic.failed') {
        failedReasons.push((event.payload as { reason: string }).reason);
      }
    });

    // The trigger's debounce timer is injectable; hold the callbacks so the
    // test decides when the 30 s window "elapses".
    const debounced: Array<() => void> = [];
    const ticks: Array<{ companyId: string; reason: CopilotAnalyzedReason | undefined }> = [];
    const trigger = createCopilotEventTrigger({
      bus,
      analyzer: {
        tick: async (companyId, opts) => {
          ticks.push({ companyId, reason: opts?.reason });
          return {
            runId: `tick-${ticks.length}`,
            reason: opts?.reason ?? 'manual',
            insightsProposed: 0,
            insightsGenerated: 0,
            insightsMerged: 0,
            insightsExpired: 0,
            criticalProposed: 0,
            criticalDowngraded: 0,
            status: 'success',
            errorMessage: null,
          };
        },
      },
      setTimeout: ((fn: () => void) => {
        debounced.push(fn);
        return debounced.length;
      }) as unknown as typeof setTimeout,
      clearTimeout: ((handle: number) => {
        debounced[handle - 1] = () => undefined;
      }) as unknown as typeof clearTimeout,
    });
    trigger.start();

    let ids = 0;
    const service: AgenticLoopService = createAgenticLoopService({
      employeesRepo: { findSystemByRoleId: () => ({ id: 'emp-system-agent' }) },
      threadsRepo: { create: () => `thr-${++ids}`, addMember: () => undefined },
      messagesRepo: { append: () => `msg-${++ids}` },
      runsRepo: { start: () => `run-${++ids}`, finish: () => undefined },
      bus,
      orchestrator: { isCompanyPaused: () => false },
      buildTools: () => [PROBE_TOOL, THROWING_TOOL],
      resolveComplete: async () => ({
        complete: scenario.complete,
        provider: 'fake',
        model: 'fake-model',
      }),
      getBudgets: () => scenario.budgets,
      humanUserId: 'rocky',
      pauseGatePollMs: 2,
    });

    const { runId } = await service.start({ companyId: COMPANY_ID, userText: 'do the thing' });
    if (scenario.stop) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      service.stop(runId);
    }
    await service.waitForRun(runId);

    for (const fire of debounced) fire();
    await Promise.resolve();
    trigger.stop();

    return { failedReasons, ticks };
  }

  for (const reason of Object.keys(BUDGET_SCENARIOS) as BudgetReason[]) {
    it(`fires an agentic.budget_exhausted tick when a run dies on ${reason}`, async () => {
      const { failedReasons, ticks } = await runScenario(BUDGET_SCENARIOS[reason]);

      // The scenario really tripped the cap it is named for...
      expect(failedReasons).toEqual([reason]);
      // ...and the trigger turned that real event into one analyzer tick.
      expect(ticks).toEqual([{ companyId: COMPANY_ID, reason: 'agentic.budget_exhausted' }]);
    });
  }

  for (const reason of Object.keys(NON_BUDGET_SCENARIOS) as Array<
    keyof typeof NON_BUDGET_SCENARIOS
  >) {
    it(`stays quiet when a run fails on ${reason}, which is not a budget cap`, async () => {
      const { failedReasons, ticks } = await runScenario(NON_BUDGET_SCENARIOS[reason]);

      expect(failedReasons).toEqual([reason]);
      expect(ticks).toEqual([]);
    });
  }
});
