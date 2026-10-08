/**
 * Boot phase 5h — the role loader, the MCP tool resolver, and the
 * orchestrator itself, followed by the recovery of chat turns a previous
 * session left unanswered.
 */

import { type ToolSpec, buildProviderTools } from '@team-x/provider-router';

import { userDataDir } from '../db/paths.js';
import { HUMAN_USER_ID } from '../ipc/handlers.js';
import type { EventBus } from '../orchestrator/event-bus.js';
import {
  type Orchestrator,
  type ResolveTools,
  buildOrchestrator,
  isWorkFailureReported,
} from '../orchestrator/index.js';
import { buildChatActionTools } from '../services/chat-action-tools.js';
import { type RoleLoader, createRoleLoader } from '../services/role-loader.js';
import { appendExecutionPolicy } from '../services/system-prompt.js';

import { calcCost } from './cost.js';
import type { GovernanceServices } from './governance-services.js';
import { resolveRolePacksRoot } from './paths.js';
import type { PlatformServices } from './platform-services.js';
import type { ProviderRouting } from './provider-routing.js';
import type { RagAndContext } from './rag.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export function bootRoleLoader(deps: { isDev: boolean }): RoleLoader {
  const { isDev } = deps;

  // Role loader: turns (employee, company) into a rendered system prompt.
  // Preloaded eagerly so the cost of the role-pack scan is paid during
  // boot rather than on the first user message.
  //
  // Pack-signature verification mode is platform-aware:
  //   - production (packaged) builds → 'strict' refuses to load on tamper
  //   - dev builds                   → 'warn' logs but loads (so Rocky can
  //                                    edit role.md without re-signing on
  //                                    every save; sign before commit)
  //   - test mode                    → 'off' (E2E + unit tests build
  //                                    synthetic packs without sigs)
  const verifyMode: 'strict' | 'warn' | 'off' =
    process.env.NODE_ENV === 'test' ? 'off' : isDev ? 'warn' : 'strict';
  const roleLoader = createRoleLoader({
    rolePacksRoot: resolveRolePacksRoot(),
    verifyMode,
  });
  try {
    roleLoader.preload();
    console.log(`[role-loader] indexed ${roleLoader.size()} role(s)`);
  } catch (err) {
    // A missing role-packs directory is a wiring bug — surface it
    // loudly but do not crash the app. Chats will fail with a clear
    // error from the role loader on first send, which is the right
    // place for the user to learn about it.
    console.error('[role-loader] preload failed:', err);
  }
  return roleLoader;
}

export interface OrchestratorDeps
  extends Pick<
      Repositories,
      | 'authorityResolver'
      | 'employeesRepo'
      | 'messagesRepo'
      | 'runsRepo'
      | 'companiesRepo'
      | 'threadsRepo'
      | 'settingsRepo'
    >,
    Pick<
      PlatformServices,
      | 'testMode'
      | 'mcpHost'
      | 'bus'
      | 'skillsService'
      | 'vaultService'
      | 'threadDigestService'
      | 'runCheckpointService'
    >,
    Pick<GovernanceServices, 'ticketsRepo' | 'runtimeProfilesService'>,
    Pick<ProviderRouting, 'resolveProvider' | 'initialSlots' | 'initialProviderCaps'>,
    Pick<RagAndContext, 'contextAssemblerService' | 'contextPackerService'> {
  roleLoader: RoleLoader;
}

