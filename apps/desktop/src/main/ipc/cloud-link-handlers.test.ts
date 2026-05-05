import type { CompanyCloudLinkStatus } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  return {
    companiesRepo: {
      getById: vi.fn((id: string) =>
        id === 'company-1'
          ? {
              id: 'company-1',
              name: 'Strategia-X',
              slug: 'strategia-x',
              status: 'running',
              theme: 'dark',
              icon: null,
              createdAt: 1,
              settingsJson: '{}',
              workspaceOriginId: 'company-origin-1',
              companyOriginId: 'company-origin-1',
            }
          : null,
      ),
    } as unknown as IpcHandlerDeps['companiesRepo'],
    employeesRepo: noop,
    threadsRepo: noop,
    messagesRepo: noop,
    ticketsRepo: noop,
    ticketAttachmentsRepo: noop,
    goalsRepo: noop,
    projectsRepo: noop,
    meetingsRepo: noop,
    orgEdgesRepo: noop,
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo: {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(),
      getCopilot: vi.fn(),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(),
      setCopilotWeights: vi.fn(),
    } as unknown as IpcHandlerDeps['settingsRepo'],
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('cloud link IPC handlers', () => {
  it('reads the current workspace link status through cloud.getWorkspaceLink', async () => {
    const link: CompanyCloudLinkStatus = {
      companyId: 'company-1',
      state: 'linked',
      cloudWorkspaceId: 'cloud-workspace-1',
      cloudTenantId: 'cloud-tenant-1',
      deviceId: 'device_1',
      linkedDeviceId: 'device_1',
      lastSyncedCursor: {
        outboundCursor: 'evt-10',
        inboundCursor: 'cmd-4',
      },
      lastSnapshotId: 'snapshot-2',
      lastSyncAt: 123456789,
      lastSyncError: null,
      isLinked: true,
      canLink: false,
      canUnlink: true,
    };
    const deps = makeDeps({
      cloudLinkService: {
        ensureDeviceIdentity: vi.fn(() => 'device_1'),
        getWorkspaceLink: vi.fn(() => link),
      },
    });
    const handlers = createIpcHandlers(deps);

    const result = await handlers.cloudGetWorkspaceLink({
      companyId: 'company-1',
    });

    expect(deps.cloudLinkService?.getWorkspaceLink).toHaveBeenCalledWith('company-1');
    expect(result).toEqual(link);
  });

  it('rejects requests when the cloud link service is unwired', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(
      handlers.cloudGetWorkspaceLink({
        companyId: 'company-1',
      }),
    ).rejects.toThrow(/cloudLinkService dep is required/);
  });

  it('rejects unknown workspaces before reading link state', async () => {
    const deps = makeDeps({
      cloudLinkService: {
        ensureDeviceIdentity: vi.fn(() => 'device_1'),
        getWorkspaceLink: vi.fn(),
      },
    });
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.cloudGetWorkspaceLink({
        companyId: 'company-404',
      }),
    ).rejects.toThrow(/company not found/);
    expect(deps.cloudLinkService?.getWorkspaceLink).not.toHaveBeenCalled();
  });

  it('links, reconnects, and unlinks a workspace through the cloud IPC surface', async () => {
    const link: CompanyCloudLinkStatus = {
      companyId: 'company-1',
      state: 'linked',
      cloudWorkspaceId: 'workspace_company-1',
      cloudTenantId: 'tenant_company-1',
      deviceId: 'device_1',
      linkedDeviceId: 'device_1',
      lastSyncedCursor: null,
      lastSnapshotId: null,
      lastSyncAt: 123456789,
      lastSyncError: null,
      isLinked: true,
      canLink: false,
      canUnlink: true,
    };
    const cloudLinkService = {
      ensureDeviceIdentity: vi.fn(() => 'device_1'),
      getWorkspaceLink: vi.fn(() => link),
      startLink: vi.fn(() => ({
        ...link,
        state: 'linking' as const,
      })),
      completeLink: vi.fn(() => link),
      linkWorkspace: vi.fn(() => link),
      unlinkWorkspace: vi.fn(() => ({
        ...link,
        state: 'unlinked' as const,
        cloudWorkspaceId: null,
        cloudTenantId: null,
        linkedDeviceId: null,
        lastSyncAt: null,
        isLinked: false,
        canLink: true,
        canUnlink: false,
      })),
      reconnectWorkspace: vi.fn(() => ({
        ...link,
        state: 'linked' as const,
        lastSyncAt: 22334455,
      })),
      failLink: vi.fn(() => ({
        ...link,
        state: 'sync-degraded' as const,
        lastSyncError: 'boom',
      })),
    };
    const bus = {
      emit: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        cloudLinkService,
        bus,
      }),
    );

    const linked = await handlers.cloudLinkWorkspace({ companyId: 'company-1' });
    const reconnected = await handlers.cloudReconnectWorkspace({ companyId: 'company-1' });
    const unlinked = await handlers.cloudUnlinkWorkspace({ companyId: 'company-1' });

    expect(cloudLinkService.startLink).toHaveBeenCalledWith('company-1');
    expect(cloudLinkService.completeLink).toHaveBeenCalledWith('company-1');
    expect(cloudLinkService.reconnectWorkspace).toHaveBeenCalledWith('company-1');
    expect(cloudLinkService.unlinkWorkspace).toHaveBeenCalledWith('company-1');
    expect(linked.state).toBe('linked');
    expect(reconnected.lastSyncAt).toBe(22334455);
    expect(unlinked.state).toBe('unlinked');
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'company.linkStarted', companyId: 'company-1' }),
    );
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'company.linked', companyId: 'company-1' }),
    );
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'company.reconnected', companyId: 'company-1' }),
    );
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'company.unlinked', companyId: 'company-1' }),
    );
  });
});
