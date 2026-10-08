/**
 * The IPC handler contract: one method per renderer-callable channel.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  AddProviderRequest,
  AddProviderResponse,
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  AddTicketParticipantRequest,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  ApprovalItem,
  ArchiveCompanyRequest,
  ArtifactRecord,
  AssignTicketRequest,
  AttachFileRequest,
  AttachFileResponse,
  AuditEvent,
  AuditExportRequest,
  AuditExportResponse,
  AuditFilter,
  AuditStats,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupDeleteRequest,
  BackupDeleteResponse,
  BackupEntry,
  BackupRestoreRequest,
  BackupRestoreResponse,
  BindEmployeeRuntimeProfileRequest,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  CallMeetingRequest,
  CallMeetingResponse,
  ChatMessage,
  CloseTicketRequest,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  CompaniesDeleteRequest,
  CompaniesUpdateRequest,
  Company,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  CompleteScheduleItemRequest,
  CopilotExportRequest,
  CopilotExportResponse,
  CreateAuthorityGrantRequest,
  CreateBudgetPolicyRequest,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateOperatorInviteRequest,
  CreateOperatorInviteResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  CreateScheduleItemRequest,
  CreateScheduleItemResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DeleteAuthorityGrantRequest,
  DeleteBudgetPolicyRequest,
  DeleteGoalRequest,
  DeleteProjectRequest,
  DeleteRoutineRequest,
  DeleteRuntimeProfileRequest,
  DeleteScheduleItemRequest,
  DetachFileRequest,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  EndMeetingResponse,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  ExtensionSummary,
  GetBudgetOverviewRequest,
  GetCloudWorkspaceLinkRequest,
  GetEffectiveAuthorityRequest,
  GetGoalRequest,
  GetMeetingRequest,
  GetOperatorSharingReadinessRequest,
  GetProjectRequest,
  GetThreadDigestRequest,
  GetTicketRequest,
  Goal,
  GoalDetail,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateRequest,
  InstallCompanyTemplateResponse,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  InstallMcpTemplateRequest,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  LinkCloudWorkspaceRequest,
  LinkTicketToProjectRequest,
  ListAgentImprovementRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListAttachmentsRequest,
  ListAuthorityGrantsRequest,
  ListAuthorityRequestsRequest,
  ListBudgetLedgerEntriesRequest,
  ListBudgetPoliciesRequest,
  ListCompanyTemplatesRequest,
  ListCompanyTemplatesResponse,
  ListEventsRequest,
  ListEventsResponse,
  ListExtensionsRequest,
  ListGoalsRequest,
  ListMcpTemplatesRequest,
  ListMeetingsRequest,
  ListOperatorInvitesRequest,
  ListOperatorsRequest,
  ListProjectsRequest,
  ListProviderModelsRequest,
  ListProviderModelsResponse,
  ListRoutineRunsRequest,
  ListRoutinesRequest,
  ListRunCheckpointsRequest,
  ListRuntimeOperationsRequest,
  ListRuntimeProfilesRequest,
  ListScheduleItemsRequest,
  ListSkillAssignmentsRequest,
  ListTicketsRequest,
  McpServerSummary,
  McpTemplateSummary,
  Meeting,
  MeetingDetail,
  OperatorAccessEntry,
  OperatorInvite,
  OrgchartGetRequest,
  OrgchartGetResponse,
  PackThreadContextRequest,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  Project,
  ProjectDetail,
  ProviderConfig,
  ReconnectCloudWorkspaceRequest,
  RemoveProviderRequest,
  RemoveSkillRequest,
  RemoveTicketParticipantRequest,
  ReopenTicketRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  ReviewApprovalItemRequest,
  ReviewAuthorityRequestRequest,
  RevokeOperatorInviteRequest,
  Routine,
  RoutineRun,
  RunAgentImprovementRequest,
  RunAutonomyBenchmarkRequest,
  RunAutonomyDoctorRequest,
  RunCheckpoint,
  RunRoutineNowRequest,
  RuntimeOperationsSnapshot,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  ScheduleItem,
  SendChatRequest,
  SendChatResponse,
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
  SkillAssignment,
  StopChatRequest,
  StopChatResponse,
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
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  TestProviderConnectionRequest,
  TestProviderConnectionResponse,
  Thread,
  ThreadDigest,
  Ticket,
  TicketAttachment,
  TicketDetail,
  UnlinkCloudWorkspaceRequest,
  UnlinkTicketFromProjectRequest,
  UpdateBudgetPolicyRequest,
  UpdateCheckResult,
  UpdateGoalRequest,
  UpdateInstallResult,
  UpdateProjectRequest,
  UpdateProviderRequest,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  UpdateScheduleItemRequest,
  UpdateTicketRequest,
  UpsertSkillAssignmentRequest,
  ValidateRuntimeProfileRequest,
  VaultDownloadResponse,
  VaultFile,
  VaultSearchResult,
  VaultStatsResponse,
  VaultUploadRequest,
  VaultUploadResponse,
  VaultVerifyResponse,
} from '@team-x/shared-types';

export interface IpcHandlers {
  /** `companies.list` — return every company. Phase 1 always returns exactly one. */
  companiesList(): Promise<Company[]>;

  /** `companies.exportPackage` — export one workspace as a portable Team-X package. */
  companiesExportPackage(req: ExportCompanyPackageRequest): Promise<ExportCompanyPackageResponse>;

  /** `companies.previewImportPackage` — inspect one package file before importing. */
  companiesPreviewImportPackage(
    req: PreviewCompanyPackageImportRequest,
  ): Promise<PreviewCompanyPackageImportResponse>;

  /** `companies.importPackage` — import one package as a brand-new company. */
  companiesImportPackage(req: ImportCompanyPackageRequest): Promise<ImportCompanyPackageResponse>;

  /** `companies.listTemplates` — list locally installed reusable workspace templates. */
  companiesListTemplates(req: ListCompanyTemplatesRequest): Promise<ListCompanyTemplatesResponse>;

  /** `companies.installTemplate` — install one external Team-X template package into the local library. */
  companiesInstallTemplate(
    req: InstallCompanyTemplateRequest,
  ): Promise<InstallCompanyTemplateResponse>;

  /**
   * `companies.archive` — soft-delete a company. The handler quiesces
   * the copilot path (analyzer stop + event-window clear) BEFORE
   * flipping the row to `status = 'archived'`, then fans out a
   * `company.archived` bus event (architectural invariant #11).
   * Idempotent — re-archiving is safe. Phase 5 — M33 F3.
   */
  companiesArchive(req: ArchiveCompanyRequest): Promise<void>;

  /**
   * `companies.create` — create a new company AND seed its two system
   * pseudo-employees (`system-agent` + `system-copilot`) atomically
   * before returning. Phase 5.6 M-C step b — restores Cluster A
   * multi-company CRUD per audit row 10.12 (Rocky's locked M7
   * architectural decision).
   *
   * The handler validates input, calls `companiesRepo.create` to insert
   * the row, then invokes the injected `ensureSystemForCompany`
   * callback (closes over `db` + `roleLookup` and delegates to
   * `ensureSystemAgent` + `ensureSystemCopilot`). On bootstrap success
   * the handler emits a `company.created` bus event with the new ids
   * (architectural invariant #11) and returns the company id + the two
   * system employee ids in one round-trip.
   *
   * Throws on duplicate slug (SQL UNIQUE constraint), invalid input
   * (empty name; slug not matching `/^[a-z0-9][a-z0-9-]{0,62}$/`), or
   * a missing `ensureSystemForCompany` dep — the handler refuses to
   * leave a partially-bootstrapped company on the table.
   */
  companiesCreate(req: CompaniesCreateRequest): Promise<CompaniesCreateResponse>;

  /**
   * `companies.update` — update mutable fields on an existing, non-
   * archived company. Phase 5.6 M-C step e — restores Cluster A multi-
   * company CRUD per audit row 10.13.
   *
   * Validation mirrors `companies.create` for every supplied field
   * (non-empty trimmed name ≤120 chars, slug regex, settings shape,
   * icon/theme types). `assertCompanyActive` refuses archived rows.
   * SQL UNIQUE on slug collision rethrown as a friendlier message.
   * Empty patch is a no-op at the repo layer but still emits
   * `company.updated` with an empty `patchedKeys` array so optimistic
   * update paths reconcile.
   */
  companiesUpdate(req: CompaniesUpdateRequest): Promise<void>;

  /**
   * `companies.delete` — hard-delete a company AND every row scoped to
   * it across 15 tables in a single transaction. Phase 5.6 M-C step e
   * — restores Cluster A multi-company CRUD per audit row 10.15.
   * Destructive sibling of `companies.archive`.
   *
   * The handler quiesces the copilot pipeline (`analyzer.stop` →
   * `eventWindow.clear`) BEFORE the transactional sweep fires so a
   * mid-tick analyzer cannot observe rows that are about to
   * disappear. After the transaction commits, emits `company.deleted`
   * carrying the captured-before-drop `name` + `slug` (the row is
   * gone; subscribers can't look them up). Throws if the company does
   * not exist — prevents silent no-ops from confusing callers.
   */
  companiesDelete(req: CompaniesDeleteRequest): Promise<void>;

  /**
   * `employees.list` — return every employee in a given company,
   * mapped from the raw DB row to the public `Employee` shape from
   * shared-types. The renderer uses this to drive the dashboard cards
   * + the chat drawer's recipient list.
   */
  employeesList(req: { companyId: string }): Promise<Employee[]>;
  /** `operators.list` — return the operator access entries for a company. */
  operatorsList(req: ListOperatorsRequest): Promise<OperatorAccessEntry[]>;
  /** `operators.readiness` — return sharing posture and readiness for a company. */
  operatorsReadiness(
    req: GetOperatorSharingReadinessRequest,
  ): Promise<CompanySharingReadinessSummary>;
  /** `cloud.getWorkspaceLink` — return the local linked-workspace status and device identity. */
  cloudGetWorkspaceLink(req: GetCloudWorkspaceLinkRequest): Promise<CompanyCloudLinkStatus>;
  /** `cloud.linkWorkspace` — move one workspace into linked posture using local placeholder cloud ids. */
  cloudLinkWorkspace(req: LinkCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
  /** `cloud.unlinkWorkspace` — clear one workspace's linked-workspace metadata. */
  cloudUnlinkWorkspace(req: UnlinkCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
  /** `cloud.reconnectWorkspace` — refresh one linked workspace after a degraded or stale sync posture. */
  cloudReconnectWorkspace(req: ReconnectCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
  /** `operators.listInvites` — return pending and historical invites for a company. */
  operatorsListInvites(req: ListOperatorInvitesRequest): Promise<OperatorInvite[]>;
  /** `operators.createInvite` — create one shared-operator invite placeholder. */
  operatorsCreateInvite(req: CreateOperatorInviteRequest): Promise<CreateOperatorInviteResponse>;
  /** `operators.revokeInvite` — revoke one operator invite. */
  operatorsRevokeInvite(req: RevokeOperatorInviteRequest): Promise<OperatorInvite>;
  /** `operators.acceptInvite` — accept one pending invite into a company membership. */
  operatorsAcceptInvite(req: AcceptOperatorInviteRequest): Promise<AcceptOperatorInviteResponse>;
  /** `runtimeProfiles.list` — return runtime profiles plus binding summaries for a company. */
  runtimeProfilesList(req: ListRuntimeProfilesRequest): Promise<RuntimeProfileSummary[]>;
  /** `runtimeProfiles.create` — create one named runtime profile. */
  runtimeProfilesCreate(req: CreateRuntimeProfileRequest): Promise<{ profileId: string }>;
  /** `runtimeProfiles.update` — patch one runtime profile. */
  runtimeProfilesUpdate(req: UpdateRuntimeProfileRequest): Promise<void>;
  /** `runtimeProfiles.delete` — remove one runtime profile and any bindings. */
  runtimeProfilesDelete(req: DeleteRuntimeProfileRequest): Promise<void>;
  /** `runtimeProfiles.bindEmployee` — bind or unbind one employee. */
  runtimeProfilesBindEmployee(
    req: BindEmployeeRuntimeProfileRequest,
  ): Promise<{ binding: EmployeeRuntimeBinding | null }>;
  /** `runtimeProfiles.validate` — run and persist the kind-specific health check. */
  runtimeProfilesValidate(req: ValidateRuntimeProfileRequest): Promise<RuntimeProfileValidation>;
  /** `runtimeOperations.snapshot` — live external-runtime sessions plus active ticket leases. */
  runtimeOperationsSnapshot(req: ListRuntimeOperationsRequest): Promise<RuntimeOperationsSnapshot>;
  /** `autonomyDoctor.run` — deterministic operator health workflow report. */
  autonomyDoctorRun(req: RunAutonomyDoctorRequest): Promise<AutonomyDoctorReport>;
  /** `autonomyBenchmark.run` — deterministic autonomy benchmark harness report. */
  autonomyBenchmarkRun(req: RunAutonomyBenchmarkRequest): Promise<AutonomyBenchmarkReport>;
  /** `agentImprovement.list` — current self-improvement queue and loop history. */
  agentImprovementList(req: ListAgentImprovementRequest): Promise<AgentImprovementSnapshot>;
  /** `agentImprovement.run` — observe recent signals and open deduped improvement tickets. */
  agentImprovementRun(req: RunAgentImprovementRequest): Promise<AgentImprovementRunResult>;
  /** `routines.list` — return routine definitions for a company. */
  routinesList(req: ListRoutinesRequest): Promise<Routine[]>;
  /** `routines.create` — create one recurring routine definition. */
  routinesCreate(req: CreateRoutineRequest): Promise<{ routineId: string }>;
  /** `routines.update` — patch one routine definition. */
  routinesUpdate(req: UpdateRoutineRequest): Promise<void>;
  /** `routines.delete` — delete one routine definition. */
  routinesDelete(req: DeleteRoutineRequest): Promise<void>;
  /** `routines.listRuns` — return recent routine runs. */
  routinesListRuns(req: ListRoutineRunsRequest): Promise<RoutineRun[]>;
  /** `routines.runNow` — force one routine to materialize work immediately. */
  routinesRunNow(req: RunRoutineNowRequest): Promise<RoutineRun>;
  /** `budgets.listPolicies` — return budget policies for a company. */
  budgetsListPolicies(req: ListBudgetPoliciesRequest): Promise<BudgetPolicy[]>;
  /** `budgets.createPolicy` — create one budget policy. */
  budgetsCreatePolicy(req: CreateBudgetPolicyRequest): Promise<{ policyId: string }>;
  /** `budgets.updatePolicy` — patch one budget policy. */
  budgetsUpdatePolicy(req: UpdateBudgetPolicyRequest): Promise<void>;
  /** `budgets.deletePolicy` — remove one budget policy. */
  budgetsDeletePolicy(req: DeleteBudgetPolicyRequest): Promise<void>;
  /** `budgets.listLedger` — return recent budget ledger entries. */
  budgetsListLedger(req: ListBudgetLedgerEntriesRequest): Promise<BudgetLedgerEntry[]>;
  /** `budgets.getOverview` — current monthly budget overview. */
  budgetsGetOverview(req: GetBudgetOverviewRequest): Promise<BudgetOverview>;
  /** `budgets.listApprovals` — return budget approval items. */
  budgetsListApprovals(req: ListApprovalItemsRequest): Promise<ApprovalItem[]>;
  /** `approvals.list` — unified approval inbox across governance sources. */
  approvalsList(req: ListApprovalItemsRequest): Promise<ApprovalItem[]>;
  /** `approvals.review` — approve, deny, or dismiss one inbox item. */
  approvalsReview(req: ReviewApprovalItemRequest): Promise<{ grantId: string | null }>;
  /** `artifacts.list` — recent artifact and outcome records. */
  artifactsList(req: ListArtifactsRequest): Promise<ArtifactRecord[]>;
  /** `memory.getThreadDigest` — latest durable digest for one thread. */
  memoryGetThreadDigest(req: GetThreadDigestRequest): Promise<ThreadDigest | null>;
  /** `memory.listRunCheckpoints` — recent checkpoints for one thread, newest first. */
  memoryListRunCheckpoints(req: ListRunCheckpointsRequest): Promise<RunCheckpoint[]>;
  /** `memory.packThreadContext` — assemble and bound one thread's context. */
  memoryPackThreadContext(req: PackThreadContextRequest): Promise<PackedThreadContext>;
  /** `schedule.list` — calendar entries from manual schedule rows and source deadlines. */
  scheduleList(req: ListScheduleItemsRequest): Promise<ScheduleItem[]>;
  /** `schedule.create` — create manual scheduled work. */
  scheduleCreate(req: CreateScheduleItemRequest): Promise<CreateScheduleItemResponse>;
  /** `schedule.update` — patch one manual scheduled work item. */
  scheduleUpdate(req: UpdateScheduleItemRequest): Promise<void>;
  /** `schedule.complete` — mark one manual scheduled task complete. */
  scheduleComplete(req: CompleteScheduleItemRequest): Promise<void>;
  /** `schedule.delete` — delete one manual scheduled work item. */
  scheduleDelete(req: DeleteScheduleItemRequest): Promise<void>;

  /**
   * `employees.create` — hire a new employee from a role-pack role.
   * Looks up the role spec from the role-loader, fills in the DB row
   * fields (level, title, sha, tools), and returns the new employee id.
   */
  employeesCreate(req: HireEmployeeRequest): Promise<HireEmployeeResponse>;

  /**
   * `employees.fire` — permanently remove an employee row.
   *
   * Destructive action gated behind the command-palette confirmation
   * step (see CommandService `DESTRUCTIVE_INTENTS`). Throws if the
   * employee id does not resolve to a live row so the palette surfaces
   * a clear error instead of silently succeeding on a stale target.
   */
  employeesFire(req: { employeeId: string }): Promise<void>;

  /** `employees.update` — patch editable profile fields such as display name and title. */
  employeesUpdate(req: EmployeesUpdateRequest): Promise<EmployeesUpdateResponse>;

  /**
   * `employees.promote` — atomic role swap (Phase 5.6 M-C step d;
   * audit row 2.19; restores Cluster B M9). Resolves the new role spec
   * via the role-loader, refuses framework-internal roles + employees,
   * updates the row, and emits an `employee.promoted` bus event with
   * the full pre/post snapshot.
   */
  employeesPromote(req: EmployeesPromoteRequest): Promise<EmployeesPromoteResponse>;

  /**
   * `employees.setManager` — set or clear the org-edge whose report
   * side is the given employee (Phase 5.6 M-C step d; audit row 2.20;
   * restores Cluster B M9). `managerId === null` clears the edge
   * (report becomes a graph root); `managerId !== null` upserts via
   * the repo's cycle-checked `setManager`. Refuses framework-internal
   * employees on either side and refuses cross-company edges. Emits
   * an `employee.managerSet` bus event with the previous + new manager
   * ids so the renderer can animate the move.
   */
  employeesSetManager(req: EmployeesSetManagerRequest): Promise<void>;

  /**
   * `orgchart.get` — full org-chart projection for a company (Phase 2
   * — M9, restored under Phase 5.6 M-C step c per audit row 2.21).
   * Returns non-system employees + every reporting edge + the set of
   * root ids (employees with no manager edge).
   *
   * Defensive projection: edges that reference employees outside the
   * non-system set (e.g. a freshly-fired manager whose edges have not
   * been cleaned up by a future `employees.fire` flow) are dropped
   * at handler time so the renderer never sees a dangling edge. The
   * repo-layer `wouldCycle` guard prevents write-side corruption;
   * this read-side filter is the belt-and-suspenders complement.
   */
  orgchartGet(req: OrgchartGetRequest): Promise<OrgchartGetResponse>;

  /**
   * `chat.send` — append the user's message and enqueue an
   * orchestrator turn for the assistant reply. Returns immediately
   * after enqueue (does NOT wait for the reply); the reply streams
   * back to the renderer via the `events.dashboard` channel.
   *
   * The `threadId` may be the literal `AUTO_THREAD_ID` sentinel, in
   * which case the handler resolves it to the user↔employee DM
   * (creating one on the fly if necessary).
   *
   * Throws if the employee does not exist, or — when an explicit
   * threadId is provided — if the thread does not belong to the
   * employee's company. Both checks fail closed: the user message
   * is NOT persisted on the failing path so a 400-style rejection
   * does not litter the chat log with orphan rows.
   */
  chatSend(req: SendChatRequest): Promise<SendChatResponse>;

  /**
   * `chat.list` — return every message in a thread, oldest-first,
   * mapped to the public `ChatMessage` shape. The renderer's chat
   * drawer fetches this on mount and on every thread switch; live
   * updates after that come from the dashboard event stream rather
   * than re-polling this endpoint.
   */
  chatList(req: { threadId: string }): Promise<ChatMessage[]>;

  /** `chat.stop` — best-effort stop for the active direct-message turn on a thread. */
  chatStop(req: StopChatRequest): Promise<StopChatResponse>;

  /**
   * `chat.resolveThread` — resolve (or lazily create) the user↔employee
   * DM thread for the given employee, returning only its id. Read-ish:
   * does NOT append a message, does NOT kick the orchestrator. The
   * drawer calls this on open so it can fetch the previous chat
   * history before the user sends anything. Without it a post-reload
   * drawer has no way to know which thread to fetch — the only thread
   * resolver was `chat.send`, which required sending a real message
   * first.
   *
   * Throws if the employee does not exist. On first open for an
   * employee, creates a fresh `kind='dm'` thread between `rocky` and
   * the employee via `getOrCreateDmThread` (same path `chat.send` uses
   * for the `AUTO_THREAD_ID` sentinel), so both entry points share
   * one source of truth for DM resolution.
   */
  chatResolveThread(req: ResolveThreadRequest): Promise<ResolveThreadResponse>;

  /**
   * `chat.listThreads` — return all threads for a company with their
   * members and last-message timestamp, sorted by most-recent first.
   * The renderer uses this to populate the thread list sidebar.
   */
  chatListThreads(req: { companyId: string }): Promise<Thread[]>;

  // -----------------------------------------------------------------------
  // Events / timeline handler (Phase 3 — M14)
  // -----------------------------------------------------------------------

  /** `events.list` — paginated newest-first event list for the timeline view. */
  eventsList(req: ListEventsRequest): Promise<ListEventsResponse>;

  // -----------------------------------------------------------------------
  // MCP management handlers (Phase 2 — M10)
  // -----------------------------------------------------------------------

  /**
   * `mcp.list` — return all MCP servers available to a company.
   * Includes company-specific servers and any enabled global rows.
   */
  mcpList(req: { companyId: string }): Promise<McpServerSummary[]>;

  /**
   * `mcp.listTemplates` — return built-in MCP templates available for install.
   */
  mcpListTemplates(req: ListMcpTemplatesRequest): Promise<McpTemplateSummary[]>;

  /**
   * `mcp.toggle` — enable or disable an MCP server for a company.
   */
  mcpToggle(req: { serverId: string; enabled: boolean }): Promise<void>;

  /**
   * `mcp.addServer` — register a new MCP server (global or company-specific).
   */
  mcpAddServer(req: {
    companyId: string | null;
    name: string;
    transport: 'stdio' | 'sse';
    configJson: string;
  }): Promise<{ serverId: string }>;

  /**
   * `mcp.installTemplate` — clone a built-in template into a workspace-scoped runtime row.
   */
  mcpInstallTemplate(req: InstallMcpTemplateRequest): Promise<{ serverId: string }>;

  /**
   * `mcp.removeServer` — remove an MCP server.
   */
  mcpRemoveServer(req: { serverId: string }): Promise<void>;

  /**
   * `mcp.testConnection` — test an MCP connection without persisting.
   */
  mcpTestConnection(req: TestMcpConnectionRequest): Promise<TestMcpConnectionResponse>;

  /** `extensions.list` — installed extension metadata visible to a company. */
  extensionsList(req: ListExtensionsRequest): Promise<ExtensionSummary[]>;

  /** `extensions.installLocalSkill` — install one local skill folder into a workspace. */
  extensionsInstallLocalSkill(req: InstallLocalSkillRequest): Promise<{ extensionId: string }>;

  /** `extensions.installGithubSkill` — install one public URL-hosted skill into a workspace. */
  extensionsInstallGithubSkill(req: InstallGithubSkillRequest): Promise<{ extensionId: string }>;

  /** `extensions.removeSkill` — uninstall one skill from a workspace. */
  extensionsRemoveSkill(req: RemoveSkillRequest): Promise<void>;

  /** `extensions.listSkillAssignments` — list workspace and employee skill overlays. */
  extensionsListSkillAssignments(req: ListSkillAssignmentsRequest): Promise<SkillAssignment[]>;

  /** `extensions.upsertSkillAssignment` — create or update a workspace/employee skill overlay. */
  extensionsUpsertSkillAssignment(
    req: UpsertSkillAssignmentRequest,
  ): Promise<{ assignmentId: string }>;

  /** `extensions.deleteSkillAssignment` — delete one skill-assignment override. */
  extensionsDeleteSkillAssignment(req: { assignmentId: string }): Promise<void>;

  /** `authority.list` — authority grants relevant to a company or one employee. */
  authorityList(req: ListAuthorityGrantsRequest): Promise<AuthorityGrant[]>;

  /** `authority.listRequests` — list extension authority requests for a company. */
  authorityListRequests(req: ListAuthorityRequestsRequest): Promise<AuthorityRequest[]>;

  /** `authority.create` — create a company-default or employee-override authority grant. */
  authorityCreate(req: CreateAuthorityGrantRequest): Promise<{ grantId: string }>;

  /** `authority.delete` — delete one persisted authority grant. */
  authorityDelete(req: DeleteAuthorityGrantRequest): Promise<void>;

  /** `authority.reviewRequest` — approve or deny one extension authority request. */
  authorityReviewRequest(req: ReviewAuthorityRequestRequest): Promise<{ grantId: string | null }>;

  /** `authority.getEffective` — resolve effective authority for one employee. */
  authorityGetEffective(req: GetEffectiveAuthorityRequest): Promise<EffectiveAuthoritySnapshot>;

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
