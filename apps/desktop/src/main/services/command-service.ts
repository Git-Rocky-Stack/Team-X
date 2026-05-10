/**
 * CommandService — main-process front-door for the Cmd+K command
 * palette's `command.parse` + `command.execute` IPC channels.
 *
 * Pipeline:
 *   parse():   classifier -> resolver -> slot filler -> FillResult
 *              Returns a ParseResult the renderer can drive a UI with:
 *              either a ready-to-fire intent, or a clarification prompt
 *              (missing slot / ambiguous resolve), or a confirmation
 *              prompt (destructive intent).
 *   execute(): intent + entities -> dispatch table -> existing IPC
 *              handler -> history row + `command.executed` event.
 *              Enforces the destructive-confirmation gate at the very
 *              top of the method — no handler is reached until the
 *              caller has passed `confirmed: true` for a destructive
 *              intent.
 *
 * Architectural invariants honored (CLAUDE.md §"Architectural invariants"):
 *   #1  Renderer is pure view — this service lives in main.
 *   #2  Orchestrator is the only scheduler — we call existing IPC
 *       handlers that have already been authored to enqueue work
 *       through the orchestrator. We do NOT reach around into the
 *       orchestrator or its repos.
 *   #4  Storage is SQLite — `command_history` table + filesystem-
 *       immutable audit events. No blobs in the row.
 *   #6  Events table is append-only — every successful or failed
 *       execute writes one `command.executed` event via the bus.
 *       Listener exceptions are swallowed by the bus (M29 learning),
 *       and the bus emit itself is wrapped in try/catch here too so
 *       a DB write failure on the audit row never fails the user's
 *       command.
 *
 * Phase 5 — M30 T4.
 */

import type {
  IntentClassifier,
  IntentName,
  IntentResult,
  NluContext,
  ResolvedEntity,
  SlotFiller,
} from '@team-x/intelligence';
import { DESTRUCTIVE_INTENTS, INTENT_NAMES } from '@team-x/intelligence';
import type { CommandExecutedPayload, DashboardEvent } from '@team-x/shared-types';
import { nanoid } from 'nanoid';

import type { CommandHistoryRepo } from '../db/repos/command-history.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PendingParse {
  intent: IntentName;
  /** Partial entity map — may be empty for clarification pending a pick. */
  entities: Record<string, string>;
  rawText: string;
  /** ISO-8601 UTC timestamp of the classify-then-fill pipeline run. */
  classifiedAt: string;
}

export type ParseResult =
  | {
      kind: 'ready';
      intent: IntentName;
      entities: Record<string, string>;
      summary?: string;
    }
  | {
      kind: 'needs_clarification';
      missing: string;
      prompt: string;
      options?: string[];
      pending: PendingParse;
    }
  | {
      kind: 'needs_confirmation';
      intent: IntentName;
      entities: Record<string, string>;
      summary: string;
      pending: PendingParse;
    };

export interface ExecuteRequest {
  intent: IntentName;
  entities: Record<string, string>;
  /** Required-true for destructive intents (fire, close, reopen, end, promote). */
  confirmed?: boolean;
  /**
   * Bypass confirmation gate entirely (M32 T5 — M33 Copilot prep).
   * Trusted callers (Copilot Conversations thread continuation) set
   * this to skip the write-side gate without a confirm dialog.
   */
  skipConfirmation?: boolean;
  companyId: string;
  /** Defaults to 'user' (Rocky). Flows into `command.executed.actorId`. */
  actorId?: string;
  /** Original user text — optional but preserved in history for replay / audit. */
  rawText?: string;
}

export type ExecuteResult =
  | {
      kind: 'ok';
      intent: IntentName;
      resultId?: string | number;
      summary: string;
      /**
       * Agentic-loop run id for the `complex_request` intent (M31 T4).
       *
       * Populated only when the dispatcher started an agentic loop via
       * `CommandHandlers.agenticLoopStart`. Undefined for every other
       * intent. Mirrored structurally on `IpcExecuteResult` in
       * `@team-x/shared-types` so the renderer can subscribe to live
       * `agent.step` events and jump to the system-agent thread on
       * completion.
       */
      runId?: string;
      /**
       * System-agent DM thread id paired with `runId`. Same gating
       * conditions apply — only populated for `complex_request`.
       */
      threadId?: string;
    }
  | { kind: 'needs_confirmation'; summary: string; gateKind?: 'destructive' | 'write-side' }
  | {
      kind: 'error';
      code: 'missing_entity' | 'destructive_not_confirmed' | 'handler_error' | 'unknown_intent';
      message: string;
    };

export interface CommandHistoryEntry {
  id: string;
  text: string;
  intent: IntentName;
  entities: Record<string, string>;
  executedAt: string;
  outcome: 'ok' | 'error';
  resultId?: string | number;
  companyId: string;
  actorId: string;
}

export interface SuggestItem {
  text: string;
  intent?: IntentName;
}

// ---------------------------------------------------------------------------
// Handler map — the seam to the existing IPC handler functions registered
// in `apps/desktop/src/main/ipc/handlers.ts`. We type each method exactly
// as the handler's argument + return contract so the dispatcher below is
// fully type-checked.
// ---------------------------------------------------------------------------

