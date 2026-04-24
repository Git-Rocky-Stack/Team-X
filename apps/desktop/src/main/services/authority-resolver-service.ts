import { win32 as pathWin32 } from 'node:path';

import type {
  AuthorityGrant,
  EffectiveAuthorityEntry,
  EffectiveAuthoritySnapshot,
} from '@team-x/shared-types';

interface AuthorityResolverEmployeeRow {
  id: string;
  companyId: string;
  toolsAllowedJson: string;
  toolsDeniedJson: string;
}

export interface AuthorityResolverEmployeesRepo {
  getById(id: string): AuthorityResolverEmployeeRow | null;
}

export interface AuthorityResolverAuthorityRepo {
  listForEmployee(
    companyId: string,
    employeeId: string,
  ): Array<{
    id: string;
    scopeKind: AuthorityGrant['scopeKind'];
    scopeId: string;
    resourceKind: AuthorityGrant['resourceKind'];
    resourceId: string;
    permission: AuthorityGrant['permission'];
    metadataJson: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
}

export interface AuthorityResolverServiceDeps {
  employeesRepo: AuthorityResolverEmployeesRepo;
  authorityRepo: AuthorityResolverAuthorityRepo;
  hardDeniedCapabilities?: string[];
  hardDeniedPaths?: string[];
}

export interface AuthorityResolverService {
  resolveEmployee(companyId: string, employeeId: string): EffectiveAuthoritySnapshot;
  evaluatePath(companyId: string, employeeId: string, candidatePath: string): PathAuthorityDecision;
}

type ResolverSourceKind = EffectiveAuthorityEntry['sourceKind'];

interface LayeredEntry extends EffectiveAuthorityEntry {
  precedence: number;
}

interface MatchedPathEntry {
  entry: EffectiveAuthorityEntry;
  normalizedGrantPath: string;
}

export interface PathAuthorityDecision {
  normalizedPath: string;
  permission: AuthorityGrant['permission'] | 'inherit';
  matchedEntry: EffectiveAuthorityEntry | null;
}

const PRECEDENCE: Record<ResolverSourceKind, number> = {
  'role-default': 0,
  extension: 1,
  company: 2,
  employee: 3,
  'hard-deny': 4,
};

const PERMISSION_WEIGHT: Record<AuthorityGrant['permission'], number> = {
  allow: 0,
  prompt: 1,
  deny: 2,
};

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const values: string[] = [];
    for (const value of parsed) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      values.push(trimmed);
    }
    return values;
  } catch {
    return [];
  }
}

function parseMetadata(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to null.
  }
  return null;
}

function sortEntries(a: EffectiveAuthorityEntry, b: EffectiveAuthorityEntry): number {
  if (a.resourceKind !== b.resourceKind) return a.resourceKind.localeCompare(b.resourceKind);
  return a.resourceId.localeCompare(b.resourceId);
}

function normalizeAuthorityPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('[authority] path is required');
  }

  const normalized = pathWin32
    .normalize(trimmed.replace(/\//g, '\\'))
    .replace(/\\/g, '/')
    .toLowerCase();
  if (/^[a-z]:$/.test(normalized)) {
    return `${normalized}/`;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    if (/^[a-z]:\/$/.test(normalized)) return normalized;
    return normalized.replace(/\/+$/g, '');
  }
  return normalized;
}

function pathGrantMatches(grantPath: string, candidatePath: string): boolean {
  if (grantPath === candidatePath) return true;
  if (/^[a-z]:\/$/.test(grantPath)) {
    return candidatePath.startsWith(grantPath);
  }
  return candidatePath.startsWith(`${grantPath}/`);
}

function compareMatchedPathEntries(a: MatchedPathEntry, b: MatchedPathEntry): number {
  if (a.normalizedGrantPath.length !== b.normalizedGrantPath.length) {
    return b.normalizedGrantPath.length - a.normalizedGrantPath.length;
  }
  const precedenceDiff = PRECEDENCE[b.entry.sourceKind] - PRECEDENCE[a.entry.sourceKind];
  if (precedenceDiff !== 0) return precedenceDiff;
  return PERMISSION_WEIGHT[b.entry.permission] - PERMISSION_WEIGHT[a.entry.permission];
}

export function createAuthorityResolverService(
  deps: AuthorityResolverServiceDeps,
): AuthorityResolverService {
  const hardDeniedCapabilities = Array.from(new Set(deps.hardDeniedCapabilities ?? []));
  const hardDeniedPaths = Array.from(new Set(deps.hardDeniedPaths ?? []));

  function resolveEmployee(companyId: string, employeeId: string): EffectiveAuthoritySnapshot {
    const employee = deps.employeesRepo.getById(employeeId);
    if (!employee) {
      throw new Error(`[authority] resolveEmployee: employee not found: ${employeeId}`);
    }
    if (employee.companyId !== companyId) {
      throw new Error(
        `[authority] resolveEmployee: employee ${employeeId} does not belong to company ${companyId}`,
      );
    }

    const effective = new Map<string, LayeredEntry>();
    const allowlist = new Set<string>();
    const denylist = new Set<string>();

    function apply(entry: EffectiveAuthorityEntry) {
      const key = `${entry.resourceKind}:${entry.resourceId}`;
      const layered: LayeredEntry = { ...entry, precedence: PRECEDENCE[entry.sourceKind] };
      const existing = effective.get(key);
      if (!existing || layered.precedence >= existing.precedence) {
        effective.set(key, layered);
      }
    }

    for (const toolName of parseStringArray(employee.toolsAllowedJson)) {
      apply({
        resourceKind: 'capability',
        resourceId: toolName,
        permission: 'allow',
        sourceKind: 'role-default',
        sourceId: employeeId,
      });
    }
    for (const toolName of parseStringArray(employee.toolsDeniedJson)) {
      apply({
        resourceKind: 'capability',
        resourceId: toolName,
        permission: 'deny',
        sourceKind: 'role-default',
        sourceId: employeeId,
      });
    }

    for (const grant of deps.authorityRepo.listForEmployee(companyId, employeeId)) {
      parseMetadata(grant.metadataJson);
      apply({
        resourceKind: grant.resourceKind,
        resourceId: grant.resourceId,
        permission: grant.permission,
        sourceKind: grant.scopeKind === 'extension' ? 'extension' : grant.scopeKind,
        sourceId: grant.scopeId,
      });
    }

    for (const capability of hardDeniedCapabilities) {
      apply({
        resourceKind: 'capability',
        resourceId: capability,
        permission: 'deny',
        sourceKind: 'hard-deny',
        sourceId: 'platform',
      });
    }
    for (const path of hardDeniedPaths) {
      apply({
        resourceKind: 'path',
        resourceId: path,
        permission: 'deny',
        sourceKind: 'hard-deny',
        sourceId: 'platform',
      });
    }

    const entries = Array.from(effective.values())
      .map(({ precedence: _precedence, ...entry }) => entry)
      .sort(sortEntries);

    for (const entry of entries) {
      if (entry.resourceKind !== 'capability') continue;
      if (entry.permission === 'deny') {
        denylist.add(entry.resourceId);
        allowlist.delete(entry.resourceId);
        continue;
      }
      if (entry.permission === 'allow' && !denylist.has(entry.resourceId)) {
        allowlist.add(entry.resourceId);
      }
    }

    return {
      companyId,
      employeeId,
      entries,
      toolsAllowed: Array.from(allowlist).sort(),
      toolsDenied: Array.from(denylist).sort(),
    };
  }

  function evaluatePath(
    companyId: string,
    employeeId: string,
    candidatePath: string,
  ): PathAuthorityDecision {
    const snapshot = resolveEmployee(companyId, employeeId);
    const normalizedPath = normalizeAuthorityPath(candidatePath);
    const matches = snapshot.entries
      .filter((entry) => entry.resourceKind === 'path')
      .map(
        (entry): MatchedPathEntry => ({
          entry,
          normalizedGrantPath: normalizeAuthorityPath(entry.resourceId),
        }),
      )
      .filter((entry) => pathGrantMatches(entry.normalizedGrantPath, normalizedPath))
      .sort(compareMatchedPathEntries);

    const matched = matches[0]?.entry ?? null;
    return {
      normalizedPath,
      permission: matched?.permission ?? 'inherit',
      matchedEntry: matched,
    };
  }

  return {
    resolveEmployee,
    evaluatePath,
  };
}
