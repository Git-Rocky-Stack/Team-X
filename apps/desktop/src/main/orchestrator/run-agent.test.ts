/**
 * runAgent integration tests.
 *
 * The test stack is intentionally as close to production wiring as the
 * sql.js test database allows: real bus, real events repo, real messages
 * repo, real runs repo, real company/employee/thread rows seeded via the
 * existing factory repos. Only the LLM provider is faked — that's the
 * boundary T30 is built around.
 *
 * Why integration over a mock-everything unit test:
 * runAgent's whole job is to coordinate four collaborators (bus, messages,
 * runs, provider). Mocking all four would prove only that runAgent calls
 * the methods we wrote into runAgent — a tautology. Wiring real repos
 * proves the resulting database and event log actually look like what the
 * renderer will see in production.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import type {
  DashboardEvent,
  TokenDeltaPayload,
  WorkCompletedPayload,
  WorkStartedPayload,
} from '@team-x/shared-types';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createEventBus } from './event-bus.js';
import { type CostCalculator, runAgent } from './run-agent.js';

interface Fixture {
  ctx: TestDbHandle;
  bus: ReturnType<typeof createEventBus>;
  messages: ReturnType<typeof createMessagesRepo>;
  runs: ReturnType<typeof createRunsRepo>;
  events: ReturnType<typeof createEventsRepo>;
  companyId: string;
  employeeId: string;
  threadId: string;
  calcCost: CostCalculator;
  /** Capture every cost-calc invocation so tests can assert routing. */
  costCalls: Array<Parameters<CostCalculator>[0]>;
}

async function buildFixture(): Promise<Fixture> {
  const ctx = await makeTestDb();
  const companies = createCompaniesRepo(ctx.db);
  const employees = createEmployeesRepo(ctx.db);
  const threads = createThreadsRepo(ctx.db);
  const messages = createMessagesRepo(ctx.db);
  const runs = createRunsRepo(ctx.db);
  const events = createEventsRepo(ctx.db);
  const bus = createEventBus({ repo: events });

  const companyId = companies.create({
    name: 'Strategia-X',
    slug: 'strategia-x',
    settings: { mission: 'm', values: ['q'] },
  });
  const employeeId = employees.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha-test',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
  });
  const threadId = threads.create({
    companyId,
    kind: 'dm',
    createdBy: employeeId,
  });

  const costCalls: Fixture['costCalls'] = [];
  const calcCost: CostCalculator = (args) => {
    costCalls.push(args);
    // Deterministic synthetic price: $0.001 per prompt token + $0.002 per
    // completion token. Returned as a string since the runs.costUsd
    // column is stored as a decimal string.
    const usd = args.promptTokens * 0.001 + args.completionTokens * 0.002;
    return usd.toFixed(6);
  };

  return {
    ctx,
    bus,
    messages,
    runs,
    events,
    companyId,
    employeeId,
    threadId,
    calcCost,
    costCalls,
  };
}

/**
 * Build a fake provider stream factory that yields the supplied deltas
 * followed by a `done` chunk with the supplied usage. Mirrors the
 * ProviderStreamFn contract: an async generator that emits
 * `{ delta }` and `{ done, usage }` records — `streamAgent` normalizes
 * those into `{ kind: 'delta' | 'done' }` chunks.
 */
function fakeProvider(deltas: string[], usage: StreamUsage): ProviderStreamFn {
  return async function* () {
    for (const d of deltas) {
      yield { delta: d };
    }
    yield { done: true, usage };
  };
}

/** Async generator that throws after yielding the supplied deltas. */
function failingProvider(deltas: string[], err: Error): ProviderStreamFn {
  return async function* () {
    for (const d of deltas) {
      yield { delta: d };
    }
    throw err;
  };
}

/** Async generator that closes without ever emitting `done`. */
function noDoneProvider(deltas: string[]): ProviderStreamFn {
  return async function* () {
    for (const d of deltas) {
      yield { delta: d };
    }
  };
}

function abortableProvider(
  started: { resolve: () => void },
  captured: { signal?: AbortSignal } = {},
): ProviderStreamFn {
  return async function* ({ signal }) {
    captured.signal = signal;
    yield { delta: 'partial' };
    started.resolve();
    await new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };
}

const baseHistory: StreamMessage[] = [
  { role: 'system', content: 'system goes here' },
  { role: 'user', content: 'hello' },
];