/** Builds the orchestrator, publishes it on `runtime`, and returns it. */
export function bootOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const {
    authorityResolver,
    employeesRepo,
    messagesRepo,
    runsRepo,
    companiesRepo,
    threadsRepo,
    settingsRepo,
    testMode,
    mcpHost,
    bus,
    skillsService,
    vaultService,
    threadDigestService,
    runCheckpointService,
    ticketsRepo,
    runtimeProfilesService,
    resolveProvider,
    initialSlots,
    initialProviderCaps,
    contextAssemblerService,
    contextPackerService,
    roleLoader,
  } = deps;

  // Tool resolver: converts MCP tools into AI SDK tool objects with
  // execute callbacks routed through McpHost. Skipped in test mode
  // (no MCP servers, no tool calls).
  const resolveTools: ResolveTools | undefined = testMode
    ? undefined
    : async ({ employee, company, getRunId }) => {
        const mcpTools = mcpHost.listTools(company.id);
        let toolsAllowed: string[] = JSON.parse(employee.toolsAllowedJson ?? '[]');
        let toolsDenied: string[] = JSON.parse(employee.toolsDeniedJson ?? '[]');
        try {
          const effectiveAuthority = authorityResolver.resolveEmployee(company.id, employee.id);
          toolsAllowed = effectiveAuthority.toolsAllowed;
          toolsDenied = effectiveAuthority.toolsDenied;
        } catch (err) {
          console.error(
            `[main] failed to resolve effective authority for ${employee.id}; falling back to role defaults:`,
            err,
          );
        }
        const specs: ToolSpec[] = [
          ...buildChatActionTools({
            companyId: company.id,
            actorId: employee.id,
            actorLevel: employee.level,
            employeesRepo,
            roleLookup: {
              listRoles: () => roleLoader.listRoles(),
            },
            bus,
          }),
        ];

        // Pre-filter at definition time so the model never sees denied tools.
        const allowedTools = mcpTools.filter((t) => {
          if (toolsDenied.includes(t.name)) return false;
          if (toolsAllowed.length > 0 && !toolsAllowed.includes(t.name)) return false;
          return true;
        });
        specs.push(
          ...allowedTools.map((t) => ({
            name: t.name,
            description: t.description ?? '',
            inputSchema: (t.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
            execute: async (args: Record<string, unknown>) => {
              const serverId = mcpHost.findServerForTool(t.name, company.id);
              if (!serverId) throw new Error(`No MCP server found for tool: ${t.name}`);

              const result = await mcpHost.callTool({
                companyId: company.id,
                serverId,
                toolName: t.name,
                toolArgs: args,
                runId: getRunId(),
                employeeId: employee.id,
                toolsAllowed,
                toolsDenied,
              });
              if (!result.success) {
                throw new Error(result.error ?? `Tool '${t.name}' failed`);
              }
              return result.output;
            },
          })),
        );
        if (specs.length === 0) return null;

        return {
          tools: buildProviderTools(specs),
          maxSteps: 5,
        };
      };

  runtime.orchestrator = buildOrchestrator({
    bus,
    messagesRepo,
    runsRepo,
    budgetGovernance: runtime.budgetGovernanceServiceInstance ?? undefined,
    employeesRepo,
    companiesRepo,
    threadsRepo,
    ticketsRepo,
    calcCost,
    resolveSystemPrompt: async ({ employee, company }) => {
      const rolePrompt = await roleLoader.resolveSystemPrompt({ employee, company });
      const skillBundle = await skillsService.materializePromptBundle({
        companyId: company.id,
        employeeId: employee.id,
      });
      const prompt =
        skillBundle.trim().length > 0
          ? `${rolePrompt}\n\n## Installed Skills\n\n${skillBundle}`
          : rolePrompt;
      return appendExecutionPolicy(prompt);
    },
    resolveProvider,
    resolveTools,
    resolveExecutionWorkspace: ({ employee }) => {
      const profile = runtimeProfilesService.getProfileForEmployee(employee.id);
      if (!profile?.enabled) return null;
      return getRuntimeConfigString(profile.config, 'workingDirectory');
    },
    vaultService,
    contextAssemblerService,
    contextPackerService,
    threadDigestService,
    runCheckpointService,
    // Settings → Memory, read per turn so a change applies to the next
    // turn. These rows used to feed only the renderer's pack preview.
    getContextMemorySettings: () => {
      const memory = settingsRepo.getMemory();
      return {
        targetTokenBudget: memory.defaultTargetTokenBudget,
        recentTurnLimit: memory.recentTurnLimit,
      };
    },
    slots: initialSlots,
    providerCaps: initialProviderCaps,
    userDataDir: userDataDir(),
  });
  recoverUnansweredDirectMessages({
    companiesRepo,
    threadsRepo,
    messagesRepo,
    employeesRepo,
    orchestrator: runtime.orchestrator,
    bus,
  });
  return runtime.orchestrator;
}

function getRuntimeConfigString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function recoverUnansweredDirectMessages(args: {
  companiesRepo: Repositories['companiesRepo'];
  threadsRepo: Repositories['threadsRepo'];
  messagesRepo: Repositories['messagesRepo'];
  employeesRepo: Repositories['employeesRepo'];
  orchestrator: Orchestrator;
  bus: EventBus;
}): void {
  for (const company of args.companiesRepo.list()) {
    if (company.status === 'archived') continue;
    for (const thread of args.threadsRepo.listByCompany(company.id)) {
      if (thread.kind !== 'dm') continue;
      const members = args.threadsRepo.listMembers(thread.id);
      const hasHuman = members.some(
        (member) => member.memberKind === 'user' && member.memberId === HUMAN_USER_ID,
      );
      if (!hasHuman) continue;
      const employeeMember = members.find((member) => member.memberKind === 'employee');
      if (!employeeMember) continue;
      const employee = args.employeesRepo.getById(employeeMember.memberId);
      if (
        !employee ||
        employee.companyId !== company.id ||
        employee.status === 'archived' ||
        employee.status === 'fired'
      ) {
        continue;
      }
      const rows = args.messagesRepo
        .listByThread(thread.id)
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt);
      const latest = rows.at(-1);
      if (
        !latest ||
        latest.authorKind !== 'user' ||
        latest.authorId !== HUMAN_USER_ID ||
        latest.content.trim().length === 0
      ) {
        continue;
      }
      void args.orchestrator
        .enqueueChat({
          threadId: thread.id,
          employeeId: employee.id,
          userMessageId: latest.id,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const refreshed = args.messagesRepo.listByThread(thread.id);
          const trigger = refreshed.find((row) => row.id === latest.id);
          const alreadyStarted =
            trigger !== undefined &&
            refreshed.some(
              (row) =>
                row.createdAt >= trigger.createdAt &&
                row.authorKind === 'employee' &&
                row.authorId === employee.id,
            );
          // The orchestrator already reported a turn it refused before start.
          if (!alreadyStarted && !isWorkFailureReported(err)) {
            args.bus.emit({
              type: 'work.failed',
              companyId: company.id,
              actorId: 'orchestrator',
              actorKind: 'orchestrator',
              payload: {
                threadId: thread.id,
                employeeId: employee.id,
                messageId: latest.id,
                error: message,
              },
            });
          }
          console.error(
            `[main] recovered chat turn failed for thread=${thread.id} ` +
              `employee=${employee.id} userMessage=${latest.id}:`,
            err,
          );
        });
    }
  }
}
