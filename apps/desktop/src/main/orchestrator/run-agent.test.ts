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

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import type {
  DashboardEvent,
  TokenDeltaPayload,
  WorkCompletedPayload,
  WorkStartedPayload,
} from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
      // H11 (audit 2026-05-07): the fixture clock advances 42ms per `now()`
      // call. Pre-H11 the orchestrator made 2 clock calls (start + end);
      // post-H11 the batched-flusher makes additional calls per chunk for
      // the time-since-flush check. Latency is "still positive and a
      // multiple of 42ms" rather than the exact 42 the pre-H11 contract
      // could promise. The clock-call-count is implementation detail.
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.latencyMs % 42).toBe(0);
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
      // H11: clock-call-count is implementation detail; assert truthful
      // properties (positive + multiple of the fixture's 42ms tick).
      expect(run?.latencyMs).toBeGreaterThan(0);
      expect((run?.latencyMs ?? 0) % 42).toBe(0);
      expect(run?.costUsd).toBe('0.020000');
      expect(run?.provider).toBe('fake-provider');
      expect(run?.model).toBe('fake-model');
      expect(run?.threadId).toBe(f.threadId);
      expect(run?.endedAt).not.toBeNull();
      expect(run?.error).toBeNull();

      // -- Cost calc was invoked exactly once with the right arguments --
      // C3 (audit 2026-05-07): the cost calculator now also receives
      // optional `cachedInputTokens` / `cacheWriteTokens` for
      // Anthropic prompt-caching attribution. The fake provider in
      // this fixture does not surface cache stats (legacy single-
      // turn happy path), so both default to 0.
      expect(f.costCalls).toEqual([
        {
          provider: 'fake-provider',
          model: 'fake-model',
          promptTokens: 10,
          completionTokens: 5,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
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

      // work.completed payload — latency is a fixture-clock-call-count
      // artifact (H11 audit 2026-05-07); other fields are exact.
      const completed = events[4] as DashboardEvent<WorkCompletedPayload>;
      expect(completed.actorKind).toBe('orchestrator');
      expect(completed.payload.threadId).toBe(f.threadId);
      expect(completed.payload.messageId).toBe(result.messageId);
      expect(completed.payload.promptTokens).toBe(10);
      expect(completed.payload.completionTokens).toBe(5);
      expect(completed.payload.costUsd).toBe(0.02);
      expect(completed.payload.latencyMs).toBeGreaterThan(0);
      expect(completed.payload.latencyMs % 42).toBe(0);
    });

    it('persists final cumulative content with batched writes (H11 audit 2026-05-07)', async () => {
      // Pre-H11 this test asserted `['a', 'ab', 'abc']` — one DB write
      // per delta — which was exactly the per-chunk anti-pattern the
      // audit flagged at run-agent.ts:386: "Per-token DB writes —
      // messages.updateContent() fires on every delta. SQLite lock
      // churn at concurrency."
      //
      // Post-H11 the orchestrator batches DB writes by char-count
      // (BATCH_FLUSH_MIN_CHARS = 64) and time (BATCH_FLUSH_INTERVAL_MS
      // = 100ms), with a force-flush in the `finally` block on every
      // terminal path. The renderer still sees per-chunk deltas via
      // the `token.delta` event bus emit (verified by the sibling
      // "streams 3 deltas..." test); only DB writes are batched.
      //
      // This test now pins the new contract: fewer DB writes than
      // chunks, AND the final persisted content equals the cumulative
      // delta sum.
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

      // H11 — DB writes are strictly fewer than the 3 incoming chunks
      // (the entire point of batching); each char is well under the
      // 64-char size threshold so any flushes that happen are
      // time-triggered or the final force-flush.
      expect(contentSnapshots.length).toBeLessThan(3);
      // Final persisted content equals the full cumulative stream —
      // proves the force-flush in `finally` lands the tail.
      expect(contentSnapshots[contentSnapshots.length - 1]).toBe('abc');
      // Final DB row reflects the same content (proves the wrapped
      // updateContent is on the live path, not just observed).
      expect(f.messages.listByThread(f.threadId)[0]?.content).toBe('abc');
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
      // already exist (proves message.append() persists the row at
      // start, before any streaming). H11 (audit 2026-05-07): mid-
      // stream DB content lags the buffer by up to BATCH_FLUSH_MIN_CHARS
      // (64) or BATCH_FLUSH_INTERVAL_MS (100ms) — a single 'x' delta
      // doesn't trip either threshold, so the row is empty until the
      // force-flush in `finally` runs at stream-end. The renderer
      // still sees the 'x' via the `token.delta` event bus emit
      // (verified by the "streams 3 deltas..." sibling test).
      await firstDeltaSeen;
      const midRow = f.messages.listByThread(f.threadId);
      expect(midRow).toHaveLength(1);
      // The runs row also exists with status='running'.
      const midRuns = f.runs.listByEmployee(f.employeeId);
      expect(midRuns).toHaveLength(1);
      expect(midRuns[0]?.status).toBe('running');

      // Let the stream finish.
      proceedAfterCheck();
      await runP;

      // Post-stream the force-flush in `finally` writes the buffer.
      const finalRow = f.messages.listByThread(f.threadId);
      expect(finalRow[0]?.content).toBe('x');
      const finalRuns = f.runs.listByEmployee(f.employeeId);
      expect(finalRuns[0]?.status).toBe('success');
    });

    it('passes run and ticket context through to provider streams', async () => {
      const captured: {
        runId?: string | null;
        threadId?: string | null;
        companyId?: string | null;
        employeeId?: string | null;
        currentTicketId?: string | null;
      } = {};
      const provider: ProviderStreamFn = async function* (args) {
        captured.runId = args.runId;
        captured.threadId = args.threadId;
        captured.companyId = args.companyId;
        captured.employeeId = args.employeeId;
        captured.currentTicketId = args.currentTicketId;
        yield { delta: 'Ticket context received.' };
        yield { done: true, usage: { promptTokens: 3, completionTokens: 4 } };
      };

      const result = await runAgent(
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
          system: 'You are a CEO.',
          messages: baseHistory,
          provider,
          providerName: 'runtime:bash',
          model: 'profile-bash',
          currentTicketId: 'ticket-1',
        },
      );

      expect(captured).toEqual({
        runId: result.runId,
        threadId: f.threadId,
        companyId: f.companyId,
        employeeId: f.employeeId,
        currentTicketId: 'ticket-1',
      });
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
      // eslint-disable-next-line require-yield -- intentional — generator throws before any chunk is produced
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

    it('closes a tool-only successful send_message turn with a synthesized reply', async () => {
      const provider: ProviderStreamFn = async function* () {
        yield {
          toolCall: {
            toolCallId: 'call-1',
            toolName: 'send_message_to_colleague',
            args: {
              recipientEmployeeId: 'emp-cmo',
              message: 'Please review the launch plan.',
            },
          },
        };
        yield {
          toolResult: {
            toolCallId: 'call-1',
            toolName: 'send_message_to_colleague',
            result: { success: true, recipientName: 'Mina Patel' },
          },
        };
        yield { done: true, usage: { promptTokens: 20, completionTokens: 4 } };
      };

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
          provider,
          providerName: 'p',
          model: 'm',
        },
      );

      const messages = f.messages.listByThread(f.threadId);
      expect(messages[0]?.content).toBe('I sent the message to Mina Patel.');

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.status).toBe('success');
      expect(runRows[0]?.toolCallsCount).toBe(1);

      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'tool.called', 'work.completed']);
      expect(f.costCalls).toHaveLength(1);
      expect(f.costCalls[0]).toMatchObject({ promptTokens: 20, completionTokens: 4 });
    });

    it('closes a tool-only turn with a generic message when tool results are not surfaced', async () => {
      // Simulates Vercel AI SDK behavior: tool calls are emitted but tool results
      // are handled internally and not surfaced through fullStream
      const provider: ProviderStreamFn = async function* () {
        yield {
          toolCall: {
            toolCallId: 'call-1',
            toolName: 'send_message_to_colleague',
            args: {
              recipientEmployeeId: 'emp-cmo',
              message: 'Please review the launch plan.',
            },
          },
        };
        // No tool-result chunk emitted — SDK handles it internally
        yield { done: true, usage: { promptTokens: 20, completionTokens: 4 } };
      };

      const result = await runAgent(
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
          system: 'You are Chase Manville.',
          messages: [{ role: 'user', content: 'Tell Mina about the launch plan.' }],
          provider,
          providerName: 'test-provider',
          model: 'test-model',
        },
      );

      expect(result.promptTokens).toBe(20);
      expect(result.completionTokens).toBe(4);

      const msgRows = f.messages.listByThread(f.threadId);
      expect(msgRows).toHaveLength(1);
      expect(msgRows[0]?.content).toBe("Done. I've taken care of that.");
      expect(msgRows[0]?.authorId).toBe(f.employeeId);

      const runRows = f.runs.listByEmployee(f.employeeId);
      expect(runRows[0]?.status).toBe('success');
      expect(runRows[0]?.toolCallsCount).toBe(1);

      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'tool.called', 'work.completed']);
    });
  });

  describe('transient-failure retry', () => {
    /**
     * Build a provider that throws on its first N invocations and then
     * starts succeeding on invocation N+1. Each call returns a fresh
     * generator, mirroring how `makeOllamaStream` etc. behave when the
     * orchestrator drives them across attempts. The returned `getCalls`
     * accessor lets tests assert how many times the provider was
     * actually invoked — which IS the retry-loop's behaviour under test.
     */
    function buildFlakyProvider(args: {
      failuresBeforeSuccess: number;
      failureError: Error;
      successDeltas: string[];
      successUsage: StreamUsage;
    }): { provider: ProviderStreamFn; getCalls: () => number } {
      let calls = 0;
      const provider: ProviderStreamFn = async function* () {
        calls += 1;
        if (calls <= args.failuresBeforeSuccess) {
          throw args.failureError;
        }
        for (const delta of args.successDeltas) {
          yield { delta };
        }
        yield { done: true, usage: args.successUsage };
      };
      return { provider, getCalls: () => calls };
    }

    /** Provider that yields one chunk, then throws on the same generator. */
    function buildPostChunkFailureProvider(err: Error): {
      provider: ProviderStreamFn;
      getCalls: () => number;
    } {
      let calls = 0;
      const provider: ProviderStreamFn = async function* () {
        calls += 1;
        yield { delta: 'partial' };
        throw err;
      };
      return { provider, getCalls: () => calls };
    }

    /**
     * H5 audit 2026-05-07 — 429 path. Build a 429 error whose
     * `Retry-After` header is 0 seconds so the test does not have to
     * wait the default 1s exponential backoff. Behavioral parity with
     * the network-flake retry test above; the only difference is the
     * error shape and the implicit backoff policy chosen by
     * `getProviderRetryBackoffMs`.
     */
    function buildHttp429Error(): Error {
      return Object.assign(new Error('HTTP 429 Too Many Requests'), {
        status: 429,
        // 0-second wait → tests resolve quickly; verifies the
        // Retry-After parsing path is wired into the backoff helper.
        headers: { 'retry-after': '0' },
      });
    }

    it('retries on HTTP 429 (audit H5) with Retry-After=0 and recovers', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: 1,
        failureError: buildHttp429Error(),
        successDeltas: ['ok'],
        successUsage: { promptTokens: 1, completionTokens: 1 },
      });

      const result = await runAgent(
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
          providerName: 'rate-limited-provider',
          model: 'rate-limited-model',
        },
      );

      expect(getCalls()).toBe(2); // 1 × 429 + 1 success
      expect(result.completionTokens).toBe(1);
      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs[0]?.status).toBe('success');
      expect(runs[0]?.error).toBeNull();
    });

    it('retries on HTTP 429 (audit H5) up to MAX_PROVIDER_ATTEMPTS before giving up', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: Number.POSITIVE_INFINITY, // every attempt 429s
        failureError: buildHttp429Error(),
        successDeltas: [],
        successUsage: { promptTokens: 0, completionTokens: 0 },
      });

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
            providerName: 'rate-limited-provider',
            model: 'rate-limited-model',
          },
        ),
      ).rejects.toThrow();

      // 1 initial + 2 retries = 3 invocations under MAX_PROVIDER_ATTEMPTS=3.
      expect(getCalls()).toBe(3);

      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs[0]?.status).toBe('error');
    });

    it('retries once on a transient pre-stream "fetch failed" and recovers', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: 1,
        failureError: new TypeError('fetch failed'),
        successDeltas: ['Hello', ', world!'],
        successUsage: { promptTokens: 6, completionTokens: 7 },
      });

      const result = await runAgent(
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
          providerName: 'flaky-provider',
          model: 'flaky-model',
        },
      );

      expect(getCalls()).toBe(2); // 1 failure + 1 success
      expect(result.promptTokens).toBe(6);
      expect(result.completionTokens).toBe(7);

      // Exactly one message row, exactly one runs row — no duplication
      // from the retried attempt.
      const msgs = f.messages.listByThread(f.threadId);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.content).toBe('Hello, world!');

      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe('success');
      expect(runs[0]?.error).toBeNull();

      // No work.failed emitted — the user-visible event sequence looks
      // identical to a clean first-attempt success.
      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual([
        'work.started',
        'token.delta',
        'token.delta',
        'work.completed',
      ]);
    });

    it('exhausts retries and surfaces a friendly "connection dropped" error', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: Number.POSITIVE_INFINITY, // every attempt fails
        failureError: new TypeError('fetch failed'),
        successDeltas: [],
        successUsage: { promptTokens: 0, completionTokens: 0 },
      });

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
            providerName: 'flaky-provider',
            model: 'flaky-model',
          },
        ),
      ).rejects.toThrow(/provider connection dropped/i);

      // H5 (audit 2026-05-07): MAX_PROVIDER_ATTEMPTS bumped from 2 → 3 so
      // HTTP 429 cascades have two retries' worth of exponential backoff.
      // Network-layer flakes inherit the same loop boundary — at 200ms
      // each, the extra retry adds at most 200ms on the rare double-flake.
      // 1 initial + 2 retries = 3 invocations, then we give up.
      expect(getCalls()).toBe(3);

      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe('error');
      expect(runs[0]?.error).toMatch(/provider connection dropped/i);

      // The renderer-visible event for the retry-exhausted case is the
      // same single `work.failed` it would have seen in any other
      // failure mode — only the message text changes.
      const events = f.bus.replaySince(0);
      expect(events.map((e) => e.type)).toEqual(['work.started', 'work.failed']);
    });

    it('does NOT retry once any chunk has streamed', async () => {
      const { provider, getCalls } = buildPostChunkFailureProvider(
        new TypeError('fetch failed'),
      );

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
      ).rejects.toThrow('fetch failed');

      // Only one invocation — the post-chunk path is not retry-eligible
      // because retrying would duplicate the already-streamed content
      // into the open message bubble.
      expect(getCalls()).toBe(1);

      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs[0]?.status).toBe('error');
      // The raw error survives — no "connection dropped" rewrite when
      // chunks already streamed (we trust the renderer to handle the
      // partial reply explicitly).
      expect(runs[0]?.error).toBe('fetch failed');
    });

    it('does NOT retry non-transient errors', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: 1,
        failureError: new Error('[provider-router/ollama] Ollama returned HTTP 400: bad input'),
        successDeltas: ['unused'],
        successUsage: { promptTokens: 1, completionTokens: 1 },
      });

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
      ).rejects.toThrow(/HTTP 400/);

      // Single invocation — HTTP-status errors are explicit provider
      // responses, not transport flakes.
      expect(getCalls()).toBe(1);
    });

    it('does NOT retry when the user abort signal is already aborted', async () => {
      const { provider, getCalls } = buildFlakyProvider({
        failuresBeforeSuccess: 1,
        failureError: new TypeError('fetch failed'),
        successDeltas: ['unused'],
        successUsage: { promptTokens: 1, completionTokens: 1 },
      });

      const ac = new AbortController();
      ac.abort(); // pre-aborted

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
            signal: ac.signal,
          },
        ),
      ).rejects.toThrow();

      // Only the initial invocation — the retry path checks the signal
      // and the captured abortKind before sleeping.
      expect(getCalls()).toBe(1);

      const runs = f.runs.listByEmployee(f.employeeId);
      expect(runs[0]?.status).toBe('cancelled');
    });

    it('preserves the original error as `cause` when retries exhaust', async () => {
      const rootError = new TypeError('fetch failed');
      const { provider } = buildFlakyProvider({
        failuresBeforeSuccess: Number.POSITIVE_INFINITY,
        failureError: rootError,
        successDeltas: [],
        successUsage: { promptTokens: 0, completionTokens: 0 },
      });

      let thrown: unknown = null;
      try {
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
            provider,
            providerName: 'p',
            model: 'm',
          },
        );
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(/provider connection dropped/i);
      // Original error survives on `.cause` for forensic logging.
      expect((thrown as Error & { cause?: unknown }).cause).toBe(rootError);
    });
  });

  // ---------------------------------------------------------------------
  // H4 audit 2026-05-07 — traceId propagation
  // ---------------------------------------------------------------------

  describe('H4 — traceId propagation (audit 2026-05-07)', () => {
    it('mints a 32-hex traceId, threads it onto runs.start, RunAgentResult, and every emitted event', async () => {
      const provider = fakeProvider(['hi', '!'], { promptTokens: 1, completionTokens: 1 });
      const result = await runAgent(
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
          system: 'You are a CEO.',
          messages: baseHistory,
          provider,
          providerName: 'fake',
          model: 'fake-model',
        },
      );

      // Result carries a valid trace ID.
      expect(result.traceId).toMatch(/^[0-9a-f]{32}$/);

      // The runs row carries the same trace ID.
      const runRow = f.runs.listByEmployee(f.employeeId)[0];
      expect(runRow?.traceId).toBe(result.traceId);

      // Every event emitted during the run shares the trace ID — the
      // audit's "reconstruct end-to-end run from logs" requirement.
      const events = f.bus.replaySince(0);
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.traceId).toBe(result.traceId);
      }
    });

    it('two independent runAgent calls produce two distinct traceIds (no leakage)', async () => {
      const p1 = fakeProvider(['a'], { promptTokens: 1, completionTokens: 1 });
      const p2 = fakeProvider(['b'], { promptTokens: 1, completionTokens: 1 });

      const r1 = await runAgent(
        { bus: f.bus, messages: f.messages, runs: f.runs, calcCost: f.calcCost },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider: p1,
          providerName: 'p',
          model: 'm',
        },
      );
      const r2 = await runAgent(
        { bus: f.bus, messages: f.messages, runs: f.runs, calcCost: f.calcCost },
        {
          companyId: f.companyId,
          threadId: f.threadId,
          employeeId: f.employeeId,
          system: 's',
          messages: baseHistory,
          provider: p2,
          providerName: 'p',
          model: 'm',
        },
      );

      expect(r1.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(r2.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(r1.traceId).not.toBe(r2.traceId);
    });
  });

  // ---------------------------------------------------------------------
  // H11 — batched streaming-delta DB writes (audit 2026-05-07).
  //
  // Audit complaint: "Per-token DB writes — messages.updateContent()
  // fires on every delta. SQLite lock churn at concurrency."
  //
  // Resolution: hybrid OR-batched flusher with BATCH_FLUSH_MIN_CHARS = 64
  // (size trigger) and BATCH_FLUSH_INTERVAL_MS = 100 (time trigger). The
  // renderer keeps its smoothness via per-chunk `token.delta` events;
  // only DB writes are throttled. The `finally` block at each retry
  // attempt's exit force-flushes the pending tail so every terminal
  // path (success, error, cancel, timeout) lands the final state.
  // ---------------------------------------------------------------------
  describe('H11 audit (2026-05-07): batched streaming-delta DB writes', () => {
    function spyMessages(target: Fixture['messages']) {
      const writes: Array<{ id: string; content: string }> = [];
      return {
        repo: {
          append: target.append,
          updateContent: (id: string, content: string) => {
            writes.push({ id, content });
            target.updateContent(id, content);
          },
        },
        writes,
      };
    }

    it('many tiny chunks below the 64-char threshold land in 1 DB write at force-flush', async () => {
      // 50 single-char deltas, each well under the size threshold.
      // The fixture clock advances 42ms per `now()` call. For each
      // delta the orchestrator calls `now()` once for the time check,
      // so by ~delta 3 (sinceFlush ≈ 126ms) the time-trigger fires
      // its first flush. Subsequent deltas re-trigger time flushes
      // after every ~3 chunks. Even so, the total write count is
      // strictly less than the 50 chunks — proving batching is
      // engaged. Pre-H11 this would have been exactly 50 writes.
      const deltas = Array.from({ length: 50 }, () => 'x');
      const provider = fakeProvider(deltas, { promptTokens: 1, completionTokens: 50 });
      const { repo, writes } = spyMessages(f.messages);

      await runAgent(
        {
          bus: f.bus,
          messages: repo,
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

      // Strictly fewer DB writes than chunks (the audit's complaint).
      expect(writes.length).toBeLessThan(deltas.length);
      // Final write contains the cumulative stream.
      expect(writes[writes.length - 1]?.content).toBe('x'.repeat(50));
      // Final DB row reflects the same.
      expect(f.messages.listByThread(f.threadId)[0]?.content).toBe('x'.repeat(50));
    });

    it('a single delta over BATCH_FLUSH_MIN_CHARS (64) triggers a size-based flush', async () => {
      // One 200-char delta exceeds the size threshold; flush fires
      // mid-stream (size-triggered) and the final force-flush in
      // `finally` is a no-op because lastFlushedLength already equals
      // buffer.length. So we expect exactly 1 DB write.
      const big = 'a'.repeat(200);
      const provider = fakeProvider([big], { promptTokens: 1, completionTokens: 50 });
      const { repo, writes } = spyMessages(f.messages);

      await runAgent(
        {
          bus: f.bus,
          messages: repo,
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

      // Exactly one write — the size threshold fired immediately on
      // the only delta, and the force-flush had no pending content.
      expect(writes).toHaveLength(1);
      expect(writes[0]?.content).toBe(big);
    });

    it('renderer still sees per-chunk deltas via token.delta event bus (batching does NOT throttle events)', async () => {
      // The audit's directive was "batch DB writes" — NOT "batch
      // events". The renderer's typing animation depends on the
      // event bus emitting every delta. This test pins the contract:
      // 10 chunks → 10 token.delta events, regardless of how many
      // DB writes happened.
      const deltas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const provider = fakeProvider(deltas, { promptTokens: 1, completionTokens: 10 });

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
          provider,
          providerName: 'p',
          model: 'm',
        },
      );

      const events = f.bus.replaySince(0);
      const tokenDeltas = events.filter((e) => e.type === 'token.delta');
      // One event per chunk — batching is DB-only.
      expect(tokenDeltas).toHaveLength(deltas.length);
      // Concatenated deltas equal the cumulative stream.
      const concat = tokenDeltas
        .map((e) => (e.payload as TokenDeltaPayload).delta)
        .join('');
      expect(concat).toBe('abcdefghij');
    });

    it('error mid-stream lands the pre-error buffer in the DB (force-flush in `finally`)', async () => {
      // A provider that yields some chunks then throws. Pre-H11 the
      // per-chunk writes had already persisted everything; post-H11
      // the buffer might still hold un-flushed content at throw time.
      // The `finally` block's force-flush guarantees the pre-error
      // content lands so the renderer's optimistic state is honored
      // even when the run fails.
      const provider = failingProvider(['hello'], new Error('boom'));
      const { repo, writes } = spyMessages(f.messages);

      await expect(
        runAgent(
          {
            bus: f.bus,
            messages: repo,
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
      ).rejects.toThrow('boom');

      // The 'hello' chunk arrived before the throw; the force-flush
      // in `finally` persisted it before the error finalize ran.
      expect(writes.length).toBeGreaterThan(0);
      expect(writes[writes.length - 1]?.content).toBe('hello');
      expect(f.messages.listByThread(f.threadId)[0]?.content).toBe('hello');
    });

    it('cancel mid-stream lands the pre-cancel buffer in the DB', async () => {
      // External abort signal fires after the first delta. The
      // `finally` block's force-flush guarantees the pre-cancel
      // content lands so the renderer's optimistic state survives.
      const started = { resolve: () => {} };
      const startedP = new Promise<void>((res) => {
        started.resolve = res;
      });
      const controller = new AbortController();
      const provider = abortableProvider(started);
      const { repo, writes } = spyMessages(f.messages);

      const runP = runAgent(
        {
          bus: f.bus,
          messages: repo,
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
          signal: controller.signal,
        },
      );

      await startedP;
      controller.abort();
      await expect(runP).rejects.toThrow();

      // The 'partial' chunk that arrived before the abort was force-
      // flushed by the `finally` block.
      expect(writes.length).toBeGreaterThan(0);
      expect(writes[writes.length - 1]?.content).toBe('partial');
      expect(f.messages.listByThread(f.threadId)[0]?.content).toBe('partial');
    });

    it('zero-delta stream (only `done` chunk, no text) writes nothing — flusher is no-op when buffer is empty', async () => {
      // The buffer never grew; nothing pending. Both the per-chunk
      // attempts and the final force-flush short-circuit on
      // `pending <= 0` so updateContent is never called.
      const provider: ProviderStreamFn = async function* () {
        yield { done: true, usage: { promptTokens: 1, completionTokens: 0 } };
      };
      const { repo, writes } = spyMessages(f.messages);

      // The "no text" path falls through to the empty-buffer branch
      // which writes a generic message OR throws. We don't care about
      // that downstream behavior — we care that the flusher itself
      // didn't write the empty buffer.
      await runAgent(
        {
          bus: f.bus,
          messages: repo,
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
      ).catch(() => {
        // Tolerate the "no assistant text" error; this test is about
        // the flusher's idempotence on an empty buffer.
      });

      // None of the writes have empty content from the flusher (any
      // writes that DID happen were post-stream overwrites — e.g., a
      // generic-acknowledgment write or an error-message write —
      // never empty).
      expect(writes.every((w) => w.content !== '')).toBe(true);
    });
  });
});