/**
 * Handler dependencies. Every method matches the existing signature of
 * the corresponding registered IPC handler in `createIpcHandlers`.
 *
 * NOTE: `employeesFire`, `employeesPromote`, and `orgchart.get` are not
 * registered as IPC handlers in the current codebase. The plan lists
 * them under T4, but per the "match the handler, not the table" rule in
 * the task prompt, we expose them as optional dependencies: if the main
 * process later registers them, wiring them in costs one line in the
 * composition root; until then, `fire_employee` / `promote_employee`
 * dispatches return `{ kind: 'error', code: 'handler_error' }` with a
 * clear message. See commit body for the full deviation log.
 */
export interface CommandHandlers {
  employeesList(req: { companyId: string }): Promise<
    { id: string; name: string; title?: string; status?: string }[]
  >;
  employeesCreate(req: {
    companyId: string;
    roleId: string;
    name: string;
    managerId?: string;
  }): Promise<{ employeeId: string }>;

  /** Not yet registered — optional. Dispatcher guards for this and emits `handler_error` if absent. */
  employeesFire?(req: { employeeId: string }): Promise<void>;
  /** Not yet registered — optional. */
  employeesPromote?(req: { employeeId: string; roleId: string; newLevel: string }): Promise<void>;

  /**
   * Start the agentic loop for a `complex_request` intent (M31 T4).
   *
   * Wired by the composition root to `AgenticLoopService.start()`.
   * Kept optional so existing tests (and any host that hasn't built an
   * `AgenticLoopService` yet) still typecheck — the dispatcher guards
   * for absence and returns `handler_error` with a clear message,
   * mirroring the `employeesFire` / `employeesPromote` pattern above.
   *
   * Returns synchronously with `{ runId, threadId }`; the loop runs
   * in the background on the main process, streaming `agent.step`
   * events over the bus. Callers flow `runId`/`threadId` back to the
   * renderer via `ExecuteResult`.
   */
  agenticLoopStart?(req: {
    companyId: string;
    text: string;
    actorId?: string;
  }): Promise<{ runId: string; threadId: string }>;

  ticketsAssign(req: { ticketId: string; assigneeId: string }): Promise<void>;
  ticketsCreate(req: {
    companyId: string;
    title: string;
    description?: string;
    priority?: string;
    assigneeId?: string;
  }): Promise<{ ticketId: string }>;
  ticketsClose(req: { ticketId: string }): Promise<void>;
  ticketsReopen(req: { ticketId: string }): Promise<void>;

  projectsCreate(req: {
    companyId: string;
    title: string;
    description?: string;
  }): Promise<{ projectId: string }>;

  goalsCreate(req: {
    companyId: string;
    title: string;
    description?: string;
    targetDate?: number | null;
  }): Promise<{ goalId: string }>;

  meetingsCall(req: {
    companyId: string;
    chairId: string;
    attendeeIds: string[];
    agenda: string;
  }): Promise<{ meetingId: string; threadId: string }>;
  meetingsEnd(req: { meetingId: string }): Promise<unknown>;

  vaultSearch(req: {
    companyId: string;
    query: string;
  }): Promise<Array<{ id?: string; originalName?: string; rank?: number }>>;
}

// ---------------------------------------------------------------------------
// Event bus seam
// ---------------------------------------------------------------------------

export interface CommandEventBus {
  emit<T>(input: {
    type: 'command.executed';
    companyId: string;
    actorId: string;
    actorKind: 'user' | 'employee' | 'system';
    payload: T;
  }): DashboardEvent<T>;
}

// ---------------------------------------------------------------------------
// Entity resolver seam — only the methods CommandService actually needs
// for its parse pipeline. Keeps deps narrow for testing.
// ---------------------------------------------------------------------------

export interface CommandEntityResolver {
  resolveEmployee(name: string, companyId: string): Promise<ResolvedEntity<unknown>>;
  resolveTicket(ref: string, companyId: string): Promise<ResolvedEntity<unknown>>;
  resolveVaultFile(query: string, companyId: string): Promise<ResolvedEntity<unknown>>;
  resolveRole(query: string): Promise<ResolvedEntity<unknown>>;
  resolveMeeting(query: string, companyId: string): Promise<ResolvedEntity<unknown>>;
  resolveActiveMeeting(companyId: string): Promise<ResolvedEntity<unknown>>;
}

// ---------------------------------------------------------------------------
// Dependencies & factory
// ---------------------------------------------------------------------------

export interface CommandServiceDeps {
  classifier: IntentClassifier;
  resolver: CommandEntityResolver;
  slotFiller: SlotFiller;
  handlers: CommandHandlers;
  historyRepo: CommandHistoryRepo;
  bus: CommandEventBus;
  /** Default company id when `parse`/`suggest` is called without context. */
  defaultCompanyId?: string;
  /** Override timestamp for deterministic tests. */
  now?: () => Date;
  /** Override id factory for deterministic tests. */
  newId?: () => string;
  /** Optional logger — falls back to console. */
  logger?: {
    error: (msg: string, err: unknown) => void;
    info?: (msg: string, ...args: unknown[]) => void;
  };
}

