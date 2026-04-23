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
  budgetGovernance?: {
    assertExecutionAllowed?(input: {
      companyId: string;
      employeeId?: string | null;
      routineId?: string | null;
      executionKind: 'routine' | 'agentic' | 'copilot';
    }): Promise<{
      allowed: boolean;
      policy: { id: string } | null;
      reason: string | null;
      approvalItem: {
        id: string;
        status: 'pending' | 'approved' | 'denied' | 'dismissed';
      } | null;
    }>;
    recordRunSpend(runId: string): Promise<void>;
  };
  employeesRepo: OrchestratorEmployeesRepo;
  companiesRepo: OrchestratorCompaniesRepo;
  threadsRepo: OrchestratorThreadsRepo;
  calcCost: CostCalculator;
  resolveSystemPrompt: ResolveSystemPrompt;
  resolveProvider: ResolveProvider;
  /** Optional — when absent, agents have no tool access. */
  resolveTools?: ResolveTools;
  contextAssemblerService?: {
    assembleThreadContext(input: {
      companyId: string;
      threadId: string;
      recentTurnLimit?: number;
    }): Promise<{
      companyId: string;
      threadId: string;
      generatedAt: number;
      recentTurns: Array<{
        messageId: string | null;
        role: 'system' | 'user' | 'assistant';
        authorId: string;
        authorKind: AuthorKind;
        content: string;
        createdAt: number;
        estimatedTokens: number;
      }>;
      blocks: Array<{
        id: string;
        kind:
          | 'ticket'
          | 'digest'
          | 'checkpoint'
          | 'project'
          | 'goal'
          | 'approval'
          | 'company'
          | 'routine'
          | 'artifact'
          | 'retrieval';
        priority: 'critical' | 'high' | 'medium' | 'low';
        title: string;
        body: string;
        estimatedTokens: number;
        sourceRefId: string | null;
        sourceLabel: string | null;
        metadata: Record<string, unknown>;
      }>;
      retrievalQueries: string[];
    }>;
  };
  contextPackerService?: {
    packContext(input: {
      context: Awaited<ReturnType<NonNullable<BuildOrchestratorOptions['contextAssemblerService']>['assembleThreadContext']>>;
      targetTokenBudget?: number;
    }): {
      companyId: string;
      threadId: string;
      generatedAt: number;
      targetTokenBudget: number;
      usedTokens: number;
      recentTurnTokens: number;
      blockTokens: number;
      retrievalTokens: number;
      packedTurns: Array<{
        messageId: string | null;
        role: 'system' | 'user' | 'assistant';
        authorId: string;
        authorKind: AuthorKind;
        content: string;
        createdAt: number;
        estimatedTokens: number;
        truncated: boolean;
      }>;
      systemAddendum: string;
      includedBlocks: Array<{
        id: string;
        kind:
          | 'ticket'
          | 'digest'
          | 'checkpoint'
          | 'project'
          | 'goal'
          | 'approval'
          | 'company'
          | 'routine'
          | 'artifact'
          | 'retrieval';
        priority: 'critical' | 'high' | 'medium' | 'low';
        title: string;
        body: string;
        estimatedTokens: number;
        sourceRefId: string | null;
        sourceLabel: string | null;
        metadata: Record<string, unknown>;
        renderedText: string;
        tokenCount: number;
        truncated: boolean;
      }>;
      droppedBlocks: Array<{
        blockId: string;
        kind:
          | 'ticket'
          | 'digest'
          | 'checkpoint'
          | 'project'
          | 'goal'
          | 'approval'
          | 'company'
          | 'routine'
          | 'artifact'
          | 'retrieval';
        priority: 'critical' | 'high' | 'medium' | 'low';
        estimatedTokens: number;
        reason: 'budget' | 'category-cap';
      }>;
      retrievalQueries: string[];
    };
  };
  threadDigestService?: {
    getLatest(input: { companyId: string; threadId: string }): {
      pinnedFacts: Array<{ id: string; fact: string; sourceMessageId: string | null }>;
    } | null;
    shouldRefresh(input: { companyId: string; threadId: string; refreshThreshold?: number }): boolean;
    upsertDigest(input: {
      companyId: string;
      threadId: string;
      summary: string;
      pinnedFacts?: Array<{ id: string; fact: string; sourceMessageId: string | null }>;
      lastSummarizedMessageId?: string | null;
      estimatedTokens?: number;
      freshness?: 'fresh' | 'stale' | 'degraded';
    }): unknown;
  };
  runCheckpointService?: {
    createCheckpoint(input: {
      companyId: string;
      threadId: string;
      runId?: string | null;
      employeeId?: string | null;
      checkpointKind:
        | 'manual'
        | 'completion'
        | 'stopped'
        | 'timeout'
        | 'approval-blocked'
        | 'budget-blocked'
        | 'routine-completed';
      objective?: string | null;
      progressSummary: string;
      blockers?: Array<{
        kind: 'approval' | 'budget' | 'authority' | 'provider' | 'dependency' | 'operator' | 'other';
        refId: string | null;
        summary: string;
      }>;
      nextAction?: string | null;
      activeArtifactRefs?: string[];
      unresolvedApprovalRefs?: string[];
      createdAt?: number;
    }): unknown;
  };
  contextTargetTokenBudget?: number;
  contextRecentTurnLimit?: number;
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
  runTimeoutMs?: number;
  runIdleTimeoutMs?: number;
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

