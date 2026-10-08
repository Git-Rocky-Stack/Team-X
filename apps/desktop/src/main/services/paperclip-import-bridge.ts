import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type {
  CompanyImportPreview,
  CompanyPackage,
  CompanyPackageMissingSecretRef,
  CompanyPackageSection,
  Employee,
  ExtensionSummary,
  PaperclipImportBridgePreview,
  PaperclipUnsupportedAdapter,
  RuntimeProfileKind,
  RuntimeProfileSecretRef,
  RuntimeProfileSummary,
  SkillAssignment,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '@team-x/shared-types';
import { validateCompanyPackage } from '@team-x/shared-types';

import { collectRuntimeSecretRefs } from './runtime-secret-refs.js';

export interface PaperclipExportBundle {
  company?: Record<string, unknown> | null;
  agents?: unknown[];
  adapters?: unknown[];
  tasks?: unknown[];
  issues?: unknown[];
  skills?: unknown[];
  exportedAt?: string | number | null;
  sourcePath?: string | null;
}

// The preview shape moved to `@team-x/shared-types/paperclip.ts` when this
// bridge was wired to IPC: the renderer shows the operator what an import would
// produce, so both sides of the boundary need it. The raw `PaperclipExportBundle`
// deliberately did NOT move — the untyped shape of someone else's export folder
// is not something the renderer should ever reason about.
export type {
  PaperclipImportBridgePreview,
  PaperclipUnsupportedAdapter,
} from '@team-x/shared-types';

export interface PaperclipImportBridgeOptions {
  sourceAppVersion?: string;
  exportedByOperatorId?: string | null;
  now?: () => Date;
}

interface AgentRecord {
  id: string;
  name: string;
  title: string;
  roleId: string;
  level: string;
  managerId: string | null;
  providerPref: string | undefined;
  modelPref: string | undefined;
  skillIds: string[];
}

interface AdapterRecord {
  id: string;
  name: string;
  type: string;
  providerId: string;
  config: Record<string, unknown>;
  boundAgentIds: string[];
}

interface WorkRecord {
  id: string;
  kind: 'task' | 'issue';
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  labels: string[];
  dependencies: string[];
  createdAt: number;
  updatedAt: number;
}

interface SkillRecord {
  id: string;
  name: string;
  sourceRef: string;
  assignedAgentIds: string[];
}

const TEAMX_PACKAGE_VERSION = 1;
const DEFAULT_SOURCE_APP_VERSION = 'paperclip-import-bridge';
const DEFAULT_OPERATOR_ID = 'rocky';
const SECRET_REF_VERSION = 'runtime-secret-ref-v1';
const SUPPORTED_ADAPTER_KIND_BY_TYPE: Array<[RegExp, RuntimeProfileKind]> = [
  [/^(teamx|internal|teamx-internal)$/i, 'teamx-internal'],
  [/^(bash|shell|cli|command)$/i, 'bash'],
  [/^(http|webhook|hosted|hosted-bot|api)$/i, 'http'],
  [/^codex$/i, 'codex'],
  [/^(claude|claude-code)$/i, 'claude-code'],
  [/^cursor$/i, 'cursor'],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((entry) =>
          typeof entry === 'string' || typeof entry === 'number' ? String(entry) : '',
        )
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function readRecord(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return {};
}

function slugify(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return normalized || fallback;
}

function uniqueId(prefix: string, raw: string, used: Set<string>): string {
  const base = `${prefix}-${slugify(raw, 'item')}`.slice(0, 72);
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeTicketStatus(value: string): TicketStatus {
  const normalized = value.trim().toLowerCase();
  if (['in_progress', 'in-progress', 'working', 'doing', 'active'].includes(normalized)) {
    return 'in-progress';
  }
  if (['blocked', 'waiting', 'paused'].includes(normalized)) return 'blocked';
  if (['done', 'closed', 'complete', 'completed', 'resolved'].includes(normalized)) return 'done';
  return 'open';
}

function normalizeTicketPriority(value: string): TicketPriority {
  const normalized = value.trim().toLowerCase();
  if (['critical', 'urgent', 'p0'].includes(normalized)) return 'critical';
  if (['high', 'p1'].includes(normalized)) return 'high';
  if (['low', 'p3', 'backlog'].includes(normalized)) return 'low';
  return 'medium';
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalized === 'apikey' ||
    normalized === 'token' ||
    normalized === 'secret' ||
    normalized === 'password' ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password')
  );
}

function secretRef(providerId: string): RuntimeProfileSecretRef {
  return {
    type: 'secret_ref',
    providerId,
    key: 'apiKey',
    version: SECRET_REF_VERSION,
  };
}

function sanitizeAdapterValue(value: unknown, providerId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAdapterValue(entry, providerId));
  }
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      next[key] = secretRef(providerId);
      continue;
    }
    next[key] = sanitizeAdapterValue(child, providerId);
  }
  return next;
}

