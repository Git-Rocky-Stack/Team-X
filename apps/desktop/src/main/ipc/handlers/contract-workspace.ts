/**
 * IPC handler contract, first half: workspaces, operators, autonomy, schedule,
 * people, chat, extensions and authority.
 * Split from contract.ts so neither half needs a size exception (audit 2026-10-07 P1-7).
 */

import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  ApprovalItem,
  ArchiveCompanyRequest,
  ArtifactRecord,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BindEmployeeRuntimeProfileRequest,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  ChatMessage,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  CompaniesDeleteRequest,
  CompaniesUpdateRequest,
  Company,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  CompleteScheduleItemRequest,
  CreateAuthorityGrantRequest,
  CreateBudgetPolicyRequest,
  CreateOperatorInviteRequest,
  CreateOperatorInviteResponse,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  CreateScheduleItemRequest,
  CreateScheduleItemResponse,
  DeleteAuthorityGrantRequest,
  DeleteBudgetPolicyRequest,
  DeleteRoutineRequest,
  DeleteRuntimeProfileRequest,
  DeleteScheduleItemRequest,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  ExtensionSummary,
  GetBudgetOverviewRequest,
  GetCloudWorkspaceLinkRequest,
  GetEffectiveAuthorityRequest,
  GetOperatorSharingReadinessRequest,
  GetThreadDigestRequest,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateRequest,
  InstallCompanyTemplateResponse,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  InstallMcpTemplateRequest,
  LinkCloudWorkspaceRequest,
  ListAgentImprovementRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListAuthorityGrantsRequest,
  ListAuthorityRequestsRequest,
  ListBudgetLedgerEntriesRequest,
  ListBudgetPoliciesRequest,
  ListCompanyTemplatesRequest,
  ListCompanyTemplatesResponse,
  ListEventsRequest,
  ListEventsResponse,
  ListExtensionsRequest,
  ListMcpTemplatesRequest,
  ListOperatorInvitesRequest,
  ListOperatorsRequest,
  ListRoutineRunsRequest,
  ListRoutinesRequest,
  ListRunCheckpointsRequest,
  ListRuntimeOperationsRequest,
  ListRuntimeProfilesRequest,
  ListScheduleItemsRequest,
  ListSkillAssignmentsRequest,
  McpServerSummary,
  McpTemplateSummary,
  OperatorAccessEntry,
  OperatorInvite,
  OrgchartGetRequest,
  OrgchartGetResponse,
  PackThreadContextRequest,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ReconnectCloudWorkspaceRequest,
  RemoveSkillRequest,
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
  SkillAssignment,
  StopChatRequest,
  StopChatResponse,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  Thread,
  ThreadDigest,
  UnlinkCloudWorkspaceRequest,
  UpdateBudgetPolicyRequest,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  UpdateScheduleItemRequest,
  UpsertSkillAssignmentRequest,
  ValidateRuntimeProfileRequest,
} from '@team-x/shared-types';

export interface IpcHandlersWorkspace {
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
}
