/**
 * One model call made outside an agent turn — Enhanced AI fact extraction
 * and query expansion, the command palette's intent classification — held
 * to the same budget and accounting an agent turn is.
 *
 * Those callers used to stream straight from the provider: no admission
 * check, no `runs` row, nothing posted to the ledger, so budget caps did not
 * stop them and budgets, approvals and Telemetry → Cost never saw the
 * tokens. The admission check here is read-only (`isBudgetBlocked`): an
 * auxiliary call is refused at a hard cap, but never pauses the company or
 * files an approval on its own — the agent turn it serves does that.
 */

import { type ProviderStreamFn, streamAgent } from '@team-x/provider-router';

import type { FinishRunInput, StartRunInput } from '../db/repos/runs.js';
import type { CostCalculator } from '../orchestrator/run-agent.js';

export interface GovernedCompletionAccounting {
  runsRepo: {
    start(input: StartRunInput): string;
    finish(id: string, input: FinishRunInput): void;
  };
  calcCost: CostCalculator;
  /** Posts the run's spend to the budget ledger; failures are logged, not thrown. */
  recordRunSpend?: (runId: string) => Promise<void>;
}

export interface GovernedCompletionDeps {
  /** Absent: the call is streamed but not recorded (unit suites, test mode). */
  accounting?: GovernedCompletionAccounting;
  /** True when the company is over a budget hard cap. Read-only. */
  isBudgetBlocked?: (companyId: string) => boolean;
  now?: () => number;
}

export interface GovernedCompletionInput {
  companyId: string;
  /** The employee the run is recorded against (a company's system agent). */
  employeeId: string;
  resolved: { providerName: string; model: string; stream: ProviderStreamFn };
  system: string;
  prompt: string;
  signal?: AbortSignal;
}

/** Thrown when the company is over a budget hard cap; nothing was called. */
export class BudgetBlockedCompletionError extends Error {
  constructor(companyId: string) {
    super(`budget hard cap reached for company "${companyId}" — model call skipped`);
    this.name = 'BudgetBlockedCompletionError';
  }
}

export async function runGovernedCompletion(
  deps: GovernedCompletionDeps,
  input: GovernedCompletionInput,
): Promise<string> {
  if (deps.isBudgetBlocked?.(input.companyId)) {
    throw new BudgetBlockedCompletionError(input.companyId);
  }
  const now = deps.now ?? Date.now;
  const accounting = deps.accounting ?? null;
  const { resolved } = input;

  const runId =
    accounting?.runsRepo.start({
      employeeId: input.employeeId,
      provider: resolved.providerName,
      model: resolved.model,
      kind: 'agentic',
    }) ?? null;

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
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
      ...(input.signal ? { signal: input.signal } : {}),
      ...(runId ? { runId } : {}),
      companyId: input.companyId,
      employeeId: input.employeeId,
    })) {
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
  }

  if (accounting && runId) {
    // Close the run and post spend whether or not the stream finished — a
    // provider that billed tokens before failing still spent the budget.
    accounting.runsRepo.finish(runId, {
      status: streamError ? 'error' : 'success',
      promptTokens,
      completionTokens,
      cacheReadTokens: cachedInputTokens ?? 0,
      cacheWriteTokens: cacheWriteTokens ?? 0,
      latencyMs: Math.max(0, now() - startedAt),
      costUsd: accounting.calcCost({
        provider: resolved.providerName,
        model: resolved.model,
        promptTokens,
        completionTokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
        ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
      }),
      ...(streamError
        ? { error: streamError instanceof Error ? streamError.message : String(streamError) }
        : {}),
    });
    void accounting.recordRunSpend?.(runId).catch((err: unknown) => {
      console.warn('[governed-completion] recordRunSpend failed:', err);
    });
  }

  if (streamError) throw streamError;
  return text;
}
