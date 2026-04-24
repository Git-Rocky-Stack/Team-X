import { describe, expect, it, vi } from 'vitest';

import type { ExportCompanyPackageResponse } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(
  overrides: Partial<IpcHandlerDeps> = {},
): IpcHandlerDeps {
  const noop = {} as never;
  return {
    companiesRepo: {
      getById: vi.fn((id: string) =>
        id === 'company-1'
          ? {
              id: 'company-1',
              name: 'Alpha',
              slug: 'alpha',
              createdAt: 1,
              settingsJson: '{}',
              icon: null,
              theme: 'dark',
              status: 'running',
              workspaceOriginId: 'workspace-origin-1',
              companyOriginId: 'company-origin-1',
            }
          : null,
      ),
      list: vi.fn(() => []),
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
      getMemory: vi.fn(),
      setMemory: vi.fn(),
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

describe('company portability IPC handlers', () => {
  it('validates and delegates companies.exportPackage', async () => {
    const response: ExportCompanyPackageResponse = {
      packagePath: '/tmp/alpha.teamx-package.json',
      manifest: {
        packageId: 'pkg-1',
        packageVersion: 1,
        mode: 'workspace-export',
        workspaceOriginId: 'workspace-origin-1',
        companyOriginId: 'company-origin-1',
        sourceAppVersion: '1.2.1',
        exportedAt: '2026-04-23T18:30:00.000Z',
        exportedByOperatorId: 'rocky',
        sharingMode: 'local',
        sections: ['company'],
        redactions: [],
        compatibility: [],
      },
    };
    const companyPortabilityService = {
      exportCompany: vi.fn(async () => response),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        companyPortabilityService,
      }),
    );

    const result = await handlers.companiesExportPackage({
      companyId: 'company-1',
      mode: 'workspace-export',
    });

    expect(companyPortabilityService.exportCompany).toHaveBeenCalledWith({
      companyId: 'company-1',
      mode: 'workspace-export',
    });
    expect(result).toEqual(response);
  });

  it('rejects invalid export modes before touching the portability service', async () => {
    const companyPortabilityService = {
      exportCompany: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        companyPortabilityService,
      }),
    );

    await expect(
      handlers.companiesExportPackage({
        companyId: 'company-1',
        mode: 'invalid-mode' as never,
      }),
    ).rejects.toThrow(/invalid mode/i);
    expect(companyPortabilityService.exportCompany).not.toHaveBeenCalled();
  });
});
