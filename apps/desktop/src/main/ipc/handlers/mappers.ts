/**
 * Row-to-public-shape mappers and request validators shared by the handler
 * modules, split from handlers.ts (audit 2026-10-07 P1-7).
 */

import {
  CONCURRENCY_SETTINGS_CLAMPS,
  COPILOT_CATEGORIES,
  TELEMETRY_RUN_KINDS,
} from '@team-x/shared-types';
import type {
  ActorKind,
  AuthorKind,
  AuthorityGrant,
  AuthorityRequest,
  ChatMessage,
  Company,
  CompanyPackageSecretBinding,
  CompanySettings,
  CompanyStatus,
  CopilotExportRequest,
  DashboardEvent,
  Employee,
  EmployeeStatus,
  EventType,
  ExtensionSummary,
  Goal,
  GoalStatus,
  Meeting,
  MeetingActionItem,
  MeetingMode,
  MeetingStatus,
  Project,
  ProjectPriority,
  ProjectStatus,
  ScheduleItem,
  ScheduleItemKind,
  ScheduleItemSourceKind,
  ScheduleItemStatus,
  TelemetryRunKind,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '@team-x/shared-types';

import type { CompanyRow } from '../../db/repos/companies.js';
import type { CopilotExportFilter } from '../../db/repos/copilot-insights.js';
import { COPILOT_SEVERITIES } from '../../db/repos/copilot-insights.js';
import type { EmployeeRow } from '../../db/repos/employees.js';
import type { EventRow } from '../../db/repos/events.js';
import type {
  AuthorityGrantRow,
  AuthorityRequestRow,
  ExtensionRow,
} from '../../db/repos/extensions.js';
import type { GoalRow } from '../../db/repos/goals.js';
import type { MeetingRow } from '../../db/repos/meetings.js';
import type { MessageRow } from '../../db/repos/messages.js';
import type { ProjectRow } from '../../db/repos/projects.js';
import type { ScheduleItemRow } from '../../db/repos/schedule-items.js';
import type { TicketRow } from '../../db/repos/tickets.js';

import type { IpcCompaniesRepo, IpcSecretsStore } from './deps.js';

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
export function assertCompanyActive(
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

export function assertPackageRef(
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

export function assertSecretBindings(
  bindings: unknown,
  channel: string,
): CompanyPackageSecretBinding[] {
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

export async function applySecretBindings(
  secretsStore: IpcSecretsStore,
  bindings: CompanyPackageSecretBinding[],
): Promise<void> {
  for (const binding of bindings) {
    await secretsStore.setApiKey(binding.providerId, binding.value);
  }
}

export function assertTelemetryRunKind(
  value: unknown,
  channel: string,
): TelemetryRunKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && TELEMETRY_RUN_KINDS.includes(value as TelemetryRunKind)) {
    return value as TelemetryRunKind;
  }
  throw new Error(`[ipc] ${channel}: kind must be work, agentic, or copilot`);
}

export function assertTelemetryRecentRunsLimit(value: unknown): number {
  if (value === undefined) return 6;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('[ipc] telemetry.recentRuns: limit must be an integer');
  }
  if (value < 1 || value > 12) {
    throw new Error('[ipc] telemetry.recentRuns: limit must be between 1 and 12');
  }
  return value;
}

export function assertCopilotExportRequest(req: CopilotExportRequest): CopilotExportFilter {
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

export function rowToTicket(row: TicketRow): Ticket {
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

export function rowToCompany(row: CompanyRow): Company {
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

export function rowToExtensionSummary(row: ExtensionRow): ExtensionSummary {
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

export function getManifestStringValue(
  manifest: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = manifest?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function rowToAuthorityGrant(row: AuthorityGrantRow): AuthorityGrant {
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

export function rowToAuthorityRequest(row: AuthorityRequestRow): AuthorityRequest {
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

export function rowToEmployee(row: EmployeeRow): Employee {
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

export function normalizeProfileTextField(
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

export function normalizeNullableProfileTextField(
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

export function skillSourceKindFromUrl(sourceUrl: string): 'github' | 'url' {
  try {
    const url = new URL(sourceUrl);
    return url.hostname === 'github.com' || url.hostname === 'raw.githubusercontent.com'
      ? 'github'
      : 'url';
  } catch {
    return 'url';
  }
}

export function rowToChatMessage(row: MessageRow): ChatMessage {
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

export function rowToEvent(row: EventRow): DashboardEvent {
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

export function rowToGoal(row: GoalRow): Goal {
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

export function rowToProject(row: ProjectRow): Project {
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

export const SCHEDULE_ITEM_KINDS: readonly ScheduleItemKind[] = [
  'task',
  'deadline',
  'milestone',
  'reminder',
];
export const SCHEDULE_ITEM_STATUSES: readonly ScheduleItemStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
];
export const SCHEDULE_PRIORITIES: readonly TicketPriority[] = ['low', 'medium', 'high', 'critical'];

export function rowToScheduleItem(row: ScheduleItemRow): ScheduleItem {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    kind: row.kind as ScheduleItemKind,
    status: row.status as ScheduleItemStatus,
    priority: row.priority as TicketPriority,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reminderAt: row.reminderAt,
    ticketId: row.ticketId,
    projectId: row.projectId,
    goalId: row.goalId,
    assigneeId: row.assigneeId,
    wakeupRequestId: row.wakeupRequestId,
    sourceKind: row.sourceKind as ScheduleItemSourceKind,
    sourceId: row.sourceId,
    createdById: row.createdById,
    createdByKind: row.createdByKind as AuthorKind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export function scheduleItemInRange(item: ScheduleItem, from?: number, to?: number): boolean {
  const itemEnd = item.endsAt ?? item.startsAt;
  if (typeof from === 'number' && Number.isFinite(from) && itemEnd < from) return false;
  if (typeof to === 'number' && Number.isFinite(to) && item.startsAt > to) return false;
  return true;
}

export function normalizeOptionalId(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`[ipc] schedule: ${field} must be a string or null`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeScheduleTimestamp(
  value: unknown,
  field: string,
  required: boolean,
): number | null {
  if (value === undefined || value === null) {
    if (required) throw new Error(`[ipc] schedule: ${field} is required`);
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`[ipc] schedule: ${field} must be a positive UNIX ms timestamp`);
  }
  return Math.trunc(value);
}

export function schedulePriorityWeight(priority: TicketPriority): number {
  switch (priority) {
    case 'critical':
      return 90;
    case 'high':
      return 70;
    case 'medium':
      return 50;
    case 'low':
      return 30;
  }
}

export function rowToMeeting(row: MeetingRow): Meeting {
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

export function clampConcurrencySlots(value: number): number {
  const { min, max, default: fallback } = CONCURRENCY_SETTINGS_CLAMPS.orchestratorSlots;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeConcurrencyCaps(
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

export function isUserCancelledTurnError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  if (!(err instanceof Error)) return false;
  return err.message === 'Run canceled by user';
}
