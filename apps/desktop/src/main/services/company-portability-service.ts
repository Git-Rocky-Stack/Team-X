import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  type AuthorityGrant,
  type BudgetPolicy,
  COMPANY_PACKAGE_MODES,
  COMPANY_PACKAGE_SECTIONS,
  type CompanyImportPreview,
  type CompanyPackage,
  type CompanyPackageCompanySnapshot,
  type CompanyPackageManifest,
  type CompanyPackageMode,
  type CompanyPackageProjectTicketLink,
  type CompanyPackageSection,
  type CompanySettings,
  type CompanyTemplateSummary,
  type Employee,
  type ExtensionSummary,
  type Goal,
  type OperatorAuthMode,
  type Project,
  type Routine,
  type RuntimeProfileSummary,
  type SkillAssignment,
  type Ticket,
  validateCompanyPackage,
} from '@team-x/shared-types';
import { nanoid } from 'nanoid';

import type { BudgetPolicyRow, CreateBudgetPolicyInput } from '../db/repos/budgets.js';
import type { CompanyRow, CreateCompanyInput, UpdateCompanyInput } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type {
  AuthorityGrantRow,
  CreateAuthorityGrantInput,
  CreateExtensionInput,
  CreateSkillAssignmentInput,
  ExtensionRow,
} from '../db/repos/extensions.js';
import type { GoalRow, UpdateGoalInput } from '../db/repos/goals.js';
import type { OrgEdgeRow, SetManagerInput } from '../db/repos/orgchart.js';
import type { ProjectRow, UpdateProjectInput } from '../db/repos/projects.js';
import type { CreateRoutineInput } from '../db/repos/routines.js';
import type { CreateRuntimeProfileInput } from '../db/repos/runtime-profiles.js';
import type { TicketRow } from '../db/repos/tickets.js';
import { collectRuntimeSecretRefs, isRuntimeSecretRef } from './runtime-secret-refs.js';

export const PORTABILITY_PACKAGE_VERSION = 1;
export const PORTABILITY_REDACTED_VALUE = '__TEAMX_REDACTED__';
const COMPANY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

interface PortabilityCompaniesRepo {
  create(input: CreateCompanyInput): string;
  getById(id: string): CompanyRow | null;
  getBySlug(slug: string): CompanyRow | null;
  update(id: string, patch: UpdateCompanyInput): void;
}

interface PortabilityEmployeesRepo {
  create(input: {
    companyId: string;
    rolePackId: string;
    roleId: string;
    roleMdSha: string;
    level: string;
    name: string;
    title: string;
    status?: string;
    modelPref?: string;
    providerPref?: string;
    avatar?: string;
  }): string;
  listVisibleByCompany(companyId: string): EmployeeRow[];
}

interface PortabilityOrgEdgesRepo {
  listByCompany(companyId: string): OrgEdgeRow[];
  setManager(input: SetManagerInput): { edgeId: string; previousManagerId: string | null };
}

interface PortabilityGoalsRepo {
  create(input: {
    companyId: string;
    title: string;
    description?: string;
    status?: string;
    targetDate?: number | null;
  }): string;
  listByCompany(companyId: string): GoalRow[];
  update(id: string, input: UpdateGoalInput): void;
}

interface PortabilityProjectsRepo {
  create(input: {
    companyId: string;
    goalId?: string | null;
    title: string;
    description?: string;
    leadId?: string | null;
    priority?: string;
    status?: string;
    targetDate?: number | null;
  }): string;
  linkTicket(projectId: string, ticketId: string): void;
  listByCompany(companyId: string): ProjectRow[];
  listTickets(projectId: string): string[];
  update(id: string, input: UpdateProjectInput): void;
}

interface PortabilityTicketsRepo {
  create(input: {
    companyId: string;
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    assigneeId?: string | null;
    reporterId: string;
    reporterKind?: string;
    labelsJson?: string;
    dependenciesJson?: string;
    slaHours?: number | null;
    dueAt?: number | null;
    threadId?: string | null;
    closedAt?: number | null;
  }): string;
  listByCompany(companyId: string): TicketRow[];
}

interface PortabilityRuntimeProfilesService {
  list(companyId: string): RuntimeProfileSummary[];
}

interface PortabilityRuntimeProfilesRepo {
  create(input: CreateRuntimeProfileInput): string;
  upsertBinding(input: {
    companyId: string;
    employeeId: string;
    runtimeProfileId: string;
  }): { id: string };
}

interface PortabilityRoutineService {
  list(companyId: string): Routine[];
  start?(companyId: string): void;
}

interface PortabilityRoutinesRepo {
  create(input: CreateRoutineInput): string;
}

interface PortabilityBudgetGovernanceService {
  listPolicies(companyId: string): BudgetPolicy[];
}

interface PortabilityBudgetsRepo {
  createPolicy(input: CreateBudgetPolicyInput): string;
  listPoliciesByCompany(companyId: string): BudgetPolicyRow[];
}

interface PortabilityExtensionsRegistry {
  listByCompany(companyId: string): ExtensionRow[];
}

interface PortabilityExtensionsRepo {
  create(input: CreateExtensionInput): string;
  listByCompany(companyId: string): ExtensionRow[];
}

interface PortabilitySkillsService {
  listAssignments(companyId: string): SkillAssignment[];
}

interface PortabilitySkillAssignmentsRepo {
  create(input: CreateSkillAssignmentInput): string;
}

interface PortabilityAuthorityRepo {
  createGrant(input: CreateAuthorityGrantInput): string;
  listByCompany(companyId: string): AuthorityGrantRow[];
}

interface PortabilityOperatorAccessService {
  ensureLocalOwnerForCompany(companyId: string): { operatorId: string; membershipId: string };
}

