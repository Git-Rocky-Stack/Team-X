/**
 * Orchestrator facade — the single public surface the IPC layer talks to.
 *
 * Composes the three Phase 1 primitives:
 *
 *   - the event bus (T28) for dashboard fan-out,
 *   - the work queue (T29) for concurrency-capped FIFO dispatch,
 *   - `runAgent` (T30) for the actual LLM turn.
 *
 * Everything above this file (IPC handlers in T33, preload bridge in T34,
 * the renderer) consumes only the `Orchestrator` interface below. Nothing
 * above reaches into the event bus or work queue directly — the facade is
 * the invariant boundary.
 *
 * Design decisions worth pinning:
 *
 * 1. All per-turn lookups happen INSIDE the queued task, not at
 *    `enqueueChat` call time. That keeps the pause/drain semantics of
 *    the work queue clean: a paused orchestrator genuinely does nothing,
 *    including no disk reads and no provider picks. It also means
 *    enqueueChat returns immediately and never waits on disk I/O.
 *
 * 2. `resolveSystemPrompt` and `resolveProvider` are injected async
 *    callbacks, not inlined logic. The real implementations land in T32
 *    (parse role.md, render template vars, consult provider-router
 *    registry + keytar). Keeping them as injection points means this
 *    module and its tests stay deterministic and have zero dependency
 *    on the filesystem or the keychain.
 *
 * 3. Repos are narrowed to structural interfaces rather than importing
 *    the full `createXRepo` return types. Same rationale as
 *    `EventsRepoLike` on the event bus: avoids leaking
 *    `BaseSQLiteDatabase` generics into the orchestrator layer, and
 *    lets tests hand-roll fakes when needed.
 *
 * 4. `shutdown` is a latch. Once called, `enqueueChat` rejects
 *    synchronously on subsequent calls — no silent drop, no half-state.
 *    The latch flips BEFORE draining so any work enqueued during the
 *    drain window is rejected cleanly.
 *
 * 5. Phase 1 history mapping assumes DM threads (one user + one
 *    employee). `author_kind === 'employee'` maps to `assistant` role
 *    in the provider stream. Phase 2 multi-employee meetings will
 *    need richer mapping (e.g. name-prefixed assistant turns); that's
 *    a meeting-primitive concern, not a Phase 1 one.
 */

import type { ProviderStreamFn, StreamMessage } from '@team-x/provider-router';
import type { AuthorKind } from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type { FinishRunInput, StartRunInput } from '../db/repos/runs.js';
import type { GetOrCreateEmployeeDmThreadInput, ThreadRow } from '../db/repos/threads.js';
import { type EnqueueAgentReplyFn, buildBuiltInTools } from './built-in-tools.js';
import type { EventBus } from './event-bus.js';
import { type WorkQueue, createWorkQueue } from './queue.js';
import { type CostCalculator, runAgent } from './run-agent.js';

// ---------------------------------------------------------------------------
// Repo shapes
// ---------------------------------------------------------------------------

/**
 * Narrowed repo interfaces. Each one declares exactly the methods the
 * orchestrator actually uses. The real `createXRepo(db)` return values
 * satisfy these via structural typing with no casts required.
 */
export interface OrchestratorMessagesRepo {
  append(input: AppendMessageInput): string;
  updateContent(id: string, content: string): void;
  listByThread(threadId: string): MessageRow[];
}

export interface OrchestratorRunsRepo {
  start(input: StartRunInput): string;
  finish(id: string, input: FinishRunInput): void;
}

export interface OrchestratorEmployeesRepo {
  getById(id: string): EmployeeRow | null;
  listByCompany(companyId: string): EmployeeRow[];
}

export interface OrchestratorCompaniesRepo {
  getById(id: string): CompanyRow | null;
  setStatus(id: string, status: string): void;
}

export interface OrchestratorThreadsRepo {
  getById(id: string): ThreadRow | null;
  getOrCreateEmployeeDmThread(input: GetOrCreateEmployeeDmThreadInput): string;
  updateLastMessageAt(threadId: string, timestamp: number): void;
}

// ---------------------------------------------------------------------------
// Injection contracts
// ---------------------------------------------------------------------------

