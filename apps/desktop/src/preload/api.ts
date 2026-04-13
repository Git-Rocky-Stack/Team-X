/**
 * Preload API factory — pure function that builds the `TeamXApi`
 * surface the renderer consumes as `window.teamx`.
 *
 * The split between this file and `./index.ts` is the same pattern
 * the rest of the codebase uses: pure factories for testable logic,
 * thin electron-bound wrappers for the actual runtime wiring.
 *
 * `./index.ts` is the one line of code that actually touches
 * `contextBridge.exposeInMainWorld`. Everything that maps method
 * signatures to ipc channel names, wraps `ipcRenderer.on` in an
 * unsubscribe pattern, and narrows the request/response shapes lives
 * here and can be unit-tested with a hand-rolled fake that
 * structurally satisfies `IpcRendererLike`.
 *
 * Why `IpcRendererLike` instead of importing `IpcRenderer` from
 * `'electron'`:
 *
 *   The preload runs in a Chromium isolated world with `contextBridge`,
 *   not in Node, so pulling in the full `electron` module at test time
 *   is expensive and requires the Electron ABI binary. Vitest runs in
 *   plain Node. Declaring our own structural subset lets us:
 *     - test the factory with `{ invoke: vi.fn(), on: vi.fn(), ... }`,
 *     - verify channel names and argument shapes pin exactly, and
 *     - keep electron entirely out of the test runner's dependency
 *       graph.
 *
 *   The real `ipcRenderer` object exported from `'electron'`
 *   structurally satisfies `IpcRendererLike` with zero casts, so
 *   `./index.ts` just does `buildTeamXApi(ipcRenderer)`.
 *
 * Method signature philosophy is documented on the `TeamXApi`
 * interface in `@team-x/shared-types` — positional args where there
 * is exactly one, object literals where there are more.
 */

import type {
  AddMcpServerRequest,
  AddProviderRequest,
  AddProviderResponse,
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AttachFileRequest,
  AttachFileResponse,
  CallMeetingRequest,
  CallMeetingResponse,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DashboardEvent,
  DashboardEventListener,
  DetachFileRequest,
  EndMeetingResponse,
  Goal,
  GoalDetail,
  HireEmployeeRequest,
  HireEmployeeResponse,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  ListEventsRequest,
  ListEventsResponse,
  McpServerSummary,
  Meeting,
  MeetingDetail,
  Project,
  ProjectDetail,
  ProviderConfig,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetPrivacyResponse,
  SettingsGetRuntimeResponse,
  SettingsSetConcurrencyRequest,
  SettingsSetPrivacyRequest,
  SettingsSetRuntimeRequest,
  TeamXApi,
  TelemetryCompanyStatsResponse,
  TelemetryCostBreakdownRequest,
  TelemetryCostBreakdownRow,
  TelemetryDailyUsageRequest,
  TelemetryDailyUsageRow,
  TelemetryEmployeeStatsRow,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  TestProviderConnectionResponse,
  Thread,
  Ticket,
  TicketAttachment,
  TicketDetail,
  UnsubscribeFn,
  UpdateGoalRequest,
  UpdateProjectRequest,
  UpdateProviderRequest,
  UpdateTicketRequest,
  VaultDownloadResponse,
  VaultFile,
  VaultSearchResult,
  VaultStatsResponse,
  VaultUploadRequest,
  VaultUploadResponse,
  VaultVerifyResponse,
} from '@team-x/shared-types';

/**
 * Minimal structural subset of Electron's `IpcRenderer` that the
 * preload API factory actually uses. Kept intentionally narrow:
 *
 *   - `invoke` for the three request/response channels,
 *   - `on` to attach a dashboard-event listener,
 *   - `removeListener` to detach it inside the unsubscribe function
 *     we hand back to the renderer.
 *
 * The real `ipcRenderer` singleton from `'electron'` has a much
 * wider surface (`send`, `sendSync`, `postMessage`, `once`,
 * `removeAllListeners`, …). None of those are used by the Team-X
 * bridge; omitting them here makes the factory's test doubles
 * trivial to write.
 */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/**
 * Channel name constants. Extracted to their own block so a grep for
 * a channel name hits exactly ONE location and so the main process's
 * register layer in `main/ipc/register.ts` can be diff-matched against
 * this file when the IPC contract changes. Mirrors the keys of
 * `IpcContract` in `@team-x/shared-types/ipc.ts`.
 */
