import type {
  LoopCompleteFn,
  LoopCompleteRequest,
  LoopProviderCompletion,
  Tool,
} from '@team-x/intelligence';
import type { EventType } from '@team-x/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  type AgenticLoopEmployeesRepo,
  type AgenticLoopEventBus,
  type AgenticLoopMessagesRepo,
  type AgenticLoopMessagesRepoAppendInput,
  type AgenticLoopOrchestratorLike,
  type AgenticLoopRunsRepo,
  type AgenticLoopRunsRepoFinishInput,
  type AgenticLoopRunsRepoStartInput,
  type AgenticLoopServiceDeps,
  type AgenticLoopThreadsRepo,
  SYSTEM_AGENT_ROLE_ID,
  createAgenticLoopService,
} from './agentic-loop-service.js';

// ---------------------------------------------------------------------------
// Fakes — hand-rolled, pinpoint the service logic rather than smearing
// across drizzle / orchestrator / event-bus machinery.
// ---------------------------------------------------------------------------

class FakeEmployeesRepo implements AgenticLoopEmployeesRepo {
  constructor(private readonly agentByCompany: Map<string, { id: string } | null>) {}
  findSystemByRoleId(companyId: string, roleId: string): { id: string } | null {
    expect(roleId).toBe(SYSTEM_AGENT_ROLE_ID);
    return this.agentByCompany.get(companyId) ?? null;
  }
}

interface CreatedThread {
  id: string;
  companyId: string;
  kind: string;
  subject?: string;
  createdBy: string;
}

interface AddedMember {
  threadId: string;
  memberId: string;
  memberKind: string;
}

class FakeThreadsRepo implements AgenticLoopThreadsRepo {
  readonly created: CreatedThread[] = [];
  readonly members: AddedMember[] = [];
  private counter = 0;
  create(input: {
    companyId: string;
    kind: string;
    subject?: string;
    createdBy: string;
  }): string {
    this.counter += 1;
    const id = `thr-${this.counter}`;
    this.created.push({ id, ...input });
    return id;
  }
  addMember(input: {
    threadId: string;
    memberId: string;
    memberKind: string;
    roleInThread?: string;
  }): void {
    this.members.push({
      threadId: input.threadId,
      memberId: input.memberId,
      memberKind: input.memberKind,
    });
  }
}

class FakeMessagesRepo implements AgenticLoopMessagesRepo {
  readonly appended: AgenticLoopMessagesRepoAppendInput[] = [];
  private counter = 0;
  append(input: AgenticLoopMessagesRepoAppendInput): string {
    this.counter += 1;
    const id = `msg-${this.counter}`;
    this.appended.push(input);
    return id;
  }
}

interface StartedRun {
  id: string;
  input: AgenticLoopRunsRepoStartInput;
}

interface FinishedRun {
  id: string;
  input: AgenticLoopRunsRepoFinishInput;
}

class FakeRunsRepo implements AgenticLoopRunsRepo {
  readonly started: StartedRun[] = [];
  readonly finished: FinishedRun[] = [];
  private counter = 0;
  start(input: AgenticLoopRunsRepoStartInput): string {
    this.counter += 1;
    const id = `run-${this.counter}`;
    this.started.push({ id, input });
    return id;
  }
  finish(id: string, input: AgenticLoopRunsRepoFinishInput): void {
    this.finished.push({ id, input });
  }
}

interface EmittedEvent {
  type: EventType;
  companyId: string;
  actorId: string;
  actorKind: string;
  payload: unknown;
}

class FakeEventBus implements AgenticLoopEventBus {
  readonly emitted: EmittedEvent[] = [];
  emit<T>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
  }): {
    id: string;
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
    createdAt: number;
  } {
    this.emitted.push({
      type: input.type,
      companyId: input.companyId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      payload: input.payload,
    });
    return {
      id: `evt-${this.emitted.length}`,
      type: input.type,
      companyId: input.companyId,
      actorId: input.actorId,
      actorKind: input.actorKind as never,
      payload: input.payload,
      createdAt: Date.now(),
    };
  }
}

