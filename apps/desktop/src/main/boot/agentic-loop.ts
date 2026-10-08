/**
 * Boot phase — the agentic loop service (Phase 5 — M31 T4), the front-door
 * for the command palette's `complex_request` intent and for `copilot.ask`.
 */

import type {
  LoopCompleteFn,
  LoopMessage,
  LoopProviderCompletion,
  LoopProviderToolCall,
} from '@team-x/intelligence';
import {
  type StreamContentPart,
  type StreamMessage,
  type ToolSpec,
  buildProviderTools,
  streamAgent,
} from '@team-x/provider-router';
import { SYSTEM_COPILOT_ROLE_ID } from '@team-x/shared-types';

import { HUMAN_USER_ID } from '../ipc/handlers.js';
import {
  type AgenticLoopService,
  budgetsFromAgenticSettings,
  createAgenticLoopService,
} from '../services/agentic-loop-service.js';
import { buildCopilotToolRegistry } from '../services/agentic-tools-copilot.js';
import {
  type WriteSideCompleteFn,
  type WriteSideOrchestrator,
  type WriteSideWorkloadProvider,
  buildWriteSideTools,
} from '../services/agentic-tools-write.js';
import { createAgenticTools } from '../services/agentic-tools.js';
import type { EnhancedAiService } from '../services/enhanced-ai.js';
import type { RoleLoader } from '../services/role-loader.js';
import { createTestAgenticCompleteFn } from '../services/test-agentic-provider.js';
import { createTestToolsForEmployee } from '../services/test-agentic-tools.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export interface AgenticLoopDeps
  extends Pick<
      Repositories,
      | 'employeesRepo'
      | 'threadsRepo'
      | 'messagesRepo'
      | 'runsRepo'
      | 'projectsRepo'
      | 'meetingsRepo'
      | 'vaultRepo'
      | 'auditRepo'
      | 'copilotInsightsRepo'
      | 'settingsRepo'
    >,
    Pick<PlatformServices, 'testMode' | 'bus'>,
    Pick<GovernanceServices, 'ticketsRepo' | 'pendingDelegationsRepo' | 'budgetGovernanceService'>,
    Pick<ProviderRouting, 'resolveProvider'> {
  roleLoader: RoleLoader;
  enhancedAiService: EnhancedAiService | null;
}

