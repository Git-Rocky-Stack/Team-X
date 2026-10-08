/**
 * IPC handler contract, second half: planning, telemetry, settings, providers,
 * data, tickets, proactive work and the updater.
 * Split from contract.ts so neither half needs a size exception (audit 2026-10-07 P1-7).
 */

import type {
  AddProviderRequest,
  AddProviderResponse,
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AddTicketParticipantRequest,
  AssignTicketRequest,
  AttachFileRequest,
  AttachFileResponse,
  AuditEvent,
  AuditExportRequest,
  AuditExportResponse,
  AuditFilter,
  AuditStats,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupDeleteRequest,
  BackupDeleteResponse,
  BackupEntry,
  BackupRestoreRequest,
  BackupRestoreResponse,
  CallMeetingRequest,
  CallMeetingResponse,
  CloseTicketRequest,
  CopilotExportRequest,
  CopilotExportResponse,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DeleteGoalRequest,
  DeleteProjectRequest,
  DetachFileRequest,
  EndMeetingResponse,
  GetGoalRequest,
  GetMeetingRequest,
  GetProjectRequest,
  GetTicketRequest,
  Goal,
  GoalDetail,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  LinkTicketToProjectRequest,
  ListAttachmentsRequest,
  ListGoalsRequest,
  ListMeetingsRequest,
  ListProjectsRequest,
  ListProviderModelsRequest,
  ListProviderModelsResponse,
  ListTicketsRequest,
  Meeting,
  MeetingDetail,
  Project,
  ProjectDetail,
  ProviderConfig,
  RemoveProviderRequest,
  RemoveTicketParticipantRequest,
  ReopenTicketRequest,
  SettingsGetAgenticResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
  SettingsGetEnhancedAiConfigResponse,
  SettingsGetExtensionsResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetPrivacyResponse,
  SettingsGetProactiveResponse,
  SettingsGetRagConfigResponse,
  SettingsGetRuntimeResponse,
  SettingsSetAgenticRequest,
  SettingsSetConcurrencyRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetEnhancedAiConfigRequest,
  SettingsSetExtensionsRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetPrivacyRequest,
  SettingsSetProactiveRequest,
  SettingsSetRagConfigRequest,
  SettingsSetRuntimeRequest,
  TelemetryCompanyStatsRequest,
  TelemetryCompanyStatsResponse,
  TelemetryCostBreakdownRequest,
  TelemetryCostBreakdownRow,
  TelemetryDailyUsageRequest,
  TelemetryDailyUsageRow,
  TelemetryEmployeeStatsRequest,
  TelemetryEmployeeStatsRow,
  TelemetryRecentRunRow,
  TelemetryRecentRunsRequest,
  TestProviderConnectionRequest,
  TestProviderConnectionResponse,
  Ticket,
  TicketAttachment,
  TicketDetail,
  UnlinkTicketFromProjectRequest,
  UpdateCheckResult,
  UpdateGoalRequest,
  UpdateInstallResult,
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

export interface IpcHandlersOperations {
  // -----------------------------------------------------------------------
  // Goals management handlers (Phase 3 — M15)
  // -----------------------------------------------------------------------

  /** `goals.create` — create a new company goal. */
  goalsCreate(req: CreateGoalRequest): Promise<CreateGoalResponse>;
  /** `goals.update` — update goal fields. */
  goalsUpdate(req: UpdateGoalRequest): Promise<void>;
  /** `goals.list` — list all goals for a company. */
  goalsList(req: ListGoalsRequest): Promise<Goal[]>;
  /** `goals.get` — get full goal detail with linked projects. */
  goalsGet(req: GetGoalRequest): Promise<GoalDetail>;
  /** `goals.delete` — delete a goal. */
  goalsDelete(req: DeleteGoalRequest): Promise<void>;

  // -----------------------------------------------------------------------
  // Projects management handlers (Phase 3 — M15)
  // -----------------------------------------------------------------------

  /** `projects.create` — create a new project. */
  projectsCreate(req: CreateProjectRequest): Promise<CreateProjectResponse>;
  /** `projects.update` — update project fields. */
  projectsUpdate(req: UpdateProjectRequest): Promise<void>;
  /** `projects.list` — list all projects for a company. */
  projectsList(req: ListProjectsRequest): Promise<Project[]>;
  /** `projects.get` — get full project detail with tickets and lead. */
  projectsGet(req: GetProjectRequest): Promise<ProjectDetail>;
  /** `projects.delete` — delete a project and its ticket links. */
  projectsDelete(req: DeleteProjectRequest): Promise<void>;
  /** `projects.linkTicket` — link a ticket to a project. */
  projectsLinkTicket(req: LinkTicketToProjectRequest): Promise<void>;
  /** `projects.unlinkTicket` — unlink a ticket from a project. */
  projectsUnlinkTicket(req: UnlinkTicketFromProjectRequest): Promise<void>;

  // -----------------------------------------------------------------------
  // Meeting management handlers (Phase 3 — M16)
  // -----------------------------------------------------------------------

  /** `meetings.call` — start a meeting (pause orchestrator, create thread + meeting). */
  meetingsCall(req: CallMeetingRequest): Promise<CallMeetingResponse>;
  /** `meetings.end` — end meeting, generate minutes, create action-item tickets, resume. */
  meetingsEnd(req: { meetingId: string }): Promise<EndMeetingResponse>;
  /** `meetings.interject` — Rocky sends a message mid-meeting. */
  meetingsInterject(req: InterjectMeetingRequest): Promise<InterjectMeetingResponse>;
  /** `meetings.list` — list all meetings for a company. */
  meetingsList(req: ListMeetingsRequest): Promise<Meeting[]>;
  /** `meetings.get` — get full meeting detail with thread messages and chair. */
  meetingsGet(req: GetMeetingRequest): Promise<MeetingDetail>;

  // -----------------------------------------------------------------------
  // Telemetry handlers (Phase 3 — M17)
  // -----------------------------------------------------------------------

  /** `telemetry.companyStats` — aggregate company-level telemetry. */
  telemetryCompanyStats(req: TelemetryCompanyStatsRequest): Promise<TelemetryCompanyStatsResponse>;
  /** `telemetry.dailyUsage` — daily time-series of token usage and cost. */
  telemetryDailyUsage(req: TelemetryDailyUsageRequest): Promise<TelemetryDailyUsageRow[]>;
  /** `telemetry.employeeStats` — per-employee breakdown. */
  telemetryEmployeeStats(req: TelemetryEmployeeStatsRequest): Promise<TelemetryEmployeeStatsRow[]>;
  /** `telemetry.recentRuns` — newest-first persisted run summaries for dashboard backfill. */
  telemetryRecentRuns(req: TelemetryRecentRunsRequest): Promise<TelemetryRecentRunRow[]>;
  /** `telemetry.costBreakdown` — cost by provider/model with optional date range. */
  telemetryCostBreakdown(req: TelemetryCostBreakdownRequest): Promise<TelemetryCostBreakdownRow[]>;

  // -----------------------------------------------------------------------
  // Settings handlers (Phase 3 — M19)
  // -----------------------------------------------------------------------

  /** `settings.getRuntime` — strategy, hardware profile, effective slots. */
  settingsGetRuntime(): Promise<SettingsGetRuntimeResponse>;
  /** `settings.setRuntime` — set runtime strategy override. */
  settingsSetRuntime(req: SettingsSetRuntimeRequest): Promise<void>;
  /** `settings.getPrivacy` — max privacy tier + per-provider allowed/blocked. */
  settingsGetPrivacy(): Promise<SettingsGetPrivacyResponse>;
  /** `settings.setPrivacy` — set max privacy tier. */
  settingsSetPrivacy(req: SettingsSetPrivacyRequest): Promise<void>;
  /** `settings.getConcurrency` — orchestrator slots + per-provider caps. */
  settingsGetConcurrency(): Promise<SettingsGetConcurrencyResponse>;
  /** `settings.setConcurrency` — update orchestrator slots + per-provider caps. */
  settingsSetConcurrency(req: SettingsSetConcurrencyRequest): Promise<void>;
  /** `settings.getExtensions` — extensions autonomy mode. */
  settingsGetExtensions(): Promise<SettingsGetExtensionsResponse>;
  /** `settings.setExtensions` — update extensions autonomy mode. */
  settingsSetExtensions(req: SettingsSetExtensionsRequest): Promise<void>;
  /** `settings.getMemory` — long-run memory defaults for pack budget and detail depth. */
  settingsGetMemory(): Promise<SettingsGetMemoryResponse>;
  /** `settings.setMemory` — patch one or more long-run memory defaults. */
  settingsSetMemory(req: SettingsSetMemoryRequest): Promise<void>;
  /** `settings.getRagConfig` — full RAG configuration snapshot (Phase 5 — M29). */
  settingsGetRagConfig(): Promise<SettingsGetRagConfigResponse>;
  /** `settings.setRagConfig` — patch one or more RAG configuration keys (Phase 5 — M29). */
  settingsSetRagConfig(req: SettingsSetRagConfigRequest): Promise<void>;
  /** `settings.getEnhancedAiConfig` — full Enhanced AI configuration snapshot (Phase 5 — M32). */
  settingsGetEnhancedAiConfig(): Promise<SettingsGetEnhancedAiConfigResponse>;
  /** `settings.setEnhancedAiConfig` — patch one or more Enhanced AI configuration keys (Phase 5 — M32). */
  settingsSetEnhancedAiConfig(req: SettingsSetEnhancedAiConfigRequest): Promise<void>;
  /** `settings.getAgentic` — agentic-loop budget caps (max steps, max tokens, timeout ms) (Phase 5 — M31). */
  settingsGetAgentic(): Promise<SettingsGetAgenticResponse>;
  /** `settings.setAgentic` — patch one or more agentic-loop budget caps with clamping (Phase 5 — M31). */
  settingsSetAgentic(req: SettingsSetAgenticRequest): Promise<void>;
  /** `settings.getPlanner` — task-planner guardrail settings (max tickets, depth, approval level, escalation threshold) (Phase 5 — M32). */
  settingsGetPlanner(): Promise<SettingsGetPlannerResponse>;
  /** `settings.setPlanner` — patch one or more task-planner guardrail settings with clamping / validation (Phase 5 — M32). */
  settingsSetPlanner(req: SettingsSetPlannerRequest): Promise<void>;
  /** `settings.getCopilot` — copilot-service settings (enabled, interval in minutes, allowed categories) (Phase 5 — M33). */
  settingsGetCopilot(): Promise<SettingsGetCopilotResponse>;
  /** `settings.getCopilotWeights` — copilot feedback category weights (Phase 6 — M38). */
  settingsGetCopilotWeights(
    req: SettingsGetCopilotWeightsRequest,
  ): Promise<SettingsGetCopilotWeightsResponse>;
  /**
   * `settings.setCopilot` — patch one or more copilot-service settings with
   * clamping + category filtering, then synchronously restart the
   * per-company analyzer timer so the new values take effect without
   * an app restart (Phase 5 — M33).
   */
  settingsSetCopilot(req: SettingsSetCopilotRequest): Promise<void>;
  /**
   * `settings.setCopilotWeights` — patch copilot feedback category weights,
   * then emit `copilot.weights.changed` so renderer/analyzer consumers can
   * invalidate local snapshots (Phase 6 — M38).
   */
  settingsSetCopilotWeights(
    req: SettingsSetCopilotWeightsRequest,
  ): Promise<SettingsSetCopilotWeightsResponse>;

  // -----------------------------------------------------------------------
  // Proactive settings handlers (Phase 6 — Proactive Execution System)
  // -----------------------------------------------------------------------

  /** `settings.getProactive` — proactive mode enabled and autonomy mode. */
  settingsGetProactive(): Promise<SettingsGetProactiveResponse>;

  /** `settings.setProactive` — patch proactive settings with validation. */
  settingsSetProactive(req: SettingsSetProactiveRequest): Promise<void>;

  // -----------------------------------------------------------------------
  // Provider management handlers (Phase 3 — M18)
  // -----------------------------------------------------------------------

  /** `providers.list` — list all configured providers. */
  providersList(): Promise<ProviderConfig[]>;
  /** `providers.add` — register a new provider. Saves API key to keychain if supplied. */
  providersAdd(req: AddProviderRequest): Promise<AddProviderResponse>;
  /** `providers.update` ��� update provider config. Saves API key to keychain if supplied. */
  providersUpdate(req: UpdateProviderRequest): Promise<void>;
  /** `providers.remove` — remove a provider and its keychain entry. */
  providersRemove(req: RemoveProviderRequest): Promise<void>;
  /** `providers.testConnection` — verify provider API key + connectivity. */
  providersTestConnection(
    req: TestProviderConnectionRequest,
  ): Promise<TestProviderConnectionResponse>;
  /** `providers.listModels` — fetch provider model suggestions for settings UI. */
  providersListModels(req: ListProviderModelsRequest): Promise<ListProviderModelsResponse>;

  // -----------------------------------------------------------------------
  // Vault management handlers (Phase 4 — M21)
  // -----------------------------------------------------------------------

  /** `vault.upload` — store a file in the vault from a disk path. */
  vaultUpload(req: VaultUploadRequest): Promise<VaultUploadResponse>;
  /** `vault.download` — get file metadata + absolute path for opening. */
  vaultDownload(req: { fileId: string }): Promise<VaultDownloadResponse>;
  /** `vault.list` — list all files in a company vault. */
  vaultList(req: { companyId: string }): Promise<VaultFile[]>;
  /** `vault.search` — full-text search across vault files. */
  vaultSearch(req: { companyId: string; query: string }): Promise<VaultSearchResult[]>;
  /** `vault.delete` — delete a file from vault (disk + DB). */
  vaultDelete(req: { fileId: string }): Promise<void>;
  /** `vault.verify` — verify SHA256 integrity of a vault file. */
  vaultVerify(req: { fileId: string }): Promise<VaultVerifyResponse>;
  /** `vault.stats` — get vault statistics for a company. */
  vaultStats(req: { companyId: string }): Promise<VaultStatsResponse>;

  // -----------------------------------------------------------------------
  // Backup/restore handlers (Phase 4 — M23)
  // -----------------------------------------------------------------------

  /** `backup.create` — create a full backup archive. */
  backupCreate(req: BackupCreateRequest): Promise<BackupCreateResponse>;
  /** `backup.restore` — restore from a backup. DESTRUCTIVE. */
  backupRestore(req: BackupRestoreRequest): Promise<BackupRestoreResponse>;
  /** `backup.list` — list existing backups. */
  backupList(): Promise<BackupEntry[]>;
  /** `backup.delete` — delete a backup directory permanently. */
  backupDelete(req: BackupDeleteRequest): Promise<BackupDeleteResponse>;

  // -----------------------------------------------------------------------
  // Audit log handlers (Phase 4 — M24)
  // -----------------------------------------------------------------------

  /** `audit.list` — filtered, paginated list of audit events. */
  auditList(filter: AuditFilter): Promise<AuditEvent[]>;
  /** `audit.stats` — aggregate statistics for the summary cards. */
  auditStats(req: { companyId: string }): Promise<AuditStats>;
  /** `audit.export` — export filtered events to a file. Returns saved path. */
  auditExport(req: AuditExportRequest): Promise<AuditExportResponse>;
  /** `copilot.export` — export active copilot insights to a local JSON/CSV file. */
  copilotExport(req: CopilotExportRequest): Promise<CopilotExportResponse>;

  // -----------------------------------------------------------------------
  // Ticket management handlers (Phase 2 — M12)
  // -----------------------------------------------------------------------

  /** `updater.check` — check GitHub Releases for a newer version. User-triggered only. */
  updaterCheck(): Promise<UpdateCheckResult>;

  /** `updater.install` — download and install the available update. App will restart. */
  updaterInstall(): Promise<UpdateInstallResult>;

  /** `proactive.setEnabled` — enable or disable proactive mode for a company. */
  proactiveSetEnabled(req: { companyId: string; enabled: boolean }): Promise<void>;

  /** `proactive.decomposeGoal` — trigger immediate goal decomposition. */
  proactiveDecomposeGoal(req: { companyId: string; goalId: string }): Promise<{ success: boolean }>;

  /** `proactive.scanForWork` — trigger background work scan. */
  proactiveScanForWork(req: { companyId: string }): Promise<{ queuedCount: number }>;

  /** `proactive.getState` — query proactive state. */
  proactiveGetState(req: {
    companyId: string;
  }): Promise<{
    enabled: boolean;
    activeWork: number;
    queuedWork: number;
    lastScanAt: number | null;
  }>;

  /** `tickets.create` — file a new ticket. Optionally assigns immediately. */
  ticketsCreate(req: CreateTicketRequest): Promise<CreateTicketResponse>;

  /** `tickets.update` — update mutable ticket fields. */
  ticketsUpdate(req: UpdateTicketRequest): Promise<void>;

  /** `tickets.assign` — assign a ticket to an employee, creating thread + WorkItem. */
  ticketsAssign(req: AssignTicketRequest): Promise<void>;
  /** `tickets.addParticipant` — add an employee to an existing ticket discussion. */
  ticketsAddParticipant(req: AddTicketParticipantRequest): Promise<void>;
  /** `tickets.removeParticipant` — remove an employee from an existing ticket discussion. */
  ticketsRemoveParticipant(req: RemoveTicketParticipantRequest): Promise<void>;

  /** `tickets.close` — close a ticket (status → done). */
  ticketsClose(req: CloseTicketRequest): Promise<void>;

  /** `tickets.reopen` — reopen a closed ticket. */
  ticketsReopen(req: ReopenTicketRequest): Promise<void>;

  /** `tickets.addComment` — add a comment to the ticket's discussion thread. */
  ticketsAddComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;

  /** `tickets.list` — list all tickets for a company. */
  ticketsList(req: ListTicketsRequest): Promise<Ticket[]>;

  /** `tickets.get` — get full ticket detail with thread messages and assignee. */
  ticketsGet(req: GetTicketRequest): Promise<TicketDetail>;

  /** `tickets.attachFile` — attach a vault file to a ticket. */
  ticketsAttachFile(req: AttachFileRequest): Promise<AttachFileResponse>;
  /** `tickets.detachFile` — detach a file from a ticket. */
  ticketsDetachFile(req: DetachFileRequest): Promise<void>;
  /** `tickets.listAttachments` — list all attachments for a ticket. */
  ticketsListAttachments(req: ListAttachmentsRequest): Promise<TicketAttachment[]>;
}