function adapterKind(type: string): RuntimeProfileKind | null {
  for (const [pattern, kind] of SUPPORTED_ADAPTER_KIND_BY_TYPE) {
    if (pattern.test(type)) return kind;
  }
  return null;
}

function normalizeAgents(
  rawAgents: unknown[],
  usedIds: Set<string>,
): {
  agents: AgentRecord[];
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  const agents = rawAgents.filter(isRecord).map((record, index) => {
    const originalId = readString(record, ['id', 'agentId', 'slug'], `agent-${index + 1}`);
    const name = readString(record, ['name', 'displayName'], `Paperclip Agent ${index + 1}`);
    const id = uniqueId('pc-agent', originalId || name, usedIds);
    idMap.set(originalId, id);
    return {
      id,
      name,
      title: readString(record, ['title', 'role', 'jobTitle'], 'Paperclip Agent'),
      roleId: slugify(readString(record, ['roleId', 'role', 'title'], 'operator'), 'operator'),
      level: readString(record, ['level'], 'ic'),
      managerId: readString(record, ['managerId', 'manager_id'], '') || null,
      providerPref: readString(record, ['provider', 'providerPref'], '') || undefined,
      modelPref: readString(record, ['model', 'modelPref'], '') || undefined,
      skillIds: readStringArray(record, ['skillIds', 'skills']),
    } satisfies AgentRecord;
  });
  return { agents, idMap };
}

function normalizeAdapters(rawAdapters: unknown[]): AdapterRecord[] {
  return rawAdapters.filter(isRecord).map((record, index) => {
    const id = readString(record, ['id', 'adapterId', 'slug'], `adapter-${index + 1}`);
    const name = readString(record, ['name', 'displayName'], `Paperclip Adapter ${index + 1}`);
    const type = readString(record, ['type', 'kind', 'adapterKind'], 'unknown');
    const providerId = slugify(
      readString(record, ['providerId', 'provider', 'runtimeProvider'], type),
      'paperclip',
    );
    return {
      id,
      name,
      type,
      providerId,
      config: readRecord(record, ['config', 'settings', 'adapterConfig']),
      boundAgentIds: readStringArray(record, ['agentIds', 'boundAgentIds', 'assignedAgentIds']),
    };
  });
}

function normalizeWork(rawItems: unknown[], kind: WorkRecord['kind'], now: number): WorkRecord[] {
  return rawItems.filter(isRecord).map((record, index) => {
    const id = readString(record, ['id', 'taskId', 'issueId', 'slug'], `${kind}-${index + 1}`);
    return {
      id,
      kind,
      title: readString(record, ['title', 'name', 'summary'], `${kind} ${index + 1}`),
      description: readString(record, ['description', 'body', 'details'], ''),
      status: normalizeTicketStatus(readString(record, ['status', 'state'], 'open')),
      priority: normalizeTicketPriority(readString(record, ['priority', 'severity'], 'medium')),
      assigneeId: readString(record, ['assigneeId', 'agentId', 'ownerId'], '') || null,
      labels: Array.from(
        new Set(['paperclip', kind, ...readStringArray(record, ['labels', 'tags'])]),
      ).sort(),
      dependencies: readStringArray(record, ['dependencies', 'dependencyIds', 'blockedBy']),
      createdAt: normalizeTimestamp(record.createdAt, now),
      updatedAt: normalizeTimestamp(record.updatedAt, now),
    };
  });
}

