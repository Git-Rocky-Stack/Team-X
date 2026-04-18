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
 *   Phase 1 hardcodes the human user as `HUMAN_USER_ID = 'rocky'`
 *   to match the seed and the orchestrator integration tests. Phase 2
 *   replaces this with a proper users table when multi-user lands.
 */

import type {
  AddProviderRequest,
  AddProviderResponse,
  AddTicketCommentRequest,
  AddTicketCommentResponse,
  ArchiveCompanyRequest,
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
  BackupEntry,
  BackupRestoreRequest,
  BackupRestoreResponse,
  CallMeetingRequest,
  CallMeetingResponse,
  ChatMessage,
  CloseTicketRequest,
  CompaniesCreateRequest,
  CompaniesCreateResponse,
  Company,
  CompanySettings,
  CreateGoalRequest,
  CreateGoalResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  DashboardEvent,
  DeleteGoalRequest,
  DeleteProjectRequest,
  DetachFileRequest,
  Employee,
  EmployeesPromoteRequest,
  EmployeesPromoteResponse,
  EmployeesSetManagerRequest,
  EndMeetingResponse,
  GetGoalRequest,
  GetMeetingRequest,
  GetProjectRequest,
  GetTicketRequest,
  Goal,
  GoalDetail,
  HireEmployeeRequest,
  HireEmployeeResponse,
  InterjectMeetingRequest,
  InterjectMeetingResponse,
  LinkTicketToProjectRequest,
  ListAttachmentsRequest,
  ListEventsRequest,
  ListEventsResponse,
  ListGoalsRequest,
  ListMeetingsRequest,
  ListProjectsRequest,
  ListTicketsRequest,
  McpServerSummary,
  Meeting,
  MeetingActionItem,
  MeetingDetail,
  MeetingMode,
  MeetingStatus,
  OrgchartEdge,
  OrgchartGetRequest,
  OrgchartGetResponse,
  Project,
  ProjectDetail,
  RemoveProviderRequest,
  ReopenTicketRequest,
  ResolveThreadRequest,
  ResolveThreadResponse,
  SendChatRequest,
  SendChatResponse,
  SettingsGetAgenticResponse,
  SettingsGetConcurrencyResponse,
  SettingsGetCopilotResponse,
  SettingsGetPlannerResponse,
  SettingsGetPrivacyResponse,
  SettingsGetRagConfigResponse,
  SettingsGetRuntimeResponse,
  SettingsSetAgenticRequest,
  SettingsSetConcurrencyRequest,
  SettingsSetCopilotRequest,
  SettingsSetPlannerRequest,
  SettingsSetPrivacyRequest,
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
  TestMcpConnectionRequest,
  TestMcpConnectionResponse,
  TestProviderConnectionRequest,
  TestProviderConnectionResponse,
  Thread,
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
import type { HardwareProfile, ProviderConfig } from '@team-x/shared-types';
import { AUTO_THREAD_ID, DEFAULT_CONCURRENCY_CAPS, PRIVACY_TIER_RANK } from '@team-x/shared-types';

import type { RoleSpec } from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type {
  CreateEmployeeInput,
  EmployeeRow,
  PromoteEmployeeInput,
} from '../db/repos/employees.js';
import type { CreateGoalInput, GoalRow, UpdateGoalInput } from '../db/repos/goals.js';
import type { MeetingRow } from '../db/repos/meetings.js';
import type { AppendMessageInput, MessageRow } from '../db/repos/messages.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';
import type { CreateProjectInput, ProjectRow, UpdateProjectInput } from '../db/repos/projects.js';
import type {
  CompanyStats,
  CostBreakdownRow,
  DailyUsageRow,
  EmployeeStatsRow,
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
}

export interface IpcThreadsRepo {
  create(input: CreateThreadInput): string;
  getById(id: string): ThreadRow | null;
  addMember(input: AddThreadMemberInput): void;
  listMembers(threadId: string): ThreadMemberRow[];
  getOrCreateDmThread(input: GetOrCreateDmThreadInput): string;
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
   * Upsert the edge pointing at the report. Throws on directed-cycle
   * rejection. M-C step d.
   */
  setManager(input: { companyId: string; managerId: string; reportId: string }): string;
  /** Clear the edge whose `report_id = reportId`. No-op when no edge exists. M-C step d. */
  removeByReport(reportId: string): void;
  /**
   * Pre-check whether making `managerId` the manager of `reportId`
   * would close a directed cycle. Repo's `setManager` runs the same
   * guard internally; exposed here so the IPC handler can produce a
   * friendlier error message before invoking the SQL write. M-C step d.
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

import type { EventRow } from '../db/repos/events.js';
import type { McpServersRepo } from '../db/repos/mcp-servers.js';
import type { McpHost } from '../services/mcp-host.js';
import { pickStrategy } from '../services/runtime-strategy.js';

export interface IpcEventsRepo {
  listByCompany(companyId: string, cursor: number | undefined, limit: number): EventRow[];
}

export interface IpcRunsRepo {
  companyStats(companyId: string): CompanyStats;
  dailyUsage(companyId: string, fromMs: number, toMs: number): DailyUsageRow[];
  employeeStats(companyId: string): EmployeeStatsRow[];
  costBreakdown(companyId: string, fromMs?: number, toMs?: number): CostBreakdownRow[];
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
  /** Copilot service settings — snapshot read (clamped). Phase 5 — M33. */
  getCopilot(): SettingsGetCopilotResponse;
  /** Copilot service settings — clamped/filtered write. Phase 5 — M33. */
  setCopilot(req: SettingsSetCopilotRequest): void;
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
  providersService: IpcProvidersService;
  secretsStore: IpcSecretsStore;
  settingsRepo: IpcSettingsRepo;
  vaultService: IpcVaultService;
  backupService: IpcBackupService;
  auditRepo: IpcAuditRepo;
  updaterService: IpcUpdaterService;
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
   * `employees.list` — return every employee in a given company,
   * mapped from the raw DB row to the public `Employee` shape from
   * shared-types. The renderer uses this to drive the dashboard cards
   * + the chat drawer's recipient list.
   */
  employeesList(req: { companyId: string }): Promise<Employee[]>;

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
   * Includes global servers (companyId=null) and company-specific servers.
   */
  mcpList(req: { companyId: string }): Promise<McpServerSummary[]>;

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
   * `mcp.removeServer` — remove an MCP server.
   */
  mcpRemoveServer(req: { serverId: string }): Promise<void>;

  /**
   * `mcp.testConnection` — test an MCP connection without persisting.
   */
  mcpTestConnection(req: TestMcpConnectionRequest): Promise<TestMcpConnectionResponse>;

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
  /**
   * `settings.setCopilot` — patch one or more copilot-service settings with
   * clamping + category filtering, then synchronously restart the
   * per-company analyzer timer so the new values take effect without
   * an app restart (Phase 5 — M33).
   */
  settingsSetCopilot(req: SettingsSetCopilotRequest): Promise<void>;

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

  // -----------------------------------------------------------------------
  // Ticket management handlers (Phase 2 — M12)
  // -----------------------------------------------------------------------

  /** `updater.check` — check GitHub Releases for a newer version. User-triggered only. */
  updaterCheck(): Promise<UpdateCheckResult>;

  /** `updater.install` — download and install the available update. App will restart. */
  updaterInstall(): Promise<UpdateInstallResult>;

  /** `tickets.create` — file a new ticket. Optionally assigns immediately. */
  ticketsCreate(req: CreateTicketRequest): Promise<CreateTicketResponse>;

  /** `tickets.update` — update mutable ticket fields. */
  ticketsUpdate(req: UpdateTicketRequest): Promise<void>;

  /** `tickets.assign` — assign a ticket to an employee, creating thread + WorkItem. */
  ticketsAssign(req: AssignTicketRequest): Promise<void>;

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

import type {
  ActorKind,
  AuthorKind,
  EmployeeStatus,
  EventType,
  GoalStatus,
  ProjectPriority,
  ProjectStatus,
  TicketPriority,
  TicketStatus,
} from '@team-x/shared-types';

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
    createdAt: row.createdAt,
    settings,
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
    providersService,
    secretsStore,
    settingsRepo,
    vaultService,
    backupService,
    auditRepo,
    updaterService,
    copilotAnalyzerService,
    copilotEventWindow,
    bus,
    ensurePostRestoreBootstrap,
    ensureSystemForCompany,
    getHardwareProfile,
  } = deps;

  return {
    async companiesList() {
      return companiesRepo.list().map(rowToCompany);
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
            actorId: 'user',
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
            actorId: 'user',
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

      const employeeId = employeesRepo.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: spec.frontmatter.id,
        roleMdSha: spec.sha256,
        level: spec.frontmatter.level,
        name: name.trim(),
        title: spec.frontmatter.name,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

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
      employeesRepo.delete(employeeId);
    },

    async employeesPromote(req) {
      // Input validation — fail closed before any SQL writes.
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
      const promotedAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.promoted',
            companyId: employee.companyId,
            actorId: 'user',
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

      // Snapshot the previous manager id for the bus event payload BEFORE
      // we touch the edge — the repo's removeByReport is destructive and
      // we'd lose the prior state if we read after.
      const previousEdge = orgEdgesRepo.getByReport(employeeId);
      const previousManagerId = previousEdge?.managerId ?? null;

      if (managerId === null) {
        // Detach path — clear the edge. No-op when no edge exists, matches
        // `removeByReport`'s existing semantics.
        orgEdgesRepo.removeByReport(employeeId);
      } else {
        // Upsert path. Validate the manager exists, is non-system, and
        // shares a company with the report BEFORE invoking setManager so
        // the friendlier error message surfaces (the repo's wouldCycle is
        // a redundant inner guard).
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
        // Pre-flight cycle check so the renderer gets a friendlier
        // message than the repo's raw "would create cycle" throw.
        if (orgEdgesRepo.wouldCycle(employee.companyId, managerId, employeeId)) {
          throw new Error(
            `[ipc] employees.setManager: would create reporting cycle — ${managerId} already reports (directly or transitively) to ${employeeId}`,
          );
        }
        orgEdgesRepo.setManager({
          companyId: employee.companyId,
          managerId,
          reportId: employeeId,
        });
      }

      // Architectural invariant #11 — emit AFTER the durable write.
      const setAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.managerSet',
            companyId: employee.companyId,
            actorId: 'user',
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
      const servers = mcpHost.listServers();
      return servers.map((server) => ({
        id: server.id,
        companyId: server.companyId,
        name: server.name,
        transport: server.transport,
        enabled: server.enabled,
        lastHealth: server.lastHealth,
        toolCount: server.tools.length,
      }));
    },

    async mcpToggle({ serverId, enabled }) {
      const server = mcpHost.getServer(serverId);
      if (!server) {
        throw new Error(`[ipc] mcp.toggle: server not found: ${serverId}`);
      }

      if (enabled && !server.connected) {
        // Reconnect
        const config = mcpServersRepo.getById(serverId);
        if (!config) {
          throw new Error(`[ipc] mcp.toggle: server config not found: ${serverId}`);
        }
        await mcpHost.connectToServer({
          id: config.id,
          companyId: config.companyId,
          name: config.name,
          transport: config.transport as 'stdio' | 'sse',
          configJson: config.configJson,
          enabled: config.enabled,
          lastHealth: config.lastHealth,
        });
      } else if (!enabled && server.connected) {
        // Disconnect
        await mcpHost.disconnectServer(serverId);
      }

      mcpServersRepo.updateEnabled(serverId, enabled);
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

      return { serverId };
    },

    async mcpRemoveServer({ serverId }) {
      await mcpHost.disconnectServer(serverId);
      mcpServersRepo.delete(serverId);
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
      const goalId = goalsRepo.create({
        companyId: req.companyId,
        title: req.title.trim(),
        description: req.description ?? '',
        targetDate: req.targetDate ?? null,
      });
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
      goalsRepo.update(req.goalId, {
        title: req.title,
        description: req.description,
        status: req.status,
        progressPct: req.progressPct,
        targetDate: req.targetDate,
      });
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
      goalsRepo.delete(req.goalId);
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
      const projectId = projectsRepo.create({
        companyId: req.companyId,
        goalId: req.goalId ?? null,
        title: req.title.trim(),
        description: req.description ?? '',
        leadId: req.leadId ?? null,
        priority: req.priority ?? 'medium',
      });
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
      projectsRepo.update(req.projectId, {
        title: req.title,
        description: req.description,
        status: req.status,
        goalId: req.goalId,
        leadId: req.leadId,
        priority: req.priority,
      });
      // If status changed to completed/archived, recalc parent goal progress
      if ((req.status === 'completed' || req.status === 'archived') && project.goalId) {
        goalsRepo.recalcProgress(project.goalId);
      }
      // Also recalc if status changed FROM completed/archived back to something else
      if (
        req.status &&
        req.status !== 'completed' &&
        req.status !== 'archived' &&
        (project.status === 'completed' || project.status === 'archived') &&
        project.goalId
      ) {
        goalsRepo.recalcProgress(project.goalId);
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
      projectsRepo.delete(req.projectId);
      // Recalc parent goal progress after deleting
      if (goalId) {
        goalsRepo.recalcProgress(goalId);
      }
    },

    async projectsLinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.linkTicket: ticketId is required');
      }
      projectsRepo.linkTicket(req.projectId, req.ticketId);
    },

    async projectsUnlinkTicket(req) {
      if (typeof req.projectId !== 'string' || req.projectId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: projectId is required');
      }
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] projects.unlinkTicket: ticketId is required');
      }
      projectsRepo.unlinkTicket(req.projectId, req.ticketId);
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
      return runsRepo.companyStats(req.companyId);
    },

    async telemetryDailyUsage(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.dailyUsage: companyId is required');
      }
      if (typeof req.fromMs !== 'number' || typeof req.toMs !== 'number') {
        throw new Error('[ipc] telemetry.dailyUsage: fromMs and toMs are required');
      }
      return runsRepo.dailyUsage(req.companyId, req.fromMs, req.toMs);
    },

    async telemetryEmployeeStats(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.employeeStats: companyId is required');
      }
      return runsRepo.employeeStats(req.companyId);
    },

    async telemetryCostBreakdown(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] telemetry.costBreakdown: companyId is required');
      }
      return runsRepo.costBreakdown(req.companyId, req.fromMs, req.toMs);
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
      return {
        strategy: override === 'auto' ? override : result.strategy,
        hardwareProfile: profile,
        effectiveSlots: settingsRepo.get<number>('orchestrator_slots', result.slots),
        reason: result.reason,
      };
    },

    async settingsSetRuntime(req) {
      settingsRepo.set('runtime_strategy', req.strategy);
      // If not 'auto', also update the effective orchestrator slots
      if (req.strategy !== 'auto') {
        const { STRATEGY_SLOTS } = await import('@team-x/shared-types');
        settingsRepo.set('orchestrator_slots', STRATEGY_SLOTS[req.strategy]);
      }
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
      const orchestratorSlots = settingsRepo.get<number>('orchestrator_slots', 6);
      const providerCaps = settingsRepo.get<Record<string, number>>(
        'concurrency_caps',
        DEFAULT_CONCURRENCY_CAPS,
      );
      return { orchestratorSlots, providerCaps };
    },

    async settingsSetConcurrency(req) {
      if (req.orchestratorSlots !== undefined) {
        settingsRepo.set('orchestrator_slots', req.orchestratorSlots);
      }
      if (req.providerCaps !== undefined) {
        const current = settingsRepo.get<Record<string, number>>(
          'concurrency_caps',
          DEFAULT_CONCURRENCY_CAPS,
        );
        settingsRepo.set('concurrency_caps', { ...current, ...req.providerCaps });
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
      return { ok: true };
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

      const ticketId = ticketsRepo.create({
        companyId: req.companyId,
        title: req.title.trim(),
        description: req.description ?? '',
        priority: req.priority ?? 'medium',
        assigneeId: req.assigneeId ?? null,
        reporterId: HUMAN_USER_ID,
        reporterKind: 'user',
        labelsJson: req.labelsJson ?? '[]',
        slaHours: req.slaHours ?? null,
        dueAt: req.dueAt ?? null,
      });

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
              subject: req.title.trim(),
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
            const msgContent = `**Ticket: ${req.title.trim()}**\n\n${req.description ?? '(no description)'}`;
            const messageId = messagesRepo.append({
              threadId,
              authorId: HUMAN_USER_ID,
              authorKind: 'user',
              content: msgContent,
            });

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
      ticketsRepo.update(req.ticketId, {
        title: req.title,
        description: req.description,
        priority: req.priority,
        status: req.status,
        labelsJson: req.labelsJson,
        slaHours: req.slaHours,
        dueAt: req.dueAt,
      });
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

      // Ensure ticket has a thread
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
        ticketsRepo.setThreadId(req.ticketId, threadId);
      }

      const messageId = messagesRepo.append({
        threadId,
        authorId: HUMAN_USER_ID,
        authorKind: 'user',
        content: req.content.trim(),
      });

      // If the ticket is assigned, enqueue a response from the agent
      if (ticket.assigneeId) {
        orchestrator
          .enqueueChat({
            threadId,
            employeeId: ticket.assigneeId,
            userMessageId: messageId,
          })
          .catch((err: unknown) => {
            console.error(
              `[ipc] tickets.addComment: orchestrator turn failed for ticket=${req.ticketId}:`,
              err,
            );
          });
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

      return {
        ...rowToTicket(ticket),
        messages,
        assignee,
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
      const attachmentId = ticketAttachmentsRepo.attach(req.ticketId, req.fileId, HUMAN_USER_ID);
      return { attachmentId };
    },

    async ticketsDetachFile(req) {
      if (typeof req.ticketId !== 'string' || req.ticketId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: ticketId is required');
      }
      if (typeof req.fileId !== 'string' || req.fileId.length === 0) {
        throw new Error('[ipc] tickets.detachFile: fileId is required');
      }
      ticketAttachmentsRepo.detachByFile(req.ticketId, req.fileId);
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
