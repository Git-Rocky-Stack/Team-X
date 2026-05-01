import type {
  CloudSyncCursorState,
  CloudWorkspaceLinkState,
  CompanyCloudLinkStatus,
} from '@team-x/shared-types';
import { nanoid } from 'nanoid';


import type { CompanyRow, UpdateCompanyCloudLinkInput } from '../db/repos/companies.js';

export const CLOUD_DEVICE_ID_SETTING_KEY = 'cloud_device_id';

export interface CloudLinkServiceDeps {
  companiesRepo: {
    getById(id: string): CompanyRow | null;
    updateCloudLink(id: string, patch: UpdateCompanyCloudLinkInput): void;
  };
  settingsRepo: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
}

export interface UpdateWorkspaceLinkInput {
  companyId: string;
  state?: CloudWorkspaceLinkState;
  cloudWorkspaceId?: string | null;
  cloudTenantId?: string | null;
  linkedDeviceId?: string | null;
  lastSyncedCursor?: CloudSyncCursorState | null;
  lastSnapshotId?: string | null;
  lastSyncAt?: number | null;
  lastSyncError?: string | null;
}

function parseCursorState(raw: string | null | undefined): CloudSyncCursorState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const outboundCursor = typeof record.outboundCursor === 'string' ? record.outboundCursor : null;
    const inboundCursor = typeof record.inboundCursor === 'string' ? record.inboundCursor : null;
    if (outboundCursor === null && inboundCursor === null) return null;
    return { outboundCursor, inboundCursor };
  } catch {
    return null;
  }
}

function isLinkedState(state: CloudWorkspaceLinkState): boolean {
  return state === 'linked' || state === 'sync-paused' || state === 'sync-degraded';
}

function requireCompany(
  companiesRepo: CloudLinkServiceDeps['companiesRepo'],
  companyId: string,
): CompanyRow {
  const company = companiesRepo.getById(companyId);
  if (!company) {
    throw new Error(`[cloud-link-service] company not found: ${companyId}`);
  }
  return company;
}

function reserveCloudWorkspaceId(company: CompanyRow): string {
  const originId = company.workspaceOriginId?.trim() || company.id;
  return `workspace_${originId}`;
}

function reserveCloudTenantId(company: CompanyRow): string {
  const originId = company.companyOriginId?.trim() || company.id;
  return `tenant_${originId}`;
}

function rowToLinkStatus(row: CompanyRow, deviceId: string): CompanyCloudLinkStatus {
  const state = (row.cloudLinkState ?? 'unlinked') as CloudWorkspaceLinkState;
  return {
    companyId: row.id,
    state,
    cloudWorkspaceId: row.cloudWorkspaceId ?? null,
    cloudTenantId: row.cloudTenantId ?? null,
    deviceId,
    linkedDeviceId: row.linkedDeviceId ?? null,
    lastSyncedCursor: parseCursorState(row.lastSyncedCursorJson),
    lastSnapshotId: row.lastSnapshotId ?? null,
    lastSyncAt: row.lastSyncAt ?? null,
    lastSyncError: row.lastSyncError ?? null,
    isLinked: isLinkedState(state),
    canLink: state === 'unlinked',
    canUnlink: state !== 'unlinked',
  };
}

