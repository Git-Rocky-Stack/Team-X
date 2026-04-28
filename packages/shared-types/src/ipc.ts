/**
 * IPC contracts between the Team-X Electron main process and the
 * renderer. Two layers:
 *
 *   1. `IpcContract` — the low-level request/response shapes keyed
 *      by channel name. Used by the typed `ipcMain.handle` registration
 *      in `apps/desktop/src/main/ipc/register.ts` and by the generic
 *      helper types that derive per-channel argument and return types.
 *
 *   2. `TeamXApi` — the high-level bridge surface the preload exposes
 *      to the renderer via `contextBridge.exposeInMainWorld('teamx', ...)`.
 *      This is the shape the renderer consumes as `window.teamx`. It
 *      mirrors `IpcContract` but:
 *        - wraps each channel in an ergonomic method signature
 *          (positional args where it makes sense, single-object args
 *          where it doesn't),
 *        - adds a one-way event subscription (`events.onDashboard`)
 *          for the live dashboard stream,
 *        - returns an unsubscribe function from `onDashboard` so the
 *          renderer can clean up listeners on unmount.
 *
 * Keeping both layers here — in `@team-x/shared-types` — means:
 *   - preload can type-check its implementation against `TeamXApi`
 *     without cross-app imports,
 *   - the renderer's `window.d.ts` can import the same `TeamXApi`
 *     via the workspace package without reaching across rootDir
 *     boundaries into `apps/desktop/src/preload/`,
 *   - any change to a request or response shape lands in exactly one
 *     place and both sides of the bridge catch the diff at typecheck
 *     time.
 */

import type {
  CommandHistoryRequest,
  CommandParseRequest,
  CommandStopRequest,
  CommandStopResult,
  CommandSuggestRequest,
  IpcCommandHistoryEntry,
  IpcExecuteRequest,
  IpcExecuteResult,
  IpcParseResult,
  IpcSuggestItem,
} from './command.js';
import type {
  CopilotAskArgs,
  CopilotAskResult,
  CopilotConfigureArgs,
  CopilotConfigureResult,
  CopilotDismissArgs,
  CopilotDismissResult,
  CopilotExportRequest,
  CopilotExportResponse,
  CopilotInsightListArgs,
  CopilotInsightListResult,
} from './copilot.js';
import type {
  ApprovalDecisionStatus,
  ApprovalItem,
  ApprovalItemKind,
  ApprovalItemStatus,
  ArtifactRecord,
  AuthorityGrant,
  AuthorityRequest,
  AutonomyBenchmarkReport,
  AutonomyBenchmarkScenarioId,
  AutonomyDoctorReport,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  BudgetPolicyPeriod,
  BudgetScopeKind,
  ChatMessage,
  Company,
  CompanyCloudLinkStatus,
  CompanyImportPreview,
  CompanyPackageManifest,
  CompanyPackageMode,
  CompanyPackageSecretBinding,
  CompanySharingReadinessSummary,
  CompanyTemplateSummary,
  EffectiveAuthoritySnapshot,
  Employee,
  EmployeeRuntimeBinding,
  ExtensionSummary,
  ExtensionsAutonomyMode,
  Goal,
  Meeting,
  MeetingActionItem,
  MeetingMode,
  OperatorAccessEntry,
  OperatorInvite,
  OperatorMembershipRole,
  PackedThreadContext,
  Project,
  Routine,
  RoutineRun,
  RoutineSchedule,
  RoutineTicketWorkConfig,
  RunCheckpoint,
  RuntimeProfileKind,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
  RuntimeSession,
  SharedOperatorAuthMode,
  SkillAssignment,
  Thread,
  ThreadDigest,
  Ticket,
  TicketCheckout,
} from './entities.js';
import type {
  AgenticRunSnapshot,
  CopilotCategory,
  CopilotCategoryWeights,
  DashboardEvent,
} from './events.js';
import type { PrivacyTier, ProviderConfig, ProviderKind } from './providers.js';

export type { CopilotCategoryWeights } from './events.js';

// ---------------------------------------------------------------------------
// Low-level request / response shapes
// ---------------------------------------------------------------------------

/**
 * `companies.archive` request (M33 T3 follow-up F3).
 *
 * Idempotent — if the company is already archived, the handler re-runs
 * the full three-step quiesce (analyzer stop, event-window clear,
 * status flip) and re-emits `company.archived`. That is intentional:
 * we would rather repeat the cleanup than silently skip it on a retry.
 */
export interface ArchiveCompanyRequest {
  companyId: string;
}

/**
 * `companies.create` request (Phase 5.6 M-C step b — restores Cluster A
 * multi-company CRUD per audit row 10.12; the locked M7 architectural
 * decision).
 *
 * `slug` MUST be unique app-wide. The handler enforces a non-empty
 * trimmed `name` and a slug matching `/^[a-z0-9][a-z0-9-]{0,62}$/`
 * (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen) so
 * the renderer can rely on a stable URL-safe identifier without
 * server-side rewriting. Duplicate slug surfaces as a SQL UNIQUE
 * constraint failure that the handler rethrows with a friendlier
 * message; callers should pre-check via `companies.list` if they want
 * to validate before submit.
 *
 * `settings` is a free-form JSON object persisted as a text column;
 * Phase 1 used `mission` + `hq` + `description`. The schema lives in
 * `CompanySettings` from `./entities.js`.
 *
 * `icon` is an optional emoji or short visual marker; `theme` defaults
 * to `'dark'` per the Strategia design system.
 */
export interface CompaniesCreateRequest {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  icon?: string;
  theme?: string;
}

/**
 * `companies.create` response. Returns the new company id PLUS the two
 * system pseudo-employee ids the bootstrap seeded inline (`system-agent`
 * from M31 + `system-copilot` from M33). The renderer can use the
 * agent/copilot ids immediately to open Copilot Conversations or the
 * command palette without a follow-up `employees.list` round-trip.
 *
 * The bootstrap is part of the `companies.create` write transaction
 * surface in spirit — the IPC handler invokes `ensureSystemForCompany`
 * synchronously after `companiesRepo.create` succeeds and BEFORE the
 * `company.created` bus event fires, so subscribers see a fully-formed
 * company on first observation (matches the `seedIfEmpty` invariant).
 */
export interface CompaniesCreateResponse {
  companyId: string;
  systemAgentEmployeeId: string;
  systemCopilotEmployeeId: string;
}

/**
 * `companies.update` request (Phase 5.6 M-C step e — restores Cluster A
 * multi-company CRUD per audit row 10.13).
 *
 * Every mutable field is optional — only keys present in the request
 * get written. The handler:
 *
 *   - Validates every supplied field using the same rules as
 *     `companies.create` (non-empty trimmed name ≤120 chars, slug
 *     matching `/^[a-z0-9][a-z0-9-]{0,62}$/`, settings plain-object,
 *     icon/theme string).
 *   - Refuses archived companies via `assertCompanyActive` so an
 *     archived company cannot be mutated back to a live-looking row
 *     without a reactivation path shipping first.
 *   - Surfaces SQL UNIQUE on slug collisions as a friendlier
 *     `slug "X" is already in use` message (mirrors `companies.create`).
 *
 * `icon` accepts `null` to clear the icon (matches the DB-nullable
 * column contract); `theme` has no clear path because the schema
 * defaults it to `'dark'` and the domain carries no meaningful empty
 * state for the theme column.
 */
export interface CompaniesUpdateRequest {
  companyId: string;
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
  icon?: string | null;
  theme?: string;
}

/**
 * `companies.delete` request (Phase 5.6 M-C step e — restores Cluster A
 * multi-company CRUD per audit row 10.15).
 *
 * Destructive sibling of `companies.archive`: the handler hard-deletes
 * the company row AND every company-scoped child row across 15 tables
 * in a single transaction (see `companies.delete()` repo doc for the
 * full FK-safe order). Before the transaction fires, the handler
 * quiesces the copilot pipeline identically to `companies.archive`
 * (analyzer stop → event-window clear) so a mid-tick analyzer cannot
 * observe soon-to-be-deleted rows. This operation is NOT reversible
 * short of a backup restore — renderer surfaces should gate this
 * behind an explicit confirmation, distinct from the archive flow.
 */
export interface CompaniesDeleteRequest {
  companyId: string;
}

export interface ExportCompanyPackageRequest {
  companyId: string;
  mode: CompanyPackageMode;
}

export interface ExportCompanyPackageResponse {
  packagePath: string;
  manifest: CompanyPackageManifest;
}

export interface PreviewCompanyPackageImportRequest {
  packagePath?: string;
  packageRef?: string;
}

export interface PreviewCompanyPackageImportResponse extends CompanyImportPreview {}

export interface ImportCompanyPackageRequest {
  packagePath?: string;
  packageRef?: string;
  name?: string;
  slug?: string;
  secretBindings?: CompanyPackageSecretBinding[];
}

export interface ImportCompanyPackageResponse {
  companyId: string;
  manifest: CompanyPackageManifest;
}

export interface ListCompanyTemplatesRequest {
  companyId?: string;
}

export interface ListCompanyTemplatesResponse {
  templates: CompanyTemplateSummary[];
}

export interface InstallCompanyTemplateRequest {
  companyId?: string;
  packagePath?: string;
  packageRef?: string;
  secretBindings?: CompanyPackageSecretBinding[];
}

export interface InstallCompanyTemplateResponse {
  template: CompanyTemplateSummary;
}

export interface ListEmployeesRequest {
  companyId: string;
}

export interface ListOperatorsRequest {
  companyId: string;
}

export interface GetOperatorSharingReadinessRequest {
  companyId: string;
}

export interface GetCloudWorkspaceLinkRequest {
  companyId: string;
}

export interface LinkCloudWorkspaceRequest {
  companyId: string;
}

export interface UnlinkCloudWorkspaceRequest {
  companyId: string;
}

export interface ReconnectCloudWorkspaceRequest {
  companyId: string;
}

export interface ListOperatorInvitesRequest {
  companyId: string;
}

export interface CreateOperatorInviteRequest {
  companyId: string;
  email: string;
  displayName?: string;
  authMode: SharedOperatorAuthMode;
  role: OperatorMembershipRole;
  note?: string;
  invitedByOperatorId?: string;
}

export interface CreateOperatorInviteResponse {
  invite: OperatorInvite;
}

export interface RevokeOperatorInviteRequest {
  inviteId: string;
}

export interface AcceptOperatorInviteRequest {
  inviteId: string;
}

export interface AcceptOperatorInviteResponse {
  invite: OperatorInvite;
  operatorId: string;
  membershipId: string;
  reusedOperator: boolean;
}

export interface ListRuntimeProfilesRequest {
  companyId: string;
}

