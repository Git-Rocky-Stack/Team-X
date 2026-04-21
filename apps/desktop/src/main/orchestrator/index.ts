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
  providerKind?: string;
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

  /** Best-effort cancel for the active turn on a thread. */
  stopThread(threadId: string): boolean;

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

  /** Apply updated runtime concurrency settings to future dispatches. */
  updateConcurrency(args: UpdateConcurrencyArgs): void;

  /**
   * Escape hatch for T36 / main process wiring that wants to subscribe
   * to the bus (for forwarding events to the renderer). Tests use this
   * directly too.
   */
  readonly bus: EventBus;
}

export interface UpdateConcurrencyArgs {
  slots?: number;
  providerCaps?: Record<string, number>;
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
  /** Optional per-provider-kind concurrent dispatch caps. */
  providerCaps?: Record<string, number>;
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

const PROVIDER_EMPTY_ASSISTANT_TEXT =
  "I couldn't complete that reply. Provider returned no assistant text.";

function shouldIncludeInHistory(row: MessageRow): boolean {
  const trimmed = row.content.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (row.authorKind !== 'user' && trimmed === PROVIDER_EMPTY_ASSISTANT_TEXT) {
    return false;
  }
  return true;
}

function mapHistory(rows: MessageRow[]): StreamMessage[] {
  return rows.filter(shouldIncludeInHistory).map((row) => ({
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
  return rows.filter(shouldIncludeInHistory).map((row) => ({
    role: row.authorId === respondingEmployeeId ? ('assistant' as const) : ('user' as const),
    content: row.content,
  }));
}

function normalizePositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded < 1 ? 1 : rounded;
}

function normalizeProviderCaps(
  providerCaps: Record<string, number> | undefined,
): Record<string, number> {
  if (!providerCaps) return {};
  const normalized: Record<string, number> = {};
  for (const [kind, cap] of Object.entries(providerCaps)) {
    normalized[kind] = normalizePositiveInt(cap, 1);
  }
  return normalized;
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
    providerCaps,
    now,
  } = opts;

  interface ResolvedProvider {
    providerName: string;
    providerKind?: string;
    model: string;
    stream: ProviderStreamFn;
  }

  interface PendingTaskBase {
    threadId: string;
    employeeId: string;
    resolve: () => void;
    reject: (reason: unknown) => void;
  }

  interface PendingChatTask extends PendingTaskBase {
    kind: 'chat';
    userMessageId: string;
  }

  interface PendingAgentReplyTask extends PendingTaskBase {
    kind: 'agent-reply';
    triggerMessageId: string;
  }

  type PendingTask = PendingChatTask | PendingAgentReplyTask;

  let currentSlots = normalizePositiveInt(slots, 1);
  let currentProviderCaps = normalizeProviderCaps(providerCaps);
  let paused = false;
  let dispatching = false;
  let activeCount = 0;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const pending: PendingTask[] = [];
  const drainWaiters: Array<() => void> = [];
  const activeByProviderKind = new Map<string, number>();
  const activeByThread = new Set<string>();
  const activeControllersByThread = new Map<string, AbortController>();

  // Per-company pause tracking for the meeting primitive.
  const pausedCompanies = new Set<string>();
  const companyGates = new Map<string, { resolve: () => void; promise: Promise<void> }>();
  const companyInFlight = new Map<string, number>();
  const companyDrainWaiters = new Map<string, Array<() => void>>();

  function incrementCompanyInFlight(companyId: string): void {
    companyInFlight.set(companyId, (companyInFlight.get(companyId) ?? 0) + 1);
  }

  function decrementCompanyInFlight(companyId: string): void {
    const count = (companyInFlight.get(companyId) ?? 1) - 1;
    if (count <= 0) {
      companyInFlight.delete(companyId);
      const waiters = companyDrainWaiters.get(companyId);
      if (waiters) {
        for (const resolve of waiters) resolve();
        companyDrainWaiters.delete(companyId);
      }
    } else {
      companyInFlight.set(companyId, count);
    }
  }

  function waitForCompanyDrain(companyId: string): Promise<void> {
    if ((companyInFlight.get(companyId) ?? 0) === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const waiters = companyDrainWaiters.get(companyId) ?? [];
      waiters.push(resolve);
      companyDrainWaiters.set(companyId, waiters);
    });
  }

  async function waitIfCompanyPaused(companyId: string): Promise<void> {
    const gate = companyGates.get(companyId);
    if (gate && pausedCompanies.has(companyId)) {
      await gate.promise;
    }
  }

  function notifyDrainIfIdle(): void {
    if (activeCount === 0 && drainWaiters.length > 0) {
      const waiters = drainWaiters.splice(0, drainWaiters.length);
      for (const resolve of waiters) resolve();
    }
  }

  function getProviderCap(providerKind: string | undefined): number {
    if (!providerKind) return Number.POSITIVE_INFINITY;
    const configured = currentProviderCaps[providerKind];
    return configured === undefined ? Number.POSITIVE_INFINITY : normalizePositiveInt(configured, 1);
  }

  async function runTurn(
    args: EnqueueChatArgs,
    provider: ResolvedProvider,
    signal: AbortSignal,
  ): Promise<void> {
    const thread = threadsRepo.getById(args.threadId);
    if (!thread) {
      throw new Error(`orchestrator: thread not found: ${args.threadId}`);
    }

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

    const [system, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    const history = mapHistory(messagesRepo.listByThread(args.threadId));
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

    let finalTools: Record<string, unknown> | undefined;
    let finalMaxSteps = 1;

    const { buildProviderTools } = await import('@team-x/provider-router');
    const builtInToolsRecord = buildProviderTools(builtInSpecs);
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
        signal,
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

  async function runAgentReplyTurn(
    args: EnqueueAgentReplyArgs,
    provider: ResolvedProvider,
    signal: AbortSignal,
  ): Promise<void> {
    const thread = threadsRepo.getById(args.threadId);
    if (!thread) {
      throw new Error(`orchestrator: thread not found: ${args.threadId}`);
    }

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

    const [system, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    const history = mapAgentHistory(messagesRepo.listByThread(args.threadId), args.employeeId);
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
        signal,
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

  function settleTask(task: PendingTask, err: unknown): void {
    task.reject(err);
  }

  function cancelPendingTasksForThread(threadId: string): boolean {
    let canceled = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const task = pending[i];
      if (!task || task.threadId !== threadId) continue;
      pending.splice(i, 1);
      canceled = true;
      task.reject(new Error('Run canceled by user'));
    }
    return canceled;
  }

  async function selectNextDispatchable():
    Promise<{ task: PendingTask; companyId: string; provider: ResolvedProvider } | null> {
    for (let i = 0; i < pending.length; i++) {
      const task = pending[i];
      if (!task) continue;
      if (activeByThread.has(task.threadId)) continue;

      const thread = threadsRepo.getById(task.threadId);
      if (!thread) {
        pending.splice(i, 1);
        settleTask(task, new Error(`orchestrator: thread not found: ${task.threadId}`));
        i--;
        continue;
      }
      if (pausedCompanies.has(thread.companyId)) continue;

      const employee = employeesRepo.getById(task.employeeId);
      if (!employee) {
        pending.splice(i, 1);
        settleTask(task, new Error(`orchestrator: employee not found: ${task.employeeId}`));
        i--;
        continue;
      }
      if (employee.companyId !== thread.companyId) {
        pending.splice(i, 1);
        settleTask(
          task,
          new Error(
            `orchestrator: employee ${task.employeeId} does not belong to ` +
              `thread ${task.threadId}'s company`,
          ),
        );
        i--;
        continue;
      }

      let provider: ResolvedProvider;
      try {
        provider = await resolveProvider(employee);
      } catch (err) {
        pending.splice(i, 1);
        settleTask(task, err);
        i--;
        continue;
      }

      if (shuttingDown) return null;
      if (activeByThread.has(task.threadId) || pausedCompanies.has(thread.companyId)) continue;
      if (provider.providerKind) {
        const inFlightForKind = activeByProviderKind.get(provider.providerKind) ?? 0;
        if (inFlightForKind >= getProviderCap(provider.providerKind)) {
          continue;
        }
      }

      const pendingIndex = pending.indexOf(task);
      if (pendingIndex === -1) continue;
      pending.splice(pendingIndex, 1);
      return { task, companyId: thread.companyId, provider };
    }
    return null;
  }

  function scheduleDispatch(): void {
    if (dispatching || paused || shuttingDown) {
      notifyDrainIfIdle();
      return;
    }
    dispatching = true;
    void (async () => {
      try {
        while (!paused && !shuttingDown && activeCount < currentSlots) {
          const next = await selectNextDispatchable();
          if (!next) break;
          if (paused || shuttingDown || activeCount >= currentSlots) {
            pending.unshift(next.task);
            break;
          }

          const controller = new AbortController();
          activeCount++;
          activeByThread.add(next.task.threadId);
          activeControllersByThread.set(next.task.threadId, controller);
          if (next.provider.providerKind) {
            activeByProviderKind.set(
              next.provider.providerKind,
              (activeByProviderKind.get(next.provider.providerKind) ?? 0) + 1,
            );
          }
          incrementCompanyInFlight(next.companyId);

          const runPromise =
            next.task.kind === 'chat'
              ? runTurn(next.task, next.provider, controller.signal)
              : runAgentReplyTurn(next.task, next.provider, controller.signal);

          runPromise.then(next.task.resolve, next.task.reject).finally(() => {
            activeCount--;
            activeByThread.delete(next.task.threadId);
            if (activeControllersByThread.get(next.task.threadId) === controller) {
              activeControllersByThread.delete(next.task.threadId);
            }
            if (next.provider.providerKind) {
              const remaining = (activeByProviderKind.get(next.provider.providerKind) ?? 1) - 1;
              if (remaining <= 0) {
                activeByProviderKind.delete(next.provider.providerKind);
              } else {
                activeByProviderKind.set(next.provider.providerKind, remaining);
              }
            }
            decrementCompanyInFlight(next.companyId);
            notifyDrainIfIdle();
            scheduleDispatch();
          });
        }
      } finally {
        dispatching = false;
        if (!paused && !shuttingDown && activeCount < currentSlots && pending.length > 0) {
          scheduleDispatch();
        } else {
          notifyDrainIfIdle();
        }
      }
    })();
  }

  function enqueuePending(task: PendingTask): Promise<void> {
    if (shuttingDown) {
      return Promise.reject(
        new Error('orchestrator: cannot enqueue — orchestrator is shutting down'),
      );
    }
    return new Promise<void>((resolve, reject) => {
      pending.push({ ...task, resolve, reject });
      scheduleDispatch();
    });
  }

  const enqueueAgentReplyInternal: EnqueueAgentReplyFn = (args) =>
    enqueuePending({
      kind: 'agent-reply',
      threadId: args.threadId,
      employeeId: args.employeeId,
      triggerMessageId: args.triggerMessageId,
      resolve: () => undefined,
      reject: () => undefined,
    });

  return {
    enqueueChat(args: EnqueueChatArgs): Promise<void> {
      return enqueuePending({
        kind: 'chat',
        threadId: args.threadId,
        employeeId: args.employeeId,
        userMessageId: args.userMessageId,
        resolve: () => undefined,
        reject: () => undefined,
      });
    },

    enqueueAgentReply(args: EnqueueAgentReplyArgs): Promise<void> {
      return enqueueAgentReplyInternal(args);
    },

    stopThread(threadId: string): boolean {
      let stopped = false;
      const controller = activeControllersByThread.get(threadId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
        stopped = true;
      }
      if (cancelPendingTasksForThread(threadId)) {
        stopped = true;
        scheduleDispatch();
      }
      return stopped;
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      if (shuttingDown) return;
      paused = false;
      scheduleDispatch();
    },

    async pauseCompany(companyId: string): Promise<void> {
      if (pausedCompanies.has(companyId)) return;
      pausedCompanies.add(companyId);
      companiesRepo.setStatus(companyId, 'meeting');

      let gateResolve: () => void = () => {};
      const gatePromise = new Promise<void>((resolve) => {
        gateResolve = resolve;
      });
      companyGates.set(companyId, { resolve: gateResolve, promise: gatePromise });

      await waitForCompanyDrain(companyId);
    },

    resumeCompany(companyId: string): void {
      if (!pausedCompanies.has(companyId)) return;
      pausedCompanies.delete(companyId);
      companiesRepo.setStatus(companyId, 'running');

      const gate = companyGates.get(companyId);
      if (gate) {
        gate.resolve();
        companyGates.delete(companyId);
      }
      scheduleDispatch();
    },

    isCompanyPaused(companyId: string): boolean {
      return pausedCompanies.has(companyId);
    },

    shutdown(): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      paused = true;
      const err = new Error('orchestrator: pending work canceled by shutdown');
      while (pending.length > 0) {
        const task = pending.shift();
        if (task) task.reject(err);
      }
      shutdownPromise =
        activeCount === 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              drainWaiters.push(resolve);
            });
      return shutdownPromise;
    },

    updateConcurrency(args: UpdateConcurrencyArgs): void {
      if (args.slots !== undefined) {
        currentSlots = normalizePositiveInt(args.slots, currentSlots);
      }
      if (args.providerCaps !== undefined) {
        currentProviderCaps = {
          ...currentProviderCaps,
          ...normalizeProviderCaps(args.providerCaps),
        };
      }
      if (!paused && !shuttingDown) {
        scheduleDispatch();
      }
    },

    get bus() {
      return bus;
    },
  };
}
