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

import type { ProviderStreamFn, StreamMessage, StreamUsage } from '@team-x/provider-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createEventsRepo } from '../db/repos/events.js';
import { createMessagesRepo } from '../db/repos/messages.js';
import { createRunCheckpointsRepo } from '../db/repos/run-checkpoints.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadDigestsRepo } from '../db/repos/thread-digests.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createRunCheckpointService } from '../services/run-checkpoint-service.js';
import { createThreadDigestService } from '../services/thread-digest-service.js';

import { createEventBus } from './event-bus.js';
import type { CostCalculator } from './run-agent.js';

import {
  type Orchestrator,
  type ResolveProvider,
  type ResolveSystemPrompt,
  type ResolveTools,
  buildOrchestrator,
} from './index.js';

interface Fixture {
  ctx: TestDbHandle;
  bus: ReturnType<typeof createEventBus>;
  messagesRepo: ReturnType<typeof createMessagesRepo>;
  runCheckpointsRepo: ReturnType<typeof createRunCheckpointsRepo>;
  runsRepo: ReturnType<typeof createRunsRepo>;
  threadDigestsRepo: ReturnType<typeof createThreadDigestsRepo>;
  employeesRepo: ReturnType<typeof createEmployeesRepo>;
  companiesRepo: ReturnType<typeof createCompaniesRepo>;
  threadsRepo: ReturnType<typeof createThreadsRepo>;
  ticketsRepo: ReturnType<typeof createTicketsRepo>;
  companyId: string;
  employeeId: string;
  threadId: string;
  userMessageId: string;
  calcCost: CostCalculator;
  systemPromptCalls: Array<{ employeeId: string; companyId: string; threadId: string }>;
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
  const runCheckpointsRepo = createRunCheckpointsRepo(ctx.db);
  const runsRepo = createRunsRepo(ctx.db);
  const ticketsRepo = createTicketsRepo(ctx.db);
  const threadDigestsRepo = createThreadDigestsRepo(ctx.db);
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
    runCheckpointsRepo,
    runsRepo,
    threadDigestsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    ticketsRepo,
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
    resolveTools?: ResolveTools;
    budgetGovernance?: Parameters<typeof buildOrchestrator>[0]['budgetGovernance'];
    contextAssemblerService?: Parameters<typeof buildOrchestrator>[0]['contextAssemblerService'];
    contextPackerService?: Parameters<typeof buildOrchestrator>[0]['contextPackerService'];
    threadDigestService?: Parameters<typeof buildOrchestrator>[0]['threadDigestService'];
    runCheckpointService?: Parameters<typeof buildOrchestrator>[0]['runCheckpointService'];
    slots?: number;
    now?: () => number;
    runTimeoutMs?: number;
    runIdleTimeoutMs?: number;
    contextTargetTokenBudget?: number;
    contextRecentTurnLimit?: number;
  } = {},
): Orchestrator {
  const defaultProvider =
    overrides.provider ??
    makeFakeProvider(['hi', ' ', 'rocky'], { promptTokens: 4, completionTokens: 3 });

  const defaultResolveSystem: ResolveSystemPrompt =
    overrides.resolveSystemPrompt ??
    (async ({ employee, company, threadId }) => {
      f.systemPromptCalls.push({ employeeId: employee.id, companyId: company.id, threadId });
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
    budgetGovernance: overrides.budgetGovernance,
    employeesRepo: f.employeesRepo,
    companiesRepo: f.companiesRepo,
    threadsRepo: f.threadsRepo,
    ticketsRepo: f.ticketsRepo,
    calcCost: f.calcCost,
    resolveSystemPrompt: defaultResolveSystem,
    resolveProvider: defaultResolveProvider,
    resolveTools: overrides.resolveTools,
    contextAssemblerService: overrides.contextAssemblerService,
    contextPackerService: overrides.contextPackerService,
    threadDigestService: overrides.threadDigestService,
    runCheckpointService: overrides.runCheckpointService,
    contextTargetTokenBudget: overrides.contextTargetTokenBudget,
    contextRecentTurnLimit: overrides.contextRecentTurnLimit,
    slots: overrides.slots ?? 2,
    now: overrides.now,
    runTimeoutMs: overrides.runTimeoutMs,
    runIdleTimeoutMs: overrides.runIdleTimeoutMs,
  });
}