export interface CreateRuntimeProfileRequest {
  companyId: string;
  name: string;
  kind: RuntimeProfileKind;
  enabled?: boolean;
  config?: Record<string, unknown> | null;
}

export interface UpdateRuntimeProfileRequest {
  profileId: string;
  name?: string;
  kind?: RuntimeProfileKind;
  enabled?: boolean;
  config?: Record<string, unknown> | null;
}

export interface DeleteRuntimeProfileRequest {
  profileId: string;
}

export interface BindEmployeeRuntimeProfileRequest {
  companyId: string;
  employeeId: string;
  runtimeProfileId: string | null;
}

export interface ValidateRuntimeProfileRequest {
  companyId: string;
  profileId: string;
}

export interface ListRuntimeOperationsRequest {
  companyId: string;
}

export interface RunAutonomyDoctorRequest {
  companyId: string;
}

export interface RunAutonomyBenchmarkRequest {
  companyId: string;
  runtimeKinds?: RuntimeProfileKind[];
  scenarioIds?: AutonomyBenchmarkScenarioId[];
}

export interface RuntimeOperationsSnapshot {
  companyId: string;
  generatedAt: number;
  sessions: RuntimeSession[];
  activeCheckouts: TicketCheckout[];
}

export interface ListRoutinesRequest {
  companyId: string;
}

export interface CreateRoutineRequest {
  companyId: string;
  name: string;
  enabled?: boolean;
  schedule: RoutineSchedule;
  workConfig: RoutineTicketWorkConfig;
}

export interface UpdateRoutineRequest {
  routineId: string;
  name?: string;
  enabled?: boolean;
  schedule?: RoutineSchedule;
  workConfig?: RoutineTicketWorkConfig;
}

export interface DeleteRoutineRequest {
  routineId: string;
}

export interface ListRoutineRunsRequest {
  companyId: string;
  routineId?: string;
  limit?: number;
}

export interface RunRoutineNowRequest {
  routineId: string;
}

export interface ListBudgetPoliciesRequest {
  companyId: string;
}

export interface CreateBudgetPolicyRequest {
  companyId: string;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  period?: BudgetPolicyPeriod;
  hardCapUsd: string;
  warningThresholdPct?: number;
  autoPause?: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled?: boolean;
}

export interface UpdateBudgetPolicyRequest {
  policyId: string;
  hardCapUsd?: string;
  warningThresholdPct?: number;
  autoPause?: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled?: boolean;
}

export interface DeleteBudgetPolicyRequest {
  policyId: string;
}

export interface ListBudgetLedgerEntriesRequest {
  companyId: string;
  scopeKind?: BudgetScopeKind;
  scopeRefId?: string;
  limit?: number;
}

export interface GetBudgetOverviewRequest {
  companyId: string;
}

export interface ListApprovalItemsRequest {
  companyId: string;
  kind?: ApprovalItemKind;
  status?: ApprovalItemStatus;
}

export interface ReviewApprovalItemRequest {
  companyId: string;
  itemId: string;
  kind: ApprovalItemKind;
  decision: ApprovalDecisionStatus;
  rationale?: string;
  operatorId?: string;
}

export interface ListArtifactsRequest {
  companyId: string;
  limit?: number;
}

export interface GetThreadDigestRequest {
  companyId: string;
  threadId: string;
}

export interface ListRunCheckpointsRequest {
  companyId: string;
  threadId: string;
  limit?: number;
}

export interface PackThreadContextRequest {
  companyId: string;
  threadId: string;
  targetTokenBudget?: number;
  recentTurnLimit?: number;
}

export interface SendChatRequest {
  /**
   * Either a real thread id, or the literal sentinel
   * `AUTO_THREAD_ID` (`'auto'`) to look up or create the user↔employee
   * direct-message thread on the fly. The renderer's chat drawer uses
   * `'auto'` on the very first message and switches to the resolved id
   * after that.
   */
  threadId: string;
  employeeId: string;
  content: string;
}

/**
 * Response to a successful `chat.send`. Carries both the resolved
 * thread id (useful when the caller passed `AUTO_THREAD_ID` and needs
 * to know which thread their message landed in) and the row id of the
 * user's just-appended message. The assistant's reply is NOT in this
 * shape — it streams back asynchronously via the `events.dashboard`
 * channel as `work.started` → `token.delta`* → `work.completed` events.
 */
export interface SendChatResponse {
  threadId: string;
  messageId: string;
}

/**
 * Request to stop an in-flight direct-message turn for a thread.
 *
 * Thread-scoped and idempotent: unknown or already-terminal turns
 * resolve to `{ stopped: false }` rather than throwing so the chat UI
 * can treat stop as a best-effort control action.
 */
export interface StopChatRequest {
  threadId: string;
}

export interface StopChatResponse {
  stopped: boolean;
}

export interface HireEmployeeRequest {
  companyId: string;
  roleId: string;
  name: string;
}

export interface HireEmployeeResponse {
  employeeId: string;
}

/**
 * Request payload for `employees.fire` — the destructive removal
 * operation triggered through the command palette. The handler
 * rejects unknown ids so callers cannot fire an already-deleted
 * employee silently.
 */
export interface FireEmployeeRequest {
  employeeId: string;
}

export interface EmployeesUpdateRequest {
  employeeId: string;
  name?: string;
  title?: string;
  modelPref?: string | null;
  providerPref?: string | null;
  avatar?: string | null;
}

export interface EmployeesUpdateResponse {
  employee: Employee;
}

/**
 * Request payload for `employees.promote` (Phase 5.6 M-C step d — restores
 * Cluster B per audit row 2.19). Promotes an existing employee into a
 * different role from the role-pack catalog. The handler resolves the
 * `newRoleId` against the live role-loader, refuses framework-internal
 * roles (`level === 'system'`), refuses to mutate framework-internal
 * employees (`is_system === true`, mirrors `employees.fire` defense),
 * and updates the employee row's `roleId` / `level` / `title` /
 * `roleMdSha` / `tools_allowed_json` / `tools_denied_json` columns
 * atomically. The `name` field is preserved — promotes are role
 * changes, not rename operations.
 *
 * The handler emits an `employee.promoted` bus event AFTER the durable
 * row update so renderer caches (org-chart, employee list, hire dialog
 * Reports-to picker) can invalidate (architectural invariant #11).
 *
 * Both up-promotes (IC → Lead → Management) and lateral / down-promotes
 * are supported. The org-chart edge graph is NOT touched by a promote;
 * if the new level changes the reporting line, the caller must follow
 * up with an `employees.setManager` call.
 */
export interface EmployeesPromoteRequest {
  /** The employee row id to promote. Must reference a non-system, live row. */
  employeeId: string;
  /**
   * The role id from the role-pack catalog to promote into. Resolved via
   * the role-loader at handler time; missing / framework-internal roles
   * surface as a thrown IPC.
   */
  newRoleId: string;
}

/**
 * Response from `employees.promote`. Returns the full pre/post snapshot
 * so the renderer can render the change inline (e.g., "Promoted from
 * Senior Fullstack Engineer to Engineering Manager") without a
 * follow-up `employees.list` round-trip. Mirrors the
 * `EmployeePromotedPayload` event shape so audit-view chips and toast
 * rendering share one projection contract.
 */
export interface EmployeesPromoteResponse {
  employeeId: string;
  previousRoleId: string;
  newRoleId: string;
  previousLevel: string;
  newLevel: string;
  previousTitle: string;
  newTitle: string;
}

/**
 * Request payload for `employees.setManager` (Phase 5.6 M-C step d —
 * restores Cluster B per audit row 2.20). Sets or clears the org-edge
 * pointing AT the employee (i.e., the report side of the relationship).
 *
 * `managerId === null` is the documented "detach from tree / make root"
 * shape — the handler dispatches to `orgEdgesRepo.removeByReport` and
 * the report becomes a graph root on the next `orgchart.get` projection.
 * `managerId !== null` is the upsert shape — the handler dispatches to
 * `orgEdgesRepo.setManager`, which has built-in `wouldCycle` rejection
 * so a request that would close a directed cycle in the reporting graph
 * fails closed with a friendlier error message before any SQL writes.
 *
 * Same defense-in-depth as `employees.fire` / `employees.promote`: the
 * handler refuses framework-internal employees on either side of the
 * edge (manager OR report), and refuses cross-company edges (manager
 * and report must share a `companyId`).
 *
 * Emits `employee.managerSet` AFTER the durable write so renderer org-
 * tree caches invalidate (architectural invariant #11). The previous
 * manager id is included in the payload so the renderer can animate
 * the move on the indented tree view rather than a hard re-render.
 */
export interface EmployeesSetManagerRequest {
  /** The report — the employee whose manager edge is being set or cleared. */
  employeeId: string;
  /**
   * The new manager id, or `null` to detach the report (make them a
   * graph root). When non-null, the handler dispatches `setManager`
   * (upsert) — when null, the handler dispatches `removeByReport`.
   */
  managerId: string | null;
}

export interface ListChatRequest {
  threadId: string;
}

/**
 * Request to resolve (or lazily create) the user↔employee DM thread
 * for a given employee.  The renderer's chat drawer calls this on
 * open so it can render the existing conversation history BEFORE the
 * user has sent a new message — the previous design only resolved the
 * thread id inside `chat.send`, which left a post-reload drawer with
 * no way to know which thread to fetch.
 */
export interface ResolveThreadRequest {
  employeeId: string;
}

/**
 * Response from `chat.resolveThread`.  Always returns a valid
 * `threadId`: the existing DM thread if one already exists for the
 * (user, employee) pair, otherwise a freshly created empty one.
 */
export interface ResolveThreadResponse {
  threadId: string;
}

export interface ListThreadsRequest {
  companyId: string;
}

// ---------------------------------------------------------------------------
// Org chart shapes (Phase 2 — M9; restored Phase 5.6 M-C step c)
// ---------------------------------------------------------------------------

/**
 * Request for the full org-chart projection of a given company. The
 * handler filters out framework-internal pseudo-employees (is_system = 1)
 * so the returned `employees` array is renderer-ready and every
 * `OrgchartEdge` references employees that appear in the same payload.
 */
export interface OrgchartGetRequest {
  companyId: string;
}

/**
 * Wire shape of one `org_edges` row — the public projection that the
 * `orgchart.get` IPC response carries. `companyId` is implicit (the
 * request scoped everything to one company), so the wire type drops it
 * to keep the payload compact for rehydrating renderer tree views.
 */
export interface OrgchartEdge {
  id: string;
  managerId: string;
  reportId: string;
  createdAt: number;
}