const CHANNELS = {
  companiesList: 'companies.list',
  employeesList: 'employees.list',
  employeesCreate: 'employees.create',
  chatSend: 'chat.send',
  chatList: 'chat.list',
  chatResolveThread: 'chat.resolveThread',
  chatListThreads: 'chat.listThreads',
  eventsDashboard: 'events.dashboard',
  eventsList: 'events.list',
  // MCP management (Phase 2 — M10)
  mcpList: 'mcp.list',
  mcpToggle: 'mcp.toggle',
  mcpAddServer: 'mcp.addServer',
  mcpRemoveServer: 'mcp.removeServer',
  mcpTestConnection: 'mcp.testConnection',
  // Goals management (Phase 3 — M15)
  goalsCreate: 'goals.create',
  goalsUpdate: 'goals.update',
  goalsList: 'goals.list',
  goalsGet: 'goals.get',
  goalsDelete: 'goals.delete',
  // Projects management (Phase 3 — M15)
  projectsCreate: 'projects.create',
  projectsUpdate: 'projects.update',
  projectsList: 'projects.list',
  projectsGet: 'projects.get',
  projectsDelete: 'projects.delete',
  projectsLinkTicket: 'projects.linkTicket',
  projectsUnlinkTicket: 'projects.unlinkTicket',
  // Meeting management (Phase 3 — M16)
  meetingsCall: 'meetings.call',
  meetingsEnd: 'meetings.end',
  meetingsInterject: 'meetings.interject',
  meetingsList: 'meetings.list',
  meetingsGet: 'meetings.get',
  // Telemetry (Phase 3 — M17)
  telemetryCompanyStats: 'telemetry.companyStats',
  telemetryDailyUsage: 'telemetry.dailyUsage',
  telemetryEmployeeStats: 'telemetry.employeeStats',
  telemetryCostBreakdown: 'telemetry.costBreakdown',
  // Settings (Phase 3 — M19)
  settingsGetRuntime: 'settings.getRuntime',
  settingsSetRuntime: 'settings.setRuntime',
  settingsGetPrivacy: 'settings.getPrivacy',
  settingsSetPrivacy: 'settings.setPrivacy',
  settingsGetConcurrency: 'settings.getConcurrency',
  settingsSetConcurrency: 'settings.setConcurrency',
  // Provider management (Phase 3 — M18)
  providersList: 'providers.list',
  providersAdd: 'providers.add',
  providersUpdate: 'providers.update',
  providersRemove: 'providers.remove',
  providersTestConnection: 'providers.testConnection',
  // Vault management (Phase 4 — M21)
  vaultUpload: 'vault.upload',
  vaultDownload: 'vault.download',
  vaultList: 'vault.list',
  vaultSearch: 'vault.search',
  vaultDelete: 'vault.delete',
  vaultVerify: 'vault.verify',
  vaultStats: 'vault.stats',
  // Ticket management (Phase 2 — M12)
  ticketsCreate: 'tickets.create',
  ticketsUpdate: 'tickets.update',
  ticketsAssign: 'tickets.assign',
  ticketsClose: 'tickets.close',
  ticketsReopen: 'tickets.reopen',
  ticketsAddComment: 'tickets.addComment',
  ticketsList: 'tickets.list',
  ticketsGet: 'tickets.get',
  // Ticket attachments (Phase 4 — M22)
  ticketsAttachFile: 'tickets.attachFile',
  ticketsDetachFile: 'tickets.detachFile',
  ticketsListAttachments: 'tickets.listAttachments',
} as const;

/**
 * Build the `TeamXApi` object the preload hands to `contextBridge`.
 * Captures the supplied `ipc` handle in a closure so each returned
 * method routes through the same transport.
 */
