/**
 * Who authored a chat message. Narrow by design — messages are authored
 * by one of these three concrete agents. Event emission uses the wider
 * `ActorKind` (below) because the orchestrator and provider adapters
 * emit dashboard events but never author messages.
 */
export type AuthorKind = 'employee' | 'user' | 'system';

/**
 * Who emitted a dashboard event. Superset of `AuthorKind` — adds
 * `orchestrator` (scheduler lifecycle events) and `provider` (LLM
 * provider streaming events). Kept separate from `AuthorKind` so
 * `ChatMessage.authorKind` cannot accidentally be typed as
 * `'orchestrator'` or `'provider'`.
 */
export type ActorKind = AuthorKind | 'orchestrator' | 'provider';

export type EmployeeStatus = 'idle' | 'thinking' | 'blocked' | 'error';

// ---------------------------------------------------------------------------
// Employee level hierarchy (Phase 5.6 M-C step d hardening — BUG-001)
//
// Locked Phase 2 M9 design: real hierarchy with strict precedence:
//
//   officer > senior-management > management > supervisor > lead > ic
//
// LOWER rank number = MORE senior. The strict rule for the
// `employees.setManager` IPC: `rank(manager) < rank(report)` — manager
// MUST be at a strictly more senior level than the report. Same-level
// and inverted relationships are rejected by the handler. Matrix /
// flat-org structures would require an explicit opt-in flag in a
// future milestone (today there is no such flag — strict mode only).
//
// `system` is intentionally absent — system pseudo-employees are
// filtered out of every renderer surface and the org tree before this
// rank ever applies; the handler-level `is_system` guard short-circuits
// before the rank check runs.
//
// `getLevelRank` accepts case-insensitive input and normalizes
// whitespace → hyphen so role-pack frontmatter ('Senior Management',
// 'senior-management', 'SENIOR MANAGEMENT') all resolve to the same
// rank. Unknown levels return `null`; callers fail OPEN with a dev-mode
// warning rather than reject — keeps the guard non-fragile against
// role-pack additions that introduce new level names.
// ---------------------------------------------------------------------------

export type EmployeeLevel =
  | 'officer'
  | 'senior-management'
  | 'management'
  | 'supervisor'
  | 'lead'
  | 'ic';

/**
 * Numeric rank per level. Lower = more senior. Used by the
 * `employees.setManager` handler's level-inversion guard.
 */
export const LEVEL_RANK: Readonly<Record<EmployeeLevel, number>> = {
  officer: 0,
  'senior-management': 1,
  management: 2,
  supervisor: 3,
  lead: 4,
  ic: 5,
};

/**
 * Normalize a free-form level string (role-pack frontmatter, DB column,
 * UI input) to the canonical `EmployeeLevel` form. Lowercase + trim +
 * collapse whitespace runs to single hyphens.
 */