/**
 * Full org-chart projection response. `employees` contains every
 * non-system employee in the company (same filter `employees.list` uses
 * via `listVisibleByCompany`); `edges` is every `(managerId, reportId)`
 * relationship in the company's reporting graph; `rootIds` is the
 * convenience set of employees with no manager edge (graph roots — the
 * CEO in the canonical case, but also any freshly-hired employee before
 * their reporting line is wired).
 *
 * Keeping the three as flat parallel arrays rather than pre-building a
 * nested tree lets the renderer choose its own layout (indented list,
 * tree view, Sankey, reports-to-card grid) without a follow-up IPC
 * round-trip. Tree building is an O(n) pass over `edges` keyed by
 * `managerId`.
 */
export interface OrgchartGetResponse {
  employees: Employee[];
  edges: OrgchartEdge[];
  rootIds: string[];
}

// ---------------------------------------------------------------------------
// Events / timeline shapes (Phase 3 — M14)
// ---------------------------------------------------------------------------

/**
 * Cursor-based pagination request for the timeline activity feed.
 * `cursor` is the `createdAt` timestamp of the last event in the
 * previous page — pass `undefined` for the first page. Results are
 * returned newest-first.
 */
export interface ListEventsRequest {
  companyId: string;
  /** createdAt of the last event from the previous page, or undefined for the first page. */
  cursor?: number;
  /** Maximum events to return. Defaults to 50 in the handler. */
  limit?: number;
}

/**
 * Paginated event list for the timeline view.
 * `nextCursor` is `null` when there are no more pages.
 */
export interface ListEventsResponse {
  events: DashboardEvent[];
  nextCursor: number | null;
}

// ---------------------------------------------------------------------------
// Ticket-related shapes
// ---------------------------------------------------------------------------

export interface CreateTicketRequest {
  companyId: string;
  title: string;
  description?: string;
  /** Defaults to 'medium'. Accepts TicketPriority values. */
  priority?: string;
  /** Optional: assign immediately on creation. */
  assigneeId?: string;
  labelsJson?: string;
  slaHours?: number;
  dueAt?: number;
}

export interface CreateTicketResponse {
  ticketId: string;
}

export interface UpdateTicketRequest {
  ticketId: string;
  title?: string;
  description?: string;
  /** Use TicketPriority union or raw string — the handler validates. */
  priority?: string;
  /** Use TicketStatus union or raw string — the handler validates. */
  status?: string;
  labelsJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
}

export interface AssignTicketRequest {
  ticketId: string;
  assigneeId: string;
}

export interface CloseTicketRequest {
  ticketId: string;
}

export interface ReopenTicketRequest {
  ticketId: string;
}

export interface AddTicketCommentRequest {
  ticketId: string;
  content: string;
}

export interface AddTicketCommentResponse {
  messageId: string;
}

export interface ListTicketsRequest {
  companyId: string;
}

export interface GetTicketRequest {
  ticketId: string;
}

/** Full ticket with its associated thread messages for the detail panel. */
export interface TicketDetail extends Ticket {
  messages: ChatMessage[];
  assignee: Employee | null;
}

// ---------------------------------------------------------------------------
// Goals & Projects shapes (Phase 3 — M15)
// ---------------------------------------------------------------------------

export interface CreateGoalRequest {
  companyId: string;
  title: string;
  description?: string;
  targetDate?: number | null;
}

export interface CreateGoalResponse {
  goalId: string;
}

export interface UpdateGoalRequest {
  goalId: string;
  title?: string;
  description?: string;
  status?: string;
  progressPct?: number;
  targetDate?: number | null;
}

export interface ListGoalsRequest {
  companyId: string;
}

export interface GetGoalRequest {
  goalId: string;
}

export interface DeleteGoalRequest {
  goalId: string;
}

/** Full goal with its linked projects for the detail view. */
export interface GoalDetail extends Goal {
  projects: Project[];
}

export interface CreateProjectRequest {
  companyId: string;
  goalId?: string | null;
  title: string;
  description?: string;
  leadId?: string | null;
  priority?: string;
  targetDate?: number | null;
}

export interface CreateProjectResponse {
  projectId: string;
}

export interface UpdateProjectRequest {
  projectId: string;
  title?: string;
  description?: string;
  status?: string;
  goalId?: string | null;
  leadId?: string | null;
  priority?: string;
  targetDate?: number | null;
}

export interface ListProjectsRequest {
  companyId: string;
}

export interface GetProjectRequest {
  projectId: string;
}

export interface DeleteProjectRequest {
  projectId: string;
}

export interface LinkTicketToProjectRequest {
  projectId: string;
  ticketId: string;
}

export interface UnlinkTicketFromProjectRequest {
  projectId: string;
  ticketId: string;
}

/** Full project with linked ticket ids and lead employee for the detail view. */
export interface ProjectDetail extends Project {
  ticketIds: string[];
  lead: Employee | null;
  ticketCounts: { total: number; done: number };
}

// ---------------------------------------------------------------------------
// Meeting shapes (Phase 3 — M16)
// ---------------------------------------------------------------------------

export interface CallMeetingRequest {
  companyId: string;
  /** Employee id of the meeting chair. */
  chairId: string;
  /** Employee ids of all attendees (including the chair). */
  attendeeIds: string[];
  agenda: string;
  /** Defaults to 'round-robin'. */
  mode?: MeetingMode;
}

export interface CallMeetingResponse {
  meetingId: string;
  threadId: string;
}

export interface EndMeetingRequest {
  meetingId: string;
}

export interface EndMeetingResponse {
  minutesMd: string | null;
  actionItems: MeetingActionItem[];
  ticketIds: string[];
}

export interface InterjectMeetingRequest {
  meetingId: string;
  content: string;
}

export interface InterjectMeetingResponse {
  messageId: string;
}

export interface ListMeetingsRequest {
  companyId: string;
}

export interface GetMeetingRequest {
  meetingId: string;
}

/** Full meeting detail with its thread messages for the detail panel. */
export interface MeetingDetail extends Meeting {
  messages: ChatMessage[];
  chair: Employee | null;
}

// ---------------------------------------------------------------------------
// Telemetry shapes (Phase 3 — M17)
// ---------------------------------------------------------------------------

export const TELEMETRY_RUN_KINDS = ['work', 'agentic', 'copilot'] as const;
export type TelemetryRunKind = (typeof TELEMETRY_RUN_KINDS)[number];

export const TELEMETRY_KIND_FILTERS = ['all', ...TELEMETRY_RUN_KINDS] as const;
export type TelemetryKindFilter = (typeof TELEMETRY_KIND_FILTERS)[number];

export interface TelemetryCompanyStatsRequest {
  companyId: string;
  kind?: TelemetryRunKind;
}

/** Aggregate company-level telemetry summary. */
export interface TelemetryCompanyStatsResponse {
  totalRuns: number;
  totalTokens: number;
  totalCostUsd: string;
  avgLatencyMs: number;
  totalToolCalls: number;
}

export interface TelemetryDailyUsageRequest {
  companyId: string;
  /** Epoch millis — start of the date range (inclusive). */
  fromMs: number;
  /** Epoch millis — end of the date range (inclusive). */
  toMs: number;
  kind?: TelemetryRunKind;
}

export interface TelemetryDailyUsageRow {
  day: string;
  totalRuns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: string;
}

export interface TelemetryEmployeeStatsRequest {
  companyId: string;
  kind?: TelemetryRunKind;
}

export interface TelemetryEmployeeStatsRow {
  employeeId: string;
  totalRuns: number;
  totalTokens: number;
  avgLatencyMs: number;
  costUsd: string;
  totalToolCalls: number;
}

export interface TelemetryRecentRunsRequest {
  companyId: string;
  kind?: TelemetryRunKind;
  limit?: number;
}

export interface TelemetryRecentRunRow {
  runId: string;
  threadId: string | null;
  threadSubject: string | null;
  employeeId: string;
  employeeName: string;
  employeeTitle: string;
  provider: string;
  model: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  toolCallsCount: number;
  startedAt: number;
  endedAt: number | null;
}

export interface TelemetryCostBreakdownRequest {
  companyId: string;
  /** Optional epoch millis — start of range. */
  fromMs?: number;
  /** Optional epoch millis — end of range. */
  toMs?: number;
  kind?: TelemetryRunKind;
}

export interface TelemetryCostBreakdownRow {
  provider: string;
  model: string;
  totalRuns: number;
  totalTokens: number;
  costUsd: string;
}

// ---------------------------------------------------------------------------
// MCP-related shapes
// ---------------------------------------------------------------------------

export interface McpServerSummary {
  id: string;
  companyId: string | null;
  name: string;
  transport: 'stdio' | 'sse';
  enabled: boolean;
  lastHealth: string | null;
  toolCount: number;
}

export interface ListMcpServersRequest {
  companyId: string;
}

export interface McpTemplateSummary {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  sourceRef: string;
  lastHealth: string | null;
  requestedCapabilities: string[];
  installed: boolean;
  installedServerId: string | null;
}

export interface ListMcpTemplatesRequest {
  companyId: string;
}

export interface ToggleMcpServerRequest {
  serverId: string;
  enabled: boolean;
}

export interface AddMcpServerRequest {
  companyId: string | null;
  name: string;
  transport: 'stdio' | 'sse';
  configJson: string;
}

export interface InstallMcpTemplateRequest {
  companyId: string;
  templateId: string;
}

export interface TestMcpConnectionRequest {
  transport: 'stdio' | 'sse';
  configJson: string;
}

export interface TestMcpConnectionResponse {
  ok: boolean;
  error?: string;
  toolCount?: number;
}

export interface SelectDirectoryResponse {
  canceled: boolean;
  folderPath: string | null;
}

// ---------------------------------------------------------------------------
// Extensions & authority shapes (Phase 6+ foundation)
// ---------------------------------------------------------------------------

export interface ListExtensionsRequest {
  companyId: string;
}

export interface InstallLocalSkillRequest {
  companyId: string;
  folderPath: string;
}

export interface InstallGithubSkillRequest {
  companyId: string;
  sourceUrl: string;
}

export interface RemoveSkillRequest {
  companyId: string;
  extensionId: string;
}

export interface ListSkillAssignmentsRequest {
  companyId: string;
}

export interface UpsertSkillAssignmentRequest {
  companyId: string;
  extensionId: string;
  employeeId?: string | null;
  enabled: boolean;
}

export interface DeleteSkillAssignmentRequest {
  assignmentId: string;
}

export interface ListAuthorityGrantsRequest {
  companyId: string;
  employeeId?: string | null;
}

export interface ListAuthorityRequestsRequest {
  companyId: string;
  status?: 'pending' | 'approved' | 'denied';
}

export interface CreateAuthorityGrantRequest {
  companyId: string;
  scopeKind: 'company' | 'employee';
  scopeId: string;
  resourceKind: 'capability' | 'path';
  resourceId: string;
  permission: 'allow' | 'deny' | 'prompt';
  metadata?: Record<string, unknown> | null;
}