export interface CommandService {
  parse(text: string, context: NluContext): Promise<ParseResult>;
  execute(req: ExecuteRequest): Promise<ExecuteResult>;
  history(limit?: number, companyId?: string): Promise<CommandHistoryEntry[]>;
  suggest(partial: string, context: NluContext): Promise<SuggestItem[]>;
  /** Lifecycle hook called from the composition root before orchestrator drain. */
  stop(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// `DESTRUCTIVE_INTENTS` (imported from `@team-x/intelligence`) is the canonical
// destructive set used here for the `confirmed: true` gate at `execute()`.
// Same set drives `slot-filler.ts:needs_confirmation` routing and the H7
// elevated confidence threshold in `intent-classifier.ts:finalize()`.
// De-duplicated as part of audit 2026-05-07 H7 — single source of truth.

/** Max history rows retained per company (FIFO). */
export const COMMAND_HISTORY_CAP = 20;

/**
 * Keyword pattern for write-side agentic requests (M32 T5).
 *
 * When the NLU classifies `complex_request`, the raw user text is
 * tested against this pattern. A match means the agentic loop will
 * likely invoke write-side tools (decompose_project, delegate_subtask,
 * review_deliverable), so a confirmation gate fires first.
 *
 * Exported for unit-test access.
 */
export const WRITE_SIDE_KEYWORDS =
  /\b(decompos|break\s+down|split\s+into|delegat|assign\s+\w*\s*ticket|create\s+ticket|review\s+deliverable|plan\s+task|file\s+ticket)/i;

export function isWriteSideRequest(rawText: string): boolean {
  return WRITE_SIDE_KEYWORDS.test(rawText);
}

function buildWriteSideSummary(rawText: string): string {
  const truncated = rawText.length > 120 ? `${rawText.slice(0, 120)}...` : rawText;
  return `This request may create tickets, delegate tasks, or modify project state. The agentic loop will run write-side tools to fulfill: "${truncated}"`;
}

const EMPLOYEE_QUERY_KEYS = ['employeeQuery', 'managerQuery', 'assigneeQuery'] as const;

interface OptionalEntityResolutionSpec {
  queryKey: string;
  entityKey: string;
  prompt: string;
}

const OPTIONAL_ENTITY_RESOLUTIONS: Partial<
  Record<IntentName, readonly OptionalEntityResolutionSpec[]>
> = {
  hire_employee: [
    {
      queryKey: 'managerQuery',
      entityKey: 'managerId',
      prompt: 'Which manager should they report to?',
    },
  ],
  create_ticket: [
    {
      queryKey: 'assigneeQuery',
      entityKey: 'assigneeId',
      prompt: 'Which employee should own the ticket?',
    },
  ],
};

/**
 * Static suggestion list — M30 ships a fixed palette. M31 can extend
 * this with context-aware suggestions from the RAG service.
 *
 * Ordered by frequency-of-use prior (gut-feel — tune later from
 * telemetry). Each entry is prefix-matched case-insensitively in
 * `suggest()` so typing "hire" or "hi" both surface the hire tip.
 */
const SUGGESTIONS: readonly SuggestItem[] = Object.freeze([
  { text: 'Hire a senior backend engineer', intent: 'hire_employee' },
  { text: 'Fire an employee', intent: 'fire_employee' },
  { text: 'Promote someone to lead', intent: 'promote_employee' },
  { text: 'File a bug ticket', intent: 'create_ticket' },
  { text: 'Assign the last ticket', intent: 'assign_ticket' },
  { text: 'Close ticket #', intent: 'close_ticket' },
  { text: 'Reopen a ticket', intent: 'reopen_ticket' },
  { text: 'Start a project', intent: 'create_project' },
  { text: 'Set a goal', intent: 'create_goal' },
  { text: 'Call an all-hands meeting', intent: 'call_meeting' },
  { text: 'End the current meeting', intent: 'end_meeting' },
  { text: 'What is everyone working on?', intent: 'check_status' },
  { text: 'Show me the cost breakdown', intent: 'show_view' },
  { text: 'Search the vault for API spec', intent: 'search_vault' },
]);

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCommandService(deps: CommandServiceDeps): CommandService {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => nanoid());
  const logger = deps.logger ?? {
    error: (msg, err) => console.error('[command-service]', msg, err),
    info: (msg, ...args) => console.log('[command-service]', msg, ...args),
  };
  let stopped = false;

  return {
    async parse(text, context): Promise<ParseResult> {
      const trimmed = text.trim();
      const pendingBase = (intent: IntentName, entities: Record<string, string>): PendingParse => ({
        intent,
        entities,
        rawText: text,
        classifiedAt: now().toISOString(),
      });

      if (trimmed.length === 0) {
        return {
          kind: 'needs_clarification',
          missing: 'text',
          prompt: 'What would you like to do?',
          pending: pendingBase('complex_request', {}),
        };
      }

      let intentResult: IntentResult;
      try {
        intentResult = await deps.classifier.classify(text, context);
      } catch (err) {
        logger.error('classifier failed', err);
        // Fall back to conversational — matches the T1 classifier's
        // documented retry-then-fallback contract; keeps parse never-throw.
        intentResult = {
          intent: 'complex_request',
          entities: {},
          confidence: 0,
          missingSlots: [],
          rawText: text,
        };
      }

      const normalizedIntentResult: IntentResult = {
        ...intentResult,
        entities: normalizeIntentEntities(intentResult.intent, intentResult.entities),
      };

      // Complex request: skip resolver + slot filler. CommandService.execute
      // routes this to the M31 agentic-loop stub.
      if (normalizedIntentResult.intent === 'complex_request') {
        return {
          kind: 'ready',
          intent: 'complex_request',
          entities: { ...normalizedIntentResult.entities },
          summary: 'Delegate to the Copilot Agent',
        };
      }

      // Resolve any structured-entity queries before handing off to the
      // slot filler. We only invoke the resolver for slots that actually
      // have a query string present — resolvers are async and potentially
      // hit SQLite / FTS5 / role-pack scans.
      const resolved: Record<string, ResolvedEntity<unknown>> = {};
      const companyId = context.companyId;
      const ec = normalizedIntentResult.entities;

      for (const employeeKey of EMPLOYEE_QUERY_KEYS) {
        const query = ec[employeeKey];
        if (typeof query === 'string' && query.trim().length > 0) {
          resolved[employeeKey] = await safe(() => deps.resolver.resolveEmployee(query, companyId));
        }
      }
      const ticketQuery = ec.ticketQuery;
      if (typeof ticketQuery === 'string' && ticketQuery.trim().length > 0) {
        resolved.ticketQuery = await safe(() =>
          deps.resolver.resolveTicket(ticketQuery, companyId),
        );
      }
      const roleQuery = ec.roleQuery;
      if (typeof roleQuery === 'string' && roleQuery.trim().length > 0) {
        resolved.roleQuery = await safe(() => deps.resolver.resolveRole(roleQuery));
      }
      // `newRoleQuery` is aliased to `newLevel` by the slot filler —
      // resolve it through the role resolver because the T1 classifier
      // emits a role name ("lead") that must map to a level enum.
      const newRoleQuery = ec.newRoleQuery;
      if (typeof newRoleQuery === 'string' && newRoleQuery.trim().length > 0) {
        resolved.newRoleQuery = await safe(() => deps.resolver.resolveRole(newRoleQuery));
      }
      const meetingQuery = ec.meetingQuery;
      if (typeof meetingQuery === 'string' && meetingQuery.trim().length > 0) {
        resolved.meetingQuery = await safe(() =>
          deps.resolver.resolveMeeting(meetingQuery, companyId),
        );
      } else if (normalizedIntentResult.intent === 'end_meeting') {
        resolved.meetingQuery = await safe(() => deps.resolver.resolveActiveMeeting(companyId));
      }

      const fillResult = deps.slotFiller.fill(normalizedIntentResult, resolved);
      const pending = pendingBase(
        normalizedIntentResult.intent,
        flattenPartial(normalizedIntentResult.entities),
      );

      switch (fillResult.kind) {
        case 'ready': {
          const optionalResolution = applyOptionalEntityResolutions({
            intent: fillResult.intent,
            entities: normalizedIntentResult.entities,
            baseEntities: fillResult.entities,
            resolved,
          });
          if (optionalResolution.kind === 'needs_clarification') {
            return {
              kind: 'needs_clarification',
              missing: optionalResolution.missing,
              prompt: optionalResolution.prompt,
              options: optionalResolution.options,
              pending,
            };
          }
          return {
            kind: 'ready',
            intent: fillResult.intent,
            entities: optionalResolution.entities,
            summary: buildReadySummary(fillResult.intent, optionalResolution.entities),
          };
        }
        case 'needs_clarification':
          return {
            kind: 'needs_clarification',
            missing: fillResult.missing,
            prompt: fillResult.prompt,
            options: fillResult.options,
            pending,
          };
        case 'needs_confirmation': {
          const optionalResolution = applyOptionalEntityResolutions({
            intent: fillResult.intent,
            entities: normalizedIntentResult.entities,
            baseEntities: fillResult.entities,
            resolved,
          });
          if (optionalResolution.kind === 'needs_clarification') {
            return {
              kind: 'needs_clarification',
              missing: optionalResolution.missing,
              prompt: optionalResolution.prompt,
              options: optionalResolution.options,
              pending,
            };
          }
          return {
            kind: 'needs_confirmation',
            intent: fillResult.intent,
            entities: optionalResolution.entities,
            summary: fillResult.summary,
            pending,
          };
        }
        default: {
          const _exhaustive: never = fillResult;
          throw new Error(`unreachable fill result: ${String(_exhaustive)}`);
        }
      }
    },

    async execute(req): Promise<ExecuteResult> {
      const startedAt = Date.now();
      const actorId = req.actorId?.trim() || 'user';
      const rawText = req.rawText ?? '';

      // Gate 1 — intent must be a known value. Defense in depth against
      // renderer-side type drift or a malicious preload. We match exact
      // strings rather than trusting TypeScript's narrowing.
      if (!INTENT_NAMES.includes(req.intent as IntentName)) {
        return {
          kind: 'error',
          code: 'unknown_intent',
          message: `unknown intent: ${String(req.intent)}`,
        };
      }

      // Gate 2 — destructive intents require explicit confirm.
      if (DESTRUCTIVE_INTENTS.has(req.intent) && req.confirmed !== true) {
        return {
          kind: 'needs_confirmation',
          gateKind: 'destructive',
          summary: buildDestructiveSummary(req.intent, req.entities),
        };
      }

      // Gate 2.5 — write-side agentic runs require confirmation (M32 T5).
      // complex_request with write-side keywords (decompose, delegate,
      // create tickets, review) gets a confirmation gate before the loop
      // dispatches. skipConfirmation is an M33 Copilot escape hatch.
      if (
        req.intent === 'complex_request' &&
        req.confirmed !== true &&
        req.skipConfirmation !== true &&
        isWriteSideRequest(rawText)
      ) {
        return {
          kind: 'needs_confirmation',
          gateKind: 'write-side',
          summary: buildWriteSideSummary(rawText),
        };
      }

      // Gate 3 — required-entity presence. We re-check here (the slot
      // filler already did on `parse`) because the renderer may call
      // execute with a hand-assembled entity map that skipped parse.
      const missing = missingRequiredEntity(req.intent, req.entities);
      if (missing !== null) {
        return {
          kind: 'error',
          code: 'missing_entity',
          message: `missing required entity: ${missing}`,
        };
      }

      // Dispatch. Every branch is try/catch'd so a handler throw
      // cannot escape CommandService — we always return a typed
      // ExecuteResult AND emit `command.executed` for the audit
      // trail, even on error.
      let resultId: string | number | undefined;
      let summary: string;
      // Agentic-loop cross-refs — only the `complex_request` branch
      // populates these (M31 T4). Kept in local scope so the error
      // path naturally leaves them undefined in the audit payload.
      let runId: string | undefined;
      let threadId: string | undefined;
      try {
        const dispatched = await dispatch(req, deps.handlers);
        resultId = dispatched.resultId;
        summary = dispatched.summary;
        runId = dispatched.runId;
        threadId = dispatched.threadId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`dispatch failed for ${req.intent}`, err);
        await writeHistoryAndEvent({
          deps,
          newId,
          now,
          companyId: req.companyId,
          actorId,
          rawText,
          intent: req.intent,
          entities: req.entities,
          outcome: 'error',
          resultId: undefined,
          durationMs: Date.now() - startedAt,
          logger,
        });
        return {
          kind: 'error',
          code: 'handler_error',
          message,
        };
      }

      // Success path — record, trim, emit, return.
      await writeHistoryAndEvent({
        deps,
        newId,
        now,
        companyId: req.companyId,
        actorId,
        rawText,
        intent: req.intent,
        entities: req.entities,
        outcome: 'ok',
        resultId,
        durationMs: Date.now() - startedAt,
        logger,
        runId,
        threadId,
      });

      return {
        kind: 'ok',
        intent: req.intent,
        resultId,
        summary,
        // Only attach the agentic cross-refs when the dispatcher
        // actually produced them — keeps the event payload and the
        // ExecuteResult shape minimal for non-agentic intents so
        // downstream JSON / structural checks don't widen for no
        // reason.
        ...(runId !== undefined ? { runId } : {}),
        ...(threadId !== undefined ? { threadId } : {}),
      };
    },

    async history(limit?: number, companyId?: string): Promise<CommandHistoryEntry[]> {
      const cid = companyId ?? deps.defaultCompanyId;
      if (!cid) return [];
      const effectiveLimit = limit ?? COMMAND_HISTORY_CAP;
      const rows = deps.historyRepo.recent(cid, Math.min(effectiveLimit, COMMAND_HISTORY_CAP));
      return rows.map(rowToEntry);
    },

    async suggest(partial, _context): Promise<SuggestItem[]> {
      const needle = partial.trim().toLowerCase();
      if (needle.length === 0) return SUGGESTIONS.slice(0, 8);
      const matches = SUGGESTIONS.filter((s) => s.text.toLowerCase().includes(needle));
      return matches.length > 0 ? matches.slice(0, 8) : SUGGESTIONS.slice(0, 8);
    },

    stop(): void {
      if (stopped) return;
      stopped = true;
      // Nothing to flush today — `append` writes are synchronous and
      // the bus emit fire-and-forget is swallowed by the bus's listener
      // isolation. Hook reserved for M31's pending-request drain.
    },
  };
}

