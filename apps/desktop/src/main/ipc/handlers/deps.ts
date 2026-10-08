/**
 * Dependency shapes the IPC handlers take (narrow structural interfaces),
 * split from handlers.ts (audit 2026-10-07 P1-7).
 */

import { AUTO_THREAD_ID } from '@team-x/shared-types';
import type {
  AcceptOperatorInviteResponse,
  ActorKind,
  AgentImprovementRunResult,
  AgentImprovementSnapshot,
  ApprovalItem,
  ArtifactRecord,
  AssembledThreadContext,
  AuditFilter,
  AuditStats,
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  BackupEntry,
  BindEmployeeRuntimeProfileRequest,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  CompanyCloudLinkStatus,
  CompanySharingReadinessSummary,
  CreateBudgetPolicyRequest,
  CreateOperatorInviteRequest,
  CreateRoutineRequest,
  CreateRuntimeProfileRequest,
  EmployeeRuntimeBinding,
  EventType,
  ExportCompanyPackageRequest,
  ExportCompanyPackageResponse,
  GetThreadDigestRequest,
  HardwareProfile,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ImportCompanyPackageRequest,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateResponse,
  InstallGithubSkillRequest,
  InstallLocalSkillRequest,
  ListAgentImprovementRequest,
  ListApprovalItemsRequest,
  ListArtifactsRequest,
  ListBudgetLedgerEntriesRequest,
  ListCompanyTemplatesResponse,
  ListRoutineRunsRequest,
  ListRunCheckpointsRequest,
  OperatorAccessEntry,
  OperatorInvite,
  PackedThreadContext,
  PreviewCompanyPackageImportRequest,
  PreviewCompanyPackageImportResponse,
  ProviderConfig,
  RemoveSkillRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  ReviewApprovalItemRequest,
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
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsResponse,
  SettingsGetExtensionsResponse,
  SettingsGetMemoryResponse,
  SettingsGetPlannerResponse,
  SettingsGetProactiveResponse,
  SettingsSetAgenticRequest,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
  SettingsSetExtensionsRequest,
  SettingsSetMemoryRequest,
  SettingsSetPlannerRequest,
  SettingsSetProactiveRequest,
  SkillAssignment,
  TelemetryRunKind,
  ThreadDigest,
  UpdateBudgetPolicyRequest,
  UpdateCheckResult,
  UpdateInstallResult,
  UpdateRoutineRequest,
  UpdateRuntimeProfileRequest,
  UpsertSkillAssignmentRequest,
  ValidateRuntimeProfileRequest,
  VaultFile,
  VaultSearchResult,
} from '@team-x/shared-types';

import type { CompanyRow, UpdateCompanyInput } from '../../db/repos/companies.js';
import type { CopilotExportFilter, CopilotExportResult } from '../../db/repos/copilot-insights.js';
import type {
  CreateEmployeeInput,
  EmployeeRow,
  PromoteEmployeeInput,
  UpdateEmployeeProfileInput,
} from '../../db/repos/employees.js';
import type { EventRow } from '../../db/repos/events.js';
import type {
  AuthorityGrantRow,
  AuthorityRequestRow,
  ExtensionRow,
} from '../../db/repos/extensions.js';
import type { CreateGoalInput, GoalRow, UpdateGoalInput } from '../../db/repos/goals.js';
import type { McpServersRepo } from '../../db/repos/mcp-servers.js';
import type { MeetingRow } from '../../db/repos/meetings.js';
import type { AppendMessageInput, MessageRow } from '../../db/repos/messages.js';
import type { OrgEdgeRow } from '../../db/repos/orgchart.js';
import type {
  CreateProjectInput,
  ProjectRow,
  UpdateProjectInput,
} from '../../db/repos/projects.js';
import type {
  CompanyStats,
  CostBreakdownRow,
  DailyUsageRow,
  EmployeeStatsRow,
  RecentRunRow,
} from '../../db/repos/runs.js';
import type {
  CreateScheduleItemInput,
  ScheduleItemRow,
  UpdateScheduleItemInput,
} from '../../db/repos/schedule-items.js';
import type {
  AddThreadMemberInput,
  CreateThreadInput,
  GetOrCreateDmThreadInput,
  ThreadMemberRow,
  ThreadRow,
  ThreadWithMembers,
} from '../../db/repos/threads.js';
import type { CreateTicketInput, TicketRow, UpdateTicketInput } from '../../db/repos/tickets.js';
import type { createMeetingService } from '../../orchestrator/meeting-service.js';
import type { AuthorityResolverService } from '../../services/authority-resolver-service.js';
import type { ExtensionsRegistryService } from '../../services/extensions-registry-service.js';
import type { McpHost } from '../../services/mcp-host.js';

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

export interface IpcScheduleItemsRepo {
  create(input: CreateScheduleItemInput): string;
  getById(id: string): ScheduleItemRow | null;
  listByCompany(companyId: string): ScheduleItemRow[];
  update(id: string, patch: UpdateScheduleItemInput): void;
  delete(id: string): void;
}

export interface IpcAgentWakeupRequestsRepo {
  create(input: {
    companyId: string;
    agentId: string;
    triggerType: 'routine' | 'ticket_assigned' | 'schedule' | 'manual' | 'goal_decomposed';
    triggerId?: string;
    priority?: number;
    scheduledFor?: number;
    context?: unknown;
  }): string;
  cancel(id: string): void;
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
  /** Delete a backup directory permanently. Path must resolve inside the
   *  app's backups directory; service throws otherwise. */
  delete(backupPath: string): Promise<{ deletedPath: string }>;
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
 * `settings.setCopilot` side effect and company lifecycle starts/stops
 * for the per-company timer. The full service surface lives in
 * `main/services/copilot-analyzer-service.ts`; this interface pulls in
 * only the methods the IPC boundary requires.
 *
 * Phase 5 — M33 T7.
 */
export interface IpcCopilotAnalyzerService {
  /** Start the per-company analyzer timer. No-ops if it is already running. */
  start(companyId: string): void;
  /** Restart the per-company analyzer timer after settings change. */
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
  /** Observed runtime counters backing `proactive.getState` (audit F2). */
  getState(companyId: string): {
    activeWork: number;
    queuedWork: number;
    lastScanAt: number | null;
  };
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
  reviewItem(input: ReviewApprovalItemRequest & { operatorId: string }): Promise<{
    item: ApprovalItem;
    grantId: string | null;
    ticketId?: string | null;
  }>;
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
  scheduleItemsRepo: IpcScheduleItemsRepo;
  agentWakeupRequestsRepo?: IpcAgentWakeupRequestsRepo;
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
   * Optional in the deps type, but every `proactive.*` handler throws
   * `proactiveTriggerService dep is required` when it is unwired, so a missing
   * composition-root wiring surfaces as a hard IPC failure rather than a silent no-op.
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