function normalizeSkills(rawSkills: unknown[]): SkillRecord[] {
  return rawSkills.filter(isRecord).map((record, index) => {
    const id = readString(record, ['id', 'skillId', 'slug'], `skill-${index + 1}`);
    return {
      id,
      name: readString(record, ['name', 'displayName'], `Paperclip Skill ${index + 1}`),
      sourceRef: readString(record, ['sourceRef', 'path', 'repo', 'url'], `paperclip:${id}`),
      assignedAgentIds: readStringArray(record, ['agentIds', 'assignedAgentIds']),
    };
  });
}

function buildRuntimeProfiles(input: {
  adapters: AdapterRecord[];
  agentIdMap: Map<string, string>;
  companyId: string;
  now: number;
}): {
  runtimeProfiles: RuntimeProfileSummary[];
  unsupportedAdapters: PaperclipUnsupportedAdapter[];
  compatibility: string[];
} {
  const usedSlugs = new Set<string>();
  const unsupportedAdapters: PaperclipUnsupportedAdapter[] = [];
  const compatibility = new Set<string>();
  const runtimeProfiles: RuntimeProfileSummary[] = [];

  for (const adapter of input.adapters) {
    const kind = adapterKind(adapter.type);
    if (!kind) {
      unsupportedAdapters.push({
        id: adapter.id,
        name: adapter.name,
        type: adapter.type,
        reason: 'No Team-X runtime profile kind maps to this Paperclip adapter type.',
      });
      compatibility.add('paperclip-unsupported-adapters-require-manual-recreation');
      continue;
    }

    const slug = uniqueId('pc-runtime', adapter.id || adapter.name, usedSlugs);
    const boundEmployeeIds = adapter.boundAgentIds
      .map((agentId) => input.agentIdMap.get(agentId))
      .filter((agentId): agentId is string => Boolean(agentId));
    const config = sanitizeAdapterValue(
      {
        ...adapter.config,
        source: {
          kind: 'paperclip-adapter',
          adapterId: adapter.id,
          adapterType: adapter.type,
        },
      },
      adapter.providerId,
    ) as Record<string, unknown>;

    if (collectRuntimeSecretRefs(config).length > 0) {
      compatibility.add('runtime-secret-refs-require-rebinding');
    }

    runtimeProfiles.push({
      id: slug,
      companyId: input.companyId,
      name: adapter.name,
      slug,
      kind,
      enabled: true,
      config,
      lastHealthStatus: 'unknown',
      lastHealthMessage: 'Imported from Paperclip export; validate before live runtime use.',
      lastValidatedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      executionMode: kind === 'http' || kind === 'teamx-internal' ? 'native' : 'planned',
      boundEmployeeIds,
      boundEmployeeCount: boundEmployeeIds.length,
    });
  }

  return {
    runtimeProfiles,
    unsupportedAdapters,
    compatibility: Array.from(compatibility).sort(),
  };
}

function collectPackageSecretRefs(packageData: CompanyPackage): CompanyPackageMissingSecretRef[] {
  return (packageData.autonomy?.runtimeProfiles ?? []).flatMap((profile) =>
    collectRuntimeSecretRefs(profile.config, `runtimeProfiles.${profile.id}.config`).map(
      ({ path, ref }) => ({
        id: `${path}:${ref.providerId}:${ref.key}`,
        path,
        label: `${profile.name}: ${ref.providerId} ${ref.key}`,
        source: 'runtime-secret-ref' as const,
        providerId: ref.providerId,
        key: ref.key,
        bindable: ref.key === 'apiKey',
      }),
    ),
  );
}