// ---------------------------------------------------------------------------
// Required-entity table. Mirrors `REQUIRED_SLOTS` in slot-filler but uses
// the canonical post-resolution keys (`roleId`, `employeeId`, etc.) that
// the renderer hands us in `execute`. This is the same seam the plan
// doc calls out in T3 step 1.
// ---------------------------------------------------------------------------

const EXECUTE_REQUIRED: Record<IntentName, readonly string[]> = {
  hire_employee: ['roleId'],
  fire_employee: ['employeeId'],
  promote_employee: ['employeeId', 'newLevel'],
  assign_ticket: ['ticketId', 'employeeId'],
  create_ticket: ['title'],
  close_ticket: ['ticketId'],
  reopen_ticket: ['ticketId'],
  create_project: ['name'],
  create_goal: ['title'],
  call_meeting: ['agenda'],
  end_meeting: ['meetingId'],
  check_status: [],
  show_view: ['view'],
  search_vault: ['query'],
  complex_request: [],
};

function missingRequiredEntity(
  intent: IntentName,
  entities: Record<string, string>,
): string | null {
  const required = EXECUTE_REQUIRED[intent] ?? [];
  for (const key of required) {
    const v = entities[key];
    if (typeof v !== 'string' || v.trim().length === 0) {
      return key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dispatch table — the one place we map a (validated) intent + entity
// bag onto an existing IPC handler call. Each branch must return
// `{ resultId, summary }` so `execute()` can shape an ExecuteResult.
// ---------------------------------------------------------------------------

interface DispatchOutcome {
  resultId?: string | number;
  summary: string;
  /**
   * Agentic-loop run id. Populated only by the `complex_request`
   * branch (M31 T4) — every other dispatcher branch leaves it
   * undefined. `execute()` propagates it to the `ok` ExecuteResult
   * and to the audit event payload so the palette can subscribe to
   * live steps and the Audit view can deep-link to the Copilot
   * thread.
   */
  runId?: string;
  /** System-agent DM thread id paired with `runId`. Same gating. */
  threadId?: string;
}

async function dispatch(req: ExecuteRequest, h: CommandHandlers): Promise<DispatchOutcome> {
  // Strongly-typed entity access. `missingRequiredEntity` already gated
  // every required slot in `execute()`, so these reads are safe — but
  // TS's `noUncheckedIndexedAccess` doesn't know that, and we prefer an
  // explicit helper to `!` non-null assertions scattered across every
  // branch.
  const e = req.entities;
  const need = (k: string): string => {
    const v = e[k];
    if (typeof v !== 'string' || v.trim().length === 0) {
      // Unreachable under the `execute()` contract but defensive.
      throw new Error(`missing required entity: ${k}`);
    }
    return v;
  };

  switch (req.intent) {
    case 'hire_employee': {
      // Generate a placeholder name. The `employees.create` IPC handler
      // requires `name`, but the palette flow only captures `roleId`
      // today. A sensible default is the role title — users can rename
      // in the employee card UI. M31 can add a name field to the
      // palette form for richer hire flows.
      const name = e.name?.trim() || defaultEmployeeName();
      const res = await h.employeesCreate({
        companyId: req.companyId,
        roleId: need('roleId'),
        name,
        managerId: e.managerId || undefined,
      });
      return { resultId: res.employeeId, summary: `Completed: hired ${name}` };
    }

    case 'fire_employee': {
      if (!h.employeesFire) {
        throw new Error(
          'employees.fire IPC handler is not registered — wire it in `createIpcHandlers` first',
        );
      }
      const employeeId = need('employeeId');
      await h.employeesFire({ employeeId });
      return { summary: `Completed: fired employee ${employeeId}` };
    }

    case 'promote_employee': {
      if (!h.employeesPromote) {
        throw new Error(
          'employees.promote IPC handler is not registered — wire it in `createIpcHandlers` first',
        );
      }
      const employeeId = need('employeeId');
      const newLevel = need('newLevel');
      await h.employeesPromote({
        employeeId,
        roleId: e.roleId ?? newLevel,
        newLevel,
      });
      return { summary: `Completed: promoted employee to ${newLevel}` };
    }

    case 'assign_ticket': {
      const ticketId = need('ticketId');
      const employeeId = need('employeeId');
      await h.ticketsAssign({ ticketId, assigneeId: employeeId });
      return { summary: `Completed: assigned ticket ${ticketId}` };
    }

    case 'create_ticket': {
      const title = need('title');
      const res = await h.ticketsCreate({
        companyId: req.companyId,
        title,
        description: e.description,
        priority: e.priority,
        assigneeId: e.assigneeId,
      });
      return { resultId: res.ticketId, summary: `Completed: filed ticket ${title}` };
    }

    case 'close_ticket': {
      const ticketId = need('ticketId');
      await h.ticketsClose({ ticketId });
      return { summary: `Completed: closed ticket ${ticketId}` };
    }

    case 'reopen_ticket': {
      const ticketId = need('ticketId');
      await h.ticketsReopen({ ticketId });
      return { summary: `Completed: reopened ticket ${ticketId}` };
    }

    case 'create_project': {
      const name = need('name');
      const res = await h.projectsCreate({
        companyId: req.companyId,
        title: name,
        description: e.description,
      });
      return { resultId: res.projectId, summary: `Completed: started project ${name}` };
    }

    case 'create_goal': {
      const title = need('title');
      const targetDate = e.targetDate ? Number(e.targetDate) || null : null;
      const res = await h.goalsCreate({
        companyId: req.companyId,
        title,
        description: e.description,
        targetDate,
      });
      return { resultId: res.goalId, summary: `Completed: created goal ${title}` };
    }

    case 'call_meeting': {
      // meetings.call requires chairId + attendeeIds — the palette flow
      // only captures an agenda string in M30, so we default the chair
      // to the first active employee and attendees to that same one.
      // The Meetings UI in T6 can override via an attendee picker.
      const agenda = need('agenda');
      const employees = await h.employeesList({ companyId: req.companyId });
      const active = employees.filter((emp) => (emp.status ?? 'active') === 'active');
      if (active.length === 0) {
        throw new Error('No active employees — hire someone before calling a meeting');
      }
      const firstActive = active[0];
      if (!firstActive) {
        throw new Error('No active employees');
      }
      const chairId = e.chairId?.trim() || firstActive.id;
      const attendeeIds = e.attendeeIds
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [chairId];
      const res = await h.meetingsCall({
        companyId: req.companyId,
        chairId,
        attendeeIds,
        agenda,
      });
      return { resultId: res.meetingId, summary: `Completed: called meeting ${agenda}` };
    }

    case 'end_meeting': {
      const meetingId = need('meetingId');
      await h.meetingsEnd({ meetingId });
      return { summary: `Completed: ended meeting ${meetingId}` };
    }

    case 'check_status': {
      const employees = await h.employeesList({ companyId: req.companyId });
      const n = employees.length;
      const activeCount = employees.filter((emp) => (emp.status ?? 'active') === 'active').length;
      return {
        summary: `${n} employee${n === 1 ? '' : 's'} on the team (${activeCount} active).`,
      };
    }

    case 'show_view': {
      // Pure navigation hint — the renderer consumes `summary` + the
      // returned entities to route. No backend call in M30.
      const view = need('view');
      return { summary: `Navigate to ${view}` };
    }

    case 'search_vault': {
      const query = need('query');
      const hits = await h.vaultSearch({
        companyId: req.companyId,
        query,
      });
      const top = hits.slice(0, 5);
      if (top.length === 0) {
        return { summary: `No vault matches for "${query}"` };
      }
      const names = top.map((r) => r.originalName ?? r.id ?? 'unknown').join(', ');
      return {
        summary: `Top ${top.length} vault match${top.length === 1 ? '' : 'es'}: ${names}`,
      };
    }

    case 'complex_request': {
      // M31 T4 — route to the agentic loop. `agenticLoopStart` is
      // optional on the dispatch seam so existing tests (and any
      // partial composition root) still typecheck; absence here is a
      // hard-configuration bug, not a runtime-user bug, so we throw
      // and let `execute()`'s try/catch shape a typed `handler_error`
      // result + append an audit row. Same pattern as
      // `fire_employee` / `promote_employee` above.
      const start = h.agenticLoopStart;
      if (!start) {
        throw new Error('agentic loop not wired — AgenticLoopService missing from CommandHandlers');
      }
      const actorId = req.actorId?.trim() || 'user';
      const text = req.rawText ?? '';
      const { runId, threadId } = await start({
        companyId: req.companyId,
        text,
        actorId,
      });
      return {
        // resultId carries the runId so the Audit view and the command
        // history list can show a stable reference without needing to
        // know about the runId/threadId shape. runId/threadId are also
        // passed through explicitly below for richer renderers.
        resultId: runId,
        summary: 'Delegated: started agentic execution and the step log is streaming live',
        runId,
        threadId,
      };
    }

    default: {
      // Exhaustiveness guard — if someone adds a new IntentName this
      // will force them to extend the dispatch table.
      const _exhaustive: never = req.intent;
      throw new Error(`unhandled intent: ${String(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

interface WriteHistoryArgs {
  deps: CommandServiceDeps;
  newId: () => string;
  now: () => Date;
  companyId: string;
  actorId: string;
  rawText: string;
  intent: IntentName;
  entities: Record<string, string>;
  outcome: 'ok' | 'error';
  resultId?: string | number;
  durationMs: number;
  logger: { error: (m: string, e: unknown) => void };
  /**
   * Agentic-loop cross-refs (M31 T4). Only populated for the
   * `complex_request` intent; every other intent leaves these
   * undefined. Propagated into `CommandExecutedPayload` so the Audit
   * view can deep-link palette invocations to their Copilot threads.
   */
  runId?: string;
  threadId?: string;
}

async function writeHistoryAndEvent(args: WriteHistoryArgs): Promise<void> {
  const { deps, newId, now, logger } = args;
  const id = newId();
  const executedAt = now().toISOString();
  const resultIdStr = args.resultId === undefined ? null : String(args.resultId);

  // 1. Persist row (best-effort — a DB failure must not flip a
  //    successful execute into an error for the user).
  try {
    deps.historyRepo.append({
      id,
      companyId: args.companyId,
      actorId: args.actorId,
      text: args.rawText,
      intent: args.intent,
      entitiesJson: JSON.stringify(args.entities ?? {}),
      executedAt,
      outcome: args.outcome,
      resultId: resultIdStr,
    });
    deps.historyRepo.trim(args.companyId, COMMAND_HISTORY_CAP);
  } catch (err) {
    logger.error('history persist failed', err);
  }

  // 2. Emit event. The event bus itself isolates listener exceptions
  //    (M29 learning), but the initial `emit` call may still throw on
  //    a DB write failure — wrap it so the command flow stays intact.
  try {
    const payload: CommandExecutedPayload = {
      companyId: args.companyId,
      actorId: args.actorId,
      intent: args.intent,
      entities: args.entities ?? {},
      rawText: args.rawText,
      outcome: args.outcome,
      resultId: args.resultId,
      durationMs: args.durationMs,
      // Exact-omit semantics — attaching `runId: undefined` would
      // break a strict JSON round-trip on the bus (undefined keys
      // serialize to `null`). Only emit when set.
      ...(args.runId !== undefined ? { runId: args.runId } : {}),
      ...(args.threadId !== undefined ? { threadId: args.threadId } : {}),
    };
    deps.bus.emit<CommandExecutedPayload>({
      type: 'command.executed',
      companyId: args.companyId,
      actorId: args.actorId,
      actorKind: 'user',
      payload,
    });
  } catch (err) {
    logger.error('command.executed emit failed', err);
  }
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

function normalizeIntentEntities(
  intent: IntentName,
  entities: Record<string, string>,
): Record<string, string> {
  const normalized = flattenPartial(entities);
  if (intent === 'assign_ticket' && !normalized.employeeQuery && normalized.assigneeQuery) {
    normalized.employeeQuery = normalized.assigneeQuery;
  }
  return normalized;
}

function applyOptionalEntityResolutions(args: {
  intent: IntentName;
  entities: Record<string, string>;
  baseEntities: Record<string, string>;
  resolved: Record<string, ResolvedEntity<unknown>>;
}):
  | { kind: 'ok'; entities: Record<string, string> }
  | { kind: 'needs_clarification'; missing: string; prompt: string; options?: string[] } {
  const specs = OPTIONAL_ENTITY_RESOLUTIONS[args.intent] ?? [];
  const entities = { ...args.baseEntities };

  for (const spec of specs) {
    const raw = args.entities[spec.queryKey];
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;

    const resolution = args.resolved[spec.queryKey];
    if (!resolution || resolution.kind === 'not_found') {
      return {
        kind: 'needs_clarification',
        missing: spec.entityKey,
        prompt: `I couldn't find anyone matching '${raw.trim()}'. ${spec.prompt}`,
      };
    }
    if (resolution.kind === 'ambiguous') {
      return {
        kind: 'needs_clarification',
        missing: spec.entityKey,
        prompt: `Multiple matches for '${raw.trim()}'. Which one?`,
        options: resolution.candidates
          .slice(0, 5)
          .map((candidate) => stringifyEntityOption(candidate)),
      };
    }

    entities[spec.entityKey] = entityIdFromValue(resolution.value);
  }

  return { kind: 'ok', entities };
}

function stringifyEntityOption(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (typeof record.title === 'string') return record.title;
    if (typeof record.id === 'string') return record.id;
  }
  return String(value);
}

function entityIdFromValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') return record.id;
    const frontmatter = record.frontmatter;
    if (frontmatter && typeof frontmatter === 'object') {
      const fm = frontmatter as Record<string, unknown>;
      if (typeof fm.id === 'string') return fm.id;
    }
  }
  return String(value);
}