function seedResumeCheckpoint(
  runCheckpointService: ReturnType<typeof createRunCheckpointService>,
  f: Fixture,
  checkpointKind: 'stopped' | 'timeout' | 'budget-blocked' | 'approval-blocked' = 'timeout',
  createdAt = 1,
) {
  return runCheckpointService.createCheckpoint({
    companyId: f.companyId,
    threadId: f.threadId,
    runId: null,
    employeeId: f.employeeId,
    checkpointKind,
    objective: 'Resume from prior work',
    progressSummary: `Seeded ${checkpointKind} checkpoint`,
    blockers: [],
    nextAction: 'Resume from the latest checkpoint.',
    createdAt,
  });
}

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function createDeferred<T = void>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] = () => undefined;
  let reject: Deferred<T>['reject'] = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForDispatchCycle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
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
        threadId: f.threadId,
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

    it('passes linked ticket context into runtime-capable provider streams', async () => {
      const ticketThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'ticket',
        createdBy: f.employeeId,
      });
      const ticketId = f.ticketsRepo.create({
        companyId: f.companyId,
        title: 'Build the runtime adapter',
        assigneeId: f.employeeId,
        reporterId: 'rocky',
        threadId: ticketThreadId,
      });
      const userMessageId = f.messagesRepo.append({
        threadId: ticketThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'Please work this ticket.',
      });
      const captured: { currentTicketId?: string | null; runId?: string | null } = {};
      const provider: ProviderStreamFn = async function* (args) {
        captured.currentTicketId = args.currentTicketId;
        captured.runId = args.runId;
        yield { delta: 'Working the ticket.' };
        yield { done: true, usage: { promptTokens: 5, completionTokens: 4 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider });

      await orchestrator.enqueueChat({
        threadId: ticketThreadId,
        employeeId: f.employeeId,
        userMessageId,
      });

      expect(captured.currentTicketId).toBe(ticketId);
      expect(captured.runId).toBeTypeOf('string');
    });

    it('passes linked ticket context to ticket participants who are not the primary assignee', async () => {
      const assigneeId = f.employeesRepo.create({
        companyId: f.companyId,
        rolePackId: 'strategia-official',
        roleId: 'operator',
        roleMdSha: 'sha-test-2',
        level: 'manager',
        name: 'Carolyn',
        title: 'GTM Lead',
      });
      const ticketThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'ticket',
        createdBy: 'rocky',
      });
      f.threadsRepo.addMember({
        threadId: ticketThreadId,
        memberId: 'rocky',
        memberKind: 'user',
      });
      f.threadsRepo.addMember({
        threadId: ticketThreadId,
        memberId: f.employeeId,
        memberKind: 'employee',
      });
      const ticketId = f.ticketsRepo.create({
        companyId: f.companyId,
        title: 'Coordinate the handoff',
        assigneeId,
        reporterId: 'rocky',
        threadId: ticketThreadId,
      });
      const userMessageId = f.messagesRepo.append({
        threadId: ticketThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'Everyone on this ticket should wake up.',
      });
      const captured: { currentTicketId?: string | null } = {};
      const provider: ProviderStreamFn = async function* (args) {
        captured.currentTicketId = args.currentTicketId;
        yield { delta: 'I see the ticket context.' };
        yield { done: true, usage: { promptTokens: 6, completionTokens: 5 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider });

      await orchestrator.enqueueChat({
        threadId: ticketThreadId,
        employeeId: f.employeeId,
        userMessageId,
      });

      expect(captured.currentTicketId).toBe(ticketId);
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

    it('filters blank and synthetic failed assistant turns out of provider history', async () => {
      f.messagesRepo.append({
        threadId: f.threadId,
        authorId: f.employeeId,
        authorKind: 'employee',
        content: "I couldn't complete that reply. Provider returned no assistant text.",
      });
      f.messagesRepo.append({
        threadId: f.threadId,
        authorId: f.employeeId,
        authorKind: 'employee',
        content: '   ',
      });
      f.messagesRepo.append({
        threadId: f.threadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'try again with a short answer',
      });

      const captured: { messages?: StreamMessage[] } = {};
      const provider = makeFakeProvider(
        ['short answer'],
        { promptTokens: 7, completionTokens: 2 },
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
        { role: 'user', content: 'try again with a short answer' },
      ]);
    });

    it('passes tools to direct DM turns when the provider is ollama-local', async () => {
      const captured: {
        system?: string;
        messages?: StreamMessage[];
        tools?: Record<string, unknown>;
        maxSteps?: number;
      } = {};
      const provider: ProviderStreamFn = async function* (args) {
        captured.system = args.system;
        captured.messages = args.messages;
        captured.tools = args.tools;
        captured.maxSteps = args.maxSteps;
        yield { delta: 'hello rocky' };
        yield { done: true, usage: { promptTokens: 3, completionTokens: 2 } };
      };

      const orchestrator = buildDefaultOrchestrator(f, {
        provider,
        resolveProvider: async () => ({
          providerName: 'ollama-local',
          model: 'llama3.1:8b',
          stream: provider,
        }),
        resolveTools: async () => ({
          tools: {
            read_file: {
              description: 'Read a file',
              execute: async () => ({ ok: true }),
            },
          },
          maxSteps: 7,
        }),
      });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      expect(Object.keys(captured.tools ?? {}).sort()).toEqual([
        'list_colleagues',
        'read_file',
        'send_message_to_colleague',
      ]);
      expect(captured.maxSteps).toBe(7);
    });

    it('materializes agent-to-agent assignments into assigned ticket queue work', async () => {
      const chaseId = f.employeesRepo.create({
        companyId: f.companyId,
        rolePackId: 'strategia-official',
        roleId: 'cto',
        roleMdSha: 'sha-chase',
        level: 'officer',
        name: 'Chase Manville',
        title: 'Chief Technology Officer',
      });
      let recipientRanResolve: () => void = () => {};
      const recipientRan = new Promise<void>((resolve) => {
        recipientRanResolve = resolve;
      });
      const provider: ProviderStreamFn = async function* (args) {
        if (args.employeeId === chaseId) {
          recipientRanResolve();
          yield { delta: 'Starting the ticket now.' };
          yield { done: true, usage: { promptTokens: 5, completionTokens: 4 } };
          return;
        }

        const sendTool = args.tools?.send_message_to_colleague as
          | {
              execute(input: {
                recipientEmployeeId: string;
                message: string;
              }): Promise<unknown>;
            }
          | undefined;
        if (!sendTool) throw new Error('send_message_to_colleague tool missing');

        const message =
          "Chase, I am assigning you to the critical project: 'Determine which product will bring $20k MRR by May 30th'. Your immediate task is to audit Agent-X, System-X, and Team-X. Report back ASAP.";
        const result = await sendTool.execute({
          recipientEmployeeId: chaseId,
          message,
        });
        yield {
          toolCall: {
            toolCallId: 'call-delegate',
            toolName: 'send_message_to_colleague',
            args: { recipientEmployeeId: chaseId, message },
          },
        };
        yield {
          toolResult: {
            toolCallId: 'call-delegate',
            toolName: 'send_message_to_colleague',
            result,
          },
        };
        yield { done: true, usage: { promptTokens: 30, completionTokens: 5 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, now: () => 1_234_567 });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      await Promise.race([
        recipientRan,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('recipient ticket pickup did not run')), 500),
        ),
      ]);

      const assignedTickets = f.ticketsRepo.listByAssignee(chaseId);
      expect(assignedTickets).toHaveLength(1);
      expect(assignedTickets[0]).toEqual(
        expect.objectContaining({
          title: 'audit Agent-X, System-X, and Team-X',
          assigneeId: chaseId,
          reporterId: f.employeeId,
          reporterKind: 'employee',
          priority: 'critical',
          status: 'in-progress',
        }),
      );
      const labels = JSON.parse(assignedTickets[0]?.labelsJson ?? '[]') as string[];
      expect(labels).toEqual(['agent-delegated', 'agent-message', 'critical']);
      expect(assignedTickets[0]?.threadId).toEqual(expect.any(String));

      const ticketThreadId = assignedTickets[0]?.threadId;
      expect(ticketThreadId).toBeTruthy();
      const ticketThread = ticketThreadId ? f.threadsRepo.getById(ticketThreadId) : null;
      expect(ticketThread).toEqual(expect.objectContaining({ kind: 'ticket' }));
      const ticketMessages = ticketThreadId ? f.messagesRepo.listByThread(ticketThreadId) : [];
      expect(
        ticketMessages.some((row) => row.content.includes('Begin work from this ticket')),
      ).toBe(true);

      const eventTypes = f.bus.replaySince(0).map((event) => event.type);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          'message.agent_to_agent',
          'ticket.created',
          'ticket.assigned',
          'task.delegated',
        ]),
      );
    });

    it('uses packed context for internal runs and persists completion memory state', async () => {
      const captured: { system?: string; messages?: StreamMessage[] } = {};
      const assembleInputs: unknown[] = [];
      const provider = makeFakeProvider(
        ['done'],
        { promptTokens: 7, completionTokens: 3 },
        captured,
      );
      const threadDigestService = createThreadDigestService({
        threadDigestsRepo: f.threadDigestsRepo,
        messagesRepo: f.messagesRepo,
      });
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const orchestrator = buildDefaultOrchestrator(f, {
        provider,
        contextAssemblerService: {
          assembleThreadContext: async (input) => {
            assembleInputs.push(input);
            return {
              companyId: f.companyId,
              threadId: f.threadId,
              generatedAt: 1,
              retrievalQueries: ['launch plan'],
              recentTurns: [
                {
                  messageId: f.userMessageId,
                  role: 'user',
                  authorId: 'rocky',
                  authorKind: 'user',
                  content: 'packed user request',
                  createdAt: 1,
                  estimatedTokens: 4,
                },
              ],
              blocks: [],
            };
          },
        },
        contextPackerService: {
          packContext: () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 1,
            targetTokenBudget: 256,
            usedTokens: 21,
            recentTurnTokens: 4,
            blockTokens: 17,
            retrievalTokens: 0,
            packedTurns: [
              {
                messageId: f.userMessageId,
                role: 'user',
                authorId: 'rocky',
                authorKind: 'user',
                content: 'packed user request',
                createdAt: 1,
                estimatedTokens: 4,
                truncated: false,
              },
            ],
            systemAddendum: '## Ticket Launch\nSource: in_progress\nLaunch is active.',
            includedBlocks: [
              {
                id: 'approval-block',
                kind: 'approval',
                priority: 'high',
                title: 'Approval',
                body: 'Pending approval',
                estimatedTokens: 5,
                sourceRefId: 'approval-1',
                sourceLabel: 'pending',
                metadata: {},
                renderedText: 'Approval block',
                tokenCount: 5,
                truncated: false,
              },
              {
                id: 'artifact-block',
                kind: 'artifact',
                priority: 'low',
                title: 'Artifact',
                body: 'Artifact summary',
                estimatedTokens: 4,
                sourceRefId: 'artifact-1',
                sourceLabel: 'report',
                metadata: {},
                renderedText: 'Artifact block',
                tokenCount: 4,
                truncated: false,
              },
            ],
            droppedBlocks: [],
            retrievalQueries: ['launch plan'],
            resumeOrigin: {
              checkpointId: 'checkpoint-timeout',
              checkpointKind: 'timeout',
              createdAt: 7,
            },
          }),
        },
        threadDigestService,
        runCheckpointService,
      });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      expect(captured.messages).toEqual([{ role: 'user', content: 'packed user request' }]);
      expect(captured.system).toContain('You are Iris, the CEO at Strategia-X.');
      expect(captured.system).toContain('## Runtime Context');
      expect(captured.system).toContain('Use this section as verified workspace state');
      expect(captured.system).toContain('Launch is active.');
      expect(assembleInputs[0]).toMatchObject({
        companyId: f.companyId,
        threadId: f.threadId,
        employeeId: f.employeeId,
      });

      const checkpoints = runCheckpointService.listByThread({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(checkpoints[0]).toEqual(
        expect.objectContaining({
          checkpointKind: 'completion',
          unresolvedApprovalRefs: ['approval-1'],
          activeArtifactRefs: ['artifact-1'],
          resumeOrigin: {
            checkpointId: 'checkpoint-timeout',
            checkpointKind: 'timeout',
            createdAt: 7,
          },
        }),
      );
      expect(checkpoints[0]?.progressSummary).toMatch(
        /after resuming from the timeout checkpoint/i,
      );

      const digest = threadDigestService.getLatest({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(digest?.summary).toContain('Latest request: hi iris');
      expect(digest?.summary).toContain('Latest response: done');
    });

    it('uses packed context, tools, and completion checkpoints for external runtime providers too', async () => {
      const captured: {
        system?: string;
        messages?: StreamMessage[];
        tools?: Record<string, unknown>;
        maxSteps?: number;
      } = {};
      const provider: ProviderStreamFn = async function* (args) {
        captured.system = args.system;
        captured.messages = args.messages;
        captured.tools = args.tools;
        captured.maxSteps = args.maxSteps;
        yield { delta: 'external done' };
        yield { done: true, usage: { promptTokens: 9, completionTokens: 4 } };
      };
      const threadDigestService = createThreadDigestService({
        threadDigestsRepo: f.threadDigestsRepo,
        messagesRepo: f.messagesRepo,
      });
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const orchestrator = buildDefaultOrchestrator(f, {
        provider,
        resolveProvider: async () => ({
          providerName: 'runtime:codex',
          providerKind: 'codex',
          model: 'profile-codex',
          stream: provider,
        }),
        resolveTools: async () => ({
          tools: {
            launch_report: {
              description: 'Create a launch report',
              execute: async () => ({ ok: true }),
            },
          },
          maxSteps: 6,
        }),
        contextAssemblerService: {
          assembleThreadContext: async () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 2,
            retrievalQueries: ['external launch'],
            recentTurns: [
              {
                messageId: f.userMessageId,
                role: 'user',
                authorId: 'rocky',
                authorKind: 'user',
                content: 'external runtime request',
                createdAt: 2,
                estimatedTokens: 5,
              },
            ],
            blocks: [],
          }),
        },
        contextPackerService: {
          packContext: () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 2,
            targetTokenBudget: 256,
            usedTokens: 26,
            recentTurnTokens: 5,
            blockTokens: 21,
            retrievalTokens: 0,
            packedTurns: [
              {
                messageId: f.userMessageId,
                role: 'user',
                authorId: 'rocky',
                authorKind: 'user',
                content: 'external runtime request',
                createdAt: 2,
                estimatedTokens: 5,
                truncated: false,
              },
            ],
            systemAddendum:
              '## Runtime Context\nSource: external\nExternal runtime launch window is active.',
            includedBlocks: [
              {
                id: 'approval-block',
                kind: 'approval',
                priority: 'high',
                title: 'Approval',
                body: 'Pending approval',
                estimatedTokens: 5,
                sourceRefId: 'approval-2',
                sourceLabel: 'pending',
                metadata: {},
                renderedText: 'Approval block',
                tokenCount: 5,
                truncated: false,
              },
              {
                id: 'artifact-block',
                kind: 'artifact',
                priority: 'low',
                title: 'Artifact',
                body: 'Artifact summary',
                estimatedTokens: 4,
                sourceRefId: 'artifact-2',
                sourceLabel: 'runtime-report',
                metadata: {},
                renderedText: 'Artifact block',
                tokenCount: 4,
                truncated: false,
              },
            ],
            droppedBlocks: [],
            retrievalQueries: ['external launch'],
            resumeOrigin: {
              checkpointId: 'checkpoint-timeout-external',
              checkpointKind: 'timeout',
              createdAt: 11,
            },
          }),
        },
        threadDigestService,
        runCheckpointService,
      });

      await orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      expect(captured.messages).toEqual([{ role: 'user', content: 'external runtime request' }]);
      expect(captured.system).toContain('You are Iris, the CEO at Strategia-X.');
      expect(captured.system).toContain('## Runtime Context');
      expect(captured.system).toContain('External runtime launch window is active.');
      expect(Object.keys(captured.tools ?? {}).sort()).toEqual([
        'launch_report',
        'list_colleagues',
        'send_message_to_colleague',
      ]);
      expect(captured.maxSteps).toBe(6);

      const checkpoints = runCheckpointService.listByThread({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(checkpoints[0]).toEqual(
        expect.objectContaining({
          checkpointKind: 'completion',
          unresolvedApprovalRefs: ['approval-2'],
          activeArtifactRefs: ['artifact-2'],
          resumeOrigin: {
            checkpointId: 'checkpoint-timeout-external',
            checkpointKind: 'timeout',
            createdAt: 11,
          },
        }),
      );

      const digest = threadDigestService.getLatest({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(digest?.summary).toContain('Latest request: hi iris');
      expect(digest?.summary).toContain('Latest response: external done');
    });

    it('fails visibly when packing collapses and raw history exceeds the target budget', async () => {
      const oversizedUserMessageId = f.messagesRepo.append({
        threadId: f.threadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'x'.repeat(240),
      });
      const orchestrator = buildDefaultOrchestrator(f, {
        contextAssemblerService: {
          assembleThreadContext: async () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 1,
            retrievalQueries: [],
            recentTurns: [],
            blocks: [],
          }),
        },
        contextPackerService: {
          packContext: () => {
            throw new Error('packing failed');
          },
        },
        contextTargetTokenBudget: 20,
      });

      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: oversizedUserMessageId,
        }),
      ).rejects.toThrow(/minimum viable packed context could not be assembled/i);
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

    it('serializes turns on the same thread even when multiple global slots are free', async () => {
      const order: string[] = [];
      const firstStarted = createDeferred();
      const firstGate = createDeferred();
      const secondUserMessageId = f.messagesRepo.append({
        threadId: f.threadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'second follow-up',
      });

      const firstProvider: ProviderStreamFn = async function* () {
        order.push('first-start');
        firstStarted.resolve();
        await firstGate.promise;
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

      let callIdx = 0;
      const orchestrator = buildDefaultOrchestrator(f, {
        slots: 2,
        resolveProvider: async () => {
          const stream = callIdx === 0 ? firstProvider : secondProvider;
          callIdx++;
          return { providerName: 'p', model: 'm', stream };
        },
      });

      const first = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const second = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: secondUserMessageId,
      });

      try {
        await firstStarted.promise;
        expect(order).toEqual(['first-start']);

        firstGate.resolve();
        await Promise.all([first, second]);

        expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
      } finally {
        firstGate.resolve();
        await Promise.allSettled([first, second]);
      }
    });

    it('enforces per-provider-kind caps without blocking unrelated providers', async () => {
      const employeeTwoId = f.employeesRepo.create({
        companyId: f.companyId,
        rolePackId: 'strategia-official',
        roleId: 'ceo',
        roleMdSha: 'sha-two',
        level: 'officer',
        name: 'Mateo',
        title: 'CTO',
      });
      const employeeThreeId = f.employeesRepo.create({
        companyId: f.companyId,
        rolePackId: 'strategia-official',
        roleId: 'ceo',
        roleMdSha: 'sha-three',
        level: 'officer',
        name: 'Sasha',
        title: 'COO',
      });
      const secondThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: employeeTwoId,
      });
      const thirdThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: employeeThreeId,
      });
      const secondUserMessageId = f.messagesRepo.append({
        threadId: secondThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'question two',
      });
      const thirdUserMessageId = f.messagesRepo.append({
        threadId: thirdThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'question three',
      });

      const order: string[] = [];
      const openAiStarted = createDeferred();
      const openAiGate = createDeferred();
      const anthropicFinished = createDeferred();

      const openAiOne: ProviderStreamFn = async function* () {
        order.push('openai-1-start');
        openAiStarted.resolve();
        await openAiGate.promise;
        yield { delta: 'a' };
        order.push('openai-1-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const openAiTwo: ProviderStreamFn = async function* () {
        order.push('openai-2-start');
        yield { delta: 'b' };
        order.push('openai-2-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const anthropic: ProviderStreamFn = async function* () {
        order.push('anthropic-start');
        yield { delta: 'c' };
        order.push('anthropic-end');
        anthropicFinished.resolve();
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      const orchestrator = buildOrchestrator({
        bus: f.bus,
        messagesRepo: f.messagesRepo,
        runsRepo: f.runsRepo,
        employeesRepo: f.employeesRepo,
        companiesRepo: f.companiesRepo,
        threadsRepo: f.threadsRepo,
        calcCost: f.calcCost,
        resolveSystemPrompt: async () => 'system',
        resolveProvider: async (employee) => {
          if (employee.id === f.employeeId) {
            return {
              providerName: 'openai-1',
              providerKind: 'openai',
              model: 'gpt-4.1',
              stream: openAiOne,
            };
          }
          if (employee.id === employeeTwoId) {
            return {
              providerName: 'openai-2',
              providerKind: 'openai',
              model: 'gpt-4.1-mini',
              stream: openAiTwo,
            };
          }
          return {
            providerName: 'anthropic-1',
            providerKind: 'anthropic',
            model: 'claude-sonnet',
            stream: anthropic,
          };
        },
        slots: 2,
        providerCaps: { openai: 1, anthropic: 1 },
      } as Parameters<typeof buildOrchestrator>[0] & {
        providerCaps: Record<string, number>;
      });

      const first = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const second = orchestrator.enqueueChat({
        threadId: secondThreadId,
        employeeId: employeeTwoId,
        userMessageId: secondUserMessageId,
      });
      const third = orchestrator.enqueueChat({
        threadId: thirdThreadId,
        employeeId: employeeThreeId,
        userMessageId: thirdUserMessageId,
      });

      try {
        await Promise.all([openAiStarted.promise, anthropicFinished.promise]);
        expect(order).toEqual(['openai-1-start', 'anthropic-start', 'anthropic-end']);

        openAiGate.resolve();
        await Promise.all([first, second, third]);

        expect(order).toEqual([
          'openai-1-start',
          'anthropic-start',
          'anthropic-end',
          'openai-1-end',
          'openai-2-start',
          'openai-2-end',
        ]);
      } finally {
        openAiGate.resolve();
        await Promise.allSettled([first, second, third]);
      }
    });
  });

  describe('live concurrency updates', () => {
    it('applies updated global slots without rebuilding the orchestrator', async () => {
      const secondThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: f.employeeId,
      });
      const secondUserMessageId = f.messagesRepo.append({
        threadId: secondThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'second question',
      });
      const order: string[] = [];
      const firstStarted = createDeferred();
      const firstGate = createDeferred();
      const secondFinished = createDeferred();

      const firstProvider: ProviderStreamFn = async function* () {
        order.push('first-start');
        firstStarted.resolve();
        await firstGate.promise;
        yield { delta: 'a' };
        order.push('first-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const secondProvider: ProviderStreamFn = async function* () {
        order.push('second-start');
        yield { delta: 'b' };
        order.push('second-end');
        secondFinished.resolve();
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      let callIdx = 0;
      const orchestrator = buildDefaultOrchestrator(f, {
        slots: 1,
        resolveProvider: async () => {
          const stream = callIdx === 0 ? firstProvider : secondProvider;
          callIdx++;
          return { providerName: 'p', model: 'm', stream };
        },
      });

      const first = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const second = orchestrator.enqueueChat({
        threadId: secondThreadId,
        employeeId: f.employeeId,
        userMessageId: secondUserMessageId,
      });

      try {
        await firstStarted.promise;
        expect(order).toEqual(['first-start']);

        (
          orchestrator as unknown as {
            updateConcurrency(args: {
              slots?: number;
              providerCaps?: Record<string, number>;
            }): void;
          }
        ).updateConcurrency({ slots: 2 });

        await secondFinished.promise;
        expect(order).toEqual(['first-start', 'second-start', 'second-end']);

        firstGate.resolve();
        await Promise.all([first, second]);
      } finally {
        firstGate.resolve();
        await Promise.allSettled([first, second]);
      }
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
      await waitForDispatchCycle();
      expect(started).toBe(false);

      orchestrator.resume();
      await p;
      expect(started).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('waits for in-flight turns to finish before resolving', async () => {
      const started = createDeferred();
      const gate = createDeferred();
      const provider: ProviderStreamFn = async function* () {
        yield { delta: 'x' };
        started.resolve();
        await gate.promise;
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 1 });

      const p1 = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });

      let shutdownP: Promise<void> | null = null;
      try {
        await started.promise;

        let shutdownResolved = false;
        shutdownP = orchestrator.shutdown().then(() => {
          shutdownResolved = true;
        });
        await waitForDispatchCycle();
        expect(shutdownResolved).toBe(false);

        gate.resolve();
        await p1;
        await shutdownP;
        expect(shutdownResolved).toBe(true);
      } finally {
        gate.resolve();
        await Promise.allSettled([p1, ...(shutdownP ? [shutdownP] : [])]);
      }
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

  describe('stopThread', () => {
    it('aborts an in-flight turn and releases the slot for the next queued task', async () => {
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const secondThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: f.employeeId,
      });
      const secondUserMessageId = f.messagesRepo.append({
        threadId: secondThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'second question',
      });

      const order: string[] = [];
      let firstStartedResolve: () => void = () => {};
      const firstStarted = new Promise<void>((resolve) => {
        firstStartedResolve = resolve;
      });

      const abortableProvider: ProviderStreamFn = async function* ({ signal }) {
        order.push('first-start');
        yield { delta: 'partial' };
        firstStartedResolve();
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
      const secondProvider: ProviderStreamFn = async function* () {
        order.push('second-start');
        yield { delta: 'done' };
        order.push('second-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      let callIdx = 0;
      const seeded = seedResumeCheckpoint(runCheckpointService, f, 'timeout', 5);
      const orchestrator = buildDefaultOrchestrator(f, {
        slots: 1,
        runCheckpointService,
        contextAssemblerService: {
          assembleThreadContext: async () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 1,
            retrievalQueries: [],
            recentTurns: [],
            blocks: [],
          }),
        },
        contextPackerService: {
          packContext: () => ({
            companyId: f.companyId,
            threadId: f.threadId,
            generatedAt: 1,
            targetTokenBudget: 256,
            usedTokens: 4,
            recentTurnTokens: 4,
            blockTokens: 0,
            retrievalTokens: 0,
            packedTurns: [
              {
                messageId: f.userMessageId,
                role: 'user',
                authorId: 'rocky',
                authorKind: 'user',
                content: 'resume stop test',
                createdAt: 1,
                estimatedTokens: 4,
                truncated: false,
              },
            ],
            systemAddendum: '',
            includedBlocks: [],
            droppedBlocks: [],
            retrievalQueries: [],
            resumeOrigin: {
              checkpointId: seeded.id,
              checkpointKind: 'timeout',
              createdAt: 5,
            },
          }),
        },
        resolveProvider: async () => {
          const stream = callIdx === 0 ? abortableProvider : secondProvider;
          callIdx++;
          return { providerName: 'p', model: 'm', stream };
        },
      });

      const first = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const second = orchestrator.enqueueChat({
        threadId: secondThreadId,
        employeeId: f.employeeId,
        userMessageId: secondUserMessageId,
      });

      await firstStarted;
      expect(order).toEqual(['first-start']);

      const stopped = (
        orchestrator as unknown as {
          stopThread(threadId: string): boolean;
        }
      ).stopThread(f.threadId);
      expect(stopped).toBe(true);

      await expect(first).rejects.toThrow(/aborted|canceled/i);
      await second;

      const checkpoints = runCheckpointService.listByThread({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(checkpoints[0]).toEqual(
        expect.objectContaining({
          checkpointKind: 'stopped',
          resumeOrigin: {
            checkpointId: seeded.id,
            checkpointKind: 'timeout',
            createdAt: 5,
          },
        }),
      );
      expect(checkpoints[0]?.progressSummary).toMatch(
        /after resuming from the timeout checkpoint/i,
      );

      expect(order).toEqual(['first-start', 'second-start', 'second-end']);
    });

    it('cancels a queued turn before it starts streaming', async () => {
      const secondThreadId = f.threadsRepo.create({
        companyId: f.companyId,
        kind: 'dm',
        createdBy: f.employeeId,
      });
      const secondUserMessageId = f.messagesRepo.append({
        threadId: secondThreadId,
        authorId: 'rocky',
        authorKind: 'user',
        content: 'queued question',
      });

      const order: string[] = [];
      const firstStarted = createDeferred();
      const firstGate = createDeferred();
      const firstProvider: ProviderStreamFn = async function* () {
        order.push('first-start');
        yield { delta: 'holding' };
        firstStarted.resolve();
        await firstGate.promise;
        order.push('first-end');
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const secondProvider: ProviderStreamFn = async function* () {
        order.push('second-start');
        yield { delta: 'should not run' };
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };

      let callIdx = 0;
      const orchestrator = buildDefaultOrchestrator(f, {
        slots: 1,
        resolveProvider: async () => {
          const stream = callIdx++ === 0 ? firstProvider : secondProvider;
          return { providerName: 'p', model: 'm', stream };
        },
      });

      const first = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      const second = orchestrator.enqueueChat({
        threadId: secondThreadId,
        employeeId: f.employeeId,
        userMessageId: secondUserMessageId,
      });

      try {
        await firstStarted.promise;
        expect(order).toEqual(['first-start']);

        const stopped = orchestrator.stopThread(secondThreadId);
        expect(stopped).toBe(true);

        await expect(second).rejects.toThrow(/canceled/i);
        firstGate.resolve();
        await first;

        expect(order).toEqual(['first-start', 'first-end']);
      } finally {
        firstGate.resolve();
        await Promise.allSettled([first, second]);
      }
    });
  });

  describe('checkpointed interruptions', () => {
    it('writes a budget-blocked checkpoint before provider execution starts', async () => {
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const seeded = seedResumeCheckpoint(runCheckpointService, f, 'timeout', 6);
      const orchestrator = buildDefaultOrchestrator(f, {
        runCheckpointService,
        budgetGovernance: {
          assertExecutionAllowed: async () => ({
            allowed: false,
            policy: { id: 'budget-policy-1' },
            reason: 'Budget cap reached for company scope company-1.',
            approvalItem: null,
          }),
          recordRunSpend: async () => {},
        },
        resolveProvider: async () => {
          throw new Error('provider should not run');
        },
      });

      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/Budget cap reached/i);

      expect(f.systemPromptCalls).toHaveLength(0);
      expect(f.providerCalls).toHaveLength(0);
      expect(f.runsRepo.listByEmployee(f.employeeId)).toEqual([]);

      const checkpoints = runCheckpointService.listByThread({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(checkpoints[0]).toEqual(
        expect.objectContaining({
          checkpointKind: 'budget-blocked',
          resumeOrigin: {
            checkpointId: seeded.id,
            checkpointKind: 'timeout',
            createdAt: 6,
          },
          blockers: [
            expect.objectContaining({
              kind: 'budget',
              refId: 'budget-policy-1',
            }),
          ],
        }),
      );
      expect(checkpoints[0]?.nextAction).toMatch(/Adjust the budget policy/i);
    });

    it('writes an approval-blocked checkpoint when budget approval is pending', async () => {
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const seeded = seedResumeCheckpoint(runCheckpointService, f, 'stopped', 8);
      const orchestrator = buildDefaultOrchestrator(f, {
        runCheckpointService,
        budgetGovernance: {
          assertExecutionAllowed: async () => ({
            allowed: false,
            policy: { id: 'budget-policy-1' },
            reason: 'Budget approval required for company scope company-1.',
            approvalItem: {
              id: 'approval-1',
              status: 'pending',
            },
          }),
          recordRunSpend: async () => {},
        },
        resolveProvider: async () => {
          throw new Error('provider should not run');
        },
      });

      await expect(
        orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        }),
      ).rejects.toThrow(/Budget approval required/i);

      expect(f.systemPromptCalls).toHaveLength(0);
      expect(f.providerCalls).toHaveLength(0);
      expect(f.runsRepo.listByEmployee(f.employeeId)).toEqual([]);

      const checkpoints = runCheckpointService.listByThread({
        companyId: f.companyId,
        threadId: f.threadId,
      });
      expect(checkpoints[0]).toEqual(
        expect.objectContaining({
          checkpointKind: 'approval-blocked',
          resumeOrigin: {
            checkpointId: seeded.id,
            checkpointKind: 'stopped',
            createdAt: 8,
          },
          unresolvedApprovalRefs: ['approval-1'],
          blockers: [
            expect.objectContaining({
              kind: 'approval',
              refId: 'approval-1',
            }),
          ],
        }),
      );
      expect(checkpoints[0]?.nextAction).toMatch(/pending budget approval/i);
    });

    it('writes a timeout checkpoint when the provider stalls mid-turn', async () => {
      vi.useFakeTimers();
      const runCheckpointService = createRunCheckpointService({
        runCheckpointsRepo: f.runCheckpointsRepo,
      });
      const seeded = seedResumeCheckpoint(runCheckpointService, f, 'approval-blocked', 9);
      let startedResolve: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        startedResolve = resolve;
      });
      const provider: ProviderStreamFn = async function* ({ signal }) {
        yield { delta: 'partial' };
        startedResolve();
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
      try {
        const orchestrator = buildDefaultOrchestrator(f, {
          provider,
          runCheckpointService,
          contextAssemblerService: {
            assembleThreadContext: async () => ({
              companyId: f.companyId,
              threadId: f.threadId,
              generatedAt: 1,
              retrievalQueries: [],
              recentTurns: [],
              blocks: [],
            }),
          },
          contextPackerService: {
            packContext: () => ({
              companyId: f.companyId,
              threadId: f.threadId,
              generatedAt: 1,
              targetTokenBudget: 256,
              usedTokens: 4,
              recentTurnTokens: 4,
              blockTokens: 0,
              retrievalTokens: 0,
              packedTurns: [
                {
                  messageId: f.userMessageId,
                  role: 'user',
                  authorId: 'rocky',
                  authorKind: 'user',
                  content: 'resume timeout test',
                  createdAt: 1,
                  estimatedTokens: 4,
                  truncated: false,
                },
              ],
              systemAddendum: '',
              includedBlocks: [],
              droppedBlocks: [],
              retrievalQueries: [],
              resumeOrigin: {
                checkpointId: seeded.id,
                checkpointKind: 'approval-blocked',
                createdAt: 9,
              },
            }),
          },
          runIdleTimeoutMs: 10,
          runTimeoutMs: 1_000,
        });

        const runPromise = orchestrator.enqueueChat({
          threadId: f.threadId,
          employeeId: f.employeeId,
          userMessageId: f.userMessageId,
        });

        await started;
        const rejection = expect(runPromise).rejects.toThrow(/stalled/i);
        await vi.advanceTimersByTimeAsync(11);
        await rejection;

        const checkpoints = runCheckpointService.listByThread({
          companyId: f.companyId,
          threadId: f.threadId,
        });
        expect(checkpoints[0]).toEqual(
          expect.objectContaining({
            checkpointKind: 'timeout',
            resumeOrigin: {
              checkpointId: seeded.id,
              checkpointKind: 'approval-blocked',
              createdAt: 9,
            },
          }),
        );
        expect(checkpoints[0]?.blockers[0]?.summary).toMatch(/stalled/i);
        expect(checkpoints[0]?.progressSummary).toMatch(
          /after resuming from the approval-blocked checkpoint/i,
        );
      } finally {
        vi.useRealTimers();
      }
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
      await waitForDispatchCycle();
      expect(started).toBe(false);
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(true);

      orchestrator.resumeCompany(f.companyId);
      await p;
      expect(started).toBe(true);
      expect(orchestrator.isCompanyPaused(f.companyId)).toBe(false);
    });

    it('pauseCompany drains in-flight work before resolving', async () => {
      const started = createDeferred();
      const gate = createDeferred();
      const provider: ProviderStreamFn = async function* () {
        yield { delta: 'x' };
        started.resolve();
        await gate.promise;
        yield { done: true, usage: { promptTokens: 1, completionTokens: 1 } };
      };
      const orchestrator = buildDefaultOrchestrator(f, { provider, slots: 2 });

      // Start a turn that blocks on the gate.
      const chatP = orchestrator.enqueueChat({
        threadId: f.threadId,
        employeeId: f.employeeId,
        userMessageId: f.userMessageId,
      });
      await started.promise;

      // Now pause — should wait for the in-flight turn.
      let pauseResolved = false;
      const pauseP = orchestrator.pauseCompany(f.companyId).then(() => {
        pauseResolved = true;
      });
      await waitForDispatchCycle();
      expect(pauseResolved).toBe(false);

      // Release the in-flight turn.
      gate.resolve();
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
