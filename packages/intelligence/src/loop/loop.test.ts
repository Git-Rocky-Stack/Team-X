/**
 * Unit tests for the M31 T1 agentic loop core.
 *
 * Every test injects:
 *   - a canned `LoopCompleteFn` (fixedResponder / sequenceResponder)
 *     that returns scripted assistant completions + usage counts; and
 *   - zero or more canned tools whose `execute` returns deterministic
 *     fixtures (or throws / sleeps to exercise error paths).
 *
 * The loop never touches a real LLM, a database, or the filesystem.
 * These tests are the contract: any future change to `loop.ts` must
 * either keep all of them green or update them with intent.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createAgenticLoop } from './loop.js';
import { DEFAULT_SYSTEM_PREFIX } from './prompt.js';
import type { LoopCompleteFn, LoopProviderCompletion, LoopStep, Tool } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CompletionPart {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  provider?: string;
  model?: string;
}

function completion(part: CompletionPart): LoopProviderCompletion {
  return {
    text: part.text,
    usage: {
      promptTokens: part.promptTokens ?? 10,
      completionTokens: part.completionTokens ?? 20,
    },
    provider: part.provider ?? 'test',
    model: part.model ?? 'test-model',
    costUsd: part.costUsd ?? 0,
  };
}

function fixedResponder(text: string, part: Partial<CompletionPart> = {}): LoopCompleteFn {
  return vi.fn(async () => completion({ text, ...part }));
}

function sequenceResponder(...parts: Array<string | CompletionPart>): LoopCompleteFn {
  let i = 0;
  return vi.fn(async () => {
    const part = parts[Math.min(i, parts.length - 1)];
    i += 1;
    return typeof part === 'string' ? completion({ text: part }) : completion(part);
  });
}

const QUERY_SCHEMA = z.object({ q: z.string().min(1) });

interface QueryArgs {
  q: string;
}

function makeQueryTool(
  name: string,
  fn: (args: QueryArgs) => unknown = (a) => ({ ok: true, q: a.q }),
): Tool {
  return {
    name,
    description: `Query ${name}`,
    schema: QUERY_SCHEMA,
    execute: vi.fn(async (args: QueryArgs) => fn(args)),
  };
}

function deterministicIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id_${n}`;
  };
}

function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

const ANSWER_HELLO = '{"action":"final_answer","answer":"hello"}';
const ANSWER_DONE = '{"action":"final_answer","answer":"done"}';

// ---------------------------------------------------------------------------
// 1. plan-then-answer
// ---------------------------------------------------------------------------

describe('createAgenticLoop — happy paths', () => {
  it('plan-then-answer: records plan then final answer in a single turn', async () => {
    const loop = createAgenticLoop({
      complete: fixedResponder(`I should just greet them.\n${ANSWER_HELLO}`),
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('say hello');

    expect(run.status).toBe('completed');
    expect(run.answer).toBe('hello');

    const kinds = run.steps.map((s) => s.kind);
    expect(kinds).toEqual(['plan', 'answer']);

    const plan = run.steps[0];
    if (plan.kind !== 'plan') throw new Error('expected plan');
    expect(plan.text).toBe('I should just greet them.');
  });

  it('answer-only: no preamble, just the JSON action', async () => {
    const loop = createAgenticLoop({
      complete: fixedResponder(ANSWER_HELLO),
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('hi');

    expect(run.status).toBe('completed');
    expect(run.answer).toBe('hello');
    expect(run.steps.map((s) => s.kind)).toEqual(['answer']);
  });

  it('plan-then-tool-then-answer: one tool call in the middle', async () => {
    const tool = makeQueryTool('query_employees');
    const loop = createAgenticLoop({
      complete: sequenceResponder(
        `Need to check employees first.\n{"action":"query_employees","args":{"q":"engineers"}}`,
        `Found them.\n${ANSWER_DONE}`,
      ),
      tools: [tool],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('how many engineers?');

    expect(run.status).toBe('completed');
    expect(run.answer).toBe('done');
    expect(run.steps.map((s) => s.kind)).toEqual([
      'plan',
      'tool_call',
      'tool_result',
      'plan',
      'answer',
    ]);

    const toolCall = run.steps[1];
    if (toolCall.kind !== 'tool_call') throw new Error('expected tool_call');
    expect(toolCall.toolName).toBe('query_employees');
    expect(toolCall.args).toEqual({ q: 'engineers' });
  });

  it('multi-tool chain: two distinct tool calls before the final answer', async () => {
    const employees = makeQueryTool('query_employees', () => ({ count: 5 }));
    const tickets = makeQueryTool('query_tickets', () => ({ open: 3 }));

    const loop = createAgenticLoop({
      complete: sequenceResponder(
        `Step 1.\n{"action":"query_employees","args":{"q":"engineers"}}`,
        `Step 2.\n{"action":"query_tickets","args":{"q":"open"}}`,
        `Wrapping up.\n${ANSWER_DONE}`,
      ),
      tools: [employees, tickets],
      maxSteps: 16,
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('summarize the team');

    expect(run.status).toBe('completed');
    const tcs = run.steps.filter((s) => s.kind === 'tool_call');
    expect(tcs).toHaveLength(2);
    expect((tcs[0] as { toolName: string }).toolName).toBe('query_employees');
    expect((tcs[1] as { toolName: string }).toolName).toBe('query_tickets');
  });

  it('empty tools list: model can still answer directly', async () => {
    const loop = createAgenticLoop({
      complete: fixedResponder(ANSWER_HELLO),
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('hi');
    expect(run.status).toBe('completed');
    expect(run.answer).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// 2. budget enforcement
// ---------------------------------------------------------------------------

describe('createAgenticLoop — budget enforcement', () => {
  it('budget step cap: emits error step with reason budget_steps and status budget_exhausted', async () => {
    const tool = makeQueryTool('query_employees');
    const loop = createAgenticLoop({
      complete: fixedResponder(`Looping forever.\n{"action":"query_employees","args":{"q":"x"}}`),
      tools: [tool],
      maxSteps: 3,
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('endless');

    expect(run.status).toBe('budget_exhausted');
    const lastStep = run.steps[run.steps.length - 1];
    if (lastStep.kind !== 'error') throw new Error('expected error step');
    expect(lastStep.reason).toBe('budget_steps');
  });

  it('budget token cap: terminates when cumulative tokens >= maxTokens', async () => {
    const tool = makeQueryTool('query_employees');
    const loop = createAgenticLoop({
      complete: fixedResponder(`Going.\n{"action":"query_employees","args":{"q":"x"}}`, {
        promptTokens: 500,
        completionTokens: 500,
      }),
      tools: [tool],
      maxSteps: 100,
      maxTokens: 1500,
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('go');

    expect(run.status).toBe('budget_exhausted');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('budget_tokens');
  });

  it('budget timeout: terminates when wall-clock exceeds timeoutMs', async () => {
    const clock = makeClock();
    const tool = makeQueryTool('query_employees');
    const responder = vi.fn(async () => {
      // Each LLM call advances the clock by 600ms.
      clock.advance(600);
      return completion({
        text: `looping.\n{"action":"query_employees","args":{"q":"x"}}`,
      });
    });

    const loop = createAgenticLoop({
      complete: responder,
      tools: [tool],
      maxSteps: 100,
      maxTokens: 100_000,
      timeoutMs: 1_000,
      model: 'test-model',
      idGen: deterministicIds(),
      now: clock.now,
    });

    const run = await loop.run('go');

    expect(run.status).toBe('budget_exhausted');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('budget_timeout');
  });
});

// ---------------------------------------------------------------------------
// 3. malformed tool call handling
// ---------------------------------------------------------------------------

describe('createAgenticLoop — malformed tool call handling', () => {
  it('malformed recovery: one bad response, second response good → completes', async () => {
    const responder = sequenceResponder('Garbage with no JSON at all.', ANSWER_DONE);

    const loop = createAgenticLoop({
      complete: responder,
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('try');

    expect(run.status).toBe('completed');
    expect(run.answer).toBe('done');
    // The garbage attempt is recorded as a plan step (so the user sees what happened),
    // and the loop nudges + retries.
    const planSteps = run.steps.filter((s) => s.kind === 'plan');
    expect(planSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('malformed terminal: two malformed responses in a row → failed + tool_call_invalid', async () => {
    const responder = sequenceResponder('No JSON here.', 'Still nothing useful.');

    const loop = createAgenticLoop({
      complete: responder,
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('try');

    expect(run.status).toBe('failed');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('tool_call_invalid');
  });
});

// ---------------------------------------------------------------------------
// 4. tool dispatch failure modes
// ---------------------------------------------------------------------------

describe('createAgenticLoop — tool failure modes', () => {
  it('unknown tool name: terminates with reason tool_unknown', async () => {
    const real = makeQueryTool('query_employees');
    const loop = createAgenticLoop({
      complete: fixedResponder(`{"action":"query_potatoes","args":{"q":"x"}}`),
      tools: [real],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('?');

    expect(run.status).toBe('failed');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('tool_unknown');
  });

  it('tool throws: terminates with reason tool_threw', async () => {
    const broken: Tool = {
      name: 'broken',
      description: 'always throws',
      schema: QUERY_SCHEMA,
      execute: vi.fn(async () => {
        throw new Error('kaboom');
      }),
    };

    const loop = createAgenticLoop({
      complete: fixedResponder(`{"action":"broken","args":{"q":"x"}}`),
      tools: [broken],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('?');

    expect(run.status).toBe('failed');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('tool_threw');
    expect(last.message).toContain('kaboom');
  });

  it('tool timeout: terminates with reason tool_timeout', async () => {
    const slow: Tool = {
      name: 'slow',
      description: 'never resolves',
      schema: QUERY_SCHEMA,
      execute: vi.fn(
        (_args, ctx) =>
          new Promise<unknown>((_resolve, reject) => {
            ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      ),
    };

    const loop = createAgenticLoop({
      complete: fixedResponder(`{"action":"slow","args":{"q":"x"}}`),
      tools: [slow],
      toolTimeoutMs: 10,
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('?');

    expect(run.status).toBe('failed');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('tool_timeout');
  });
});

// ---------------------------------------------------------------------------
// 5. system prompt + telemetry + onStep + cancel + provider error
// ---------------------------------------------------------------------------

describe('createAgenticLoop — system prompt, telemetry, onStep, cancel', () => {
  it('custom system prompt: passed through to complete()', async () => {
    const responder = vi.fn(async () => completion({ text: ANSWER_HELLO }));
    const loop = createAgenticLoop({
      complete: responder,
      tools: [],
      model: 'test-model',
      systemPrompt: 'YOU ARE A PIRATE.',
      idGen: deterministicIds(),
    });

    await loop.run('hi');

    const callArg = responder.mock.calls[0][0];
    expect(callArg.system).toContain('YOU ARE A PIRATE.');
    expect(callArg.system).not.toContain(DEFAULT_SYSTEM_PREFIX);
  });

  it('default system prompt: includes all tool names in the listing', async () => {
    const responder = vi.fn(async () => completion({ text: ANSWER_HELLO }));
    const loop = createAgenticLoop({
      complete: responder,
      tools: [makeQueryTool('query_employees'), makeQueryTool('query_tickets')],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    await loop.run('hi');

    const sys = responder.mock.calls[0][0].system;
    expect(sys).toContain('query_employees');
    expect(sys).toContain('query_tickets');
    expect(sys).toContain(DEFAULT_SYSTEM_PREFIX);
  });

  it('onStep: fires synchronously in the same order steps land in the run', async () => {
    const tool = makeQueryTool('query_employees');
    const observed: LoopStep[] = [];
    const loop = createAgenticLoop({
      complete: sequenceResponder(
        `Plan A.\n{"action":"query_employees","args":{"q":"x"}}`,
        `Plan B.\n${ANSWER_DONE}`,
      ),
      tools: [tool],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('go', {
      onStep: (s) => observed.push(s),
    });

    expect(observed.map((s) => s.kind)).toEqual(run.steps.map((s) => s.kind));
    // step indices are monotonic
    for (let i = 0; i < observed.length; i++) {
      expect(observed[i].stepIndex).toBe(i);
    }
  });

  it('cancel: external AbortSignal aborts the run with status canceled', async () => {
    const ctrl = new AbortController();
    ctrl.abort();

    const loop = createAgenticLoop({
      complete: fixedResponder(ANSWER_HELLO),
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('hi', { signal: ctrl.signal });

    expect(run.status).toBe('canceled');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('canceled');
  });

  it('provider error: terminates with reason provider_error and status failed', async () => {
    const responder: LoopCompleteFn = vi.fn(async () => {
      throw new Error('upstream 503');
    });

    const loop = createAgenticLoop({
      complete: responder,
      tools: [],
      model: 'test-model',
      idGen: deterministicIds(),
    });

    const run = await loop.run('hi');

    expect(run.status).toBe('failed');
    const last = run.steps[run.steps.length - 1];
    if (last.kind !== 'error') throw new Error('expected error step');
    expect(last.reason).toBe('provider_error');
    expect(last.message).toContain('upstream 503');
  });

  it('telemetry: every step carries provider/model/tokens/cost; run.used aggregates them', async () => {
    const tool = makeQueryTool('query_employees');
    const loop = createAgenticLoop({
      complete: sequenceResponder(
        {
          text: `Plan.\n{"action":"query_employees","args":{"q":"x"}}`,
          promptTokens: 100,
          completionTokens: 50,
          costUsd: 0.01,
          provider: 'anthropic',
          model: 'claude-haiku',
        },
        {
          text: `Done.\n${ANSWER_DONE}`,
          promptTokens: 200,
          completionTokens: 25,
          costUsd: 0.02,
          provider: 'anthropic',
          model: 'claude-haiku',
        },
      ),
      tools: [tool],
      model: 'claude-haiku',
      idGen: deterministicIds(),
    });

    const run = await loop.run('measure me');

    expect(run.status).toBe('completed');
    expect(run.used.tokensIn).toBe(300);
    expect(run.used.tokensOut).toBe(75);
    expect(run.used.costUsd).toBeCloseTo(0.03, 5);

    // Plan steps carry telemetry; tool_result carries zero telemetry.
    const planA = run.steps[0];
    if (planA.kind !== 'plan') throw new Error('expected plan');
    expect(planA.telemetry.provider).toBe('anthropic');
    expect(planA.telemetry.tokensIn).toBe(100);

    const toolResult = run.steps.find((s) => s.kind === 'tool_result');
    if (!toolResult || toolResult.kind !== 'tool_result') throw new Error('expected tool_result');
    expect(toolResult.telemetry.tokensIn).toBe(0);
    expect(toolResult.telemetry.tokensOut).toBe(0);
  });
});
