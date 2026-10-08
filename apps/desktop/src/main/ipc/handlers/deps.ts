/**
 * Dependency shapes the IPC handlers take (narrow structural interfaces),
 * split from handlers.ts (audit 2026-10-07 P1-7).
 */

import { AUTO_THREAD_ID } from '@team-x/shared-types';
import type {
  HardwareProfile,
  HireEmployeeRequest,
  HireEmployeeResponse,
  ResolveThreadRequest,
  ResolveThreadResponse,
  RoleSpec,
  SendChatRequest,
  SendChatResponse,
  TelemetryRunKind,
} from '@team-x/shared-types';

import type { CompanyRow, UpdateCompanyInput } from '../../db/repos/companies.js';
import type {
  CreateEmployeeInput,
  EmployeeRow,
  PromoteEmployeeInput,
  UpdateEmployeeProfileInput,
} from '../../db/repos/employees.js';
import type { EventRow } from '../../db/repos/events.js';
import type { AuthorityGrantRow, AuthorityRequestRow } from '../../db/repos/extensions.js';
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

import type {
  IpcAgentImprovementService,
  IpcApprovalInboxService,
  IpcArtifactService,
  IpcAuditRepo,
  IpcAutonomyBenchmarkService,
  IpcAutonomyDoctorService,
  IpcBackupService,
  IpcBudgetGovernanceService,
  IpcCloudLinkService,
  IpcCompanyPortabilityService,
  IpcContextAssemblerService,
  IpcContextPackerService,
  IpcCopilotAnalyzerService,
  IpcCopilotEventWindow,
  IpcCopilotInsightsRepo,
  IpcEventBus,
  IpcOperatorAccessService,
  IpcProactiveTriggerService,
  IpcProvidersService,
  IpcRoutineService,
  IpcRunCheckpointService,
  IpcRuntimeOperationsService,
  IpcRuntimeProfilesService,
  IpcSecretsStore,
  IpcSettingsRepo,
  IpcSkillsService,
  IpcThreadDigestService,
  IpcUpdaterService,
  IpcVaultService,
} from './deps-services.js';

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

export * from './deps-services.js';

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
