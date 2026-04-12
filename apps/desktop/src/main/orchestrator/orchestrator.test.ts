/**
 * Orchestrator facade integration tests.
 *
 * Same stack philosophy as run-agent.test.ts: real bus, real work queue,
 * real repos against an in-memory sql.js database, real runAgent — the
 * only fakes are the injected `resolveSystemPrompt` and `resolveProvider`
 * resolvers, because their real implementations depend on disk I/O and
 * keytar (both of which land in T32).
 *
 * The facade is the first place in the codebase where all four Milestone
 * 4 primitives actually compose. If the wiring is subtly wrong — a task
 * that skips the queue, a shutdown that drops in-flight work, a history
 * mapping that inverts user/assistant roles — it shows up here first.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createEventBus } from './event-bus.js';
import {
  type Orchestrator,
  type ResolveProvider,
  type ResolveSystemPrompt,
  buildOrchestrator,
} from './index.js';
import type { CostCalculator } from './run-agent.js';

interface Fixture {
  ctx: TestDbHandle;
  bus: ReturnType<typeof createEventBus>;
  messagesRepo: ReturnType<typeof createMessagesRepo>;
  runsRepo: ReturnType<typeof createRunsRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  threadsRepo: ReturnType<typeof createThreadsRepo>;
  companyId: string;
  employeeId: string;
  threadId: string;
  userMessageId: string;
  calcCost: CostCalculator;
  systemPromptCalls: Array<{ employeeId: string; companyId: string }>;
  providerCalls: string[];
}

/**
 * Build a fake provider stream factory that yields the given deltas then
 * a `done` chunk. Captures the args it was invoked with so tests can
 * assert on history/system-prompt passthrough.
 */
function makeFakeProvider(
  deltas: string[],
  usage: StreamUsage,
  captured: { system?: string; messages?: StreamMessage[] } = {},
): ProviderStreamFn {
  return async function* (args) {
    captured.system = args.system;
    captured.messages = args.messages;
    for (const d of deltas) yield { delta: d };
    yield { done: true, usage };
  };
}

async function buildFixture(): Promise<Fixture> {
  const ctx = await makeTestDb();
  const companiesRepo = createCompaniesRepo(ctx.db);
  const employeesRepo = createEmployeesRepo(ctx.db);
  const threadsRepo = createThreadsRepo(ctx.db);
  const messagesRepo = createMessagesRepo(ctx.db);
  const runsRepo = createRunsRepo(ctx.db);
  const eventsRepo = createEventsRepo(ctx.db);
  const bus = createEventBus({ repo: eventsRepo });

  const companyId = companiesRepo.create({
    name: 'Strategia-X',
    slug: 'strategia-x',
    settings: { mission: 'run itself', values: ['q', 's'] },
  });
  const employeeId = employeesRepo.create({
    companyId,
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha-test',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
  });
  const threadId = threadsRepo.create({
    companyId,
    kind: 'dm',
    createdBy: employeeId,
  });

  // Simulate the T33 IPC handler inserting the triggering user message.
  const userMessageId = messagesRepo.append({
    threadId,
    authorId: 'rocky',
    authorKind: 'user',
    content: 'hi iris',
  });

  const calcCost: CostCalculator = (args) =>
    (args.promptTokens * 0.001 + args.completionTokens * 0.002).toFixed(6);

  return {
    ctx,
    bus,
    messagesRepo,
    runsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    companyId,
    employeeId,
    threadId,
    userMessageId,
    calcCost,
    systemPromptCalls: [],
    providerCalls: [],
  };
}