export function buildTeamXApi(ipc: IpcRendererLike): TeamXApi {
  return {
    companies: {
      list: () => ipc.invoke(CHANNELS.companiesList) as ReturnType<TeamXApi['companies']['list']>,
    },
    employees: {
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.employeesList, { companyId }) as ReturnType<
          TeamXApi['employees']['list']
        >,
      create: (req: HireEmployeeRequest) =>
        ipc.invoke(CHANNELS.employeesCreate, req) as Promise<HireEmployeeResponse>,
    },
    chat: {
      send: (req: SendChatRequest) =>
        ipc.invoke(CHANNELS.chatSend, req) as Promise<SendChatResponse>,
      list: (threadId: string) =>
        ipc.invoke(CHANNELS.chatList, { threadId }) as ReturnType<TeamXApi['chat']['list']>,
      resolveThread: (req: ResolveThreadRequest) =>
        ipc.invoke(CHANNELS.chatResolveThread, req) as Promise<ResolveThreadResponse>,
      listThreads: (companyId: string) =>
        ipc.invoke(CHANNELS.chatListThreads, { companyId }) as Promise<Thread[]>,
    },
    events: {
      onDashboard: (listener: DashboardEventListener): UnsubscribeFn => {
        // Wrap the caller's listener in an ipc-level listener that
        // strips the first `event` argument (IpcRendererEvent) and
        // forwards only the payload the main process actually sent.
        // We have to keep a stable reference to the wrapper so the
        // unsubscribe call can remove THE SAME function — passing a
        // fresh wrapper to `removeListener` would be a no-op.
        const ipcListener = (_e: unknown, payload: unknown) => {
          listener(payload as DashboardEvent);
        };
        ipc.on(CHANNELS.eventsDashboard, ipcListener);
        return () => {
          ipc.removeListener(CHANNELS.eventsDashboard, ipcListener);
        };
      },
      list: (req: ListEventsRequest) =>
        ipc.invoke(CHANNELS.eventsList, req) as Promise<ListEventsResponse>,
    },
    mcp: {
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.mcpList, { companyId }) as Promise<McpServerSummary[]>,
      toggle: (serverId: string, enabled: boolean) =>
        ipc.invoke(CHANNELS.mcpToggle, { serverId, enabled }) as Promise<void>,
      addServer: (req: AddMcpServerRequest) =>
        ipc.invoke(CHANNELS.mcpAddServer, req) as Promise<{ serverId: string }>,
      removeServer: (serverId: string) =>
        ipc.invoke(CHANNELS.mcpRemoveServer, { serverId }) as Promise<void>,
      testConnection: (req: TestMcpConnectionRequest) =>
        ipc.invoke(CHANNELS.mcpTestConnection, req) as Promise<TestMcpConnectionResponse>,
    },
    goals: {
      create: (req: CreateGoalRequest) =>
        ipc.invoke(CHANNELS.goalsCreate, req) as Promise<CreateGoalResponse>,
      update: (req: UpdateGoalRequest) => ipc.invoke(CHANNELS.goalsUpdate, req) as Promise<void>,
      list: (companyId: string) => ipc.invoke(CHANNELS.goalsList, { companyId }) as Promise<Goal[]>,
      get: (goalId: string) => ipc.invoke(CHANNELS.goalsGet, { goalId }) as Promise<GoalDetail>,
      delete: (goalId: string) => ipc.invoke(CHANNELS.goalsDelete, { goalId }) as Promise<void>,
    },
    projects: {
      create: (req: CreateProjectRequest) =>
        ipc.invoke(CHANNELS.projectsCreate, req) as Promise<CreateProjectResponse>,
      update: (req: UpdateProjectRequest) =>
        ipc.invoke(CHANNELS.projectsUpdate, req) as Promise<void>,
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.projectsList, { companyId }) as Promise<Project[]>,
      get: (projectId: string) =>
        ipc.invoke(CHANNELS.projectsGet, { projectId }) as Promise<ProjectDetail>,
      delete: (projectId: string) =>
        ipc.invoke(CHANNELS.projectsDelete, { projectId }) as Promise<void>,
      linkTicket: (projectId: string, ticketId: string) =>
        ipc.invoke(CHANNELS.projectsLinkTicket, { projectId, ticketId }) as Promise<void>,
      unlinkTicket: (projectId: string, ticketId: string) =>
        ipc.invoke(CHANNELS.projectsUnlinkTicket, { projectId, ticketId }) as Promise<void>,
    },
    meetings: {
      call: (req: CallMeetingRequest) =>
        ipc.invoke(CHANNELS.meetingsCall, req) as Promise<CallMeetingResponse>,
      end: (meetingId: string) =>
        ipc.invoke(CHANNELS.meetingsEnd, { meetingId }) as Promise<EndMeetingResponse>,
      interject: (req: InterjectMeetingRequest) =>
        ipc.invoke(CHANNELS.meetingsInterject, req) as Promise<InterjectMeetingResponse>,
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.meetingsList, { companyId }) as Promise<Meeting[]>,
      get: (meetingId: string) =>
        ipc.invoke(CHANNELS.meetingsGet, { meetingId }) as Promise<MeetingDetail>,
    },
    telemetry: {
      companyStats: (companyId: string) =>
        ipc.invoke(CHANNELS.telemetryCompanyStats, {
          companyId,
        }) as Promise<TelemetryCompanyStatsResponse>,
      dailyUsage: (req: TelemetryDailyUsageRequest) =>
        ipc.invoke(CHANNELS.telemetryDailyUsage, req) as Promise<TelemetryDailyUsageRow[]>,
      employeeStats: (companyId: string) =>
        ipc.invoke(CHANNELS.telemetryEmployeeStats, {
          companyId,
        }) as Promise<TelemetryEmployeeStatsRow[]>,
      costBreakdown: (req: TelemetryCostBreakdownRequest) =>
        ipc.invoke(CHANNELS.telemetryCostBreakdown, req) as Promise<TelemetryCostBreakdownRow[]>,
    },
    settings: {
      getRuntime: () =>
        ipc.invoke(CHANNELS.settingsGetRuntime) as Promise<SettingsGetRuntimeResponse>,
      setRuntime: (req: SettingsSetRuntimeRequest) =>
        ipc.invoke(CHANNELS.settingsSetRuntime, req) as Promise<void>,
      getPrivacy: () =>
        ipc.invoke(CHANNELS.settingsGetPrivacy) as Promise<SettingsGetPrivacyResponse>,
      setPrivacy: (req: SettingsSetPrivacyRequest) =>
        ipc.invoke(CHANNELS.settingsSetPrivacy, req) as Promise<void>,
      getConcurrency: () =>
        ipc.invoke(CHANNELS.settingsGetConcurrency) as Promise<SettingsGetConcurrencyResponse>,
      setConcurrency: (req: SettingsSetConcurrencyRequest) =>
        ipc.invoke(CHANNELS.settingsSetConcurrency, req) as Promise<void>,
    },
    providers: {
      list: () => ipc.invoke(CHANNELS.providersList) as Promise<ProviderConfig[]>,
      add: (req: AddProviderRequest) =>
        ipc.invoke(CHANNELS.providersAdd, req) as Promise<AddProviderResponse>,
      update: (req: UpdateProviderRequest) =>
        ipc.invoke(CHANNELS.providersUpdate, req) as Promise<void>,
      remove: (providerId: string) =>
        ipc.invoke(CHANNELS.providersRemove, { providerId }) as Promise<void>,
      testConnection: (providerId: string) =>
        ipc.invoke(CHANNELS.providersTestConnection, {
          providerId,
        }) as Promise<TestProviderConnectionResponse>,
    },
    vault: {
      upload: (req: VaultUploadRequest) =>
        ipc.invoke(CHANNELS.vaultUpload, req) as Promise<VaultUploadResponse>,
      download: (fileId: string) =>
        ipc.invoke(CHANNELS.vaultDownload, { fileId }) as Promise<VaultDownloadResponse>,
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.vaultList, { companyId }) as Promise<VaultFile[]>,
      search: (companyId: string, query: string) =>
        ipc.invoke(CHANNELS.vaultSearch, { companyId, query }) as Promise<VaultSearchResult[]>,
      delete: (fileId: string) => ipc.invoke(CHANNELS.vaultDelete, { fileId }) as Promise<void>,
      verify: (fileId: string) =>
        ipc.invoke(CHANNELS.vaultVerify, { fileId }) as Promise<VaultVerifyResponse>,
      stats: (companyId: string) =>
        ipc.invoke(CHANNELS.vaultStats, { companyId }) as Promise<VaultStatsResponse>,
    },
    tickets: {
      create: (req: CreateTicketRequest) =>
        ipc.invoke(CHANNELS.ticketsCreate, req) as Promise<CreateTicketResponse>,
      update: (req: UpdateTicketRequest) =>
        ipc.invoke(CHANNELS.ticketsUpdate, req) as Promise<void>,
      assign: (req: { ticketId: string; assigneeId: string }) =>
        ipc.invoke(CHANNELS.ticketsAssign, req) as Promise<void>,
      close: (ticketId: string) => ipc.invoke(CHANNELS.ticketsClose, { ticketId }) as Promise<void>,
      reopen: (ticketId: string) =>
        ipc.invoke(CHANNELS.ticketsReopen, { ticketId }) as Promise<void>,
      addComment: (req: AddTicketCommentRequest) =>
        ipc.invoke(CHANNELS.ticketsAddComment, req) as Promise<AddTicketCommentResponse>,
      list: (companyId: string) =>
        ipc.invoke(CHANNELS.ticketsList, { companyId }) as Promise<Ticket[]>,
      get: (ticketId: string) =>
        ipc.invoke(CHANNELS.ticketsGet, { ticketId }) as Promise<TicketDetail>,
      attachFile: (req: AttachFileRequest) =>
        ipc.invoke(CHANNELS.ticketsAttachFile, req) as Promise<AttachFileResponse>,
      detachFile: (req: DetachFileRequest) =>
        ipc.invoke(CHANNELS.ticketsDetachFile, req) as Promise<void>,
      listAttachments: (ticketId: string) =>
        ipc.invoke(CHANNELS.ticketsListAttachments, { ticketId }) as Promise<TicketAttachment[]>,
    },
  };
}

/**
 * Channel name constants — exported primarily for tests that want to
 * verify the preload invokes the right strings without string-comparing
 * literals. The main process's register layer has its own copy of the
 * same constants; if either side drifts, the renderer's invoke lands
 * on a ghost handler and the handler's `ipcMain.handle` never fires.
 */
export { CHANNELS as PRELOAD_CHANNELS };
