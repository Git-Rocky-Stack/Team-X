/**
 * `window.teamx` namespaces for the system, workspaces, operators, autonomy,
 * people, chat, extensions and authority.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type {
  ApprovalItem,
  ArtifactRecord,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  ChatMessage,
  Company,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  ExtensionSummary,
  OperatorAccessEntry,
  OperatorInvite,
  PackedThreadContext,
  Routine,
  RoutineRun,
  RunCheckpoint,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  ScheduleItem,
  SkillAssignment,
  Thread,
  ThreadDigest,
} from '../entities.js';

import type { DashboardEventListener, UnsubscribeFn } from './bridge.js';
import type {
  AddMcpServerRequest,
  CreateAuthorityGrantRequest,
  GetEffectiveAuthorityRequest,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  InstallMcpTemplateRequest,
  ListAuthorityGrantsRequest,
  ListAuthorityRequestsRequest,
  McpServerSummary,
  McpTemplateSummary,
  RemoveSkillRequest,
  ReviewAuthorityRequestRequest,
  SelectDirectoryResponse,
  SelectFileResponse,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  UpsertSkillAssignmentRequest,
} from './shapes-platform.js';
import type {
  CreateScheduleItemRequest,
  CreateScheduleItemResponse,
  ListEventsRequest,
  ListEventsResponse,
  ListScheduleItemsRequest,
  OrgchartGetResponse,
  UpdateScheduleItemRequest,
} from './shapes-work.js';
import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  BindEmployeeRuntimeProfileRequest,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  CompaniesDeleteRequest,
  CompaniesUpdateRequest,
  CreateBudgetPolicyRequest,
  CreateOperatorInviteRequest,
  CreateOperatorInviteResponse,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  FireEmployeeRequest,
  GetThreadDigestRequest,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateRequest,
  InstallCompanyTemplateResponse,
  LinkCloudWorkspaceRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListBudgetLedgerEntriesRequest,
  ListCompanyTemplatesRequest,
  ListCompanyTemplatesResponse,
  ListRoutineRunsRequest,
  ListRunCheckpointsRequest,
  PackThreadContextRequest,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ReconnectCloudWorkspaceRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  ReviewApprovalItemRequest,
  RevokeOperatorInviteRequest,
  RunAgentImprovementRequest,
  RunAutonomyBenchmarkRequest,
  RunRoutineNowRequest,
  RuntimeOperationsSnapshot,
  SendChatRequest,
  SendChatResponse,
  StopChatRequest,
  StopChatResponse,
  UnlinkCloudWorkspaceRequest,
  UpdateBudgetPolicyRequest,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  ValidateRuntimeProfileRequest,
} from './shapes-workspace.js';

export interface TeamXApiWorkspace {
  system: {
    /**
     * Open a native directory picker and return the selected folder path.
     *
     * `title` names what is being picked — pass it. The handler's fallback is
     * deliberately generic; a caller-specific title is what stops one feature's
     * wording appearing in another feature's dialog.
     */
    selectDirectory(options?: { title?: string }): Promise<SelectDirectoryResponse>;
    /**
     * Open a native single-file picker filtered to `.gguf` and return the
     * selected path. Feeds `localGguf.library.addFile`.
     */
    selectGgufFile(options?: { title?: string }): Promise<SelectFileResponse>;
  };
  companies: {
    /** Return every company. Phase 1 + Phase 5.6 onwards may return many. */
    list(): Promise<Company[]>;

    /** Export one workspace as a portable Team-X package file. */
    exportPackage(req: ExportCompanyPackageRequest): Promise<ExportCompanyPackageResponse>;

    /** Read one Team-X package path or GitHub ref and return a safe import preview plus local warnings. */
    previewImportPackage(
      req: PreviewCompanyPackageImportRequest,
    ): Promise<PreviewCompanyPackageImportResponse>;

    /** Import one Team-X package as a brand-new local workspace copy. */
    importPackage(req: ImportCompanyPackageRequest): Promise<ImportCompanyPackageResponse>;

    /** List locally installed workspace templates available for reuse. */
    listTemplates(req?: ListCompanyTemplatesRequest): Promise<ListCompanyTemplatesResponse>;

    /** Install one external Team-X template package path or GitHub ref into the local template library. */
    installTemplate(req: InstallCompanyTemplateRequest): Promise<InstallCompanyTemplateResponse>;

    /**
     * Create a new company and seed its two system pseudo-employees
     * (`system-agent` + `system-copilot`) atomically before returning.
     * Phase 5.6 M-C step b — restores Cluster A multi-company CRUD
     * (Rocky's locked M7 architectural decision; audit row 10.12).
     *
     * The handler validates the request (non-empty trimmed `name`, slug
     * matching `/^[a-z0-9][a-z0-9-]{0,62}$/`), inserts the row via
     * `companiesRepo.create`, then synchronously invokes
     * `ensureSystemForCompany(companyId)` which delegates to
     * `ensureSystemAgent` + `ensureSystemCopilot` (same path used by
     * `seed.ts::seedIfEmpty` and `backupService.ensurePostRestoreSystemEmployees`).
     * After the bootstrap returns, the handler emits a `company.created`
     * bus event with the new company id + the two system employee ids
     * (architectural invariant #11) so renderer caches can invalidate.
     *
     * Throws on duplicate slug (SQL UNIQUE constraint), on invalid input,
     * or if the role-loader is missing the `system-agent` / `system-copilot`
     * specs. The IPC fails closed: a thrown bootstrap leaves the company
     * row inserted but unusable — callers should retry after fixing the
     * loader root rather than treat the row as live.
     */
    create(req: CompaniesCreateRequest): Promise<CompaniesCreateResponse>;

    /**
     * Archive (soft-delete) a company. The handler performs a three-step
     * quiesce in order BEFORE writing the row:
     *
     *   1. `CopilotAnalyzerService.stop(companyId)` — cancels any
     *      in-flight periodic tick for the company and clears the
     *      per-company timer so no new tick fires.
     *   2. `CopilotEventWindow.clear(companyId)` — drops the in-memory
     *      rolling buffer + `hydrated` flag so a future snapshot() for
     *      the same id starts from an empty state (mirrors the semantics
     *      when a company is unloaded and later reloaded).
     *   3. `companiesRepo.archive(companyId)` — flips `status` to
     *      `'archived'` so the orchestrator dispatcher treats the
     *      company as inactive on the next scheduling pass.
     *
     * The handler then emits a `company.archived` bus event (invariant
     * #11) so renderer caches can invalidate. Idempotent — re-archiving
     * an already-archived company is a no-op on all three steps.
     * Closes M33 T3 follow-up F3.
     */
    archive(companyId: string): Promise<void>;

    /**
     * Update mutable fields on an existing, non-archived company. Phase
     * 5.6 M-C step e — restores Cluster A multi-company CRUD per audit
     * row 10.13.
     *
     * Every patch field is optional; only keys present in the request
     * get written. Validation mirrors `create`: non-empty trimmed name
     * ≤120 chars, slug matching `/^[a-z0-9][a-z0-9-]{0,62}$/`, settings
     * plain-object, icon/theme string (icon accepts `null` to clear).
     * Archived companies are refused via `assertCompanyActive` — reactivate
     * first or route mutations through the archive-specific reactivation
     * path (not yet shipped; future milestone).
     *
     * The handler emits a `company.updated` bus event (invariant #11)
     * carrying the list of patched keys so renderer caches know which
     * slices of state to invalidate.
     */
    update(req: CompaniesUpdateRequest): Promise<void>;

    /**
     * Hard-delete a company AND every row scoped to it across 15 tables
     * (employees, threads, messages, tickets, projects, goals, meetings,
     * file_vault, embeddings, command_history, copilot_insights,
     * org_edges, mcp_servers, events, and more — see the `delete()` repo
     * method for the full FK-safe cascade order).
     *
     * Phase 5.6 M-C step e — restores Cluster A multi-company CRUD per
     * audit row 10.15. Destructive sibling of `archive`. The handler
     * quiesces the copilot pipeline (analyzer stop → event-window clear)
     * BEFORE the transactional sweep fires so a mid-tick analyzer cannot
     * observe rows that are about to disappear. A single `db.transaction`
     * wraps the sweep — either every company-scoped row loses the tie
     * atomically or nothing does.
     *
     * Emits a `company.deleted` bus event (invariant #11) AFTER the
     * transaction commits, carrying the captured-before-drop name + slug
     * so audit-view chips can render the identifier. The operation is
     * NOT reversible short of a backup restore; renderer surfaces MUST
     * gate this behind an explicit confirmation distinct from archive.
     */
    delete(req: CompaniesDeleteRequest): Promise<void>;
  };
  employees: {
    /** Return every employee in the given company, mapped to the public Employee shape. */
    list(companyId: string): Promise<Employee[]>;

    /**
     * Create a new employee for the given company from a role-pack role.
     * The main process resolves the role spec from the role-loader,
     * fills in level/title/sha/tools, and inserts the row.
     */
    create(req: HireEmployeeRequest): Promise<HireEmployeeResponse>;

    /**
     * Permanently remove an employee. Destructive — gated behind the
     * command-palette confirmation step when invoked via NLU. Throws
     * if the id does not resolve to a live row.
     */
    fire(req: FireEmployeeRequest): Promise<void>;

    /** Patch an employee's editable profile fields such as name, title, avatar, and runtime prefs. */
    update(req: EmployeesUpdateRequest): Promise<EmployeesUpdateResponse>;

    /**
     * Promote an employee into a different role from the role-pack
     * catalog. The handler resolves the new role spec, refuses
     * framework-internal roles + employees, updates the row's
     * roleId/level/title/roleMdSha/tools_*_json columns atomically,
     * and emits an `employee.promoted` bus event. Returns the full
     * pre/post snapshot so the renderer can render the change inline
     * without a follow-up `employees.list` round-trip. Phase 5.6
     * M-C step d — restores Cluster B per audit row 2.19.
     */
    promote(req: EmployeesPromoteRequest): Promise<EmployeesPromoteResponse>;

    /**
     * Set or clear the org-edge pointing at the given employee
     * (the report). `managerId !== null` upserts the edge via
     * `orgEdgesRepo.setManager` (with `wouldCycle` rejection);
     * `managerId === null` clears it via `removeByReport`, making
     * the report a graph root. Refuses framework-internal employees
     * on either side and refuses cross-company edges. Emits an
     * `employee.managerSet` bus event after the durable write.
     * Phase 5.6 M-C step d — restores Cluster B per audit row 2.20.
     */
    setManager(req: EmployeesSetManagerRequest): Promise<void>;
  };
  operators: {
    /** Return every operator membership for the given company. */
    list(companyId: string): Promise<OperatorAccessEntry[]>;
    /** Return sharing posture and readiness for the given company. */
    readiness(companyId: string): Promise<CompanySharingReadinessSummary>;
    /** Return pending and historical invites for the given company. */
    listInvites(companyId: string): Promise<OperatorInvite[]>;
    /** Create a new invited/cloud operator placeholder invite. */
    createInvite(req: CreateOperatorInviteRequest): Promise<CreateOperatorInviteResponse>;
    /** Revoke one outstanding operator invite. */
    revokeInvite(req: RevokeOperatorInviteRequest): Promise<OperatorInvite>;
    /** Accept one pending operator invite into a real company membership. */
    acceptInvite(req: AcceptOperatorInviteRequest): Promise<AcceptOperatorInviteResponse>;
  };
  cloud: {
    /** Return the local linked-workspace status plus stable device identity. */
    getWorkspaceLink(companyId: string): Promise<CompanyCloudLinkStatus>;
    /** Reserve local linkage metadata and move the workspace into linked posture. */
    linkWorkspace(req: LinkCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
    /** Clear local linkage metadata and return the workspace to unlinked posture. */
    unlinkWorkspace(req: UnlinkCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
    /** Clear local sync degradation and refresh the last-sync marker. */
    reconnectWorkspace(req: ReconnectCloudWorkspaceRequest): Promise<CompanyCloudLinkStatus>;
  };
  runtimeProfiles: {
    /** List runtime profiles and bound employee ids for one workspace. */
    list(companyId: string): Promise<RuntimeProfileSummary[]>;
    /** Create one runtime profile inside the current workspace. */
    create(req: CreateRuntimeProfileRequest): Promise<{ profileId: string }>;
    /** Patch one existing runtime profile. */
    update(req: UpdateRuntimeProfileRequest): Promise<void>;
    /** Delete one runtime profile and any attached employee bindings. */
    delete(profileId: string): Promise<void>;
    /** Bind or unbind one employee to a runtime profile. */
    bindEmployee(
      req: BindEmployeeRuntimeProfileRequest,
    ): Promise<{ binding: EmployeeRuntimeBinding | null }>;
    /** Run the profile-kind-specific health check and persist the result. */
    validate(req: ValidateRuntimeProfileRequest): Promise<RuntimeProfileValidation>;
  };
  runtimeOperations: {
    /** Return live runtime sessions and active ticket checkout leases for one workspace. */
    snapshot(companyId: string): Promise<RuntimeOperationsSnapshot>;
  };
  autonomyDoctor: {
    /** Run the operator health workflow and return a deterministic JSON-ready report. */
    run(companyId: string): Promise<AutonomyDoctorReport>;
  };
  autonomyBenchmark: {
    /** Run the deterministic autonomy benchmark harness for selected runtimes and scenarios. */
    run(req: RunAutonomyBenchmarkRequest): Promise<AutonomyBenchmarkReport>;
  };
  agentImprovement: {
    /** Read current agent self-improvement tickets plus recent loop history. */
    list(companyId: string): Promise<AgentImprovementSnapshot>;
    /** Run the observe -> assess -> ticket loop for one workspace. */
    run(req: RunAgentImprovementRequest): Promise<AgentImprovementRunResult>;
  };
  routines: {
    /** List routine definitions for one workspace. */
    list(companyId: string): Promise<Routine[]>;
    /** Create one routine definition inside the current workspace. */
    create(req: CreateRoutineRequest): Promise<{ routineId: string }>;
    /** Patch one existing routine definition. */
    update(req: UpdateRoutineRequest): Promise<void>;
    /** Delete one routine definition and its historical run rows. */
    delete(routineId: string): Promise<void>;
    /** List recent routine runs for a workspace or one specific routine. */
    listRuns(req: ListRoutineRunsRequest): Promise<RoutineRun[]>;
    /** Force one routine to materialize work immediately. */
    runNow(req: RunRoutineNowRequest): Promise<RoutineRun>;
  };
  budgets: {
    /** List budget policies for one workspace. */
    listPolicies(companyId: string): Promise<BudgetPolicy[]>;
    /** Create one budget policy inside the current workspace. */
    createPolicy(req: CreateBudgetPolicyRequest): Promise<{ policyId: string }>;
    /** Patch one existing budget policy. */
    updatePolicy(req: UpdateBudgetPolicyRequest): Promise<void>;
    /** Delete one budget policy. */
    deletePolicy(policyId: string): Promise<void>;
    /** List recent budget ledger entries for one workspace or scope. */
    listLedger(req: ListBudgetLedgerEntriesRequest): Promise<BudgetLedgerEntry[]>;
    /** Return the current monthly overview and per-policy status. */
    getOverview(companyId: string): Promise<BudgetOverview>;
    /** List approval items currently raised by budget policy. */
    listApprovals(req: ListApprovalItemsRequest): Promise<ApprovalItem[]>;
  };
  approvals: {
    /** List unified approval work across budget, authority, and future control-plane sources. */
    list(req: ListApprovalItemsRequest): Promise<ApprovalItem[]>;
    /** Approve, deny, or dismiss one approval item from the shared inbox. */
    review(req: ReviewApprovalItemRequest): Promise<{ grantId: string | null }>;
  };
  artifacts: {
    /** List recent artifact and outcome records for one workspace. */
    list(req: ListArtifactsRequest): Promise<ArtifactRecord[]>;
  };
  memory: {
    /** Return the latest durable digest for one thread, if Team-X has condensed it yet. */
    getThreadDigest(req: GetThreadDigestRequest): Promise<ThreadDigest | null>;
    /** Return recent resumable checkpoints for one thread, newest first. */
    listRunCheckpoints(req: ListRunCheckpointsRequest): Promise<RunCheckpoint[]>;
    /** Assemble and bound one thread's context into the next runtime-ready pack. */
    packThreadContext(req: PackThreadContextRequest): Promise<PackedThreadContext>;
  };
  schedule: {
    /** Return calendar entries: manual scheduled work plus ticket/project/goal deadlines. */
    list(req: ListScheduleItemsRequest): Promise<ScheduleItem[]>;
    /** Create a manual scheduled item, optionally linked to an employee, ticket, project, or goal. */
    create(req: CreateScheduleItemRequest): Promise<CreateScheduleItemResponse>;
    /** Patch one manual scheduled item. Derived deadline entries are read-only. */
    update(req: UpdateScheduleItemRequest): Promise<void>;
    /** Complete one manual scheduled task and cancel its pending wakeup, if any. */
    complete(scheduleItemId: string): Promise<void>;
    /** Delete one manual scheduled item and cancel its pending wakeup, if any. */
    delete(scheduleItemId: string): Promise<void>;
  };
  orgchart: {
    /**
     * Full org-chart projection for a company — employees, reporting
     * edges, and graph roots in one round-trip. Framework-internal
     * system pseudo-employees (`system-agent` / `system-copilot`) are
     * filtered out of both `employees` and `edges` on the main side so
     * the renderer never has to special-case them. Phase 2 — M9;
     * restored under Phase 5.6 M-C step c per audit row 2.21.
     */
    get(companyId: string): Promise<OrgchartGetResponse>;
  };
  chat: {
    /**
     * Append the user's message to a thread and enqueue an assistant
     * turn. Returns as soon as the user message is persisted — the
     * reply streams in via `events.onDashboard` token-delta events.
     *
     * Pass `threadId: 'auto'` to resolve the user↔employee DM thread
     * (creating it on first send). The response echoes the actually-
     * resolved thread id so the renderer can cache it for subsequent
     * sends in the same drawer session.
     */
    send(req: SendChatRequest): Promise<SendChatResponse>;

    /** Return every message in a thread, oldest-first, mapped to ChatMessage shape. */
    list(threadId: string): Promise<ChatMessage[]>;

    /** Best-effort stop for the active direct-message turn on a thread. */
    stop(req: StopChatRequest): Promise<StopChatResponse>;

    /**
     * Resolve (or lazily create) the user↔employee DM thread for the
     * given employee.  The drawer calls this on open so it can fetch
     * the existing chat history before the user sends anything — a
     * post-reload drawer has no cached thread id, and without this
     * call the only way to rehydrate was to send a new message.
     */
    resolveThread(req: ResolveThreadRequest): Promise<ResolveThreadResponse>;

    /** Return all threads for the given company with members and last-message timestamp. */
    listThreads(companyId: string): Promise<Thread[]>;
  };
  events: {
    /**
     * Subscribe to the live dashboard event stream. The callback runs
     * for every event emitted by the orchestrator's event bus in the
     * main process — token deltas, work lifecycle, employee status
     * changes. Returns an unsubscribe function that MUST be called
     * when the subscriber is no longer interested (e.g. React
     * `useEffect` cleanup) so dead listeners don't accumulate.
     */
    onDashboard(listener: DashboardEventListener): UnsubscribeFn;

    /**
     * Fetch a paginated page of persisted events for the timeline view.
     * Returns newest-first. Pass the `nextCursor` from the previous
     * response to fetch the next page; `null` means no more pages.
     */
    list(req: ListEventsRequest): Promise<ListEventsResponse>;
  };
  mcp: {
    /** List runtime MCP servers available to a company, excluding disabled built-in templates. */
    list(companyId: string): Promise<McpServerSummary[]>;
    /** List built-in MCP templates that can be installed into a workspace. */
    listTemplates(companyId: string): Promise<McpTemplateSummary[]>;
    /** Enable or disable an MCP server. Connects/disconnects as needed. */
    toggle(serverId: string, enabled: boolean): Promise<void>;
    /** Register a new MCP server and attempt immediate connection. */
    addServer(req: AddMcpServerRequest): Promise<{ serverId: string }>;
    /** Install one built-in MCP template into a workspace and attempt immediate connection. */
    installTemplate(req: InstallMcpTemplateRequest): Promise<{ serverId: string }>;
    /** Disconnect and remove an MCP server. */
    removeServer(serverId: string): Promise<void>;
    /** Test an MCP connection without persisting. */
    testConnection(req: TestMcpConnectionRequest): Promise<TestMcpConnectionResponse>;
  };
  extensions: {
    /** List installed skill/extension metadata visible to a company. */
    list(companyId: string): Promise<ExtensionSummary[]>;
    /** Install a local Team-X skill folder into the current workspace. */
    installLocalSkill(req: InstallLocalSkillRequest): Promise<{ extensionId: string }>;
    /** Install a public URL-hosted Team-X skill into the current workspace. */
    installGithubSkill(req: InstallGithubSkillRequest): Promise<{ extensionId: string }>;
    /** Remove an installed Team-X skill from the current workspace. */
    removeSkill(req: RemoveSkillRequest): Promise<void>;
    /** List workspace and employee assignment overlays for installed skills. */
    listSkillAssignments(companyId: string): Promise<SkillAssignment[]>;
    /** Upsert a workspace-default or employee-override assignment for one skill. */
    upsertSkillAssignment(req: UpsertSkillAssignmentRequest): Promise<{ assignmentId: string }>;
    /** Delete one persisted skill-assignment override. */
    deleteSkillAssignment(assignmentId: string): Promise<void>;
  };
  authority: {
    /** List authority grants relevant to a company, optionally narrowed to one employee. */
    list(req: ListAuthorityGrantsRequest): Promise<AuthorityGrant[]>;
    /** List extension authority requests for a company, typically pending review only. */
    listRequests(req: ListAuthorityRequestsRequest): Promise<AuthorityRequest[]>;
    /** Create a company-default or employee-override authority grant. */
    create(req: CreateAuthorityGrantRequest): Promise<{ grantId: string }>;
    /** Delete one persisted authority grant. */
    delete(grantId: string): Promise<void>;
    /** Approve or deny one pending extension authority request. */
    reviewRequest(req: ReviewAuthorityRequestRequest): Promise<{ grantId: string | null }>;
    /** Resolve effective authority for one employee. */
    getEffective(req: GetEffectiveAuthorityRequest): Promise<EffectiveAuthoritySnapshot>;
  };
}