function rowToEntry(row: {
  id: string;
  companyId: string;
  actorId: string;
  text: string;
  intent: string;
  entitiesJson: string;
  executedAt: string;
  outcome: string;
  resultId: string | null;
}): CommandHistoryEntry {
  let entities: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.entitiesJson);
    if (parsed && typeof parsed === 'object') {
      entities = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    }
  } catch {
    // Swallow — a malformed row is a historical bug, not a fatal
    // error. Return an empty entities map so the UI can still render.
    entities = {};
  }
  return {
    id: row.id,
    text: row.text,
    intent: row.intent as IntentName,
    entities,
    executedAt: row.executedAt,
    outcome: row.outcome === 'ok' ? 'ok' : 'error',
    resultId: row.resultId ?? undefined,
    companyId: row.companyId,
    actorId: row.actorId,
  };
}

function buildReadySummary(intent: IntentName, entities: Record<string, string>): string {
  switch (intent) {
    case 'hire_employee':
      return `Hire role ${entities.roleId}`;
    case 'assign_ticket':
      return `Assign ticket ${entities.ticketId} to ${entities.employeeId}`;
    case 'create_ticket':
      return `File ticket: ${entities.title}`;
    case 'reopen_ticket':
      return `Reopen ticket ${entities.ticketId}`;
    case 'create_project':
      return `Start project: ${entities.name}`;
    case 'create_goal':
      return `Set goal: ${entities.title}`;
    case 'call_meeting':
      return `Call meeting: ${entities.agenda}`;
    case 'check_status':
      return 'Check team status';
    case 'show_view':
      return `Show view: ${entities.view}`;
    case 'search_vault':
      return `Search vault: ${entities.query}`;
    case 'complex_request':
      return 'Delegate to the Copilot Agent';
    default:
      return intent;
  }
}