/** Default orchestrator builder — lets each test override only the parts it cares about. */
function buildDefaultOrchestrator(
  f: Fixture,
  overrides: {
    provider?: ProviderStreamFn;
    resolveSystemPrompt?: ResolveSystemPrompt;
    resolveProvider?: ResolveProvider;
    slots?: number;
    now?: () => number;
  } = {},
): Orchestrator {
  const defaultProvider =
    overrides.provider ??
    makeFakeProvider(['hi', ' ', 'rocky'], { promptTokens: 4, completionTokens: 3 });

  const defaultResolveSystem: ResolveSystemPrompt =
    overrides.resolveSystemPrompt ??
    (async ({ employee, company }) => {
      f.systemPromptCalls.push({ employeeId: employee.id, companyId: company.id });
      return `You are ${employee.name}, the ${employee.title} at ${company.name}.`;
    });

  const defaultResolveProvider: ResolveProvider =
    overrides.resolveProvider ??
    (async (employee) => {
      f.providerCalls.push(employee.id);
      return {
        providerName: 'fake-provider',
        model: 'fake-model',
        stream: defaultProvider,
      };
    });

  return buildOrchestrator({
    bus: f.bus,
    messagesRepo: f.messagesRepo,
    runsRepo: f.runsRepo,
    employeesRepo: f.employeesRepo,
    companiesRepo: f.companiesRepo,
    threadsRepo: f.threadsRepo,
    calcCost: f.calcCost,
    resolveSystemPrompt: defaultResolveSystem,
    resolveProvider: defaultResolveProvider,
    slots: overrides.slots ?? 2,
    now: overrides.now,
  });
}