/**
 * Resolver that turns an employee + company pair into a rendered system
 * prompt. The real implementation (T32) will:
 *
 *   1. Look up `role.md` on disk via `employee.rolePackId` + `employee.roleId`,
 *   2. Parse it with `parseRoleMarkdown`,
 *   3. Substitute template vars via `renderRoleBody` using the company's
 *      parsed settings JSON.
 *
 * Returning a pre-rendered string keeps `runAgent` free of disk and
 * role-pack concerns.
 */
export type ResolveSystemPrompt = (args: {
  employee: EmployeeRow;
  company: CompanyRow;
  threadId: string;
}) => Promise<string>;

/**
 * Resolver that picks a provider + model for a given employee. The real
 * implementation (T32) will consult the provider-router registry, apply
 * the user's privacy-tier filter, and load API keys from keytar. Phase 1
 * tests inject a fake that returns a stub async generator.
 */
export type ResolveProvider = (employee: EmployeeRow) => Promise<{
  providerName: string;
  model: string;
  stream: ProviderStreamFn;
}>;

/**
 * Resolver that builds AI SDK tools for an agent turn. The real
 * implementation converts MCP tools (filtered by the employee's
 * tools_allowed/denied) into AI SDK `CoreTool` objects with `execute`
 * callbacks wired to `McpHost.callTool()`.
 *
 * `getRunId` is a getter the caller uses inside execute callbacks to
 * retrieve the runId that `runAgent` creates at the start of the turn.
 * It's a getter (not a value) because tool definitions are built
 * before runAgent creates the run row.
 *
 * Returns null when no tools are available for this employee/company.
 */
export type ResolveTools = (args: {
  employee: EmployeeRow;
  company: CompanyRow;
  getRunId: () => string;
}) => Promise<{ tools: Record<string, unknown>; maxSteps: number } | null>;

// ---------------------------------------------------------------------------
// Public Orchestrator interface
// ---------------------------------------------------------------------------

export interface EnqueueChatArgs {
  threadId: string;
  employeeId: string;
  /**
   * The id of the user message that just triggered this turn. The
   * orchestrator does NOT re-insert it — the IPC handler already did
   * that before calling enqueueChat (see T33). This field exists so
   * downstream consumers (work.failed payloads, future retry logic)
   * can correlate a failed turn back to the triggering user message.
   */
  userMessageId: string;
}

export interface EnqueueAgentReplyArgs {
  threadId: string;
  employeeId: string;
  /** The id of the agent message that triggered this reply. */
  triggerMessageId: string;
}

export interface Orchestrator {
  /**
   * Queue a chat turn for the given employee. Returns a Promise that
   * resolves when the turn has fully completed (assistant message
   * persisted, runs row closed, `work.completed` emitted), or rejects
   * if the provider errors out, a lookup fails, or the orchestrator is
   * in shutdown.
   */
  enqueueChat(args: EnqueueChatArgs): Promise<void>;

  /**
   * Queue an agent-initiated reply turn. Used by the built-in
   * `send_message_to_colleague` tool: after agent A sends a message
   * to agent B, the orchestrator enqueues a turn for B on the same
   * thread. The history mapping is role-relative: B's own messages
   * map to `assistant`, all other messages map to `user`.
   */
  enqueueAgentReply(args: EnqueueAgentReplyArgs): Promise<void>;

  /** Stop dispatching new work. In-flight turns continue to completion. */
  pause(): void;

  /** Resume dispatching. */
  resume(): void;

  /**
   * Pause dispatch for a single company — used by the meeting primitive.
   * Sets company.status to 'meeting' in the DB and blocks new work for
   * that company. In-flight turns for the company continue to completion.
   * Returns a Promise that resolves when all in-flight work for the
   * company has drained.
   */
  pauseCompany(companyId: string): Promise<void>;

  /**
   * Resume dispatch for a previously paused company. Sets company.status
   * back to 'running' in the DB and allows new work to proceed.
   * No-op if the company is not paused.
   */
  resumeCompany(companyId: string): void;

  /** Whether a specific company is currently paused (in a meeting). */
  isCompanyPaused(companyId: string): boolean;

  /**
   * Gracefully stop: pause the queue, await every in-flight turn, then
   * reject any subsequent `enqueueChat` calls. Safe to call multiple
   * times — second and later calls return the same drain promise.
   */
  shutdown(): Promise<void>;