function buildDestructiveSummary(intent: IntentName, entities: Record<string, string>): string {
  switch (intent) {
    case 'fire_employee':
      return `Fire employee ${entities.employeeId}?`;
    case 'close_ticket':
      return `Close ticket ${entities.ticketId}?`;
    case 'end_meeting':
      return `End meeting ${entities.meetingId}?`;
    case 'promote_employee':
      return `Promote employee ${entities.employeeId} to ${entities.newLevel}?`;
    default:
      return `Confirm ${intent}?`;
  }
}

/**
 * Flatten classifier entities to a `Record<string, string>`. The T1
 * classifier already emits strings, but defence-in-depth against a
 * provider that returns e.g. numbers: coerce to string, drop non-string
 * values cleanly so downstream callers never see undefined.
 */
function flattenPartial(entities: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entities)) {
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
}

/**
 * Default-name placeholder for `hire_employee` dispatches that lack
 * an explicit name entity. Uses a short random suffix so a batch of
 * "hire a senior backend engineer" commands doesn't collide on title.
 */
function defaultEmployeeName(): string {
  return `New Hire ${nanoid(6)}`;
}

/**
 * Wrap a resolver call — the resolver can throw on FTS5 errors or bad
 * regex input, and we must NOT leak that out of `parse`. On any throw
 * we downgrade to `not_found` so the slot filler emits a clean
 * clarification prompt rather than a 500.
 */
async function safe<T>(fn: () => Promise<ResolvedEntity<T>>): Promise<ResolvedEntity<T>> {
  try {
    return await fn();
  } catch {
    return { kind: 'not_found' };
  }
}
