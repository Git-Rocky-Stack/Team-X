import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
  COMPANY_PACKAGE_SECTIONS,
  type AuthorityGrant,
  type BudgetPolicy,
  type CompanyPackage,
  type CompanyPackageCompanySnapshot,
  type CompanyPackageManifest,
  type CompanyPackageMode,
  type CompanyPackageSection,
  type CompanySettings,
  type Employee,
  type ExtensionSummary,
  type Goal,
  type Project,
  type Routine,
  type RuntimeProfileSummary,
  type SkillAssignment,
  type Ticket,
  type OperatorAuthMode,
  validateCompanyPackage,
} from '@team-x/shared-types';
import { nanoid } from 'nanoid';

import type { CompanyRow, UpdateCompanyInput } from '../db/repos/companies.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { AuthorityGrantRow, ExtensionRow } from '../db/repos/extensions.js';
import type { GoalRow } from '../db/repos/goals.js';
import type { OrgEdgeRow } from '../db/repos/orgchart.js';
import type { ProjectRow } from '../db/repos/projects.js';
import type { TicketRow } from '../db/repos/tickets.js';

export const PORTABILITY_PACKAGE_VERSION = 1;
export const PORTABILITY_REDACTED_VALUE = '__TEAMX_REDACTED__';

interface PortabilityCompaniesRepo {
  getById(id: string): CompanyRow | null;
  update(id: string, patch: UpdateCompanyInput): void;
}

interface PortabilityEmployeesRepo {
  listVisibleByCompany(companyId: string): EmployeeRow[];
}

interface PortabilityOrgEdgesRepo {
  listByCompany(companyId: string): OrgEdgeRow[];
}

interface PortabilityGoalsRepo {
  listByCompany(companyId: string): GoalRow[];
}

interface PortabilityProjectsRepo {
  listByCompany(companyId: string): ProjectRow[];
}

interface PortabilityTicketsRepo {
  listByCompany(companyId: string): TicketRow[];
}

interface PortabilityRuntimeProfilesService {
  list(companyId: string): RuntimeProfileSummary[];
}

interface PortabilityRoutineService {
  list(companyId: string): Routine[];
}

interface PortabilityBudgetGovernanceService {
  listPolicies(companyId: string): BudgetPolicy[];
}

interface PortabilityExtensionsRegistry {
  listByCompany(companyId: string): ExtensionRow[];
}

interface PortabilitySkillsService {
  listAssignments(companyId: string): SkillAssignment[];
}

interface PortabilityAuthorityRepo {
  listByCompany(companyId: string): AuthorityGrantRow[];
}

interface PortabilityOperatorAccessService {
  ensureLocalOwnerForCompany(companyId: string): { operatorId: string; membershipId: string };
}

export interface ExportCompanyPackageInput {
  companyId: string;
  mode: CompanyPackageMode;
}

export interface ExportCompanyPackageResult {
  packagePath: string;
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
  routineService: PortabilityRoutineService;
  budgetGovernanceService: PortabilityBudgetGovernanceService;
  extensionsRegistry: PortabilityExtensionsRegistry;
  skillsService: PortabilitySkillsService;
  authorityRepo: PortabilityAuthorityRepo;
  operatorAccessService: PortabilityOperatorAccessService;
  exportRootDir: string;
  appVersion: string;
  now?: () => Date;
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON — portability should fail soft to null here.
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

function sanitizePortableValue(
  value: unknown,
  path: string,
  redactions: Set<string>,
): unknown {
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

function parseCompanySettings(row: CompanyRow): CompanySettings {
  return (parseJsonRecord(row.settingsJson) as CompanySettings | null) ?? {};
}

function sanitizeCompanySettings(
  settings: CompanySettings,
  redactions: Set<string>,
): CompanySettings {
  const cloned = (sanitizePortableValue(settings, 'company.settings', redactions) as CompanySettings) ?? {};
  if (!cloned.sharing) return cloned;
  if (cloned.sharing.lastExportedAt !== undefined) {
    delete cloned.sharing.lastExportedAt;
    redactions.add('company.settings.sharing.lastExportedAt');
  }
  if (cloned.sharing.lastExportMode !== undefined) {
    delete cloned.sharing.lastExportMode;
    redactions.add('company.settings.sharing.lastExportMode');
  }
  if (Object.keys(cloned.sharing).length === 0) {
    delete cloned.sharing;
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
    delete manifest.snapshotDir;
    redactions.add(`extensions.${extension.id}.manifest.snapshotDir`);
  }
  if (manifest && 'runtimeServerId' in manifest) {
    delete manifest.runtimeServerId;
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

function sanitizeAuthorityGrant(
  grant: AuthorityGrant,
  redactions: Set<string>,
): AuthorityGrant {
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
    ? (sanitizePortableValue(
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
  if (packageData.starterAssets && packageData.starterAssets.length > 0) included.add('starter-assets');
  return COMPANY_PACKAGE_SECTIONS.filter((section) => included.has(section));
}

function exportFileName(slug: string, mode: CompanyPackageMode, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const flavor = mode === 'template' ? 'template' : 'workspace';
  return `${slug}-${flavor}-${timestamp}.teamx-package.json`;
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

export function createCompanyPortabilityService(
  deps: CompanyPortabilityServiceDeps,
) {
  const now = deps.now ?? (() => new Date());

  return {
    async exportCompany(input: ExportCompanyPackageInput): Promise<ExportCompanyPackageResult> {
      const company = deps.companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[portability] company not found: ${input.companyId}`);
      }

      const operatorId = deps.operatorAccessService.ensureLocalOwnerForCompany(input.companyId).operatorId;
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
        .filter(
          (edge) => employeeIds.has(edge.managerId) && employeeIds.has(edge.reportId),
        )
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

      await mkdir(deps.exportRootDir, { recursive: true });
      const packagePath = join(
        deps.exportRootDir,
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
  };
}

export type CompanyPortabilityService = ReturnType<typeof createCompanyPortabilityService>;