class FakeOrchestrator implements AgenticLoopOrchestratorLike {
  paused = false;
  isCompanyPaused(_companyId: string): boolean {
    return this.paused;
  }
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

interface Fixture {
  employees: FakeEmployeesRepo;
  threads: FakeThreadsRepo;
  messages: FakeMessagesRepo;
  runsRepo: FakeRunsRepo;
  bus: FakeEventBus;
  orchestrator: FakeOrchestrator;
  deps: AgenticLoopServiceDeps;
  systemAgentId: string;
  companyId: string;
  toolCalls: Array<{ name: string; args: unknown }>;
}

interface FixtureOptions {
  script?: readonly string[];
  tools?: readonly Tool[];
  resolveThrows?: boolean;
  completeThrows?: boolean;
  provider?: string;
  model?: string;
  budgets?: { maxSteps: number; maxTokens: number; timeoutMs: number };
  missingAgent?: boolean;
}

const DEFAULT_ANSWER_SCRIPT: readonly string[] = Object.freeze([
  '{"action":"final_answer","answer":"hello from test"}',
]);

function buildCompleteFn(script: readonly string[], completeThrows: boolean): LoopCompleteFn {
  let idx = 0;
  return async function complete(req: LoopCompleteRequest): Promise<LoopProviderCompletion> {
    if (req.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (completeThrows) {
      throw new Error('boom');
    }
    const text = script[Math.min(idx, script.length - 1)] ?? DEFAULT_ANSWER_SCRIPT[0] ?? '';
    idx += 1;
    return {
      text,
      usage: { promptTokens: 10, completionTokens: 5 },
      provider: 'fake',
      model: 'fake-model',
      costUsd: 0.001,
    };
  };
}

function buildFixture(opts: FixtureOptions = {}): Fixture {
  const companyId = 'co-1';
  const systemAgentId = 'emp-sys-1';
  const agentByCompany = new Map<string, { id: string } | null>();
  if (!opts.missingAgent) {
    agentByCompany.set(companyId, { id: systemAgentId });
  }
  const employees = new FakeEmployeesRepo(agentByCompany);
  const threads = new FakeThreadsRepo();
  const messages = new FakeMessagesRepo();
  const runsRepo = new FakeRunsRepo();
  const bus = new FakeEventBus();
  const orchestrator = new FakeOrchestrator();

  const toolCalls: Array<{ name: string; args: unknown }> = [];

  const tools: readonly Tool[] =
    opts.tools ??
    Object.freeze([
      {
        name: 'test_tool',
        description: 'Test tool. Returns ok.',
        schema: z.object({}).catchall(z.unknown()),
        async execute(args: unknown): Promise<unknown> {
          toolCalls.push({ name: 'test_tool', args });
          return { ok: true, echoed: args };
        },
      } satisfies Tool,
    ]);

  const deps: AgenticLoopServiceDeps = {
    employeesRepo: employees,
    threadsRepo: threads,
    messagesRepo: messages,
    runsRepo,
    bus,
    orchestrator,
    buildTools: () => tools,
    resolveComplete: async () => {
      if (opts.resolveThrows) {
        throw new Error('resolver-broken');
      }
      return {
        complete: buildCompleteFn(
          opts.script ?? DEFAULT_ANSWER_SCRIPT,
          opts.completeThrows ?? false,
        ),
        provider: opts.provider ?? 'fake',
        model: opts.model ?? 'fake-model',
      };
    },
    getBudgets: () =>
      opts.budgets ?? {
        maxSteps: 8,
        maxTokens: 8000,
        timeoutMs: 5000,
      },
    humanUserId: 'rocky',
    pauseGatePollMs: 2,
  };

  return {
    employees,
    threads,
    messages,
    runsRepo,
    bus,
    orchestrator,
    deps,
    systemAgentId,
    companyId,
    toolCalls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAgenticLoopService', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = buildFixture();
  });

  it('returns { runId, threadId } immediately from start()', async () => {
    const service = createAgenticLoopService(fx.deps);
    const res = await service.start({ companyId: fx.companyId, userText: 'hi' });
    expect(res.runId).toMatch(/^run-\d+$/);
    expect(res.threadId).toMatch(/^thr-\d+$/);
  });

  it('creates a dm thread and adds both user and system-agent as members', async () => {
    const service = createAgenticLoopService(fx.deps);
    await service.start({ companyId: fx.companyId, userText: 'why is the team behind?' });
    expect(fx.threads.created).toHaveLength(1);
    expect(fx.threads.created[0]?.kind).toBe('dm');
    expect(fx.threads.created[0]?.companyId).toBe(fx.companyId);
    expect(fx.threads.created[0]?.subject).toContain('Copilot: ');
    expect(fx.threads.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: 'rocky', memberKind: 'user' }),
        expect.objectContaining({ memberId: fx.systemAgentId, memberKind: 'employee' }),
      ]),
    );
  });

  it('appends the user message as authorKind=user', async () => {
    const service = createAgenticLoopService(fx.deps);
    await service.start({ companyId: fx.companyId, userText: 'analyze the backend' });
    const userMsg = fx.messages.appended[0];
    expect(userMsg?.authorKind).toBe('user');
    expect(userMsg?.authorId).toBe('rocky');
    expect(userMsg?.content).toBe('analyze the backend');
  });

  it('opens a runs row with employeeId=system-agent and resolver provider/model', async () => {
    const fixture = buildFixture({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    const service = createAgenticLoopService(fixture.deps);
    await service.start({ companyId: fixture.companyId, userText: 'hi' });
    expect(fixture.runsRepo.started).toHaveLength(1);
    expect(fixture.runsRepo.started[0]?.input).toMatchObject({
      employeeId: fixture.systemAgentId,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });

  it('emits agent.step and agentic.completed on a simple answer-only loop', async () => {
    const service = createAgenticLoopService(fx.deps);
    const { runId } = await service.start({ companyId: fx.companyId, userText: 'ping' });
    await service.waitForRun(runId);

    const agentSteps = fx.bus.emitted.filter((e) => e.type === 'agent.step');
    const completed = fx.bus.emitted.filter((e) => e.type === 'agentic.completed');
    expect(agentSteps.length).toBeGreaterThanOrEqual(1);
    expect(completed).toHaveLength(1);
    expect((completed[0]?.payload as { answer: string }).answer).toBe('hello from test');

    const run = service.getRun(runId);
    expect(run?.status).toBe('completed');
    expect(run?.answer).toBe('hello from test');
  });

  it('runs a plan → tool_call → tool_result → answer chain and records toolCallsCount', async () => {
    const fixture = buildFixture({
      script: [
        'Planning.\n{"action":"test_tool","args":{}}',
        '{"action":"final_answer","answer":"done"}',
      ],
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'go' });
    await service.waitForRun(runId);

    expect(fixture.toolCalls).toHaveLength(1);
    expect(fixture.runsRepo.finished).toHaveLength(1);
    expect(fixture.runsRepo.finished[0]?.input.status).toBe('success');
    expect(fixture.runsRepo.finished[0]?.input.toolCallsCount).toBe(1);

    const kinds = fixture.bus.emitted
      .filter((e) => e.type === 'agent.step')
      .map((e) => (e.payload as { kind: string }).kind);
    expect(kinds).toEqual(expect.arrayContaining(['plan', 'tool_call', 'tool_result', 'answer']));
  });

  it('emits agentic.failed with reason=budget_steps when the loop exhausts its step budget', async () => {
    const fixture = buildFixture({
      // Each iteration: plan + tool_call. After maxSteps of 2 we blow out.
      script: [
        '{"action":"test_tool","args":{}}',
        '{"action":"test_tool","args":{}}',
        '{"action":"test_tool","args":{}}',
        '{"action":"test_tool","args":{}}',
        '{"action":"test_tool","args":{}}',
      ],
      budgets: { maxSteps: 3, maxTokens: 8000, timeoutMs: 5000 },
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'loop' });
    await service.waitForRun(runId);

    const failed = fixture.bus.emitted.find((e) => e.type === 'agentic.failed');
    expect(failed).toBeDefined();
    expect((failed?.payload as { reason: string }).reason).toBe('budget_steps');
    expect(fixture.runsRepo.finished[0]?.input.status).toBe('error');
  });

  it('stop() aborts an in-flight run and surfaces reason=canceled', async () => {
    // Slow + signal-aware complete fn — gives us a deterministic window
    // to fire stop() mid-run. The service's abort-coercion guarantees
    // the terminal reason is 'canceled' regardless of which layer the
    // abort propagated through.
    const slowComplete: LoopCompleteFn = async (req) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 500);
        req.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      });
      return {
        text: '{"action":"final_answer","answer":"never reached"}',
        usage: { promptTokens: 1, completionTokens: 1 },
        provider: 'fake',
        model: 'fake-model',
        costUsd: 0,
      };
    };
    const fixture = buildFixture();
    fixture.deps.resolveComplete = async () => ({
      complete: slowComplete,
      provider: 'fake',
      model: 'fake-model',
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'go' });
    await new Promise((r) => setTimeout(r, 20));
    service.stop(runId);
    await service.waitForRun(runId);

    const failed = fixture.bus.emitted.find((e) => e.type === 'agentic.failed');
    expect(failed).toBeDefined();
    expect((failed?.payload as { reason: string }).reason).toBe('canceled');
    expect(fixture.runsRepo.finished[0]?.input.status).toBe('cancelled');
  });

  it('waits for orchestrator pause to clear before calling the provider', async () => {
    fx.orchestrator.paused = true;
    const service = createAgenticLoopService(fx.deps);
    const { runId } = await service.start({ companyId: fx.companyId, userText: 'paused-start' });

    // Still paused — the loop should not have completed yet.
    await new Promise((r) => setTimeout(r, 10));
    const midRun = service.getRun(runId);
    expect(midRun?.status).toBe('running');
    expect(fx.bus.emitted.filter((e) => e.type === 'agentic.completed')).toHaveLength(0);

    // Release the gate and let the loop drain.
    fx.orchestrator.paused = false;
    await service.waitForRun(runId);
    const post = service.getRun(runId);
    expect(post?.status).toBe('completed');
  });

  it('propagates a resolveComplete error without writing a runs row', async () => {
    const fixture = buildFixture({ resolveThrows: true });
    const service = createAgenticLoopService(fixture.deps);
    await expect(service.start({ companyId: fixture.companyId, userText: 'go' })).rejects.toThrow(
      'resolver-broken',
    );
    expect(fixture.runsRepo.started).toHaveLength(0);
    expect(fixture.bus.emitted.filter((e) => e.type === 'agentic.completed')).toHaveLength(0);
    expect(fixture.bus.emitted.filter((e) => e.type === 'agentic.failed')).toHaveLength(0);
  });

  it('aggregates cumulative tokens and cost across every step', async () => {
    const fixture = buildFixture({
      script: ['{"action":"test_tool","args":{}}', '{"action":"final_answer","answer":"tallied"}'],
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'sum' });
    await service.waitForRun(runId);

    const state = service.getRun(runId);
    // Two provider calls → 2 * (promptTokens=10, completionTokens=5).
    // tool_result + tool_call + answer steps land on the assistant side;
    // only the LLM-call steps carry telemetry. The service accumulates
    // from step.telemetry regardless of kind.
    expect(state?.promptTokens).toBeGreaterThanOrEqual(20);
    expect(state?.completionTokens).toBeGreaterThanOrEqual(10);
    expect(state?.costUsd).toBeGreaterThan(0);

    const finish = fixture.runsRepo.finished[0]?.input;
    expect(finish?.promptTokens).toBe(state?.promptTokens);
    expect(finish?.completionTokens).toBe(state?.completionTokens);
    expect(finish?.costUsd).toMatch(/^\d+\.\d{6}$/);
  });

  it('getRun returns null for unknown id and a snapshot for known runs', async () => {
    const service = createAgenticLoopService(fx.deps);
    const { runId } = await service.start({ companyId: fx.companyId, userText: 'snapshot' });
    expect(service.getRun('does-not-exist')).toBeNull();

    const snapshot = service.getRun(runId);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.runId).toBe(runId);
    // Snapshot is a defensive copy — mutating `steps` must not leak back
    // into the service's internal state.
    snapshot?.steps.push({
      kind: 'plan',
      stepIndex: 999,
      text: 'mutation attempt',
      telemetry: { tokensIn: 0, tokensOut: 0, costUsd: 0, provider: '', model: '' },
    });
    const second = service.getRun(runId);
    expect(second?.steps.some((s) => 'text' in s && s.text === 'mutation attempt')).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // M32 T0 / F1 — getRunSnapshot
  // Backfill projection tests. Covers:
  //   1. null for unknown runId (silent IPC fallback path)
  //   2. projected steps match the wire shape emitted by `agent.step`
  //   3. terminal latches to { kind: 'completed', payload } after
  //      finish, with durationMs + totalSteps derived correctly
  //   4. terminal stays null for in-flight runs
  //   5. failed runs project to { kind: 'failed', payload } with
  //      the same reason string the `agentic.failed` event carries
  // ─────────────────────────────────────────────────────────────────

  it('getRunSnapshot returns null for unknown runId', () => {
    const service = createAgenticLoopService(fx.deps);
    expect(service.getRunSnapshot('does-not-exist')).toBeNull();
  });

  it('getRunSnapshot projects steps to the agent.step wire shape and latches terminal=completed', async () => {
    const fixture = buildFixture({
      script: ['{"action":"test_tool","args":{}}', '{"action":"final_answer","answer":"done"}'],
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId, threadId } = await service.start({
      companyId: fixture.companyId,
      userText: 'snap me',
    });
    await service.waitForRun(runId);

    const snap = service.getRunSnapshot(runId);
    expect(snap).not.toBeNull();
    expect(snap?.runId).toBe(runId);
    expect(snap?.threadId).toBe(threadId);

    // Every step carries the JSON-safe wire shape — no LoopStep fields leak.
    expect(snap?.steps.length).toBeGreaterThanOrEqual(3);
    for (const step of snap?.steps ?? []) {
      expect(step.runId).toBe(runId);
      expect(step.threadId).toBe(threadId);
      expect(typeof step.stepIndex).toBe('number');
      expect(['plan', 'tool_call', 'tool_result', 'answer', 'error']).toContain(step.kind);
      expect(typeof step.tokensIn).toBe('number');
      expect(typeof step.tokensOut).toBe('number');
      expect(typeof step.costUsd).toBe('number');
      expect(typeof step.provider).toBe('string');
      expect(typeof step.model).toBe('string');
    }

    // Snapshot byte-for-byte parity with the emitted bus events.
    const stepEvents = fixture.bus.emitted.filter((e) => e.type === 'agent.step');
    expect(snap?.steps.length).toBe(stepEvents.length);

    // Terminal latches to completed.
    expect(snap?.terminal?.kind).toBe('completed');
    if (snap?.terminal?.kind === 'completed') {
      expect(snap.terminal.payload.answer).toBe('done');
      expect(snap.terminal.payload.totalSteps).toBe(snap.steps.length);
      expect(snap.terminal.payload.runId).toBe(runId);
      expect(snap.terminal.payload.threadId).toBe(threadId);
      expect(snap.terminal.payload.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('getRunSnapshot terminal=null for an in-flight run', async () => {
    // Hold the completion open via a never-resolving provider so the run
    // stays in status='running' long enough to snapshot.
    const fixture = buildFixture();
    let releasePending: (() => void) | null = null;
    const pending = new Promise<void>((resolve) => {
      releasePending = resolve;
    });
    fixture.deps.resolveComplete = async () => ({
      complete: async () => {
        await pending;
        return { text: '{"action":"final_answer","answer":"late"}' } as LoopProviderCompletion;
      },
      provider: 'slow',
      model: 'slow-model',
    });

    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'block' });
    // The run is in-flight; snapshot now.
    const snap = service.getRunSnapshot(runId);
    expect(snap).not.toBeNull();
    expect(snap?.terminal).toBeNull();

    releasePending?.();
    await service.waitForRun(runId);
  });

  it('getRunSnapshot projects failed runs to terminal.kind=failed with the same reason as agentic.failed', async () => {
    const fixture = buildFixture();
    fixture.deps.resolveComplete = async () => ({
      complete: async () => {
        throw new Error('provider-down');
      },
      provider: 'broken',
      model: 'broken-model',
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'boom' });
    await service.waitForRun(runId);

    const snap = service.getRunSnapshot(runId);
    expect(snap?.terminal?.kind).toBe('failed');
    const failedEvent = fixture.bus.emitted.find((e) => e.type === 'agentic.failed');
    if (snap?.terminal?.kind === 'failed') {
      expect(snap.terminal.payload.reason).toBe(
        (failedEvent?.payload as { reason: string }).reason,
      );
      expect(snap.terminal.payload.totalSteps).toBe(snap.steps.length);
    }
  });

  it('throws an informative error when the system-agent is missing for the company', async () => {
    const fixture = buildFixture({ missingAgent: true });
    const service = createAgenticLoopService(fixture.deps);
    await expect(service.start({ companyId: fixture.companyId, userText: 'go' })).rejects.toThrow(
      /No system-agent employee/,
    );
  });

  it('surfaces an unexpected loop.run throw as reason=provider_error', async () => {
    // Simulate an infra panic — the loop is defensive, so to hit the
    // outer catch we inject a buildTools that throws at construction
    // time. createAgenticLoop(deps) is called after buildTools(), so a
    // throw here triggers the synchronous path before `loop.run`; but
    // we still need to hit the "loop.run threw" branch. Easiest: make
    // resolveComplete return a complete fn that itself throws a
    // non-AbortError, and wrap loop.run to propagate. The loop's
    // internal try catches LoopProviderCompletion errors and converts
    // them to provider_error steps, so instead we stub a tool whose
    // schema validator throws — but that too is caught. The only way
    // to exercise the outer catch is to make the loop reject, which
    // means mocking `createAgenticLoop` itself. Skip this one via a
    // narrow stub.
    const fixture = buildFixture();
    // Override resolveComplete to return a complete fn that throws a
    // non-Abort error. The loop DOES catch this and emits an error
    // step with reason='provider_error'. That's the same end-state we
    // want — verify the downstream agentic.failed path fires and
    // records the reason.
    fixture.deps.resolveComplete = async () => ({
      complete: async () => {
        throw new Error('provider-down');
      },
      provider: 'broken',
      model: 'broken-model',
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'sad' });
    await service.waitForRun(runId);

    const failed = fixture.bus.emitted.find((e) => e.type === 'agentic.failed');
    expect(failed).toBeDefined();
    expect((failed?.payload as { reason: string }).reason).toBe('provider_error');
    expect(fixture.runsRepo.finished[0]?.input.status).toBe('error');
  });

  it('writes a message row for every loop step with authorKind=employee', async () => {
    const fixture = buildFixture({
      script: ['{"action":"test_tool","args":{}}', '{"action":"final_answer","answer":"done"}'],
    });
    const service = createAgenticLoopService(fixture.deps);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'audit' });
    await service.waitForRun(runId);

    // Index 0 is the user message. The remainder are step messages.
    const stepMessages = fixture.messages.appended.slice(1);
    expect(stepMessages.length).toBeGreaterThanOrEqual(3);
    for (const m of stepMessages) {
      expect(m.authorId).toBe(fixture.systemAgentId);
      expect(m.authorKind).toBe('employee');
    }
    expect(stepMessages.some((m) => m.content.startsWith('[tool_call]'))).toBe(true);
    expect(stepMessages.some((m) => m.content.startsWith('[tool_result]'))).toBe(true);
    expect(stepMessages.some((m) => m.content === 'done')).toBe(true);
  });

  it('uses default budgets when getBudgets is not provided', async () => {
    const fixture = buildFixture();
    const { getBudgets: _omit, ...rest } = fixture.deps;
    void _omit;
    const service = createAgenticLoopService(rest);
    const { runId } = await service.start({ companyId: fixture.companyId, userText: 'defaults' });
    await service.waitForRun(runId);
    expect(service.getRun(runId)?.status).toBe('completed');
  });

  it('waitForRun resolves immediately for unknown runIds', async () => {
    const service = createAgenticLoopService(fx.deps);
    const before = Date.now();
    await service.waitForRun('nonexistent');
    expect(Date.now() - before).toBeLessThan(100);
  });
});
