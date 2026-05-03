/**
 * IPC handlers — pure factory exposing the three Phase 1 channels
 * (`employees.list`, `chat.send`, `chat.list`) as plain async functions.
 *
 * Why a pure factory:
 *
 *   This module has zero electron imports on purpose. The electron
 *   surface (`ipcMain.handle`, `BrowserWindow`, `webContents.send`)
 *   lives in `./register.ts`. That split lets the entire request /
 *   response lifecycle of every IPC channel be unit-tested with
 *   in-memory repos and a stub orchestrator — `vitest run` never
 *   has to load Electron's native binding, the renderer never has
 *   to be alive, and a test failure points straight at the handler
 *   logic instead of getting buried under Electron mocks.
 *
 *   `register.ts` is a thin glue layer that wires the same handlers
 *   into `ipcMain.handle`, so the integration path is exactly one
 *   un-tested electron call per channel. That's the same trade-off
 *   the rest of the project makes (pure factories with cross-driver
 *   generic typing for everything DB-touching, electron-bound
 *   wrappers for the actual `app.whenReady()` wiring).
 *
 * Phase 1 chat semantics:
 *
 *   `chat.send` accepts an "auto" sentinel for `threadId` which the
 *   handler resolves to the user↔employee DM thread (creating it if
 *   it doesn't exist). The renderer's `ChatDrawer` component (T42)
 *   uses this on the very first message — every subsequent message
 *   in the same drawer session keeps using the resolved id. The
 *   `messageId` returned to the renderer is the row id of the
 *   USER's just-appended message, not the assistant's reply: the
 *   reply id is delivered live via the `events.dashboard` channel
 *   as part of `work.started` / `token.delta` events.
 *
 *   Legacy compatibility note: Team-X's historical chat, thread, and
 *   audit rows already use `HUMAN_USER_ID = 'rocky'`. The operator
 *   foundation now backs that durable id with a bootstrapped local
 *   owner operator row so existing history stays attributable while
 *   the product moves toward a proper multi-operator model.
 */

import {
  AUTONOMY_BENCHMARK_SCENARIO_IDS,
  AUTO_THREAD_ID,
  BUDGET_SCOPE_KINDS,
  COMPANY_PACKAGE_MODES,
  CONCURRENCY_SETTINGS_CLAMPS,
  COPILOT_CATEGORIES,
  DEFAULT_CONCURRENCY_CAPS,
  OPERATOR_MEMBERSHIP_ROLES,
  PRIVACY_TIER_RANK,
  ROUTINE_TRIGGER_KINDS,
  RUNTIME_PROFILE_KINDS,
  SHARED_OPERATOR_AUTH_MODES,
  STRATEGY_SLOTS,
  TELEMETRY_RUN_KINDS,
  getLevelRank,
} from '@team-x/shared-types';
import type {
  AcceptOperatorInviteRequest,
  AcceptOperatorInviteResponse,
  ActorKind,
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
  AssembledThreadContext,
  AssignTicketRequest,
  AttachFileRequest,
  AttachFileResponse,
  AuditEvent,
  AuditExportRequest,
  AuditExportResponse,
  AuditFilter,
  AuditStats,
  AuthorKind,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BackupCreateRequest,
  BackupCreateResponse,
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
  CompanyPackageSecretBinding,
  CompanySettings,
  CompanySharingReadinessSummary,
  CompanyStatus,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotWeightsChangedPayload,
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
  CreateTicketRequest,
  CreateTicketResponse,
  DashboardEvent,
  DeleteAuthorityGrantRequest,
  DeleteBudgetPolicyRequest,
  DeleteGoalRequest,
  DeleteProjectRequest,
  DeleteRoutineRequest,
  DeleteRuntimeProfileRequest,
  DetachFileRequest,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  EmployeeStatus,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  EndMeetingResponse,
  EventType,
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
  GoalStatus,
  HardwareProfile,
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
  ListSkillAssignmentsRequest,
  ListTicketsRequest,
  McpServerSummary,
  McpTemplateSummary,
  Meeting,
  MeetingActionItem,
  MeetingDetail,
  MeetingMode,
  MeetingStatus,
  OperatorAccessEntry,
  OperatorInvite,
  OrgchartEdge,
  OrgchartGetRequest,
  OrgchartGetResponse,
  PackThreadContextRequest,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  Project,
  ProjectDetail,
  ProjectPriority,
  ProjectStatus,
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
  RoleSpec,
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
  SendChatRequest,
  SendChatResponse,
  SettingsGetAgenticResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
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
  TelemetryRunKind,
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  TestProviderConnectionRequest,
  TestProviderConnectionResponse,
  Thread,
  ThreadDigest,
  Ticket,
  TicketAttachment,
  TicketDetail,
  TicketPriority,
  TicketStatus,
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

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';
import type { CopilotExportFilter, CopilotExportResult } from '../db/repos/copilot-insights.js';
import {
  COPILOT_SEVERITIES,
  serializeCopilotInsightsCsv,
  serializeCopilotInsightsJson,
} from '../db/repos/copilot-insights.js';
import type {
  CreateEmployeeInput,
  EmployeeRow,
  PromoteEmployeeInput,
  UpdateEmployeeProfileInput,
} from '../db/repos/employees.js';
import type { EventRow } from '../db/repos/events.js';
import type {
  AuthorityGrantRow,
  AuthorityRequestRow,
  ExtensionRow,
} from '../db/repos/extensions.js';
import type { CreateGoalInput, GoalRow, UpdateGoalInput } from '../db/repos/goals.js';
import type { McpServersRepo } from '../db/repos/mcp-servers.js';
import type { MeetingRow } from '../db/repos/meetings.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';
import type { CreateProjectInput, ProjectRow, UpdateProjectInput } from '../db/repos/projects.js';
import type {
  CompanyStats,
  CostBreakdownRow,
  DailyUsageRow,
  EmployeeStatsRow,
  RecentRunRow,
} from '../db/repos/runs.js';
import type {
  AddThreadMemberInput,
  CreateThreadInput,
  GetOrCreateDmThreadInput,
  ThreadMemberRow,
  ThreadRow,
  ThreadWithMembers,
} from '../db/repos/threads.js';
import type { CreateTicketInput, TicketRow, UpdateTicketInput } from '../db/repos/tickets.js';
import type { createMeetingService } from '../orchestrator/meeting-service.js';

/**
 * Hardcoded id of the (single) human user in Phase 1. Replaced by a
 * real users table in Phase 2 — the constant is exported so the IPC
 * register layer and any future settings UI can reference one source.
 */
export const HUMAN_USER_ID = 'rocky';

/**
 * Re-export shared-types symbols that handler consumers (tests, the
 * register layer) have historically imported from this module. Keeping
 * the re-export preserves the existing call sites while making
 * shared-types the single source of truth for the string sentinel and
 * the request/response shapes.
 */
export { AUTO_THREAD_ID };
export type {
  HireEmployeeRequest,
  HireEmployeeResponse,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
};

// ---------------------------------------------------------------------------
// Repo shapes (narrow structural interfaces)
// ---------------------------------------------------------------------------
//
// Same rationale as orchestrator/index.ts — we declare exactly the methods
// the handlers actually use so tests can hand-roll fakes without depending
// on drizzle's BetterSQLite3Database<Schema> generic. The real
// `createXRepo(db)` return values structurally satisfy these.

export interface IpcCompaniesRepo {
  list(): CompanyRow[];
  /**
   * Insert a new company row and return its generated id. Backs the
   * `companies.create` IPC handler (Phase 5.6 M-C step b — restores
   * Cluster A multi-company CRUD per audit row 10.12). The repo write
   * is the SQL-layer step; the IPC handler additionally invokes the
   * system-employee bootstrap and emits the `company.created` bus event
   * to satisfy architectural invariant #11.
   */
  create(input: {
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
    icon?: string;
    theme?: string;
  }): string;
  /** Look up a company by id — used by the create handler to project the row → public Company shape after insertion. */
  getById(id: string): CompanyRow | null;
  /**
   * Soft-delete a company — sets status to 'archived' (M33 F3).
   * Idempotent. Handler must have called `CopilotAnalyzerService.stop`
   * + `CopilotEventWindow.clear` BEFORE this write so a racing
   * analyzer tick cannot observe a stale buffer after the row flips.
   */
  archive(id: string): void;
  /**
   * Update mutable fields — only keys present in `patch` get written;
   * empty patch is a SQL no-op. Phase 5.6 M-C step e — backs the
   * `companies.update` IPC handler per audit row 10.13. The handler
   * pre-validates with `assertCompanyActive` + shape checks so this
   * method never sees an archived or malformed-input call.
   */
  update(id: string, patch: UpdateCompanyInput): void;
  /**
   * Hard-delete a company AND every row scoped to it across 15 tables
   * in a single transaction. Phase 5.6 M-C step e — backs the
   * `companies.delete` IPC handler per audit row 10.15. The handler
   * must have called `CopilotAnalyzerService.stop` + `CopilotEventWindow.clear`
   * BEFORE this sweep so a mid-tick analyzer cannot observe rows that
   * are about to disappear (mirrors `archive()`'s quiesce contract).
   * No-op on unknown id.
   */
  delete(id: string): void;
}

export interface IpcEmployeesRepo {
  listByCompany(companyId: string): EmployeeRow[];
  /**
   * Non-system employees only — filtered by `is_system = 0`. Used by
   * `employees.list` to hide the framework-internal `system-agent`
   * pseudo-employee from the renderer.
   */
  listVisibleByCompany(companyId: string): EmployeeRow[];
  getById(id: string): EmployeeRow | null;
  /**
   * Look up the system pseudo-employee for a company + roleId, or null
   * if none has been seeded yet. Backs `ensureSystemAgent` idempotency.
   */
  findSystemByRoleId(companyId: string, roleId: string): EmployeeRow | null;
  create(input: CreateEmployeeInput): string;
  delete(id: string): void;
  /**
   * Atomic role swap — backs the `employees.promote` IPC handler.
   * Phase 5.6 M-C step d (audit row 2.19). Updates the role-bound
   * columns in place; does NOT touch org-edges.
   */
  promote(input: PromoteEmployeeInput): void;
  updateProfile?(input: UpdateEmployeeProfileInput): void;
}

export interface IpcThreadsRepo {
  create(input: CreateThreadInput): string;
  getById(id: string): ThreadRow | null;
  addMember(input: AddThreadMemberInput): void;
  removeMember(input: AddThreadMemberInput): void;
  listMembers(threadId: string): ThreadMemberRow[];
  getOrCreateDmThread(input: GetOrCreateDmThreadInput): string;
  updateLastMessageAt(threadId: string, timestamp: number): void;
  listByCompanyWithMembers(companyId: string): ThreadWithMembers[];
}

export interface IpcMessagesRepo {
  append(input: AppendMessageInput): string;
  listByThread(threadId: string): MessageRow[];
}

export interface IpcTicketsRepo {
  create(input: CreateTicketInput): string;
  getById(id: string): TicketRow | null;
  listByCompany(companyId: string): TicketRow[];
  listByAssignee(assigneeId: string): TicketRow[];
  update(id: string, input: UpdateTicketInput): void;
  assign(id: string, assigneeId: string): void;
  setThreadId(id: string, threadId: string): void;
  close(id: string): void;
  reopen(id: string): void;
}

export interface IpcTicketAttachmentsRepo {
  attach(ticketId: string, fileId: string, attachedBy: string): string;
  detachByFile(ticketId: string, fileId: string): void;
  listByTicket(
    ticketId: string,
  ): { id: string; ticketId: string; fileId: string; attachedBy: string; attachedAt: number }[];
}

export interface IpcGoalsRepo {
  create(input: CreateGoalInput): string;
  getById(id: string): GoalRow | null;
  listByCompany(companyId: string): GoalRow[];
  update(id: string, input: UpdateGoalInput): void;
  delete(id: string): void;
  recalcProgress(id: string): void;
}

export interface IpcProjectsRepo {
  create(input: CreateProjectInput): string;
  getById(id: string): ProjectRow | null;
  listByCompany(companyId: string): ProjectRow[];
  listByGoal(goalId: string): ProjectRow[];
  update(id: string, input: UpdateProjectInput): void;
  delete(id: string): void;
  linkTicket(projectId: string, ticketId: string): void;
  unlinkTicket(projectId: string, ticketId: string): void;
  listTickets(projectId: string): string[];
  countTicketsByStatus(projectId: string): { total: number; done: number };
}

/**
 * Org-edges repo surface the IPC layer consumes. `orgchart.get` reads
 * `listByCompany`; `employees.setManager` (M-C step d, audit row 2.20)
 * adds the write surface — `setManager` (upsert with built-in
 * `wouldCycle` rejection), `removeByReport` (clears the report's
 * manager edge), `getByReport` (snapshot the previous manager id for
 * the `employee.managerSet` event payload), and `wouldCycle` (exposed
 * for handler-level pre-check messaging — the repo's `setManager` also
 * runs the same guard internally so the IPC fails closed).
 */
export interface IpcOrgEdgesRepo {
  listByCompany(companyId: string): OrgEdgeRow[];
  /** Look up the existing edge whose `report_id = reportId`, or null. M-C step d. */
  getByReport(reportId: string): OrgEdgeRow | null;
  /**
   * Atomically upsert the edge pointing at the report (cycle-checked +
   * snapshot-reading inside a single transaction). Returns the new edge
   * id AND the previous manager id (null if the report had no manager).
   * Throws on directed-cycle rejection — the IPC handler catches the
   * `[org-edges] setManager: would create cycle` prefix and rewraps
   * with a friendlier renderer-facing message.
   *
   * Phase 5.6 M-C step d hardening (BUG-003 + BUG-004): the prior
   * implementation returned just the edge id and ran cycle-check +
   * write in two separate statements (TOCTOU window). The hardening
   * pass wrapped both in `db.transaction` and snapshots the previous
   * manager id in the same atomic step.
   */
  setManager(input: {
    companyId: string;
    managerId: string;
    reportId: string;
  }): { edgeId: string; previousManagerId: string | null };
  /**
   * Atomically clear the edge whose `report_id = reportId` AND return
   * the previous manager id snapshot. No-op (returns
   * `{ previousManagerId: null }`) when no edge exists. M-C step d
   * hardening (BUG-004) — wraps snapshot + delete in a transaction.
   */
  removeByReport(reportId: string): { previousManagerId: string | null };
  /**
   * Best-effort cycle pre-check exposed for diagnostic / dev-tooling
   * use. The IPC handler does NOT call this directly anymore — the
   * repo's `setManager` runs an atomic cycle check inside its own
   * transaction (M-C step d hardening eliminated the handler-side
   * pre-check that previously had a TOCTOU race with the repo write).
   */
  wouldCycle(companyId: string, managerId: string, reportId: string): boolean;
}

/**
 * The narrow slice of the orchestrator the IPC layer needs. Decouples
 * the handlers from the full `Orchestrator` interface so tests can pass
 * a single-method stub.
 */
export interface IpcOrchestrator {
  enqueueChat(args: {
    threadId: string;
    employeeId: string;
    userMessageId: string;
  }): Promise<void>;
  stopThread(threadId: string): boolean;
  updateConcurrency(args: {
    slots?: number;
    providerCaps?: Record<string, number>;
  }): void;
}

/**
 * Narrow slice of the role-loader the IPC layer needs for hire flow.
 * Decouples the handler from the full `RoleLoader` interface.
 */
export interface IpcRoleLookup {
  getSpec(roleId: string): RoleSpec | null;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

import type { AuthorityResolverService } from '../services/authority-resolver-service.js';
import type { ExtensionsRegistryService } from '../services/extensions-registry-service.js';
import type { McpHost } from '../services/mcp-host.js';
import { pickStrategy } from '../services/runtime-strategy.js';

export interface IpcEventsRepo {
  listByCompany(companyId: string, cursor: number | undefined, limit: number): EventRow[];
}

export interface IpcRunsRepo {
  companyStats(companyId: string, kind?: TelemetryRunKind): CompanyStats;
  dailyUsage(
    companyId: string,
    fromMs: number,
    toMs: number,
    kind?: TelemetryRunKind,
  ): DailyUsageRow[];
  employeeStats(companyId: string, kind?: TelemetryRunKind): EmployeeStatsRow[];
  recentRuns(companyId: string, limit: number, kind?: TelemetryRunKind): RecentRunRow[];
  costBreakdown(
    companyId: string,
    fromMs?: number,
    toMs?: number,
    kind?: TelemetryRunKind,
  ): CostBreakdownRow[];
}

export interface IpcAuthorityRepo {
  createGrant(input: {
    scopeKind: 'company' | 'employee' | 'extension';
    scopeId: string;
    resourceKind: 'capability' | 'path';
    resourceId: string;
    permission: 'allow' | 'deny' | 'prompt';
    metadataJson?: string | null;
  }): string;
  getGrantById(id: string): AuthorityGrantRow | null;
  listByCompany(companyId: string): AuthorityGrantRow[];
  listForEmployee(companyId: string, employeeId: string): AuthorityGrantRow[];
  deleteGrant(id: string): void;
  deleteGrantsByScope(scopeKind: 'company' | 'employee' | 'extension', scopeId: string): void;
  createRequest(input: {
    extensionId: string;
    employeeId?: string | null;
    resourceKind: 'capability' | 'path';
    resourceId: string;
    requestedPermission: 'allow' | 'deny' | 'prompt';
    status?: 'pending' | 'approved' | 'denied';
    reason?: string | null;
    reviewedAt?: number | null;
  }): string;
  getRequestById(id: string): AuthorityRequestRow | null;
  listRequestsByCompany(
    companyId: string,
    status?: 'pending' | 'approved' | 'denied',
  ): AuthorityRequestRow[];
  reviewRequest(input: {
    requestId: string;
    status: 'approved' | 'denied';
    reason?: string | null;
    reviewedAt?: number | null;
  }): void;
}

export interface IpcMeetingsRepo {
  getById(id: string): MeetingRow | null;
  listByCompany(companyId: string): MeetingRow[];
}

export type IpcMeetingService = ReturnType<typeof createMeetingService>;

/** Narrow providers-service surface the IPC handlers need. */
export interface IpcProvidersService {
  list(): ProviderConfig[];
  get(id: string): ProviderConfig | null;
  add(provider: {
    name: string;
    kind: import('@team-x/shared-types').ProviderKind;
    privacyTier: import('@team-x/shared-types').PrivacyTier;
    configJson?: string;
    enabled?: boolean;
  }): ProviderConfig;
  update(id: string, fields: { name?: string; enabled?: boolean; configJson?: string }): void;
  remove(id: string): Promise<void>;
  isConfigured(id: string): Promise<boolean>;
}

/** Narrow secrets-store surface the IPC handlers need. */
export interface IpcSecretsStore {
  setApiKey(providerId: string, key: string): Promise<void>;
}

/** Narrow backup-service surface the IPC handlers need. */
export interface IpcBackupService {
  create(
    destination?: string,
  ): Promise<{ backupPath: string; manifest: import('@team-x/shared-types').BackupManifest }>;
  restore(backupPath: string): Promise<import('@team-x/shared-types').BackupManifest>;
  list(): Promise<BackupEntry[]>;
  /**
   * Post-restore sweep that re-bootstraps `system-agent` +
   * `system-copilot` for every company in the restored DB. Handler
   * composes `listCompanyIds` + `ensureSystemForCompany` from the
   * live db + roleLookup so the backup service stays free of
   * drizzle + role-loader imports. Phase 5 — M33 follow-up F4.
   */
  ensurePostRestoreSystemEmployees(args: {
    listCompanyIds: () => string[];
    ensureSystemForCompany: (companyId: string) => {
      agentCreated: boolean;
      copilotCreated: boolean;
    };
  }): {
    companiesScanned: number;
    agentsCreated: number;
    copilotsCreated: number;
    perCompany: Array<{
      companyId: string;
      agentCreated: boolean;
      copilotCreated: boolean;
    }>;
    skipped: Array<{ companyId: string; reason: string }>;
  };
}

/** Narrow vault-service surface the IPC handlers need. */
export interface IpcVaultService {
  store(
    companyId: string,
    sourcePath: string,
    uploadedBy: string,
    tags?: string[],
    uploadedByKind?: ActorKind,
  ): Promise<string>;
  retrieve(fileId: string): Promise<{ file: VaultFile; absolutePath: string }>;
  verify(fileId: string): Promise<{ ok: boolean; expected: string; actual: string }>;
  remove(fileId: string): Promise<void>;
  search(companyId: string, query: string): VaultSearchResult[];
  list(companyId: string): VaultFile[];
  get(fileId: string): VaultFile | null;
  stats(companyId: string): { fileCount: number; totalBytes: number };
}

/** Narrow audit-repo surface the IPC handlers need. */
export interface IpcAuditRepo {
  list(filter: AuditFilter): EventRow[];
  stats(companyId: string): AuditStats;
  exportJson(filter: AuditFilter): string;
  exportCsv(filter: AuditFilter): string;
  distinctEventTypes(companyId: string): string[];
}

/** Narrow copilot-insights repo surface the IPC export handler needs. */
export interface IpcCopilotInsightsRepo {
  listActiveForExport(filter: CopilotExportFilter): CopilotExportResult;
}

/** Narrow settings-repo surface the IPC handlers need. */
export interface IpcSettingsRepo {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  /** Agentic loop budgets — snapshot read. Phase 5 — M31. */
  getAgentic(): SettingsGetAgenticResponse;
  /** Agentic loop budgets — clamped write. Phase 5 — M31. */
  setAgentic(req: SettingsSetAgenticRequest): void;
  /** Task planner guardrails — snapshot read. Phase 5 — M32. */
  getPlanner(): SettingsGetPlannerResponse;
  /** Task planner guardrails — clamped/validated write. Phase 5 — M32. */
  setPlanner(req: SettingsSetPlannerRequest): void;
  /** Extensions & Authority autonomy policy. */
  getExtensions?(): SettingsGetExtensionsResponse;
  /** Extensions & Authority autonomy policy write. */
  setExtensions?(req: SettingsSetExtensionsRequest): void;
  /** Long-run memory defaults — snapshot read. */
  getMemory?(): SettingsGetMemoryResponse;
  /** Long-run memory defaults — clamped write. */
  setMemory?(req: SettingsSetMemoryRequest): void;
  /** Copilot service settings — snapshot read (clamped). Phase 5 — M33. */
  getCopilot(): SettingsGetCopilotResponse;
  /** Copilot service settings — clamped/filtered write. Phase 5 — M33. */
  setCopilot(req: SettingsSetCopilotRequest): void;
  /** Copilot feedback weights — snapshot read. Phase 6 — M38. */
  getCopilotWeights(): SettingsGetCopilotWeightsResponse;
  /** Copilot feedback weights — clamped partial write. Phase 6 — M38. */
  setCopilotWeights(req: SettingsSetCopilotWeightsRequest): SettingsSetCopilotWeightsResponse;
  /** Proactive execution settings — snapshot read. Phase 6 — Proactive Execution System. */
  getProactive(): SettingsGetProactiveResponse;
  /** Proactive execution settings — validated partial write. Phase 6 — Proactive Execution System. */
  setProactive(req: SettingsSetProactiveRequest): void;
}

/**
 * Narrow copilot-analyzer-service surface the IPC handlers need for the
 * `settings.setCopilot` side effect (restart the per-company timer so
 * a new interval / enabled / categories picks up without an app
 * restart). The full service surface lives in
 * `main/services/copilot-analyzer-service.ts`; this interface pulls in
 * only the one method the IPC boundary requires.
 *
 * Phase 5 — M33 T7.
 */
export interface IpcCopilotAnalyzerService {
  /** Restart the per-company analyzer timer. No-ops if the timer isn't running. */
  restart(companyId: string): void;
  /**
   * Hard-stop the per-company analyzer timer and abort any in-flight
   * tick. Used by `companies.archive` to quiesce the analyzer before
   * the row flips (M33 F3). No-op if the timer isn't running.
   */
  stop(companyId: string): void;
}

/**
 * Narrow slice of the `CopilotEventWindow` the IPC handlers need.
 * `companies.archive` calls `clear(companyId)` to drop the in-memory
 * rolling buffer + `hydrated` flag so any future snapshot for the
 * same id starts empty (M33 F3).
 *
 * The full window service lives in
 * `main/services/copilot-event-window.ts`; this interface exposes
 * only the `clear` method the IPC boundary requires.
 */
export interface IpcCopilotEventWindow {
  clear(companyId: string): void;
}

/**
 * Narrow event-bus surface the IPC handlers need (M33 F3). Only
 * `emit` is exposed — replay / subscribe live on the richer
 * `EventBus` interface but are not used from handlers. Optional
 * so existing tests that do not need emit can omit it; handlers
 * that need to emit MUST tolerate `undefined` and fall back to a
 * no-op with a warning so a missing wiring is caught in dev but
 * does not take down the IPC call.
 */
export interface IpcEventBus {
  /**
   * Return type is intentionally `void` at this boundary — the handler
   * discards the emitted event. The production `EventBus.emit` returns
   * `DashboardEvent<T>`; narrowing to `void` keeps the handler-facing
   * surface minimal and side-steps `lint/suspicious/noConfusingVoidType`.
   */
  emit<T = unknown>(input: {
    type: EventType;
    companyId: string;
    actorId: string;
    actorKind: ActorKind;
    payload: T;
  }): void;
}

/** Narrow updater-service surface the IPC handlers need. */
export interface IpcUpdaterService {
  checkForUpdate(): Promise<UpdateCheckResult>;
  downloadAndInstall(): Promise<UpdateInstallResult>;
}

/** Narrow skills-service surface the IPC handlers need. */
export interface IpcSkillsService {
  installLocal(input: InstallLocalSkillRequest): Promise<{ extensionId: string }>;
  installGithub(input: InstallGithubSkillRequest): Promise<{ extensionId: string }>;
  removeSkill(input: RemoveSkillRequest): Promise<ExtensionRow>;
  listAssignments(companyId: string): SkillAssignment[];
  upsertAssignment(input: UpsertSkillAssignmentRequest): string;
  deleteAssignment(assignmentId: string): void;
}

export interface IpcOperatorAccessService {
  ensureLocalOwnerForCompany(companyId: string): { operatorId: string; membershipId: string };
  resolveOperatorIdForCompany(companyId: string, preferredOperatorId?: string | null): string;
  listByCompany(companyId: string): OperatorAccessEntry[];
  listInvitesByCompany(companyId: string): OperatorInvite[];
  createInvite(input: CreateOperatorInviteRequest): OperatorInvite;
  revokeInvite(inviteId: string): OperatorInvite;
  acceptInvite(inviteId: string): AcceptOperatorInviteResponse;
  getSharingReadiness(companyId: string): CompanySharingReadinessSummary;
}

export interface IpcCloudLinkService {
  ensureDeviceIdentity(): string;
  getWorkspaceLink(companyId: string): CompanyCloudLinkStatus;
  startLink(companyId: string): CompanyCloudLinkStatus;
  completeLink(companyId: string): CompanyCloudLinkStatus;
  linkWorkspace(companyId: string): CompanyCloudLinkStatus;
  unlinkWorkspace(companyId: string): CompanyCloudLinkStatus;
  reconnectWorkspace(companyId: string): CompanyCloudLinkStatus;
  failLink(companyId: string, error: string): CompanyCloudLinkStatus;
}

export interface IpcProactiveTriggerService {
  decomposeGoal(args: { companyId: string; goalId: string }): Promise<void>;
  scanForWork(args: { companyId: string }): Promise<{ queuedCount: number }>;
  setEnabled(args: { companyId: string; enabled: boolean }): void;
  isEnabled(companyId: string): boolean;
}

export interface IpcRuntimeProfilesService {
  list(companyId: string): RuntimeProfileSummary[];
  create(input: CreateRuntimeProfileRequest): string;
  update(input: UpdateRuntimeProfileRequest): void;
  delete(profileId: string): void;
  bindEmployee(input: BindEmployeeRuntimeProfileRequest): EmployeeRuntimeBinding | null;
  validateProfile(input: ValidateRuntimeProfileRequest): Promise<RuntimeProfileValidation>;
}

export interface IpcRuntimeOperationsService {
  snapshot(companyId: string): RuntimeOperationsSnapshot;
}

export interface IpcAutonomyDoctorService {
  run(input: RunAutonomyDoctorRequest): Promise<AutonomyDoctorReport>;
}

export interface IpcAutonomyBenchmarkService {
  run(input: RunAutonomyBenchmarkRequest): Promise<AutonomyBenchmarkReport>;
}

export interface IpcAgentImprovementService {
  list(input: ListAgentImprovementRequest): AgentImprovementSnapshot;
  run(input: RunAgentImprovementRequest): AgentImprovementRunResult;
}

export interface IpcRoutineService {
  start(companyId: string): void;
  stop(companyId: string): void;
  list(companyId: string): Routine[];
  listRuns(input: ListRoutineRunsRequest): RoutineRun[];
  create(input: CreateRoutineRequest): string;
  update(input: UpdateRoutineRequest): void;
  delete(routineId: string): void;
  runNow(input: RunRoutineNowRequest): Promise<RoutineRun>;
}

export interface IpcBudgetGovernanceService {
  listPolicies(companyId: string): BudgetPolicy[];
  createPolicy(input: CreateBudgetPolicyRequest): string;
  updatePolicy(input: UpdateBudgetPolicyRequest): void;
  deletePolicy(policyId: string): void;
  listLedgerEntries(input: ListBudgetLedgerEntriesRequest): BudgetLedgerEntry[];
  getOverview(companyId: string): BudgetOverview;
  listApprovalItems(input: ListApprovalItemsRequest): ApprovalItem[];
}

export interface IpcApprovalInboxService {
  listItems(input: ListApprovalItemsRequest): ApprovalItem[];
  reviewItem(input: ReviewApprovalItemRequest & { operatorId: string }): {
    item: ApprovalItem;
    grantId: string | null;
  };
}

export interface IpcArtifactService {
  list(input: ListArtifactsRequest): ArtifactRecord[];
}

export interface IpcCompanyPortabilityService {
  exportCompany(input: ExportCompanyPackageRequest): Promise<ExportCompanyPackageResponse>;
  previewImport(
    input: PreviewCompanyPackageImportRequest,
  ): Promise<PreviewCompanyPackageImportResponse>;
  importAsNewCompany(input: ImportCompanyPackageRequest): Promise<ImportCompanyPackageResponse>;
  listTemplates(): Promise<ListCompanyTemplatesResponse['templates']>;
  installTemplate(input: {
    packagePath?: string;
    packageRef?: string;
  }): Promise<InstallCompanyTemplateResponse['template']>;
}

export interface IpcThreadDigestService {
  getLatest(input: GetThreadDigestRequest): ThreadDigest | null;
}

export interface IpcRunCheckpointService {
  listByThread(input: ListRunCheckpointsRequest): RunCheckpoint[];
}

export interface IpcContextAssemblerService {
  assembleThreadContext(input: {
    companyId: string;
    threadId: string;
    recentTurnLimit?: number;
  }): Promise<AssembledThreadContext>;
}

export interface IpcContextPackerService {
  packContext(input: {
    context: AssembledThreadContext;
    targetTokenBudget?: number;
  }): PackedThreadContext;
}

export interface IpcHandlerDeps {
  companiesRepo: IpcCompaniesRepo;
  employeesRepo: IpcEmployeesRepo;
  threadsRepo: IpcThreadsRepo;
  messagesRepo: IpcMessagesRepo;
  ticketsRepo: IpcTicketsRepo;
  ticketAttachmentsRepo: IpcTicketAttachmentsRepo;
  goalsRepo: IpcGoalsRepo;
  projectsRepo: IpcProjectsRepo;
  meetingsRepo: IpcMeetingsRepo;
  orgEdgesRepo: IpcOrgEdgesRepo;
  runsRepo: IpcRunsRepo;
  eventsRepo: IpcEventsRepo;
  orchestrator: IpcOrchestrator;
  meetingService: IpcMeetingService;
  roleLookup: IpcRoleLookup;
  mcpHost: McpHost;
  mcpServersRepo: McpServersRepo;
  extensionsRegistry?: ExtensionsRegistryService;
  skillsService?: IpcSkillsService;
  operatorAccessService?: IpcOperatorAccessService;
  cloudLinkService?: IpcCloudLinkService;
  runtimeProfilesService?: IpcRuntimeProfilesService;
  runtimeOperationsService?: IpcRuntimeOperationsService;
  autonomyDoctorService?: IpcAutonomyDoctorService;
  autonomyBenchmarkService?: IpcAutonomyBenchmarkService;
  agentImprovementService?: IpcAgentImprovementService;
  routineService?: IpcRoutineService;
  budgetGovernanceService?: IpcBudgetGovernanceService;
  approvalInboxService?: IpcApprovalInboxService;
  artifactService?: IpcArtifactService;
  companyPortabilityService?: IpcCompanyPortabilityService;
  threadDigestService?: IpcThreadDigestService;
  runCheckpointService?: IpcRunCheckpointService;
  contextAssemblerService?: IpcContextAssemblerService;
  contextPackerService?: IpcContextPackerService;
  authorityRepo?: IpcAuthorityRepo;
  authorityResolver?: AuthorityResolverService;
  providersService: IpcProvidersService;
  /**
   * Proactive trigger service — goal decomposition and background work scanning.
   * Optional for now; handler falls through to a no-op + dev-mode warning if
   * unwired so a missing composition root wiring does not surface as a hard IPC failure.
   * Phase 6 — Proactive Execution System — Slice 3.
   */
  proactiveTriggerService?: IpcProactiveTriggerService;
  secretsStore: IpcSecretsStore;
  settingsRepo: IpcSettingsRepo;
  vaultService: IpcVaultService;
  backupService: IpcBackupService;
  auditRepo: IpcAuditRepo;
  updaterService: IpcUpdaterService;
  /** Copilot insight read model used by `copilot.export` (Phase 6 — M40). */
  copilotInsightsRepo?: IpcCopilotInsightsRepo;
  /**
   * Copilot analyzer — restarted on `settings.setCopilot` so new
   * interval / enabled / categories take effect without an app
   * restart; stopped on `companies.archive` (M33 F3). Optional:
   * composition-root injects the live instance in production; unit
   * tests pass a stub. Phase 5 — M33 T7 + F3.
   */
  copilotAnalyzerService?: IpcCopilotAnalyzerService;
  /**
   * Copilot event window — cleared on `companies.archive` (M33 F3)
   * so a subsequent re-create of the same id (should one ever land)
   * starts with a fresh buffer. Optional; handler falls through to a
   * no-op + dev-mode warning if unwired so a missing composition root
   * wiring does not surface as a hard IPC failure.
   */
  copilotEventWindow?: IpcCopilotEventWindow;
  /**
   * Event bus — used by `companies.archive` to fan out a
   * `company.archived` event (architectural invariant #11). Optional;
   * handler tolerates `undefined` and warns in dev-mode. Phase 5 —
   * M33 F3.
   */
  bus?: IpcEventBus;
  /**
   * Post-restore bootstrap callback — invoked by `backup.restore`
   * AFTER the DB + vault files have been swapped in. Composition
   * root captures `db` + `companiesRepo` + `roleLookup` in the
   * closure and delegates to
   * `backupService.ensurePostRestoreSystemEmployees`. Optional so
   * existing tests + pre-F4 callers don't need to wire it; the
   * handler passes the counts through to the response as
   * `undefined` when the dep is missing. Phase 5 — M33 F4.
   */
  ensurePostRestoreBootstrap?: () => {
    companiesScanned: number;
    agentsCreated: number;
    copilotsCreated: number;
    skipped: Array<{ companyId: string; reason: string }>;
  };
  /**
   * Per-company system-employee bootstrap callback — invoked by
   * `companies.create` AFTER the new company row inserts and BEFORE
   * the `company.created` bus event fires. Composition root captures
   * `db` + `roleLookup` (the same handles the F4 post-restore sweep
   * uses) and delegates to `ensureSystemAgent` + `ensureSystemCopilot`
   * from `services/system-agent-bootstrap.ts`.
   *
   * Returns the seeded employee ids so the IPC response can hand them
   * to the renderer in one round-trip (avoids a follow-up
   * `employees.list` to find the framework-internal rows by role-id
   * filter — both rows are filtered out of `listVisibleByCompany`).
   *
   * Optional so existing tests + pre-Phase-5.6 callers don't need to
   * wire it; the handler treats `undefined` as a fatal misconfig and
   * throws (different from the F4 path which warns + degrades, because
   * `companies.create` cannot ship a usable company without a system
   * pair). Phase 5.6 M-C step b — restores Cluster A multi-company CRUD.
   */
  ensureSystemForCompany?: (companyId: string) => {
    agentEmployeeId: string;
    copilotEmployeeId: string;
    agentCreated: boolean;
    copilotCreated: boolean;
  };
  getHardwareProfile: () => HardwareProfile;
}

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

// ---------------------------------------------------------------------------
// Row → public shape mappers
// ---------------------------------------------------------------------------
//
// The `EmployeeRow` and `MessageRow` types from the repos contain
// internal-only columns (toolsAllowedJson, toolsDeniedJson, parentId,
// etc.) and have nullable fields where the public shapes use
// optionals. The mappers strip the internals and normalize the
// nullables so the renderer never sees a half-shape it has to
// re-validate.

/**
 * Refuse a write IPC against an archived company. Phase 5.6 M-C step d
 * hardening (BUG-002) — archived companies are soft-deleted; the
 * orchestrator dispatcher treats them as inactive and the copilot
 * analyzer is quiesced. Allowing org mutations on a tombstoned
 * company would emit bus events on a stale entity and create
 * ghost-row reporting graph state. Throws with a clear, actionable
 * error message naming the originating IPC channel.
 *
 * Used by `employees.promote` and `employees.setManager` today; step
 * (e) `companies.update` will reuse the same helper. Companies that
 * do not exist (lookup returns null) are also rejected — the IPC
 * caller has a stale company id and the renderer should refresh.
 */
function assertCompanyActive(
  companiesRepo: IpcCompaniesRepo,
  companyId: string,
  channel: string,
): void {
  const company = companiesRepo.getById(companyId);
  if (!company) {
    throw new Error(`[ipc] ${channel}: company not found: ${companyId}`);
  }
  if (company.status === 'archived') {
    throw new Error(
      `[ipc] ${channel}: company ${companyId} is archived; reactivate before mutating org`,
    );
  }
}

function assertPackageRef(
  req: { packagePath?: string; packageRef?: string },
  channel: string,
): { packagePath?: string; packageRef?: string } {
  const packagePath = typeof req.packagePath === 'string' ? req.packagePath.trim() : '';
  const packageRef = typeof req.packageRef === 'string' ? req.packageRef.trim() : '';
  if (req.packagePath !== undefined && typeof req.packagePath !== 'string') {
    throw new Error(`[ipc] ${channel}: packagePath must be a string when provided`);
  }
  if (req.packageRef !== undefined && typeof req.packageRef !== 'string') {
    throw new Error(`[ipc] ${channel}: packageRef must be a string when provided`);
  }
  if (packagePath.length === 0 && packageRef.length === 0) {
    throw new Error(`[ipc] ${channel}: packagePath or packageRef is required`);
  }
  return packageRef.length > 0 ? { packageRef } : { packagePath };
}

function assertSecretBindings(bindings: unknown, channel: string): CompanyPackageSecretBinding[] {
  if (bindings === undefined) return [];
  if (!Array.isArray(bindings)) {
    throw new Error(`[ipc] ${channel}: secretBindings must be an array when provided`);
  }
  return bindings.map((binding, index) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
      throw new Error(`[ipc] ${channel}: secretBindings[${index}] must be an object`);
    }
    const record = binding as Record<string, unknown>;
    if (typeof record.providerId !== 'string' || record.providerId.trim().length === 0) {
      throw new Error(`[ipc] ${channel}: secretBindings[${index}].providerId is required`);
    }
    if (record.key !== 'apiKey') {
      throw new Error(`[ipc] ${channel}: secretBindings[${index}].key must be "apiKey"`);
    }
    if (typeof record.value !== 'string' || record.value.trim().length === 0) {
      throw new Error(`[ipc] ${channel}: secretBindings[${index}].value is required`);
    }
    return {
      providerId: record.providerId.trim(),
      key: 'apiKey',
      value: record.value.trim(),
    };
  });
}