  /**
   * Escape hatch for T36 / main process wiring that wants to subscribe
   * to the bus (for forwarding events to the renderer). Tests use this
   * directly too.
   */
  readonly bus: EventBus;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildOrchestratorOptions {
  bus: EventBus;
  messagesRepo: OrchestratorMessagesRepo;
  runsRepo: OrchestratorRunsRepo;
  employeesRepo: OrchestratorEmployeesRepo;
  companiesRepo: OrchestratorCompaniesRepo;
  threadsRepo: OrchestratorThreadsRepo;
  calcCost: CostCalculator;
  resolveSystemPrompt: ResolveSystemPrompt;
  resolveProvider: ResolveProvider;
  /** Optional — when absent, agents have no tool access. */
  resolveTools?: ResolveTools;
  /**
   * Concurrent dispatch cap. Phase 1 default is intentionally low (2)
   * so local ollama never gets stampeded; T36 reads the real number
   * from the provider settings service.
   */
  slots: number;
  /** Optional clock injection for tests. Passed through to runAgent. */
  now?: () => number;
}

/** Map a DB message's author kind to the provider-facing stream role. */
function authorKindToStreamRole(kind: AuthorKind): StreamMessage['role'] {
  switch (kind) {
    case 'user':
      return 'user';
    case 'employee':
      return 'assistant';
    case 'system':
      return 'system';
  }
}

function mapHistory(rows: MessageRow[]): StreamMessage[] {
  return rows.map((row) => ({
    role: authorKindToStreamRole(row.authorKind as AuthorKind),
    content: row.content,
  }));
}

/**
 * Role-relative history mapping for agent↔agent threads. The
 * responding employee's messages map to `assistant`; all other
 * messages map to `user`. This gives each agent the correct
 * first-person perspective regardless of who initiated.
 */
function mapAgentHistory(rows: MessageRow[], respondingEmployeeId: string): StreamMessage[] {
  return rows.map((row) => ({
    role: row.authorId === respondingEmployeeId ? ('assistant' as const) : ('user' as const),
    content: row.content,
  }));
}

export function buildOrchestrator(opts: BuildOrchestratorOptions): Orchestrator {
  const {
    bus,
    messagesRepo,
    runsRepo,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    calcCost,
    resolveSystemPrompt,
    resolveProvider,
    resolveTools,
    slots,
    now,
  } = opts;

  const queue: WorkQueue = createWorkQueue({ slots });

  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  // Per-company pause tracking for the meeting primitive.
  // When a company is paused, new work for that company waits on a
  // gate promise until resumeCompany() resolves it.
  const pausedCompanies = new Set<string>();
  const companyGates = new Map<string, { resolve: () => void; promise: Promise<void> }>();
  /** Track in-flight work per company so pauseCompany can drain. */
  const companyInFlight = new Map<string, number>();

  function incrementCompanyInFlight(companyId: string): void {
    companyInFlight.set(companyId, (companyInFlight.get(companyId) ?? 0) + 1);
  }

  function decrementCompanyInFlight(companyId: string): void {
    const count = (companyInFlight.get(companyId) ?? 1) - 1;
    if (count <= 0) {
      companyInFlight.delete(companyId);
      // Notify any drain waiters for this company
      const drainResolvers = companyDrainWaiters.get(companyId);
      if (drainResolvers) {
        for (const r of drainResolvers) r();
        companyDrainWaiters.delete(companyId);
      }
    } else {
      companyInFlight.set(companyId, count);
    }
  }

  const companyDrainWaiters = new Map<string, Array<() => void>>();

  function waitForCompanyDrain(companyId: string): Promise<void> {
    if ((companyInFlight.get(companyId) ?? 0) === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const existing = companyDrainWaiters.get(companyId) ?? [];
      existing.push(resolve);
      companyDrainWaiters.set(companyId, existing);
    });
  }

  /**
   * If the company is paused, wait until it's resumed before proceeding.
   * This is called inside the queued task, AFTER it gets a slot but
   * BEFORE any lookups or provider calls — so a paused company genuinely
   * does no work.
   */
  async function waitIfCompanyPaused(companyId: string): Promise<void> {
    const gate = companyGates.get(companyId);
    if (gate && pausedCompanies.has(companyId)) {
      await gate.promise;
    }
  }