describe('buildOrchestrator', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await buildFixture();
  });

  afterEach(() => {
    f.ctx.close();
  });

  describe('enqueueChat happy path', () => {
    it('runs a chat turn end-to-end: DB rows, run telemetry, event sequence', async () => {
      const captured: { system?: string; messages?: StreamMessage[] } = {};
      const provider = makeFakeProvider(
        ['hi', ' ', 'rocky'],
        { promptTokens: 4, completionTokens: 3 },
        captured,
      );
      const orchestrator = buildDefaultOrchestrator(f, { provider });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      // -- Messages --
      // Two rows: the original user message + the new assistant response.
      const msgs = f.messagesRepo.listByThread(f.threadId);
      expect(msgs).toHaveLength(2);
      expect(msgs[0]?.authorKind).toBe('user');
      expect(msgs[0]?.content).toBe('hi iris');
      expect(msgs[1]?.authorKind).toBe('employee');
      expect(msgs[1]?.authorId).toBe(f.employeeId);
      expect(msgs[1]?.content).toBe('hi rocky');

      // -- Run --
      const runs = f.runsRepo.start; // existence probe
      expect(runs).toBeDefined();
      const runRows = f.runsRepo as unknown as {
        // sneak-read via the real repo for assertions
        listByEmployee: (id: string) => Array<{ status: string; promptTokens: number }>;
      };
      // Use the underlying repo directly (same handle) to inspect.
      const concrete = createRunsRepo(f.ctx.db);
      const runList = concrete.listByEmployee(f.employeeId);
      expect(runList).toHaveLength(1);
      expect(runList[0]?.status).toBe('success');
      expect(runList[0]?.promptTokens).toBe(4);
      expect(runList[0]?.completionTokens).toBe(3);

      // -- System prompt + provider were resolved exactly once --
      expect(f.systemPromptCalls).toHaveLength(1);
      expect(f.systemPromptCalls[0]).toEqual({
        employeeId: f.employeeId,
        companyId: f.companyId,
      });
      expect(f.providerCalls).toEqual([f.employeeId]);

      // -- System prompt content was forwarded verbatim to the provider --
      expect(captured.system).toBe('You are Iris, the CEO at Strategia-X.');

      // -- History mapping: the one existing user message is delivered as role='user' --
      expect(captured.messages).toEqual([{ role: 'user', content: 'hi iris' }]);

      // -- Event sequence --
      const events = orchestrator.bus.replaySince(0).map((e) => e.type);
      expect(events).toEqual([
        'work.started',
        'token.delta',
        'token.delta',
        'token.delta',
        'work.completed',
      ]);
      // Silence an "unused" lint warning if it crops up.
      void runRows;
    });

    it('maps a multi-turn chat history to user/assistant roles correctly', async () => {
      // Seed a richer history: user → assistant → user, then enqueue.
      f.messagesRepo.append({
        threadId: f.threadId,
        authorId: f.employeeId,
        authorKind: 'employee',
        content: 'hey rocky, how can i help?',
      });
      f.messagesRepo.append({
        threadId: f.threadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'tell me about phase 1',
      });

      const captured: { system?: string; messages?: StreamMessage[] } = {};
      const provider = makeFakeProvider(
        ['sure'],
        { promptTokens: 10, completionTokens: 1 },
        captured,
      );
      const orchestrator = buildDefaultOrchestrator(f, { provider });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      expect(captured.messages).toEqual([
        { role: 'user', content: 'hi iris' },
        { role: 'assistant', content: 'hey rocky, how can i help?' },
        { role: 'user', content: 'tell me about phase 1' },
      ]);
    });
  });

  describe('concurrency + FIFO', () => {
    it('with slots=1 enqueued chats run serially in FIFO order', async () => {
      // Two threads so each turn has its own message row.
      const secondThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: f.employeeId,
      });
      f.messagesRepo.append({
        threadId: secondThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'second question',
      });

      const order: string[] = [];
      const firstProvider: ProviderStreamFn = async function* () {
        order.push('first-start');
        await new Promise((r) => setTimeout(r, 5));
        yield { delta: 'a' };
        order.push('first-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const secondProvider: ProviderStreamFn = async function* () {
        order.push('second-start');
        yield { delta: 'b' };
        order.push('second-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      // Resolver switches provider based on thread — we piggy-back on
      // the resolveProvider closure since it's called per enqueue.
      let callIdx = 0;
      const orchestrator = buildDefaultOrchestrator(f, {
        slots: 1,
        resolveProvider: async () => {
          const stream = callIdx === 0 ? firstProvider : secondProvider;
          callIdx++;
          return { providerName: 'p', model: 'm', stream };
        },
      });

      const p1 = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const p2 = orchestrator.enqueueChat({
        threadId: secondThreadId,
        employeeId: f.employeeId,
        userMessageId: 'second-user-msg',
      });
      await Promise.all([p1, p2]);

      // The second turn must not have started until the first ended.
      expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    });
  });

  describe('pause / resume', () => {
    it('pause prevents dispatch; resume drains the backlog', async () => {
      let started = false;
      const provider: ProviderStreamFn = async function* () {
        started = true;
        yield { delta: 'x' };
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 1 });
      orchestrator.pause();

      const p = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      // Yield a macrotask so any queued dispatch has a chance to run.
      await new Promise((r) => setTimeout(r, 10));
      expect(started).toBe(false);

      orchestrator.resume();
      await p;
      expect(started).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('waits for in-flight turns to finish before resolving', async () => {
      let finishFirst: () => void = () => {};
      const gate = new Promise<void>((res) => {
        finishFirst = res;
      });
      const provider: ProviderStreamFn = async function* () {
        yield { delta: 'x' };
        await gate;
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 1 });

      const p1 = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      // Let the first turn enter the stream loop.
      await new Promise((r) => setTimeout(r, 10));

      let shutdownResolved = false;
      const shutdownP = orchestrator.shutdown().then(() => {
        shutdownResolved = true;
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(shutdownResolved).toBe(false);

      finishFirst();
      await p1;
      await shutdownP;
      expect(shutdownResolved).toBe(true);
    });

    it('rejects subsequent enqueueChat calls after shutdown', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      await orchestrator.shutdown();
      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/shutting down/);
    });

    it('is idempotent — calling shutdown twice returns the same drain promise', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      const first = orchestrator.shutdown();
      const second = orchestrator.shutdown();
      expect(first).toBe(second);
      await first;
    });

    it('resume is a no-op once shutdown has started', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      const shutdownP = orchestrator.shutdown();
      orchestrator.resume(); // must NOT re-enable dispatch
      await shutdownP;
      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/shutting down/);
    });
  });

  describe('per-company pause (meeting primitive)', () => {
    it('pauseCompany blocks new work for that company', async () => {
      let started = false;
      const provider: ProviderStreamFn = async function* () {
        started = true;
        yield { delta: 'x' };
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 2 });
      await orchestrator.pauseCompany(f.companyId);

      const p = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      // Yield so any queued dispatch has a chance to run.
      await new Promise((r) => setTimeout(r, 20));
      expect(started).toBe(false);
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(true);

      orchestrator.resumeCompany(f.companyId);
      await p;
      expect(started).toBe(true);
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(false);
    });

    it('pauseCompany drains in-flight work before resolving', async () => {
      let finishFirst: () => void = () => {};
      const gate = new Promise<void>((res) => {
        finishFirst = res;
      });
      const provider: ProviderStreamFn = async function* () {
        yield { delta: 'x' };
        await gate;
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 2 });

      // Start a turn that blocks on the gate.
      const chatP = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      // Let the turn enter the stream loop.
      await new Promise((r) => setTimeout(r, 10));

      // Now pause — should wait for the in-flight turn.
      let pauseResolved = false;
      const pauseP = orchestrator.pauseCompany(f.companyId).then(() => {
        pauseResolved = true;
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(pauseResolved).toBe(false);

      // Release the in-flight turn.
      finishFirst();
      await chatP;
      await pauseP;
      expect(pauseResolved).toBe(true);
    });

    it('pauseCompany is idempotent', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      await orchestrator.pauseCompany(f.companyId);
      await orchestrator.pauseCompany(f.companyId); // no-op
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(true);
      orchestrator.resumeCompany(f.companyId);
    });

    it('resumeCompany is a no-op if not paused', () => {
      const orchestrator = buildDefaultOrchestrator(f);
      // Should not throw.
      orchestrator.resumeCompany(f.companyId);
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(false);
    });

    it('sets company status in DB on pause and resume', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      await orchestrator.pauseCompany(f.companyId);
      expect(f.companiesRepo.getById(f.companyId)?.status).toBe('meeting');

      orchestrator.resumeCompany(f.companyId);
      expect(f.companiesRepo.getById(f.companyId)?.status).toBe('running');
    });
  });

  describe('lookup failures', () => {
    it('rejects if the thread is missing', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      await expect(
        orchestrator.enqueueChat({
          threadId: 'nope',
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/thread not found/);
    });

    it('rejects if the employee is missing', async () => {
      const orchestrator = buildDefaultOrchestrator(f);
      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: 'nope',
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/employee not found/);
    });

    it('rejects if the employee belongs to a different company than the thread', async () => {
      // Create a second company + employee, then try to use that
      // employee on the first company's thread.
      const otherCompanyId = f.companiesRepo.create({
        name: 'Other',
        slug: 'other-co',
      });
      const otherEmployeeId = f.employeesRepo.create({
        companyId: otherCompanyId,
        rolePackId: 'strategia-official',
        roleId: 'ceo',
        roleMdSha: 'sha',
        level: 'officer',
        name: 'Alex',
        title: 'CEO',
      });

      const orchestrator = buildDefaultOrchestrator(f);
      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: otherEmployeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/does not belong/);
    });

    it('propagates a resolveSystemPrompt failure to the caller and does not run the provider', async () => {
      let providerCalled = false;
      const provider: ProviderStreamFn = async function* () {
        providerCalled = true;
        yield { done: true, usage: { promptTokens: 0, completionTokens: 0 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, {
        provider,
        resolveSystemPrompt: async () => {
          throw new Error('role.md on fire');
        },
      });
      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/on fire/);
      expect(providerCalled).toBe(false);
    });
  });
});
