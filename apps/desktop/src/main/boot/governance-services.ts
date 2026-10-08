/**
 * Boot phase 5e — runtime profiles + sessions, the proactive heartbeat,
 * tickets, budget governance, the approval inbox (with delegated-ticket
 * pickup), routines, and company portability.
 *
 * Three things this phase wires are only built later in the boot sequence,
 * so they are reached lazily, at call time, never captured here as values:
 *
 *   - the orchestrator → `runtime.orchestrator`;
 *   - the routine ticket creator (needs the IPC handlers) →
 *     `deps.getRoutineTicketCreator()`;
 *   - the role loader → `deps.getRoleLoader()`.
 */

import { join } from 'node:path';

import { app } from 'electron';

import type { TeamXDb } from '../db/client.js';
import { userDataDir } from '../db/paths.js';
import { createAgentWakeupRequestsRepo } from '../db/repos/agent-wakeup-requests.js';
import { createPendingDelegationsRepo } from '../db/repos/pending-delegations.js';
import type { RuntimeProfilesRepo } from '../db/repos/runtime-profiles.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { HUMAN_USER_ID } from '../ipc/handlers.js';
import { createAgentWakeupQueue } from '../orchestrator/agent-wakeup-queue.js';
import { createHeartbeatService } from '../orchestrator/heartbeat-service.js';
import { createApprovalInboxService } from '../services/approval-inbox-service.js';
import { createBudgetGovernanceService } from '../services/budget-governance-service.js';
import { createCompanyPortabilityService } from '../services/company-portability-service.js';
import { createExternalRuntimeAdapters } from '../services/external-runtime-adapters.js';
import { getProvidersService } from '../services/providers.js';
import type { RoleLoader } from '../services/role-loader.js';
import {
  type RoutineServiceCreateTicketInput,
  createRoutineService,
} from '../services/routine-service.js';
import { createRuntimeAuditNormalizer } from '../services/runtime-audit-normalizer-service.js';
import { createRuntimeOperationsService } from '../services/runtime-operations-service.js';
import { createRuntimeProfilesService } from '../services/runtime-profiles-service.js';
import { createRuntimeSessionService } from '../services/runtime-session-service.js';
import { ensureSystemAgent, ensureSystemCopilot } from '../services/system-agent-bootstrap.js';

import type { PlatformServices } from './platform-services.js';
import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

export type RoutineTicketCreator = (
  input: RoutineServiceCreateTicketInput,
) => Promise<{ ticketId: string }>;

export interface GovernanceServicesDeps
  extends Pick<
      Repositories,
      | 'companiesRepo'
      | 'employeesRepo'
      | 'runtimeProfilesRepo'
      | 'runtimeSessionsRepo'
      | 'ticketCheckoutsRepo'
      | 'toolCallsRepo'
      | 'budgetsRepo'
      | 'runsRepo'
      | 'routinesRepo'
      | 'threadsRepo'
      | 'messagesRepo'
      | 'authorityRepo'
      | 'projectsRepo'
      | 'goalsRepo'
      | 'orgEdgesRepo'
      | 'extensionsRegistry'
      | 'extensionsRepo'
      | 'skillAssignmentsRepo'
    >,
    Pick<
      PlatformServices,
      'bus' | 'artifactService' | 'operatorAccessService' | 'skillsService' | 'secretsStore'
    > {
  db: TeamXDb;
  /** Live read: the creator is assigned once the IPC handlers exist. */
  getRoutineTicketCreator: () => RoutineTicketCreator | null;
  /** Live read: the role loader is built after this phase. */
  getRoleLoader: () => RoleLoader;
}

export type GovernanceServices = ReturnType<typeof bootGovernanceServices>;