describe('runAgent', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await buildFixture();
  });

  afterEach(() => {
    f.ctx.close();
  });

  describe('happy path', () => {
    it('streams 3 deltas and persists message + run + events end-to-end', async () => {
      const provider = fakeProvider(['Hel', 'lo, ', 'world!'], {
        promptTokens: 10,
        completionTokens: 5,
      });

      let nowCounter = 1_000;
      const result = await runAgent(
        {
          bus: f.bus,
          messages: f.messages,
          runs: f.runs,
          calcCost: f.calcCost,
          // Deterministic clock — start at 1000, end at 1042 → 42ms latency.
          now: () => {
            const v = nowCounter;
            nowCounter += 42;
            return v;
          },
        },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 'You are a CEO.',
          messages: baseHistory,
          provider,
          providerName: 'fake-provider',
          model: 'fake-model',
        },
      );

      // -- Result object --
      expect(result.messageId).toBeTypeOf('string');
      expect(result.runId).toBeTypeOf('string');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(5);
      expect(result.latencyMs).toBe(42);
      expect(result.costUsd).toBe('0.020000'); // 10*0.001 + 5*0.002

      // -- Message row --
      const msgs = f.messages.listByThread(f.threadId);
      expect(msgs).toHaveLength(1);
      const msg = msgs[0];
      expect(msg?.id).toBe(result.messageId);
      expect(msg?.authorId).toBe(f.employeeId);
      expect(msg?.authorKind).toBe('employee');
      expect(msg?.content).toBe('Hello, world!');

      // -- Run row --
      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows).toHaveLength(1);
      const run = runRows[0];
      expect(run?.id).toBe(result.runId);
      expect(run?.status).toBe('success');
      expect(run?.promptTokens).toBe(10);
      expect(run?.completionTokens).toBe(5);
      expect(run?.latencyMs).toBe(42);
      expect(run?.costUsd).toBe('0.020000');
      expect(run?.provider).toBe('fake-provider');
      expect(run?.model).toBe('fake-model');
      expect(run?.threadId).toBe(f.threadId);
      expect(run?.endedAt).not.toBeNull();
      expect(run?.error).toBeNull();

      // -- Cost calc was invoked exactly once with the right arguments --
      expect(f.costCalls).toEqual([
        {
          provider: 'fake-provider',
          model: 'fake-model',
          promptTokens: 10,
          completionTokens: 5,
        },
      ]);

      // -- Event sequence (replayed from the DB) --
      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual([
        'work.started',
        'token.delta',
        'token.delta',
        'token.delta',
        'work.completed',
      ]);

      // work.started payload
      const started = events[0] as DashboardEvent<WorkStartedPayload>;
      expect(started.actorKind).toBe('orchestrator');
      expect(started.actorId).toBe('orchestrator');
      expect(started.companyId).toBe(f.companyId);
      expect(started.payload).toEqual({
        threadId: f.threadId,
        employeeId: f.employeeId,
        provider: 'fake-provider',
        model: 'fake-model',
      });

      // token.delta payloads
      const deltaEvents = events.slice(1, 4) as DashboardEvent<TokenDeltaPayload>[];
      expect(deltaEvents.map((e) => e.payload.delta)).toEqual(['Hel', 'lo, ', 'world!']);
      for (const e of deltaEvents) {
        expect(e.payload.threadId).toBe(f.threadId);
        expect(e.payload.messageId).toBe(result.messageId);
        expect(e.actorKind).toBe('employee');
        expect(e.actorId).toBe(f.employeeId);
      }

      // work.completed payload
      const completed = events[4] as DashboardEvent<WorkCompletedPayload>;
      expect(completed.actorKind).toBe('orchestrator');
      expect(completed.payload).toEqual({
        threadId: f.threadId,
        messageId: result.messageId,
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: 42,
        costUsd: 0.02,
      });
    });

    it('updates message content incrementally as each delta arrives', async () => {
      // Capture the content the message held immediately after each
      // updateContent call by spying on it through a wrapped repo.
      const contentSnapshots: string[] = [];
      const wrappedMessages = {
        append: f.messages.append,
        updateContent: (id: string, content: string) => {
          contentSnapshots.push(content);
          f.messages.updateContent(id, content);
        },
      };

      const provider = fakeProvider(['a', 'b', 'c'], {
        promptTokens: 1,
        completionTokens: 3,
      });

      await runAgent(
        {
          bus: f.bus,
          messages: wrappedMessages,
          runs: f.runs,
          calcCost: f.calcCost,
        },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider,
          providerName: 'p',
          model: 'm',
        },
      );

      // updateContent must be called once per delta, with the
      // CUMULATIVE content — not the individual chunk.
      expect(contentSnapshots).toEqual(['a', 'ab', 'abc']);
    });

    it('emits work.started before any token.delta', async () => {
      const order: string[] = [];
      f.bus.subscribe((e) => order.push(e.type));

      await runAgent(
        {
          bus: f.bus,
          messages: f.messages,
          runs: f.runs,
          calcCost: f.calcCost,
        },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider: fakeProvider(['x'], { promptTokens: 1, completionTokens: 1 }),
          providerName: 'p',
          model: 'm',
        },
      );

      expect(order[0]).toBe('work.started');
      expect(order[order.length - 1]).toBe('work.completed');
    });

    it('persists the assistant message row at start, before the first delta', async () => {
      // Pause the provider after start so we can inspect DB state mid-stream.
      let firstDeltaResolve: (() => void) | null = null;
      const firstDeltaSeen = new Promise<void>((res) => {
        firstDeltaResolve = res;
      });
      let proceedAfterCheck: () => void = () => {};
      const continueStream = new Promise<void>((res) => {
        proceedAfterCheck = res;
      });

      const provider: ProviderStreamFn = async function* () {
        yield { delta: 'x' };
        firstDeltaResolve?.();
        await continueStream;
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      const runP = runAgent(
        {
          bus: f.bus,
          messages: f.messages,
          runs: f.runs,
          calcCost: f.calcCost,
        },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider,
          providerName: 'p',
          model: 'm',
        },
      );

      // After the first delta but before `done`, the message row must
      // already exist with the partial content "x".
      await firstDeltaSeen;
      const midRow = f.messages.listByThread(f.threadId);
      expect(midRow).toHaveLength(1);
      expect(midRow[0]?.content).toBe('x');
      // The runs row also exists with status='running'.
      const midRuns = f.runs.listByEmployee(f.employeeId);
      expect(midRuns).toHaveLength(1);
      expect(midRuns[0]?.status).toBe('running');

      // Let the stream finish.
      proceedAfterCheck();
      await runP;

      const finalRuns = f.runs.listByEmployee(f.employeeId);
      expect(finalRuns[0]?.status).toBe('success');
    });
  });

  describe('error handling', () => {
    it('a provider that throws closes the run with status=error and emits work.failed', async () => {
      const err = new Error('provider exploded');
      const provider = failingProvider(['partial'], err);

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: f.messages,
            runs: f.runs,
            calcCost: f.calcCost,
          },
          {
            companyId: f.companyId,
            threadId: f.threadId,
            employeeId: f.employeeId,
            system: 's',
            messages: baseHistory,
            provider,
            providerName: 'p',
            model: 'm',
          },
        ),
      ).rejects.toThrow('provider exploded');

      // Run row exists, status='error', error string captured.
      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows).toHaveLength(1);
      expect(runRows[0]?.status).toBe('error');
      expect(runRows[0]?.error).toBe('provider exploded');
      expect(runRows[0]?.endedAt).not.toBeNull();

      // Bus emitted work.started + token.delta (for the partial chunk)
      // + work.failed — but NO work.completed.
      const events = f.bus.replaySince(0);
      const types = events.map((e) => e.type);
      expect(types).toContain('work.started');
      expect(types).toContain('work.failed');
      expect(types).not.toContain('work.completed');

      // Cost calculator must NOT be called on the error path — there
      // were no usage tokens to charge for.
      expect(f.costCalls).toHaveLength(0);
    });

    it('a stream that ends without `done` is treated as a contract violation', async () => {
      const provider = noDoneProvider(['hi']);

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: f.messages,
            runs: f.runs,
            calcCost: f.calcCost,
          },
          {
            companyId: f.companyId,
            threadId: f.threadId,
            employeeId: f.employeeId,
            system: 's',
            messages: baseHistory,
            provider,
            providerName: 'p',
            model: 'm',
          },
        ),
      ).rejects.toThrow(/usage record/);

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.status).toBe('error');
      expect(runRows[0]?.error).toMatch(/usage record/);

      const types = f.bus.replaySince(0).map((e) => e.type);
      expect(types).toContain('work.failed');
      expect(types).not.toContain('work.completed');
    });

    it('a stream that reports usage without assistant text is treated as provider failure', async () => {
      const provider = fakeProvider([], { promptTokens: 12, completionTokens: 49 });

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: f.messages,
            runs: f.runs,
            calcCost: f.calcCost,
          },
          {
            companyId: f.companyId,
            threadId: f.threadId,
            employeeId: f.employeeId,
            system: 's',
            messages: baseHistory,
            provider,
            providerName: 'p',
            model: 'm',
          },
        ),
      ).rejects.toThrow(/without assistant text/);

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.status).toBe('error');
      expect(runRows[0]?.promptTokens).toBe(12);
      expect(runRows[0]?.completionTokens).toBe(49);
      expect(runRows[0]?.error).toMatch(/without assistant text/);

      const messages = f.messages.listByThread(f.threadId);
      expect(messages[0]?.content).toMatch(/couldn't complete that reply/i);
      expect(messages[0]?.content).toMatch(/no assistant text/i);

      const events = f.bus.replaySince(0);
      const types = events.map((e) => e.type);
      expect(types).toEqual(['work.started', 'work.failed']);
      expect(types).not.toContain('work.completed');

      const failed = events.at(-1);
      expect(failed?.payload).toMatchObject({
        threadId: f.threadId,
        messageId: messages[0]?.id,
        error: expect.stringMatching(/without assistant text/),
      });
      expect(f.costCalls).toHaveLength(0);
    });

    it('non-Error throws are coerced to a string in the error field', async () => {
      // biome-ignore lint/correctness/useYield: intentional — generator throws before any chunk is produced
      const provider: ProviderStreamFn = async function* () {
        throw 'string error';
      };

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: f.messages,
            runs: f.runs,
            calcCost: f.calcCost,
          },
          {
            companyId: f.companyId,
            threadId: f.threadId,
            employeeId: f.employeeId,
            system: 's',
            messages: baseHistory,
            provider,
            providerName: 'p',
            model: 'm',
          },
        ),
      ).rejects.toBe('string error');

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.error).toBe('string error');
    });

    it('an aborted run is marked cancelled and emits work.failed without work.completed', async () => {
      let startedResolve: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        startedResolve = resolve;
      });
      const captured: { signal?: AbortSignal } = {};
      const controller = new AbortController();
      const provider = abortableProvider({ resolve: startedResolve }, captured);

      const input = {
        companyId: f.companyId,
        threadId: f.threadId,
        employeeId: f.employeeId,
        system: 's',
        messages: baseHistory,
        provider,
        providerName: 'p',
        model: 'm',
        signal: controller.signal,
      } as Parameters<typeof runAgent>[1] & { signal: AbortSignal };

      const runP = runAgent(
        {
          bus: f.bus,
          messages: f.messages,
          runs: f.runs,
          calcCost: f.calcCost,
        },
        input,
      );

      await started;
      expect(captured.signal).toBeDefined();
      expect(captured.signal?.aborted).toBe(false);

      controller.abort();

      await expect(runP).rejects.toThrow(/aborted|canceled/i);

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows).toHaveLength(1);
      expect(runRows[0]?.status).toBe('cancelled');
      expect(runRows[0]?.error).toMatch(/canceled|aborted/i);

      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'token.delta', 'work.failed']);
      expect(events.map((e) => e.type)).not.toContain('work.completed');

      const messages = f.messages.listByThread(f.threadId);
      expect(messages[0]?.content).toBe('partial');
      expect(f.costCalls).toHaveLength(0);
    });

    it('a stalled provider stream is aborted, closes the run, and preserves partial text with a retry note', async () => {
      let startedResolve: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        startedResolve = resolve;
      });

      const provider = abortableProvider({ resolve: startedResolve });

      const runP = runAgent(
        {
          bus: f.bus,
          messages: f.messages,
          runs: f.runs,
          calcCost: f.calcCost,
        },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider,
          providerName: 'p',
          model: 'm',
          idleTimeoutMs: 25,
          timeoutMs: 1_000,
        },
      );

      await started;
      await expect(runP).rejects.toThrow(/stalled/i);

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows).toHaveLength(1);
      expect(runRows[0]?.status).toBe('error');
      expect(runRows[0]?.error).toMatch(/stalled/i);

      const messages = f.messages.listByThread(f.threadId);
      expect(messages[0]?.content).toContain('partial');
      expect(messages[0]?.content).toMatch(/provider stalled/i);
      expect(messages[0]?.content).toMatch(/please retry/i);

      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'token.delta', 'work.failed']);
      expect(events.map((e) => e.type)).not.toContain('work.completed');
      expect(f.costCalls).toHaveLength(0);
    });

    it('does not classify quiet first-token latency as a stalled provider stream', async () => {
      const provider: ProviderStreamFn = async function* ({ signal }) {
        await new Promise<void>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          function onAbort() {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(new DOMException('Aborted', 'AbortError'));
          }
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, 40);
          signal?.addEventListener('abort', onAbort, { once: true });
        });
        yield { delta: 'cold start reply' };
        yield { done: true, usage: { promptTokens: 7, completionTokens: 3 } };
      };

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: f.messages,
            runs: f.runs,
            calcCost: f.calcCost,
          },
          {
            companyId: f.companyId,
            threadId: f.threadId,
            employeeId: f.employeeId,
            system: 's',
            messages: baseHistory,
            provider,
            providerName: 'p',
            model: 'm',
            idleTimeoutMs: 25,
            timeoutMs: 500,
          },
        ),
      ).resolves.toMatchObject({
        promptTokens: 7,
        completionTokens: 3,
      });

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.status).toBe('success');

      const messages = f.messages.listByThread(f.threadId);
      expect(messages[0]?.content).toBe('cold start reply');

      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'token.delta', 'work.completed']);
      expect(f.costCalls).toHaveLength(1);
    });
  });
});