export interface DeleteAuthorityGrantRequest {
  grantId: string;
}

export interface ReviewAuthorityRequestRequest {
  companyId: string;
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string | null;
  operatorId?: string;
}

export interface GetEffectiveAuthorityRequest {
  companyId: string;
  employeeId: string;
}

// ---------------------------------------------------------------------------
// Provider management request/response shapes (Phase 3 — M18)
// ---------------------------------------------------------------------------

export interface AddProviderRequest {
  name: string;
  kind: ProviderKind;
  privacyTier: PrivacyTier;
  configJson?: string;
  /** If supplied, saved to OS keychain — never stored in DB. */
  apiKey?: string;
}

export interface AddProviderResponse {
  providerId: string;
}

export interface UpdateProviderRequest {
  providerId: string;
  name?: string;
  enabled?: boolean;
  configJson?: string;
  /** If supplied, saved to OS keychain — never stored in DB. */
  apiKey?: string;
}

export interface RemoveProviderRequest {
  providerId: string;
}

export interface TestProviderConnectionRequest {
  providerId: string;
}

export interface TestProviderConnectionResponse {
  ok: boolean;
  error?: string;
  /** Optional detail message (e.g., "5 models available" for Ollama) */
  detail?: string;
}

export interface ListProviderModelsRequest {
  providerId: string;
}

export interface ListProviderModelsResponse {
  models: string[];
}

// ---------------------------------------------------------------------------
// Vault management shapes (Phase 4 — M21)
// ---------------------------------------------------------------------------

export interface VaultFile {
  id: string;
  companyId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  tags: string[];
  uploadedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultSearchResult {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  rank: number;
}

export interface VaultUploadRequest {
  companyId: string;
  /** Absolute path to the file on disk (selected via Electron file dialog). */
  sourcePath: string;
  tags?: string[];
}

export interface VaultUploadResponse {
  fileId: string;
}

export interface VaultDownloadResponse {
  file: VaultFile;
  absolutePath: string;
}

export interface VaultVerifyResponse {
  ok: boolean;
  expected: string;
  actual: string;
}

export interface VaultStatsResponse {
  fileCount: number;
  totalBytes: number;
}

// ---------------------------------------------------------------------------
// Backup/restore shapes (Phase 4 — M23)
// ---------------------------------------------------------------------------

export interface BackupManifest {
  version: string;
  createdAt: string;
  appVersion: string;
  companyCount: number;
  fileCount: number;
  totalSizeBytes: number;
  dbSizeBytes: number;
}

export interface BackupEntry {
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  manifest: BackupManifest | null;
}

export interface BackupCreateRequest {
  /** Optional custom destination path. Uses default backups dir if omitted. */
  destination?: string;
}

export interface BackupCreateResponse {
  backupPath: string;
  manifest: BackupManifest;
}

export interface BackupRestoreRequest {
  backupPath: string;
}

export interface BackupRestoreResponse {
  manifest: BackupManifest;
  /**
   * Post-restore system-employee bootstrap counts (M33 follow-up F4).
   * Either or both `agentsCreated` / `copilotsCreated` are non-zero
   * only when the restored backup pre-dates the migration that
   * introduced the corresponding system row (M31 for agent, M33 for
   * copilot). `skipped` captures per-company ensure failures without
   * aborting the restore — callers surface a user-facing warning
   * when non-empty.
   *
   * Optional for forward-compatibility with older handler
   * implementations that predate F4; renderer consumers should
   * tolerate `undefined`.
   */
  postRestoreSystemEmployees?: {
    companiesScanned: number;
    agentsCreated: number;
    copilotsCreated: number;
    skipped: Array<{ companyId: string; reason: string }>;
  };
}

// ---------------------------------------------------------------------------
// Ticket attachment shapes (Phase 4 — M22)
// ---------------------------------------------------------------------------

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileId: string;
  attachedBy: string;
  attachedAt: number;
  /** Populated from vault join — original filename for display. */
  fileName?: string;
  /** Populated from vault join — mime type for icon rendering. */
  fileMimeType?: string;
  /** Populated from vault join — byte size for display. */
  fileSizeBytes?: number;
}

export interface AttachFileRequest {
  ticketId: string;
  fileId: string;
}

export interface AttachFileResponse {
  attachmentId: string;
}

export interface DetachFileRequest {
  ticketId: string;
  fileId: string;
}

export interface ListAttachmentsRequest {
  ticketId: string;
}

// ---------------------------------------------------------------------------
// Audit log shapes (Phase 4 — M24)
// ---------------------------------------------------------------------------