export function createCloudLinkService({ companiesRepo, settingsRepo }: CloudLinkServiceDeps) {
  function ensureDeviceIdentity(): string {
    const existing = settingsRepo.get<string | null>(CLOUD_DEVICE_ID_SETTING_KEY, null);
    if (typeof existing === 'string' && existing.trim().length > 0) {
      return existing.trim();
    }
    const created = `device_${nanoid(16)}`;
    settingsRepo.set(CLOUD_DEVICE_ID_SETTING_KEY, created);
    return created;
  }

  function getWorkspaceLink(companyId: string): CompanyCloudLinkStatus {
    const company = requireCompany(companiesRepo, companyId);
    return rowToLinkStatus(company, ensureDeviceIdentity());
  }

  function updateWorkspaceLink(input: UpdateWorkspaceLinkInput): CompanyCloudLinkStatus {
    requireCompany(companiesRepo, input.companyId);
    companiesRepo.updateCloudLink(input.companyId, {
      cloudLinkState: input.state,
      cloudWorkspaceId: input.cloudWorkspaceId,
      cloudTenantId: input.cloudTenantId,
      linkedDeviceId: input.linkedDeviceId,
      lastSyncedCursorJson:
        input.lastSyncedCursor === undefined ? undefined : JSON.stringify(input.lastSyncedCursor),
      lastSnapshotId: input.lastSnapshotId,
      lastSyncAt: input.lastSyncAt,
      lastSyncError: input.lastSyncError,
    });
    return getWorkspaceLink(input.companyId);
  }

  function startLink(companyId: string): CompanyCloudLinkStatus {
    const company = requireCompany(companiesRepo, companyId);
    const deviceId = ensureDeviceIdentity();
    return updateWorkspaceLink({
      companyId,
      state: 'linking',
      cloudWorkspaceId: company.cloudWorkspaceId ?? reserveCloudWorkspaceId(company),
      cloudTenantId: company.cloudTenantId ?? reserveCloudTenantId(company),
      linkedDeviceId: deviceId,
      lastSyncError: null,
    });
  }

  function completeLink(companyId: string): CompanyCloudLinkStatus {
    const company = requireCompany(companiesRepo, companyId);
    const deviceId = ensureDeviceIdentity();
    return updateWorkspaceLink({
      companyId,
      state: 'linked',
      cloudWorkspaceId: company.cloudWorkspaceId ?? reserveCloudWorkspaceId(company),
      cloudTenantId: company.cloudTenantId ?? reserveCloudTenantId(company),
      linkedDeviceId: deviceId,
      lastSyncAt: Date.now(),
      lastSyncError: null,
    });
  }

  function failLink(companyId: string, error: string): CompanyCloudLinkStatus {
    const company = requireCompany(companiesRepo, companyId);
    const deviceId = ensureDeviceIdentity();
    return updateWorkspaceLink({
      companyId,
      state: 'sync-degraded',
      cloudWorkspaceId: company.cloudWorkspaceId ?? reserveCloudWorkspaceId(company),
      cloudTenantId: company.cloudTenantId ?? reserveCloudTenantId(company),
      linkedDeviceId: company.linkedDeviceId ?? deviceId,
      lastSyncError: error.trim() || 'Cloud link failed.',
    });
  }

  function linkWorkspace(companyId: string): CompanyCloudLinkStatus {
    startLink(companyId);
    return completeLink(companyId);
  }

  function clearWorkspaceLink(companyId: string): CompanyCloudLinkStatus {
    return updateWorkspaceLink({
      companyId,
      state: 'unlinked',
      cloudWorkspaceId: null,
      cloudTenantId: null,
      linkedDeviceId: null,
      lastSyncedCursor: null,
      lastSnapshotId: null,
      lastSyncAt: null,
      lastSyncError: null,
    });
  }

  function unlinkWorkspace(companyId: string): CompanyCloudLinkStatus {
    updateWorkspaceLink({
      companyId,
      state: 'unlinking',
      lastSyncError: null,
    });
    return clearWorkspaceLink(companyId);
  }

  function reconnectWorkspace(companyId: string): CompanyCloudLinkStatus {
    const current = getWorkspaceLink(companyId);
    if (current.state === 'unlinked' || !current.cloudWorkspaceId || !current.cloudTenantId) {
      throw new Error('[cloud-link-service] workspace is not linked');
    }
    return updateWorkspaceLink({
      companyId,
      state: 'linked',
      cloudWorkspaceId: current.cloudWorkspaceId,
      cloudTenantId: current.cloudTenantId,
      linkedDeviceId: current.linkedDeviceId ?? current.deviceId,
      lastSyncedCursor: current.lastSyncedCursor,
      lastSnapshotId: current.lastSnapshotId,
      lastSyncAt: Date.now(),
      lastSyncError: null,
    });
  }

  return {
    ensureDeviceIdentity,
    getWorkspaceLink,
    updateWorkspaceLink,
    startLink,
    completeLink,
    failLink,
    linkWorkspace,
    clearWorkspaceLink,
    unlinkWorkspace,
    reconnectWorkspace,
  };
}

export type CloudLinkService = ReturnType<typeof createCloudLinkService>;