function clipText(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function packedTurnToStreamMessage(
  turn: {
    role: 'system' | 'user' | 'assistant';
    authorId: string;
    authorKind: AuthorKind;
    content: string;
  },
  respondingEmployeeId?: string,
): StreamMessage {
  if (!respondingEmployeeId) {
    return {
      role: turn.role,
      content: turn.content,
    };
  }
  if (turn.role === 'system') {
    return {
      role: 'system',
      content: turn.content,
    };
  }
  if (turn.authorKind === 'employee') {
    return {
      role: turn.authorId === respondingEmployeeId ? 'assistant' : 'user',
      content: turn.content,
    };
  }
  return {
    role: 'user',
    content: turn.content,
  };
}

function appendPackedContext(system: string, addendum: string): string {
  const trimmedAddendum = addendum.trim();
  if (trimmedAddendum.length === 0) return system;
  return `${system}\n\n## Runtime Context\n${trimmedAddendum}`;
}

function deriveObjectiveFromRows(rows: MessageRow[], respondingEmployeeId?: string): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || !shouldIncludeInHistory(row)) continue;
    if (!respondingEmployeeId) {
      if (row.authorKind === 'user') return clipText(row.content);
      continue;
    }
    if (row.authorId !== respondingEmployeeId) {
      return clipText(row.content);
    }
  }
  return null;
}

function summarizeCheckpointCompletion(
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
): string {
  return `Completed reply using ${promptTokens} prompt tokens and ${completionTokens} completion tokens in ${latencyMs} ms.`;
}

function summarizeDigest(
  rows: MessageRow[],
  respondingEmployeeId: string,
  threadSubject: string | null,
): string {
  const latestExternal = deriveObjectiveFromRows(rows, respondingEmployeeId);
  let latestResponse: string | null = null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || !shouldIncludeInHistory(row)) continue;
    if (row.authorId === respondingEmployeeId && row.authorKind === 'employee') {
      latestResponse = clipText(row.content);
      break;
    }
  }

  const lines: string[] = [];
  if (threadSubject && threadSubject.trim().length > 0) {
    lines.push(`Thread focus: ${threadSubject.trim()}`);
  }
  if (latestExternal) {
    lines.push(`Latest request: ${latestExternal}`);
  }
  if (latestResponse) {
    lines.push(`Latest response: ${latestResponse}`);
  }
  if (lines.length === 0) {
    lines.push('Thread state refreshed after a completed run.');
  }
  return lines.join('\n');
}

function collectPackedRefs(
  packed:
    | {
        includedBlocks: Array<{ kind: string; sourceRefId: string | null }>;
      }
    | null,
  kind: 'approval' | 'artifact',
): string[] {
  if (!packed) return [];
  const refs = new Set<string>();
  for (const block of packed.includedBlocks) {
    if (block.kind !== kind || !block.sourceRefId) continue;
    refs.add(block.sourceRefId);
  }
  return [...refs];
}