interface EnsureSystemForCompanyResult {
  agentEmployeeId: string;
  copilotEmployeeId: string;
  agentCreated: boolean;
  copilotCreated: boolean;
}

export interface ExportCompanyPackageInput {
  companyId: string;
  mode: CompanyPackageMode;
}

export interface ExportCompanyPackageResult {
  packagePath: string;
  manifest: CompanyPackageManifest;
}

export interface ImportCompanyPackageInput {
  packagePath: string;
  name?: string;
  slug?: string;
}

export interface ImportCompanyPackageResult {
  companyId: string;
  manifest: CompanyPackageManifest;
}

export interface CompanyPortabilityServiceDeps {
  companiesRepo: PortabilityCompaniesRepo;
  employeesRepo: PortabilityEmployeesRepo;
  orgEdgesRepo: PortabilityOrgEdgesRepo;
  goalsRepo: PortabilityGoalsRepo;
  projectsRepo: PortabilityProjectsRepo;
  ticketsRepo: PortabilityTicketsRepo;
  runtimeProfilesService: PortabilityRuntimeProfilesService;
  runtimeProfilesRepo: PortabilityRuntimeProfilesRepo;
  routineService: PortabilityRoutineService;
  routinesRepo: PortabilityRoutinesRepo;
  budgetGovernanceService: PortabilityBudgetGovernanceService;
  budgetsRepo: PortabilityBudgetsRepo;
  extensionsRegistry: PortabilityExtensionsRegistry;
  extensionsRepo: PortabilityExtensionsRepo;
  skillsService: PortabilitySkillsService;
  skillAssignmentsRepo: PortabilitySkillAssignmentsRepo;
  authorityRepo: PortabilityAuthorityRepo;
  operatorAccessService: PortabilityOperatorAccessService;
  ensureSystemForCompany?: (companyId: string) => EnsureSystemForCompanyResult;
  exportRootDir: string;
  appVersion: string;
  now?: () => Date;
}

interface ImportedIdMaps {
  employees: Map<string, string>;
  goals: Map<string, string>;
  projects: Map<string, string>;
  tickets: Map<string, string>;
  runtimeProfiles: Map<string, string>;
  routines: Map<string, string>;
  extensions: Map<string, string>;
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON. Portability fails soft to null at the edge.
  }
  return null;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    // Fall through to the empty-array fallback.
  }
  return [];
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveFieldKey(key: string): boolean {
  const normalized = normalizeSecretKey(key);
  if (
    normalized === 'apikey' ||
    normalized === 'accesstoken' ||
    normalized === 'bearertoken' ||
    normalized === 'token' ||
    normalized === 'secret' ||
    normalized === 'password' ||
    normalized === 'authorization' ||
    normalized === 'authheader' ||
    normalized === 'headers' ||
    normalized === 'cookie' ||
    normalized === 'cookies' ||
    normalized === 'env'
  ) {
    return true;
  }
  return (
    normalized.endsWith('apikey') ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password')
  );
}

function sanitizePortableValue(value: unknown, path: string, redactions: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizePortableValue(entry, `${path}[${index}]`, redactions),
    );
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length > 0 ? `${path}.${key}` : key;
    if (isSensitiveFieldKey(key)) {
      redactions.add(childPath);
      next[key] = PORTABILITY_REDACTED_VALUE;
      continue;
    }
    next[key] = sanitizePortableValue(child, childPath, redactions);
  }
  return next;
}

function isPortableRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizeRuntimeConfigValue(
  value: unknown,
  path: string,
  redactions: Set<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizeRuntimeConfigValue(entry, `${path}[${index}]`, redactions),
    );
  }
  if (isRuntimeSecretRef(value)) {
    return value;
  }
  if (!isPortableRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length > 0 ? `${path}.${key}` : key;
    const normalizedKey = normalizeSecretKey(key);
    if (normalizedKey === 'env' && isPortableRecord(child)) {
      next[key] = sanitizeRuntimeConfigValue(child, childPath, redactions);
      continue;
    }
    if (isRuntimeSecretRef(child)) {
      next[key] = child;
      continue;
    }
    if (isSensitiveFieldKey(key)) {
      redactions.add(childPath);
      next[key] = PORTABILITY_REDACTED_VALUE;
      continue;
    }
    next[key] = sanitizeRuntimeConfigValue(child, childPath, redactions);
  }
  return next;
}

function parseCompanySettings(row: CompanyRow): CompanySettings {
  return (parseJsonRecord(row.settingsJson) as CompanySettings | null) ?? {};
}

function sanitizeCompanySettings(
  settings: CompanySettings,
  redactions: Set<string>,
): CompanySettings {
  const cloned =
    (sanitizePortableValue(settings, 'company.settings', redactions) as CompanySettings) ?? {};
  if (!cloned.sharing) return cloned;
  if (cloned.sharing.lastExportedAt !== undefined) {
    cloned.sharing.lastExportedAt = undefined;
    redactions.add('company.settings.sharing.lastExportedAt');
  }
  if (cloned.sharing.lastExportMode !== undefined) {
    cloned.sharing.lastExportMode = undefined;
    redactions.add('company.settings.sharing.lastExportMode');
  }
  if (Object.keys(cloned.sharing).length === 0) {
    cloned.sharing = undefined;
  }
  return cloned;
}

function rowToCompanySnapshot(
  row: CompanyRow,
  settings: CompanySettings,
): CompanyPackageCompanySnapshot {
  return {
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    theme: row.theme,
    settings,
  };
}