/** A single event row surfaced in the audit log UI. */
export interface AuditEvent {
  id: string;
  companyId: string;
  actorId: string;
  actorKind: string;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

export interface AuditFilter {
  companyId: string;
  eventTypes?: string[];
  actorId?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEvents: number;
  eventsToday: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
}

export interface AuditExportRequest {
  filter: AuditFilter;
  format: 'csv' | 'json';
}

export interface AuditExportResponse {
  /** Absolute path to the exported file on disk. */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Updater shapes (Phase 4 — M25)
// ---------------------------------------------------------------------------

/** Status of the auto-updater lifecycle. */
export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** Result of checking for updates. */
export interface UpdateCheckResult {
  status: 'available' | 'not-available' | 'error';
  /** Set when status is 'available'. */
  version?: string;
  /** Set when status is 'available'. Release notes markdown. */
  releaseNotes?: string;
  /** Set when status is 'available'. Release date ISO string. */
  releaseDate?: string;
  /** Set when status is 'error'. */
  error?: string;
}

/** Progress of an update download. */
export interface UpdateDownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

/** Result of installing an update. */
export interface UpdateInstallResult {
  /** Whether the install was initiated (app will restart). */
  initiated: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// RAG management shapes (Phase 5 — M29)
// ---------------------------------------------------------------------------

/** Aggregate statistics for a company's embedding store. */
export interface RagStatsResponse {
  /** Total embedding rows (chunks) stored for the company. */
  embeddingCount: number;
  /** Millisecond timestamp of the newest embedding row, or null if none. */
  lastIndexedAt: number | null;
  /** Whether the RAG subsystem is currently active (provider configured). */
  enabled: boolean;
}

/** Result of wiping + re-indexing every eligible source for a company. */
export interface RagRebuildAllResponse {
  /** Count of sources scheduled for re-embedding. */
  scheduled: number;
}

/** Result of wiping every embedding for a company (no re-index). */
export interface RagDeleteForCompanyResponse {
  /** Count of embedding rows removed. */
  deleted: number;
}

// ---------------------------------------------------------------------------
// Settings management shapes (Phase 3 — M19)
// ---------------------------------------------------------------------------

export interface SettingsGetRuntimeResponse {
  strategy: import('./providers.js').RuntimeStrategy;
  hardwareProfile: import('./providers.js').HardwareProfile;
  effectiveSlots: number;
  reason: string;
}

export interface SettingsSetRuntimeRequest {
  strategy: import('./providers.js').RuntimeStrategy;
}

export interface SettingsGetPrivacyResponse {
  maxTier: PrivacyTier;
  availableProviders: Array<{
    id: string;
    name: string;
    kind: ProviderKind;
    privacyTier: PrivacyTier;
    allowed: boolean;
  }>;
}

export interface SettingsSetPrivacyRequest {
  maxTier: PrivacyTier;
}

export interface SettingsGetConcurrencyResponse {
  orchestratorSlots: number;
  providerCaps: Record<string, number>;
}

export interface SettingsSetConcurrencyRequest {
  orchestratorSlots?: number;
  providerCaps?: Record<string, number>;
}

export interface SettingsGetExtensionsResponse {
  autonomyMode: ExtensionsAutonomyMode;
}

export interface SettingsSetExtensionsRequest {
  autonomyMode: ExtensionsAutonomyMode;
}

export const MEMORY_TARGET_TOKEN_BUDGET_OPTIONS = [2048, 4096, 8192] as const;

export interface SettingsGetMemoryResponse {
  defaultTargetTokenBudget: (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number];
  recentTurnLimit: number;
  checkpointHistoryLimit: number;
}

export interface SettingsSetMemoryRequest {
  defaultTargetTokenBudget?: (typeof MEMORY_TARGET_TOKEN_BUDGET_OPTIONS)[number];
  recentTurnLimit?: number;
  checkpointHistoryLimit?: number;
}

export const MEMORY_SETTINGS_CLAMPS = {
  recentTurnLimit: { min: 2, max: 50, default: 12 },
  checkpointHistoryLimit: { min: 1, max: 20, default: 6 },
} as const;

// ---------------------------------------------------------------------------
// Agentic loop settings (Phase 5 — M31)
// ---------------------------------------------------------------------------

/**
 * Hard budget caps for an in-flight agentic-loop run (ReAct core).
 *
 * Read at run-start by `AgenticLoopService` so every new run observes
 * the user's current preference; the values are also surfaced by the
 * Settings → Runtime → Agentic Loop subsection so the user can dial
 * the knobs without restarting the app.
 *
 * Clamps (enforced in both the handler and the Settings UI) are
 * deliberately generous for default reasoning workloads but tight
 * enough that a runaway loop cannot exhaust a local model's context
 * window or a cloud provider's rate bucket.
 */
export interface SettingsGetAgenticResponse {
  /** Maximum ReAct steps before the loop terminates with `budget_exhausted`. 1–32. */
  maxSteps: number;
  /** Token budget across all steps before the loop terminates. 512–64000. */
  maxTokens: number;
  /** Wall-clock timeout in milliseconds before the loop is aborted. 10000–600000. */
  timeoutMs: number;
}

/**
 * Partial update for the agentic loop configuration. Every field is
 * optional; the handler patches only the supplied keys, leaving the
 * rest at their current persisted values. Out-of-range integers are
 * clamped to the nearest bound before persisting; non-finite numbers
 * are rejected with an error.
 */
export interface SettingsSetAgenticRequest {
  maxSteps?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Clamp bounds + defaults for the three agentic keys. Shared by repo, handler, and UI. */
export const AGENTIC_SETTINGS_CLAMPS = {
  maxSteps: { min: 1, max: 32, default: 8 },
  maxTokens: { min: 512, max: 64000, default: 8000 },
  timeoutMs: { min: 10000, max: 600000, default: 120000 },
} as const;

// ---------------------------------------------------------------------------
// Task planner settings (Phase 5 — M32)
// ---------------------------------------------------------------------------

/** Valid employee levels for planner approval gating. Matches role-pack frontmatter convention (hyphenated). */
export type PlannerApprovalLevel =
  | 'officer'
  | 'senior-management'
  | 'management'
  | 'supervisor'
  | 'lead';

/** Snapshot of the four task-planner budget/guardrail keys. */
export interface SettingsGetPlannerResponse {
  /** Maximum number of subtasks per `decompose_project` call. 1–50. */
  maxTickets: number;
  /** Maximum nesting depth for subtask trees. 1–4. */
  maxDepth: number;
  /** Minimum employee level permitted to decompose projects. */
  approvalLevel: PlannerApprovalLevel;
  /** Consecutive delegation/review failures before escalation. 1–10. */
  escalationThreshold: number;
}

/**
 * Partial patch for task-planner settings. Missing keys retain their
 * current persisted value. Numeric fields are clamped; `approvalLevel`
 * is validated against the enum.
 */
export interface SettingsSetPlannerRequest {
  maxTickets?: number;
  maxDepth?: number;
  approvalLevel?: PlannerApprovalLevel;
  escalationThreshold?: number;
}

/** Clamp bounds + defaults for the four planner keys. Shared by repo, handler, and UI. */
export const PLANNER_SETTINGS_CLAMPS = {
  maxTickets: { min: 1, max: 200, default: 10 },
  maxDepth: { min: 1, max: 32, default: 2 },
  escalationThreshold: { min: 1, max: 10, default: 3 },
} as const;

/** Valid approval levels for the `planner_approval_level` setting. */
export const PLANNER_APPROVAL_LEVELS: readonly PlannerApprovalLevel[] = [
  'officer',
  'senior-management',
  'management',
  'supervisor',
  'lead',
] as const;

/** Default approval level when no setting is persisted. */
export const PLANNER_APPROVAL_LEVEL_DEFAULT: PlannerApprovalLevel = 'management';

// ---------------------------------------------------------------------------
// Copilot service settings (Phase 5 — M33)
// ---------------------------------------------------------------------------

/**
 * Authoritative runtime list of the five copilot insight categories.
 * Kept in sync with the `CopilotCategory` union in `./events.ts` and the
 * SQL CHECK constraint in migration 0011. Renderer uses this to render
 * the categories checkbox grid in `CopilotSection`; repo uses it to
 * validate `copilot_categories` settings writes.
 */
export const COPILOT_CATEGORIES: readonly CopilotCategory[] = [
  'operational',
  'cost',
  'org',
  'workflow',
  'anomaly',
] as const;

export const COPILOT_CATEGORY_WEIGHT_CLAMP = {
  min: 0,
  max: 2,
  default: 1,
} as const;

export const COPILOT_CATEGORY_WEIGHTS_DEFAULT: CopilotCategoryWeights = {
  operational: 1,
  cost: 1,
  org: 1,
  workflow: 1,
  anomaly: 1,
};

/** Snapshot of the three copilot-service settings keys. */
export interface SettingsGetCopilotResponse {
  /** Whether the analyzer runs at all. `false` short-circuits every scheduled + event-triggered tick. */
  enabled: boolean;
  /** Scheduled-tick interval in minutes. 1–60. */
  intervalMinutes: number;
  /** Allowed subset of `COPILOT_CATEGORIES`. Empty fallback → full set (conservative default). */
  categories: CopilotCategory[];
}

/**
 * Partial patch for copilot-service settings. Missing keys retain their
 * current persisted value. `intervalMinutes` is clamped; `categories`
 * is filtered against `COPILOT_CATEGORIES` with empty-array guard
 * (empty → full set).
 *
 * `companyId` is required so the handler can synchronously call
 * `CopilotAnalyzerService.restart(companyId)` after the write and the
 * per-company scheduler picks up the new interval / enabled / categories
 * without an app restart.
 */
export interface SettingsSetCopilotRequest {
  /** Target company whose analyzer timer should be restarted after the write. */
  companyId: string;
  enabled?: boolean;
  intervalMinutes?: number;
  categories?: CopilotCategory[];
}

export interface SettingsGetCopilotWeightsRequest {
  /** Target company for future company-scoped settings; v1 stores the weights globally. */
  companyId: string;
}

export interface SettingsGetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}

export interface SettingsSetCopilotWeightsRequest {
  /** Target company for future company-scoped settings; v1 stores the weights globally. */
  companyId: string;
  weights: Partial<CopilotCategoryWeights>;
}

export interface SettingsSetCopilotWeightsResponse {
  weights: CopilotCategoryWeights;
}

/** Clamp bounds + defaults for the `intervalMinutes` key. Shared by repo, handler, and UI. */
export const COPILOT_SETTINGS_CLAMPS = {
  intervalMinutes: { min: 1, max: 60, default: 5 },
} as const;

/** Default value for the `enabled` key when no setting is persisted. */
export const COPILOT_ENABLED_DEFAULT = true;

// ---------------------------------------------------------------------------
// RAG configuration settings (Phase 5 — M29)
// ---------------------------------------------------------------------------

/**
 * Full RAG configuration snapshot, pulled from the seven `rag_*` and
 * `embedding_*` keys in the settings repo. Surfaced as a single IPC
 * payload so the Settings panel gets one atomic read / write per
 * user interaction.
 */
export interface SettingsGetRagConfigResponse {
  /** Master switch. When false, RAG injection is skipped entirely. */
  ragEnabled: boolean;
  /** Number of nearest neighbours to retrieve per query. 1–20. */
  ragTopK: number;
  /** Cosine similarity threshold (0.0–1.0). Chunks below this are dropped. */
  ragThreshold: number;
  /** Token budget for the injected context window (100–4000). */
  ragMaxTokens: number;
  /** Provider id used for embedding calls. 'auto' lets the resolver pick. */
  embeddingProvider: string;
  /** Model name within the embedding provider. 'auto' lets the resolver pick. */
  embeddingModel: string;
  /** Vector dimension, must match the provider/model's output size. */
  embeddingDimension: number;
}

/**
 * Partial update for the RAG configuration. Every field is optional;
 * the handler patches only the supplied keys, leaving the rest at
 * their current values.
 */
export interface SettingsSetRagConfigRequest {
  ragEnabled?: boolean;
  ragTopK?: number;
  ragThreshold?: number;
  ragMaxTokens?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
}

// ---------------------------------------------------------------------------
// Low-level channel map (used by ipcMain.handle and its generic helpers)
// ---------------------------------------------------------------------------

export interface IpcContract {
  'companies.list': {
    request: Record<string, never>;
    response: Company[];
  };
  'companies.exportPackage': {
    request: ExportCompanyPackageRequest;
    response: ExportCompanyPackageResponse;
  };
  'companies.previewImportPackage': {
    request: PreviewCompanyPackageImportRequest;
    response: PreviewCompanyPackageImportResponse;
  };
  'companies.importPackage': {
    request: ImportCompanyPackageRequest;
    response: ImportCompanyPackageResponse;
  };
  'companies.listTemplates': {
    request: ListCompanyTemplatesRequest;
    response: ListCompanyTemplatesResponse;
  };
  'companies.installTemplate': {
    request: InstallCompanyTemplateRequest;
    response: InstallCompanyTemplateResponse;
  };
  'companies.archive': {
    request: ArchiveCompanyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'companies.create': {
    request: CompaniesCreateRequest;
    response: CompaniesCreateResponse;
  };
  // Cluster A multi-company CRUD write-side (Phase 5.6 M-C step e;
  // restores audit rows 10.13 + 10.15). Both emit bus events per
  // architectural invariant #11 (`company.updated` / `company.deleted`).
  'companies.update': {
    request: CompaniesUpdateRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'companies.delete': {
    request: CompaniesDeleteRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'employees.list': {
    request: ListEmployeesRequest;
    response: Employee[];
  };
  'operators.list': {
    request: ListOperatorsRequest;
    response: OperatorAccessEntry[];
  };
  'operators.readiness': {
    request: GetOperatorSharingReadinessRequest;
    response: CompanySharingReadinessSummary;
  };
  'cloud.getWorkspaceLink': {
    request: GetCloudWorkspaceLinkRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.linkWorkspace': {
    request: LinkCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.unlinkWorkspace': {
    request: UnlinkCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'cloud.reconnectWorkspace': {
    request: ReconnectCloudWorkspaceRequest;
    response: CompanyCloudLinkStatus;
  };
  'operators.listInvites': {
    request: ListOperatorInvitesRequest;
    response: OperatorInvite[];
  };
  'operators.createInvite': {
    request: CreateOperatorInviteRequest;
    response: CreateOperatorInviteResponse;
  };
  'operators.revokeInvite': {
    request: RevokeOperatorInviteRequest;
    response: OperatorInvite;
  };
  'operators.acceptInvite': {
    request: AcceptOperatorInviteRequest;
    response: AcceptOperatorInviteResponse;
  };
  'runtimeProfiles.list': {
    request: ListRuntimeProfilesRequest;
    response: RuntimeProfileSummary[];
  };
  'runtimeProfiles.create': {
    request: CreateRuntimeProfileRequest;
    response: { profileId: string };
  };
  'runtimeProfiles.update': {
    request: UpdateRuntimeProfileRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'runtimeProfiles.delete': {
    request: DeleteRuntimeProfileRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'runtimeProfiles.bindEmployee': {
    request: BindEmployeeRuntimeProfileRequest;
    response: { binding: EmployeeRuntimeBinding | null };
  };
  'runtimeProfiles.validate': {
    request: ValidateRuntimeProfileRequest;
    response: RuntimeProfileValidation;
  };
  'runtimeOperations.snapshot': {
    request: ListRuntimeOperationsRequest;
    response: RuntimeOperationsSnapshot;
  };
  'autonomyDoctor.run': {
    request: RunAutonomyDoctorRequest;
    response: AutonomyDoctorReport;
  };
  'autonomyBenchmark.run': {
    request: RunAutonomyBenchmarkRequest;
    response: AutonomyBenchmarkReport;
  };
  'routines.list': {
    request: ListRoutinesRequest;
    response: Routine[];
  };
  'routines.create': {
    request: CreateRoutineRequest;
    response: { routineId: string };
  };
  'routines.update': {
    request: UpdateRoutineRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'routines.delete': {
    request: DeleteRoutineRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'routines.listRuns': {
    request: ListRoutineRunsRequest;
    response: RoutineRun[];
  };
  'routines.runNow': {
    request: RunRoutineNowRequest;
    response: RoutineRun;
  };
  'budgets.listPolicies': {
    request: ListBudgetPoliciesRequest;
    response: BudgetPolicy[];
  };
  'budgets.createPolicy': {
    request: CreateBudgetPolicyRequest;
    response: { policyId: string };
  };
  'budgets.updatePolicy': {
    request: UpdateBudgetPolicyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'budgets.deletePolicy': {
    request: DeleteBudgetPolicyRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'budgets.listLedger': {
    request: ListBudgetLedgerEntriesRequest;
    response: BudgetLedgerEntry[];
  };
  'budgets.getOverview': {
    request: GetBudgetOverviewRequest;
    response: BudgetOverview;
  };
  'budgets.listApprovals': {
    request: ListApprovalItemsRequest;
    response: ApprovalItem[];
  };
  'approvals.list': {
    request: ListApprovalItemsRequest;
    response: ApprovalItem[];
  };
  'approvals.review': {
    request: ReviewApprovalItemRequest;
    response: { grantId: string | null };
  };
  'artifacts.list': {
    request: ListArtifactsRequest;
    response: ArtifactRecord[];
  };
  'memory.getThreadDigest': {
    request: GetThreadDigestRequest;
    response: ThreadDigest | null;
  };
  'memory.listRunCheckpoints': {
    request: ListRunCheckpointsRequest;
    response: RunCheckpoint[];
  };
  'memory.packThreadContext': {
    request: PackThreadContextRequest;
    response: PackedThreadContext;
  };
  'employees.create': {
    request: HireEmployeeRequest;
    response: HireEmployeeResponse;
  };
  'employees.fire': {
    request: FireEmployeeRequest;
    // IpcContract-level response is intentionally `void` — the fire
    // handler returns nothing, matching every other write-path entry
    // in this contract (e.g. `mcp.toggle`, `tickets.close`).
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  'employees.update': {
    request: EmployeesUpdateRequest;
    response: EmployeesUpdateResponse;
  };
  // Org chart write-side channels (Phase 2 — M9; restored Phase 5.6 M-C step d
  // per audit rows 2.19 + 2.20). `promote` swaps the employee's role-pack
  // role; `setManager` upserts (or clears) the org-edge whose report side
  // is the employee. Both emit bus events per architectural invariant #11.
  'employees.promote': {
    request: EmployeesPromoteRequest;
    response: EmployeesPromoteResponse;
  };
  'employees.setManager': {
    request: EmployeesSetManagerRequest;
    // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for this contract
    response: void;
  };
  // Org chart channel (Phase 2 — M9; restored Phase 5.6 M-C step c per audit row 2.21)
  'orgchart.get': {
    request: OrgchartGetRequest;
    response: OrgchartGetResponse;
  };
  'chat.send': {
    request: SendChatRequest;
    response: SendChatResponse;
  };
  'chat.list': {
    request: ListChatRequest;
    response: ChatMessage[];
  };
  'chat.stop': {
    request: StopChatRequest;
    response: StopChatResponse;
  };
  'chat.resolveThread': {
    request: ResolveThreadRequest;
    response: ResolveThreadResponse;
  };
  'chat.listThreads': {
    request: ListThreadsRequest;
    response: Thread[];
  };
  // Events / timeline (Phase 3 — M14)
  'events.list': {
    request: ListEventsRequest;
    response: ListEventsResponse;
  };
  // MCP management channels
  'mcp.list': {
    request: ListMcpServersRequest;
    response: McpServerSummary[];
  };
  'mcp.listTemplates': {
    request: ListMcpTemplatesRequest;
    response: McpTemplateSummary[];
  };
  'mcp.toggle': {
    request: ToggleMcpServerRequest;
    response: undefined;
  };
  'mcp.addServer': {
    request: AddMcpServerRequest;
    response: { serverId: string };
  };
  'mcp.installTemplate': {
    request: InstallMcpTemplateRequest;
    response: { serverId: string };
  };
  'mcp.removeServer': {
    request: { serverId: string };
    response: undefined;
  };
  'mcp.testConnection': {
    request: TestMcpConnectionRequest;
    response: TestMcpConnectionResponse;
  };
  'extensions.list': {
    request: ListExtensionsRequest;
    response: ExtensionSummary[];
  };
  'extensions.installLocalSkill': {
    request: InstallLocalSkillRequest;
    response: { extensionId: string };
  };
  'extensions.installGithubSkill': {
    request: InstallGithubSkillRequest;
    response: { extensionId: string };
  };
  'extensions.removeSkill': {
    request: RemoveSkillRequest;
    response: undefined;
  };
  'extensions.listSkillAssignments': {
    request: ListSkillAssignmentsRequest;
    response: SkillAssignment[];
  };
  'extensions.upsertSkillAssignment': {
    request: UpsertSkillAssignmentRequest;
    response: { assignmentId: string };
  };
  'extensions.deleteSkillAssignment': {
    request: DeleteSkillAssignmentRequest;
    response: undefined;
  };
  'authority.list': {
    request: ListAuthorityGrantsRequest;
    response: AuthorityGrant[];
  };
  'authority.listRequests': {
    request: ListAuthorityRequestsRequest;
    response: AuthorityRequest[];
  };
  'authority.create': {
    request: CreateAuthorityGrantRequest;
    response: { grantId: string };
  };
  'authority.delete': {
    request: DeleteAuthorityGrantRequest;
    response: undefined;
  };
  'authority.reviewRequest': {
    request: ReviewAuthorityRequestRequest;
    response: { grantId: string | null };
  };
  'authority.getEffective': {
    request: GetEffectiveAuthorityRequest;
    response: EffectiveAuthoritySnapshot;
  };
  // Goals management channels (Phase 3 — M15)
  'goals.create': {
    request: CreateGoalRequest;
    response: CreateGoalResponse;
  };
  'goals.update': {
    request: UpdateGoalRequest;
    response: undefined;
  };
  'goals.list': {
    request: ListGoalsRequest;
    response: Goal[];
  };
  'goals.get': {
    request: GetGoalRequest;
    response: GoalDetail;
  };
  'goals.delete': {
    request: DeleteGoalRequest;
    response: undefined;
  };
  // Projects management channels (Phase 3 — M15)
  'projects.create': {
    request: CreateProjectRequest;
    response: CreateProjectResponse;
  };
  'projects.update': {
    request: UpdateProjectRequest;
    response: undefined;
  };
  'projects.list': {
    request: ListProjectsRequest;
    response: Project[];
  };
  'projects.get': {
    request: GetProjectRequest;
    response: ProjectDetail;
  };
  'projects.delete': {
    request: DeleteProjectRequest;
    response: undefined;
  };
  'projects.linkTicket': {
    request: LinkTicketToProjectRequest;
    response: undefined;
  };
  'projects.unlinkTicket': {
    request: UnlinkTicketFromProjectRequest;
    response: undefined;
  };
  // Meeting management channels (Phase 3 — M16)
  'meetings.call': {
    request: CallMeetingRequest;
    response: CallMeetingResponse;
  };
  'meetings.end': {
    request: EndMeetingRequest;
    response: EndMeetingResponse;
  };
  'meetings.interject': {
    request: InterjectMeetingRequest;
    response: InterjectMeetingResponse;
  };
  'meetings.list': {
    request: ListMeetingsRequest;
    response: Meeting[];
  };
  'meetings.get': {
    request: GetMeetingRequest;
    response: MeetingDetail;
  };
  // Telemetry channels (Phase 3 — M17)
  'telemetry.companyStats': {
    request: TelemetryCompanyStatsRequest;
    response: TelemetryCompanyStatsResponse;
  };
  'telemetry.dailyUsage': {
    request: TelemetryDailyUsageRequest;
    response: TelemetryDailyUsageRow[];
  };
  'telemetry.employeeStats': {
    request: TelemetryEmployeeStatsRequest;
    response: TelemetryEmployeeStatsRow[];
  };
  'telemetry.recentRuns': {
    request: TelemetryRecentRunsRequest;
    response: TelemetryRecentRunRow[];
  };
  'telemetry.costBreakdown': {
    request: TelemetryCostBreakdownRequest;
    response: TelemetryCostBreakdownRow[];
  };
  // Settings channels (Phase 3 — M19)
  'settings.getRuntime': {
    request: Record<string, never>;
    response: SettingsGetRuntimeResponse;
  };
  'settings.setRuntime': {
    request: SettingsSetRuntimeRequest;
    response: undefined;
  };
  'settings.getPrivacy': {
    request: Record<string, never>;
    response: SettingsGetPrivacyResponse;
  };
  'settings.setPrivacy': {
    request: SettingsSetPrivacyRequest;
    response: undefined;
  };
  'settings.getConcurrency': {
    request: Record<string, never>;
    response: SettingsGetConcurrencyResponse;
  };
  'settings.setConcurrency': {
    request: SettingsSetConcurrencyRequest;
    response: undefined;
  };
  'settings.getExtensions': {
    request: Record<string, never>;
    response: SettingsGetExtensionsResponse;
  };
  'settings.setExtensions': {
    request: SettingsSetExtensionsRequest;
    response: undefined;
  };
  'settings.getMemory': {
    request: Record<string, never>;
    response: SettingsGetMemoryResponse;
  };
  'settings.setMemory': {
    request: SettingsSetMemoryRequest;
    response: undefined;
  };
  'settings.getRagConfig': {
    request: Record<string, never>;
    response: SettingsGetRagConfigResponse;
  };
  'settings.setRagConfig': {
    request: SettingsSetRagConfigRequest;
    response: undefined;
  };
  // Agentic loop channels (Phase 5 — M31)
  'settings.getAgentic': {
    request: Record<string, never>;
    response: SettingsGetAgenticResponse;
  };
  'settings.setAgentic': {
    request: SettingsSetAgenticRequest;
    response: undefined;
  };
  // Task planner channels (Phase 5 — M32)
  'settings.getPlanner': {
    request: Record<string, never>;
    response: SettingsGetPlannerResponse;
  };
  'settings.setPlanner': {
    request: SettingsSetPlannerRequest;
    response: undefined;
  };
  // Copilot service channels (Phase 5 — M33)
  'settings.getCopilot': {
    request: Record<string, never>;
    response: SettingsGetCopilotResponse;
  };
  'settings.setCopilot': {
    request: SettingsSetCopilotRequest;
    response: undefined;
  };
  'settings.getCopilotWeights': {
    request: SettingsGetCopilotWeightsRequest;
    response: SettingsGetCopilotWeightsResponse;
  };
  'settings.setCopilotWeights': {
    request: SettingsSetCopilotWeightsRequest;
    response: SettingsSetCopilotWeightsResponse;
  };
  // Provider management channels (Phase 3 — M18)
  'providers.list': {
    request: Record<string, never>;
    response: ProviderConfig[];
  };
  'providers.add': {
    request: AddProviderRequest;
    response: AddProviderResponse;
  };
  'providers.update': {
    request: UpdateProviderRequest;
    response: undefined;
  };
  'providers.remove': {
    request: RemoveProviderRequest;
    response: undefined;
  };
  'providers.testConnection': {
    request: TestProviderConnectionRequest;
    response: TestProviderConnectionResponse;
  };
  'providers.listModels': {
    request: ListProviderModelsRequest;
    response: ListProviderModelsResponse;
  };
  // Vault management channels (Phase 4 — M21)
  'vault.upload': {
    request: VaultUploadRequest;
    response: VaultUploadResponse;
  };
  'vault.download': {
    request: { fileId: string };
    response: VaultDownloadResponse;
  };
  'vault.list': {
    request: { companyId: string };
    response: VaultFile[];
  };
  'vault.search': {
    request: { companyId: string; query: string };
    response: VaultSearchResult[];
  };
  'vault.delete': {
    request: { fileId: string };
    response: undefined;
  };
  'vault.verify': {
    request: { fileId: string };
    response: VaultVerifyResponse;
  };
  'vault.stats': {
    request: { companyId: string };
    response: VaultStatsResponse;
  };
  // Backup/restore channels (Phase 4 — M23)
  'backup.create': {
    request: BackupCreateRequest;
    response: BackupCreateResponse;
  };
  'backup.restore': {
    request: BackupRestoreRequest;
    response: BackupRestoreResponse;
  };
  'backup.list': {
    request: Record<string, never>;
    response: BackupEntry[];
  };
  // Audit log channels (Phase 4 — M24)
  'audit.list': {
    request: AuditFilter;
    response: AuditEvent[];
  };
  'audit.stats': {
    request: { companyId: string };
    response: AuditStats;
  };
  'audit.export': {
    request: AuditExportRequest;
    response: AuditExportResponse;
  };
  // Ticket attachment channels (Phase 4 — M22)
  'tickets.attachFile': {
    request: AttachFileRequest;
    response: AttachFileResponse;
  };
  'tickets.detachFile': {
    request: DetachFileRequest;
    response: undefined;
  };
  'tickets.listAttachments': {
    request: ListAttachmentsRequest;
    response: TicketAttachment[];
  };
  // Updater channels (Phase 4 — M25)
  'updater.check': {
    request: Record<string, never>;
    response: UpdateCheckResult;
  };
  'updater.install': {
    request: Record<string, never>;
    response: UpdateInstallResult;
  };
  // RAG channels (Phase 5 — M29)
  'rag.stats': {
    request: string;
    response: RagStatsResponse;
  };
  'rag.rebuildAll': {
    request: string;
    response: RagRebuildAllResponse;
  };
  'rag.deleteForCompany': {
    request: string;
    response: RagDeleteForCompanyResponse;
  };
  // Command palette channels (Phase 5 — M30)
  'command.parse': {
    request: CommandParseRequest;
    response: IpcParseResult;
  };
  'command.execute': {
    request: IpcExecuteRequest;
    response: IpcExecuteResult;
  };
  'command.history': {
    request: CommandHistoryRequest;
    response: IpcCommandHistoryEntry[];
  };
  'command.suggest': {
    request: CommandSuggestRequest;
    response: IpcSuggestItem[];
  };
  // Agentic-loop cancellation (Phase 5 — M31 T6)
  'command.stop': {
    request: CommandStopRequest;
    response: CommandStopResult;
  };
  // Agentic-loop run snapshot for palette backfill-on-mount (Phase 5 — M32 T0 / F1)
  'command.getRunSnapshot': {
    request: { runId: string };
    response: AgenticRunSnapshot | null;
  };
  // Copilot service channels (Phase 5 — M33 T5)
  'copilot.insights': {
    request: CopilotInsightListArgs;
    response: CopilotInsightListResult;
  };
  'copilot.dismiss': {
    request: CopilotDismissArgs;
    response: CopilotDismissResult;
  };
  'copilot.ask': {
    request: CopilotAskArgs;
    response: CopilotAskResult;
  };
  'copilot.configure': {
    request: CopilotConfigureArgs;
    response: CopilotConfigureResult;
  };
  'copilot.export': {
    request: CopilotExportRequest;
    response: CopilotExportResponse;
  };
  // Ticket management channels
  'tickets.create': {
    request: CreateTicketRequest;
    response: CreateTicketResponse;
  };
  'tickets.update': {
    request: UpdateTicketRequest;
    response: undefined;
  };
  'tickets.assign': {
    request: AssignTicketRequest;
    response: undefined;
  };
  'tickets.close': {
    request: CloseTicketRequest;
    response: undefined;
  };
  'tickets.reopen': {
    request: ReopenTicketRequest;
    response: undefined;
  };
  'tickets.addComment': {
    request: AddTicketCommentRequest;
    response: AddTicketCommentResponse;
  };
  'tickets.list': {
    request: ListTicketsRequest;
    response: Ticket[];
  };
  'tickets.get': {
    request: GetTicketRequest;
    response: TicketDetail;
  };
}

export type IpcChannel = keyof IpcContract;
export type EventChannel = 'events.dashboard';

// ---------------------------------------------------------------------------
// High-level bridge surface — what the renderer sees as `window.teamx`
// ---------------------------------------------------------------------------

/**
 * Type of the callback a renderer passes to `events.onDashboard`. The
 * renderer typically narrows on `event.type` (e.g. `token.delta`) and
 * casts `event.payload` to the matching payload type (see
 * `TokenDeltaPayload`, `WorkStartedPayload`, `WorkCompletedPayload`).
 */
export type DashboardEventListener = (event: DashboardEvent) => void;

/**
 * Returned from `events.onDashboard` — call it to stop receiving
 * events. The renderer hooks this up to its `useEffect` cleanup
 * returns so subscriptions don't outlive the component that made them.
 */
export type UnsubscribeFn = () => void;

/**
 * The full `window.teamx` surface exposed by the preload bridge.
 *
 * Signature philosophy: prefer positional args where there is exactly
 * ONE obvious parameter (`employees.list(companyId)`,
 * `chat.list(threadId)`) and an object literal where more than one
 * field is in play (`chat.send(req)`). This mirrors how the renderer's
 * React hooks consume each method and keeps call sites self-documenting
 * without forcing the caller to remember positional order.
 */
export interface TeamXApi {
  system: {
    /** Open a native directory picker and return the selected folder path, if any. */
    selectDirectory(): Promise<SelectDirectoryResponse>;
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
  goals: {
    /** Create a new goal. */
    create(req: CreateGoalRequest): Promise<CreateGoalResponse>;
    /** Update goal fields (title, description, status, progressPct, targetDate). */
    update(req: UpdateGoalRequest): Promise<void>;
    /** List all goals for a company. */
    list(companyId: string): Promise<Goal[]>;
    /** Get full goal detail with linked projects. */
    get(goalId: string): Promise<GoalDetail>;
    /** Delete a goal. */
    delete(goalId: string): Promise<void>;
  };
  projects: {
    /** Create a new project. */
    create(req: CreateProjectRequest): Promise<CreateProjectResponse>;
    /** Update project fields. */
    update(req: UpdateProjectRequest): Promise<void>;
    /** List all projects for a company. */
    list(companyId: string): Promise<Project[]>;
    /** Get full project detail with linked ticket ids and lead. */
    get(projectId: string): Promise<ProjectDetail>;
    /** Delete a project and its ticket links. */
    delete(projectId: string): Promise<void>;
    /** Link a ticket to a project. */
    linkTicket(projectId: string, ticketId: string): Promise<void>;
    /** Unlink a ticket from a project. */
    unlinkTicket(projectId: string, ticketId: string): Promise<void>;
  };
  meetings: {
    /** Start a meeting — pauses orchestrator, creates meeting thread, chair speaks first. */
    call(req: CallMeetingRequest): Promise<CallMeetingResponse>;
    /** End a meeting — generate minutes, extract action items, resume orchestrator. */
    end(meetingId: string): Promise<EndMeetingResponse>;
    /** Rocky interjects mid-meeting. */
    interject(req: InterjectMeetingRequest): Promise<InterjectMeetingResponse>;
    /** List all meetings for a company. */
    list(companyId: string): Promise<Meeting[]>;
    /** Get full meeting detail with thread messages and chair. */
    get(meetingId: string): Promise<MeetingDetail>;
  };
  telemetry: {
    /** Company-level aggregate stats (total runs, tokens, cost, latency). */
    companyStats(
      req: string | TelemetryCompanyStatsRequest,
    ): Promise<TelemetryCompanyStatsResponse>;
    /** Daily time-series of token usage and cost within a date range. */
    dailyUsage(req: TelemetryDailyUsageRequest): Promise<TelemetryDailyUsageRow[]>;
    /** Per-employee breakdown of runs, tokens, latency, and cost. */
    employeeStats(
      req: string | TelemetryEmployeeStatsRequest,
    ): Promise<TelemetryEmployeeStatsRow[]>;
    /** Newest-first persisted run summaries for dashboard backfill. */
    recentRuns(req: TelemetryRecentRunsRequest): Promise<TelemetryRecentRunRow[]>;
    /** Cost breakdown by provider and model, with optional date range filter. */
    costBreakdown(req: TelemetryCostBreakdownRequest): Promise<TelemetryCostBreakdownRow[]>;
  };
  settings: {
    /** Get runtime strategy, hardware profile, and effective orchestrator slots. */
    getRuntime(): Promise<SettingsGetRuntimeResponse>;
    /** Set runtime strategy (auto/hybrid/always-on/lean). */
    setRuntime(req: SettingsSetRuntimeRequest): Promise<void>;
    /** Get privacy tier setting and per-provider allowed/blocked status. */
    getPrivacy(): Promise<SettingsGetPrivacyResponse>;
    /** Set maximum privacy tier. */
    setPrivacy(req: SettingsSetPrivacyRequest): Promise<void>;
    /** Get concurrency settings (orchestrator slots + per-provider caps). */
    getConcurrency(): Promise<SettingsGetConcurrencyResponse>;
    /** Set concurrency settings. */
    setConcurrency(req: SettingsSetConcurrencyRequest): Promise<void>;
    /** Get Extensions & Authority settings. */
    getExtensions(): Promise<SettingsGetExtensionsResponse>;
    /** Patch Extensions & Authority settings. */
    setExtensions(req: SettingsSetExtensionsRequest): Promise<void>;
    /** Get long-run memory defaults (pack budget, recent-turn window, checkpoint depth). */
    getMemory(): Promise<SettingsGetMemoryResponse>;
    /** Patch one or more long-run memory defaults. */
    setMemory(req: SettingsSetMemoryRequest): Promise<void>;
    /** Get full RAG configuration snapshot (enabled, top-K, threshold, max-tokens, embedding provider/model/dimension). */
    getRagConfig(): Promise<SettingsGetRagConfigResponse>;
    /** Patch one or more RAG configuration keys. Missing keys retain their current value. */
    setRagConfig(req: SettingsSetRagConfigRequest): Promise<void>;
    /** Get agentic-loop budget caps (max steps, max tokens, timeout ms). Phase 5 — M31. */
    getAgentic(): Promise<SettingsGetAgenticResponse>;
    /** Patch one or more agentic-loop budget caps. Values are clamped. Phase 5 — M31. */
    setAgentic(req: SettingsSetAgenticRequest): Promise<void>;
    /** Get task-planner guardrail settings (max tickets, max depth, approval level, escalation threshold). Phase 5 — M32. */
    getPlanner(): Promise<SettingsGetPlannerResponse>;
    /** Patch one or more task-planner settings. Numeric values are clamped; approval level is validated. Phase 5 — M32. */
    setPlanner(req: SettingsSetPlannerRequest): Promise<void>;
    /** Get copilot-service settings (enabled, interval in minutes, allowed category subset). Phase 5 — M33. */
    getCopilot(): Promise<SettingsGetCopilotResponse>;
    /**
     * Patch one or more copilot-service settings. `intervalMinutes` is clamped;
     * `categories` is filtered against `COPILOT_CATEGORIES` with empty-array
     * fallback to the full set. Restarts the per-company analyzer timer so
     * new settings take effect without an app restart. Phase 5 — M33.
     */
    setCopilot(req: SettingsSetCopilotRequest): Promise<void>;
    /** Get copilot feedback category weights. Phase 6 — M38. */
    getCopilotWeights(
      req: SettingsGetCopilotWeightsRequest,
    ): Promise<SettingsGetCopilotWeightsResponse>;
    /** Patch copilot feedback category weights. Phase 6 — M38. */
    setCopilotWeights(
      req: SettingsSetCopilotWeightsRequest,
    ): Promise<SettingsSetCopilotWeightsResponse>;
  };
  providers: {
    /** List all configured providers with status. */
    list(): Promise<ProviderConfig[]>;
    /** Register a new provider. API key saved to OS keychain if supplied. */
    add(req: AddProviderRequest): Promise<AddProviderResponse>;
    /** Update provider config. API key saved to OS keychain if supplied. */
    update(req: UpdateProviderRequest): Promise<void>;
    /** Remove a provider and its keychain entry. */
    remove(providerId: string): Promise<void>;
    /** Test a provider's API key + connectivity. */
    testConnection(providerId: string): Promise<TestProviderConnectionResponse>;
    /** List provider models or suggestions for model-capable settings UIs. */
    listModels(providerId: string): Promise<ListProviderModelsResponse>;
  };
  vault: {
    /** Upload a file to the vault. sourcePath is an absolute path on disk. */
    upload(req: VaultUploadRequest): Promise<VaultUploadResponse>;
    /** Get file metadata and absolute path for download/preview. */
    download(fileId: string): Promise<VaultDownloadResponse>;
    /** List all files in a company vault, newest first. */
    list(companyId: string): Promise<VaultFile[]>;
    /** Full-text search across vault files. */
    search(companyId: string, query: string): Promise<VaultSearchResult[]>;
    /** Delete a file from vault (disk + database). */
    delete(fileId: string): Promise<void>;
    /** Verify SHA256 integrity of a vault file. */
    verify(fileId: string): Promise<VaultVerifyResponse>;
    /** Get vault statistics for a company. */
    stats(companyId: string): Promise<VaultStatsResponse>;
  };
  backup: {
    /** Create a full backup (SQLite + vault files). */
    create(req?: BackupCreateRequest): Promise<BackupCreateResponse>;
    /** Restore from a backup directory. DESTRUCTIVE. */
    restore(req: BackupRestoreRequest): Promise<BackupRestoreResponse>;
    /** List all existing backup archives. */
    list(): Promise<BackupEntry[]>;
  };
  audit: {
    /** Filtered, paginated list of audit events. */
    list(filter: AuditFilter): Promise<AuditEvent[]>;
    /** Aggregate statistics for the audit summary cards. */
    stats(companyId: string): Promise<AuditStats>;
    /** Export filtered audit events to a file (CSV or JSON). Returns the saved file path. */
    export(req: AuditExportRequest): Promise<AuditExportResponse>;
  };
  updater: {
    /** Check GitHub Releases for a newer version. User-triggered only (zero phone-home). */
    check(): Promise<UpdateCheckResult>;
    /** Download and install the available update. App will restart. */
    install(): Promise<UpdateInstallResult>;
  };
  rag: {
    /** Aggregate embedding stats for the Settings panel summary card. */
    stats(companyId: string): Promise<RagStatsResponse>;
    /** Destructive: wipe then re-index every eligible source for the company. */
    rebuildAll(companyId: string): Promise<RagRebuildAllResponse>;
    /** Destructive: wipe every embedding row for the company (no re-index). */
    deleteForCompany(companyId: string): Promise<RagDeleteForCompanyResponse>;
  };
  command: {
    /**
     * Classify the user's text, resolve any entity queries, fill slots,
     * and return a discriminated-union `IpcParseResult` the palette UI
     * can drive. No side effects — the result is a plan, not a
     * dispatch. `currentView` + `recentIntents` are optional NLU
     * context the classifier uses to bias prediction.
     */
    parse(req: CommandParseRequest): Promise<IpcParseResult>;
    /**
     * Run a parsed intent against the main process's existing IPC
     * handlers. Destructive intents (`fire_employee`, `close_ticket`,
     * `end_meeting`, `promote_employee`) require `confirmed: true`
     * explicitly — omitting it returns `{ kind: 'needs_confirmation' }`
     * without dispatching.
     */
    execute(req: IpcExecuteRequest): Promise<IpcExecuteResult>;
    /**
     * Newest-first page of the caller's command history. Defaults
     * `limit` to the per-company FIFO cap (20) and `companyId` to the
     * service's defaultCompanyId.
     */
    history(req?: CommandHistoryRequest): Promise<IpcCommandHistoryEntry[]>;
    /**
     * Prefix-matched suggestion rows for the palette's drop-down.
     * M30 ships a static table; M31 may extend with RAG context.
     */
    suggest(req: CommandSuggestRequest): Promise<IpcSuggestItem[]>;
    /**
     * Cancel an in-flight agentic-loop run started by an earlier
     * `command.execute` that returned a `runId` (Phase 5 — M31 T6).
     *
     * Idempotent: unknown or already-terminal run ids resolve to
     * `{ stopped: false }` without throwing. The authoritative
     * end-of-run signal is the `agentic.failed` (status=`canceled`)
     * event on `events.dashboard` — the palette subscribes to that
     * to exit the step-log running state; this call's return value
     * is informational only.
     */
    stop(req: CommandStopRequest): Promise<CommandStopResult>;
    /**
     * Return a point-in-time snapshot of an agentic-loop run keyed by
     * `runId` (Phase 5 — M32 T0 / F1). Projects the in-memory run
     * state onto the wire shapes `agent.step` / `agentic.completed` /
     * `agentic.failed` use, so the palette can backfill its step-log
     * on mount for runs whose bus events fired before the renderer
     * subscription attached. Returns `null` for unknown / evicted
     * runs — callers treat that as "no backfill available" and fall
     * back to the live stream alone.
     */
    getRunSnapshot(runId: string): Promise<AgenticRunSnapshot | null>;
  };
  copilot: {
    /**
     * Paginated list of active (non-dismissed, non-expired) insights
     * for the company, newest-first. Cursor is the `createdAt` of the
     * last row from the previous page; pass `undefined` for the first
     * page. `nextCursor` is `null` when the page was the last one.
     * Optional category + severity filters narrow the result set
     * server-side so the UI does not paginate through dismissed or
     * filtered-out rows. Phase 5 — M33 T5.
     */
    insights(args: CopilotInsightListArgs): Promise<CopilotInsightListResult>;
    /**
     * Mark an insight as dismissed. Idempotent when invoked on an
     * already-dismissed row (the handler returns the prior
     * `dismissedAt`). Emits `copilot.dismissed` on the event bus per
     * invariant #11 so the renderer's React Query cache invalidates.
     * Phase 5 — M33 T5.
     */
    dismiss(args: CopilotDismissArgs): Promise<CopilotDismissResult>;
    /**
     * Ask the `system-copilot` pseudo-employee a question. Routes
     * through the agentic loop in the same shape M31's
     * `complex_request` uses — the response `{ runId, threadId }`
     * mirrors `IpcExecuteResult` so the palette's step-stream hook
     * can subscribe with no wire-format divergence. Phase 5 — M33 T5
     * ships the IPC slot; T6 wires the full loop.
     */
    ask(args: CopilotAskArgs): Promise<CopilotAskResult>;
    /**
     * Test-only: force a manual analyzer tick for the given company
     * and resolve when it completes. Production callers receive an
     * error directing them to `settings.setCopilot` (T7). Sole
     * intended caller is the T9 Playwright spec, which needs to
     * synchronously force a copilot cycle rather than wait on the
     * 5-minute scheduled interval. Phase 5 — M33 T5.
     */
    configure(args: CopilotConfigureArgs): Promise<CopilotConfigureResult>;
    /**
     * Read-only local export of active Copilot insights as CSV or JSON.
     * Company scope requires `companyId`; all-company scope applies the
     * same optional category/severity filters globally. Emits no bus event.
     * Phase 6 — M40.
     */
    export(args: CopilotExportRequest): Promise<CopilotExportResponse>;
  };
  tickets: {
    /** Create a new ticket. If assigneeId is provided, triggers agent assignment. */
    create(req: CreateTicketRequest): Promise<CreateTicketResponse>;
    /** Update ticket fields (title, description, priority, status, labels, SLA, due). */
    update(req: UpdateTicketRequest): Promise<void>;
    /** Assign a ticket to an employee. Creates ticket thread and enqueues WorkItem. */
    assign(req: AssignTicketRequest): Promise<void>;
    /** Close a ticket (sets status to 'done' and records closedAt). */
    close(ticketId: string): Promise<void>;
    /** Reopen a previously closed ticket. */
    reopen(ticketId: string): Promise<void>;
    /** Add a comment to a ticket's discussion thread. */
    addComment(req: AddTicketCommentRequest): Promise<AddTicketCommentResponse>;
    /** List all tickets for a company. */
    list(companyId: string): Promise<Ticket[]>;
    /** Get full ticket detail with thread messages and assignee. */
    get(ticketId: string): Promise<TicketDetail>;
    /** Attach a vault file to a ticket. */
    attachFile(req: AttachFileRequest): Promise<AttachFileResponse>;
    /** Detach a file from a ticket. */
    detachFile(req: DetachFileRequest): Promise<void>;
    /** List all file attachments for a ticket. */
    listAttachments(ticketId: string): Promise<TicketAttachment[]>;
  };
}

/**
 * Sentinel value the renderer passes as `threadId` to
 * `chat.send` to request the user↔employee DM thread be looked up or
 * created on the fly. Exported from shared-types so both the preload
 * and the renderer reference the same string constant.
 */
export const AUTO_THREAD_ID = 'auto';