/** Builds the agentic loop service, publishes it on `runtime`, and returns it. */
export function bootAgenticLoop(deps: AgenticLoopDeps): AgenticLoopService {
  const {
    employeesRepo,
    threadsRepo,
    messagesRepo,
    runsRepo,
    projectsRepo,
    meetingsRepo,
    vaultRepo,
    auditRepo,
    copilotInsightsRepo,
    settingsRepo,
    testMode,
    bus,
    ticketsRepo,
    pendingDelegationsRepo,
    budgetGovernanceService,
    resolveProvider,
    roleLoader,
    enhancedAiService,
  } = deps;

  // ---- Agentic loop service (Phase 5 — M31 T4) --------------------------
  //
  // Front-door for the command-palette `complex_request` intent. Built
  // AFTER the orchestrator (so the pause-gate observer can consult
  // `isCompanyPaused` on every provider completion) and BEFORE the
  // CommandService (so the handlers dispatch map can inject
  // `agenticLoopStart`). `buildTools` runs per invocation — every
  // loop run gets a fresh, company-scoped tool set so stale company
  // bindings never bleed across concurrent runs.
  //
  // In test mode (`NODE_ENV === 'test'`), `resolveComplete` returns
  // `createTestAgenticCompleteFn()` — a deterministic canned
  // `LoopCompleteFn` mirroring the M30 `createTestClassifier` seam.
  // The production branch wraps `streamAgent` from the provider
  // router into the loop's non-streaming request/response shape by
  // accumulating delta chunks + end-of-stream usage. Budgets come from
  // Settings → Agentic Loop via `getBudgets` below.
  //
  // `humanUserId: 'user'` matches CommandService's default actorId —
  // keeps audit events and thread memberships consistent with the
  // Phase 1 single-user posture.
  runtime.agenticLoopServiceInstance = createAgenticLoopService({
    employeesRepo: {
      findSystemByRoleId: (cid, rid) => {
        const row = employeesRepo.findSystemByRoleId(cid, rid);
        return row ? { id: row.id } : null;
      },
      // M32 T3 — explicit-employeeId path on AgenticLoopService.start().
      // Maps the production EmployeeRow shape onto AgenticLoopEmployeeLookup
      // so the loop can level-gate the write-side tool registry. Older
      // rows without an explicit `isSystem` flag default to false (M31
      // schema migration backfilled, but defending against legacy reads).
      getById: (id) => {
        const row = employeesRepo.getById(id);
        if (!row) return null;
        return {
          id: row.id,
          level: row.level,
          isSystem: row.isSystem ?? false,
          companyId: row.companyId,
        };
      },
    },
    threadsRepo: {
      // The agentic-loop service widens `kind` to `string` and
      // `memberKind` to `'user' | 'employee' | string` in its
      // structural contract so tests can hand-roll fakes without
      // pulling the full drizzle row types. At runtime the service
      // only ever passes the canonical Phase-1 values (`'dm'`,
      // `'user'`, `'employee'`), so narrowing at the boundary is
      // sound. The same pattern covers `messagesRepo.append` below.
      create: (input) =>
        threadsRepo.create({
          companyId: input.companyId,
          kind: input.kind as Parameters<typeof threadsRepo.create>[0]['kind'],
          subject: input.subject,
          createdBy: input.createdBy,
        }),
      addMember: (input) =>
        threadsRepo.addMember({
          threadId: input.threadId,
          memberId: input.memberId,
          memberKind: input.memberKind as Parameters<typeof threadsRepo.addMember>[0]['memberKind'],
          ...(input.roleInThread !== undefined ? { roleInThread: input.roleInThread } : {}),
        }),
    },
    messagesRepo: {
      append: (input) => messagesRepo.append(input),
    },
    runsRepo: {
      start: (input) => runsRepo.start(input),
      finish: (id, input) => runsRepo.finish(id, input),
    },
    budgetGovernance: budgetGovernanceService,
    bus,
    orchestrator: {
      // The `runtime.orchestrator` handle is nullable during the
      // brief window between early-crash + will-quit cleanup. Treat
      // "no orchestrator" as "not paused" so a mid-teardown run can
      // still settle cleanly rather than deadlocking on the gate.
      isCompanyPaused: (cid) => runtime.orchestrator?.isCompanyPaused(cid) ?? false,
    },
    buildTools: ({ companyId, employee }) => {
      // M33 T6 — resolve the actor's roleId once per run. The
      // `AgenticLoopEmployeeContext` surface is intentionally narrow
      // (id/level/isSystem) for M31/M32 compat; the roleId lookup
      // lives at the composition root where the repo is in scope.
      // Zero-cost for the common M31 case (system-agent) — one row
      // lookup per agentic-loop start, never per-tool-call.
      const actorRow = employeesRepo.getById(employee.id);
      const roleId = actorRow?.roleId ?? '';
      const employeeWithRole = { ...employee, roleId };

      if (testMode) {
        // Canned tool set — no repo access, deterministic envelopes
        // per tool. Level-gated mirror of the production composition,
        // so E2E specs that pass an explicit employeeId (M32 T3) get
        // the same write-side subset they'd get in production. T6
        // threads `roleId` through so the test composer's copilot
        // branch (`createTestToolsForEmployee` in
        // `test-agentic-tools.ts`) picks up `query_copilot_insights`
        // when the actor is the system-copilot pseudo-employee.
        return createTestToolsForEmployee({ companyId, employee: employeeWithRole });
      }

      // ─── Production composition (M32 T3 + M33 T6) ───────────────
      // Read-side tools are always exposed (every actor can query).
      const readSide = createAgenticTools({
        companyId,
        employeesRepo,
        ticketsRepo,
        projectsRepo,
        meetingsRepo,
        vaultRepo,
        auditRepo,
      });

      // M33 T6 — copilot branch. When the actor is the company's
      // `system-copilot` pseudo-employee, the registry is
      // `[...readSide, ...copilotTools]` — the M32 write-side set is
      // specifically carved out so the copilot never decomposes,
      // delegates, or reviews. The system-agent branch below stays
      // unchanged with its original M31 read-only + M32 write-side
      // tool set.
      if (roleId === SYSTEM_COPILOT_ROLE_ID) {
        const copilotTools = buildCopilotToolRegistry(
          { roleId },
          {
            companyId,
            copilotInsightsRepo: {
              listActive: (filter) => copilotInsightsRepo.listActive(filter),
            },
            // Enhanced AI grounding for copilot.ask; the tool is simply not
            // offered when retrieval is not configured.
            ...(enhancedAiService ? { knowledge: enhancedAiService } : {}),
          },
        );
        return [...readSide, ...copilotTools];
      }

      // ─── Write-side composition (M32 T3) — every non-copilot actor
      // Write-side tools are level-gated by `buildWriteSideTools` per
      // Phase 5 §7.1: decompose for Officer/Senior-Mgmt/Management/
      // system-agent, delegate+review for Management/Supervisor/Lead/
      // system-agent. ICs receive an empty write-side array.

      // Workload provider — every signal is a real repo lookup:
      // open-ticket count here, in-meeting and completion-history in the
      // Track 2 block below. All three degrade to conservative defaults
      // on a repo error rather than aborting the agentic loop, so an
      // emptier inbox still ranks higher, which is the load-balancing
      // intent.
      const workload: WriteSideWorkloadProvider = {
        openTicketCount: (eid) => {
          try {
            return ticketsRepo
              .listByCompany(companyId)
              .filter((t) => t.assigneeId === eid && t.status !== 'done').length;
          } catch {
            return 0;
          }
        },
        // Track 2 — wired workload signals (replaces M32 stubs that
        // returned `false` and `null` unconditionally and degraded the
        // delegation scoring function in `agentic-tools-write.ts`).
        //
        // `inMeeting`: a candidate is in-meeting iff the company has an
        // active meeting AND the candidate's id is in the meeting's
        // serialized attendees list. Active meetings pause turn dispatch
        // for those attendees, so delegating a ticket to them creates
        // ghost work; the planner should de-prioritize.
        //
        // `avgCompletionMs`: averaged ticket cycle time
        // (`closedAt - createdAt`) across all CLOSED tickets the
        // candidate was the assignee on. The planner clamps against
        // `pastPerformanceCeilingMs` (default 48h), so this signal
        // differentiates fast vs. slow closers within that window.
        // `subtaskType` is accepted for forward compatibility but
        // ignored in V1 — ticket labels do not yet carry a subtask-type
        // taxonomy that maps cleanly onto the planner's bucket. Future
        // refinement: filter by labels matching `subtaskType` when the
        // taxonomy stabilizes.
        //
        // Both implementations are wrapped in try/catch and degrade to
        // the conservative defaults (`false` / `null`) on repo errors —
        // the agentic loop must not abort over a workload signal hiccup.
        inMeeting: (employeeId) => {
          try {
            const active = meetingsRepo.getActive(companyId);
            if (!active) return false;
            const attendees = JSON.parse(active.attendeesJson) as unknown;
            if (!Array.isArray(attendees)) return false;
            return attendees.some((a) => a === employeeId);
          } catch {
            return false;
          }
        },
        avgCompletionMs: (employeeId, _subtaskType) => {
          try {
            const closedAssigned = ticketsRepo
              .listByAssignee(employeeId)
              .filter((t) => t.closedAt !== null && t.closedAt > t.createdAt);
            if (closedAssigned.length === 0) return null;
            const total = closedAssigned.reduce(
              (sum, t) => sum + ((t.closedAt ?? 0) - t.createdAt),
              0,
            );
            return total / closedAssigned.length;
          } catch {
            return null;
          }
        },
      };

      // Write-side orchestrator seam. Delegation is not complete when a
      // ticket row is merely assigned: the assignee needs a ticket thread
      // message and an actual queued reply turn. Keep that bridge here,
      // where threads/messages/orchestrator are all in scope.
      const writeOrchestrator: WriteSideOrchestrator = {
        queueDelegatedTicket: async (args) => {
          if (!runtime.orchestrator) {
            throw new Error(
              '[agentic-loop] orchestrator is unavailable for delegated ticket pickup',
            );
          }

          const ticket = ticketsRepo.getById(args.ticketId);
          if (!ticket || ticket.companyId !== args.companyId) {
            throw new Error(
              `[agentic-loop] delegated ticket "${args.ticketId}" is not available in company "${args.companyId}"`,
            );
          }

          const assignee = employeesRepo.getById(args.employeeId);
          if (!assignee || assignee.companyId !== args.companyId) {
            throw new Error(
              `[agentic-loop] delegated assignee "${args.employeeId}" is not available in company "${args.companyId}"`,
            );
          }

          let threadId = ticket.threadId;
          if (!threadId) {
            threadId = threadsRepo.create({
              companyId: args.companyId,
              kind: 'ticket',
              subject: ticket.title,
              createdBy: args.actorId,
            });
            ticketsRepo.setThreadId(args.ticketId, threadId);
          }

          const ensureMember = (memberId: string, memberKind: 'user' | 'employee'): void => {
            const members = threadsRepo.listMembers(threadId);
            const alreadyMember = members.some(
              (member) => member.memberId === memberId && member.memberKind === memberKind,
            );
            if (!alreadyMember) {
              threadsRepo.addMember({ threadId, memberId, memberKind });
            }
          };

          ensureMember(HUMAN_USER_ID, 'user');
          ensureMember(args.employeeId, 'employee');
          if (args.actorKind === 'employee' && args.actorId !== args.employeeId) {
            ensureMember(args.actorId, 'employee');
          }

          const actorRow =
            args.actorKind === 'employee' ? employeesRepo.getById(args.actorId) : null;
          const actorLabel = actorRow?.name ?? args.actorId;
          const description = ticket.description.trim();
          const triggerMessageId = messagesRepo.append({
            threadId,
            authorId: args.actorId,
            authorKind: args.actorKind === 'user' ? 'user' : 'employee',
            isAgentInitiated: args.actorKind !== 'user',
            content: `Delegated by ${actorLabel}: **${ticket.title}**\n\n${description.length > 0 ? description : '(no description)'}\n\nBegin work now. Reply with your assessment, concrete next action, blockers, and expected handoff.`,
          });

          runtime.orchestrator
            .enqueueAgentReply({
              threadId,
              employeeId: args.employeeId,
              triggerMessageId,
            })
            .catch((err: unknown) => {
              console.error(
                `[agentic-loop] delegated ticket pickup failed for ticket=${args.ticketId}:`,
                err,
              );
            });

          return { threadId, triggerMessageId };
        },
        isCompanyPaused: (cid) => runtime.orchestrator?.isCompanyPaused(cid) ?? false,
        canResolveProvider: async (employeeId) => {
          const emp = employeesRepo.getById(employeeId);
          if (!emp) return false;
          try {
            await resolveProvider(emp);
            return true;
          } catch {
            return false;
          }
        },
      };

      // Provider seam for the write-side tools' inner LLM calls
      // (`decompose_project` for plan generation, `review_deliverable`
      // for the review summary). Resolves the actor's configured
      // provider+model on each invocation — the write-side tools fire
      // infrequently enough that re-resolving per call is cheaper
      // than caching across runs and dealing with stale provider
      // settings. Wraps `streamAgent` into the non-streaming
      // request/response shape `WriteSideCompleteFn` expects.
      const writeProviderComplete: WriteSideCompleteFn = async (req) => {
        const actorRow = employeesRepo.getById(employee.id);
        if (!actorRow) {
          throw new Error(
            `[agentic-loop] Write-side actor "${employee.id}" not found in employees repo.`,
          );
        }
        // The same runtime-profile-aware resolution every other model call uses
        // (one execution policy, audit P1-8): a runtime profile bound to this
        // employee applies here too, and Settings → Privacy is enforced once.
        const resolved = await resolveProvider(actorRow);
        let text = '';
        for await (const chunk of streamAgent({
          providerFactory: resolved.stream,
          system: req.system,
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        })) {
          if (req.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          if (chunk.kind === 'delta') {
            text += chunk.delta;
          }
          // 'done' carries usage tallies — write-side `WriteSideCompleteFn`
          // doesn't surface usage upstream, so we discard them here. The
          // outer agentic loop's read-side telemetry covers the run-level
          // accounting; per-tool inner-call accounting lands in M33.
        }
        return { text };
      };

      const writeSide = buildWriteSideTools(employee, {
        companyId,
        actorId: employee.id,
        actorKind: 'employee',
        employeesRepo,
        ticketsRepo,
        projectsRepo,
        // C4 (audit 2026-05-07) — `delegate_subtask` writes here
        // instead of inserting tickets directly.
        pendingDelegationsRepo,
        bus,
        orchestrator: writeOrchestrator,
        providerComplete: writeProviderComplete,
        workload,
        roleLookup: roleLoader,
        // T7 — settings-repo-backed planner guardrails replace the
        // static PLANNER_DEFAULTS fallback. Every write-side tool call
        // now reads the user's current planner settings live.
        // `loadDenominator` and `pastPerformanceCeilingMs` are internal
        // scoring constants (not user-facing settings), so they stay at
        // their PLANNER_DEFAULTS values.
        getPlanner: () => {
          const p = settingsRepo.getPlanner();
          return {
            ...p,
            loadDenominator: 5,
            pastPerformanceCeilingMs: 172_800_000,
          };
        },
      });

      return [...readSide, ...writeSide];
    },
    resolveComplete: async ({ systemAgentId }) => {
      if (testMode) {
        // Canned path — no LLM, no keychain, no network. Matches
        // the `createTestClassifier` seam exactly so every E2E spec
        // can round-trip the agentic loop without external infra.
        return {
          complete: createTestAgenticCompleteFn(),
          provider: 'test-mode',
          model: 'test-mode-agent',
        };
      }
      // Production — resolve the system-agent's configured provider
      // + model via the standard factory, then wrap `streamAgent`
      // into a native-tool-use `LoopCompleteFn` (post-C2 migration,
      // audit 2026-05-07). For each `complete()` call:
      //
      //   1. Translate the loop's structured `LoopMessage[]` (which
      //      carries assistant tool-call parts and tool-result parts
      //      for the round-trip) into provider-router `StreamMessage[]`
      //      with structured content. The provider router casts
      //      these to Vercel AI SDK `CoreMessage` shape internally.
      //
      //   2. Convert the loop's tool descriptors (JSON Schema) into
      //      Vercel AI SDK CoreTool records via `buildProviderTools`,
      //      using a NO-OP execute callback (see comment below). The
      //      SDK emits `tool-call` events without auto-running them
      //      — the loop dispatches via its zod-validated registry so
      //      typed failure modes (invalid_args / timeout / threw) and
      //      the <observation> trust-fence stay in one place.
      //
      //   3. Drain the stream, accumulating text deltas, tool-call
      //      events, and the terminal usage record. Return both the
      //      text and the structured `toolCalls` to the loop.
      const emp = employeesRepo.getById(systemAgentId);
      if (!emp) {
        throw new Error(`[agentic-loop] system-agent employee ${systemAgentId} not found`);
      }
      // The same runtime-profile-aware resolution every other model call uses
      // (one execution policy, audit P1-8): a runtime profile bound to this
      // employee applies here too, and Settings → Privacy is enforced once.
      const resolved = await resolveProvider(emp);
      const { providerName, model, stream } = resolved;
      const complete: LoopCompleteFn = async ({ system, messages, tools, signal }) => {
        let text = '';
        let promptTokens = 0;
        let completionTokens = 0;
        let cachedInputTokens: number | undefined;
        let cacheWriteTokens: number | undefined;
        const collectedToolCalls: LoopProviderToolCall[] = [];

        // Translate structured LoopMessage[] → StreamMessage[].
        const streamMessages: StreamMessage[] = messages.map((m: LoopMessage) => {
          if (typeof m.content === 'string') {
            return { role: m.role, content: m.content } as StreamMessage;
          }
          // Structured assistant or tool message — pass parts through
          // verbatim. The Anthropic adapter casts to CoreMessage[]
          // and the structured content matches CoreMessage's shape.
          return {
            role: m.role,
            content: m.content as StreamContentPart[],
          } as StreamMessage;
        });

        // Build the provider's tool surface. We use a NO-OP execute
        // callback that throws — the SDK emits the tool-call event on
        // `fullStream` BEFORE it would invoke execute, and we abort
        // the stream after the model's first turn anyway via
        // maxSteps:1 (the adapter's default). The throw in execute
        // is belt-and-suspenders: if the SDK ever did invoke it,
        // the error is captured and surfaced as a tool-call to the
        // loop's registry instead of leaking provider state.
        const toolSpecs: ToolSpec[] = tools.map((td) => ({
          name: td.name,
          description: td.description,
          inputSchema: td.jsonSchema,
          execute: (async (_args: unknown) => {
            // Loop dispatches tools via its registry; SDK execute is
            // never reached when maxSteps === 1.
            throw new Error(
              '[agentic-loop] provider attempted to execute tool — loop should dispatch instead.',
            );
          }) as ToolSpec['execute'],
        }));
        const providerTools = toolSpecs.length > 0 ? buildProviderTools(toolSpecs) : undefined;

        for await (const chunk of streamAgent({
          providerFactory: stream,
          system,
          messages: streamMessages,
          tools: providerTools,
          // maxSteps:1 — the loop owns multi-turn iteration. The SDK
          // emits the model's first turn (text + tool-calls) and
          // stops; the loop dispatches and re-enters complete().
          maxSteps: 1,
          signal,
        })) {
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          if (chunk.kind === 'delta') {
            text += chunk.delta;
          } else if (chunk.kind === 'tool-call') {
            collectedToolCalls.push({
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.args,
            });
          } else if (chunk.kind === 'done') {
            promptTokens = chunk.usage.promptTokens;
            completionTokens = chunk.usage.completionTokens;
            // C3 — Anthropic prompt-caching token counts surface here
            // when caching is enabled at the adapter. Both fields are
            // optional; a non-Anthropic provider (or Anthropic with
            // cache disabled) leaves them undefined.
            cachedInputTokens = chunk.usage.cachedInputTokens;
            cacheWriteTokens = chunk.usage.cacheWriteTokens;
          }
          // tool-result events are not produced (no execute) — ignore.
        }

        // C3 — compute real cost per iteration so the loop's
        // `LoopBudgetUsed.costUsd` accumulator and the agentic-loop
        // service's run row reflect cache-aware spend. The wrapper
        // returns a decimal string for storage; we parse to a number
        // here because the LoopProviderCompletion.costUsd field is
        // a numeric per-iteration accumulator.
        const costUsdString = calcCost({
          provider: providerName,
          model,
          promptTokens,
          completionTokens,
          ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
          ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
        });

        const completion: LoopProviderCompletion = {
          text,
          toolCalls: collectedToolCalls,
          usage: { promptTokens, completionTokens },
          provider: providerName,
          model,
          costUsd: Number(costUsdString),
        };
        return completion;
      };
      return { complete, provider: providerName, model };
    },
    // Settings → Agentic Loop (Max Steps / Max Tokens / Timeout), read at
    // each run start so a change applies to the next run. The UI's "Max
    // Steps" is a tool-turn count and maps to the loop's `maxIterations`;
    // see `budgetsFromAgenticSettings` for why it is not `maxSteps`.
    getBudgets: () => budgetsFromAgenticSettings(settingsRepo.getAgentic()),
    humanUserId: 'user',
  });
  return runtime.agenticLoopServiceInstance;
}