function classifyCheckpointFailure(
  err: unknown,
  aborted: boolean,
): {
  checkpointKind: 'stopped' | 'timeout';
  progressSummary: string;
  blockers: Array<{
    kind: 'provider' | 'other';
    refId: string | null;
    summary: string;
  }>;
  nextAction: string | null;
} | null {
  const message = err instanceof Error ? err.message : String(err);
  if (aborted || /aborted|canceled/i.test(message)) {
    return {
      checkpointKind: 'stopped',
      progressSummary: 'Run stopped before the reply completed.',
      blockers: [],
      nextAction: 'Resume from the latest checkpoint when ready.',
    };
  }
  if (/timed out|stalled/i.test(message)) {
    return {
      checkpointKind: 'timeout',
      progressSummary: 'Run timed out before the reply completed.',
      blockers: [
        {
          kind: 'provider',
          refId: null,
          summary: message,
        },
      ],
      nextAction: 'Retry the run from the latest checkpoint.',
    };
  }
  return null;
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
    budgetGovernance,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    calcCost,
    resolveSystemPrompt,
    resolveProvider,
    resolveTools,
    contextAssemblerService,
    contextPackerService,
    threadDigestService,
    runCheckpointService,
    contextTargetTokenBudget,
    contextRecentTurnLimit,
    slots,
    providerCaps,
    now,
    runTimeoutMs,
    runIdleTimeoutMs,
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

  async function prepareExecutionContext(args: {
    companyId: string;
    threadId: string;
    employeeId: string;
    system: string;
    rawRows: MessageRow[];
    rawHistory: StreamMessage[];
    mode: 'chat' | 'agent-reply';
  }): Promise<{
    system: string;
    messages: StreamMessage[];
    packedContext:
      | {
          usedTokens: number;
          includedBlocks: Array<{ kind: string; sourceRefId: string | null }>;
        }
      | null;
  }> {
    if (!contextAssemblerService || !contextPackerService) {
      return {
        system: args.system,
        messages: args.rawHistory,
        packedContext: null,
      };
    }

    try {
      const assembled = await contextAssemblerService.assembleThreadContext({
        companyId: args.companyId,
        threadId: args.threadId,
        recentTurnLimit: contextRecentTurnLimit,
      });
      const packed = contextPackerService.packContext({
        context: assembled,
        targetTokenBudget: contextTargetTokenBudget,
      });
      return {
        system: appendPackedContext(args.system, packed.systemAddendum),
        messages: packed.packedTurns.map((turn) =>
          packedTurnToStreamMessage(
            turn,
            args.mode === 'agent-reply' ? args.employeeId : undefined,
          ),
        ),
        packedContext: {
          usedTokens: packed.usedTokens,
          includedBlocks: packed.includedBlocks.map((block) => ({
            kind: block.kind,
            sourceRefId: block.sourceRefId,
          })),
        },
      };
    } catch (err) {
      console.warn('[orchestrator] context packing failed, falling back to raw history:', err);
      return {
        system: args.system,
        messages: args.rawHistory,
        packedContext: null,
      };
    }
  }

  function recordRunCheckpoint(args: {
    companyId: string;
    threadId: string;
    employeeId: string;
    respondingEmployeeId: string;
    rows: MessageRow[];
    packedContext:
      | {
          includedBlocks: Array<{ kind: string; sourceRefId: string | null }>;
        }
      | null;
    runId?: string | null;
    checkpointKind:
      | 'completion'
      | 'stopped'
      | 'timeout'
      | 'approval-blocked'
      | 'budget-blocked';
    progressSummary: string;
    blockers?: Array<{
      kind: 'approval' | 'budget' | 'authority' | 'provider' | 'dependency' | 'operator' | 'other';
      refId: string | null;
      summary: string;
    }>;
    nextAction?: string | null;
    activeArtifactRefs?: string[];
    unresolvedApprovalRefs?: string[];
  }): void {
    if (!runCheckpointService) return;
    try {
      const activeArtifactRefs = new Set(args.activeArtifactRefs ?? []);
      for (const ref of collectPackedRefs(args.packedContext, 'artifact')) {
        activeArtifactRefs.add(ref);
      }
      const unresolvedApprovalRefs = new Set(args.unresolvedApprovalRefs ?? []);
      for (const ref of collectPackedRefs(args.packedContext, 'approval')) {
        unresolvedApprovalRefs.add(ref);
      }
      runCheckpointService.createCheckpoint({
        companyId: args.companyId,
        threadId: args.threadId,
        runId: args.runId ?? null,
        employeeId: args.employeeId,
        checkpointKind: args.checkpointKind,
        objective: deriveObjectiveFromRows(args.rows, args.respondingEmployeeId),
        progressSummary: args.progressSummary,
        blockers: args.blockers ?? [],
        nextAction: args.nextAction ?? null,
        activeArtifactRefs: [...activeArtifactRefs],
        unresolvedApprovalRefs: [...unresolvedApprovalRefs],
        createdAt: now?.() ?? Date.now(),
      });
    } catch (err) {
      console.warn('[orchestrator] failed to persist run checkpoint:', err);
    }
  }

  function refreshThreadDigest(args: {
    companyId: string;
    threadId: string;
    respondingEmployeeId: string;
    threadSubject: string | null;
    rows: MessageRow[];
    packedContext:
      | {
          usedTokens: number;
        }
      | null;
  }): void {
    if (!threadDigestService) return;
    try {
      const latest = threadDigestService.getLatest({
        companyId: args.companyId,
        threadId: args.threadId,
      });
      if (latest && !threadDigestService.shouldRefresh({ companyId: args.companyId, threadId: args.threadId })) {
        return;
      }
      threadDigestService.upsertDigest({
        companyId: args.companyId,
        threadId: args.threadId,
        summary: summarizeDigest(args.rows, args.respondingEmployeeId, args.threadSubject),
        pinnedFacts: latest?.pinnedFacts ?? [],
        lastSummarizedMessageId: args.rows.at(-1)?.id ?? null,
        estimatedTokens: args.packedContext?.usedTokens ?? 0,
        freshness: 'fresh',
      });
    } catch (err) {
      console.warn('[orchestrator] failed to refresh thread digest:', err);
    }
  }

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

  async function assertTurnBudgetAllowed(args: {
    companyId: string;
    threadId: string;
    employeeId: string;
    respondingEmployeeId: string;
    rows: MessageRow[];
  }): Promise<void> {
    if (!budgetGovernance?.assertExecutionAllowed) return;

    const admission = await budgetGovernance.assertExecutionAllowed({
      companyId: args.companyId,
      employeeId: args.employeeId,
      executionKind: 'agentic',
    });
    if (admission.allowed) return;

    const pendingApproval = admission.approvalItem?.status === 'pending';
    const reason =
      admission.reason ??
      (pendingApproval
        ? 'Execution is waiting on budget approval before the run can start.'
        : 'Execution is blocked by budget policy before the run can start.');

    recordRunCheckpoint({
      companyId: args.companyId,
      threadId: args.threadId,
      employeeId: args.employeeId,
      respondingEmployeeId: args.respondingEmployeeId,
      rows: args.rows,
      packedContext: null,
      checkpointKind: pendingApproval ? 'approval-blocked' : 'budget-blocked',
      progressSummary: pendingApproval
        ? 'Run could not start because budget approval is still pending.'
        : 'Run could not start because budget policy blocked execution.',
      blockers: [
        {
          kind: pendingApproval ? 'approval' : 'budget',
          refId: pendingApproval
            ? admission.approvalItem?.id ?? null
            : admission.policy?.id ?? admission.approvalItem?.id ?? null,
          summary: reason,
        },
      ],
      nextAction: pendingApproval
        ? 'Review the pending budget approval, then retry from the latest checkpoint.'
        : 'Adjust the budget policy or approval state, then retry from the latest checkpoint.',
      unresolvedApprovalRefs: pendingApproval && admission.approvalItem ? [admission.approvalItem.id] : [],
    });

    throw new Error(reason);
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

    const [baseSystem, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    const historyRows = messagesRepo.listByThread(args.threadId);
    const rawHistory = mapHistory(historyRows);
    const executionContext = await prepareExecutionContext({
      companyId: company.id,
      threadId: args.threadId,
      employeeId: args.employeeId,
      system: baseSystem,
      rawRows: historyRows,
      rawHistory,
      mode: 'chat',
    });
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
        budgetGovernance,
        calcCost,
        now,
      },
      {
        companyId: company.id,
        threadId: args.threadId,
        employeeId: args.employeeId,
        system: executionContext.system,
        messages: executionContext.messages,
        provider: provider.stream,
        providerName: provider.providerName,
        model: provider.model,
        signal,
        timeoutMs: runTimeoutMs,
        idleTimeoutMs: runIdleTimeoutMs,
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
    )
      .then((result) => {
        const finalRows = messagesRepo.listByThread(args.threadId);
        recordRunCheckpoint({
          companyId: company.id,
          threadId: args.threadId,
          employeeId: args.employeeId,
          respondingEmployeeId: args.employeeId,
          rows: finalRows,
          packedContext: executionContext.packedContext,
          runId: result.runId,
          checkpointKind: 'completion',
          progressSummary: summarizeCheckpointCompletion(
            result.promptTokens,
            result.completionTokens,
            result.latencyMs,
          ),
        });
        refreshThreadDigest({
          companyId: company.id,
          threadId: args.threadId,
          respondingEmployeeId: args.employeeId,
          threadSubject: thread.subject,
          rows: finalRows,
          packedContext: executionContext.packedContext,
        });
      })
      .catch((err) => {
        const failure = classifyCheckpointFailure(err, signal.aborted);
        if (failure) {
          recordRunCheckpoint({
            companyId: company.id,
            threadId: args.threadId,
            employeeId: args.employeeId,
            respondingEmployeeId: args.employeeId,
            rows: messagesRepo.listByThread(args.threadId),
            packedContext: executionContext.packedContext,
            runId: currentRunId || null,
            checkpointKind: failure.checkpointKind,
            progressSummary: failure.progressSummary,
            blockers: failure.blockers,
            nextAction: failure.nextAction,
          });
        }
        throw err;
      });
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

    const [baseSystem, toolConfig] = await Promise.all([
      resolveSystemPrompt({ employee, company, threadId: args.threadId }),
      resolveTools ? resolveTools({ employee, company, getRunId }) : Promise.resolve(null),
    ]);

    const historyRows = messagesRepo.listByThread(args.threadId);
    const rawHistory = mapAgentHistory(historyRows, args.employeeId);
    const executionContext = await prepareExecutionContext({
      companyId: company.id,
      threadId: args.threadId,
      employeeId: args.employeeId,
      system: baseSystem,
      rawRows: historyRows,
      rawHistory,
      mode: 'agent-reply',
    });
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
        budgetGovernance,
        calcCost,
        now,
      },
      {
        companyId: company.id,
        threadId: args.threadId,
        employeeId: args.employeeId,
        system: executionContext.system,
        messages: executionContext.messages,
        provider: provider.stream,
        providerName: provider.providerName,
        model: provider.model,
        signal,
        timeoutMs: runTimeoutMs,
        idleTimeoutMs: runIdleTimeoutMs,
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
    )
      .then((result) => {
        const finalRows = messagesRepo.listByThread(args.threadId);
        recordRunCheckpoint({
          companyId: company.id,
          threadId: args.threadId,
          employeeId: args.employeeId,
          respondingEmployeeId: args.employeeId,
          rows: finalRows,
          packedContext: executionContext.packedContext,
          runId: result.runId,
          checkpointKind: 'completion',
          progressSummary: summarizeCheckpointCompletion(
            result.promptTokens,
            result.completionTokens,
            result.latencyMs,
          ),
        });
        refreshThreadDigest({
          companyId: company.id,
          threadId: args.threadId,
          respondingEmployeeId: args.employeeId,
          threadSubject: thread.subject,
          rows: finalRows,
          packedContext: executionContext.packedContext,
        });
      })
      .catch((err) => {
        const failure = classifyCheckpointFailure(err, signal.aborted);
        if (failure) {
          recordRunCheckpoint({
            companyId: company.id,
            threadId: args.threadId,
            employeeId: args.employeeId,
            respondingEmployeeId: args.employeeId,
            rows: messagesRepo.listByThread(args.threadId),
            packedContext: executionContext.packedContext,
            runId: currentRunId || null,
            checkpointKind: failure.checkpointKind,
            progressSummary: failure.progressSummary,
            blockers: failure.blockers,
            nextAction: failure.nextAction,
          });
        }
        throw err;
      });
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

      try {
        await assertTurnBudgetAllowed({
          companyId: thread.companyId,
          threadId: task.threadId,
          employeeId: task.employeeId,
          respondingEmployeeId: task.employeeId,
          rows: messagesRepo.listByThread(task.threadId),
        });
      } catch (err) {
        pending.splice(i, 1);
        settleTask(task, err);
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
