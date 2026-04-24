/**
 * IPC register — the electron-glue layer for the pure handlers in
 * `./handlers.ts`. Two responsibilities:
 *
 *   1. Mount each handler on `ipcMain.handle` against the channel name
 *      from the shared-types `IpcContract`. The Electron `invoke` /
 *      `handle` pair is the only IPC pattern Team-X uses for
 *      request/response — fire-and-forget signaling goes through the
 *      dashboard event channel below.
 *
 *   2. Subscribe a forwarder to the orchestrator's event bus that
 *      fans every `DashboardEvent` out to every live `BrowserWindow`
 *      via `webContents.send('events.dashboard', evt)`. This is the
 *      one-way push channel the renderer subscribes to via the
 *      preload bridge (T34) so the cockpit can update in real time.
 *
 * Why this file is intentionally tiny:
 *
 *   Everything interesting (request validation, repo coordination,
 *   row → public-shape mapping, fail-closed checks, fire-and-forget
 *   orchestrator wiring) lives in `handlers.ts` where it can be
 *   exhaustively unit-tested without electron. This file is just the
 *   wiring — three `ipcMain.handle` calls and one bus subscription —
 *   so it has zero unit tests by design. Integration coverage lands
 *   in the Playwright smoke test (T49) which boots a real Electron
 *   instance.
 *
 * Lifecycle:
 *
 *   `registerIpcHandlers` returns an `unregister` function that the
 *   main process invokes from `app.will-quit`. The unregister:
 *
 *     - removes every `ipcMain.handle` mapping (so a stray late
 *       invoke from a teardown sequence doesn't hit a ghost handler),
 *     - and detaches the bus subscriber (so the bus does not keep a
 *       dead reference to a `webContents` that has already been
 *       garbage collected).
 *
 *   The forwarder also defends against destroyed windows: a
 *   `webContents.send` on a destroyed `BrowserWindow` throws, and
 *   that throw must NOT cascade into the bus and break delivery to
 *   the rest of the windows. We pre-filter via `isDestroyed()` and
 *   wrap the `send` in try/catch as a belt-and-suspenders measure.
 */

import { BrowserWindow, ipcMain } from 'electron';

import type { MeetingMode } from '@team-x/shared-types';

import type { EventBus } from '../orchestrator/event-bus.js';
import type { IpcHandlers } from './handlers.js';

/**
 * Channel names — kept as a const tuple so the matching unregister
 * call can iterate them without re-typing the strings (and so a
 * future change to the contract has exactly one source of truth).
 *
 * Mirrors the channel keys in `@team-x/shared-types` `IpcContract`;
 * the typed preload bridge in T34 hands the renderer a wrapper that
 * uses these exact strings.
 */