async function applySecretBindings(
  secretsStore: IpcSecretsStore,
  bindings: CompanyPackageSecretBinding[],
): Promise<void> {
  for (const binding of bindings) {
    await secretsStore.setApiKey(binding.providerId, binding.value);
  }
}

function assertTelemetryRunKind(value: unknown, channel: string): TelemetryRunKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && TELEMETRY_RUN_KINDS.includes(value as TelemetryRunKind)) {
    return value as TelemetryRunKind;
  }
  throw new Error(`[ipc] ${channel}: kind must be work, agentic, or copilot`);
}

function assertTelemetryRecentRunsLimit(value: unknown): number {
  if (value === undefined) return 6;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('[ipc] telemetry.recentRuns: limit must be an integer');
  }
  if (value < 1 || value > 12) {
    throw new Error('[ipc] telemetry.recentRuns: limit must be between 1 and 12');
  }
  return value;
}

function assertCopilotExportRequest(req: CopilotExportRequest): CopilotExportFilter {
  if (req.format !== 'csv' && req.format !== 'json') {
    throw new Error('[ipc] copilot.export: format must be "csv" or "json"');
  }
  if (req.scope !== 'company' && req.scope !== 'all') {
    throw new Error('[ipc] copilot.export: scope must be "company" or "all"');
  }
  if (
    req.scope === 'company' &&
    (typeof req.companyId !== 'string' || req.companyId.length === 0)
  ) {
    throw new Error('[ipc] copilot.export: companyId is required for company scope');
  }
  if (
    req.category !== undefined &&
    !COPILOT_CATEGORIES.includes(req.category as (typeof COPILOT_CATEGORIES)[number])
  ) {
    throw new Error(
      `[ipc] copilot.export: category must be one of ${COPILOT_CATEGORIES.join(', ')}`,
    );
  }
  if (
    req.severity !== undefined &&
    !COPILOT_SEVERITIES.includes(req.severity as (typeof COPILOT_SEVERITIES)[number])
  ) {
    throw new Error(
      `[ipc] copilot.export: severity must be one of ${COPILOT_SEVERITIES.join(', ')}`,
    );
  }

  return {
    scope: req.scope,
    ...(req.scope === 'company' ? { companyId: req.companyId } : {}),
    ...(req.category !== undefined ? { category: req.category } : {}),
    ...(req.severity !== undefined ? { severity: req.severity } : {}),
  };
}

function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    reporterKind: row.reporterKind as AuthorKind,
    labelsJson: row.labelsJson,
    dependenciesJson: row.dependenciesJson,
    slaHours: row.slaHours,
    dueAt: row.dueAt,
    threadId: row.threadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

function rowToCompany(row: CompanyRow): Company {
  let settings: CompanySettings = {};
  try {
    const parsed = JSON.parse(row.settingsJson);
    if (parsed && typeof parsed === 'object') settings = parsed as CompanySettings;
  } catch {
    // Corrupted JSON — fall back to empty settings.
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as CompanyStatus,
    icon: row.icon,
    theme: row.theme,
    createdAt: row.createdAt,
    workspaceOriginId: row.workspaceOriginId ?? row.id,
    companyOriginId: row.companyOriginId ?? row.id,
    settings,
  };
}