function rowToEmployee(row: EmployeeRow): Employee {
  const employee: Employee = {
    id: row.id,
    companyId: row.companyId,
    rolePackId: row.rolePackId,
    roleId: row.roleId,
    roleMdSha: row.roleMdSha,
    level: row.level,
    name: row.name,
    title: row.title,
    status: row.status as Employee['status'],
    createdAt: row.createdAt,
  };
  if (row.modelPref !== null) employee.modelPref = row.modelPref;
  if (row.providerPref !== null) employee.providerPref = row.providerPref;
  if (row.avatar !== null) employee.avatar = row.avatar;
  return employee;
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status as Goal['status'],
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
    status: row.status as Project['status'],
    leadId: row.leadId,
    priority: row.priority as Project['priority'],
    targetDate: row.targetDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status as Ticket['status'],
    priority: row.priority as Ticket['priority'],
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    reporterKind: row.reporterKind as Ticket['reporterKind'],
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

function rowToExtensionSummary(row: ExtensionRow): ExtensionSummary {
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
    manifest: parseJsonRecord(row.manifestJson),
    requestedCapabilities: parseStringArray(row.requestedCapabilitiesJson),
    requestedPaths: parseStringArray(row.requestedPathsJson),
    enabled: row.enabled,
    trustState: row.trustState as ExtensionSummary['trustState'],
    runtimeRefId: row.runtimeRefId,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

function rowToAuthorityGrant(row: AuthorityGrantRow): AuthorityGrant {
  return {
    id: row.id,
    scopeKind: row.scopeKind as AuthorityGrant['scopeKind'],
    scopeId: row.scopeId,
    resourceKind: row.resourceKind as AuthorityGrant['resourceKind'],
    resourceId: row.resourceId,
    permission: row.permission as AuthorityGrant['permission'],
    metadata: parseJsonRecord(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sanitizeExtensionSummary(
  extension: ExtensionSummary,
  redactions: Set<string>,
  compatibility: Set<string>,
): ExtensionSummary {
  const manifest = extension.manifest
    ? (sanitizePortableValue(
        extension.manifest,
        `extensions.${extension.id}.manifest`,
        redactions,
      ) as Record<string, unknown>)
    : null;
  if (manifest && 'snapshotDir' in manifest) {
    manifest.snapshotDir = undefined;
    redactions.add(`extensions.${extension.id}.manifest.snapshotDir`);
  }
  if (manifest && 'runtimeServerId' in manifest) {
    manifest.runtimeServerId = undefined;
    redactions.add(`extensions.${extension.id}.manifest.runtimeServerId`);
  }

  if (extension.kind === 'skill') {
    compatibility.add('skill-manifests-do-not-embed-local-prompt-snapshots');
    if (extension.sourceKind === 'local') {
      compatibility.add('local-skills-may-require-manual-reinstall');
    }
  }
  if (extension.kind === 'mcp' && extension.sourceKind !== 'template') {
    compatibility.add('mcp-runtime-launchers-may-require-manual-reconfiguration');
  }

  return {
    ...extension,
    manifest,
  };
}

function sanitizeAuthorityGrant(grant: AuthorityGrant, redactions: Set<string>): AuthorityGrant {
  return {
    ...grant,
    metadata: grant.metadata
      ? (sanitizePortableValue(
          grant.metadata,
          `authorityGrants.${grant.id}.metadata`,
          redactions,
        ) as Record<string, unknown>)
      : null,
  };
}

function sanitizeRuntimeProfile(
  profile: RuntimeProfileSummary,
  mode: CompanyPackageMode,
  redactions: Set<string>,
  compatibility: Set<string>,
): RuntimeProfileSummary {
  const config = profile.config
    ? (sanitizeRuntimeConfigValue(
        profile.config,
        `runtimeProfiles.${profile.id}.config`,
        redactions,
      ) as Record<string, unknown>)
    : null;

  const command = typeof profile.config?.command === 'string' ? profile.config.command : null;
  const workingDirectory =
    typeof profile.config?.workingDirectory === 'string' ? profile.config.workingDirectory : null;
  if ((command && isAbsolute(command)) || (workingDirectory && isAbsolute(workingDirectory))) {
    compatibility.add('native-runtime-paths-may-require-manual-reconfiguration');
  }

  return {
    ...profile,
    config,
    lastHealthStatus: mode === 'template' ? 'unknown' : profile.lastHealthStatus,
    lastHealthMessage: mode === 'template' ? null : profile.lastHealthMessage,
    lastValidatedAt: mode === 'template' ? null : profile.lastValidatedAt,
  };
}

function sanitizeRoutine(routine: Routine, mode: CompanyPackageMode): Routine {
  if (mode !== 'template') return routine;
  return {
    ...routine,
    lastRunStatus: 'never',
    lastRunMessage: null,
    lastRunAt: null,
    nextRunAt: null,
  };
}

function normalizeEmployeeForMode(employee: Employee, mode: CompanyPackageMode): Employee {
  if (mode !== 'template') return employee;
  return {
    ...employee,
    status: 'idle',
  };
}

function deriveSections(packageData: CompanyPackage): CompanyPackageSection[] {
  const included = new Set<CompanyPackageSection>(['company']);
  if (packageData.employees && packageData.employees.length > 0) included.add('employees');
  if (packageData.orgEdges && packageData.orgEdges.length > 0) included.add('org');
  if (
    packageData.autonomy &&
    ((packageData.autonomy.runtimeProfiles?.length ?? 0) > 0 ||
      (packageData.autonomy.routines?.length ?? 0) > 0 ||
      (packageData.autonomy.budgetPolicies?.length ?? 0) > 0)
  ) {
    included.add('autonomy');
  }
  if (
    packageData.extensions &&
    ((packageData.extensions.extensions?.length ?? 0) > 0 ||
      (packageData.extensions.authorityGrants?.length ?? 0) > 0 ||
      (packageData.extensions.skillAssignments?.length ?? 0) > 0)
  ) {
    included.add('extensions');
  }
  if (packageData.projects && packageData.projects.length > 0) included.add('projects');
  if (packageData.goals && packageData.goals.length > 0) included.add('goals');
  if (packageData.tickets && packageData.tickets.length > 0) included.add('tickets');
  if (packageData.starterAssets && packageData.starterAssets.length > 0)
    included.add('starter-assets');
  return COMPANY_PACKAGE_SECTIONS.filter((section) => included.has(section));
}

function exportFileName(slug: string, mode: CompanyPackageMode, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const flavor = mode === 'template' ? 'template' : 'workspace';
  return `${slug}-${flavor}-${timestamp}.teamx-package.json`;
}

async function uniquePackagePath(directory: string, fileName: string): Promise<string> {
  const extension = '.teamx-package.json';
  const entries = new Set(await readdir(directory));
  if (!entries.has(fileName)) {
    return join(directory, fileName);
  }
  const stem = fileName.endsWith(extension) ? fileName.slice(0, -extension.length) : fileName;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!entries.has(candidate)) {
      return join(directory, candidate);
    }
  }
  throw new Error(`[portability] unable to allocate a unique package filename for "${fileName}"`);
}

function portabilityLibraryDir(exportRootDir: string): string {
  return resolve(exportRootDir);
}

function templateLibraryDir(exportRootDir: string): string {
  return join(portabilityLibraryDir(exportRootDir), 'templates');
}

function exportDestinationDir(exportRootDir: string, mode: CompanyPackageMode): string {
  return mode === 'template'
    ? templateLibraryDir(exportRootDir)
    : portabilityLibraryDir(exportRootDir);
}

function nextSharingSettings(
  settings: CompanySettings,
  exportedAt: string,
  mode: CompanyPackageMode,
): CompanySettings {
  const next = { ...settings };
  next.sharing = {
    ...(next.sharing ?? {
      mode: 'local' as OperatorAuthMode,
      readiness: 'ready',
    }),
    lastExportedAt: exportedAt,
    lastExportMode: mode,
  };
  return next;
}

function buildTemplateSummary(
  packagePath: string,
  packageData: CompanyPackage,
): CompanyTemplateSummary {
  return {
    packagePath,
    manifest: packageData.manifest,
    company: packageData.company,
    employeeCount: packageData.employees?.length ?? 0,
    runtimeProfileCount: packageData.autonomy?.runtimeProfiles?.length ?? 0,
    routineCount: packageData.autonomy?.routines?.length ?? 0,
    extensionCount: packageData.extensions?.extensions?.length ?? 0,
    starterAssetCount: packageData.starterAssets?.length ?? 0,
  };
}

function readPackageError(packagePath: string, reason: string): Error {
  return new Error(`[portability] ${packagePath}: ${reason}`);
}

function normalizeSlugCandidate(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function trimSlugWithSuffix(base: string, suffix: string): string {
  const cleanBase = normalizeSlugCandidate(base) || 'workspace';
  const cleanSuffix = normalizeSlugCandidate(suffix) || 'copy';
  const maxBaseLength = Math.max(1, 63 - cleanSuffix.length - 1);
  return `${cleanBase.slice(0, maxBaseLength)}-${cleanSuffix}`;
}

function suggestAvailableSlug(
  companiesRepo: Pick<PortabilityCompaniesRepo, 'getBySlug'>,
  baseSlug: string,
  mode: CompanyPackageMode,
): string {
  const normalizedBase = normalizeSlugCandidate(baseSlug) || 'workspace';
  if (!companiesRepo.getBySlug(normalizedBase)) {
    return normalizedBase;
  }
  const flavor = mode === 'template' ? 'template' : 'imported';
  const flavoredBase = trimSlugWithSuffix(normalizedBase, flavor);
  if (!companiesRepo.getBySlug(flavoredBase)) {
    return flavoredBase;
  }
  for (let index = 2; index < 1000; index += 1) {
    const candidate = trimSlugWithSuffix(normalizedBase, `${flavor}-${index}`);
    if (!companiesRepo.getBySlug(candidate)) {
      return candidate;
    }
  }
  throw new Error('[portability] unable to derive an available company slug after 999 attempts');
}

function collectMissingSecrets(packageData: CompanyPackage): string[] {
  const missing = new Set<string>();
  for (const path of packageData.manifest.redactions) {
    const parts = path.split('.');
    const lastKey = parts[parts.length - 1] ?? path;
    if (isSensitiveFieldKey(lastKey)) {
      missing.add(path);
    }
  }
  for (const profile of packageData.autonomy?.runtimeProfiles ?? []) {
    for (const entry of collectRuntimeSecretRefs(
      profile.config,
      `runtimeProfiles.${profile.id}.config`,
    )) {
      missing.add(entry.path);
    }
  }
  return Array.from(missing).sort();
}

function humanizeCompatibility(entry: string): string {
  return entry.replace(/-/g, ' ');
}

function parseMajorVersion(version: string): number | null {
  const match = /^(\d+)/.exec(version.trim());
  if (!match) return null;
  const major = match[1];
  if (!major) return null;
  return Number.parseInt(major, 10);
}

function createImportWarnings(
  packageData: CompanyPackage,
  deps: Pick<CompanyPortabilityServiceDeps, 'appVersion' | 'companiesRepo'>,
  suggestedSlug: string,
): string[] {
  const warnings: string[] = [];
  const manifest = packageData.manifest;

  if (manifest.packageVersion !== PORTABILITY_PACKAGE_VERSION) {
    warnings.push(
      `Package version ${manifest.packageVersion} differs from the supported version ${PORTABILITY_PACKAGE_VERSION}. Import may be blocked until Team-X is upgraded.`,
    );
  }

  const sourceMajor = parseMajorVersion(manifest.sourceAppVersion);
  const targetMajor = parseMajorVersion(deps.appVersion);
  if (sourceMajor !== null && targetMajor !== null && sourceMajor !== targetMajor) {
    warnings.push(
      `Package was exported from Team-X ${manifest.sourceAppVersion} while this workspace is running ${deps.appVersion}. Review runtime and extension settings after import.`,
    );
  }

  if (suggestedSlug !== normalizeSlugCandidate(packageData.company.slug)) {
    warnings.push(
      `Slug "${packageData.company.slug}" is already in use locally. Import will default to "${suggestedSlug}" unless you override it.`,
    );
  }

  if (manifest.redactions.length > 0) {
    warnings.push(
      `This package was exported with ${manifest.redactions.length} redacted fields. Reconfigure sensitive settings after import.`,
    );
  }

  if (manifest.sharingMode === 'invited') {
    warnings.push(
      'This package expects invited sharing posture. Recreate invited operator memberships after import because Team-X still bootstraps a local owner by default.',
    );
  }

  if (manifest.sharingMode === 'cloud') {
    warnings.push(
      'This package expects cloud sharing posture. Team-X will preserve that metadata, but hosted operator sync is not active yet.',
    );
  }

  for (const compatibility of manifest.compatibility) {
    warnings.push(`Compatibility note: ${humanizeCompatibility(compatibility)}.`);
  }

  if ((packageData.starterAssets?.length ?? 0) > 0) {
    warnings.push(
      `${packageData.starterAssets?.length ?? 0} starter asset(s) are preserved in package metadata but are not materialized during import yet.`,
    );
  }

  if (packageData.extensions?.extensions?.some((extension) => extension.companyId === null)) {
    warnings.push(
      'Global or template-backed extensions may need to be reinstalled locally after import.',
    );
  }

  if ((packageData.employees ?? []).some((employee) => !employee.rolePackId)) {
    warnings.push(
      'Some employees do not include role-pack metadata. Team-X will default those rows to the official role pack on import.',
    );
  }

  return warnings;
}

async function readPackageFromDisk(packagePath: string): Promise<CompanyPackage> {
  let raw: string;
  try {
    raw = await readFile(packagePath, 'utf8');
  } catch (error) {
    throw readPackageError(
      packagePath,
      `failed to read package (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw readPackageError(
      packagePath,
      `invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const validation = validateCompanyPackage(parsed);
  if (!validation.ok) {
    throw readPackageError(packagePath, `invalid Team-X package (${validation.error})`);
  }
  return validation.value;
}

async function listTemplateSummariesFromDisk(
  exportRootDir: string,
): Promise<CompanyTemplateSummary[]> {
  const libraryDir = templateLibraryDir(exportRootDir);
  await mkdir(libraryDir, { recursive: true });
  const entries = await readdir(libraryDir, { withFileTypes: true });
  const summaries: CompanyTemplateSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.teamx-package.json')) continue;
    const packagePath = join(libraryDir, entry.name);
    try {
      const packageData = await readPackageFromDisk(packagePath);
      if (packageData.manifest.mode !== 'template') continue;
      summaries.push(buildTemplateSummary(packagePath, packageData));
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[portability] skipping invalid template package at ${packagePath}:`, error);
      }
    }
  }

  return summaries.sort((left, right) =>
    right.manifest.exportedAt.localeCompare(left.manifest.exportedAt),
  );
}

function assertImportablePackage(packageData: CompanyPackage): void {
  if (!COMPANY_PACKAGE_MODES.includes(packageData.manifest.mode)) {
    throw new Error(
      `[portability] unsupported package mode "${String(packageData.manifest.mode)}"`,
    );
  }
  if (packageData.manifest.packageVersion > PORTABILITY_PACKAGE_VERSION) {
    throw new Error(
      `[portability] package version ${packageData.manifest.packageVersion} is newer than this Team-X build supports (${PORTABILITY_PACKAGE_VERSION})`,
    );
  }
  if (!packageData.manifest.sections.includes('company')) {
    throw new Error('[portability] package is missing the required company section');
  }
}

function assertTemplatePackage(packageData: CompanyPackage): void {
  assertImportablePackage(packageData);
  if (packageData.manifest.mode !== 'template') {
    throw new Error(
      `[portability] package "${packageData.manifest.packageId}" is not a template package`,
    );
  }
}

function buildImportPreview(
  packageData: CompanyPackage,
  deps: Pick<CompanyPortabilityServiceDeps, 'appVersion' | 'companiesRepo'>,
): CompanyImportPreview {
  const suggestedSlug = suggestAvailableSlug(
    deps.companiesRepo,
    packageData.company.slug,
    packageData.manifest.mode,
  );
  return {
    manifest: packageData.manifest,
    warnings: createImportWarnings(packageData, deps, suggestedSlug),
    missingSecrets: collectMissingSecrets(packageData),
    suggestedCompanyName: packageData.company.name,
    suggestedSlug,
  };
}

function assertCompanySlug(slug: string): void {
  if (!COMPANY_SLUG_RE.test(slug)) {
    throw new Error(`[portability] slug "${slug}" must match /^[a-z0-9][a-z0-9-]{0,62}$/`);
  }
}

function requireMappedId(
  map: Map<string, string>,
  originalId: string | null | undefined,
  label: string,
): string | null {
  if (!originalId) return null;
  const mapped = map.get(originalId);
  if (!mapped) {
    throw new Error(`[portability] missing imported ${label} mapping for "${originalId}"`);
  }
  return mapped;
}

function remapReporterId(
  reporterKind: Ticket['reporterKind'],
  reporterId: string,
  employeeIds: Map<string, string>,
): string {
  if (reporterKind !== 'employee') return reporterId;
  return requireMappedId(employeeIds, reporterId, 'ticket reporter') ?? reporterId;
}

function remapBudgetScopeRefId(
  policy: BudgetPolicy,
  companyId: string,
  maps: ImportedIdMaps,
): string {
  switch (policy.scopeKind) {
    case 'company':
      return companyId;
    case 'employee':
      return (
        requireMappedId(maps.employees, policy.scopeRefId, 'budget employee scope') ?? companyId
      );
    case 'runtime-profile':
      return (
        requireMappedId(maps.runtimeProfiles, policy.scopeRefId, 'budget runtime-profile scope') ??
        companyId
      );
    case 'routine':
      return requireMappedId(maps.routines, policy.scopeRefId, 'budget routine scope') ?? companyId;
    default:
      return companyId;
  }
}

export function createCompanyPortabilityService(deps: CompanyPortabilityServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async exportCompany(input: ExportCompanyPackageInput): Promise<ExportCompanyPackageResult> {
      const company = deps.companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[portability] company not found: ${input.companyId}`);
      }

      const operatorId = deps.operatorAccessService.ensureLocalOwnerForCompany(
        input.companyId,
      ).operatorId;
      const exportedAtDate = now();
      const exportedAt = exportedAtDate.toISOString();
      const redactions = new Set<string>();
      const compatibility = new Set<string>();

      const originalSettings = parseCompanySettings(company);
      const packageSettings = sanitizeCompanySettings(originalSettings, redactions);
      const companySnapshot = rowToCompanySnapshot(company, packageSettings);

      const employees = deps.employeesRepo
        .listVisibleByCompany(input.companyId)
        .map(rowToEmployee)
        .map((employee) => normalizeEmployeeForMode(employee, input.mode));
      const employeeIds = new Set(employees.map((employee) => employee.id));
      const orgEdges = deps.orgEdgesRepo
        .listByCompany(input.companyId)
        .filter((edge) => employeeIds.has(edge.managerId) && employeeIds.has(edge.reportId))
        .map((edge) => ({
          managerId: edge.managerId,
          reportId: edge.reportId,
        }));

      const runtimeProfiles = deps.runtimeProfilesService
        .list(input.companyId)
        .map((profile) => sanitizeRuntimeProfile(profile, input.mode, redactions, compatibility));
      const routines = deps.routineService
        .list(input.companyId)
        .map((routine) => sanitizeRoutine(routine, input.mode));
      const budgetPolicies = deps.budgetGovernanceService.listPolicies(input.companyId);

      const extensionSummaries = deps.extensionsRegistry
        .listByCompany(input.companyId)
        .map(rowToExtensionSummary)
        .map((extension) => sanitizeExtensionSummary(extension, redactions, compatibility));
      const authorityGrants = deps.authorityRepo
        .listByCompany(input.companyId)
        .map(rowToAuthorityGrant)
        .map((grant) => sanitizeAuthorityGrant(grant, redactions));
      const skillAssignments = deps.skillsService.listAssignments(input.companyId);

      const goals =
        input.mode === 'workspace-export'
          ? deps.goalsRepo.listByCompany(input.companyId).map(rowToGoal)
          : undefined;
      const projects =
        input.mode === 'workspace-export'
          ? deps.projectsRepo.listByCompany(input.companyId).map(rowToProject)
          : undefined;
      const projectTicketLinks =
        input.mode === 'workspace-export'
          ? (projects ?? []).flatMap<CompanyPackageProjectTicketLink>((project) =>
              deps.projectsRepo.listTickets(project.id).map((ticketId) => ({
                projectId: project.id,
                ticketId,
              })),
            )
          : undefined;
      const tickets =
        input.mode === 'workspace-export'
          ? deps.ticketsRepo.listByCompany(input.companyId).map(rowToTicket)
          : undefined;

      const packageData: CompanyPackage = {
        manifest: {
          packageId: nanoid(),
          packageVersion: PORTABILITY_PACKAGE_VERSION,
          mode: input.mode,
          workspaceOriginId: company.workspaceOriginId ?? company.id,
          companyOriginId: company.companyOriginId ?? company.id,
          sourceAppVersion: deps.appVersion,
          exportedAt,
          exportedByOperatorId: operatorId,
          sharingMode: originalSettings.sharing?.mode ?? 'local',
          sections: [],
          redactions: [],
          compatibility: [],
        },
        company: companySnapshot,
        employees,
        orgEdges,
        projectTicketLinks,
        autonomy:
          runtimeProfiles.length > 0 || routines.length > 0 || budgetPolicies.length > 0
            ? {
                runtimeProfiles,
                routines,
                budgetPolicies,
              }
            : undefined,
        extensions:
          extensionSummaries.length > 0 || authorityGrants.length > 0 || skillAssignments.length > 0
            ? {
                extensions: extensionSummaries,
                authorityGrants,
                skillAssignments,
              }
            : undefined,
        goals,
        projects,
        tickets,
      };

      packageData.manifest.sections = deriveSections(packageData);
      packageData.manifest.redactions = Array.from(redactions).sort();
      packageData.manifest.compatibility = Array.from(compatibility).sort();

      const validation = validateCompanyPackage(packageData);
      if (!validation.ok) {
        throw new Error(`[portability] assembled package is invalid: ${validation.error}`);
      }

      const destinationDir = exportDestinationDir(deps.exportRootDir, input.mode);
      await mkdir(destinationDir, { recursive: true });
      const packagePath = await uniquePackagePath(
        destinationDir,
        exportFileName(company.slug, input.mode, exportedAtDate),
      );
      await writeFile(packagePath, JSON.stringify(packageData, null, 2), 'utf8');

      deps.companiesRepo.update(company.id, {
        settings: nextSharingSettings(
          originalSettings,
          exportedAt,
          input.mode,
        ) as unknown as Record<string, unknown>,
      });

      return {
        packagePath,
        manifest: packageData.manifest,
      };
    },

    async listTemplates(): Promise<CompanyTemplateSummary[]> {
      return listTemplateSummariesFromDisk(deps.exportRootDir);
    },

    async installTemplate(input: { packagePath: string }): Promise<CompanyTemplateSummary> {
      const packageData = await readPackageFromDisk(input.packagePath);
      assertTemplatePackage(packageData);

      const libraryDir = templateLibraryDir(deps.exportRootDir);
      await mkdir(libraryDir, { recursive: true });

      const sourcePath = resolve(input.packagePath);
      const destinationPath = await uniquePackagePath(
        libraryDir,
        exportFileName(packageData.company.slug, 'template', now()),
      );

      if (sourcePath !== resolve(destinationPath)) {
        await copyFile(sourcePath, destinationPath);
      }

      return buildTemplateSummary(destinationPath, packageData);
    },

    async previewImport(input: { packagePath: string }): Promise<CompanyImportPreview> {
      const packageData = await readPackageFromDisk(input.packagePath);
      assertImportablePackage(packageData);
      return buildImportPreview(packageData, deps);
    },

    async importAsNewCompany(
      input: ImportCompanyPackageInput,
    ): Promise<ImportCompanyPackageResult> {
      const packageData = await readPackageFromDisk(input.packagePath);
      assertImportablePackage(packageData);
      const preview = buildImportPreview(packageData, deps);

      const name =
        typeof input.name === 'string' && input.name.trim().length > 0
          ? input.name.trim()
          : preview.suggestedCompanyName;
      const candidateSlug =
        typeof input.slug === 'string' && input.slug.trim().length > 0
          ? input.slug.trim()
          : preview.suggestedSlug;
      assertCompanySlug(candidateSlug);
      if (deps.companiesRepo.getBySlug(candidateSlug)) {
        throw new Error(`[portability] slug "${candidateSlug}" is already in use`);
      }

      const companyId = deps.companiesRepo.create({
        name,
        slug: candidateSlug,
        settings: packageData.company.settings as unknown as Record<string, unknown>,
        icon: packageData.company.icon ?? undefined,
        theme: packageData.company.theme,
        workspaceOriginId: packageData.manifest.workspaceOriginId,
        companyOriginId: packageData.manifest.companyOriginId,
      });

      const imported: ImportedIdMaps = {
        employees: new Map(),
        goals: new Map(),
        projects: new Map(),
        tickets: new Map(),
        runtimeProfiles: new Map(),
        routines: new Map(),
        extensions: new Map(),
      };

      for (const employee of packageData.employees ?? []) {
        const importedEmployeeId = deps.employeesRepo.create({
          companyId,
          rolePackId: employee.rolePackId ?? 'strategia-official',
          roleId: employee.roleId,
          roleMdSha: employee.roleMdSha,
          level: employee.level,
          name: employee.name,
          title: employee.title,
          status: employee.status,
          modelPref: employee.modelPref,
          providerPref: employee.providerPref,
          avatar: employee.avatar,
        });
        imported.employees.set(employee.id, importedEmployeeId);
      }

      for (const edge of packageData.orgEdges ?? []) {
        const managerId = requireMappedId(imported.employees, edge.managerId, 'org manager');
        const reportId = requireMappedId(imported.employees, edge.reportId, 'org report');
        if (!managerId || !reportId) continue;
        deps.orgEdgesRepo.setManager({
          companyId,
          managerId,
          reportId,
        });
      }

      for (const goal of packageData.goals ?? []) {
        const goalId = deps.goalsRepo.create({
          companyId,
          title: goal.title,
          description: goal.description,
          status: goal.status,
          targetDate: goal.targetDate,
        });
        deps.goalsRepo.update(goalId, {
          title: goal.title,
          description: goal.description,
          status: goal.status,
          progressPct: goal.progressPct,
          targetDate: goal.targetDate,
        });
        imported.goals.set(goal.id, goalId);
      }

      for (const project of packageData.projects ?? []) {
        const goalId = requireMappedId(imported.goals, project.goalId, 'project goal');
        const leadId = requireMappedId(imported.employees, project.leadId, 'project lead');
        const projectId = deps.projectsRepo.create({
          companyId,
          goalId,
          title: project.title,
          description: project.description,
          leadId,
          priority: project.priority,
          status: project.status,
          targetDate: project.targetDate,
        });
        deps.projectsRepo.update(projectId, {
          title: project.title,
          description: project.description,
          status: project.status,
          goalId,
          leadId,
          priority: project.priority,
          targetDate: project.targetDate,
        });
        imported.projects.set(project.id, projectId);
      }

      for (const ticket of packageData.tickets ?? []) {
        const assigneeId = requireMappedId(
          imported.employees,
          ticket.assigneeId,
          'ticket assignee',
        );
        const ticketId = deps.ticketsRepo.create({
          companyId,
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          status: ticket.status,
          assigneeId,
          reporterId: remapReporterId(ticket.reporterKind, ticket.reporterId, imported.employees),
          reporterKind: ticket.reporterKind,
          labelsJson: ticket.labelsJson,
          dependenciesJson: ticket.dependenciesJson,
          slaHours: ticket.slaHours,
          dueAt: ticket.dueAt,
          closedAt: ticket.closedAt,
        });
        imported.tickets.set(ticket.id, ticketId);
      }

      for (const link of packageData.projectTicketLinks ?? []) {
        const projectId = requireMappedId(
          imported.projects,
          link.projectId,
          'project-ticket project',
        );
        const ticketId = requireMappedId(imported.tickets, link.ticketId, 'project-ticket ticket');
        if (!projectId || !ticketId) continue;
        deps.projectsRepo.linkTicket(projectId, ticketId);
      }

      for (const runtimeProfile of packageData.autonomy?.runtimeProfiles ?? []) {
        const runtimeProfileId = deps.runtimeProfilesRepo.create({
          companyId,
          name: runtimeProfile.name,
          slug: runtimeProfile.slug,
          kind: runtimeProfile.kind,
          enabled: runtimeProfile.enabled,
          configJson: JSON.stringify(runtimeProfile.config ?? {}),
          lastHealthStatus: runtimeProfile.lastHealthStatus,
          lastHealthMessage: runtimeProfile.lastHealthMessage,
          lastValidatedAt: runtimeProfile.lastValidatedAt,
        });
        imported.runtimeProfiles.set(runtimeProfile.id, runtimeProfileId);
        for (const originalEmployeeId of runtimeProfile.boundEmployeeIds) {
          const employeeId = requireMappedId(
            imported.employees,
            originalEmployeeId,
            'runtime binding employee',
          );
          if (!employeeId) continue;
          deps.runtimeProfilesRepo.upsertBinding({
            companyId,
            employeeId,
            runtimeProfileId,
          });
        }
      }

      for (const routine of packageData.autonomy?.routines ?? []) {
        const routineId = deps.routinesRepo.create({
          companyId,
          name: routine.name,
          slug: routine.slug,
          enabled: routine.enabled,
          triggerKind: routine.triggerKind,
          scheduleJson: JSON.stringify(routine.schedule),
          workKind: routine.workKind,
          workConfigJson: JSON.stringify({
            ...routine.workConfig,
            assigneeId: requireMappedId(
              imported.employees,
              routine.workConfig.assigneeId,
              'routine assignee',
            ),
          }),
          lastRunStatus: routine.lastRunStatus,
          lastRunMessage: routine.lastRunMessage,
          lastRunAt: routine.lastRunAt,
          nextRunAt: routine.nextRunAt,
        });
        imported.routines.set(routine.id, routineId);
      }

      for (const policy of packageData.autonomy?.budgetPolicies ?? []) {
        deps.budgetsRepo.createPolicy({
          companyId,
          scopeKind: policy.scopeKind,
          scopeRefId: remapBudgetScopeRefId(policy, companyId, imported),
          period: policy.period,
          hardCapUsd: policy.hardCapUsd,
          warningThresholdPct: policy.warningThresholdPct,
          autoPause: policy.autoPause,
          requireApprovalAboveUsd: policy.requireApprovalAboveUsd,
          enabled: policy.enabled,
        });
      }

      for (const extension of packageData.extensions?.extensions ?? []) {
        if (extension.companyId === null) {
          continue;
        }
        const extensionId = deps.extensionsRepo.create({
          companyId,
          kind: extension.kind,
          name: extension.name,
          slug: extension.slug,
          sourceKind: extension.sourceKind,
          sourceRef: extension.sourceRef,
          version: extension.version,
          updateChannel: extension.updateChannel,
          manifestJson: extension.manifest ? JSON.stringify(extension.manifest) : null,
          requestedCapabilitiesJson: JSON.stringify(extension.requestedCapabilities),
          requestedPathsJson: JSON.stringify(extension.requestedPaths),
          enabled: extension.enabled,
          trustState: extension.trustState,
          runtimeRefId: requireMappedId(
            imported.runtimeProfiles,
            extension.runtimeRefId,
            'extension runtime profile',
          ),
        });
        imported.extensions.set(extension.id, extensionId);
      }

      for (const assignment of packageData.extensions?.skillAssignments ?? []) {
        const extensionId = requireMappedId(
          imported.extensions,
          assignment.extensionId,
          'skill assignment extension',
        );
        if (!extensionId) continue;
        deps.skillAssignmentsRepo.create({
          extensionId,
          companyId,
          employeeId: requireMappedId(
            imported.employees,
            assignment.employeeId,
            'skill assignment employee',
          ),
          enabled: assignment.enabled,
          source: assignment.source,
        });
      }

      for (const grant of packageData.extensions?.authorityGrants ?? []) {
        let scopeId = grant.scopeId;
        if (grant.scopeKind === 'company') {
          scopeId = companyId;
        } else if (grant.scopeKind === 'employee') {
          scopeId =
            requireMappedId(imported.employees, grant.scopeId, 'authority employee scope') ?? '';
        } else if (grant.scopeKind === 'extension') {
          scopeId =
            requireMappedId(imported.extensions, grant.scopeId, 'authority extension scope') ?? '';
        }
        if (!scopeId) continue;
        deps.authorityRepo.createGrant({
          scopeKind: grant.scopeKind,
          scopeId,
          resourceKind: grant.resourceKind,
          resourceId: grant.resourceId,
          permission: grant.permission,
          metadataJson: grant.metadata ? JSON.stringify(grant.metadata) : null,
        });
      }

      deps.operatorAccessService.ensureLocalOwnerForCompany(companyId);
      deps.ensureSystemForCompany?.(companyId);
      deps.routineService.start?.(companyId);

      return {
        companyId,
        manifest: packageData.manifest,
      };
    },
  };
}

export type CompanyPortabilityService = ReturnType<typeof createCompanyPortabilityService>;