const REQUEST_CHANNELS = [
  'companies.list',
  'companies.exportPackage',
  'companies.previewImportPackage',
  'companies.importPackage',
  'companies.listTemplates',
  'companies.installTemplate',
  'companies.archive',
  'companies.create',
  // Multi-company CRUD write-side (Phase 5.6 M-C step e; audit rows 10.13 + 10.15).
  // Both emit bus events per architectural invariant #11.
  'companies.update',
  'companies.delete',
  'employees.list',
  'operators.list',
  'operators.readiness',
  'operators.listInvites',
  'operators.createInvite',
  'operators.revokeInvite',
  'operators.acceptInvite',
  'runtimeProfiles.list',
  'runtimeProfiles.create',
  'runtimeProfiles.update',
  'runtimeProfiles.delete',
  'runtimeProfiles.bindEmployee',
  'runtimeProfiles.validate',
  'routines.list',
  'routines.create',
  'routines.update',
  'routines.delete',
  'routines.listRuns',
  'routines.runNow',
  'budgets.listPolicies',
  'budgets.createPolicy',
  'budgets.updatePolicy',
  'budgets.deletePolicy',
  'budgets.listLedger',
  'budgets.getOverview',
  'budgets.listApprovals',
  'approvals.list',
  'approvals.review',
  'artifacts.list',
  'memory.getThreadDigest',
  'memory.listRunCheckpoints',
  'memory.packThreadContext',
  'employees.create',
  'employees.fire',
  // Org chart write-side (Phase 2 — M9; restored Phase 5.6 M-C step d
  // per audit rows 2.19 + 2.20). Both emit bus events per invariant #11.
  'employees.promote',
  'employees.setManager',
  // Org chart (Phase 2 — M9; restored Phase 5.6 M-C step c per audit row 2.21)
  'orgchart.get',
  'chat.send',
  'chat.list',
  'chat.stop',
  'chat.resolveThread',
  'chat.listThreads',
  // Events / timeline (Phase 3 — M14)
  'events.list',
  // MCP management (Phase 2 — M10)
  'mcp.list',
  'mcp.toggle',
  'mcp.addServer',
  'mcp.removeServer',
  'mcp.testConnection',
  'extensions.list',
  'authority.list',
  'authority.listRequests',
  'authority.create',
  'authority.delete',
  'authority.reviewRequest',
  'authority.getEffective',
  // Goals management (Phase 3 — M15)
  'goals.create',
  'goals.update',
  'goals.list',
  'goals.get',
  'goals.delete',
  // Projects management (Phase 3 — M15)
  'projects.create',
  'projects.update',
  'projects.list',
  'projects.get',
  'projects.delete',
  'projects.linkTicket',
  'projects.unlinkTicket',
  // Meeting management (Phase 3 — M16)
  'meetings.call',
  'meetings.end',
  'meetings.interject',
  'meetings.list',
  'meetings.get',
  // Telemetry (Phase 3 — M17)
  'telemetry.companyStats',
  'telemetry.dailyUsage',
  'telemetry.employeeStats',
  'telemetry.recentRuns',
  'telemetry.costBreakdown',
  // Settings (Phase 3 — M19)
  'settings.getRuntime',
  'settings.setRuntime',
  'settings.getPrivacy',
  'settings.setPrivacy',
  'settings.getConcurrency',
  'settings.setConcurrency',
  'settings.getExtensions',
  'settings.setExtensions',
  'settings.getMemory',
  'settings.setMemory',
  'settings.getRagConfig',
  'settings.setRagConfig',
  // Agentic loop (Phase 5 — M31)
  'settings.getAgentic',
  'settings.setAgentic',
  // Task planner (Phase 5 — M32)
  'settings.getPlanner',
  'settings.setPlanner',
  'settings.getCopilot',
  'settings.setCopilot',
  'settings.getCopilotWeights',
  'settings.setCopilotWeights',
  // Provider management (Phase 3 — M18)
  'providers.list',
  'providers.add',
  'providers.update',
  'providers.remove',
  'providers.testConnection',
  'providers.listModels',
  // Vault management (Phase 4 — M21)
  'vault.upload',
  'vault.download',
  'vault.list',
  'vault.search',
  'vault.delete',
  'vault.verify',
  'vault.stats',
  // Ticket management (Phase 2 — M12)
  'tickets.create',
  'tickets.update',
  'tickets.assign',
  'tickets.close',
  'tickets.reopen',
  'tickets.addComment',
  'tickets.list',
  'tickets.get',
  // Backup/restore (Phase 4 — M23)
  'backup.create',
  'backup.restore',
  'backup.list',
  // Audit log (Phase 4 — M24)
  'audit.list',
  'audit.stats',
  'audit.export',
  // Copilot insight export (Phase 6 — M40)
  'copilot.export',
  // Ticket attachments (Phase 4 — M22)
  'tickets.attachFile',
  'tickets.detachFile',
  'tickets.listAttachments',
  // Updater (Phase 4 — M25)
  'updater.check',
  'updater.install',
  // RAG management (Phase 5 — M29)
  'rag.stats',
  'rag.rebuildAll',
  'rag.deleteForCompany',
  // Command palette (Phase 5 — M30)
  'command.parse',
  'command.execute',
  'command.history',
  'command.suggest',
  // Agentic-loop cancellation (Phase 5 — M31 T6)
  'command.stop',
  // Agentic-loop run snapshot (Phase 5 — M32 T0 / F1)
  'command.getRunSnapshot',
  // Copilot service (Phase 5 — M33 T5)
  'copilot.insights',
  'copilot.dismiss',
  'copilot.ask',
  'copilot.configure',
] as const;

/** Channel name for the one-way bus → renderer fan-out. */
const EVENT_CHANNEL = 'events.dashboard';

/**
 * Wire `handlers` into Electron's IPC and start forwarding events
 * from `bus` to every live BrowserWindow. Returns a teardown
 * function — call it from `app.will-quit` to clean up handler
 * mappings and detach the bus subscription.
 */
