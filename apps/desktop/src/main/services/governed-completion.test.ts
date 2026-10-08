/**
 * runGovernedCompletion — one model call outside an agent turn (Enhanced AI
 * fact extraction / query expansion, palette classification) that is still
 * held to the company's budget and shows up in its runs and spend.
 *
 * Before it, both paths streamed straight from the provider: no admission
 * check, no `runs` row, nothing posted to the ledger, so budgets, approvals
 * and Telemetry → Cost never saw the tokens.
 */
import type { ProviderStreamEvent, ProviderStreamFn } from '@team-x/provider-router';
import { describe, expect, it, vi } from 'vitest';

import type { FinishRunInput, StartRunInput } from '../db/repos/runs.js';

import { BudgetBlockedCompletionError, runGovernedCompletion } from './governed-completion.js';

function stream(reply: string, fail?: Error): ProviderStreamFn {
  return async function* (): AsyncGenerator<ProviderStreamEvent> {
    yield { delta: reply };
    if (fail) throw fail;
    yield { done: true, usage: { promptTokens: 30, completionTokens: 12 } };
  };
}

function harness(overrides: { blocked?: boolean } = {}) {
  const started: StartRunInput[] = [];
  const finished: Array<{ id: string; input: FinishRunInput }> = [];
  const recordRunSpend = vi.fn(async () => undefined);
  const deps = {
    accounting: {
      runsRepo: {
        start: (input: StartRunInput) => {
          started.push(input);
          return `run-${started.length}`;
        },
        finish: (id: string, input: FinishRunInput) => {
          finished.push({ id, input });
        },
      },
      calcCost: () => '0.000420',
      recordRunSpend,
    },
    isBudgetBlocked: () => overrides.blocked ?? false,
    now: () => 1_000,
  };
  return { deps, started, finished, recordRunSpend };
}

const target = {
  companyId: 'co-1',
  employeeId: 'sys-co-1',
  resolved: { providerName: 'anthropic', model: 'claude-haiku-4-5', stream: stream('hello') },
};

describe('runGovernedCompletion', () => {
  it('returns the reply and records a run with tokens and cost, then posts the spend', async () => {
    const { deps, started, finished, recordRunSpend } = harness();

    const text = await runGovernedCompletion(deps, { ...target, system: 'S', prompt: 'P' });

    expect(text).toBe('hello');
    expect(started).toEqual([
      expect.objectContaining({
        employeeId: 'sys-co-1',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        kind: 'agentic',
      }),
    ]);
    expect(finished).toEqual([
      {
        id: 'run-1',
        input: expect.objectContaining({
          status: 'success',
          promptTokens: 30,
          completionTokens: 12,
          costUsd: '0.000420',
        }),
      },
    ]);
    expect(recordRunSpend).toHaveBeenCalledWith('run-1');
  });

  it('refuses before calling the provider when the company is over a hard cap', async () => {
    const { deps, started } = harness({ blocked: true });
    const provider = vi.fn(stream('never'));

    await expect(
      runGovernedCompletion(deps, {
        ...target,
        resolved: { ...target.resolved, stream: provider },
        system: 'S',
        prompt: 'P',
      }),
    ).rejects.toBeInstanceOf(BudgetBlockedCompletionError);
    expect(provider).not.toHaveBeenCalled();
    expect(started).toEqual([]);
  });

  it('closes the run as an error and still posts spend when the stream fails', async () => {
    const { deps, finished, recordRunSpend } = harness();

    await expect(
      runGovernedCompletion(deps, {
        ...target,
        resolved: { ...target.resolved, stream: stream('par', new Error('socket hang up')) },
        system: 'S',
        prompt: 'P',
      }),
    ).rejects.toThrow('socket hang up');
    expect(finished[0]?.input).toMatchObject({ status: 'error', error: 'socket hang up' });
    expect(recordRunSpend).toHaveBeenCalledWith('run-1');
  });

  it('streams without accounting when none is wired', async () => {
    await expect(runGovernedCompletion({}, { ...target, system: 'S', prompt: 'P' })).resolves.toBe(
      'hello',
    );
  });
});
