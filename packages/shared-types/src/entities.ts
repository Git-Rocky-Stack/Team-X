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
}

export const OPERATOR_AUTH_MODES = ['local', 'invited', 'cloud'] as const;
export type OperatorAuthMode = (typeof OPERATOR_AUTH_MODES)[number];

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

export interface OperatorMembership {
  id: string;
  operatorId: string;
  companyId: string;
  role: OperatorMembershipRole;
  canApproveBudget: boolean;
  canApproveAuthority: boolean;
  canManageRoutines: boolean;
  canManageRuntimes: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface OperatorAccessEntry {
  operator: Operator;
  membership: OperatorMembership;
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

export const EXTENSIONS_AUTONOMY_MODES = [
  'balanced',
  'conservative',
  'autonomous',
] as const;
export type ExtensionsAutonomyMode = (typeof EXTENSIONS_AUTONOMY_MODES)[number];

export const EXTENSION_KINDS = ['skill', 'mcp'] as const;
export type ExtensionKind = (typeof EXTENSION_KINDS)[number];

export const EXTENSION_SOURCE_KINDS = ['local', 'github', 'marketplace', 'template'] as const;
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

export type EffectiveAuthoritySourceKind = 'role-default' | 'extension' | 'company' | 'employee' | 'hard-deny';

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