export function registerIpcHandlers(handlers: IpcHandlers, bus: EventBus): () => void {
  ipcMain.handle('companies.list', async () => {
    return handlers.companiesList();
  });

  ipcMain.handle(
    'companies.exportPackage',
    async (_event, request: import('@team-x/shared-types').ExportCompanyPackageRequest) => {
      return handlers.companiesExportPackage(request);
    },
  );

  ipcMain.handle(
    'companies.previewImportPackage',
    async (_event, request: import('@team-x/shared-types').PreviewCompanyPackageImportRequest) => {
      return handlers.companiesPreviewImportPackage(request);
    },
  );

  ipcMain.handle(
    'companies.importPackage',
    async (_event, request: import('@team-x/shared-types').ImportCompanyPackageRequest) => {
      return handlers.companiesImportPackage(request);
    },
  );

  ipcMain.handle(
    'companies.listTemplates',
    async (_event, request: import('@team-x/shared-types').ListCompanyTemplatesRequest) => {
      return handlers.companiesListTemplates(request);
    },
  );

  ipcMain.handle(
    'companies.installTemplate',
    async (_event, request: import('@team-x/shared-types').InstallCompanyTemplateRequest) => {
      return handlers.companiesInstallTemplate(request);
    },
  );

  ipcMain.handle('companies.archive', async (_event, request: { companyId: string }) => {
    return handlers.companiesArchive(request);
  });

  // companies.create — Phase 5.6 M-C step b — restores Cluster A multi-company
  // CRUD (audit row 10.12). Handler validates input + seeds the system-agent /
  // system-copilot pair atomically + emits `company.created`.
  ipcMain.handle(
    'companies.create',
    async (_event, request: import('@team-x/shared-types').CompaniesCreateRequest) => {
      return handlers.companiesCreate(request);
    },
  );

  // companies.update / companies.delete — Phase 5.6 M-C step e — restores
  // Cluster A multi-company CRUD (audit rows 10.13 + 10.15). update:
  // assertCompanyActive + per-field validation + `company.updated` emit.
  // delete: quiesce copilot pipeline + 15-table transactional sweep +
  // `company.deleted` emit (invariant #11 satisfied on both).
  ipcMain.handle(
    'companies.update',
    async (_event, request: import('@team-x/shared-types').CompaniesUpdateRequest) => {
      return handlers.companiesUpdate(request);
    },
  );

  ipcMain.handle(
    'companies.delete',
    async (_event, request: import('@team-x/shared-types').CompaniesDeleteRequest) => {
      return handlers.companiesDelete(request);
    },
  );

  ipcMain.handle('employees.list', async (_event, request: { companyId: string }) => {
    return handlers.employeesList(request);
  });

  ipcMain.handle('operators.list', async (_event, request: { companyId: string }) => {
    return handlers.operatorsList(request);
  });

  ipcMain.handle('operators.readiness', async (_event, request: { companyId: string }) => {
    return handlers.operatorsReadiness(request);
  });

  ipcMain.handle(
    'operators.listInvites',
    async (_event, request: import('@team-x/shared-types').ListOperatorInvitesRequest) => {
      return handlers.operatorsListInvites(request);
    },
  );

  ipcMain.handle(
    'operators.createInvite',
    async (_event, request: import('@team-x/shared-types').CreateOperatorInviteRequest) => {
      return handlers.operatorsCreateInvite(request);
    },
  );

  ipcMain.handle(
    'operators.revokeInvite',
    async (_event, request: import('@team-x/shared-types').RevokeOperatorInviteRequest) => {
      return handlers.operatorsRevokeInvite(request);
    },
  );

  ipcMain.handle(
    'operators.acceptInvite',
    async (_event, request: import('@team-x/shared-types').AcceptOperatorInviteRequest) => {
      return handlers.operatorsAcceptInvite(request);
    },
  );

  ipcMain.handle('runtimeProfiles.list', async (_event, request: { companyId: string }) => {
    return handlers.runtimeProfilesList(request);
  });

  ipcMain.handle(
    'runtimeProfiles.create',
    async (_event, request: import('@team-x/shared-types').CreateRuntimeProfileRequest) => {
      return handlers.runtimeProfilesCreate(request);
    },
  );

  ipcMain.handle(
    'runtimeProfiles.update',
    async (_event, request: import('@team-x/shared-types').UpdateRuntimeProfileRequest) => {
      return handlers.runtimeProfilesUpdate(request);
    },
  );

  ipcMain.handle('runtimeProfiles.delete', async (_event, request: { profileId: string }) => {
    return handlers.runtimeProfilesDelete(request);
  });

  ipcMain.handle(
    'runtimeProfiles.bindEmployee',
    async (_event, request: import('@team-x/shared-types').BindEmployeeRuntimeProfileRequest) => {
      return handlers.runtimeProfilesBindEmployee(request);
    },
  );

  ipcMain.handle(
    'runtimeProfiles.validate',
    async (_event, request: import('@team-x/shared-types').ValidateRuntimeProfileRequest) => {
      return handlers.runtimeProfilesValidate(request);
    },
  );

  ipcMain.handle('routines.list', async (_event, request: { companyId: string }) => {
    return handlers.routinesList(request);
  });

  ipcMain.handle(
    'routines.create',
    async (_event, request: import('@team-x/shared-types').CreateRoutineRequest) => {
      return handlers.routinesCreate(request);
    },
  );

  ipcMain.handle(
    'routines.update',
    async (_event, request: import('@team-x/shared-types').UpdateRoutineRequest) => {
      return handlers.routinesUpdate(request);
    },
  );

  ipcMain.handle('routines.delete', async (_event, request: { routineId: string }) => {
    return handlers.routinesDelete(request);
  });

  ipcMain.handle(
    'routines.listRuns',
    async (_event, request: import('@team-x/shared-types').ListRoutineRunsRequest) => {
      return handlers.routinesListRuns(request);
    },
  );

  ipcMain.handle(
    'routines.runNow',
    async (_event, request: import('@team-x/shared-types').RunRoutineNowRequest) => {
      return handlers.routinesRunNow(request);
    },
  );

  ipcMain.handle(
    'budgets.listPolicies',
    async (_event, request: import('@team-x/shared-types').ListBudgetPoliciesRequest) => {
      return handlers.budgetsListPolicies(request);
    },
  );

  ipcMain.handle(
    'budgets.createPolicy',
    async (_event, request: import('@team-x/shared-types').CreateBudgetPolicyRequest) => {
      return handlers.budgetsCreatePolicy(request);
    },
  );

  ipcMain.handle(
    'budgets.updatePolicy',
    async (_event, request: import('@team-x/shared-types').UpdateBudgetPolicyRequest) => {
      return handlers.budgetsUpdatePolicy(request);
    },
  );

  ipcMain.handle(
    'budgets.deletePolicy',
    async (_event, request: import('@team-x/shared-types').DeleteBudgetPolicyRequest) => {
      return handlers.budgetsDeletePolicy(request);
    },
  );

  ipcMain.handle(
    'budgets.listLedger',
    async (_event, request: import('@team-x/shared-types').ListBudgetLedgerEntriesRequest) => {
      return handlers.budgetsListLedger(request);
    },
  );

  ipcMain.handle(
    'budgets.getOverview',
    async (_event, request: import('@team-x/shared-types').GetBudgetOverviewRequest) => {
      return handlers.budgetsGetOverview(request);
    },
  );

  ipcMain.handle(
    'budgets.listApprovals',
    async (_event, request: import('@team-x/shared-types').ListApprovalItemsRequest) => {
      return handlers.budgetsListApprovals(request);
    },
  );

  ipcMain.handle(
    'approvals.list',
    async (_event, request: import('@team-x/shared-types').ListApprovalItemsRequest) => {
      return handlers.approvalsList(request);
    },
  );

  ipcMain.handle(
    'approvals.review',
    async (_event, request: import('@team-x/shared-types').ReviewApprovalItemRequest) => {
      return handlers.approvalsReview(request);
    },
  );

  ipcMain.handle(
    'artifacts.list',
    async (_event, request: import('@team-x/shared-types').ListArtifactsRequest) => {
      return handlers.artifactsList(request);
    },
  );

  ipcMain.handle(
    'memory.getThreadDigest',
    async (_event, request: import('@team-x/shared-types').GetThreadDigestRequest) => {
      return handlers.memoryGetThreadDigest(request);
    },
  );

  ipcMain.handle(
    'memory.listRunCheckpoints',
    async (_event, request: import('@team-x/shared-types').ListRunCheckpointsRequest) => {
      return handlers.memoryListRunCheckpoints(request);
    },
  );

  ipcMain.handle(
    'memory.packThreadContext',
    async (_event, request: import('@team-x/shared-types').PackThreadContextRequest) => {
      return handlers.memoryPackThreadContext(request);
    },
  );

  ipcMain.handle(
    'employees.create',
    async (_event, request: { companyId: string; roleId: string; name: string }) => {
      return handlers.employeesCreate(request);
    },
  );

  ipcMain.handle('employees.fire', async (_event, request: { employeeId: string }) => {
    return handlers.employeesFire(request);
  });

  // Org chart write-side handlers (Phase 2 — M9; restored Phase 5.6 M-C step d).
  // promote: atomic role swap; setManager: upsert / clear org-edge with
  // cycle rejection. Both emit `employee.*` bus events per invariant #11.
  ipcMain.handle(
    'employees.promote',
    async (_event, request: import('@team-x/shared-types').EmployeesPromoteRequest) => {
      return handlers.employeesPromote(request);
    },
  );

  ipcMain.handle(
    'employees.setManager',
    async (_event, request: import('@team-x/shared-types').EmployeesSetManagerRequest) => {
      return handlers.employeesSetManager(request);
    },
  );

  // Org chart handler (Phase 2 — M9; restored Phase 5.6 M-C step c).
  // Returns the full projection (employees + edges + rootIds) in one round-trip.
  ipcMain.handle('orgchart.get', async (_event, request: { companyId: string }) => {
    return handlers.orgchartGet(request);
  });

  ipcMain.handle(
    'chat.send',
    async (_event, request: { threadId: string; employeeId: string; content: string }) => {
      return handlers.chatSend(request);
    },
  );

  ipcMain.handle('chat.list', async (_event, request: { threadId: string }) => {
    return handlers.chatList(request);
  });

  ipcMain.handle('chat.stop', async (_event, request: { threadId: string }) => {
    return handlers.chatStop(request);
  });

  ipcMain.handle('chat.resolveThread', async (_event, request: { employeeId: string }) => {
    return handlers.chatResolveThread(request);
  });

  ipcMain.handle('chat.listThreads', async (_event, request: { companyId: string }) => {
    return handlers.chatListThreads(request);
  });

  // Events / timeline handler (Phase 3 — M14)
  ipcMain.handle(
    'events.list',
    async (_event, request: { companyId: string; cursor?: number; limit?: number }) => {
      return handlers.eventsList(request);
    },
  );

  // MCP management handlers (Phase 2 — M10)
  ipcMain.handle('mcp.list', async (_event, request: { companyId: string }) => {
    return handlers.mcpList(request);
  });

  ipcMain.handle('mcp.listTemplates', async (_event, request: { companyId: string }) => {
    return handlers.mcpListTemplates(request);
  });

  ipcMain.handle('mcp.toggle', async (_event, request: { serverId: string; enabled: boolean }) => {
    return handlers.mcpToggle(request);
  });

  ipcMain.handle(
    'mcp.addServer',
    async (
      _event,
      request: {
        companyId: string | null;
        name: string;
        transport: 'stdio' | 'sse';
        configJson: string;
      },
    ) => {
      return handlers.mcpAddServer(request);
    },
  );

  ipcMain.handle(
    'mcp.installTemplate',
    async (_event, request: { companyId: string; templateId: string }) => {
      return handlers.mcpInstallTemplate(request);
    },
  );

  ipcMain.handle('mcp.removeServer', async (_event, request: { serverId: string }) => {
    return handlers.mcpRemoveServer(request);
  });

  ipcMain.handle(
    'mcp.testConnection',
    async (_event, request: { transport: 'stdio' | 'sse'; configJson: string }) => {
      return handlers.mcpTestConnection(request);
    },
  );

  ipcMain.handle('extensions.list', async (_event, request: { companyId: string }) => {
    return handlers.extensionsList(request);
  });

  ipcMain.handle(
    'extensions.installLocalSkill',
    async (_event, request: { companyId: string; folderPath: string }) => {
      return handlers.extensionsInstallLocalSkill(request);
    },
  );

  ipcMain.handle(
    'extensions.installGithubSkill',
    async (_event, request: { companyId: string; sourceUrl: string }) => {
      return handlers.extensionsInstallGithubSkill(request);
    },
  );

  ipcMain.handle(
    'extensions.listSkillAssignments',
    async (_event, request: { companyId: string }) => {
      return handlers.extensionsListSkillAssignments(request);
    },
  );

  ipcMain.handle(
    'extensions.upsertSkillAssignment',
    async (
      _event,
      request: {
        companyId: string;
        extensionId: string;
        employeeId?: string | null;
        enabled: boolean;
      },
    ) => {
      return handlers.extensionsUpsertSkillAssignment(request);
    },
  );

  ipcMain.handle(
    'extensions.deleteSkillAssignment',
    async (_event, request: { assignmentId: string }) => {
      return handlers.extensionsDeleteSkillAssignment(request);
    },
  );

  ipcMain.handle(
    'authority.list',
    async (_event, request: { companyId: string; employeeId?: string | null }) => {
      return handlers.authorityList(request);
    },
  );

  ipcMain.handle(
    'authority.listRequests',
    async (_event, request: import('@team-x/shared-types').ListAuthorityRequestsRequest) => {
      return handlers.authorityListRequests(request);
    },
  );

  ipcMain.handle(
    'authority.create',
    async (_event, request: import('@team-x/shared-types').CreateAuthorityGrantRequest) => {
      return handlers.authorityCreate(request);
    },
  );

  ipcMain.handle('authority.delete', async (_event, request: { grantId: string }) => {
    return handlers.authorityDelete(request);
  });

  ipcMain.handle(
    'authority.reviewRequest',
    async (_event, request: import('@team-x/shared-types').ReviewAuthorityRequestRequest) => {
      return handlers.authorityReviewRequest(request);
    },
  );

  ipcMain.handle(
    'authority.getEffective',
    async (_event, request: import('@team-x/shared-types').GetEffectiveAuthorityRequest) => {
      return handlers.authorityGetEffective(request);
    },
  );

  // Goals management handlers (Phase 3 — M15)
  ipcMain.handle(
    'goals.create',
    async (
      _event,
      request: {
        companyId: string;
        title: string;
        description?: string;
        targetDate?: number | null;
      },
    ) => {
      return handlers.goalsCreate(request);
    },
  );

  ipcMain.handle(
    'goals.update',
    async (
      _event,
      request: {
        goalId: string;
        title?: string;
        description?: string;
        status?: string;
        progressPct?: number;
        targetDate?: number | null;
      },
    ) => {
      return handlers.goalsUpdate(request);
    },
  );

  ipcMain.handle('goals.list', async (_event, request: { companyId: string }) => {
    return handlers.goalsList(request);
  });

  ipcMain.handle('goals.get', async (_event, request: { goalId: string }) => {
    return handlers.goalsGet(request);
  });

  ipcMain.handle('goals.delete', async (_event, request: { goalId: string }) => {
    return handlers.goalsDelete(request);
  });

  // Projects management handlers (Phase 3 — M15)
  ipcMain.handle(
    'projects.create',
    async (
      _event,
      request: {
        companyId: string;
        goalId?: string | null;
        title: string;
        description?: string;
        leadId?: string | null;
        priority?: string;
      },
    ) => {
      return handlers.projectsCreate(request);
    },
  );

  ipcMain.handle(
    'projects.update',
    async (
      _event,
      request: {
        projectId: string;
        title?: string;
        description?: string;
        status?: string;
        goalId?: string | null;
        leadId?: string | null;
        priority?: string;
      },
    ) => {
      return handlers.projectsUpdate(request);
    },
  );

  ipcMain.handle('projects.list', async (_event, request: { companyId: string }) => {
    return handlers.projectsList(request);
  });

  ipcMain.handle('projects.get', async (_event, request: { projectId: string }) => {
    return handlers.projectsGet(request);
  });

  ipcMain.handle('projects.delete', async (_event, request: { projectId: string }) => {
    return handlers.projectsDelete(request);
  });

  ipcMain.handle(
    'projects.linkTicket',
    async (_event, request: { projectId: string; ticketId: string }) => {
      return handlers.projectsLinkTicket(request);
    },
  );

  ipcMain.handle(
    'projects.unlinkTicket',
    async (_event, request: { projectId: string; ticketId: string }) => {
      return handlers.projectsUnlinkTicket(request);
    },
  );

  // Meeting management handlers (Phase 3 — M16)
  ipcMain.handle(
    'meetings.call',
    async (
      _event,
      request: {
        companyId: string;
        chairId: string;
        attendeeIds: string[];
        agenda: string;
        mode?: string;
      },
    ) => {
      return handlers.meetingsCall({
        ...request,
        mode: request.mode as MeetingMode | undefined,
      });
    },
  );

  ipcMain.handle('meetings.end', async (_event, request: { meetingId: string }) => {
    return handlers.meetingsEnd(request);
  });

  ipcMain.handle(
    'meetings.interject',
    async (_event, request: { meetingId: string; content: string }) => {
      return handlers.meetingsInterject(request);
    },
  );

  ipcMain.handle('meetings.list', async (_event, request: { companyId: string }) => {
    return handlers.meetingsList(request);
  });

  ipcMain.handle('meetings.get', async (_event, request: { meetingId: string }) => {
    return handlers.meetingsGet(request);
  });

  // Telemetry handlers (Phase 3 — M17)
  ipcMain.handle('telemetry.companyStats', async (_event, request: { companyId: string }) => {
    return handlers.telemetryCompanyStats(request);
  });

  ipcMain.handle(
    'telemetry.dailyUsage',
    async (_event, request: { companyId: string; fromMs: number; toMs: number }) => {
      return handlers.telemetryDailyUsage(request);
    },
  );

  ipcMain.handle('telemetry.employeeStats', async (_event, request: { companyId: string }) => {
    return handlers.telemetryEmployeeStats(request);
  });

  ipcMain.handle(
    'telemetry.recentRuns',
    async (_event, request: import('@team-x/shared-types').TelemetryRecentRunsRequest) => {
      return handlers.telemetryRecentRuns(request);
    },
  );

  ipcMain.handle(
    'telemetry.costBreakdown',
    async (_event, request: { companyId: string; fromMs?: number; toMs?: number }) => {
      return handlers.telemetryCostBreakdown(request);
    },
  );

  // Settings handlers (Phase 3 — M19)
  ipcMain.handle('settings.getRuntime', async () => {
    return handlers.settingsGetRuntime();
  });

  ipcMain.handle('settings.setRuntime', async (_event, request: { strategy: string }) => {
    return handlers.settingsSetRuntime(
      request as import('@team-x/shared-types').SettingsSetRuntimeRequest,
    );
  });

  ipcMain.handle('settings.getPrivacy', async () => {
    return handlers.settingsGetPrivacy();
  });

  ipcMain.handle('settings.setPrivacy', async (_event, request: { maxTier: string }) => {
    return handlers.settingsSetPrivacy(
      request as import('@team-x/shared-types').SettingsSetPrivacyRequest,
    );
  });

  ipcMain.handle('settings.getConcurrency', async () => {
    return handlers.settingsGetConcurrency();
  });

  ipcMain.handle(
    'settings.setConcurrency',
    async (
      _event,
      request: { orchestratorSlots?: number; providerCaps?: Record<string, number> },
    ) => {
      return handlers.settingsSetConcurrency(request);
    },
  );

  ipcMain.handle('settings.getExtensions', async () => {
    return handlers.settingsGetExtensions();
  });

  ipcMain.handle(
    'settings.setExtensions',
    async (_event, request: import('@team-x/shared-types').SettingsSetExtensionsRequest) => {
      return handlers.settingsSetExtensions(request);
    },
  );

  ipcMain.handle('settings.getMemory', async () => {
    return handlers.settingsGetMemory();
  });

  ipcMain.handle(
    'settings.setMemory',
    async (_event, request: import('@team-x/shared-types').SettingsSetMemoryRequest) => {
      return handlers.settingsSetMemory(request);
    },
  );

  // RAG configuration handlers (Phase 5 — M29)
  ipcMain.handle('settings.getRagConfig', async () => {
    return handlers.settingsGetRagConfig();
  });

  ipcMain.handle(
    'settings.setRagConfig',
    async (_event, request: import('@team-x/shared-types').SettingsSetRagConfigRequest) => {
      return handlers.settingsSetRagConfig(request);
    },
  );

  // Agentic loop handlers (Phase 5 — M31)
  ipcMain.handle('settings.getAgentic', async () => {
    return handlers.settingsGetAgentic();
  });

  ipcMain.handle(
    'settings.setAgentic',
    async (_event, request: import('@team-x/shared-types').SettingsSetAgenticRequest) => {
      return handlers.settingsSetAgentic(request);
    },
  );

  // Task planner handlers (Phase 5 — M32)
  ipcMain.handle('settings.getPlanner', async () => {
    return handlers.settingsGetPlanner();
  });

  ipcMain.handle(
    'settings.setPlanner',
    async (_event, request: import('@team-x/shared-types').SettingsSetPlannerRequest) => {
      return handlers.settingsSetPlanner(request);
    },
  );

  // Copilot service handlers (Phase 5 — M33 T7)
  ipcMain.handle('settings.getCopilot', async () => {
    return handlers.settingsGetCopilot();
  });

  ipcMain.handle(
    'settings.setCopilot',
    async (_event, request: import('@team-x/shared-types').SettingsSetCopilotRequest) => {
      return handlers.settingsSetCopilot(request);
    },
  );

  ipcMain.handle(
    'settings.getCopilotWeights',
    async (_event, request: import('@team-x/shared-types').SettingsGetCopilotWeightsRequest) => {
      return handlers.settingsGetCopilotWeights(request);
    },
  );

  ipcMain.handle(
    'settings.setCopilotWeights',
    async (_event, request: import('@team-x/shared-types').SettingsSetCopilotWeightsRequest) => {
      return handlers.settingsSetCopilotWeights(request);
    },
  );

  // Provider management handlers (Phase 3 — M18)
  ipcMain.handle('providers.list', async () => {
    return handlers.providersList();
  });

  ipcMain.handle(
    'providers.add',
    async (
      _event,
      request: {
        name: string;
        kind: string;
        privacyTier: string;
        configJson?: string;
        apiKey?: string;
      },
    ) => {
      return handlers.providersAdd(request as import('@team-x/shared-types').AddProviderRequest);
    },
  );

  ipcMain.handle(
    'providers.update',
    async (
      _event,
      request: {
        providerId: string;
        name?: string;
        enabled?: boolean;
        configJson?: string;
        apiKey?: string;
      },
    ) => {
      return handlers.providersUpdate(request);
    },
  );

  ipcMain.handle('providers.remove', async (_event, request: { providerId: string }) => {
    return handlers.providersRemove(request);
  });

  ipcMain.handle('providers.testConnection', async (_event, request: { providerId: string }) => {
    return handlers.providersTestConnection(request);
  });

  ipcMain.handle('providers.listModels', async (_event, request: { providerId: string }) => {
    return handlers.providersListModels(request);
  });

  // Vault management handlers (Phase 4 — M21)
  ipcMain.handle(
    'vault.upload',
    async (_event, request: { companyId: string; sourcePath: string; tags?: string[] }) => {
      return handlers.vaultUpload(request);
    },
  );

  ipcMain.handle('vault.download', async (_event, request: { fileId: string }) => {
    return handlers.vaultDownload(request);
  });

  ipcMain.handle('vault.list', async (_event, request: { companyId: string }) => {
    return handlers.vaultList(request);
  });

  ipcMain.handle('vault.search', async (_event, request: { companyId: string; query: string }) => {
    return handlers.vaultSearch(request);
  });

  ipcMain.handle('vault.delete', async (_event, request: { fileId: string }) => {
    return handlers.vaultDelete(request);
  });

  ipcMain.handle('vault.verify', async (_event, request: { fileId: string }) => {
    return handlers.vaultVerify(request);
  });

  ipcMain.handle('vault.stats', async (_event, request: { companyId: string }) => {
    return handlers.vaultStats(request);
  });

  // Backup/restore handlers (Phase 4 — M23)
  ipcMain.handle('backup.create', async (_event, request: { destination?: string }) => {
    return handlers.backupCreate(request ?? {});
  });

  ipcMain.handle('backup.restore', async (_event, request: { backupPath: string }) => {
    return handlers.backupRestore(request);
  });

  ipcMain.handle('backup.list', async () => {
    return handlers.backupList();
  });

  // Audit log handlers (Phase 4 — M24)
  ipcMain.handle(
    'audit.list',
    async (
      _event,
      request: {
        companyId: string;
        eventTypes?: string[];
        actorId?: string;
        fromMs?: number;
        toMs?: number;
        limit?: number;
        offset?: number;
      },
    ) => {
      return handlers.auditList(request);
    },
  );

  ipcMain.handle('audit.stats', async (_event, request: { companyId: string }) => {
    return handlers.auditStats(request);
  });

  ipcMain.handle(
    'audit.export',
    async (
      _event,
      request: {
        filter: {
          companyId: string;
          eventTypes?: string[];
          actorId?: string;
          fromMs?: number;
          toMs?: number;
        };
        format: 'csv' | 'json';
      },
    ) => {
      return handlers.auditExport(request);
    },
  );

  ipcMain.handle(
    'copilot.export',
    async (_event, request: import('@team-x/shared-types').CopilotExportRequest) => {
      return handlers.copilotExport(request);
    },
  );

  // Ticket management handlers (Phase 2 — M12)
  ipcMain.handle(
    'tickets.create',
    async (
      _event,
      request: {
        companyId: string;
        title: string;
        description?: string;
        priority?: string;
        assigneeId?: string;
        labelsJson?: string;
        slaHours?: number;
        dueAt?: number;
      },
    ) => {
      return handlers.ticketsCreate(request);
    },
  );

  ipcMain.handle(
    'tickets.update',
    async (
      _event,
      request: {
        ticketId: string;
        title?: string;
        description?: string;
        priority?: string;
        status?: string;
        labelsJson?: string;
        slaHours?: number | null;
        dueAt?: number | null;
      },
    ) => {
      return handlers.ticketsUpdate(request);
    },
  );

  ipcMain.handle(
    'tickets.assign',
    async (_event, request: { ticketId: string; assigneeId: string }) => {
      return handlers.ticketsAssign(request);
    },
  );

  ipcMain.handle('tickets.close', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsClose(request);
  });

  ipcMain.handle('tickets.reopen', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsReopen(request);
  });

  ipcMain.handle(
    'tickets.addComment',
    async (_event, request: { ticketId: string; content: string }) => {
      return handlers.ticketsAddComment(request);
    },
  );

  ipcMain.handle('tickets.list', async (_event, request: { companyId: string }) => {
    return handlers.ticketsList(request);
  });

  ipcMain.handle('tickets.get', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsGet(request);
  });

  // Ticket attachment handlers (Phase 4 — M22)
  ipcMain.handle(
    'tickets.attachFile',
    async (_event, request: { ticketId: string; fileId: string }) => {
      return handlers.ticketsAttachFile(request);
    },
  );

  ipcMain.handle(
    'tickets.detachFile',
    async (_event, request: { ticketId: string; fileId: string }) => {
      return handlers.ticketsDetachFile(request);
    },
  );

  ipcMain.handle('tickets.listAttachments', async (_event, request: { ticketId: string }) => {
    return handlers.ticketsListAttachments(request);
  });

  // Updater handlers (Phase 4 — M25)
  ipcMain.handle('updater.check', async () => {
    return handlers.updaterCheck();
  });

  ipcMain.handle('updater.install', async () => {
    return handlers.updaterInstall();
  });

  // Bus → renderer forwarder. The bus is synchronous fan-out, so the
  // listener runs on the same tick as the orchestrator's `emit` call —
  // tokens reach the renderer with no extra event-loop hop.
  const unsubscribe = bus.subscribe((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(EVENT_CHANNEL, event);
      } catch (err) {
        // A `webContents.send` failure on one window must not break
        // delivery to the others, and must not propagate back into
        // the bus (where the orchestrator would see a thrown listener).
        // Log so the failure is not silent and move on.
        console.error(
          `[ipc/register] failed to forward event ${event.id} (${event.type}) to window ${win.id}:`,
          err,
        );
      }
    }
  });

  return function unregister(): void {
    for (const channel of REQUEST_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    unsubscribe();
  };
}
