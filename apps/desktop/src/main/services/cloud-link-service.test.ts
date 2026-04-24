import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createSettingsRepo } from '../db/repos/settings.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createCloudLinkService } from './cloud-link-service.js';

describe('cloud-link-service', () => {
  let ctx: TestDbHandle;
  let companiesRepo: ReturnType<typeof createCompaniesRepo>;
  let settingsRepo: ReturnType<typeof createSettingsRepo>;
  let service: ReturnType<typeof createCloudLinkService>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    companiesRepo = createCompaniesRepo(ctx.db);
    settingsRepo = createSettingsRepo(ctx.db);
    service = createCloudLinkService({ companiesRepo, settingsRepo });
  });

  afterEach(() => {
    ctx.close();
  });

  it('creates and reuses a stable local device identity', () => {
    const first = service.ensureDeviceIdentity();
    const second = service.ensureDeviceIdentity();

    expect(first).toMatch(/^device_/);
    expect(second).toBe(first);
    expect(settingsRepo.get('cloud_device_id', '')).toBe(first);
  });

  it('returns an unlinked default status for a new workspace', () => {
    const companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });

    const link = service.getWorkspaceLink(companyId);

    expect(link.companyId).toBe(companyId);
    expect(link.state).toBe('unlinked');
    expect(link.isLinked).toBe(false);
    expect(link.canLink).toBe(true);
    expect(link.canUnlink).toBe(false);
    expect(link.cloudWorkspaceId).toBeNull();
    expect(link.cloudTenantId).toBeNull();
    expect(link.linkedDeviceId).toBeNull();
    expect(link.lastSyncedCursor).toBeNull();
  });

  it('persists and rehydrates linked metadata including sync cursors', () => {
    const companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });
    const deviceId = service.ensureDeviceIdentity();

    const updated = service.updateWorkspaceLink({
      companyId,
      state: 'sync-degraded',
      cloudWorkspaceId: 'cloud-workspace-1',
      cloudTenantId: 'cloud-tenant-1',
      linkedDeviceId: deviceId,
      lastSyncedCursor: {
        outboundCursor: 'evt-10',
        inboundCursor: 'cmd-4',
      },
      lastSnapshotId: 'snapshot-2',
      lastSyncAt: 123456789,
      lastSyncError: 'temporary outage',
    });

    expect(updated.state).toBe('sync-degraded');
    expect(updated.isLinked).toBe(true);
    expect(updated.canLink).toBe(false);
    expect(updated.canUnlink).toBe(true);
    expect(updated.cloudWorkspaceId).toBe('cloud-workspace-1');
    expect(updated.cloudTenantId).toBe('cloud-tenant-1');
    expect(updated.linkedDeviceId).toBe(deviceId);
    expect(updated.lastSyncedCursor).toEqual({
      outboundCursor: 'evt-10',
      inboundCursor: 'cmd-4',
    });
    expect(updated.lastSnapshotId).toBe('snapshot-2');
    expect(updated.lastSyncAt).toBe(123456789);
    expect(updated.lastSyncError).toBe('temporary outage');
  });

  it('links a workspace with reserved cloud ids and reconnects degraded posture', () => {
    const companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });

    const linked = service.linkWorkspace(companyId);

    expect(linked.state).toBe('linked');
    expect(linked.cloudWorkspaceId).toBe(`workspace_${companyId}`);
    expect(linked.cloudTenantId).toBe(`tenant_${companyId}`);
    expect(linked.linkedDeviceId).toBe(linked.deviceId);
    expect(linked.lastSyncAt).toBeTypeOf('number');

    const degraded = service.failLink(companyId, 'stale cursor replay');
    expect(degraded.state).toBe('sync-degraded');
    expect(degraded.lastSyncError).toBe('stale cursor replay');

    const reconnected = service.reconnectWorkspace(companyId);
    expect(reconnected.state).toBe('linked');
    expect(reconnected.cloudWorkspaceId).toBe(`workspace_${companyId}`);
    expect(reconnected.cloudTenantId).toBe(`tenant_${companyId}`);
    expect(reconnected.lastSyncError).toBeNull();
    expect(reconnected.lastSyncAt).toBeTypeOf('number');
  });

  it('clears a linked workspace back to unlinked posture', () => {
    const companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });
    const deviceId = service.ensureDeviceIdentity();

    service.updateWorkspaceLink({
      companyId,
      state: 'linked',
      cloudWorkspaceId: 'cloud-workspace-1',
      cloudTenantId: 'cloud-tenant-1',
      linkedDeviceId: deviceId,
      lastSyncedCursor: {
        outboundCursor: 'evt-10',
        inboundCursor: 'cmd-4',
      },
      lastSnapshotId: 'snapshot-2',
      lastSyncAt: 123456789,
      lastSyncError: 'temporary outage',
    });

    const cleared = service.clearWorkspaceLink(companyId);

    expect(cleared.state).toBe('unlinked');
    expect(cleared.isLinked).toBe(false);
    expect(cleared.canLink).toBe(true);
    expect(cleared.canUnlink).toBe(false);
    expect(cleared.cloudWorkspaceId).toBeNull();
    expect(cleared.cloudTenantId).toBeNull();
    expect(cleared.linkedDeviceId).toBeNull();
    expect(cleared.lastSyncedCursor).toBeNull();
    expect(cleared.lastSnapshotId).toBeNull();
    expect(cleared.lastSyncAt).toBeNull();
    expect(cleared.lastSyncError).toBeNull();
  });

  it('refuses reconnects for an unlinked workspace', () => {
    const companyId = companiesRepo.create({ name: 'Strategia-X', slug: 'strategia-x' });

    expect(() => service.reconnectWorkspace(companyId)).toThrow(/workspace is not linked/i);
  });
});