function packageSections(packageData: CompanyPackage): CompanyPackageSection[] {
  const sections = new Set<CompanyPackageSection>(['company']);
  if ((packageData.employees?.length ?? 0) > 0) sections.add('employees');
  if ((packageData.orgEdges?.length ?? 0) > 0) sections.add('org');
  if (
    (packageData.autonomy?.runtimeProfiles?.length ?? 0) > 0 ||
    (packageData.autonomy?.budgetPolicies?.length ?? 0) > 0 ||
    (packageData.autonomy?.routines?.length ?? 0) > 0
  ) {
    sections.add('autonomy');
  }
  if (
    (packageData.extensions?.extensions?.length ?? 0) > 0 ||
    (packageData.extensions?.skillAssignments?.length ?? 0) > 0
  ) {
    sections.add('extensions');
  }
  if ((packageData.tickets?.length ?? 0) > 0) sections.add('tickets');
  return Array.from(sections);
}

function buildImportPlan(
  preview: CompanyImportPreview,
  source: NonNullable<CompanyImportPreview['source']>,
) {
  const items = [
    {
      id: 'company',
      section: 'company' as const,
      action: 'create' as const,
      label: 'Create Team-X workspace from Paperclip export',
      detail: `Workspace "${preview.suggestedCompanyName}" will be created with slug "${preview.suggestedSlug}".`,
      count: 1,
    },
    {
      id: 'employees',
      section: 'employees' as const,
      action: preview.manifest.sections.includes('employees')
        ? ('create' as const)
        : ('skip' as const),
      label: 'Map Paperclip agents to Team-X employees',
      detail: 'Each Paperclip agent is recreated as a Team-X employee with local ids.',
    },
    {
      id: 'runtime-profiles',
      section: 'autonomy' as const,
      action: (preview.runtimeProfileCount ?? 0) > 0 ? ('create' as const) : ('skip' as const),
      label: 'Map Paperclip adapters to runtime profiles',
      detail: 'Supported adapters become Team-X runtime profiles and must be validated locally.',
      count: preview.runtimeProfileCount ?? 0,
    },
    {
      id: 'secret-bindings',
      section: 'secret-bindings' as const,
      action:
        (preview.missingSecretRefs?.length ?? 0) > 0 ? ('replace' as const) : ('skip' as const),
      label: 'Rebind Paperclip runtime secrets',
      detail:
        'Inline Paperclip secrets are converted to Team-X runtime secret refs and are not written into the package.',
      count: preview.missingSecretRefs?.length ?? 0,
    },
  ];
  const totals = { create: 0, rename: 0, skip: 0, replace: 0 };
  for (const item of items) {
    totals[item.action] += 1;
  }
  return {
    source,
    items,
    totals,
    canImport: true,
    canInstallTemplate: false,
  };
}

function buildSource(bundle: PaperclipExportBundle) {
  const input = bundle.sourcePath ?? 'paperclip-export';
  const resolvedRef = bundle.sourcePath ? resolve(bundle.sourcePath) : 'paperclip-export';
  return {
    kind: 'local-path' as const,
    input,
    resolvedRef,
    packagePath: bundle.sourcePath ? resolve(bundle.sourcePath) : undefined,
  };
}