function rowToExtensionSummary(row: ExtensionRow): ExtensionSummary {
  let manifest: Record<string, unknown> | null = null;
  let requestedCapabilities: string[] = [];
  let requestedPaths: string[] = [];
  try {
    if (row.manifestJson) {
      const parsed = JSON.parse(row.manifestJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        manifest = parsed as Record<string, unknown>;
      }
    }
  } catch {
    manifest = null;
  }
  try {
    const parsed = JSON.parse(row.requestedCapabilitiesJson);
    if (Array.isArray(parsed)) {
      requestedCapabilities = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    requestedCapabilities = [];
  }
  try {
    const parsed = JSON.parse(row.requestedPathsJson);
    if (Array.isArray(parsed)) {
      requestedPaths = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    requestedPaths = [];
  }
  return {
    id: row.id,
    kind: row.kind as ExtensionSummary['kind'],
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    sourceKind: row.sourceKind as ExtensionSummary['sourceKind'],
    sourceRef: row.sourceRef,
    version: row.version,
    updateChannel: row.updateChannel,
    manifest,
    requestedCapabilities,
    requestedPaths,
    enabled: row.enabled,
    trustState: row.trustState as ExtensionSummary['trustState'],
    runtimeRefId: row.runtimeRefId,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

function getManifestStringValue(
  manifest: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = manifest?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rowToAuthorityGrant(row: AuthorityGrantRow): AuthorityGrant {
  let metadata: Record<string, unknown> | null = null;
  try {
    if (row.metadataJson) {
      const parsed = JSON.parse(row.metadataJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    }
  } catch {
    metadata = null;
  }
  return {
    id: row.id,
    scopeKind: row.scopeKind as AuthorityGrant['scopeKind'],
    scopeId: row.scopeId,
    resourceKind: row.resourceKind as AuthorityGrant['resourceKind'],
    resourceId: row.resourceId,
    permission: row.permission as AuthorityGrant['permission'],
    metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToAuthorityRequest(row: AuthorityRequestRow): AuthorityRequest {
  return {
    id: row.id,
    extensionId: row.extensionId,
    employeeId: row.employeeId,
    resourceKind: row.resourceKind as AuthorityRequest['resourceKind'],
    resourceId: row.resourceId,
    requestedPermission: row.requestedPermission as AuthorityRequest['requestedPermission'],
    status: row.status as AuthorityRequest['status'],
    reason: row.reason,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

function rowToEmployee(row: EmployeeRow): Employee {
  // Strip the rolePackId, toolsAllowed/Denied JSON columns — they are
  // internal to the agent runtime and not part of the renderer
  // contract. Map nullable columns onto the optional public fields.
  const employee: Employee = {
    id: row.id,
    companyId: row.companyId,
    roleId: row.roleId,
    roleMdSha: row.roleMdSha,
    level: row.level,
    name: row.name,
    title: row.title,
    status: row.status as EmployeeStatus,
    createdAt: row.createdAt,
  };
  if (row.modelPref !== null) employee.modelPref = row.modelPref;
  if (row.providerPref !== null) employee.providerPref = row.providerPref;
  if (row.avatar !== null) employee.avatar = row.avatar;
  return employee;
}

function normalizeProfileTextField(
  value: unknown,
  field: 'name' | 'title',
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`[ipc] employees.update: ${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`[ipc] employees.update: ${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`[ipc] employees.update: ${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function normalizeNullableProfileTextField(
  value: unknown,
  field: 'modelPref' | 'providerPref' | 'avatar',
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`[ipc] employees.update: ${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw new Error(`[ipc] employees.update: ${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function skillSourceKindFromUrl(sourceUrl: string): 'github' | 'url' {
  try {
    const url = new URL(sourceUrl);
    return url.hostname === 'github.com' || url.hostname === 'raw.githubusercontent.com'
      ? 'github'
      : 'url';
  } catch {
    return 'url';
  }
}

function rowToChatMessage(row: MessageRow): ChatMessage {
  const msg: ChatMessage = {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    authorKind: row.authorKind as AuthorKind,
    content: row.content,
    createdAt: row.createdAt,
  };
  if (row.isAgentInitiated) msg.isAgentInitiated = true;
  return msg;
}

function rowToEvent(row: EventRow): DashboardEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payloadJson);
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    type: row.eventType as EventType,
    companyId: row.companyId,
    actorId: row.actorId,
    actorKind: row.actorKind as ActorKind,
    payload,
    createdAt: row.createdAt,
  };
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status as GoalStatus,
    progressPct: row.progressPct,
    targetDate: row.targetDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    companyId: row.companyId,
    goalId: row.goalId,
    title: row.title,
    description: row.description,
    status: row.status as ProjectStatus,
    leadId: row.leadId,
    priority: row.priority as ProjectPriority,
    targetDate: row.targetDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMeeting(row: MeetingRow): Meeting {
  let attendees: string[] = [];
  try {
    attendees = JSON.parse(row.attendeesJson);
  } catch {
    attendees = [];
  }
  let actionItems: MeetingActionItem[] = [];
  try {
    actionItems = JSON.parse(row.actionItemsJson);
  } catch {
    actionItems = [];
  }
  return {
    id: row.id,
    companyId: row.companyId,
    threadId: row.threadId,
    chairId: row.chairId,
    agenda: row.agenda,
    mode: row.mode as MeetingMode,
    status: row.status as MeetingStatus,
    minutesMd: row.minutesMd,
    attendees,
    actionItems,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

function clampConcurrencySlots(value: number): number {
  const { min, max, default: fallback } = CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeConcurrencyCaps(
  caps: Record<string, number> | undefined,
): Record<string, number> {
  const { min, max } = CONCURRENCY_SETTINGS_CLAMPS.providerCap;
  const normalized: Record<string, number> = {};
  for (const [kind, value] of Object.entries(caps ?? {})) {
    if (!Number.isFinite(value)) continue;
    normalized[kind] = Math.max(min, Math.min(max, Math.round(value)));
  }
  return normalized;
}

function isUserCancelledTurnError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (!(err instanceof Error)) return false;
  return err.message === 'Run canceled by user';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIpcHandlers(deps: IpcHandlerDeps): IpcHandlers {
  const {
    companiesRepo,
    employeesRepo,
    threadsRepo,
    messagesRepo,
    ticketsRepo,
    ticketAttachmentsRepo,
    goalsRepo,
    projectsRepo,
    meetingsRepo,
    orgEdgesRepo,
    runsRepo,
    eventsRepo,
    orchestrator,
    meetingService,
    roleLookup,
    mcpHost,
    mcpServersRepo,
    extensionsRegistry,
    skillsService,
    operatorAccessService,
    cloudLinkService,
    runtimeProfilesService,
    runtimeOperationsService,
    autonomyDoctorService,
    autonomyBenchmarkService,
    agentImprovementService,
    routineService,
    budgetGovernanceService,
    approvalInboxService,
    artifactService,
    companyPortabilityService,
    threadDigestService,
    runCheckpointService,
    contextAssemblerService,
    contextPackerService,
    authorityRepo,
    authorityResolver,
    providersService,
    proactiveTriggerService,
    secretsStore,
    settingsRepo,
    vaultService,
    backupService,
    auditRepo,
    updaterService,
    copilotInsightsRepo,
    copilotAnalyzerService,
    copilotEventWindow,
    bus,
    ensurePostRestoreBootstrap,
    ensureSystemForCompany,
    getHardwareProfile,
  } = deps;

  function emitUserAuditEvent<T>(
    type: EventType,
    companyId: string,
    payload: T,
    actorId = HUMAN_USER_ID,
    actorKind: ActorKind = 'user',
  ): void {
    if (!bus) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[ipc] ${type}: bus dep unwired — audit log will NOT capture this mutation`);
      }
      return;
    }
    try {
      bus.emit({
        type,
        companyId,
        actorId,
        actorKind,
        payload,
      });
    } catch (err) {
      console.error(`[ipc] ${type}: bus emit failed (mutation already persisted):`, err);
    }
  }

  function emitApprovalReviewAudit(
    companyId: string,
    item: ApprovalItem,
    grantId: string | null,
  ): void {
    const actorId = item.latestDecision?.decidedByOperatorId ?? HUMAN_USER_ID;

    emitUserAuditEvent(
      'approval.reviewed',
      companyId,
      {
        approvalKind: item.kind,
        approvalRefId: item.id,
        decision: item.status,
        subjectRefKind: item.subjectRefKind,
        subjectRefId: item.subjectRefId,
        rationale: item.latestDecision?.rationale ?? null,
      },
      actorId,
    );

    if (item.kind !== 'authority-request') return;

    const payload = item.payload ?? {};
    const resourceKind = typeof payload.resourceKind === 'string' ? payload.resourceKind : 'path';
    const resourceId =
      typeof payload.resourceId === 'string' ? payload.resourceId : item.subjectRefId;
    const requestedPermission =
      typeof payload.requestedPermission === 'string' ? payload.requestedPermission : 'allow';

    if (grantId) {
      emitUserAuditEvent(
        'authority.grant.created',
        companyId,
        {
          grantId,
          scopeKind: 'extension',
          scopeId: item.subjectRefId,
          resourceKind,
          resourceId,
          permission: requestedPermission,
          requestId: item.id,
        },
        actorId,
      );
    }

    emitUserAuditEvent(
      'authority.request.reviewed',
      companyId,
      {
        requestId: item.id,
        extensionId: item.subjectRefId,
        resourceKind,
        resourceId,
        requestedPermission,
        decision: item.status,
        grantId,
      },
      actorId,
    );
  }

  function ensureTicketThread(ticket: TicketRow): string {
    let threadId = ticket.threadId;
    if (!threadId) {
      threadId = threadsRepo.create({
        companyId: ticket.companyId,
        kind: 'ticket',
        subject: ticket.title,
        createdBy: HUMAN_USER_ID,
      });
      ticketsRepo.setThreadId(ticket.id, threadId);
    }

    ensureTicketMember(threadId, HUMAN_USER_ID, 'user');
    if (ticket.assigneeId) {
      ensureTicketMember(threadId, ticket.assigneeId, 'employee');
    }

    return threadId;
  }

  function ensureTicketMember(
    threadId: string,
    memberId: string,
    memberKind: 'user' | 'employee',
  ): boolean {
    const alreadyMember = threadsRepo
      .listMembers(threadId)
      .some((member) => member.memberId === memberId && member.memberKind === memberKind);
    if (alreadyMember) return false;
    threadsRepo.addMember({ threadId, memberId, memberKind });
    return true;
  }

  function validateTicketParticipant(
    ticket: TicketRow,
    employeeId: string,
    channel: string,
  ): EmployeeRow {
    const employee = employeesRepo.getById(employeeId);
    if (!employee) {
      throw new Error(`[ipc] ${channel}: employee not found: ${employeeId}`);
    }
    if (employee.companyId !== ticket.companyId) {
      throw new Error(
        `[ipc] ${channel}: employee ${employeeId} does not belong to company ${ticket.companyId}`,
      );
    }
    if (employee.isSystem) {
      throw new Error(`[ipc] ${channel}: system employees cannot be ticket participants`);
    }
    return employee;
  }

  function listTicketParticipantRows(ticket: TicketRow, threadId: string | null): EmployeeRow[] {
    const employeeIds = new Set<string>();
    if (ticket.assigneeId) employeeIds.add(ticket.assigneeId);

    if (threadId) {
      for (const member of threadsRepo.listMembers(threadId)) {
        if (member.memberKind === 'employee') employeeIds.add(member.memberId);
      }
      for (const message of messagesRepo.listByThread(threadId)) {
        if (message.authorKind === 'employee') employeeIds.add(message.authorId);
      }
    }

    const rows: EmployeeRow[] = [];
    for (const employeeId of employeeIds) {
      const employee = employeesRepo.getById(employeeId);
      if (!employee || employee.companyId !== ticket.companyId || employee.isSystem) {
        continue;
      }
      rows.push(employee);
    }
    return rows;
  }

  function enqueueTicketParticipantWakeups(args: {
    ticket: TicketRow;
    threadId: string;
    messageId: string;
    excludeEmployeeIds?: Set<string>;
    reason: string;
  }): void {
    const excluded = args.excludeEmployeeIds ?? new Set<string>();
    for (const employee of listTicketParticipantRows(args.ticket, args.threadId)) {
      if (excluded.has(employee.id)) continue;
      orchestrator
        .enqueueChat({
          threadId: args.threadId,
          employeeId: employee.id,
          userMessageId: args.messageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[ipc] ${args.reason}: orchestrator turn failed for ticket=${args.ticket.id}, employee=${employee.id}:`,
            err,
          );
        });
    }
  }

  return {
    async companiesList() {
      return companiesRepo.list().map(rowToCompany);
    },

    async companiesExportPackage(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] companies.exportPackage: companyId is required');
      }
      if (!COMPANY_PACKAGE_MODES.includes(req.mode)) {
        throw new Error(`[ipc] companies.exportPackage: invalid mode "${String(req.mode)}"`);
      }
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.exportPackage: companyPortabilityService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'companies.exportPackage');
      const result = await companyPortabilityService.exportCompany(req);
      emitUserAuditEvent('company.packageExported', req.companyId, {
        mode: req.mode,
        packageId: result.manifest.packageId,
        packagePath: result.packagePath,
        exportedAt: result.manifest.exportedAt,
        sharingMode: result.manifest.sharingMode,
        sectionCount: result.manifest.sections.length,
      });
      return result;
    },

    async companiesPreviewImportPackage(req) {
      const packageRef = assertPackageRef(req, 'companies.previewImportPackage');
      if (!companyPortabilityService) {
        throw new Error(
          '[ipc] companies.previewImportPackage: companyPortabilityService dep is required',
        );
      }
      return companyPortabilityService.previewImport(packageRef);
    },

    async companiesImportPackage(req) {
      const packageRef = assertPackageRef(req, 'companies.importPackage');
      if (req.name !== undefined && typeof req.name !== 'string') {
        throw new Error('[ipc] companies.importPackage: name must be a string when provided');
      }
      if (req.slug !== undefined && typeof req.slug !== 'string') {
        throw new Error('[ipc] companies.importPackage: slug must be a string when provided');
      }
      const secretBindings = assertSecretBindings(req.secretBindings, 'companies.importPackage');
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.importPackage: companyPortabilityService dep is required');
      }
      await applySecretBindings(secretsStore, secretBindings);
      const result = await companyPortabilityService.importAsNewCompany({
        ...packageRef,
        name: req.name,
        slug: req.slug,
        secretBindings,
      });
      emitUserAuditEvent('company.packageImported', result.companyId, {
        packageId: result.manifest.packageId,
        mode: result.manifest.mode,
        packageRef: packageRef.packageRef ?? packageRef.packagePath,
        sharingMode: result.manifest.sharingMode,
        secretBindingCount: secretBindings.length,
        importedAt: Date.now(),
      });
      return result;
    },

    async companiesListTemplates(req) {
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.listTemplates: companyPortabilityService dep is required');
      }
      if (req?.companyId !== undefined) {
        if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
          throw new Error(
            '[ipc] companies.listTemplates: companyId must be a non-empty string when provided',
          );
        }
        assertCompanyActive(companiesRepo, req.companyId.trim(), 'companies.listTemplates');
      }
      return {
        templates: await companyPortabilityService.listTemplates(),
      };
    },

    async companiesInstallTemplate(req) {
      const packageRef = assertPackageRef(req, 'companies.installTemplate');
      if (req.companyId !== undefined) {
        if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
          throw new Error(
            '[ipc] companies.installTemplate: companyId must be a non-empty string when provided',
          );
        }
        assertCompanyActive(companiesRepo, req.companyId.trim(), 'companies.installTemplate');
      }
      const secretBindings = assertSecretBindings(req.secretBindings, 'companies.installTemplate');
      if (!companyPortabilityService) {
        throw new Error(
          '[ipc] companies.installTemplate: companyPortabilityService dep is required',
        );
      }
      await applySecretBindings(secretsStore, secretBindings);
      const result = await companyPortabilityService.installTemplate(packageRef);
      if (req.companyId) {
        emitUserAuditEvent('company.templateInstalled', req.companyId.trim(), {
          packageId: result.manifest.packageId,
          packagePath: result.packagePath,
          packageRef: packageRef.packageRef ?? packageRef.packagePath,
          templateName: result.company.name,
          sharingMode: result.manifest.sharingMode,
          secretBindingCount: secretBindings.length,
        });
      }
      return {
        template: result,
      };
    },

    async operatorsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.list: companyId is required');
      }
      if (!operatorAccessService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] operators.list: operatorAccessService dep unwired — returning an empty operator set',
          );
        }
        return [];
      }
      return operatorAccessService.listByCompany(req.companyId);
    },

    async operatorsReadiness(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.readiness: companyId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.readiness: operatorAccessService dep is required');
      }
      return operatorAccessService.getSharingReadiness(req.companyId);
    },

    async cloudGetWorkspaceLink(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.getWorkspaceLink: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.getWorkspaceLink: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.getWorkspaceLink');
      return cloudLinkService.getWorkspaceLink(req.companyId);
    },

    async cloudLinkWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.linkWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.linkWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.linkWorkspace');

      const started = cloudLinkService.startLink(req.companyId);
      emitUserAuditEvent('company.linkStarted', req.companyId, {
        companyId: req.companyId,
        cloudWorkspaceId: started.cloudWorkspaceId ?? 'unknown',
        cloudTenantId: started.cloudTenantId ?? 'unknown',
        linkedDeviceId: started.linkedDeviceId ?? started.deviceId,
        startedAt: Date.now(),
      });

      try {
        const linked = cloudLinkService.completeLink(req.companyId);
        emitUserAuditEvent('company.linked', req.companyId, {
          companyId: req.companyId,
          cloudWorkspaceId: linked.cloudWorkspaceId ?? 'unknown',
          cloudTenantId: linked.cloudTenantId ?? 'unknown',
          linkedDeviceId: linked.linkedDeviceId ?? linked.deviceId,
          linkedAt: linked.lastSyncAt ?? Date.now(),
        });
        return linked;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : 'Workspace link failed.';
        const failed = cloudLinkService.failLink(req.companyId, message);
        emitUserAuditEvent('company.linkFailed', req.companyId, {
          companyId: req.companyId,
          action: 'link',
          error: failed.lastSyncError ?? message,
          failedAt: Date.now(),
        });
        throw err;
      }
    },

    async cloudUnlinkWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.unlinkWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.unlinkWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.unlinkWorkspace');

      const previous = cloudLinkService.getWorkspaceLink(req.companyId);
      const unlinked = cloudLinkService.unlinkWorkspace(req.companyId);
      emitUserAuditEvent('company.unlinked', req.companyId, {
        companyId: req.companyId,
        previousCloudWorkspaceId: previous.cloudWorkspaceId,
        previousCloudTenantId: previous.cloudTenantId,
        unlinkedAt: Date.now(),
      });
      return unlinked;
    },

    async cloudReconnectWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.reconnectWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.reconnectWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.reconnectWorkspace');

      try {
        const reconnected = cloudLinkService.reconnectWorkspace(req.companyId);
        emitUserAuditEvent('company.reconnected', req.companyId, {
          companyId: req.companyId,
          cloudWorkspaceId: reconnected.cloudWorkspaceId ?? 'unknown',
          cloudTenantId: reconnected.cloudTenantId ?? 'unknown',
          linkedDeviceId: reconnected.linkedDeviceId ?? reconnected.deviceId,
          reconnectedAt: reconnected.lastSyncAt ?? Date.now(),
        });
        return reconnected;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : 'Workspace reconnect failed.';
        const failed = cloudLinkService.failLink(req.companyId, message);
        emitUserAuditEvent('company.linkFailed', req.companyId, {
          companyId: req.companyId,
          action: 'reconnect',
          error: failed.lastSyncError ?? message,
          failedAt: Date.now(),
        });
        throw err;
      }
    },

    async operatorsListInvites(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.listInvites: companyId is required');
      }
      if (!operatorAccessService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] operators.listInvites: operatorAccessService dep unwired — returning an empty invite set',
          );
        }
        return [];
      }
      return operatorAccessService.listInvitesByCompany(req.companyId);
    },

    async operatorsCreateInvite(req) {
      const companyId = req.companyId?.trim();
      if (!companyId) {
        throw new Error('[ipc] operators.createInvite: companyId is required');
      }
      const email = req.email?.trim();
      if (!email) {
        throw new Error('[ipc] operators.createInvite: email is required');
      }
      if (!email.includes('@')) {
        throw new Error('[ipc] operators.createInvite: email must look like a real email');
      }
      if (!SHARED_OPERATOR_AUTH_MODES.includes(req.authMode)) {
        throw new Error(
          `[ipc] operators.createInvite: authMode must be one of ${SHARED_OPERATOR_AUTH_MODES.join(', ')}`,
        );
      }
      if (!OPERATOR_MEMBERSHIP_ROLES.includes(req.role)) {
        throw new Error(
          `[ipc] operators.createInvite: role must be one of ${OPERATOR_MEMBERSHIP_ROLES.join(', ')}`,
        );
      }
      if (req.role === 'owner') {
        throw new Error(
          '[ipc] operators.createInvite: owner invites are not supported until shared ownership lands',
        );
      }
      assertCompanyActive(companiesRepo, companyId, 'operators.createInvite');
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.createInvite: operatorAccessService dep is required');
      }
      return {
        invite: operatorAccessService.createInvite({
          ...req,
          companyId,
          email,
        }),
      };
    },

    async operatorsRevokeInvite(req) {
      const inviteId = req.inviteId?.trim();
      if (!inviteId) {
        throw new Error('[ipc] operators.revokeInvite: inviteId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.revokeInvite: operatorAccessService dep is required');
      }
      return operatorAccessService.revokeInvite(inviteId);
    },

    async operatorsAcceptInvite(req) {
      const inviteId = req.inviteId?.trim();
      if (!inviteId) {
        throw new Error('[ipc] operators.acceptInvite: inviteId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.acceptInvite: operatorAccessService dep is required');
      }
      return operatorAccessService.acceptInvite(inviteId);
    },

    async runtimeProfilesList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.list: companyId is required');
      }
      if (!runtimeProfilesService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] runtimeProfiles.list: runtimeProfilesService dep unwired — returning an empty runtime profile set',
          );
        }
        return [];
      }
      return runtimeProfilesService.list(req.companyId);
    },

    async runtimeProfilesCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.create: companyId is required');
      }
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] runtimeProfiles.create: name is required');
      }
      if (!RUNTIME_PROFILE_KINDS.includes(req.kind)) {
        throw new Error(`[ipc] runtimeProfiles.create: invalid runtime kind "${String(req.kind)}"`);
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.create: runtimeProfilesService dep is required');
      }
      return { profileId: runtimeProfilesService.create(req) };
    },

    async runtimeProfilesUpdate(req) {
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.update: profileId is required');
      }
      if (
        req.name !== undefined &&
        (typeof req.name !== 'string' || req.name.trim().length === 0)
      ) {
        throw new Error('[ipc] runtimeProfiles.update: name must be non-empty when provided');
      }
      if (req.kind !== undefined && !RUNTIME_PROFILE_KINDS.includes(req.kind)) {
        throw new Error(`[ipc] runtimeProfiles.update: invalid runtime kind "${String(req.kind)}"`);
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.update: runtimeProfilesService dep is required');
      }
      runtimeProfilesService.update(req);
    },

    async runtimeProfilesDelete(req) {
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.delete: profileId is required');
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.delete: runtimeProfilesService dep is required');
      }
      runtimeProfilesService.delete(req.profileId);
    },

    async runtimeProfilesBindEmployee(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.bindEmployee: companyId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.bindEmployee: employeeId is required');
      }
      if (req.runtimeProfileId !== null && typeof req.runtimeProfileId !== 'string') {
        throw new Error(
          '[ipc] runtimeProfiles.bindEmployee: runtimeProfileId must be a string or null',
        );
      }
      if (!runtimeProfilesService) {
        throw new Error(
          '[ipc] runtimeProfiles.bindEmployee: runtimeProfilesService dep is required',
        );
      }
      return {
        binding: runtimeProfilesService.bindEmployee(req),
      };
    },

    async runtimeProfilesValidate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.validate: companyId is required');
      }
      if (typeof req.profileId !== 'string' || req.profileId.length === 0) {
        throw new Error('[ipc] runtimeProfiles.validate: profileId is required');
      }
      if (!runtimeProfilesService) {
        throw new Error('[ipc] runtimeProfiles.validate: runtimeProfilesService dep is required');
      }
      return runtimeProfilesService.validateProfile(req);
    },

    async runtimeOperationsSnapshot(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] runtimeOperations.snapshot: companyId is required');
      }
      if (!runtimeOperationsService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] runtimeOperations.snapshot: runtimeOperationsService dep unwired — returning an empty runtime operations snapshot',
          );
        }
        return {
          companyId: req.companyId,
          generatedAt: Date.now(),
          sessions: [],
          activeCheckouts: [],
        };
      }
      return runtimeOperationsService.snapshot(req.companyId);
    },

    async autonomyDoctorRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] autonomyDoctor.run: companyId is required');
      }
      if (!autonomyDoctorService) {
        throw new Error('[ipc] autonomyDoctor.run: autonomyDoctorService dep is required');
      }
      return autonomyDoctorService.run(req);
    },

    async autonomyBenchmarkRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] autonomyBenchmark.run: companyId is required');
      }
      if (req.runtimeKinds !== undefined) {
        if (!Array.isArray(req.runtimeKinds)) {
          throw new Error('[ipc] autonomyBenchmark.run: runtimeKinds must be an array');
        }
        for (const runtimeKind of req.runtimeKinds) {
          if (!RUNTIME_PROFILE_KINDS.includes(runtimeKind)) {
            throw new Error(`[ipc] autonomyBenchmark.run: unknown runtime kind ${runtimeKind}`);
          }
        }
      }
      if (req.scenarioIds !== undefined) {
        if (!Array.isArray(req.scenarioIds)) {
          throw new Error('[ipc] autonomyBenchmark.run: scenarioIds must be an array');
        }
        for (const scenarioId of req.scenarioIds) {
          if (!AUTONOMY_BENCHMARK_SCENARIO_IDS.includes(scenarioId)) {
            throw new Error(`[ipc] autonomyBenchmark.run: unknown scenario ${scenarioId}`);
          }
        }
      }
      if (!autonomyBenchmarkService) {
        throw new Error('[ipc] autonomyBenchmark.run: autonomyBenchmarkService dep is required');
      }
      return autonomyBenchmarkService.run(req);
    },

    async agentImprovementList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] agentImprovement.list: companyId is required');
      }
      if (req.limit !== undefined && (!Number.isFinite(req.limit) || req.limit <= 0)) {
        throw new Error('[ipc] agentImprovement.list: limit must be a positive number');
      }
      if (!agentImprovementService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] agentImprovement.list: agentImprovementService dep unwired — returning an empty self-improvement snapshot',
          );
        }
        return {
          companyId: req.companyId,
          generatedAt: Date.now(),
          openTicketCount: 0,
          openTickets: [],
          recentRuns: [],
        };
      }
      return agentImprovementService.list(req);
    },

    async agentImprovementRun(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] agentImprovement.run: companyId is required');
      }
      if (
        req.eventLimit !== undefined &&
        (!Number.isFinite(req.eventLimit) || req.eventLimit <= 0)
      ) {
        throw new Error('[ipc] agentImprovement.run: eventLimit must be a positive number');
      }
      if (req.dryRun !== undefined && typeof req.dryRun !== 'boolean') {
        throw new Error('[ipc] agentImprovement.run: dryRun must be a boolean when provided');
      }
      if (!agentImprovementService) {
        throw new Error('[ipc] agentImprovement.run: agentImprovementService dep is required');
      }
      return agentImprovementService.run(req);
    },

    async routinesList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.list: companyId is required');
      }
      if (!routineService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] routines.list: routineService dep unwired — returning an empty routine set',
          );
        }
        return [];
      }
      return routineService.list(req.companyId);
    },

    async routinesCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.create: companyId is required');
      }
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] routines.create: name is required');
      }
      if (
        !req.schedule ||
        typeof req.schedule !== 'object' ||
        !ROUTINE_TRIGGER_KINDS.includes(req.schedule.triggerKind)
      ) {
        throw new Error('[ipc] routines.create: schedule.triggerKind is invalid');
      }
      if (!req.workConfig || typeof req.workConfig !== 'object') {
        throw new Error('[ipc] routines.create: workConfig is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.create: routineService dep is required');
      }
      return { routineId: routineService.create(req) };
    },

    async routinesUpdate(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.update: routineId is required');
      }
      if (
        req.name !== undefined &&
        (typeof req.name !== 'string' || req.name.trim().length === 0)
      ) {
        throw new Error('[ipc] routines.update: name must be non-empty when provided');
      }
      if (
        req.schedule !== undefined &&
        (!req.schedule ||
          typeof req.schedule !== 'object' ||
          !ROUTINE_TRIGGER_KINDS.includes(req.schedule.triggerKind))
      ) {
        throw new Error('[ipc] routines.update: schedule.triggerKind is invalid');
      }
      if (req.workConfig !== undefined && (!req.workConfig || typeof req.workConfig !== 'object')) {
        throw new Error('[ipc] routines.update: workConfig must be an object when provided');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.update: routineService dep is required');
      }
      routineService.update(req);
    },

    async routinesDelete(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.delete: routineId is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.delete: routineService dep is required');
      }
      routineService.delete(req.routineId);
    },

    async routinesListRuns(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] routines.listRuns: companyId is required');
      }
      if (req.routineId !== undefined && typeof req.routineId !== 'string') {
        throw new Error('[ipc] routines.listRuns: routineId must be a string when provided');
      }
      if (!routineService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] routines.listRuns: routineService dep unwired — returning an empty run set',
          );
        }
        return [];
      }
      return routineService.listRuns(req);
    },

    async routinesRunNow(req) {
      if (typeof req.routineId !== 'string' || req.routineId.length === 0) {
        throw new Error('[ipc] routines.runNow: routineId is required');
      }
      if (!routineService) {
        throw new Error('[ipc] routines.runNow: routineService dep is required');
      }
      return routineService.runNow(req);
    },

    async budgetsListPolicies(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listPolicies: companyId is required');
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listPolicies: budgetGovernanceService dep unwired — returning empty policy set',
          );
        }
        return [];
      }
      return budgetGovernanceService.listPolicies(req.companyId);
    },

    async budgetsCreatePolicy(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.createPolicy: companyId is required');
      }
      if (!BUDGET_SCOPE_KINDS.includes(req.scopeKind)) {
        throw new Error(`[ipc] budgets.createPolicy: invalid scopeKind "${String(req.scopeKind)}"`);
      }
      if (
        req.scopeKind !== 'company' &&
        (typeof req.scopeRefId !== 'string' || req.scopeRefId.trim().length === 0)
      ) {
        throw new Error(
          '[ipc] budgets.createPolicy: scopeRefId is required for non-company scopes',
        );
      }
      if (typeof req.hardCapUsd !== 'string' || req.hardCapUsd.trim().length === 0) {
        throw new Error('[ipc] budgets.createPolicy: hardCapUsd is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.createPolicy: budgetGovernanceService dep is required');
      }
      return { policyId: budgetGovernanceService.createPolicy(req) };
    },

    async budgetsUpdatePolicy(req) {
      if (typeof req.policyId !== 'string' || req.policyId.length === 0) {
        throw new Error('[ipc] budgets.updatePolicy: policyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.updatePolicy: budgetGovernanceService dep is required');
      }
      budgetGovernanceService.updatePolicy(req);
    },

    async budgetsDeletePolicy(req) {
      if (typeof req.policyId !== 'string' || req.policyId.length === 0) {
        throw new Error('[ipc] budgets.deletePolicy: policyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.deletePolicy: budgetGovernanceService dep is required');
      }
      budgetGovernanceService.deletePolicy(req.policyId);
    },

    async budgetsListLedger(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listLedger: companyId is required');
      }
      if (req.scopeKind !== undefined && !BUDGET_SCOPE_KINDS.includes(req.scopeKind)) {
        throw new Error(`[ipc] budgets.listLedger: invalid scopeKind "${String(req.scopeKind)}"`);
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listLedger: budgetGovernanceService dep unwired — returning empty ledger',
          );
        }
        return [];
      }
      return budgetGovernanceService.listLedgerEntries(req);
    },

    async budgetsGetOverview(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.getOverview: companyId is required');
      }
      if (!budgetGovernanceService) {
        throw new Error('[ipc] budgets.getOverview: budgetGovernanceService dep is required');
      }
      return budgetGovernanceService.getOverview(req.companyId);
    },

    async budgetsListApprovals(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] budgets.listApprovals: companyId is required');
      }
      if (approvalInboxService) {
        return approvalInboxService.listItems({
          companyId: req.companyId,
          kind: 'budget-exception',
          status: req.status,
        });
      }
      if (!budgetGovernanceService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] budgets.listApprovals: budgetGovernanceService dep unwired — returning empty approval set',
          );
        }
        return [];
      }
      return budgetGovernanceService.listApprovalItems({
        companyId: req.companyId,
        status: req.status,
      });
    },

    async approvalsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] approvals.list: companyId is required');
      }
      if (!approvalInboxService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] approvals.list: approvalInboxService dep unwired — returning empty approval set',
          );
        }
        return [];
      }
      return approvalInboxService.listItems(req);
    },

    async approvalsReview(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] approvals.review: companyId is required');
      }
      if (typeof req.itemId !== 'string' || req.itemId.length === 0) {
        throw new Error('[ipc] approvals.review: itemId is required');
      }
      if (!approvalInboxService) {
        throw new Error('[ipc] approvals.review: approvalInboxService dep unwired');
      }
      const operatorId = operatorAccessService
        ? operatorAccessService.resolveOperatorIdForCompany(req.companyId, req.operatorId)
        : HUMAN_USER_ID;
      const result = approvalInboxService.reviewItem({
        companyId: req.companyId,
        itemId: req.itemId,
        kind: req.kind,
        decision: req.decision,
        rationale: req.rationale?.trim() || undefined,
        operatorId,
      });
      emitApprovalReviewAudit(req.companyId, result.item, result.grantId);
      return { grantId: result.grantId };
    },

    async artifactsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] artifacts.list: companyId is required');
      }
      if (
        req.limit !== undefined &&
        (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 200)
      ) {
        throw new Error('[ipc] artifacts.list: limit must be an integer between 1 and 200');
      }
      if (!artifactService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] artifacts.list: artifactService dep unwired — returning empty artifact set',
          );
        }
        return [];
      }
      return artifactService.list({
        companyId: req.companyId,
        limit: req.limit,
      });
    },

    async memoryGetThreadDigest(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.getThreadDigest: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.getThreadDigest: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.getThreadDigest: thread does not belong to company');
      }
      if (!threadDigestService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] memory.getThreadDigest: threadDigestService dep unwired — returning null',
          );
        }
        return null;
      }
      return threadDigestService.getLatest(req);
    },

    async memoryListRunCheckpoints(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.listRunCheckpoints: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.listRunCheckpoints: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.listRunCheckpoints: thread does not belong to company');
      }
      if (
        req.limit !== undefined &&
        (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > 100)
      ) {
        throw new Error(
          '[ipc] memory.listRunCheckpoints: limit must be an integer between 1 and 100',
        );
      }
      if (!runCheckpointService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] memory.listRunCheckpoints: runCheckpointService dep unwired — returning empty set',
          );
        }
        return [];
      }
      return runCheckpointService.listByThread(req);
    },

    async memoryPackThreadContext(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] memory.packThreadContext: companyId is required');
      }
      if (typeof req.threadId !== 'string' || req.threadId.length === 0) {
        throw new Error('[ipc] memory.packThreadContext: threadId is required');
      }
      const thread = threadsRepo.getById(req.threadId);
      if (!thread || thread.companyId !== req.companyId) {
        throw new Error('[ipc] memory.packThreadContext: thread does not belong to company');
      }
      if (
        req.targetTokenBudget !== undefined &&
        (!Number.isInteger(req.targetTokenBudget) ||
          req.targetTokenBudget < 128 ||
          req.targetTokenBudget > 64000)
      ) {
        throw new Error(
          '[ipc] memory.packThreadContext: targetTokenBudget must be an integer between 128 and 64000',
        );
      }
      if (
        req.recentTurnLimit !== undefined &&
        (!Number.isInteger(req.recentTurnLimit) ||
          req.recentTurnLimit < 1 ||
          req.recentTurnLimit > 100)
      ) {
        throw new Error(
          '[ipc] memory.packThreadContext: recentTurnLimit must be an integer between 1 and 100',
        );
      }
      if (!contextAssemblerService || !contextPackerService) {
        throw new Error('[ipc] memory.packThreadContext: context services are required');
      }
      const context = await contextAssemblerService.assembleThreadContext({
        companyId: req.companyId,
        threadId: req.threadId,
        recentTurnLimit: req.recentTurnLimit,
      });
      return contextPackerService.packContext({
        context,
        targetTokenBudget: req.targetTokenBudget,
      });
    },

    async companiesCreate(req) {
      // Input validation — fail closed on missing/empty fields BEFORE any
      // SQL writes so a malformed request never leaves a partial row.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.create: request body is required');
      }
      const name = typeof req.name === 'string' ? req.name.trim() : '';
      if (name.length === 0) {
        throw new Error('[ipc] companies.create: name is required (non-empty after trim)');
      }
      if (name.length > 120) {
        throw new Error('[ipc] companies.create: name exceeds 120 chars');
      }
      const slug = typeof req.slug === 'string' ? req.slug : '';
      // URL-safe slug per design — lowercase alphanumerics + hyphen, 1–63
      // chars, no leading hyphen. Matches the convention seedIfEmpty
      // already uses for `'strategia-x'` and what the renderer's future
      // CreateCompanyDialog will hand-roll. Enforced at the IPC boundary
      // so SQL UNIQUE failures only surface for genuine duplicates, not
      // for malformed-by-construction slugs.
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
        throw new Error(
          `[ipc] companies.create: slug "${slug}" must match /^[a-z0-9][a-z0-9-]{0,62}$/ (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen)`,
        );
      }
      if (
        req.settings !== undefined &&
        (req.settings === null || typeof req.settings !== 'object')
      ) {
        throw new Error('[ipc] companies.create: settings must be a plain object when provided');
      }
      if (req.icon !== undefined && typeof req.icon !== 'string') {
        throw new Error('[ipc] companies.create: icon must be a string when provided');
      }
      if (req.theme !== undefined && typeof req.theme !== 'string') {
        throw new Error('[ipc] companies.create: theme must be a string when provided');
      }

      // The system-employee bootstrap is REQUIRED — a company without
      // its system pair cannot serve a `complex_request` palette query
      // (system-agent missing) or run the copilot analyzer (system-copilot
      // missing). Fail loud rather than ship a half-formed row.
      if (!ensureSystemForCompany) {
        throw new Error(
          '[ipc] companies.create: ensureSystemForCompany dep unwired — refusing to create a company without the system-agent + system-copilot bootstrap path. Check the composition root in main/index.ts.',
        );
      }

      // SQL write — surfaces UNIQUE-constraint failure on duplicate slug
      // as a thrown sqlite error. The handler does NOT pre-check via
      // getBySlug() because the check + insert would race against any
      // concurrent create; let the SQL UNIQUE be the canonical guard.
      let companyId: string;
      try {
        companyId = companiesRepo.create({
          name,
          slug,
          settings: req.settings,
          icon: req.icon,
          theme: req.theme,
        });
      } catch (err) {
        // Surface a friendlier message on duplicate slug — sqlite's
        // raw error text is "UNIQUE constraint failed: companies.slug"
        // which is fine for logs but not for the renderer's toast.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') && msg.includes('slug')) {
          throw new Error(`[ipc] companies.create: slug "${slug}" is already in use`);
        }
        throw err;
      }

      // System-employee bootstrap — same path the seed flow + post-restore
      // sweep use. If this throws, the company row is already inserted
      // but unusable. Surface the throw so the caller knows to retry
      // after fixing the loader root (e.g., re-installing role-packs).
      const bootstrap = ensureSystemForCompany(companyId);
      if (operatorAccessService) {
        try {
          operatorAccessService.ensureLocalOwnerForCompany(companyId);
        } catch (err) {
          console.error(
            `[ipc] companies.create: local owner bootstrap failed for company ${companyId} (company remains usable, autonomy access may be incomplete):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: operatorAccessService dep unwired — new company will not get an operator membership bootstrap until next app start',
        );
      }
      if (routineService) {
        try {
          routineService.start(companyId);
        } catch (err) {
          console.error(
            `[ipc] companies.create: routine scheduler start failed for company ${companyId} (company remains usable, routines may not tick until next app start):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: routineService dep unwired — new company routines will not auto-start until next app start',
        );
      }

      // Architectural invariant #11 — IPC channels that mutate state
      // MUST emit a bus event so renderer caches invalidate. Mirrors
      // companies.archive's pattern: the durable write succeeded by
      // the time we get here, so a bus failure must NOT cascade into
      // a thrown IPC (the row is already there). Log + move on.
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'company.created',
            companyId,
            // BUG-005 (Phase 5.6 M-C step d hardening): use the canonical
            // HUMAN_USER_ID constant instead of the literal 'user' so audit-
            // view actor links resolve to the seeded user row when multi-
            // user lands.
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              slug,
              name,
              systemAgentEmployeeId: bootstrap.agentEmployeeId,
              systemCopilotEmployeeId: bootstrap.copilotEmployeeId,
              createdAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] companies.create: bus emit failed (row still created with id ${companyId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return {
        companyId,
        systemAgentEmployeeId: bootstrap.agentEmployeeId,
        systemCopilotEmployeeId: bootstrap.copilotEmployeeId,
      };
    },

    async companiesArchive({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] companies.archive: companyId is required');
      }

      // Quiesce order matters. Stop the analyzer FIRST so a mid-flight
      // tick cannot observe a cleared buffer before we flip the row:
      //
      //   1. analyzer.stop(companyId)   — kill timer + abort in-flight tick.
      //   2. eventWindow.clear(companyId) — drop rolling buffer + hydrated flag.
      //   3. companiesRepo.archive(companyId) — flip status to 'archived'.
      //   4. bus.emit('company.archived') — fan out for cache invalidation.
      //
      // Steps 1 + 2 are wrapped in optional-chaining because the handler
      // is typed against optional deps (see IpcHandlerDeps comments); a
      // missing wiring surfaces as a console warning in dev, never as a
      // hard IPC failure. Step 3 is the durable write — it must succeed.
      if (copilotAnalyzerService) {
        copilotAnalyzerService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.archive: copilotAnalyzerService dep unwired — skipping stop()',
        );
      }
      if (copilotEventWindow) {
        copilotEventWindow.clear(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.archive: copilotEventWindow dep unwired — skipping clear()');
      }
      if (routineService) {
        routineService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.archive: routineService dep unwired — skipping stop()');
      }
      companiesRepo.archive(companyId);

      // Invariant #11: IPC channels that mutate state must emit a bus
      // event. Renderer caches subscribe to the bus for invalidation;
      // IPC alone is not enough — see vault-backup.spec.ts regression
      // postmortem. ActorKind is 'user' because the archive is always
      // user-initiated today; if a future M ever adds a scheduled
      // archive (retention policy, etc.) the actor kind will widen.
      if (bus) {
        try {
          bus.emit({
            type: 'company.archived',
            companyId,
            // BUG-005 (Phase 5.6 M-C step d hardening): HUMAN_USER_ID,
            // not literal 'user'. Same rationale as `companies.create`.
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { companyId, archivedAt: Date.now() },
          });
        } catch (err) {
          console.error('[ipc] companies.archive: bus emit failed (row still archived):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.archive: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async companiesUpdate(req) {
      // --- Input shape guard ---------------------------------------
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.update: request body is required');
      }
      const companyId = typeof req.companyId === 'string' ? req.companyId : '';
      if (companyId.length === 0) {
        throw new Error('[ipc] companies.update: companyId is required');
      }

      // --- Archived-company guard ---------------------------------
      // Reuses the helper step (d) hardening introduced for BUG-002.
      // An archived company is soft-deleted; mutating fields on a
      // tombstoned row would fan out stale bus events and confuse the
      // M-D renderer listing. The helper also throws on unknown ids.
      assertCompanyActive(companiesRepo, companyId, 'companies.update');

      // --- Per-field validation (mirror companies.create) ---------
      const patch: UpdateCompanyInput = {};
      const patchedKeys: Array<'name' | 'slug' | 'settings' | 'icon' | 'theme'> = [];
      if (req.name !== undefined) {
        if (typeof req.name !== 'string') {
          throw new Error('[ipc] companies.update: name must be a string when provided');
        }
        const trimmed = req.name.trim();
        if (trimmed.length === 0) {
          throw new Error(
            '[ipc] companies.update: name must be non-empty after trim when provided',
          );
        }
        if (trimmed.length > 120) {
          throw new Error('[ipc] companies.update: name exceeds 120 chars');
        }
        patch.name = trimmed;
        patchedKeys.push('name');
      }
      if (req.slug !== undefined) {
        if (typeof req.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(req.slug)) {
          throw new Error(
            `[ipc] companies.update: slug "${String(req.slug)}" must match /^[a-z0-9][a-z0-9-]{0,62}$/ (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen)`,
          );
        }
        patch.slug = req.slug;
        patchedKeys.push('slug');
      }
      if (req.settings !== undefined) {
        if (
          req.settings === null ||
          typeof req.settings !== 'object' ||
          Array.isArray(req.settings)
        ) {
          throw new Error('[ipc] companies.update: settings must be a plain object when provided');
        }
        patch.settings = req.settings;
        patchedKeys.push('settings');
      }
      if (req.icon !== undefined) {
        // `null` is accepted to clear the icon — the DB column is
        // nullable and the M-D CreateCompanyDialog / CompanySettings
        // panel may wire a "remove icon" action that sends null.
        if (req.icon !== null && typeof req.icon !== 'string') {
          throw new Error('[ipc] companies.update: icon must be a string or null when provided');
        }
        patch.icon = req.icon;
        patchedKeys.push('icon');
      }
      if (req.theme !== undefined) {
        if (typeof req.theme !== 'string') {
          throw new Error('[ipc] companies.update: theme must be a string when provided');
        }
        patch.theme = req.theme;
        patchedKeys.push('theme');
      }

      // --- Durable write ------------------------------------------
      // Empty patch is intentionally allowed — the repo no-ops at the
      // SQL layer and the handler still emits `company.updated` with
      // an empty `patchedKeys` array so the renderer's optimistic
      // update path can reconcile the row's timestamp state even when
      // nothing actually changed (idempotent write-through surface).
      try {
        companiesRepo.update(companyId, patch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') && msg.includes('slug')) {
          throw new Error(`[ipc] companies.update: slug "${String(patch.slug)}" is already in use`);
        }
        throw err;
      }

      // --- Invariant #11: emit bus event --------------------------
      if (bus) {
        try {
          bus.emit({
            type: 'company.updated',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] companies.update: bus emit failed (row still updated):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.update: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async companiesDelete(req) {
      // --- Input shape guard ---------------------------------------
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.delete: request body is required');
      }
      const companyId = typeof req.companyId === 'string' ? req.companyId : '';
      if (companyId.length === 0) {
        throw new Error('[ipc] companies.delete: companyId is required');
      }

      // --- Existence guard (but NOT active guard) ------------------
      // Delete explicitly allows removing archived companies — that is
      // the user-intent "permanently remove a soft-deleted company"
      // path. We still fail loud on a genuinely-missing id so a caller
      // with a stale reference knows to refresh instead of silently
      // no-opping. Snapshot read BEFORE the transaction so the bus
      // event can carry name + slug after the row is gone.
      const snapshot = companiesRepo.getById(companyId);
      if (!snapshot) {
        throw new Error(`[ipc] companies.delete: company not found: ${companyId}`);
      }

      // --- Quiesce copilot pipeline (mirrors companies.archive) ----
      // Stop the analyzer FIRST so a mid-flight tick cannot observe a
      // cleared event window + partially-deleted rows. Clear the window
      // SECOND so a brief interleaving cannot rehydrate it from the
      // events table immediately before the DELETE sweep wipes the
      // company's events rows.
      if (copilotAnalyzerService) {
        copilotAnalyzerService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.delete: copilotAnalyzerService dep unwired — skipping stop()',
        );
      }
      if (copilotEventWindow) {
        copilotEventWindow.clear(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.delete: copilotEventWindow dep unwired — skipping clear()');
      }
      if (routineService) {
        routineService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.delete: routineService dep unwired — skipping stop()');
      }

      // --- Hard delete (transactional 15-table sweep) --------------
      // Repo owns the FK-safe order + db.transaction. A throw inside
      // the transaction rolls every DELETE back, so callers never see
      // a half-deleted company. Any throw here bubbles up — we do NOT
      // rewrap because the repo sweep has no domain-specific error
      // shapes we'd want to map for the renderer (FK violations would
      // surface raw sqlite text; they indicate schema drift and should
      // fail loud for diagnosis).
      companiesRepo.delete(companyId);

      // --- Invariant #11: emit bus event --------------------------
      // ActorKind is 'user' — same rationale as companies.archive.
      // Name + slug come from the pre-transaction snapshot (the row
      // is gone by now; a fresh getById would return null).
      if (bus) {
        try {
          bus.emit({
            type: 'company.deleted',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              slug: snapshot.slug,
              name: snapshot.name,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] companies.delete: bus emit failed (row still deleted):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.delete: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async employeesList({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.list: companyId is required');
      }
      // Hide framework-internal pseudo-employees (e.g., `system-agent`) from
      // every renderer surface. `listVisibleByCompany` applies the
      // `is_system = 0` predicate — see repos/employees.ts + migration 0010.
      const rows = employeesRepo.listVisibleByCompany(companyId);
      return rows.map(rowToEmployee);
    },

    async employeesCreate({ companyId, roleId, name }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.create: companyId is required');
      }
      if (typeof roleId !== 'string' || roleId.length === 0) {
        throw new Error('[ipc] employees.create: roleId is required');
      }
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('[ipc] employees.create: name is required');
      }

      const spec = roleLookup.getSpec(roleId);
      if (!spec) {
        throw new Error(`[ipc] employees.create: role not found: ${roleId}`);
      }

      // Refuse to hire framework-internal roles via the IPC surface. Only
      // `ensureSystemAgent` is allowed to seed `level: system` employees
      // and it goes through the repo directly, not this handler.
      if (spec.frontmatter.level === 'system') {
        throw new Error(
          `[ipc] employees.create: role "${roleId}" is framework-internal and cannot be hired. Use the command palette for complex requests instead.`,
        );
      }

      const trimmedName = name.trim();
      const employeeId = employeesRepo.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: spec.frontmatter.id,
        roleMdSha: spec.sha256,
        level: spec.frontmatter.level,
        name: trimmedName,
        title: spec.frontmatter.name,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-009):
      // emit AFTER the durable write so a bus failure cannot cascade into the
      // IPC throw. Mirrors the `employees.promoted` / step-f pattern.
      const hiredAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.hired',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId,
              roleId: spec.frontmatter.id,
              level: spec.frontmatter.level,
              name: trimmedName,
              title: spec.frontmatter.name,
              hiredAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.create: bus emit failed (row still created with id ${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { employeeId };
    },

    async employeesFire({ employeeId }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] employees.fire: employeeId is required');
      }
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.fire: employee not found: ${employeeId}`);
      }
      // Framework-internal pseudo-employees are seeded once per company and
      // must never be removed via UI — the command palette + audit log +
      // agentic loop all assume the system-agent row is stable. The hire
      // dialog already can't surface them (filtered from
      // `listVisibleByCompany`); this is the last line of defense.
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.fire: cannot fire framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }

      // Snapshot-before-drop — the delete on the next line removes the row,
      // so the bus payload captures identifying fields (roleId/level/name/
      // title/companyId) HERE so audit-view chips + renderer optimistic
      // removals have the identifier after the row is gone. Same rationale
      // as `company.deleted` (step e) / `goal.deleted` / `project.deleted`
      // (step f).
      const snapshotCompanyId = employee.companyId;
      const snapshotRoleId = employee.roleId;
      const snapshotLevel = employee.level;
      const snapshotName = employee.name;
      const snapshotTitle = employee.title;

      employeesRepo.delete(employeeId);

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-010):
      // emit AFTER the durable delete. Mirrors the step-f delete-emit pattern.
      if (bus) {
        try {
          bus.emit({
            type: 'employee.fired',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId: snapshotCompanyId,
              roleId: snapshotRoleId,
              level: snapshotLevel,
              name: snapshotName,
              title: snapshotTitle,
              firedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.fire: bus emit failed (row still deleted, id=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] employees.fire: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async employeesUpdate(req) {
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.update: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.update: employeeId is required');
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.update: employee not found: ${employeeId}`);
      }
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.update: cannot edit framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.update');

      const patch: UpdateEmployeeProfileInput = { employeeId };
      const patchedKeys: Array<'name' | 'title' | 'modelPref' | 'providerPref' | 'avatar'> = [];
      const name = normalizeProfileTextField(req.name, 'name', 120);
      const title = normalizeProfileTextField(req.title, 'title', 160);
      const modelPref = normalizeNullableProfileTextField(req.modelPref, 'modelPref', 120);
      const providerPref = normalizeNullableProfileTextField(req.providerPref, 'providerPref', 120);
      const avatar = normalizeNullableProfileTextField(req.avatar, 'avatar', 500);

      if (name !== undefined && name !== employee.name) {
        patch.name = name;
        patchedKeys.push('name');
      }
      if (title !== undefined && title !== employee.title) {
        patch.title = title;
        patchedKeys.push('title');
      }
      if (modelPref !== undefined && modelPref !== employee.modelPref) {
        patch.modelPref = modelPref;
        patchedKeys.push('modelPref');
      }
      if (providerPref !== undefined && providerPref !== employee.providerPref) {
        patch.providerPref = providerPref;
        patchedKeys.push('providerPref');
      }
      if (avatar !== undefined && avatar !== employee.avatar) {
        patch.avatar = avatar;
        patchedKeys.push('avatar');
      }

      if (patchedKeys.length > 0) {
        if (!employeesRepo.updateProfile) {
          throw new Error('[ipc] employees.update: employees repo cannot update profiles');
        }
        employeesRepo.updateProfile(patch);
      }

      const updated = employeesRepo.getById(employeeId) ?? employee;
      const responseEmployee = rowToEmployee(updated);

      if (patchedKeys.length > 0) {
        const updatedAt = Date.now();
        if (bus) {
          try {
            bus.emit({
              type: 'employee.updated',
              companyId: updated.companyId,
              actorId: HUMAN_USER_ID,
              actorKind: 'user',
              payload: {
                employeeId,
                companyId: updated.companyId,
                patchedKeys,
                name: updated.name,
                title: updated.title,
                updatedAt,
              },
            });
          } catch (err) {
            console.error(
              `[ipc] employees.update: bus emit failed (row still updated, id=${employeeId}):`,
              err,
            );
          }
        } else if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] employees.update: bus dep unwired — renderer caches will NOT invalidate',
          );
        }
      }

      return { employee: responseEmployee };
    },

    async employeesPromote(req) {
      // Input validation — fail closed before any SQL writes.
      //
      // BUG-008 (Phase 5.6 M-C step d hardening): error messages
      // intentionally include internal nanoid identifiers (e.g.
      // "employee not found: <id>") to preserve the developer feedback
      // loop. Public release will need an error-redaction helper that
      // scrubs IDs in the production error formatter; tracked for
      // M-F docs sweep.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.promote: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.promote: employeeId is required');
      }
      const newRoleId = typeof req.newRoleId === 'string' ? req.newRoleId : '';
      if (newRoleId.length === 0) {
        throw new Error('[ipc] employees.promote: newRoleId is required');
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.promote: employee not found: ${employeeId}`);
      }
      // Same defense-in-depth as `employees.fire`: framework-internal
      // pseudo-employees (system-agent / system-copilot) are seeded
      // once per company and must never be re-roled via the IPC.
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.promote: cannot promote framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }

      // BUG-002 (Phase 5.6 M-C step d hardening): refuse mutations
      // against archived companies. Archived = soft-deleted, the
      // orchestrator dispatcher already treats the company as inactive
      // and the copilot analyzer is quiesced. Allowing org mutations
      // would emit bus events on a tombstoned entity and create
      // ghost-row reporting graph state.
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.promote');

      const spec = roleLookup.getSpec(newRoleId);
      if (!spec) {
        throw new Error(`[ipc] employees.promote: role not found: ${newRoleId}`);
      }
      // Refuse to promote INTO a framework-internal role — only
      // `ensureSystemAgent` is allowed to seed `level: system` rows
      // and it goes through the repo directly. Mirrors the same guard
      // in `employees.create`.
      if (spec.frontmatter.level === 'system') {
        throw new Error(
          `[ipc] employees.promote: role "${newRoleId}" is framework-internal and cannot be assigned`,
        );
      }

      // Snapshot the pre-promote shape so the response + bus event
      // payload carry the full delta. Reads from the row we already
      // fetched — no second SQL round-trip.
      const previousRoleId = employee.roleId;
      const previousLevel = employee.level;
      const previousTitle = employee.title;
      const newLevel = spec.frontmatter.level;
      const newTitle = spec.frontmatter.name;

      // BUG-006 (Phase 5.6 M-C step d hardening): tools_allowed /
      // tools_denied flow into the row's tools_*_json columns
      // unvalidated at this layer by design. Trust-boundary chain:
      //
      //   1. Role-pack files signed Ed25519 (Phase 5.5 hotfix). In
      //      packaged production builds the loader runs in `strict`
      //      mode and refuses an unsigned or tampered pack.
      //   2. Even with a tampered pack, the strings cannot escape
      //      into actual tool dispatch — the MCP Host (architectural
      //      invariant #3) enforces the `tools_allowed` / `tools_denied`
      //      lists at the tool-call gateway. Strings that don't match
      //      a real registered tool name are inert.
      //
      // The defense lives at the gateway, not here. Logged so future
      // refactors don't accidentally remove the gateway check assuming
      // upstream validation.
      employeesRepo.promote({
        employeeId,
        roleId: spec.frontmatter.id,
        level: newLevel,
        title: newTitle,
        roleMdSha: spec.sha256,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

      // Architectural invariant #11 — emit AFTER the durable write so
      // a bus failure cannot cascade into the IPC throw (the row is
      // already promoted by the time we get here). Mirrors the
      // `companies.archive` / `companies.create` patterns.
      //
      // BUG-005 (Phase 5.6 M-C step d hardening): use HUMAN_USER_ID
      // (the canonical Phase 1 hardcoded user constant) instead of
      // the literal 'user' string — keeps audit-view actor links
      // resolvable to a real row id when multi-user lands.
      const promotedAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.promoted',
            companyId: employee.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              previousRoleId,
              newRoleId: spec.frontmatter.id,
              previousLevel,
              newLevel,
              previousTitle,
              newTitle,
              promotedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.promote: bus emit failed (row still promoted, id=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.promote: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return {
        employeeId,
        previousRoleId,
        newRoleId: spec.frontmatter.id,
        previousLevel,
        newLevel,
        previousTitle,
        newTitle,
      };
    },

    async employeesSetManager(req) {
      // BUG-008 (Phase 5.6 M-C step d hardening): error messages
      // intentionally include internal nanoid identifiers for the
      // developer feedback loop. See `employeesPromote` JSDoc.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.setManager: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.setManager: employeeId is required');
      }
      // `managerId === null` is the documented "detach / make root"
      // path. Any non-string non-null value is invalid.
      const managerId =
        req.managerId === null
          ? null
          : typeof req.managerId === 'string' && req.managerId.length > 0
            ? req.managerId
            : undefined;
      if (managerId === undefined) {
        throw new Error(
          '[ipc] employees.setManager: managerId must be a non-empty string or null (to detach)',
        );
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.setManager: employee not found: ${employeeId}`);
      }
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.setManager: cannot edit reporting line for framework-internal employee ${employeeId}`,
        );
      }

      // BUG-002 (Phase 5.6 M-C step d hardening): refuse mutations
      // against archived companies. Same rationale as `employees.promote`.
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.setManager');

      let previousManagerId: string | null;

      if (managerId === null) {
        // Detach path — atomic snapshot + remove inside the repo's
        // transaction. previousManagerId is null when the report was
        // already a graph root.
        const result = orgEdgesRepo.removeByReport(employeeId);
        previousManagerId = result.previousManagerId;
      } else {
        // Upsert path. Validate the manager exists, is non-system,
        // shares a company with the report, and (M-C step d hardening
        // BUG-001) sits at a strictly more senior level. The repo's
        // setManager runs the cycle check inside its own transaction
        // — the handler-side wouldCycle pre-check was removed in the
        // M-C step d hardening pass to eliminate the TOCTOU window
        // between handler-check and repo-write (BUG-003 + BUG-004).
        if (managerId === employeeId) {
          throw new Error(
            '[ipc] employees.setManager: managerId and employeeId must differ (self-edges are cyclic)',
          );
        }
        const manager = employeesRepo.getById(managerId);
        if (!manager) {
          throw new Error(`[ipc] employees.setManager: manager not found: ${managerId}`);
        }
        if (manager.isSystem) {
          throw new Error(
            `[ipc] employees.setManager: cannot assign framework-internal employee ${managerId} as manager`,
          );
        }
        if (manager.companyId !== employee.companyId) {
          throw new Error(
            `[ipc] employees.setManager: manager ${managerId} and report ${employeeId} must share a company`,
          );
        }

        // BUG-001 (Phase 5.6 M-C step d hardening): level-inversion
        // guard. The locked Phase 2 M9 hierarchy (officer >
        // senior-management > management > supervisor > lead > ic)
        // requires a manager to be at a STRICTLY more senior level
        // than its report. Same-level and inverted relationships
        // are rejected here. Unknown levels (e.g. a future role-pack
        // adds a new tier) fail OPEN with a dev-mode warning so the
        // guard does not brick the IPC on data we don't recognize.
        const managerRank = getLevelRank(manager.level);
        const reportRank = getLevelRank(employee.level);
        if (managerRank === null || reportRank === null) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[ipc] employees.setManager: level rank unknown — manager.level=${manager.level} report.level=${employee.level}; skipping inversion guard (fail-open)`,
            );
          }
        } else if (managerRank >= reportRank) {
          throw new Error(
            `[ipc] employees.setManager: level inversion — manager (${manager.level}) must be at a strictly more senior level than report (${employee.level})`,
          );
        }

        // Atomic upsert + snapshot inside the repo's transaction.
        // Catches the repo's "would create cycle" throw and rewraps
        // with a friendlier renderer-facing message — pattern-match
        // on the `[org-edges] setManager: would create cycle` prefix
        // the repo emits.
        try {
          const result = orgEdgesRepo.setManager({
            companyId: employee.companyId,
            managerId,
            reportId: employeeId,
          });
          previousManagerId = result.previousManagerId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('[org-edges] setManager: would create cycle')) {
            throw new Error(
              `[ipc] employees.setManager: would create reporting cycle — ${managerId} already reports (directly or transitively) to ${employeeId}`,
            );
          }
          throw err;
        }
      }

      // Architectural invariant #11 — emit AFTER the durable write.
      // BUG-005 (M-C step d hardening): use HUMAN_USER_ID, not 'user'.
      const setAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.managerSet',
            companyId: employee.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId: employee.companyId,
              managerId,
              previousManagerId,
              setAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.setManager: bus emit failed (edge still updated, employee=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.setManager: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async orgchartGet({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] orgchart.get: companyId is required');
      }
      // Non-system employees only — matches `employees.list` contract.
      // Framework-internal pseudo-employees (`system-agent` /
      // `system-copilot`) must never surface in the renderer org tree.
      const employeeRows = employeesRepo.listVisibleByCompany(companyId);
      const visibleIds = new Set<string>(employeeRows.map((e) => e.id));

      // Defensive edge filter — drop any edge whose manager OR report
      // references an employee outside `visibleIds`. This can happen
      // legitimately when a freshly-fired system employee's edges have
      // not yet been cleaned up (future `employees.fire` flow), or
      // pathologically if a direct DB write inserted a reference to an
      // archived/deleted employee. The repo write path's `wouldCycle`
      // is the canonical guard; this filter keeps the renderer
      // defensive against state it cannot render.
      const edges: OrgchartEdge[] = orgEdgesRepo
        .listByCompany(companyId)
        .filter((row) => visibleIds.has(row.managerId) && visibleIds.has(row.reportId))
        .map((row) => ({
          id: row.id,
          managerId: row.managerId,
          reportId: row.reportId,
          createdAt: row.createdAt,
        }));

      // Root ids = every visible employee that has no manager edge
      // pointing at them. For a canonical org tree this is the single
      // CEO row; during onboarding / post-hire-before-wire moments the
      // set can include any number of unassigned employees. The
      // renderer uses this as the top of its indented-list tree view.
      const reportIds = new Set<string>(edges.map((e) => e.reportId));
      const rootIds: string[] = employeeRows.map((e) => e.id).filter((id) => !reportIds.has(id));

      return {
        employees: employeeRows.map(rowToEmployee),
        edges,
        rootIds,
      };
    },

    async chatSend({ threadId, employeeId, content }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.send: employeeId is required');
      }
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('[ipc] chat.send: content is required');
      }

      // Look up the target employee FIRST. We need its companyId to
      // resolve `AUTO_THREAD_ID`, AND we want a clear error before any
      // DB writes if the employee is missing.
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.send: employee not found: ${employeeId}`);
      }

      // Resolve the thread.
      let resolvedThreadId: string;
      if (threadId === AUTO_THREAD_ID) {
        resolvedThreadId = threadsRepo.getOrCreateDmThread({
          companyId: employee.companyId,
          employeeId,
          userId: HUMAN_USER_ID,
        });
      } else {
        const thread = threadsRepo.getById(threadId);
        if (!thread) {
          throw new Error(`[ipc] chat.send: thread not found: ${threadId}`);
        }
        // Defensive: refuse to send into a thread that doesn't belong
        // to the employee's company. The orchestrator has its own
        // version of this check (see orchestrator/index.ts), but
        // catching it here avoids opening a runs row for a doomed turn.
        if (thread.companyId !== employee.companyId) {
          throw new Error(
            `[ipc] chat.send: thread ${threadId} does not belong to ` +
              `employee ${employeeId}'s company`,
          );
        }
        resolvedThreadId = threadId;
      }

      // Append the user's message — this gives us the id we hand the
      // orchestrator (which uses it for correlation in `work.failed`
      // payloads) and return to the renderer.
      const messageId = messagesRepo.append({
        threadId: resolvedThreadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content,
      });
      threadsRepo.updateLastMessageAt(resolvedThreadId, Date.now());

      // Kick off the assistant turn. CRITICAL: do NOT await the
      // returned Promise. `orchestrator.enqueueChat` resolves when the
      // turn has fully completed (assistant message persisted, runs
      // row closed, `work.completed` emitted) — awaiting it here would
      // block the IPC reply for the entire duration of the LLM stream
      // and the renderer would not see the user's message in the
      // drawer until the assistant had finished thinking. The whole
      // point of the dashboard event channel is to deliver the reply
      // live; this handler's job is to persist the user's input,
      // queue the work, and get out of the way.
      //
      // The orchestrator's failure modes (shutdown, provider error,
      // role-loader miss) all surface either as `work.failed`
      // dashboard events (which the renderer renders) or via the
      // logged catch below. We never re-throw, because the user
      // message has already been persisted and the renderer's chat
      // bubble is already on screen — a thrown IPC reply would
      // confuse the UI into thinking the entire send was rejected.
      orchestrator
        .enqueueChat({
          threadId: resolvedThreadId,
          employeeId,
          userMessageId: messageId,
        })
        .catch((err: unknown) => {
          if (isUserCancelledTurnError(err)) {
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          const rows = messagesRepo.listByThread(resolvedThreadId);
          const userMessage = rows.find((row) => row.id === messageId);
          const alreadyStarted =
            userMessage !== undefined &&
            rows.some(
              (row) =>
                row.createdAt >= userMessage.createdAt &&
                row.authorKind === 'employee' &&
                row.authorId === employeeId,
            );
          if (!alreadyStarted) {
            try {
              bus?.emit({
                type: 'work.failed',
                companyId: employee.companyId,
                actorId: 'orchestrator',
                actorKind: 'orchestrator',
                payload: {
                  threadId: resolvedThreadId,
                  employeeId,
                  messageId,
                  error: message,
                },
              });
            } catch (eventErr) {
              console.error(
                `[ipc] chat.send: failed to emit work.failed for thread=${resolvedThreadId} ` +
                  `employee=${employeeId} userMessage=${messageId}:`,
                eventErr,
              );
            }
          }
          console.error(
            `[ipc] chat.send: orchestrator turn failed for thread=${resolvedThreadId} ` +
              `employee=${employeeId} userMessage=${messageId}:`,
            err,
          );
        });

      return { threadId: resolvedThreadId, messageId };
    },

    async chatList({ threadId }) {
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new Error('[ipc] chat.list: threadId is required');
      }
      const rows = messagesRepo.listByThread(threadId);
      return rows.map(rowToChatMessage);
    },

    async chatStop({ threadId }) {
      if (typeof threadId !== 'string' || threadId.length === 0) {
        throw new Error('[ipc] chat.stop: threadId is required');
      }
      return { stopped: orchestrator.stopThread(threadId) };
    },

    async chatResolveThread({ employeeId }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] chat.resolveThread: employeeId is required');
      }
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] chat.resolveThread: employee not found: ${employeeId}`);
      }
      const threadId = threadsRepo.getOrCreateDmThread({
        companyId: employee.companyId,
        employeeId,
        userId: HUMAN_USER_ID,
      });
      return { threadId };
    },

    async chatListThreads({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] chat.listThreads: companyId is required');
      }
      const rows = threadsRepo.listByCompanyWithMembers(companyId);
      // Build a Set of system-agent employee ids once per call so each
      // thread's isSystemAgent flag is an O(1) lookup. `listByCompany`
      // (not `listVisibleByCompany`) deliberately includes system
      // pseudo-employees — exactly the set we need to classify threads
      // against. Phase 5 — M31 T5.
      const systemEmployeeIds = new Set<string>(
        employeesRepo
          .listByCompany(companyId)
          .filter((e) => e.isSystem)
          .map((e) => e.id),
      );
      return rows.map(
        (row): Thread => ({
          id: row.id,
          companyId: row.companyId,
          kind: row.kind as Thread['kind'],
          subject: row.subject,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          lastMessageAt: row.lastMessageAt ?? null,
          members: row.members.map((m) => ({
            memberId: m.memberId,
            memberKind: m.memberKind as 'user' | 'employee',
            roleInThread: m.roleInThread,
          })),
          isSystemAgent: row.members.some(
            (m) => m.memberKind === 'employee' && systemEmployeeIds.has(m.memberId),
          ),
        }),
      );
    },

    // -----------------------------------------------------------------------
    // Events / timeline handler (Phase 3 — M14)
    // -----------------------------------------------------------------------

    async eventsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] events.list: companyId is required');
      }
      const limit = req.limit ?? 50;
      const rows = eventsRepo.listByCompany(req.companyId, req.cursor, limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const lastEvent = page[page.length - 1];
      const nextCursor = hasMore && lastEvent ? lastEvent.createdAt : null;

      return {
        events: page.map(rowToEvent),
        nextCursor,
      };
    },

    // -----------------------------------------------------------------------
    // MCP management handlers
    // -----------------------------------------------------------------------

    async mcpList({ companyId: _companyId }) {
      const companyId = _companyId;
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.list: companyId is required');
      }
      const servers = mcpServersRepo.listRuntimeByCompany(companyId);
      return servers.map((server) => {
        const connected = mcpHost.getServer(server.id);
        return {
          id: server.id,
          companyId: server.companyId,
          name: server.name,
          transport: server.transport as 'stdio' | 'sse',
          enabled: server.enabled,
          lastHealth: server.lastHealth,
          toolCount: connected?.tools.length ?? 0,
        };
      });
    },

    async mcpListTemplates({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.listTemplates: companyId is required');
      }

      const extensions = extensionsRegistry
        ? extensionsRegistry.listByCompany(companyId).map(rowToExtensionSummary)
        : [];
      const templateExtensionsByRuntimeRefId = new Map(
        extensions
          .filter((extension) => extension.kind === 'mcp' && extension.companyId === null)
          .flatMap((extension) =>
            extension.runtimeRefId ? [[extension.runtimeRefId, extension] as const] : [],
          ),
      );
      const installedServerIdByTemplateId = new Map(
        extensions
          .filter((extension) => extension.kind === 'mcp' && extension.companyId === companyId)
          .flatMap((extension) => {
            const templateId = getManifestStringValue(extension.manifest, 'templateId');
            const runtimeRefId = extension.runtimeRefId;
            if (!templateId || !runtimeRefId) return [];
            return [[templateId, runtimeRefId] as const];
          }),
      );

      return mcpServersRepo.listTemplates().map((template) => {
        const extension = templateExtensionsByRuntimeRefId.get(template.id);
        return {
          id: template.id,
          name: template.name,
          transport: template.transport as 'stdio' | 'sse',
          sourceRef: extension?.sourceRef ?? template.name,
          lastHealth: template.lastHealth,
          requestedCapabilities: extension?.requestedCapabilities ?? [],
          installed: installedServerIdByTemplateId.has(template.id),
          installedServerId: installedServerIdByTemplateId.get(template.id) ?? null,
        };
      });
    },

    async mcpToggle({ serverId, enabled }) {
      const config = mcpServersRepo.getById(serverId);
      if (!config) {
        throw new Error(`[ipc] mcp.toggle: server config not found: ${serverId}`);
      }
      const server = mcpHost.getServer(serverId);

      if (enabled && !server?.connected) {
        // Reconnect
        await mcpHost.connectToServer({
          id: config.id,
          companyId: config.companyId,
          name: config.name,
          transport: config.transport as 'stdio' | 'sse',
          configJson: config.configJson,
          enabled: config.enabled,
          lastHealth: config.lastHealth,
        });
      } else if (!enabled && server?.connected) {
        // Disconnect
        await mcpHost.disconnectServer(serverId);
      }

      mcpServersRepo.updateEnabled(serverId, enabled);
      extensionsRegistry?.syncMcpServer(serverId);
      if (config.companyId) {
        emitUserAuditEvent('mcp.toggled', config.companyId, {
          serverId: config.id,
          name: config.name,
          enabled,
          transport: config.transport,
        });
      }
    },

    async mcpAddServer({ companyId, name, transport, configJson }) {
      const serverId = mcpServersRepo.create({
        companyId,
        name,
        transport,
        configJson,
      });

      // Try to connect immediately
      const config = mcpServersRepo.getById(serverId);
      if (config) {
        await mcpHost
          .connectToServer({
            id: config.id,
            companyId: config.companyId,
            name: config.name,
            transport: config.transport as 'stdio' | 'sse',
            configJson: config.configJson,
            enabled: config.enabled,
            lastHealth: config.lastHealth,
          })
          .catch((err) => {
            console.error(`[ipc] mcp.addServer: failed to connect to ${name}:`, err);
          });
      }

      extensionsRegistry?.syncMcpServer(serverId);
      if (companyId) {
        emitUserAuditEvent('mcp.added', companyId, {
          serverId,
          name,
          transport,
          sourceKind: 'manual',
        });
      }

      return { serverId };
    },

    async mcpInstallTemplate({ companyId, templateId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] mcp.installTemplate: companyId is required');
      }
      if (typeof templateId !== 'string' || templateId.length === 0) {
        throw new Error('[ipc] mcp.installTemplate: templateId is required');
      }

      const template = mcpServersRepo.getById(templateId);
      if (!template || template.companyId !== null) {
        throw new Error(`[ipc] mcp.installTemplate: template not found: ${templateId}`);
      }

      const existingInstall = extensionsRegistry
        ?.listByCompany(companyId)
        .map(rowToExtensionSummary)
        .find(
          (extension) =>
            extension.kind === 'mcp' &&
            extension.companyId === companyId &&
            getManifestStringValue(extension.manifest, 'templateId') === templateId &&
            extension.runtimeRefId,
        );
      if (existingInstall?.runtimeRefId) {
        return { serverId: existingInstall.runtimeRefId };
      }

      const serverId = mcpServersRepo.create({
        companyId,
        name: template.name,
        transport: template.transport as 'stdio' | 'sse',
        configJson: template.configJson,
      });

      const config = mcpServersRepo.getById(serverId);
      if (config) {
        await mcpHost
          .connectToServer({
            id: config.id,
            companyId: config.companyId,
            name: config.name,
            transport: config.transport as 'stdio' | 'sse',
            configJson: config.configJson,
            enabled: config.enabled,
            lastHealth: config.lastHealth,
          })
          .catch((err) => {
            console.error(
              `[ipc] mcp.installTemplate: failed to connect template ${template.name}:`,
              err,
            );
          });
      }

      const templateExtension = extensionsRegistry
        ?.listByCompany(companyId)
        .map(rowToExtensionSummary)
        .find((extension) => extension.kind === 'mcp' && extension.runtimeRefId === template.id);

      extensionsRegistry?.syncMcpServer(serverId, {
        sourceKind: 'template',
        sourceRef: `Built-in template · ${template.name}`,
        manifestPatch: {
          templateId: template.id,
          templateName: template.name,
          templateSourceRef: templateExtension?.sourceRef ?? template.name,
          templateTransport: template.transport,
        },
      });
      emitUserAuditEvent('mcp.added', companyId, {
        serverId,
        name: template.name,
        transport: template.transport,
        sourceKind: 'template',
        templateId,
      });

      return { serverId };
    },

    async mcpRemoveServer({ serverId }) {
      const existing = mcpServersRepo.getById(serverId);
      await mcpHost.disconnectServer(serverId);
      mcpServersRepo.delete(serverId);
      const removedExtension = extensionsRegistry?.removeMcpServer(serverId) ?? null;
      if (removedExtension) {
        authorityRepo?.deleteGrantsByScope('extension', removedExtension.id);
      }
      if (existing?.companyId) {
        emitUserAuditEvent('mcp.removed', existing.companyId, {
          serverId: existing.id,
          name: existing.name,
          transport: existing.transport,
        });
      }
    },

    async mcpTestConnection({ transport, configJson }) {
      try {
        const client = new (await import('@modelcontextprotocol/sdk/client/index.js')).Client({
          name: 'team-x-test-connection',
          version: '0.0.1',
        });

        const clientTransport =
          transport === 'stdio'
            ? new (await import('@modelcontextprotocol/sdk/client/stdio.js')).StdioClientTransport(
                JSON.parse(configJson),
              )
            : new (await import('@modelcontextprotocol/sdk/client/sse.js')).SSEClientTransport(
                new URL(JSON.parse(configJson).url),
              );

        await client.connect(clientTransport);
        const tools = await client.listTools();
        await client.close();

        return {
          ok: true,
          toolCount: tools.tools?.length ?? 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: message,
        };
      }
    },

    async extensionsList({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.list: companyId is required');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.list: extensionsRegistry dep unwired');
      }
      return extensionsRegistry.listByCompany(companyId).map(rowToExtensionSummary);
    },

    async extensionsInstallLocalSkill({ companyId, folderPath }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.installLocalSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.installLocalSkill: companyId is required');
      }
      if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
        throw new Error('[ipc] extensions.installLocalSkill: folderPath is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.installLocalSkill');
      const result = await skillsService.installLocal({
        companyId,
        folderPath: folderPath.trim(),
      });
      emitUserAuditEvent('extension.installed', companyId, {
        extensionId: result.extensionId,
        sourceKind: 'local',
        sourceRef: folderPath.trim(),
      });
      return result;
    },

    async extensionsInstallGithubSkill({ companyId, sourceUrl }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.installGithubSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.installGithubSkill: companyId is required');
      }
      if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
        throw new Error('[ipc] extensions.installGithubSkill: sourceUrl is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.installGithubSkill');
      const result = await skillsService.installGithub({
        companyId,
        sourceUrl: sourceUrl.trim(),
      });
      emitUserAuditEvent('extension.installed', companyId, {
        extensionId: result.extensionId,
        sourceKind: skillSourceKindFromUrl(sourceUrl.trim()),
        sourceRef: sourceUrl.trim(),
      });
      return result;
    },

    async extensionsRemoveSkill({ companyId, extensionId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.removeSkill: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.removeSkill: companyId is required');
      }
      if (typeof extensionId !== 'string' || extensionId.length === 0) {
        throw new Error('[ipc] extensions.removeSkill: extensionId is required');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.removeSkill');
      const removed = await skillsService.removeSkill({ companyId, extensionId });
      emitUserAuditEvent('extension.removed', companyId, {
        extensionId: removed.id,
        kind: removed.kind,
        name: removed.name,
        sourceKind: removed.sourceKind,
        sourceRef: removed.sourceRef,
      });
    },

    async extensionsListSkillAssignments({ companyId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.listSkillAssignments: skillsService dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.listSkillAssignments: companyId is required');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.listSkillAssignments: extensionsRegistry dep unwired');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.listSkillAssignments');
      return skillsService
        .listAssignments(companyId)
        .filter((assignment) =>
          extensionsRegistry
            .listByCompany(companyId)
            .some((extension) => extension.id === assignment.extensionId),
        );
    },

    async extensionsUpsertSkillAssignment({ companyId, extensionId, employeeId, enabled }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: skillsService dep unwired');
      }
      if (!extensionsRegistry) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extensionsRegistry dep unwired');
      }
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: companyId is required');
      }
      if (typeof extensionId !== 'string' || extensionId.length === 0) {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extensionId is required');
      }
      if (typeof enabled !== 'boolean') {
        throw new Error('[ipc] extensions.upsertSkillAssignment: enabled must be boolean');
      }
      assertCompanyActive(companiesRepo, companyId, 'extensions.upsertSkillAssignment');

      const extension = extensionsRegistry
        .listByCompany(companyId)
        .find((row) => row.id === extensionId);
      if (!extension) {
        throw new Error(
          `[ipc] extensions.upsertSkillAssignment: extension not found in company ${companyId}: ${extensionId}`,
        );
      }
      if (extension.kind !== 'skill') {
        throw new Error('[ipc] extensions.upsertSkillAssignment: extension must be a skill');
      }

      let normalizedEmployeeId: string | null = null;
      if (typeof employeeId === 'string' && employeeId.length > 0) {
        const employee = employeesRepo.getById(employeeId);
        if (!employee) {
          throw new Error(
            `[ipc] extensions.upsertSkillAssignment: employee not found: ${employeeId}`,
          );
        }
        if (employee.companyId !== companyId) {
          throw new Error(
            `[ipc] extensions.upsertSkillAssignment: employee ${employeeId} does not belong to company ${companyId}`,
          );
        }
        normalizedEmployeeId = employeeId;
      }

      const assignmentId = skillsService.upsertAssignment({
        companyId,
        extensionId,
        employeeId: normalizedEmployeeId,
        enabled,
      });
      emitUserAuditEvent('skill.assignmentUpdated', companyId, {
        assignmentId,
        extensionId,
        employeeId: normalizedEmployeeId,
        enabled,
      });
      return { assignmentId };
    },

    async extensionsDeleteSkillAssignment({ assignmentId }) {
      if (!skillsService) {
        throw new Error('[ipc] extensions.deleteSkillAssignment: skillsService dep unwired');
      }
      if (typeof assignmentId !== 'string' || assignmentId.length === 0) {
        throw new Error('[ipc] extensions.deleteSkillAssignment: assignmentId is required');
      }
      skillsService.deleteAssignment(assignmentId);
    },

    async authorityList({ companyId, employeeId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.list: companyId is required');
      }
      if (!authorityRepo) {
        throw new Error('[ipc] authority.list: authorityRepo dep unwired');
      }
      const rows =
        typeof employeeId === 'string' && employeeId.length > 0
          ? authorityRepo.listForEmployee(companyId, employeeId)
          : authorityRepo.listByCompany(companyId);
      return rows.map(rowToAuthorityGrant);
    },

    async authorityListRequests({ companyId, status }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.listRequests: companyId is required');
      }
      if (!authorityRepo) {
        throw new Error('[ipc] authority.listRequests: authorityRepo dep unwired');
      }
      const normalizedStatus =
        status === 'pending' || status === 'approved' || status === 'denied' ? status : undefined;
      return authorityRepo
        .listRequestsByCompany(companyId, normalizedStatus)
        .map(rowToAuthorityRequest);
    },

    async authorityCreate(req) {
      if (!authorityRepo) {
        throw new Error('[ipc] authority.create: authorityRepo dep unwired');
      }
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] authority.create: companyId is required');
      }
      if (!req || (req.scopeKind !== 'company' && req.scopeKind !== 'employee')) {
        throw new Error('[ipc] authority.create: scopeKind must be company or employee');
      }
      if (typeof req.scopeId !== 'string' || req.scopeId.length === 0) {
        throw new Error('[ipc] authority.create: scopeId is required');
      }
      if (req.resourceKind !== 'capability' && req.resourceKind !== 'path') {
        throw new Error('[ipc] authority.create: resourceKind must be capability or path');
      }
      if (typeof req.resourceId !== 'string' || req.resourceId.trim().length === 0) {
        throw new Error('[ipc] authority.create: resourceId is required');
      }
      if (!['allow', 'deny', 'prompt'].includes(req.permission)) {
        throw new Error('[ipc] authority.create: permission must be allow, deny, or prompt');
      }
      if (req.scopeKind === 'company' && req.scopeId !== req.companyId) {
        throw new Error('[ipc] authority.create: company scopeId must match companyId');
      }
      if (req.scopeKind === 'employee') {
        const employee = employeesRepo.getById(req.scopeId);
        if (!employee) {
          throw new Error(`[ipc] authority.create: employee not found: ${req.scopeId}`);
        }
        if (employee.companyId !== req.companyId) {
          throw new Error(
            `[ipc] authority.create: employee ${req.scopeId} does not belong to company ${req.companyId}`,
          );
        }
      }
      const metadataJson =
        req.metadata && typeof req.metadata === 'object' ? JSON.stringify(req.metadata) : null;
      const grantId = authorityRepo.createGrant({
        scopeKind: req.scopeKind,
        scopeId: req.scopeId,
        resourceKind: req.resourceKind,
        resourceId: req.resourceId.trim(),
        permission: req.permission,
        metadataJson,
      });
      emitUserAuditEvent('authority.grant.created', req.companyId, {
        grantId,
        scopeKind: req.scopeKind,
        scopeId: req.scopeId,
        resourceKind: req.resourceKind,
        resourceId: req.resourceId.trim(),
        permission: req.permission,
      });
      return { grantId };
    },

    async authorityDelete({ grantId }) {
      if (!authorityRepo) {
        throw new Error('[ipc] authority.delete: authorityRepo dep unwired');
      }
      if (typeof grantId !== 'string' || grantId.length === 0) {
        throw new Error('[ipc] authority.delete: grantId is required');
      }
      const existing = authorityRepo.getGrantById(grantId);
      if (!existing) {
        throw new Error(`[ipc] authority.delete: grant not found: ${grantId}`);
      }
      authorityRepo.deleteGrant(grantId);
      if (existing.scopeKind === 'company') {
        emitUserAuditEvent('authority.grant.deleted', existing.scopeId, {
          grantId,
          scopeKind: existing.scopeKind,
          scopeId: existing.scopeId,
          resourceKind: existing.resourceKind,
          resourceId: existing.resourceId,
          permission: existing.permission,
        });
      } else if (existing.scopeKind === 'employee') {
        const employee = employeesRepo.getById(existing.scopeId);
        if (employee) {
          emitUserAuditEvent('authority.grant.deleted', employee.companyId, {
            grantId,
            scopeKind: existing.scopeKind,
            scopeId: existing.scopeId,
            resourceKind: existing.resourceKind,
            resourceId: existing.resourceId,
            permission: existing.permission,
          });
        }
      } else if (existing.scopeKind === 'extension' && extensionsRegistry) {
        for (const company of companiesRepo.list()) {
          const extension = extensionsRegistry
            .listByCompany(company.id)
            .find((row) => row.id === existing.scopeId);
          if (!extension) continue;
          emitUserAuditEvent('authority.grant.deleted', company.id, {
            grantId,
            scopeKind: existing.scopeKind,
            scopeId: existing.scopeId,
            resourceKind: existing.resourceKind,
            resourceId: existing.resourceId,
            permission: existing.permission,
          });
          break;
        }
      }
    },

    async authorityReviewRequest({ companyId, requestId, decision, reason, operatorId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.reviewRequest: companyId is required');
      }
      if (typeof requestId !== 'string' || requestId.length === 0) {
        throw new Error('[ipc] authority.reviewRequest: requestId is required');
      }
      if (decision !== 'approved' && decision !== 'denied') {
        throw new Error('[ipc] authority.reviewRequest: decision must be approved or denied');
      }
      return this.approvalsReview({
        companyId,
        itemId: requestId,
        kind: 'authority-request',
        decision,
        rationale: reason ?? undefined,
        operatorId,
      });
    },

    async authorityGetEffective({ companyId, employeeId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] authority.getEffective: companyId is required');
      }
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] authority.getEffective: employeeId is required');
      }
      if (!authorityResolver) {
        throw new Error('[ipc] authority.getEffective: authorityResolver dep unwired');
      }
      return authorityResolver.resolveEmployee(companyId, employeeId);
    },

    // -----------------------------------------------------------------------
    // Goals management handlers (Phase 3 — M15)
    // -----------------------------------------------------------------------

    async goalsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] goals.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] goals.create: title is required');
      }
      const title = req.title.trim();
      const goalId = goalsRepo.create({
        companyId: req.companyId,
        title,
        description: req.description ?? '',
        targetDate: req.targetDate ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f): IPC channels that mutate
      // state must emit a bus event so renderer caches invalidate.
      // Inline try/catch mirrors companies.create — a bus failure never
      // cascades into an IPC throw (the row is already durable).
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'goal.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { goalId, companyId: req.companyId, title, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.create: bus emit failed (row still created with id ${goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.create: bus dep unwired — renderer caches will NOT invalidate');
      }

      return { goalId };
    },

    async goalsUpdate(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.update: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.update: goal not found: ${req.goalId}`);
      }

      // Compute patchedKeys from the request BEFORE the write — tracks
      // caller intent, not post-write row state. The 'progress' slot
      // fires only when `progressPct` was explicitly patched; linked-
      // project status changes emit via projects.update / projects.delete
      // (each calls goalsRepo.recalcProgress internally but does not
      // emit a goal.updated bus event — the project event is the delta).
      const patchedKeys: Array<'title' | 'description' | 'targetDate' | 'status' | 'progress'> = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.targetDate !== undefined) patchedKeys.push('targetDate');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.progressPct !== undefined) patchedKeys.push('progress');

      goalsRepo.update(req.goalId, {
        title: req.title,
        description: req.description,
        status: req.status,
        progressPct: req.progressPct,
        targetDate: req.targetDate,
      });

      // Re-read to capture post-write progressPct. DB column is 0..100
      // (integer). Payload normalizes to 0..1 so renderer progress bars
      // consume a ratio consistently across goal/project/ticket events.
      const updated = goalsRepo.getById(req.goalId);
      const progress = updated ? (updated.progressPct ?? 0) / 100 : 0;

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'goal.updated',
            companyId: goal.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              goalId: req.goalId,
              companyId: goal.companyId,
              patchedKeys,
              progress,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.update: bus emit failed (row still updated, id=${req.goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.update: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async goalsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] goals.list: companyId is required');
      }
      return goalsRepo.listByCompany(req.companyId).map(rowToGoal);
    },

    async goalsGet(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.get: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.get: goal not found: ${req.goalId}`);
      }
      const linkedProjects = projectsRepo.listByGoal(req.goalId).map(rowToProject);
      return { ...rowToGoal(goal), projects: linkedProjects };
    },

    async goalsDelete(req) {
      if (typeof req.goalId !== 'string' || req.goalId.length === 0) {
        throw new Error('[ipc] goals.delete: goalId is required');
      }
      const goal = goalsRepo.getById(req.goalId);
      if (!goal) {
        throw new Error(`[ipc] goals.delete: goal not found: ${req.goalId}`);
      }

      // Capture snapshot BEFORE drop so the bus payload can carry title
      // (row is gone by the time the emit fires). Same capture-before-
      // drop rationale as company.deleted + project.deleted.
      const snapshotTitle = goal.title;
      const snapshotCompanyId = goal.companyId;

      goalsRepo.delete(req.goalId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'goal.deleted',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              goalId: req.goalId,
              companyId: snapshotCompanyId,
              title: snapshotTitle,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] goals.delete: bus emit failed (row still deleted, id=${req.goalId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] goals.delete: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    // -----------------------------------------------------------------------
    // Projects management handlers (Phase 3 — M15)
    // -----------------------------------------------------------------------

    async projectsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] projects.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] projects.create: title is required');
      }
      const title = req.title.trim();
      const goalId = req.goalId ?? null;
      const projectId = projectsRepo.create({
        companyId: req.companyId,
        goalId,
        title,
        description: req.description ?? '',
        leadId: req.leadId ?? null,
        priority: req.priority ?? 'medium',
        targetDate: req.targetDate ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f).
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'project.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { projectId, companyId: req.companyId, title, goalId, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.create: bus emit failed (row still created with id ${projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { projectId };
    },

    async projectsUpdate(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.update: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.update: project not found: ${req.projectId}`);
      }

      // Compute patchedKeys BEFORE the write to track caller intent.
      // Mirrors the `companies.update` patchedKeys convention.
      const patchedKeys: Array<
        'title' | 'description' | 'status' | 'goalId' | 'leadId' | 'priority' | 'targetDate'
      > = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.goalId !== undefined) patchedKeys.push('goalId');
      if (req.leadId !== undefined) patchedKeys.push('leadId');
      if (req.priority !== undefined) patchedKeys.push('priority');
      if (req.targetDate !== undefined) patchedKeys.push('targetDate');

      const previousGoalId = project.goalId;
      const nextGoalId = req.goalId !== undefined ? req.goalId : previousGoalId;
      const goalBindingChanged = req.goalId !== undefined && req.goalId !== previousGoalId;

      projectsRepo.update(req.projectId, {
        title: req.title,
        description: req.description,
        status: req.status,
        goalId: req.goalId,
        leadId: req.leadId,
        priority: req.priority,
        targetDate: req.targetDate,
      });

      if ((req.status !== undefined || goalBindingChanged) && previousGoalId) {
        goalsRepo.recalcProgress(previousGoalId);
      }
      if (goalBindingChanged && nextGoalId && nextGoalId !== previousGoalId) {
        goalsRepo.recalcProgress(nextGoalId);
      }

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.updated',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.update: bus emit failed (row still updated, id=${req.projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.update: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] projects.list: companyId is required');
      }
      return projectsRepo.listByCompany(req.companyId).map(rowToProject);
    },

    async projectsGet(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.get: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.get: project not found: ${req.projectId}`);
      }
      const ticketIds = projectsRepo.listTickets(req.projectId);
      const ticketCounts = projectsRepo.countTicketsByStatus(req.projectId);
      let lead: Employee | null = null;
      if (project.leadId) {
        const empRow = employeesRepo.getById(project.leadId);
        if (empRow) lead = rowToEmployee(empRow);
      }
      return {
        ...rowToProject(project),
        ticketIds,
        lead,
        ticketCounts,
      };
    },

    async projectsDelete(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.delete: projectId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.delete: project not found: ${req.projectId}`);
      }
      const goalId = project.goalId;
      // Capture snapshot BEFORE drop — see company.deleted / goal.deleted rationale.
      const snapshotTitle = project.title;
      const snapshotCompanyId = project.companyId;

      projectsRepo.delete(req.projectId);
      // Recalc parent goal progress after deleting
      if (goalId) {
        goalsRepo.recalcProgress(goalId);
      }

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.deleted',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: snapshotCompanyId,
              title: snapshotTitle,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.delete: bus emit failed (row still deleted, id=${req.projectId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.delete: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsLinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: ticketId is required');
      }
      // Fetch project to thread companyId through to the bus event
      // (Phase 5.6 M-C step f — required by invariant #11 payload shape;
      // doubles as a validation guard for phantom projectIds).
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.linkTicket: project not found: ${req.projectId}`);
      }
      projectsRepo.linkTicket(req.projectId, req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.ticketLinked',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              ticketId: req.ticketId,
              linkedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.linkTicket: bus emit failed (link still persisted, project=${req.projectId}, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.linkTicket: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async projectsUnlinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: ticketId is required');
      }
      const project = projectsRepo.getById(req.projectId);
      if (!project) {
        throw new Error(`[ipc] projects.unlinkTicket: project not found: ${req.projectId}`);
      }
      projectsRepo.unlinkTicket(req.projectId, req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'project.ticketUnlinked',
            companyId: project.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              projectId: req.projectId,
              companyId: project.companyId,
              ticketId: req.ticketId,
              unlinkedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] projects.unlinkTicket: bus emit failed (unlink still persisted, project=${req.projectId}, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] projects.unlinkTicket: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    // -----------------------------------------------------------------------
    // Meeting management handlers (Phase 3 — M16)
    // -----------------------------------------------------------------------

    async meetingsCall(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] meetings.call: companyId is required');
      }
      if (typeof req.chairId !== 'string' || req.chairId.length === 0) {
        throw new Error('[ipc] meetings.call: chairId is required');
      }
      if (!Array.isArray(req.attendeeIds) || req.attendeeIds.length === 0) {
        throw new Error('[ipc] meetings.call: attendeeIds must be a non-empty array');
      }
      return meetingService.callMeeting({
        companyId: req.companyId,
        chairId: req.chairId,
        attendeeIds: req.attendeeIds,
        agenda: req.agenda ?? '',
        mode: req.mode,
      });
    },

    async meetingsEnd(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.end: meetingId is required');
      }
      return meetingService.endMeeting(req.meetingId);
    },

    async meetingsInterject(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.interject: meetingId is required');
      }
      if (typeof req.content !== 'string' || req.content.trim().length === 0) {
        throw new Error('[ipc] meetings.interject: content is required');
      }
      return meetingService.interject(req.meetingId, req.content);
    },

    async meetingsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] meetings.list: companyId is required');
      }
      return meetingsRepo.listByCompany(req.companyId).map(rowToMeeting);
    },

    async meetingsGet(req) {
      if (typeof req.meetingId !== 'string' || req.meetingId.length === 0) {
        throw new Error('[ipc] meetings.get: meetingId is required');
      }
      const meeting = meetingsRepo.getById(req.meetingId);
      if (!meeting) {
        throw new Error(`[ipc] meetings.get: meeting not found: ${req.meetingId}`);
      }

      // Fetch thread messages
      let messages: ChatMessage[] = [];
      if (meeting.threadId) {
        const rows = messagesRepo.listByThread(meeting.threadId);
        messages = rows.map(rowToChatMessage);
      }

      // Fetch chair employee
      let chair: Employee | null = null;
      const chairRow = employeesRepo.getById(meeting.chairId);
      if (chairRow) chair = rowToEmployee(chairRow);

      return {
        ...rowToMeeting(meeting),
        messages,
        chair,
      };
    },

    // -----------------------------------------------------------------------
    // Telemetry handlers (Phase 3 — M17)
    // -----------------------------------------------------------------------

    async telemetryCompanyStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.companyStats: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.companyStats');
      return runsRepo.companyStats(req.companyId, kind);
    },

    async telemetryDailyUsage(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.dailyUsage: companyId is required');
      }
      if (typeof req.fromMs !== 'number' || typeof req.toMs !== 'number') {
        throw new Error('[ipc] telemetry.dailyUsage: fromMs and toMs are required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.dailyUsage');
      return runsRepo.dailyUsage(req.companyId, req.fromMs, req.toMs, kind);
    },

    async telemetryEmployeeStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.employeeStats: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.employeeStats');
      return runsRepo.employeeStats(req.companyId, kind);
    },

    async telemetryRecentRuns(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.recentRuns: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.recentRuns');
      const limit = assertTelemetryRecentRunsLimit(req.limit);
      return runsRepo.recentRuns(req.companyId, limit, kind);
    },

    async telemetryCostBreakdown(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.costBreakdown: companyId is required');
      }
      const kind = assertTelemetryRunKind(req.kind, 'telemetry.costBreakdown');
      return runsRepo.costBreakdown(req.companyId, req.fromMs, req.toMs, kind);
    },

    // -----------------------------------------------------------------------
    // Settings handlers (Phase 3 — M19)
    // -----------------------------------------------------------------------

    async settingsGetRuntime() {
      const profile = getHardwareProfile();
      const override = settingsRepo.get<import('@team-x/shared-types').RuntimeStrategy>(
        'runtime_strategy',
        'auto',
      );
      const providers = providersService.list();
      const result = pickStrategy({ profile, providers, override });
      const effectiveSlots = clampConcurrencySlots(
        settingsRepo.get<number>('orchestrator_slots', result.slots),
      );
      return {
        strategy: override === 'auto' ? override : result.strategy,
        hardwareProfile: profile,
        effectiveSlots,
        reason: result.reason,
      };
    },

    async settingsSetRuntime(req) {
      settingsRepo.set('runtime_strategy', req.strategy);
      const profile = getHardwareProfile();
      const providers = providersService.list();
      const nextSlots =
        req.strategy === 'auto'
          ? pickStrategy({ profile, providers, override: req.strategy }).slots
          : STRATEGY_SLOTS[req.strategy];
      const clampedSlots = clampConcurrencySlots(nextSlots);
      settingsRepo.set('orchestrator_slots', clampedSlots);
      orchestrator.updateConcurrency({ slots: clampedSlots });
    },

    async settingsGetPrivacy() {
      const maxTier = settingsRepo.get<import('@team-x/shared-types').PrivacyTier>(
        'max_privacy_tier',
        'proprietary-cloud',
      );
      const providers = providersService.list();
      const maxRank = PRIVACY_TIER_RANK[maxTier] ?? 2;
      const availableProviders = providers.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        privacyTier: p.privacyTier,
        allowed: (PRIVACY_TIER_RANK[p.privacyTier] ?? 0) <= maxRank,
      }));
      return { maxTier, availableProviders };
    },

    async settingsSetPrivacy(req) {
      settingsRepo.set('max_privacy_tier', req.maxTier);
    },

    async settingsGetConcurrency() {
      const orchestratorSlots = clampConcurrencySlots(
        settingsRepo.get<number>(
          'orchestrator_slots',
          CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots.default,
        ),
      );
      const providerCaps = normalizeConcurrencyCaps(
        settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
      );
      return { orchestratorSlots, providerCaps };
    },

    async settingsSetConcurrency(req) {
      let nextSlots: number | undefined;
      if (req.orchestratorSlots !== undefined) {
        nextSlots = clampConcurrencySlots(req.orchestratorSlots);
        settingsRepo.set('orchestrator_slots', nextSlots);
      }
      let nextCaps: Record<string, number> | undefined;
      if (req.providerCaps !== undefined) {
        const current = normalizeConcurrencyCaps(
          settingsRepo.get<Record<string, number>>('concurrency_caps', DEFAULT_CONCURRENCY_CAPS),
        );
        nextCaps = {
          ...current,
          ...normalizeConcurrencyCaps(req.providerCaps),
        };
        settingsRepo.set('concurrency_caps', nextCaps);
      }
      orchestrator.updateConcurrency({
        ...(nextSlots !== undefined ? { slots: nextSlots } : {}),
        ...(nextCaps !== undefined ? { providerCaps: nextCaps } : {}),
      });
    },

    async settingsGetExtensions() {
      return settingsRepo.getExtensions?.() ?? { autonomyMode: 'balanced' };
    },

    async settingsSetExtensions(req) {
      if (settingsRepo.setExtensions) {
        settingsRepo.setExtensions(req);
      } else {
        settingsRepo.set('extensions_autonomy_mode', req.autonomyMode);
      }
    },

    async settingsGetMemory(): Promise<SettingsGetMemoryResponse> {
      return (
        settingsRepo.getMemory?.() ?? {
          defaultTargetTokenBudget: 4096,
          recentTurnLimit: 12,
          checkpointHistoryLimit: 6,
        }
      );
    },

    async settingsSetMemory(req: SettingsSetMemoryRequest): Promise<void> {
      if (settingsRepo.setMemory) {
        settingsRepo.setMemory(req);
        return;
      }
      if (req.defaultTargetTokenBudget !== undefined) {
        settingsRepo.set('memory_default_target_token_budget', req.defaultTargetTokenBudget);
      }
      if (req.recentTurnLimit !== undefined) {
        settingsRepo.set('memory_recent_turn_limit', req.recentTurnLimit);
      }
      if (req.checkpointHistoryLimit !== undefined) {
        settingsRepo.set('memory_checkpoint_history_limit', req.checkpointHistoryLimit);
      }
    },

    // -----------------------------------------------------------------------
    // RAG configuration handlers (Phase 5 — M29)
    // -----------------------------------------------------------------------

    async settingsGetRagConfig() {
      return {
        ragEnabled: settingsRepo.get<boolean>('rag_enabled', false),
        ragTopK: settingsRepo.get<number>('rag_top_k', 5),
        ragThreshold: settingsRepo.get<number>('rag_threshold', 0.7),
        ragMaxTokens: settingsRepo.get<number>('rag_max_tokens', 2000),
        embeddingProvider: settingsRepo.get<string>('embedding_provider', 'auto'),
        embeddingModel: settingsRepo.get<string>('embedding_model', 'auto'),
        embeddingDimension: settingsRepo.get<number>('embedding_dimension', 1536),
      };
    },

    async settingsSetRagConfig(req) {
      // Validate + patch only the supplied keys. Each branch short-
      // circuits on the "undefined" case so partial payloads (e.g.
      // the user toggling just the master switch) never clobber the
      // unrelated knobs.
      if (req.ragEnabled !== undefined) {
        if (typeof req.ragEnabled !== 'boolean') {
          throw new Error('[ipc] settings.setRagConfig: ragEnabled must be boolean');
        }
        settingsRepo.set('rag_enabled', req.ragEnabled);
      }
      if (req.ragTopK !== undefined) {
        if (!Number.isFinite(req.ragTopK) || req.ragTopK < 1 || req.ragTopK > 20) {
          throw new Error('[ipc] settings.setRagConfig: ragTopK must be 1..20');
        }
        settingsRepo.set('rag_top_k', Math.round(req.ragTopK));
      }
      if (req.ragThreshold !== undefined) {
        if (!Number.isFinite(req.ragThreshold) || req.ragThreshold < 0 || req.ragThreshold > 1) {
          throw new Error('[ipc] settings.setRagConfig: ragThreshold must be 0..1');
        }
        settingsRepo.set('rag_threshold', req.ragThreshold);
      }
      if (req.ragMaxTokens !== undefined) {
        if (
          !Number.isFinite(req.ragMaxTokens) ||
          req.ragMaxTokens < 100 ||
          req.ragMaxTokens > 4000
        ) {
          throw new Error('[ipc] settings.setRagConfig: ragMaxTokens must be 100..4000');
        }
        settingsRepo.set('rag_max_tokens', Math.round(req.ragMaxTokens));
      }
      if (req.embeddingProvider !== undefined) {
        if (typeof req.embeddingProvider !== 'string' || req.embeddingProvider.length === 0) {
          throw new Error('[ipc] settings.setRagConfig: embeddingProvider must be non-empty');
        }
        settingsRepo.set('embedding_provider', req.embeddingProvider);
      }
      if (req.embeddingModel !== undefined) {
        if (typeof req.embeddingModel !== 'string' || req.embeddingModel.length === 0) {
          throw new Error('[ipc] settings.setRagConfig: embeddingModel must be non-empty');
        }
        settingsRepo.set('embedding_model', req.embeddingModel);
      }
      if (req.embeddingDimension !== undefined) {
        if (
          !Number.isFinite(req.embeddingDimension) ||
          req.embeddingDimension < 64 ||
          req.embeddingDimension > 8192
        ) {
          throw new Error('[ipc] settings.setRagConfig: embeddingDimension must be 64..8192');
        }
        settingsRepo.set('embedding_dimension', Math.round(req.embeddingDimension));
      }
    },

    // -----------------------------------------------------------------------
    // Agentic loop handlers (Phase 5 — M31)
    // -----------------------------------------------------------------------

    async settingsGetAgentic(): Promise<SettingsGetAgenticResponse> {
      return settingsRepo.getAgentic();
    },

    async settingsSetAgentic(req: SettingsSetAgenticRequest): Promise<void> {
      // Repo handles clamping + finite-number validation; the handler
      // is a thin pass-through so that call-sites can share the same
      // invariants regardless of entry point (IPC, test, future CLI).
      settingsRepo.setAgentic(req);
    },

    // -----------------------------------------------------------------------
    // Task planner handlers (Phase 5 — M32)
    // -----------------------------------------------------------------------

    async settingsGetPlanner(): Promise<SettingsGetPlannerResponse> {
      return settingsRepo.getPlanner();
    },

    async settingsSetPlanner(req: SettingsSetPlannerRequest): Promise<void> {
      settingsRepo.setPlanner(req);
    },

    // -----------------------------------------------------------------------
    // Copilot service handlers (Phase 5 — M33 T7)
    // -----------------------------------------------------------------------

    async settingsGetCopilot(): Promise<SettingsGetCopilotResponse> {
      return settingsRepo.getCopilot();
    },

    async settingsGetCopilotWeights(
      req: SettingsGetCopilotWeightsRequest,
    ): Promise<SettingsGetCopilotWeightsResponse> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.getCopilotWeights: companyId is required');
      }
      return settingsRepo.getCopilotWeights();
    },

    async settingsSetCopilot(req: SettingsSetCopilotRequest): Promise<void> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.setCopilot: companyId is required');
      }
      // Repo handles intervalMinutes clamping + categories filtering +
      // empty-array fallback. After persisting, synchronously restart
      // the per-company analyzer timer so the new interval / enabled /
      // categories take effect on the next tick — no app restart needed.
      settingsRepo.setCopilot(req);
      if (copilotAnalyzerService) {
        copilotAnalyzerService.restart(req.companyId);
      }
    },

    async settingsSetCopilotWeights(
      req: SettingsSetCopilotWeightsRequest,
    ): Promise<SettingsSetCopilotWeightsResponse> {
      if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
        throw new Error('[ipc] settings.setCopilotWeights: companyId is required');
      }
      const before = settingsRepo.getCopilotWeights().weights;
      const result = settingsRepo.setCopilotWeights(req);
      const changedKeys = COPILOT_CATEGORIES.filter(
        (category) => before[category] !== result.weights[category],
      );
      if (bus) {
        try {
          bus.emit<CopilotWeightsChangedPayload>({
            type: 'copilot.weights.changed',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              weights: result.weights,
              changedKeys,
              changedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] settings.setCopilotWeights: bus emit failed (weights saved):', err);
        }
      } else {
        console.warn(
          '[ipc] settings.setCopilotWeights: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
      return result;
    },

    // -----------------------------------------------------------------------
    // Proactive settings handlers (Phase 6 — Proactive Execution System)
    // -----------------------------------------------------------------------

    /** `settings.getProactive` — proactive mode enabled and autonomy mode. */
    async settingsGetProactive(): Promise<SettingsGetProactiveResponse> {
      return settingsRepo.getProactive();
    },

    /** `settings.setProactive` — patch proactive settings with validation. */
    async settingsSetProactive(req: SettingsSetProactiveRequest): Promise<void> {
      // Repo handles enabled coercion + autonomyMode validation.
      // After persisting, the proactiveTriggerService reads from settingsRepo
      // on next check, so changes take effect without app restart.
      settingsRepo.setProactive(req);
    },

    // -----------------------------------------------------------------------
    // Provider management handlers (Phase 3 — M18)
    // -----------------------------------------------------------------------

    async providersList() {
      return providersService.list();
    },

    async providersAdd(req) {
      if (typeof req.name !== 'string' || req.name.trim().length === 0) {
        throw new Error('[ipc] providers.add: name is required');
      }
      if (typeof req.kind !== 'string' || req.kind.trim().length === 0) {
        throw new Error('[ipc] providers.add: kind is required');
      }
      const config = providersService.add({
        name: req.name,
        kind: req.kind,
        privacyTier: req.privacyTier,
        configJson: req.configJson,
      });
      if (typeof req.apiKey === 'string' && req.apiKey.trim().length > 0) {
        await secretsStore.setApiKey(config.id, req.apiKey.trim());
      }
      return { providerId: config.id };
    },

    async providersUpdate(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.update: providerId is required');
      }
      providersService.update(req.providerId, {
        name: req.name,
        enabled: req.enabled,
        configJson: req.configJson,
      });
      if (typeof req.apiKey === 'string' && req.apiKey.trim().length > 0) {
        await secretsStore.setApiKey(req.providerId, req.apiKey.trim());
      }
    },

    async providersRemove(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.remove: providerId is required');
      }
      await providersService.remove(req.providerId);
    },

    async providersTestConnection(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.testConnection: providerId is required');
      }
      const isReady = await providersService.isConfigured(req.providerId);
      if (!isReady) {
        return { ok: false, error: 'Provider is not configured (missing API key or disabled)' };
      }

      // For Ollama, perform a real health check to verify connectivity
      const config = providersService.get(req.providerId);
      if (config?.kind === 'ollama') {
        try {
          // Extract host from baseURL (remove /api suffix if present)
          const baseUrl = config.baseUrl ?? 'http://localhost:11434/api';
          const healthUrl = `${baseUrl.replace(/\/api$/, '')}/api/tags`;
          const response = await fetch(healthUrl, { method: 'GET' });
          if (!response.ok) {
            return { ok: false, error: `Ollama returned HTTP ${response.status}` };
          }
          const data = (await response.json()) as { models?: Array<{ name: string }> };
          const modelCount = data.models?.length ?? 0;
          return { ok: true, detail: `${modelCount} model(s) available` };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Cannot reach Ollama: ${msg}` };
        }
      }

      return { ok: true };
    },

    async providersListModels(req) {
      if (typeof req.providerId !== 'string' || req.providerId.length === 0) {
        throw new Error('[ipc] providers.listModels: providerId is required');
      }

      const config = providersService.get(req.providerId);
      if (!config) {
        throw new Error(`[ipc] providers.listModels: provider not found: ${req.providerId}`);
      }

      if (config.kind !== 'ollama') {
        return { models: [] };
      }

      const baseUrl = config.baseUrl ?? 'http://localhost:11434/api';
      const tagsUrl = `${baseUrl.replace(/\/api$/, '')}/api/tags`;
      const response = await fetch(tagsUrl, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`[ipc] providers.listModels: Ollama returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };

      const models = new Set<string>();
      for (const row of data.models ?? []) {
        const model =
          typeof row.model === 'string' && row.model.trim().length > 0 ? row.model : row.name;
        if (typeof model === 'string' && model.trim().length > 0) {
          models.add(model.trim());
        }
      }
      if (typeof config.defaultModel === 'string' && config.defaultModel.trim().length > 0) {
        models.add(config.defaultModel.trim());
      }

      return { models: [...models].sort((a, b) => a.localeCompare(b)) };
    },

    // -----------------------------------------------------------------------
    // Vault management handlers (Phase 4 — M21)
    // -----------------------------------------------------------------------

    async vaultUpload(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.upload: companyId is required');
      }
      if (typeof req.sourcePath !== 'string' || req.sourcePath.length === 0) {
        throw new Error('[ipc] vault.upload: sourcePath is required');
      }
      const fileId = await vaultService.store(
        req.companyId,
        req.sourcePath,
        HUMAN_USER_ID,
        req.tags,
      );
      return { fileId };
    },

    async vaultDownload(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.download: fileId is required');
      }
      return vaultService.retrieve(req.fileId);
    },

    async vaultList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.list: companyId is required');
      }
      return vaultService.list(req.companyId);
    },

    async vaultSearch(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.search: companyId is required');
      }
      if (typeof req.query !== 'string' || req.query.trim().length === 0) {
        throw new Error('[ipc] vault.search: query is required');
      }
      return vaultService.search(req.companyId, req.query.trim());
    },

    async vaultDelete(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.delete: fileId is required');
      }
      await vaultService.remove(req.fileId);
    },

    async vaultVerify(req) {
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] vault.verify: fileId is required');
      }
      return vaultService.verify(req.fileId);
    },

    async vaultStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] vault.stats: companyId is required');
      }
      return vaultService.stats(req.companyId);
    },

    // -----------------------------------------------------------------------
    // Backup/restore handlers (Phase 4 — M23)
    // -----------------------------------------------------------------------

    async backupCreate(req) {
      const result = await backupService.create(req.destination);
      return result;
    },

    async backupRestore(req) {
      if (typeof req.backupPath !== 'string' || req.backupPath.length === 0) {
        throw new Error('[ipc] backup.restore: backupPath is required');
      }
      const manifest = await backupService.restore(req.backupPath);

      // Post-restore sweep (M33 F4). Rebuilds the `system-agent` +
      // `system-copilot` pseudo-employee rows for every company in the
      // just-restored DB. The sweep is a no-op for current-schema
      // backups — both flags return `false` across the board — but
      // it is load-bearing for backups that pre-date M31 (agent) or
      // M33 (copilot). We surface the counts in the response so the
      // renderer can show a one-time "restored N agents, M copilots"
      // toast when non-zero and silently skip otherwise.
      //
      // A missing `ensurePostRestoreBootstrap` dep (legacy test harness,
      // or intentionally-unwired handler build) leaves the field
      // undefined on the response. The renderer must tolerate that —
      // see `BackupRestoreResponse.postRestoreSystemEmployees` JSDoc.
      let postRestoreSystemEmployees: BackupRestoreResponse['postRestoreSystemEmployees'];
      if (ensurePostRestoreBootstrap) {
        try {
          const result = ensurePostRestoreBootstrap();
          postRestoreSystemEmployees = {
            companiesScanned: result.companiesScanned,
            agentsCreated: result.agentsCreated,
            copilotsCreated: result.copilotsCreated,
            skipped: result.skipped,
          };
        } catch (err) {
          // A catastrophic failure in the bootstrap itself (not
          // per-company — those are already swallowed + logged via
          // `skipped[]`) must NOT fail the whole restore. The DB +
          // vault are already swapped; the user would be left with
          // an unusable app if we threw here. Log and continue with
          // undefined counts — the renderer surfaces a restore-OK
          // state and the user can retry the bootstrap via a future
          // repair action.
          console.error(
            '[ipc] backup.restore: post-restore system-employee bootstrap failed — restore itself succeeded:',
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] backup.restore: ensurePostRestoreBootstrap dep unwired — pre-M33 backups will be missing system-copilot',
        );
      }

      return { manifest, postRestoreSystemEmployees };
    },

    async backupList() {
      return backupService.list();
    },

    // -----------------------------------------------------------------------
    // Audit log handlers (Phase 4 — M24)
    // -----------------------------------------------------------------------

    async auditList(filter) {
      if (typeof filter.companyId !== 'string' || filter.companyId.length === 0) {
        throw new Error('[ipc] audit.list: companyId is required');
      }
      const rows = auditRepo.list(filter);
      return rows as AuditEvent[];
    },

    async auditStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] audit.stats: companyId is required');
      }
      return auditRepo.stats(req.companyId);
    },

    async auditExport(req) {
      if (
        !req.filter ||
        typeof req.filter.companyId !== 'string' ||
        req.filter.companyId.length === 0
      ) {
        throw new Error('[ipc] audit.export: filter.companyId is required');
      }
      if (req.format !== 'csv' && req.format !== 'json') {
        throw new Error('[ipc] audit.export: format must be "csv" or "json"');
      }
      const content =
        req.format === 'csv' ? auditRepo.exportCsv(req.filter) : auditRepo.exportJson(req.filter);
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const exportDir = join(tmpdir(), 'team-x-exports');
      mkdirSync(exportDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-export-${timestamp}.${req.format}`;
      const filePath = join(exportDir, filename);
      writeFileSync(filePath, content, 'utf-8');
      return { filePath };
    },

    async copilotExport(req) {
      const filter = assertCopilotExportRequest(req);
      if (!copilotInsightsRepo) {
        throw new Error('[ipc] copilot.export: copilotInsightsRepo dep unwired');
      }

      const result = copilotInsightsRepo.listActiveForExport(filter);
      const exportedAtIso = new Date().toISOString();
      const content =
        req.format === 'csv'
          ? serializeCopilotInsightsCsv(result.rows)
          : serializeCopilotInsightsJson({
              rows: result.rows,
              filter,
              exportedAtIso,
              truncated: result.truncated,
            });
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const exportDir = join(tmpdir(), 'team-x-exports');
      mkdirSync(exportDir, { recursive: true });
      const timestamp = exportedAtIso.replace(/[:.]/g, '-');
      const filename = `copilot-insights-export-${timestamp}.${req.format}`;
      const filePath = join(exportDir, filename);
      writeFileSync(filePath, content, 'utf-8');
      return {
        filePath,
        rowCount: result.rows.length,
        truncated: result.truncated,
        format: req.format,
        scope: req.scope,
      };
    },

    // -----------------------------------------------------------------------
    // Ticket management handlers (Phase 2 — M12)
    // -----------------------------------------------------------------------

    async ticketsCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.create: companyId is required');
      }
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] tickets.create: title is required');
      }

      const title = req.title.trim();
      const assigneeId = req.assigneeId ?? null;
      const ticketId = ticketsRepo.create({
        companyId: req.companyId,
        title,
        description: req.description ?? '',
        priority: req.priority ?? 'medium',
        assigneeId,
        reporterId: HUMAN_USER_ID,
        reporterKind: 'user',
        labelsJson: req.labelsJson ?? '[]',
        slaHours: req.slaHours ?? null,
        dueAt: req.dueAt ?? null,
      });

      // Invariant #11 (Phase 5.6 M-C step f): emit ticket.created FIRST.
      // If the immediate-assign flow below runs successfully, a
      // separate ticket.assigned event fires after the thread is wired.
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.created',
            companyId: req.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { ticketId, companyId: req.companyId, title, assigneeId, createdAt },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.create: bus emit failed (row still created with id ${ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.create: bus dep unwired — renderer caches will NOT invalidate');
      }

      // If assigneeId was provided, trigger immediate assignment flow
      if (req.assigneeId) {
        const employee = employeesRepo.getById(req.assigneeId);
        if (employee) {
          const ticket = ticketsRepo.getById(ticketId);
          if (ticket) {
            // Create the ticket discussion thread
            const threadId = threadsRepo.create({
              companyId: req.companyId,
              kind: 'ticket',
              subject: title,
              createdBy: HUMAN_USER_ID,
            });
            threadsRepo.addMember({
              threadId,
              memberId: HUMAN_USER_ID,
              memberKind: 'user',
            });
            threadsRepo.addMember({
              threadId,
              memberId: req.assigneeId,
              memberKind: 'employee',
            });
            ticketsRepo.setThreadId(ticketId, threadId);
            ticketsRepo.assign(ticketId, req.assigneeId);

            // Post the ticket description as the first message
            const msgContent = `**Ticket: ${title}**\n\n${req.description ?? '(no description)'}`;
            const messageId = messagesRepo.append({
              threadId,
              authorId: HUMAN_USER_ID,
              authorKind: 'user',
              content: msgContent,
            });

            // Invariant #11 — second emit for the immediate-assign path.
            // previousAssigneeId is always null here because this branch
            // fires as a side-effect of ticket creation.
            if (bus) {
              try {
                bus.emit({
                  type: 'ticket.assigned',
                  companyId: req.companyId,
                  actorId: HUMAN_USER_ID,
                  actorKind: 'user',
                  payload: {
                    ticketId,
                    companyId: req.companyId,
                    assigneeId: req.assigneeId,
                    previousAssigneeId: null,
                    threadId,
                    assignedAt: Date.now(),
                  },
                });
              } catch (err) {
                console.error(
                  `[ipc] tickets.create: ticket.assigned bus emit failed (assignment still persisted, ticket=${ticketId}):`,
                  err,
                );
              }
            }

            // Enqueue agent work (fire-and-forget)
            orchestrator
              .enqueueChat({
                threadId,
                employeeId: req.assigneeId,
                userMessageId: messageId,
              })
              .catch((err: unknown) => {
                console.error(
                  `[ipc] tickets.create: orchestrator turn failed for ticket=${ticketId}:`,
                  err,
                );
              });
          }
        }
      }

      return { ticketId };
    },

    async ticketsUpdate(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.update: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.update: ticket not found: ${req.ticketId}`);
      }

      // Compute patchedKeys BEFORE the write — tracks caller intent.
      // `assigneeId` is intentionally excluded from this handler's
      // patch surface because tickets.update does not call assign();
      // the dedicated tickets.assign channel emits ticket.assigned
      // with its own payload (including previousAssigneeId snapshot).
      const patchedKeys: Array<'title' | 'description' | 'status' | 'priority' | 'assigneeId'> = [];
      if (req.title !== undefined) patchedKeys.push('title');
      if (req.description !== undefined) patchedKeys.push('description');
      if (req.status !== undefined) patchedKeys.push('status');
      if (req.priority !== undefined) patchedKeys.push('priority');

      ticketsRepo.update(req.ticketId, {
        title: req.title,
        description: req.description,
        priority: req.priority,
        status: req.status,
        labelsJson: req.labelsJson,
        slaHours: req.slaHours,
        dueAt: req.dueAt,
      });

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.updated',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.update: bus emit failed (row still updated, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.update: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAssign(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.assign: ticketId is required');
      }
      if (typeof req.assigneeId !== 'string' || req.assigneeId.length === 0) {
        throw new Error('[ipc] tickets.assign: assigneeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.assign: ticket not found: ${req.ticketId}`);
      }
      const employee = employeesRepo.getById(req.assigneeId);
      if (!employee) {
        throw new Error(`[ipc] tickets.assign: employee not found: ${req.assigneeId}`);
      }

      // Capture previous assignee BEFORE the repo write — `ticket`
      // holds the pre-assign row (fetched at the top of the handler).
      const previousAssigneeId = ticket.assigneeId;

      ticketsRepo.assign(req.ticketId, req.assigneeId);

      // Create discussion thread if one doesn't exist yet
      let threadId = ticket.threadId;
      if (!threadId) {
        threadId = threadsRepo.create({
          companyId: ticket.companyId,
          kind: 'ticket',
          subject: ticket.title,
          createdBy: HUMAN_USER_ID,
        });
        threadsRepo.addMember({
          threadId,
          memberId: HUMAN_USER_ID,
          memberKind: 'user',
        });
        threadsRepo.addMember({
          threadId,
          memberId: req.assigneeId,
          memberKind: 'employee',
        });
        ticketsRepo.setThreadId(req.ticketId, threadId);

        // Post the ticket description as the first message
        const msgContent = `**Ticket: ${ticket.title}**\n\n${ticket.description || '(no description)'}`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'user',
          content: msgContent,
        });

        // Enqueue agent work
        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      } else {
        // Thread exists — post a reassignment notice and enqueue
        const msgContent = `Ticket reassigned to ${employee.name} (${employee.title}).`;
        const messageId = messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'system',
          content: msgContent,
        });

        // Ensure new assignee is a thread member
        const members = threadsRepo.listMembers(threadId);
        const alreadyMember = members.some(
          (m) => m.memberId === req.assigneeId && m.memberKind === 'employee',
        );
        if (!alreadyMember) {
          threadsRepo.addMember({
            threadId,
            memberId: req.assigneeId,
            memberKind: 'employee',
          });
        }

        orchestrator
          .enqueueChat({
            threadId,
            employeeId: req.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.assign: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
      }

      // Invariant #11 (Phase 5.6 M-C step f). `threadId` is non-null
      // by this point — both branches of the if/else above set it.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.assigned',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              assigneeId: req.assigneeId,
              previousAssigneeId,
              threadId,
              assignedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.assign: bus emit failed (assignment still persisted, ticket=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.assign: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAddParticipant(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.addParticipant: ticketId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] tickets.addParticipant: employeeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.addParticipant: ticket not found: ${req.ticketId}`);
      }
      const employee = validateTicketParticipant(ticket, req.employeeId, 'tickets.addParticipant');
      const threadId = ensureTicketThread(ticket);
      const added = ensureTicketMember(threadId, req.employeeId, 'employee');
      const changedAt = Date.now();

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'system',
        content: added
          ? `${employee.name} was added to this ticket.`
          : `${employee.name} is already on this ticket.`,
      });
      threadsRepo.updateLastMessageAt(threadId, changedAt);

      orchestrator
        .enqueueChat({
          threadId,
          employeeId: req.employeeId,
          userMessageId: messageId,
        })
        .catch((err: unknown) => {
          console.error(
            `[ipc] tickets.addParticipant: orchestrator turn failed for ticket=${req.ticketId}, employee=${req.employeeId}:`,
            err,
          );
        });

      if (bus) {
        try {
          bus.emit({
            type: 'ticket.participantAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              employeeId: req.employeeId,
              threadId,
              added,
              addedAt: changedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.addParticipant: bus emit failed (participant still added, ticket=${req.ticketId}, employee=${req.employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.addParticipant: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsRemoveParticipant(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.removeParticipant: ticketId is required');
      }
      if (typeof req.employeeId !== 'string' || req.employeeId.length === 0) {
        throw new Error('[ipc] tickets.removeParticipant: employeeId is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.removeParticipant: ticket not found: ${req.ticketId}`);
      }
      const employee = validateTicketParticipant(
        ticket,
        req.employeeId,
        'tickets.removeParticipant',
      );
      const threadId = ticket.threadId;
      const wasMember = threadId
        ? threadsRepo
            .listMembers(threadId)
            .some(
              (member) => member.memberId === req.employeeId && member.memberKind === 'employee',
            )
        : false;
      if (threadId) {
        threadsRepo.removeMember({ threadId, memberId: req.employeeId, memberKind: 'employee' });
      }

      const clearedAssignee = ticket.assigneeId === req.employeeId;
      if (clearedAssignee) {
        ticketsRepo.update(req.ticketId, {
          assigneeId: null,
          status: ticket.status === 'done' ? ticket.status : 'open',
        });
      }

      const changedAt = Date.now();
      if (threadId) {
        messagesRepo.append({
          threadId,
          authorId: HUMAN_USER_ID,
          authorKind: 'system',
          content: `${employee.name} was removed from this ticket.${
            clearedAssignee ? ' The ticket is now unassigned.' : ''
          }`,
        });
        threadsRepo.updateLastMessageAt(threadId, changedAt);
      }

      if (bus) {
        try {
          bus.emit({
            type: 'ticket.participantRemoved',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              employeeId: req.employeeId,
              threadId,
              removed: wasMember,
              clearedAssignee,
              removedAt: changedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.removeParticipant: bus emit failed (participant still removed, ticket=${req.ticketId}, employee=${req.employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.removeParticipant: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsClose(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.close: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.close: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.close(req.ticketId);

      // Invariant #11 (Phase 5.6 M-C step f).
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.closed',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              closedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.close: bus emit failed (ticket still closed, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.close: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsReopen(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.reopen: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.reopen: ticket not found: ${req.ticketId}`);
      }
      ticketsRepo.reopen(req.ticketId);

      // Invariant #11.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.reopened',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              reopenedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.reopen: bus emit failed (ticket still reopened, id=${req.ticketId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] tickets.reopen: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async ticketsAddComment(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.addComment: ticketId is required');
      }
      if (typeof req.content !== 'string' || req.content.trim().length === 0) {
        throw new Error('[ipc] tickets.addComment: content is required');
      }

      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.addComment: ticket not found: ${req.ticketId}`);
      }

      const threadId = ensureTicketThread(ticket);

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content: req.content.trim(),
      });

      enqueueTicketParticipantWakeups({
        ticket,
        threadId,
        messageId,
        reason: 'tickets.addComment',
      });

      // Invariant #11 (Phase 5.6 M-C step f). authorId is HUMAN_USER_ID
      // because this IPC is the Rocky-facing channel; agent-authored
      // replies arrive through the orchestrator's own emit pipeline.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.commentAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              messageId,
              authorId: HUMAN_USER_ID,
              addedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.addComment: bus emit failed (message still persisted, id=${messageId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.addComment: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { messageId };
    },

    async ticketsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] tickets.list: companyId is required');
      }
      return ticketsRepo.listByCompany(req.companyId).map(rowToTicket);
    },

    async ticketsGet(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.get: ticketId is required');
      }
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.get: ticket not found: ${req.ticketId}`);
      }

      // Fetch thread messages if the ticket has a discussion thread
      let messages: ChatMessage[] = [];
      if (ticket.threadId) {
        const rows = messagesRepo.listByThread(ticket.threadId);
        messages = rows.map(rowToChatMessage);
      }

      // Fetch assignee
      let assignee: Employee | null = null;
      if (ticket.assigneeId) {
        const empRow = employeesRepo.getById(ticket.assigneeId);
        if (empRow) assignee = rowToEmployee(empRow);
      }
      const participants = listTicketParticipantRows(ticket, ticket.threadId).map(rowToEmployee);

      return {
        ...rowToTicket(ticket),
        messages,
        assignee,
        participants,
      };
    },

    // -----------------------------------------------------------------------
    // Ticket attachment handlers (Phase 4 — M22)
    // -----------------------------------------------------------------------

    async ticketsAttachFile(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.attachFile: ticketId is required');
      }
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] tickets.attachFile: fileId is required');
      }

      // Fetch the ticket to thread companyId into the bus event + act as a
      // phantom-ticket-id validation guard (aborts before any repo write if
      // the ticketId does not resolve). Mirrors the `projects.linkTicket`
      // pattern from step f.
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.attachFile: ticket not found: ${req.ticketId}`);
      }

      const attachmentId = ticketAttachmentsRepo.attach(req.ticketId, req.fileId, HUMAN_USER_ID);
      const attachedAt = Date.now();

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-011).
      // Attachment lifecycle was explicitly deferred from step f's 14-event
      // envelope and scoped into this atomic alongside employees.hire/fire.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.attachmentAdded',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              attachmentId,
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              fileId: req.fileId,
              attachedBy: HUMAN_USER_ID,
              attachedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.attachFile: bus emit failed (row still attached, id=${attachmentId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.attachFile: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { attachmentId };
    },

    async ticketsDetachFile(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: ticketId is required');
      }
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: fileId is required');
      }

      // Fetch the ticket to thread companyId into the bus event + phantom-
      // id guard. Mirrors `projects.unlinkTicket` (step f).
      const ticket = ticketsRepo.getById(req.ticketId);
      if (!ticket) {
        throw new Error(`[ipc] tickets.detachFile: ticket not found: ${req.ticketId}`);
      }

      // Snapshot the attachmentId BEFORE the drop so the bus event can
      // carry the row identifier for renderer optimistic animations. If
      // no matching (ticketId, fileId) row exists, the detach is a no-op
      // but we still emit (empty-patch-still-emits discipline) with
      // `attachmentId: null` so optimistic-update renderer paths can
      // reconcile. Mirrors `companies.update` empty-patch emit (step e).
      const existing = ticketAttachmentsRepo
        .listByTicket(req.ticketId)
        .find((row) => row.fileId === req.fileId);
      const snapshotAttachmentId = existing?.id ?? null;

      ticketAttachmentsRepo.detachByFile(req.ticketId, req.fileId);

      // Invariant #11 emit.
      if (bus) {
        try {
          bus.emit({
            type: 'ticket.attachmentRemoved',
            companyId: ticket.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              attachmentId: snapshotAttachmentId,
              ticketId: req.ticketId,
              companyId: ticket.companyId,
              fileId: req.fileId,
              removedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] tickets.detachFile: bus emit failed (row still detached, ticketId=${req.ticketId}, fileId=${req.fileId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] tickets.detachFile: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async ticketsListAttachments(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.listAttachments: ticketId is required');
      }
      const rows = ticketAttachmentsRepo.listByTicket(req.ticketId);
      // Enrich with vault file metadata
      return rows.map((row): TicketAttachment => {
        const vaultFile = vaultService.get(row.fileId);
        return {
          id: row.id,
          ticketId: row.ticketId,
          fileId: row.fileId,
          attachedBy: row.attachedBy,
          attachedAt: row.attachedAt,
          fileName: vaultFile?.originalName,
          fileMimeType: vaultFile?.mimeType,
          fileSizeBytes: vaultFile?.sizeBytes,
        };
      });
    },

    // -----------------------------------------------------------------------
    // Proactive execution (Phase 6 — Slice 3)
    // -----------------------------------------------------------------------

    async proactiveSetEnabled({ companyId, enabled }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.setEnabled: companyId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.setEnabled: proactiveTriggerService dep is required');
      }
      proactiveTriggerService.setEnabled({ companyId, enabled });
    },

    async proactiveDecomposeGoal({ companyId, goalId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.decomposeGoal: companyId is required');
      }
      if (typeof goalId !== 'string' || goalId.length === 0) {
        throw new Error('[ipc] proactive.decomposeGoal: goalId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.decomposeGoal: proactiveTriggerService dep is required');
      }
      await proactiveTriggerService.decomposeGoal({ companyId, goalId });
      return { success: true };
    },

    async proactiveScanForWork({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.scanForWork: companyId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.scanForWork: proactiveTriggerService dep is required');
      }
      const result = await proactiveTriggerService.scanForWork({ companyId });
      return { queuedCount: result.queuedCount };
    },

    async proactiveGetState({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.getState: companyId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.getState: proactiveTriggerService dep is required');
      }
      const enabled = proactiveTriggerService.isEnabled(companyId);
      return {
        enabled,
        activeWork: 0, // TODO: track active work count
        queuedWork: 0, // TODO: track queued work count
        lastScanAt: null, // TODO: track last scan timestamp
      };
    },

    // -----------------------------------------------------------------------
    // Updater (Phase 4 — M25)
    // -----------------------------------------------------------------------

    async updaterCheck() {
      return updaterService.checkForUpdate();
    },

    async updaterInstall() {
      return updaterService.downloadAndInstall();
    },
  };
}