export function bootGovernanceServices(deps: GovernanceServicesDeps) {
  const {
    db,
    companiesRepo,
    employeesRepo,
    runtimeProfilesRepo,
    runtimeSessionsRepo,
    ticketCheckoutsRepo,
    toolCallsRepo,
    budgetsRepo,
    runsRepo,
    routinesRepo,
    threadsRepo,
    messagesRepo,
    authorityRepo,
    projectsRepo,
    goalsRepo,
    orgEdgesRepo,
    extensionsRegistry,
    extensionsRepo,
    skillAssignmentsRepo,
    bus,
    artifactService,
    operatorAccessService,
    skillsService,
    secretsStore,
    getRoutineTicketCreator,
    getRoleLoader,
  } = deps;

  const providersService = getProvidersService();
  const runtimeProfilesService = createRuntimeProfilesService({
    runtimeProfilesRepo,
    employeesRepo,
    providersService,
  });
  ensureDefaultRuntimeProfileBindings({
    companiesRepo,
    employeesRepo,
    runtimeProfilesRepo,
  });
  const runtimeAuditNormalizer = createRuntimeAuditNormalizer({
    bus,
    toolCallsRepo,
    artifactService,
  });
  const runtimeSessionService = createRuntimeSessionService({
    runtimeSessionsRepo,
    runtimeAuditNormalizer,
  });
  const runtimeOperationsService = createRuntimeOperationsService({
    runtimeSessionService,
    ticketCheckoutsRepo,
  });

  // Proactive execution bridge: wake agents when routines complete or
  // tickets are assigned, then let the heartbeat loop process due work.
  const agentWakeupRequestsRepo = createAgentWakeupRequestsRepo(db);
  runtime.heartbeatServiceInstance = createHeartbeatService({
    agentWakeupRequestsRepo,
    employeesRepo,
    bus,
  });
  const agentWakeupQueueInstance = createAgentWakeupQueue({
    heartbeatService: runtime.heartbeatServiceInstance,
  });
  runtime.heartbeatServiceInstance.start(60 * 1000);
  const ticketsRepo = createTicketsRepo(db, agentWakeupQueueInstance);
  // C4 (audit 2026-05-07) — write-side amber gate holding table.
  const pendingDelegationsRepo = createPendingDelegationsRepo(db);

  runtime.budgetGovernanceServiceInstance = createBudgetGovernanceService({
    budgetsRepo,
    employeesRepo,
    runsRepo,
    ticketsRepo,
    routinesRepo,
    runtimeProfilesService,
    bus,
    operatorId: operatorAccessService.getLocalOwnerId(),
    orchestrator: {
      pauseCompany: async (companyId) => {
        if (!runtime.orchestrator) return;
        await runtime.orchestrator.pauseCompany(companyId);
      },
    },
  });
  const externalRuntimeAdapters = createExternalRuntimeAdapters({
    secretsStore,
    userDataDir: userDataDir(),
    runtimeSessionService,
    ticketCheckoutsRepo,
    runtimeAuditNormalizer,
    budgetAdmissionGate: runtime.budgetGovernanceServiceInstance,
  });
  /**
   * C4 (audit 2026-05-07) — shared "materialize delegated ticket"
   * helper. Both the approval-inbox-service (on operator approve) and
   * the agentic-loop write-side orchestrator seam use this to
   * provision a thread for the assigned ticket, emit the kickoff
   * message, and enqueue the assignee's first reply turn. Lazily
   * reads the mutable `runtime.orchestrator` so it's safe to declare
   * here (before `runtime.orchestrator = buildOrchestrator(...)` runs
   * in a later boot phase).
   */
  const materializeDelegatedTicket = async (args: {
    ticketId: string;
    employeeId: string;
    companyId: string;
    actorId: string;
    actorKind: string;
  }): Promise<{ threadId: string; triggerMessageId: string }> => {
    if (!runtime.orchestrator) {
      throw new Error('[delegation] orchestrator is unavailable for delegated ticket pickup');
    }
    const ticket = ticketsRepo.getById(args.ticketId);
    if (!ticket || ticket.companyId !== args.companyId) {
      throw new Error(
        `[delegation] delegated ticket "${args.ticketId}" is not available in company "${args.companyId}"`,
      );
    }
    const assignee = employeesRepo.getById(args.employeeId);
    if (!assignee || assignee.companyId !== args.companyId) {
      throw new Error(
        `[delegation] delegated assignee "${args.employeeId}" is not available in company "${args.companyId}"`,
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

    const actorRow = args.actorKind === 'employee' ? employeesRepo.getById(args.actorId) : null;
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
          `[delegation] delegated ticket pickup failed for ticket=${args.ticketId}:`,
          err,
        );
      });

    return { threadId, triggerMessageId };
  };

  runtime.approvalInboxServiceInstance = createApprovalInboxService({
    budgetsRepo,
    authorityRepo,
    artifactService,
    // C4 (audit 2026-05-07) — surface and materialize delegation
    // requests in the operator inbox.
    pendingDelegationsRepo,
    ticketsRepo,
    projectsRepo,
    bus,
    orchestrator: {
      queueDelegatedTicket: materializeDelegatedTicket,
    },
  });

  runtime.routineServiceInstance = createRoutineService({
    routinesRepo,
    companiesRepo,
    employeesRepo,
    bus,
    budgetGovernance: runtime.budgetGovernanceServiceInstance,
    artifactService,
    agentWakeupQueue: agentWakeupQueueInstance, // ✅ PROACTIVE EXECUTION BRIDGE
    createTicket: async (input) => {
      const routineTicketCreator = getRoutineTicketCreator();
      if (!routineTicketCreator) {
        throw new Error('[main] routine ticket creator is not wired yet');
      }
      return routineTicketCreator(input);
    },
  });

  const companyPortabilityService = createCompanyPortabilityService({
    companiesRepo,
    employeesRepo,
    orgEdgesRepo,
    goalsRepo,
    projectsRepo,
    ticketsRepo,
    runtimeProfilesService,
    runtimeProfilesRepo,
    routineService: runtime.routineServiceInstance,
    routinesRepo,
    budgetGovernanceService: runtime.budgetGovernanceServiceInstance,
    budgetsRepo,
    extensionsRegistry,
    extensionsRepo,
    skillsService,
    skillAssignmentsRepo,
    authorityRepo,
    operatorAccessService,
    ensureSystemForCompany: (companyId) => {
      const roleLoader = getRoleLoader();
      const agent = ensureSystemAgent({ db, companyId, roleLookup: roleLoader });
      const copilot = ensureSystemCopilot({ db, companyId, roleLookup: roleLoader });
      return {
        agentEmployeeId: agent.employeeId,
        copilotEmployeeId: copilot.employeeId,
        agentCreated: agent.created,
        copilotCreated: copilot.created,
      };
    },
    exportRootDir: join(userDataDir(), 'portability'),
    appVersion: app.getVersion(),
  });

  return {
    // Also published on `runtime`; these values are for construction-time
    // wiring in later phases. Closures that must see shutdown read `runtime`.
    budgetGovernanceService: runtime.budgetGovernanceServiceInstance,
    approvalInboxService: runtime.approvalInboxServiceInstance,
    routineService: runtime.routineServiceInstance,
    providersService,
    runtimeProfilesService,
    runtimeOperationsService,
    agentWakeupRequestsRepo,
    ticketsRepo,
    pendingDelegationsRepo,
    externalRuntimeAdapters,
    companyPortabilityService,
  };
}

function ensureDefaultRuntimeProfileBindings(args: {
  companiesRepo: Repositories['companiesRepo'];
  employeesRepo: Repositories['employeesRepo'];
  runtimeProfilesRepo: RuntimeProfilesRepo;
}): void {
  for (const company of args.companiesRepo.list()) {
    if (company.status === 'archived') continue;
    const profile = args.runtimeProfilesRepo
      .listByCompany(company.id)
      .find((row) => row.enabled && row.kind === 'teamx-internal');
    if (!profile) continue;

    for (const employee of args.employeesRepo.listVisibleByCompany(company.id)) {
      if (employee.status === 'archived' || employee.status === 'fired') continue;
      if (args.runtimeProfilesRepo.getBinding(company.id, employee.id)) continue;
      args.runtimeProfilesRepo.upsertBinding({
        companyId: company.id,
        employeeId: employee.id,
        runtimeProfileId: profile.id,
      });
    }
  }
}
