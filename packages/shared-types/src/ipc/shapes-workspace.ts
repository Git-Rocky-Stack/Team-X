/**
 * Request/response shapes: workspaces, operators, cloud link, runtime
 * profiles and operations, autonomy doctor and benchmarks, agent improvement,
 * routines, budgets, approvals, artifacts, memory, employees and chat.
 * Split from ipc.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type {
  ApprovalDecisionStatus,
  ApprovalItemKind,
  ApprovalItemStatus,
  AutonomyBenchmarkScenarioId,
  BudgetPolicyPeriod,
  BudgetScopeKind,
  CompanyImportPreview,
  CompanyPackageManifest,
  CompanyPackageMode,
  CompanyPackageSecretBinding,
  CompanyTemplateSummary,
  Employee,
  OperatorInvite,
  OperatorMembershipRole,
  RoutineSchedule,
  RoutineTicketWorkConfig,
  RuntimeProfileKind,
  RuntimeSession,
  SharedOperatorAuthMode,
  Ticket,
  TicketCheckout,
  TicketPriority,
} from '../entities.js';

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

export type AgentImprovementSignalKind =
  | 'work_failures'
  | 'runtime_failures'
  | 'blocked_tickets'
  | 'stale_in_progress';

export interface AgentImprovementRecommendation {
  id: string;
  signalKind: AgentImprovementSignalKind;
  title: string;
  description: string;
  priority: TicketPriority;
  sourceCount: number;
  labels: string[];
  sourceRefs: string[];
  existingTicketId: string | null;
  createdTicketId: string | null;
}

export interface AgentImprovementRunSummary {
  eventId: string;
  ranAt: number;
  recommendationCount: number;
  createdTicketCount: number;
  createdTicketIds: string[];
  inspectedEventCount: number;
  inspectedTicketCount: number;
  /**
   * H12 audit (2026-05-07): number of candidate signals suppressed by
   * causation-chain dedup during this run. Deduped signals carry the same
   * cause hash as a prior improvement ticket (open or closed), so the loop
   * refuses to cycle on identical evidence. `0` for runs emitted before
   * the H12 fix landed (back-compat: `numberFromPayload(payload, ..., 0)`).
   */
  dedupedCauseCount: number;
}

export interface AgentImprovementSnapshot {
  companyId: string;
  generatedAt: number;
  openTicketCount: number;
  openTickets: Ticket[];
  recentRuns: AgentImprovementRunSummary[];
}

export interface ListAgentImprovementRequest {
  companyId: string;
  limit?: number;
}

export interface RunAgentImprovementRequest {
  companyId: string;
  eventLimit?: number;
  dryRun?: boolean;
}

export interface AgentImprovementRunResult {
  companyId: string;
  ranAt: number;
  inspectedEventCount: number;
  inspectedTicketCount: number;
  recommendations: AgentImprovementRecommendation[];
  createdTicketIds: string[];
  skippedExistingTicketIds: string[];
  /**
   * H12 audit (2026-05-07): cause hashes whose signals were suppressed
   * during this run because an improvement ticket carrying the same hash
   * already exists (open or closed). Each entry is the deterministic
   * 8-hex-char hash of the sorted sourceRef set. The audit's "can cycle
   * on identical signals" complaint is closed by refusing to re-create a
   * ticket whose evidence set has already been seen.
   */
  dedupedCauseHashes: string[];
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