export function previewPaperclipImportBridge(
  bundle: PaperclipExportBundle,
  options: PaperclipImportBridgeOptions = {},
): PaperclipImportBridgePreview {
  const nowDate = options.now?.() ?? new Date();
  const now = nowDate.getTime();
  const companyRecord = isRecord(bundle.company) ? bundle.company : {};
  const companyName = readString(
    companyRecord,
    ['name', 'companyName', 'workspaceName'],
    'Paperclip Import',
  );
  const companySlug = slugify(
    readString(companyRecord, ['slug', 'id'], companyName),
    'paperclip-import',
  );
  const companyId = `paperclip-${companySlug}`;
  const usedAgentIds = new Set<string>();
  const { agents, idMap: agentIdMap } = normalizeAgents(bundle.agents ?? [], usedAgentIds);
  const adapters = normalizeAdapters(bundle.adapters ?? []);
  const work = [
    ...normalizeWork(bundle.tasks ?? [], 'task', now),
    ...normalizeWork(bundle.issues ?? [], 'issue', now),
  ];
  const skills = normalizeSkills(bundle.skills ?? []);
  const runtime = buildRuntimeProfiles({
    adapters,
    agentIdMap,
    companyId,
    now,
  });

  const employees: Employee[] = agents.map((agent) => ({
    id: agent.id,
    companyId,
    rolePackId: 'strategia-official',
    roleId: agent.roleId,
    roleMdSha: 'paperclip-import',
    level: agent.level,
    name: agent.name,
    title: agent.title,
    status: 'idle',
    providerPref: agent.providerPref,
    modelPref: agent.modelPref,
    createdAt: now,
  }));

  const agentIds = new Set(agents.map((agent) => agent.id));
  const orgEdges = agents
    .map((agent) => {
      const managerId = agent.managerId ? agentIdMap.get(agent.managerId) : null;
      return managerId && agentIds.has(managerId) ? { managerId, reportId: agent.id } : null;
    })
    .filter((edge): edge is { managerId: string; reportId: string } => edge !== null);

  const tickets: Ticket[] = work.map((item) => {
    const assigneeId = item.assigneeId ? (agentIdMap.get(item.assigneeId) ?? null) : null;
    return {
      id: `pc-${item.kind}-${slugify(item.id, 'work')}`,
      companyId,
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      assigneeId,
      reporterId: assigneeId ?? DEFAULT_OPERATOR_ID,
      reporterKind: assigneeId ? 'employee' : 'user',
      labelsJson: JSON.stringify(item.labels),
      dependenciesJson: JSON.stringify(item.dependencies),
      slaHours: null,
      dueAt: null,
      threadId: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      closedAt: item.status === 'done' ? item.updatedAt : null,
    };
  });

  const extensions: ExtensionSummary[] = skills.map((skill) => ({
    id: `pc-skill-${slugify(skill.id, 'skill')}`,
    kind: 'skill',
    companyId,
    name: skill.name,
    slug: slugify(skill.id || skill.name, 'skill'),
    sourceKind: 'template',
    sourceRef: skill.sourceRef,
    version: null,
    updateChannel: null,
    manifest: { source: 'paperclip', originalSkillId: skill.id },
    requestedCapabilities: [],
    requestedPaths: [],
    enabled: true,
    trustState: 'pending-review',
    runtimeRefId: null,
    installedAt: now,
    updatedAt: now,
  }));
  const extensionBySkillId = new Map(skills.map((skill, index) => [skill.id, extensions[index]]));
  const skillAssignments: SkillAssignment[] = [];
  for (const skill of skills) {
    const extension = extensionBySkillId.get(skill.id);
    if (!extension) continue;
    const agentTargets =
      skill.assignedAgentIds.length > 0
        ? skill.assignedAgentIds
        : agents.filter((agent) => agent.skillIds.includes(skill.id)).map((agent) => agent.id);
    for (const originalAgentId of agentTargets) {
      const employeeId = agentIdMap.get(originalAgentId) ?? null;
      skillAssignments.push({
        id: `pc-skill-assignment-${slugify(`${skill.id}-${originalAgentId}`, 'assignment')}`,
        extensionId: extension.id,
        companyId,
        employeeId,
        enabled: true,
        source: 'employee-override',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const warnings = [
    'Paperclip imports are staged as Team-X workspace packages; review the dry-run plan before mutating local state.',
    'Imported runtime profiles keep health unknown until validated on this host.',
  ];
  if (runtime.unsupportedAdapters.length > 0) {
    warnings.push(
      `${runtime.unsupportedAdapters.length} Paperclip adapter(s) require manual recreation because Team-X has no direct runtime mapping.`,
    );
  }

  const packageData: CompanyPackage = {
    manifest: {
      packageId: `paperclip-${companySlug}-${now}`,
      packageVersion: TEAMX_PACKAGE_VERSION,
      mode: 'workspace-export',
      workspaceOriginId: readString(companyRecord, ['workspaceId', 'id'], companyId),
      companyOriginId: readString(companyRecord, ['companyId', 'id'], companyId),
      sourceAppVersion: options.sourceAppVersion ?? DEFAULT_SOURCE_APP_VERSION,
      exportedAt:
        typeof bundle.exportedAt === 'string'
          ? bundle.exportedAt
          : typeof bundle.exportedAt === 'number'
            ? new Date(bundle.exportedAt).toISOString()
            : nowDate.toISOString(),
      exportedByOperatorId: options.exportedByOperatorId ?? DEFAULT_OPERATOR_ID,
      sharingMode: 'local',
      sections: [],
      redactions: [],
      compatibility: runtime.compatibility,
    },
    company: {
      name: companyName,
      slug: companySlug,
      icon: null,
      theme: readString(companyRecord, ['theme'], 'dark'),
      settings: {
        sharing: {
          mode: 'local',
          readiness: runtime.unsupportedAdapters.length > 0 ? 'warning' : 'ready',
          missingRequirements: runtime.unsupportedAdapters.map(
            (adapter) => `Recreate unsupported Paperclip adapter "${adapter.name}".`,
          ),
        },
      },
    },
    employees,
    orgEdges,
    autonomy:
      runtime.runtimeProfiles.length > 0
        ? {
            runtimeProfiles: runtime.runtimeProfiles,
          }
        : undefined,
    extensions:
      extensions.length > 0 || skillAssignments.length > 0
        ? {
            extensions,
            skillAssignments,
          }
        : undefined,
    tickets,
  };
  packageData.manifest.sections = packageSections(packageData);

  const validation = validateCompanyPackage(packageData);
  if (!validation.ok) {
    throw new Error(`[paperclip-import] generated Team-X package is invalid: ${validation.error}`);
  }

  const missingSecretRefs = collectPackageSecretRefs(packageData);
  const source = buildSource(bundle);
  const importPreview: CompanyImportPreview = {
    manifest: packageData.manifest,
    warnings,
    missingSecrets: missingSecretRefs.map((entry) => entry.path),
    missingSecretRefs,
    suggestedCompanyName: companyName,
    suggestedSlug: companySlug,
    runtimeProfileCount: runtime.runtimeProfiles.length,
    runtimeProfileKinds: Array.from(
      new Set(runtime.runtimeProfiles.map((profile) => profile.kind)),
    ),
    runtimeTemplateNotes: [
      'Paperclip adapter configs were translated into Team-X runtime profile candidates.',
      'Validate each runtime profile and bind missing secrets before launch.',
    ],
    source,
    plan: undefined,
  };
  importPreview.plan = buildImportPlan(importPreview, source);

  return {
    packageData,
    importPreview,
    warnings,
    unsupportedAdapters: runtime.unsupportedAdapters,
    missingSecretRefs,
    counts: {
      agents: employees.length,
      runtimeProfiles: runtime.runtimeProfiles.length,
      tickets: tickets.length,
      skills: extensions.length,
      unsupportedAdapters: runtime.unsupportedAdapters.length,
      missingSecrets: missingSecretRefs.length,
    },
  };
}

/**
 * Largest export file the loader will read. The files are parsed whole on the
 * main process, so an unbounded `tasks.json` is unbounded main-process memory.
 */
export const MAX_PAPERCLIP_FILE_BYTES = 50 * 1024 * 1024;

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : null;
}

interface FolderReader {
  /** First of `fileNames` present in the folder, parsed; undefined when none is. */
  read(fileNames: string[]): Promise<unknown>;
  /** Names of the export files actually found. */
  readonly found: string[];
}

function createFolderReader(folderPath: string, maxFileBytes: number): FolderReader {
  const found: string[] = [];
  return {
    found,
    async read(fileNames) {
      for (const fileName of fileNames) {
        const filePath = join(folderPath, fileName);
        let size: number;
        try {
          size = (await stat(filePath)).size;
        } catch (error) {
          if (errorCode(error) === 'ENOENT') continue;
          throw error;
        }
        if (size > maxFileBytes) {
          throw new Error(
            `${fileName} is ${size} bytes, larger than the ${maxFileBytes}-byte limit for an export file`,
          );
        }
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        found.push(fileName);
        return parsed;
      }
      return undefined;
    },
  };
}

function nestedArray(root: Record<string, unknown>, key: string, fallback: unknown): unknown[] {
  const value = root[key] ?? fallback;
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return [];
}

function exportedAtFromRoot(root: Record<string, unknown>): string | number | null {
  const value = root.exportedAt ?? root.createdAt;
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

const EXPORT_FILES = {
  root: ['paperclip-export.json', 'export.json', 'manifest.json'],
  company: ['company.json', 'workspace.json'],
  agents: ['agents.json', 'workers.json'],
  adapters: ['adapters.json', 'runtimes.json'],
  tasks: ['tasks.json'],
  issues: ['issues.json'],
  skills: ['skills.json'],
} as const;

/**
 * Read a Paperclip export folder into a bundle.
 *
 * Refuses, with the folder named, anything that is not an export: a path that
 * does not exist or is not a folder, and a folder holding none of the files
 * an export is made of. Each candidate read used to swallow "file not found",
 * so a mistyped path or an unrelated folder loaded as an empty export and
 * previewed as an importable company with nothing in it.
 */
export async function loadPaperclipExportFolder(
  folderPath: string,
  options: { maxFileBytes?: number } = {},
): Promise<PaperclipExportBundle> {
  const resolved = resolve(folderPath);
  try {
    if (!(await stat(resolved)).isDirectory()) {
      throw new Error(`"${resolved}" is not a folder`);
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw new Error(`"${resolved}" does not exist`);
    throw error;
  }

  const reader = createFolderReader(resolved, options.maxFileBytes ?? MAX_PAPERCLIP_FILE_BYTES);
  const root = await reader.read([...EXPORT_FILES.root]);
  const rootRecord = isRecord(root) ? root : {};
  const bundle: PaperclipExportBundle = {
    sourcePath: resolved,
    exportedAt: exportedAtFromRoot(rootRecord),
    company:
      (isRecord(rootRecord.company) ? rootRecord.company : null) ??
      ((await reader.read([...EXPORT_FILES.company])) as
        | Record<string, unknown>
        | null
        | undefined) ??
      null,
    agents: nestedArray(rootRecord, 'agents', await reader.read([...EXPORT_FILES.agents])),
    adapters: nestedArray(rootRecord, 'adapters', await reader.read([...EXPORT_FILES.adapters])),
    tasks: nestedArray(rootRecord, 'tasks', await reader.read([...EXPORT_FILES.tasks])),
    issues: nestedArray(rootRecord, 'issues', await reader.read([...EXPORT_FILES.issues])),
    skills: nestedArray(rootRecord, 'skills', await reader.read([...EXPORT_FILES.skills])),
  };

  if (reader.found.length === 0) {
    const looked = Object.values(EXPORT_FILES).flat().join(', ');
    throw new Error(`no Paperclip export files in "${resolved}" (looked for ${looked})`);
  }
  return bundle;
}