export function normalizeLevel(level: string): string {
  return level.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Resolve a free-form level string to its numeric rank. Returns `null`
 * for unrecognized levels (including `'system'` — system rows never
 * participate in the org tree). Callers MUST treat `null` as
 * "skip the level check" (fail-open with dev-mode warning) so a future
 * role-pack that introduces a new level name does not brick existing
 * `setManager` calls.
 */
export function getLevelRank(level: string | null | undefined): number | null {
  if (!level) return null;
  const normalized = normalizeLevel(level);
  return LEVEL_RANK[normalized as EmployeeLevel] ?? null;
}

// ---------------------------------------------------------------------------
// Company status (Phase 3 — M16)
// ---------------------------------------------------------------------------

/**
 * Orchestrator dispatch status for a company.
 *
 *  - `running`  — normal. Dispatcher fires. Copilot analyzer ticks.
 *  - `meeting`  — meeting primitive holds the pause (M16). All new
 *    dispatch is deferred until the meeting ends.
 *  - `paused`   — explicit user pause (future). No new dispatch.
 *  - `archived` — soft-delete. Dispatcher + copilot analyzer both
 *    treat the company as inactive. The `companies.archive` IPC (M33
 *    follow-up F3) stops the analyzer timer and clears the rolling
 *    event window before writing this status.
 */
export type CompanyStatus = 'running' | 'meeting' | 'paused' | 'archived';

// ---------------------------------------------------------------------------
// Meetings (Phase 3 — M16)
// ---------------------------------------------------------------------------

export type MeetingStatus = 'active' | 'ended';
export type MeetingMode = 'round-robin' | 'chair-directed' | 'freeform';

/** An action item extracted from meeting minutes. */
export interface MeetingActionItem {
  title: string;
  assigneeId?: string;
  priority?: TicketPriority;
}

export interface Meeting {
  id: string;
  companyId: string;
  threadId: string;
  chairId: string;
  agenda: string;
  mode: MeetingMode;
  status: MeetingStatus;
  minutesMd: string | null;
  attendees: string[];
  actionItems: MeetingActionItem[];
  startedAt: number;
  endedAt: number | null;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'in-progress' | 'blocked' | 'done';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Schedule / Calendar
// ---------------------------------------------------------------------------

export type ScheduleItemKind = 'task' | 'deadline' | 'milestone' | 'reminder';
export type ScheduleItemStatus = 'scheduled' | 'completed' | 'cancelled';
export type ScheduleItemSourceKind = 'manual' | 'ticket_due' | 'project_target' | 'goal_target';

export interface ScheduleItem {
  id: string;
  companyId: string;
  title: string;
  description: string;
  kind: ScheduleItemKind;
  status: ScheduleItemStatus;
  priority: TicketPriority;
  startsAt: number;
  endsAt: number | null;
  reminderAt: number | null;
  ticketId: string | null;
  projectId: string | null;
  goalId: string | null;
  assigneeId: string | null;
  wakeupRequestId: string | null;
  sourceKind: ScheduleItemSourceKind;
  sourceId: string | null;
  createdById: string;
  createdByKind: AuthorKind;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

// ---------------------------------------------------------------------------
// Goals & Projects (Phase 3 — M15)
// ---------------------------------------------------------------------------

export type GoalStatus = 'active' | 'achieved' | 'abandoned';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: GoalStatus;
  /** 0-100 — auto-calculated from linked project completion. */
  progressPct: number;
  /** Optional deadline as UNIX ms timestamp. */
  targetDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  companyId: string;
  /** Null = standalone project not linked to a goal. */
  goalId: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  /** Project lead — null if unassigned. */
  leadId: string | null;
  priority: ProjectPriority;
  /** Optional deadline as UNIX ms timestamp. */
  targetDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Ticket {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Employee FK — null when unassigned. */
  assigneeId: string | null;
  /** Human or employee who filed the ticket. */
  reporterId: string;
  reporterKind: AuthorKind;
  /** JSON-encoded string[] of label tags. */
  labelsJson: string;
  /** JSON-encoded string[] of ticket-id dependencies. */
  dependenciesJson: string;
  /** Target hours to resolution. Null = no SLA. */
  slaHours: number | null;
  dueAt: number | null;
  /** Associated discussion thread (kind: 'ticket'). Created on first assignment. */
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  icon: string | null;
  theme: string;
  createdAt: number;
  workspaceOriginId?: string;
  companyOriginId?: string;
  settings: CompanySettings;
}

export interface CompanyDashboardLayoutSettings {
  version: 1;
  showAgentRuns: boolean;
  showEmployeeQueues: boolean;
}

export const USER_GUIDE_ROLES = ['owner', 'operator', 'builder'] as const;
export type UserGuideRole = (typeof USER_GUIDE_ROLES)[number];

export interface CompanyUserGuideSettings {
  welcomeDismissedAt?: string;
  lastViewedSectionId?: string;
  selectedRole?: UserGuideRole;
  completedTaskIds?: string[];
}

export interface CompanySettings {
  mission?: string;
  values?: string[];
  theme?: 'dark' | 'light';
  dashboardLayout?: CompanyDashboardLayoutSettings;
  userGuide?: CompanyUserGuideSettings;
  sharing?: CompanySharingPostureSettings;
  /** Default LLM provider for all employees in this company. Employees can override via providerPref. */
  defaultProviderId?: string;
  /** Default model for all employees using the company default provider. */
  defaultModel?: string;
}

export const OPERATOR_AUTH_MODES = ['local', 'invited', 'cloud'] as const;
export type OperatorAuthMode = (typeof OPERATOR_AUTH_MODES)[number];
export const SHARED_OPERATOR_AUTH_MODES = ['invited', 'cloud'] as const;
export type SharedOperatorAuthMode = (typeof SHARED_OPERATOR_AUTH_MODES)[number];

export const CLOUD_WORKSPACE_LINK_STATES = [
  'unlinked',
  'linking',
  'linked',
  'sync-paused',
  'sync-degraded',
  'unlinking',
] as const;
export type CloudWorkspaceLinkState = (typeof CLOUD_WORKSPACE_LINK_STATES)[number];

export interface CloudSyncCursorState {
  outboundCursor: string | null;
  inboundCursor: string | null;
}

export interface CompanyCloudLinkMetadata {
  state: CloudWorkspaceLinkState;
  cloudWorkspaceId: string | null;
  cloudTenantId: string | null;
  linkedDeviceId: string | null;
  lastSyncedCursor: CloudSyncCursorState | null;
  lastSnapshotId: string | null;
  lastSyncAt: number | null;
  lastSyncError: string | null;
}

export interface CompanyCloudLinkStatus extends CompanyCloudLinkMetadata {
  companyId: string;
  deviceId: string;
  isLinked: boolean;
  canLink: boolean;
  canUnlink: boolean;
}

export const CLOUD_INBOUND_ACTION_KINDS = [
  'approval-review',
  'membership-sync',
  'sharing-mode-request',
  'artifact-review',
  'sync-request',
] as const;
export type CloudInboundActionKind = (typeof CLOUD_INBOUND_ACTION_KINDS)[number];

export interface CloudInboundActionEnvelope {
  id: string;
  companyId: string;
  cloudWorkspaceId: string;
  kind: CloudInboundActionKind;
  issuedAt: number;
  issuedByOperatorId: string | null;
  payload: Record<string, unknown> | null;
}

export const COMPANY_SHARING_READINESS = ['ready', 'warning', 'blocked'] as const;
export type CompanySharingReadiness = (typeof COMPANY_SHARING_READINESS)[number];

export interface CompanySharingPostureSettings {
  mode: OperatorAuthMode;
  readiness: CompanySharingReadiness;
  missingRequirements?: string[];
  lastExportedAt?: string;
  lastExportMode?: CompanyPackageMode;
}

export interface CompanySharingModeReadiness {
  mode: OperatorAuthMode;
  readiness: CompanySharingReadiness;
  missingRequirements: string[];
  summary: string;
}

export const OPERATOR_MEMBERSHIP_ROLES = ['owner', 'admin', 'operator', 'reviewer'] as const;
export type OperatorMembershipRole = (typeof OPERATOR_MEMBERSHIP_ROLES)[number];

export interface Operator {
  id: string;
  displayName: string;
  email: string | null;
  authMode: OperatorAuthMode;
  createdAt: number;
  updatedAt: number;
}

export const OPERATOR_MEMBERSHIP_SOURCE_KINDS = ['local', 'hosted'] as const;
export type OperatorMembershipSourceKind = (typeof OPERATOR_MEMBERSHIP_SOURCE_KINDS)[number];

export interface OperatorMembership {
  id: string;
  operatorId: string;
  companyId: string;
  role: OperatorMembershipRole;
  sourceKind: OperatorMembershipSourceKind;
  cloudWorkspaceId: string | null;
  hostedInviteId: string | null;
  canApproveBudget: boolean;
  canApproveAuthority: boolean;
  canManageRoutines: boolean;
  canManageRuntimes: boolean;
  createdAt: number;
  updatedAt: number;
}

export const OPERATOR_INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type OperatorInviteStatus = (typeof OPERATOR_INVITE_STATUSES)[number];
export const OPERATOR_INVITE_SOURCE_KINDS = ['local', 'hosted'] as const;
export type OperatorInviteSourceKind = (typeof OPERATOR_INVITE_SOURCE_KINDS)[number];

export interface OperatorInvite {
  id: string;
  companyId: string;
  email: string;
  displayName: string | null;
  authMode: SharedOperatorAuthMode;
  role: OperatorMembershipRole;
  sourceKind: OperatorInviteSourceKind;
  cloudWorkspaceId: string | null;
  hostedInviteId: string | null;
  note: string | null;
  inviteToken: string;
  status: OperatorInviteStatus;
  invitedByOperatorId: string;
  acceptedOperatorId: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface OperatorAccessEntry {
  operator: Operator;
  membership: OperatorMembership;
}

export interface CompanySharingReadinessSummary {
  companyId: string;
  configuredMode: OperatorAuthMode;
  effectiveMode: OperatorAuthMode;
  readiness: CompanySharingReadiness;
  missingRequirements: string[];
  operatorCount: number;
  ownerCount: number;
  adminCount: number;
  localOperatorCount: number;
  invitedOperatorCount: number;
  cloudOperatorCount: number;
  hasWorkspaceOrigin: boolean;
  hasCompanyOrigin: boolean;
  lastExportedAt: string | null;
  lastExportMode: CompanyPackageMode | null;
  modeReadiness: CompanySharingModeReadiness[];
}

export const RUNTIME_PROFILE_KINDS = [
  'teamx-internal',
  'bash',
  'http',
  'codex',
  'claude-code',
  'cursor',
] as const;
export type RuntimeProfileKind = (typeof RUNTIME_PROFILE_KINDS)[number];

export const RUNTIME_PROFILE_HEALTH_STATUSES = ['unknown', 'healthy', 'warning', 'error'] as const;
export type RuntimeProfileHealthStatus = (typeof RUNTIME_PROFILE_HEALTH_STATUSES)[number];

export const RUNTIME_PROFILE_EXECUTION_MODES = ['native', 'planned'] as const;
export type RuntimeProfileExecutionMode = (typeof RUNTIME_PROFILE_EXECUTION_MODES)[number];

export interface RuntimeProfile {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  kind: RuntimeProfileKind;
  enabled: boolean;
  config: Record<string, unknown> | null;
  lastHealthStatus: RuntimeProfileHealthStatus;
  lastHealthMessage: string | null;
  lastValidatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface EmployeeRuntimeBinding {
  id: string;
  companyId: string;
  employeeId: string;
  runtimeProfileId: string;
  createdAt: number;
  updatedAt: number;
}

export interface RuntimeProfileSummary extends RuntimeProfile {
  executionMode: RuntimeProfileExecutionMode;
  boundEmployeeIds: string[];
  boundEmployeeCount: number;
}

export interface RuntimeProfileValidation {
  profileId: string;
  status: RuntimeProfileHealthStatus;
  message: string;
  checkedAt: number;
  supportsExecution: boolean;
  details: Record<string, unknown> | null;
}

export const RUNTIME_SESSION_STATUSES = [
  'starting',
  'idle',
  'working',
  'blocked',
  'stale',
  'offline',
  'failed',
  'ended',
] as const;
export type RuntimeSessionStatus = (typeof RUNTIME_SESSION_STATUSES)[number];

export interface RuntimeSession {
  id: string;
  companyId: string;
  employeeId: string;
  runtimeProfileId: string | null;
  adapterKind: RuntimeProfileKind;
  status: RuntimeSessionStatus;
  currentRunId: string | null;
  currentTicketId: string | null;
  pid: number | null;
  endpointUrl: string | null;
  workspacePath: string | null;
  capabilities: Record<string, unknown>;
  lastHeartbeatAt: number | null;
  leaseExpiresAt: number | null;
  failureReason: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RuntimeHeartbeat {
  id: string;
  sessionId: string;
  companyId: string;
  employeeId: string;
  runtimeProfileId: string | null;
  status: RuntimeSessionStatus;
  currentRunId: string | null;
  currentTicketId: string | null;
  costDelta: Record<string, unknown>;
  message: string | null;
  createdAt: number;
}

export const TICKET_CHECKOUT_STATUSES = [
  'active',
  'released',
  'expired',
  'completed',
  'blocked',
] as const;
export type TicketCheckoutStatus = (typeof TICKET_CHECKOUT_STATUSES)[number];

export interface TicketCheckout {
  id: string;
  companyId: string;
  ticketId: string;
  employeeId: string;
  runtimeSessionId: string | null;
  runId: string | null;
  status: TicketCheckoutStatus;
  claimedAt: number;
  lastHeartbeatAt: number | null;
  expiresAt: number;
  releasedAt: number | null;
  releaseReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type TicketCheckoutClaimResult =
  | { outcome: 'claimed'; checkout: TicketCheckout }
  | { outcome: 'already-owned-by-self'; checkout: TicketCheckout }
  | { outcome: 'expired-reclaimed'; checkout: TicketCheckout; previousCheckout: TicketCheckout }
  | { outcome: 'conflict'; conflictingCheckout: TicketCheckout };

export const AUTONOMY_BENCHMARK_SCENARIO_IDS = [
  'single-ticket-claim-completion',
  'race-for-one-ticket',
  'stale-worker-recovery',
  'budget-hard-stop-before-execution',
  'budget-hard-stop-mid-run',
  'missing-secret-failure',
  'blocked-ticket-delegation',
  'artifact-review-approval',
  'import-template-run-first-routine',
  'reboot-resume-existing-checkpoint',
] as const;
export type AutonomyBenchmarkScenarioId = (typeof AUTONOMY_BENCHMARK_SCENARIO_IDS)[number];

export const AUTONOMY_BENCHMARK_MODES = ['control-plane-simulated'] as const;
export type AutonomyBenchmarkMode = (typeof AUTONOMY_BENCHMARK_MODES)[number];

export const AUTONOMY_BENCHMARK_STATUSES = ['passed', 'failed'] as const;
export type AutonomyBenchmarkStatus = (typeof AUTONOMY_BENCHMARK_STATUSES)[number];

export interface AutonomyBenchmarkMetrics {
  successRate: number;
  duplicateWorkRate: number;
  staleRecoveryMs: number | null;
  costUsd: string;
  tokenCount: number;
  latencyMs: number;
  operatorInterventions: number;
  artifactCompleteness: number;
}

export interface AutonomyBenchmarkEvidence {
  eventTypes: string[];
  sessionStatuses: RuntimeSessionStatus[];
  checkoutStatuses: TicketCheckoutStatus[];
  artifactCount: number;
  toolCallCount: number;
  notes: string[];
}

export interface AutonomyBenchmarkScenarioResult {
  scenarioId: AutonomyBenchmarkScenarioId;
  label: string;
  runtimeKind: RuntimeProfileKind;
  mode: AutonomyBenchmarkMode;
  status: AutonomyBenchmarkStatus;
  startedAt: number;
  endedAt: number;
  metrics: AutonomyBenchmarkMetrics;
  evidence: AutonomyBenchmarkEvidence;
  error: string | null;
}

export interface AutonomyBenchmarkSummary {
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  successRate: number;
  duplicateWorkRate: number;
  meanLatencyMs: number;
  meanStaleRecoveryMs: number | null;
  totalCostUsd: string;
  totalTokenCount: number;
  operatorInterventions: number;
  artifactCompleteness: number;
}

export interface AutonomyBenchmarkReport {
  id: string;
  generatedAt: number;
  mode: AutonomyBenchmarkMode;
  runtimeKinds: RuntimeProfileKind[];
  scenarioIds: AutonomyBenchmarkScenarioId[];
  results: AutonomyBenchmarkScenarioResult[];
  summary: AutonomyBenchmarkSummary;
}

export const AUTONOMY_DOCTOR_STATUSES = ['ok', 'warning', 'blocked'] as const;
export type AutonomyDoctorStatus = (typeof AUTONOMY_DOCTOR_STATUSES)[number];

export const AUTONOMY_DOCTOR_FINDING_SEVERITIES = ['info', 'warning', 'blocked'] as const;
export type AutonomyDoctorFindingSeverity = (typeof AUTONOMY_DOCTOR_FINDING_SEVERITIES)[number];

export const AUTONOMY_DOCTOR_CHECK_IDS = [
  'db-integrity',
  'migrations',
  'backup-posture',
  'runtime-profiles',
  'runtime-secrets',
  'runtime-sessions',
  'ticket-checkouts',
  'workspace-paths',
  'mcp-health',
  'provider-health',
  'budget-blockers',
] as const;
export type AutonomyDoctorCheckId = (typeof AUTONOMY_DOCTOR_CHECK_IDS)[number];

export interface AutonomyDoctorFinding {
  id: string;
  severity: AutonomyDoctorFindingSeverity;
  title: string;
  detail: string;
  action: string | null;
  refs: string[];
}

export interface AutonomyDoctorCheck {
  id: AutonomyDoctorCheckId;
  label: string;
  status: AutonomyDoctorStatus;
  summary: string;
  checkedAt: number;
  findings: AutonomyDoctorFinding[];
}

export interface AutonomyDoctorReport {
  companyId: string;
  generatedAt: number;
  status: AutonomyDoctorStatus;
  checks: AutonomyDoctorCheck[];
  totals: {
    ok: number;
    warning: number;
    blocked: number;
    findingCount: number;
  };
}

export interface RuntimeProfileSecretRef {
  type: 'secret_ref';
  providerId: string;
  key: string;
  version: string;
}

export const ROUTINE_TRIGGER_KINDS = ['interval', 'daily', 'weekly'] as const;
export type RoutineTriggerKind = (typeof ROUTINE_TRIGGER_KINDS)[number];

export const ROUTINE_WORK_KINDS = ['ticket'] as const;
export type RoutineWorkKind = (typeof ROUTINE_WORK_KINDS)[number];

export const ROUTINE_LAST_RUN_STATUSES = ['never', 'running', 'success', 'error'] as const;
export type RoutineLastRunStatus = (typeof ROUTINE_LAST_RUN_STATUSES)[number];

export const ROUTINE_RUN_STATUSES = ['running', 'success', 'error'] as const;
export type RoutineRunStatus = (typeof ROUTINE_RUN_STATUSES)[number];

export const ROUTINE_RUN_REASONS = ['scheduled', 'manual'] as const;
export type RoutineRunReason = (typeof ROUTINE_RUN_REASONS)[number];

export interface RoutineIntervalSchedule {
  triggerKind: 'interval';
  intervalMinutes: number;
}

export interface RoutineDailySchedule {
  triggerKind: 'daily';
  timeOfDay: string;
}

export interface RoutineWeeklySchedule {
  triggerKind: 'weekly';
  dayOfWeek: number;
  timeOfDay: string;
}

export type RoutineSchedule =
  | RoutineIntervalSchedule
  | RoutineDailySchedule
  | RoutineWeeklySchedule;

export interface RoutineTicketWorkConfig {
  title: string;
  description: string;
  assigneeId: string | null;
  priority: TicketPriority;
  labels: string[];
}

export interface Routine {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  enabled: boolean;
  triggerKind: RoutineTriggerKind;
  schedule: RoutineSchedule;
  workKind: RoutineWorkKind;
  workConfig: RoutineTicketWorkConfig;
  lastRunStatus: RoutineLastRunStatus;
  lastRunMessage: string | null;
  lastRunAt: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineRun {
  id: string;
  companyId: string;
  routineId: string;
  status: RoutineRunStatus;
  reason: RoutineRunReason;
  workKind: RoutineWorkKind;
  scheduledFor: number | null;
  startedAt: number;
  finishedAt: number | null;
  ticketId: string | null;
  message: string | null;
  errorMessage: string | null;
}

export const BUDGET_SCOPE_KINDS = ['company', 'employee', 'runtime-profile', 'routine'] as const;
export type BudgetScopeKind = (typeof BUDGET_SCOPE_KINDS)[number];

export const BUDGET_POLICY_PERIODS = ['monthly'] as const;
export type BudgetPolicyPeriod = (typeof BUDGET_POLICY_PERIODS)[number];

export const BUDGET_ALERT_LEVELS = ['ok', 'warning', 'approval-required', 'exceeded'] as const;
export type BudgetAlertLevel = (typeof BUDGET_ALERT_LEVELS)[number];

export const APPROVAL_ITEM_KINDS = [
  'authority-request',
  'planner-request',
  'runtime-request',
  'routine-request',
  'budget-exception',
  'deliverable-review',
  'artifact-publish',
  /**
   * C4 (audit 2026-05-07) — write-side amber gate moved to the tool layer.
   * `delegate_subtask` no longer inserts into `tickets` directly; it parks
   * the delegation in `pending_delegations` and surfaces it here for
   * operator approval. Materialization on approve creates the actual
   * ticket and emits `task.delegated` with the full score breakdown.
   */
  'delegation-request',
] as const;
export type ApprovalItemKind = (typeof APPROVAL_ITEM_KINDS)[number];

export const APPROVAL_ITEM_STATUSES = ['pending', 'approved', 'denied', 'dismissed'] as const;
export type ApprovalItemStatus = (typeof APPROVAL_ITEM_STATUSES)[number];

export const APPROVAL_DECISION_STATUSES = ['approved', 'denied', 'dismissed'] as const;
export type ApprovalDecisionStatus = (typeof APPROVAL_DECISION_STATUSES)[number];

export const APPROVAL_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ApprovalPriority = (typeof APPROVAL_PRIORITIES)[number];

export const APPROVAL_SUBJECT_KINDS = [
  'budget-policy',
  'extension',
  'planner',
  'company',
  'employee',
  'runtime-profile',
  'routine',
  'deliverable',
  'artifact',
  /** C4 (audit 2026-05-07) — `pending_delegations` row id. */
  'pending-delegation',
] as const;
export type ApprovalSubjectKind = (typeof APPROVAL_SUBJECT_KINDS)[number];

export interface BudgetPolicy {
  id: string;
  companyId: string;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  period: BudgetPolicyPeriod;
  hardCapUsd: string;
  warningThresholdPct: number;
  autoPause: boolean;
  requireApprovalAboveUsd: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetLedgerEntry {
  id: string;
  companyId: string;
  budgetPolicyId: string | null;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  runId: string;
  runKind: 'work' | 'agentic' | 'copilot';
  threadId: string | null;
  employeeId: string;
  runtimeProfileId: string | null;
  routineId: string | null;
  provider: string;
  model: string;
  amountUsd: string;
  occurredAt: number;
  createdAt: number;
}

export interface ApprovalItem {
  id: string;
  companyId: string;
  kind: ApprovalItemKind;
  status: ApprovalItemStatus;
  priority: ApprovalPriority;
  requestedByOperatorId: string | null;
  requestedByEmployeeId: string | null;
  subjectRefKind: ApprovalSubjectKind;
  subjectRefId: string;
  summary: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
  resolvedAt: number | null;
  latestDecision?: ApprovalDecision | null;
}

export interface ApprovalDecision {
  id: string;
  companyId: string;
  approvalKind: ApprovalItemKind;
  approvalRefId: string;
  decision: ApprovalDecisionStatus;
  decidedByOperatorId: string | null;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

export interface BudgetPolicySummary extends BudgetPolicy {
  currentSpendUsd: string;
  remainingUsd: string;
  warningSpendUsd: string;
  approvalSpendUsd: string | null;
  alertLevel: BudgetAlertLevel;
}

export interface BudgetProviderMixRow {
  provider: string;
  amountUsd: string;
}

export interface BudgetOverview {
  companyId: string;
  period: BudgetPolicyPeriod;
  periodStartAt: number;
  periodEndAt: number;
  companySpendUsd: string;
  activePolicyCount: number;
  warningCount: number;
  exceededCount: number;
  pendingApprovalCount: number;
  providerMix: BudgetProviderMixRow[];
  policySummaries: BudgetPolicySummary[];
}

export const ARTIFACT_RECORD_KINDS = [
  'ticket-output',
  'approval-record',
  'vault-file',
  'runtime-output',
] as const;
export type ArtifactRecordKind = (typeof ARTIFACT_RECORD_KINDS)[number];

export const ARTIFACT_SOURCE_KINDS = [
  'routine-run',
  'approval-decision',
  'vault-file',
  'runtime-execution',
] as const;
export type ArtifactSourceKind = (typeof ARTIFACT_SOURCE_KINDS)[number];

export const ARTIFACT_OUTCOME_KINDS = [
  'artifact-created',
  'approval-complete',
  'report-generated',
  'publish-pending',
  'publish-complete',
] as const;
export type ArtifactOutcomeKind = (typeof ARTIFACT_OUTCOME_KINDS)[number];

export const ARTIFACT_STATUSES = ['ready', 'pending'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export interface ArtifactRecord {
  id: string;
  companyId: string;
  kind: ArtifactRecordKind;
  outcomeKind: ArtifactOutcomeKind;
  status: ArtifactStatus;
  title: string;
  summary: string | null;
  sourceKind: ArtifactSourceKind;
  sourceRefId: string;
  ticketId: string | null;
  fileId: string | null;
  approvalItemId: string | null;
  approvalDecisionId: string | null;
  uri: string | null;
  preview: Record<string, unknown> | null;
  createdByEmployeeId: string | null;
  createdByRoutineId: string | null;
  approvedByOperatorId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const THREAD_DIGEST_FRESHNESS_STATES = ['fresh', 'stale', 'degraded'] as const;
export type ThreadDigestFreshnessState = (typeof THREAD_DIGEST_FRESHNESS_STATES)[number];

export interface ThreadDigestPinnedFact {
  id: string;
  fact: string;
  sourceMessageId: string | null;
}

export interface ThreadDigest {
  id: string;
  companyId: string;
  threadId: string;
  summary: string;
  pinnedFacts: ThreadDigestPinnedFact[];
  lastSummarizedMessageId: string | null;
  estimatedTokens: number;
  freshness: ThreadDigestFreshnessState;
  createdAt: number;
  updatedAt: number;
}

export const RUN_CHECKPOINT_KINDS = [
  'manual',
  'completion',
  'stopped',
  'timeout',
  'approval-blocked',
  'budget-blocked',
  'routine-completed',
] as const;
export type RunCheckpointKind = (typeof RUN_CHECKPOINT_KINDS)[number];

export const RUN_CHECKPOINT_RESUMABLE_KINDS = [
  'stopped',
  'timeout',
  'approval-blocked',
  'budget-blocked',
] as const satisfies readonly RunCheckpointKind[];
export type RunCheckpointResumableKind = (typeof RUN_CHECKPOINT_RESUMABLE_KINDS)[number];

export const RUN_CHECKPOINT_BLOCKER_KINDS = [
  'approval',
  'budget',
  'authority',
  'provider',
  'dependency',
  'operator',
  'other',
] as const;
export type RunCheckpointBlockerKind = (typeof RUN_CHECKPOINT_BLOCKER_KINDS)[number];

export interface RunCheckpointBlocker {
  kind: RunCheckpointBlockerKind;
  refId: string | null;
  summary: string;
}

export interface RunCheckpointResumeOrigin {
  checkpointId: string;
  checkpointKind: RunCheckpointResumableKind;
  createdAt: number | null;
}

export interface RunCheckpoint {
  id: string;
  companyId: string;
  threadId: string;
  runId: string | null;
  employeeId: string | null;
  checkpointKind: RunCheckpointKind;
  objective: string | null;
  progressSummary: string;
  blockers: RunCheckpointBlocker[];
  nextAction: string | null;
  activeArtifactRefs: string[];
  unresolvedApprovalRefs: string[];
  resumeOrigin: RunCheckpointResumeOrigin | null;
  createdAt: number;
}

export const CONTEXT_TURN_ROLES = ['system', 'user', 'assistant'] as const;
export type ContextTurnRole = (typeof CONTEXT_TURN_ROLES)[number];

export interface ContextTurn {
  messageId: string | null;
  role: ContextTurnRole;
  authorId: string;
  authorKind: AuthorKind;
  content: string;
  createdAt: number;
  estimatedTokens: number;
}

export const CONTEXT_BLOCK_KINDS = [
  'ticket',
  'digest',
  'checkpoint',
  'project',
  'goal',
  'approval',
  'company',
  'routine',
  'artifact',
  'retrieval',
] as const;
export type ContextBlockKind = (typeof CONTEXT_BLOCK_KINDS)[number];

export const CONTEXT_BLOCK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type ContextBlockPriority = (typeof CONTEXT_BLOCK_PRIORITIES)[number];

export interface AssembledContextBlock {
  id: string;
  kind: ContextBlockKind;
  priority: ContextBlockPriority;
  title: string;
  body: string;
  estimatedTokens: number;
  sourceRefId: string | null;
  sourceLabel: string | null;
  metadata: Record<string, unknown>;
}

export interface AssembledThreadContext {
  companyId: string;
  threadId: string;
  generatedAt: number;
  recentTurns: ContextTurn[];
  blocks: AssembledContextBlock[];
  retrievalQueries: string[];
}

export interface PackedContextTurn extends ContextTurn {
  truncated: boolean;
}

export interface PackedContextBlock extends AssembledContextBlock {
  renderedText: string;
  tokenCount: number;
  truncated: boolean;
}

export const CONTEXT_DROP_REASONS = ['budget', 'category-cap'] as const;
export type ContextDropReason = (typeof CONTEXT_DROP_REASONS)[number];

export interface ContextDrop {
  blockId: string;
  kind: ContextBlockKind;
  priority: ContextBlockPriority;
  estimatedTokens: number;
  reason: ContextDropReason;
}

export interface PackedThreadContext {
  companyId: string;
  threadId: string;
  generatedAt: number;
  targetTokenBudget: number;
  usedTokens: number;
  recentTurnTokens: number;
  blockTokens: number;
  retrievalTokens: number;
  packedTurns: PackedContextTurn[];
  systemAddendum: string;
  includedBlocks: PackedContextBlock[];
  droppedBlocks: ContextDrop[];
  retrievalQueries: string[];
  resumeOrigin: RunCheckpointResumeOrigin | null;
}

export const EXTENSIONS_AUTONOMY_MODES = ['balanced', 'conservative', 'autonomous'] as const;
export type ExtensionsAutonomyMode = (typeof EXTENSIONS_AUTONOMY_MODES)[number];

export const EXTENSION_KINDS = ['skill', 'mcp'] as const;
export type ExtensionKind = (typeof EXTENSION_KINDS)[number];

export const EXTENSION_SOURCE_KINDS = [
  'local',
  'github',
  'url',
  'marketplace',
  'template',
] as const;
export type ExtensionSourceKind = (typeof EXTENSION_SOURCE_KINDS)[number];

export const EXTENSION_TRUST_STATES = ['trusted', 'pending-review', 'denied'] as const;
export type ExtensionTrustState = (typeof EXTENSION_TRUST_STATES)[number];

export const SKILL_ASSIGNMENT_SOURCES = ['workspace-default', 'employee-override'] as const;
export type SkillAssignmentSource = (typeof SKILL_ASSIGNMENT_SOURCES)[number];

export const AUTHORITY_SCOPE_KINDS = ['company', 'employee', 'extension'] as const;
export type AuthorityScopeKind = (typeof AUTHORITY_SCOPE_KINDS)[number];

export const AUTHORITY_RESOURCE_KINDS = ['capability', 'path'] as const;
export type AuthorityResourceKind = (typeof AUTHORITY_RESOURCE_KINDS)[number];

export const AUTHORITY_PERMISSIONS = ['allow', 'deny', 'prompt'] as const;
export type AuthorityPermission = (typeof AUTHORITY_PERMISSIONS)[number];

export const AUTHORITY_REQUEST_STATUSES = ['pending', 'approved', 'denied'] as const;
export type AuthorityRequestStatus = (typeof AUTHORITY_REQUEST_STATUSES)[number];

export interface ExtensionSummary {
  id: string;
  kind: ExtensionKind;
  companyId: string | null;
  name: string;
  slug: string;
  sourceKind: ExtensionSourceKind;
  sourceRef: string;
  version: string | null;
  updateChannel: string | null;
  manifest: Record<string, unknown> | null;
  requestedCapabilities: string[];
  requestedPaths: string[];
  enabled: boolean;
  trustState: ExtensionTrustState;
  runtimeRefId: string | null;
  installedAt: number;
  updatedAt: number;
}

export interface SkillAssignment {
  id: string;
  extensionId: string;
  companyId: string;
  employeeId: string | null;
  enabled: boolean;
  source: SkillAssignmentSource;
  createdAt: number;
  updatedAt: number;
}

export interface AuthorityGrant {
  id: string;
  scopeKind: AuthorityScopeKind;
  scopeId: string;
  resourceKind: AuthorityResourceKind;
  resourceId: string;
  permission: AuthorityPermission;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthorityRequest {
  id: string;
  extensionId: string;
  employeeId: string | null;
  resourceKind: AuthorityResourceKind;
  resourceId: string;
  requestedPermission: AuthorityPermission;
  status: AuthorityRequestStatus;
  reason: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

export type EffectiveAuthoritySourceKind =
  | 'role-default'
  | 'extension'
  | 'company'
  | 'employee'
  | 'hard-deny';

export interface EffectiveAuthorityEntry {
  resourceKind: AuthorityResourceKind;
  resourceId: string;
  permission: AuthorityPermission;
  sourceKind: EffectiveAuthoritySourceKind;
  sourceId: string;
}

export interface EffectiveAuthoritySnapshot {
  companyId: string;
  employeeId: string;
  entries: EffectiveAuthorityEntry[];
  toolsAllowed: string[];
  toolsDenied: string[];
}

export interface Employee {
  id: string;
  companyId: string;
  rolePackId?: string;
  roleId: string;
  roleMdSha: string;
  level: string;
  name: string;
  title: string;
  status: EmployeeStatus;
  modelPref?: string;
  providerPref?: string;
  avatar?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorKind: AuthorKind;
  content: string;
  createdAt: number;
  /** True when the message was sent by an agent to another agent. */
  isAgentInitiated?: boolean;
}

export type ThreadKind = 'dm' | 'group' | 'meeting' | 'ticket' | 'broadcast';

export interface ThreadMember {
  memberId: string;
  memberKind: 'user' | 'employee';
  roleInThread?: string | null;
}

export interface Thread {
  id: string;
  companyId: string;
  kind: ThreadKind;
  subject: string | null;
  createdBy: string;
  createdAt: number;
  members: ThreadMember[];
  lastMessageAt: number | null;
  /**
   * True when at least one employee member of this thread is a system
   * pseudo-employee (`is_system = 1`). Computed by the `chat.listThreads`
   * IPC handler so the renderer can surface system-agent threads (e.g.,
   * the agentic-loop "Copilot Conversations" section) without having to
   * look up each member against the visible-employees list — which
   * excludes system pseudo-employees by design.
   *
   * Absent on threads returned from legacy endpoints that pre-date the
   * M31 system-agent pseudo-employee seam; always present as a boolean
   * from `chat.listThreads` responses emitted in M31+ builds.
   *
   * Phase 5 — M31.
   */
  isSystemAgent?: boolean;
}

export const COMPANY_PACKAGE_MODES = ['workspace-export', 'template'] as const;
export type CompanyPackageMode = (typeof COMPANY_PACKAGE_MODES)[number];

export const COMPANY_PACKAGE_SECTIONS = [
  'company',
  'employees',
  'org',
  'autonomy',
  'extensions',
  'projects',
  'goals',
  'tickets',
  'starter-assets',
] as const;
export type CompanyPackageSection = (typeof COMPANY_PACKAGE_SECTIONS)[number];

export interface CompanyPackageManifest {
  packageId: string;
  packageVersion: number;
  mode: CompanyPackageMode;
  workspaceOriginId: string;
  companyOriginId: string;
  sourceAppVersion: string;
  exportedAt: string;
  exportedByOperatorId: string | null;
  sharingMode: OperatorAuthMode;
  sections: CompanyPackageSection[];
  redactions: string[];
  compatibility: string[];
}

export interface CompanyPackageCompanySnapshot {
  name: string;
  slug: string;
  icon: string | null;
  theme: string;
  settings: CompanySettings;
}

export interface CompanyPackageStarterAsset {
  id: string;
  name: string;
  mimeType: string | null;
  relativePath: string;
  sha256: string | null;
}

export interface CompanyPackageOrgEdge {
  managerId: string;
  reportId: string;
}

export interface CompanyPackageProjectTicketLink {
  projectId: string;
  ticketId: string;
}

export interface CompanyPackageAutonomySnapshot {
  runtimeProfiles?: RuntimeProfileSummary[];
  routines?: Routine[];
  budgetPolicies?: BudgetPolicy[];
}

export interface CompanyPackageExtensionsSnapshot {
  extensions?: ExtensionSummary[];
  authorityGrants?: AuthorityGrant[];
  skillAssignments?: SkillAssignment[];
}

export interface CompanyPackage {
  manifest: CompanyPackageManifest;
  company: CompanyPackageCompanySnapshot;
  employees?: Employee[];
  orgEdges?: CompanyPackageOrgEdge[];
  projectTicketLinks?: CompanyPackageProjectTicketLink[];
  autonomy?: CompanyPackageAutonomySnapshot;
  extensions?: CompanyPackageExtensionsSnapshot;
  goals?: Goal[];
  projects?: Project[];
  tickets?: Ticket[];
  starterAssets?: CompanyPackageStarterAsset[];
}

export const COMPANY_PACKAGE_SOURCE_KINDS = ['local-path', 'github'] as const;
export type CompanyPackageSourceKind = (typeof COMPANY_PACKAGE_SOURCE_KINDS)[number];

export interface CompanyPackageSourceRef {
  kind: CompanyPackageSourceKind;
  input: string;
  resolvedRef: string;
  packagePath?: string;
  url?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
}

export const COMPANY_PACKAGE_IMPORT_PLAN_ACTIONS = ['create', 'rename', 'skip', 'replace'] as const;
export type CompanyPackageImportPlanAction = (typeof COMPANY_PACKAGE_IMPORT_PLAN_ACTIONS)[number];

export type CompanyPackageImportPlanSection =
  | CompanyPackageSection
  | 'budget-policies'
  | 'runtime-bindings'
  | 'secret-bindings'
  | 'template-library';

export interface CompanyPackageImportPlanItem {
  id: string;
  section: CompanyPackageImportPlanSection;
  action: CompanyPackageImportPlanAction;
  label: string;
  detail: string;
  count?: number;
  blocking?: boolean;
}

export interface CompanyPackageImportPlan {
  source: CompanyPackageSourceRef;
  items: CompanyPackageImportPlanItem[];
  totals: Record<CompanyPackageImportPlanAction, number>;
  canImport: boolean;
  canInstallTemplate: boolean;
}

export type CompanyPackageMissingSecretSource = 'runtime-secret-ref' | 'redacted-field';

export interface CompanyPackageMissingSecretRef {
  id: string;
  path: string;
  label: string;
  source: CompanyPackageMissingSecretSource;
  providerId?: string;
  key?: string;
  bindable: boolean;
}

export interface CompanyPackageSecretBinding {
  providerId: string;
  key: 'apiKey';
  value: string;
}

export interface CompanyImportPreview {
  manifest: CompanyPackageManifest;
  warnings: string[];
  missingSecrets: string[];
  missingSecretRefs?: CompanyPackageMissingSecretRef[];
  suggestedCompanyName: string;
  suggestedSlug: string;
  runtimeProfileCount?: number;
  runtimeProfileKinds?: RuntimeProfileKind[];
  runtimeTemplateNotes?: string[];
  plan?: CompanyPackageImportPlan;
  source?: CompanyPackageSourceRef;
}

export interface CompanyTemplateSummary {
  packagePath: string;
  manifest: CompanyPackageManifest;
  company: CompanyPackageCompanySnapshot;
  employeeCount: number;
  runtimeProfileCount: number;
  routineCount: number;
  extensionCount: number;
  starterAssetCount: number;
}

export type CompanyPackageValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isCompanyPackageMode(value: unknown): value is CompanyPackageMode {
  return typeof value === 'string' && (COMPANY_PACKAGE_MODES as readonly string[]).includes(value);
}

function isCompanyPackageSectionArray(value: unknown): value is CompanyPackageSection[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'string' &&
        (COMPANY_PACKAGE_SECTIONS as readonly string[]).includes(entry),
    )
  );
}

function isOperatorAuthMode(value: unknown): value is OperatorAuthMode {
  return typeof value === 'string' && (OPERATOR_AUTH_MODES as readonly string[]).includes(value);
}

export function isCloudWorkspaceLinkState(value: unknown): value is CloudWorkspaceLinkState {
  return (
    typeof value === 'string' && (CLOUD_WORKSPACE_LINK_STATES as readonly string[]).includes(value)
  );
}

export function validateCloudSyncCursorState(
  value: unknown,
): CompanyPackageValidationResult<CloudSyncCursorState> {
  if (!isPlainRecord(value)) {
    return { ok: false, error: 'cursor must be an object' };
  }
  if (!(value.outboundCursor === null || typeof value.outboundCursor === 'string')) {
    return { ok: false, error: 'cursor.outboundCursor must be a string or null' };
  }
  if (!(value.inboundCursor === null || typeof value.inboundCursor === 'string')) {
    return { ok: false, error: 'cursor.inboundCursor must be a string or null' };
  }
  return {
    ok: true,
    value: {
      outboundCursor: typeof value.outboundCursor === 'string' ? value.outboundCursor : null,
      inboundCursor: typeof value.inboundCursor === 'string' ? value.inboundCursor : null,
    },
  };
}

export function validateCloudInboundActionEnvelope(
  value: unknown,
): CompanyPackageValidationResult<CloudInboundActionEnvelope> {
  if (!isPlainRecord(value)) {
    return { ok: false, error: 'action must be an object' };
  }
  if (!isNonEmptyString(value.id)) {
    return { ok: false, error: 'action.id must be a non-empty string' };
  }
  if (!isNonEmptyString(value.companyId)) {
    return { ok: false, error: 'action.companyId must be a non-empty string' };
  }
  if (!isNonEmptyString(value.cloudWorkspaceId)) {
    return { ok: false, error: 'action.cloudWorkspaceId must be a non-empty string' };
  }
  if (
    typeof value.kind !== 'string' ||
    !(CLOUD_INBOUND_ACTION_KINDS as readonly string[]).includes(value.kind)
  ) {
    return {
      ok: false,
      error: `action.kind must be one of ${CLOUD_INBOUND_ACTION_KINDS.join(', ')}`,
    };
  }
  if (typeof value.issuedAt !== 'number' || !Number.isFinite(value.issuedAt)) {
    return { ok: false, error: 'action.issuedAt must be a finite number' };
  }
  if (
    !(
      value.issuedByOperatorId === null ||
      value.issuedByOperatorId === undefined ||
      isNonEmptyString(value.issuedByOperatorId)
    )
  ) {
    return { ok: false, error: 'action.issuedByOperatorId must be a non-empty string or null' };
  }
  if (!(value.payload === null || value.payload === undefined || isPlainRecord(value.payload))) {
    return { ok: false, error: 'action.payload must be an object or null' };
  }

  return {
    ok: true,
    value: {
      id: value.id,
      companyId: value.companyId,
      cloudWorkspaceId: value.cloudWorkspaceId,
      kind: value.kind as CloudInboundActionKind,
      issuedAt: value.issuedAt,
      issuedByOperatorId:
        typeof value.issuedByOperatorId === 'string' ? value.issuedByOperatorId : null,
      payload: isPlainRecord(value.payload) ? value.payload : null,
    },
  };
}

export function validateCompanyPackageManifest(
  value: unknown,
): CompanyPackageValidationResult<CompanyPackageManifest> {
  if (!isPlainRecord(value)) {
    return { ok: false, error: 'manifest must be an object' };
  }
  if (!isNonEmptyString(value.packageId)) {
    return { ok: false, error: 'manifest.packageId must be a non-empty string' };
  }
  if (typeof value.packageVersion !== 'number' || !Number.isInteger(value.packageVersion)) {
    return { ok: false, error: 'manifest.packageVersion must be an integer' };
  }
  if (!isCompanyPackageMode(value.mode)) {
    return {
      ok: false,
      error: `manifest.mode must be one of ${COMPANY_PACKAGE_MODES.join(', ')}`,
    };
  }
  if (!isNonEmptyString(value.workspaceOriginId)) {
    return { ok: false, error: 'manifest.workspaceOriginId must be a non-empty string' };
  }
  if (!isNonEmptyString(value.companyOriginId)) {
    return { ok: false, error: 'manifest.companyOriginId must be a non-empty string' };
  }
  if (!isNonEmptyString(value.sourceAppVersion)) {
    return { ok: false, error: 'manifest.sourceAppVersion must be a non-empty string' };
  }
  if (!isNonEmptyString(value.exportedAt)) {
    return { ok: false, error: 'manifest.exportedAt must be a non-empty string' };
  }
  if (!(value.exportedByOperatorId === null || isNonEmptyString(value.exportedByOperatorId))) {
    return {
      ok: false,
      error: 'manifest.exportedByOperatorId must be null or a non-empty string',
    };
  }
  if (!isOperatorAuthMode(value.sharingMode)) {
    return {
      ok: false,
      error: `manifest.sharingMode must be one of ${OPERATOR_AUTH_MODES.join(', ')}`,
    };
  }
  if (!isCompanyPackageSectionArray(value.sections)) {
    return {
      ok: false,
      error: `manifest.sections must only contain ${COMPANY_PACKAGE_SECTIONS.join(', ')}`,
    };
  }
  if (!isStringArray(value.redactions)) {
    return { ok: false, error: 'manifest.redactions must be a string[]' };
  }
  if (!isStringArray(value.compatibility)) {
    return { ok: false, error: 'manifest.compatibility must be a string[]' };
  }

  return {
    ok: true,
    value: value as unknown as CompanyPackageManifest,
  };
}

export function validateCompanyPackage(
  value: unknown,
): CompanyPackageValidationResult<CompanyPackage> {
  if (!isPlainRecord(value)) {
    return { ok: false, error: 'package must be an object' };
  }
  const manifestResult = validateCompanyPackageManifest(value.manifest);
  if (!manifestResult.ok) return manifestResult;
  if (!isPlainRecord(value.company)) {
    return { ok: false, error: 'package.company must be an object' };
  }
  if (!isNonEmptyString(value.company.name)) {
    return { ok: false, error: 'package.company.name must be a non-empty string' };
  }
  if (!isNonEmptyString(value.company.slug)) {
    return { ok: false, error: 'package.company.slug must be a non-empty string' };
  }
  if (!(value.company.icon === null || typeof value.company.icon === 'string')) {
    return { ok: false, error: 'package.company.icon must be null or a string' };
  }
  if (!isNonEmptyString(value.company.theme)) {
    return { ok: false, error: 'package.company.theme must be a non-empty string' };
  }
  if (!isPlainRecord(value.company.settings)) {
    return { ok: false, error: 'package.company.settings must be an object' };
  }

  return {
    ok: true,
    value: value as unknown as CompanyPackage,
  };
}