  async function runTurn(args: EnqueueChatArgs): Promise<void> {
    // All lookups happen inside the queued task. If the orchestrator
    // was paused between enqueue and dispatch, these don't fire.
    const thread = threadsRepo.getById(args.threadId);
    if (!thread) {
      throw new Error(`orchestrator: thread not found: ${args.threadId}`);
    }

    // Per-company pause gate: if the company is in a meeting, wait
    // until the meeting ends before doing any work.
    await waitIfCompanyPaused(thread.companyId);

    const employee = employeesRepo.getById(args.employeeId);
    if (!employee) {
      throw new Error(`orchestrator: employee not found: ${args.employeeId}`);
    }

    // Defensive check: the employee must belong to the thread's company.
    // The IPC layer should never present a mismatched pair, but the
    // orchestrator is the last line of defense before a turn runs on
    // the wrong data.
    if (employee.companyId !== thread.companyId) {
      throw new Error(
        `orchestrator: employee ${args.employeeId} does not belong to ` +
          `thread ${args.threadId}'s company`,
      );
    }

    const company = companiesRepo.getById(thread.companyId);
    if (!company) {
      throw new Error(`orchestrator: company not found: ${thread.companyId}`);
    }

    // Mutable ref — filled by runAgent's onRunCreated callback so
    // tool execute closures can read it at call time.
    let currentRunId = '';
    const getRunId = () => currentRunId;

    const [system, provider, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveProvider(employee),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    const history = mapHistory(messagesRepo.listByThread(args.threadId));

    // Merge MCP tools with built-in tools (M11). Built-in tools are
    // always available; MCP tools are subject to tools_allowed/denied.
    const builtInSpecs = buildBuiltInTools(
      {
        bus,
        employees: employeesRepo,
        messages: messagesRepo,
        threads: threadsRepo,
        enqueueAgentReply: enqueueAgentReplyInternal,
      },
      args.employeeId,
      company.id,
    );

    // Merge: if resolveTools returned MCP tools, import and merge.
    // Built-in tools are ToolSpec[]; MCP tools are already
    // Record<string, CoreTool>. We need to convert built-ins via
    // buildProviderTools then spread both records together.
    let finalTools: Record<string, unknown> | undefined;
    let finalMaxSteps = 1;

    // Convert built-in specs to CoreTool records.
    const { buildProviderTools } = await import('@team-x/provider-router');
    const builtInToolsRecord = buildProviderTools(builtInSpecs);

    if (toolConfig) {
      finalTools = { ...builtInToolsRecord, ...toolConfig.tools };
      finalMaxSteps = toolConfig.maxSteps;
    } else if (builtInSpecs.length > 0) {
      finalTools = builtInToolsRecord;
      finalMaxSteps = 5; // Allow multi-step for built-in tools
    }

    await runAgent(
      {
        bus,
        messages: messagesRepo,
        runs: runsRepo,
        calcCost,
        now,
      },
      {
        companyId: company.id,
        threadId: args.threadId,
        employeeId: args.employeeId,
        system,
        messages: history,
        provider: provider.stream,
        providerName: provider.providerName,
        model: provider.model,
        ...(finalTools
          ? {
              tools: finalTools,
              maxSteps: finalMaxSteps,
              onRunCreated: (runId: string) => {
                currentRunId = runId;
              },
            }
          : {}),
      },
    );
  }

  /**
   * Internal agent-reply turn: same as runTurn but uses
   * role-relative history mapping for agent↔agent threads.
   */
  async function runAgentReplyTurn(args: EnqueueAgentReplyArgs): Promise<void> {
    const thread = threadsRepo.getById(args.threadId);
    if (!thread) {
      throw new Error(`orchestrator: thread not found: ${args.threadId}`);
    }

    // Per-company pause gate (same as runTurn).
    await waitIfCompanyPaused(thread.companyId);

    const employee = employeesRepo.getById(args.employeeId);
    if (!employee) {
      throw new Error(`orchestrator: employee not found: ${args.employeeId}`);
    }

    if (employee.companyId !== thread.companyId) {
      throw new Error(
        `orchestrator: employee ${args.employeeId} does not belong to ` +
          `thread ${args.threadId}'s company`,
      );
    }

    const company = companiesRepo.getById(thread.companyId);
    if (!company) {
      throw new Error(`orchestrator: company not found: ${thread.companyId}`);
    }

    let currentRunId = '';
    const getRunId = () => currentRunId;

    const [system, provider, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveProvider(employee),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    // Role-relative history: this employee's messages → assistant,
    // all others → user.
    const history = mapAgentHistory(messagesRepo.listByThread(args.threadId), args.employeeId);

    // Built-in tools for the recipient too.
    const builtInSpecs = buildBuiltInTools(
      {
        bus,
        employees: employeesRepo,
        messages: messagesRepo,
        threads: threadsRepo,
        enqueueAgentReply: enqueueAgentReplyInternal,
      },
      args.employeeId,
      company.id,
    );

    const { buildProviderTools } = await import('@team-x/provider-router');
    const builtInToolsRecord = buildProviderTools(builtInSpecs);

    let finalTools: Record<string, unknown> | undefined;
    let finalMaxSteps = 1;

    if (toolConfig) {
      finalTools = { ...builtInToolsRecord, ...toolConfig.tools };
      finalMaxSteps = toolConfig.maxSteps;
    } else if (builtInSpecs.length > 0) {
      finalTools = builtInToolsRecord;
      finalMaxSteps = 5;
    }

    await runAgent(
      {
        bus,
        messages: messagesRepo,
        runs: runsRepo,
        calcCost,
        now,
      },
      {
        companyId: company.id,
        threadId: args.threadId,
        employeeId: args.employeeId,
        system,
        messages: history,
        provider: provider.stream,
        providerName: provider.providerName,
        model: provider.model,
        ...(finalTools
          ? {
              tools: finalTools,
              maxSteps: finalMaxSteps,
              onRunCreated: (runId: string) => {
                currentRunId = runId;
              },
            }
          : {}),
      },
    );
  }

  /**
   * Resolve the company id for an enqueued task. Used for in-flight
   * tracking. We look up the thread to find the company — same lookup
   * that runTurn does, but here we just need the company id for
   * bookkeeping before the task enters the queue.
   */
  function resolveCompanyId(threadId: string): string | null {
    const thread = threadsRepo.getById(threadId);
    return thread?.companyId ?? null;
  }

  // Self-reference for built-in tools to call back into.
  const enqueueAgentReplyInternal: EnqueueAgentReplyFn = (args) => {
    if (shuttingDown) {
      return Promise.reject(
        new Error('orchestrator: cannot enqueue — orchestrator is shutting down'),
      );
    }
    const cid = resolveCompanyId(args.threadId);
    if (cid) incrementCompanyInFlight(cid);
    return queue
      .enqueue(() => runAgentReplyTurn(args))
      .finally(() => {
        if (cid) decrementCompanyInFlight(cid);
      });
  };

  return {
    enqueueChat(args: EnqueueChatArgs): Promise<void> {
      if (shuttingDown) {
        return Promise.reject(
          new Error('orchestrator: cannot enqueue — orchestrator is shutting down'),
        );
      }
      const cid = resolveCompanyId(args.threadId);
      if (cid) incrementCompanyInFlight(cid);
      return queue
        .enqueue(() => runTurn(args))
        .finally(() => {
          if (cid) decrementCompanyInFlight(cid);
        });
    },

    enqueueAgentReply(args: EnqueueAgentReplyArgs): Promise<void> {
      return enqueueAgentReplyInternal(args);
    },

    pause(): void {
      queue.pause();
    },

    resume(): void {
      if (shuttingDown) return;
      queue.resume();
    },

    async pauseCompany(companyId: string): Promise<void> {
      if (pausedCompanies.has(companyId)) return;
      pausedCompanies.add(companyId);
      companiesRepo.setStatus(companyId, 'meeting');

      // Create a gate that new work for this company will await.
      let gateResolve: () => void = () => {};
      const gatePromise = new Promise<void>((r) => {
        gateResolve = r;
      });
      companyGates.set(companyId, { resolve: gateResolve, promise: gatePromise });

      // Wait for any in-flight work for this company to finish.
      await waitForCompanyDrain(companyId);
    },

    resumeCompany(companyId: string): void {
      if (!pausedCompanies.has(companyId)) return;
      pausedCompanies.delete(companyId);
      companiesRepo.setStatus(companyId, 'running');

      // Open the gate so any queued work for this company can proceed.
      const gate = companyGates.get(companyId);
      if (gate) {
        gate.resolve();
        companyGates.delete(companyId);
      }
    },

    isCompanyPaused(companyId: string): boolean {
      return pausedCompanies.has(companyId);
    },

    shutdown(): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      queue.pause();
      shutdownPromise = queue.drain();
      return shutdownPromise;
    },

    get bus() {
      return bus;
    },
  };
}
