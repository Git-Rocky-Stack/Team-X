import { describe, expect, it, vi } from 'vitest';

import type {
  ExportCompanyPackageResponse,
  ImportCompanyPackageResponse,
  InstallCompanyTemplateResponse,
  ListCompanyTemplatesResponse,
  PreviewCompanyPackageImportResponse,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
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
    bus: {
      emit: vi.fn(),
    } as unknown as IpcHandlerDeps['bus'],
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('company portability IPC handlers', () => {
  it('validates and delegates companies.exportPackage', async () => {
    const bus = { emit: vi.fn() };
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
      previewImport: vi.fn(),
      importAsNewCompany: vi.fn(),
      listTemplates: vi.fn(),
      installTemplate: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        bus,
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
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'company.packageExported',
        companyId: 'company-1',
      }),
    );
    expect(result).toEqual(response);
  });

  it('rejects invalid export modes before touching the portability service', async () => {
    const companyPortabilityService = {
      exportCompany: vi.fn(),
      previewImport: vi.fn(),
      importAsNewCompany: vi.fn(),
      listTemplates: vi.fn(),
      installTemplate: vi.fn(),
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

  it('validates and delegates companies.previewImportPackage', async () => {
    const response: PreviewCompanyPackageImportResponse = {
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
        redactions: ['extensions.extension-1.manifest.apiKey'],
        compatibility: ['local-skills-may-require-manual-reinstall'],
      },
      warnings: ['Compatibility note: local skills may require manual reinstall.'],
      missingSecrets: ['extensions.extension-1.manifest.apiKey'],
      suggestedCompanyName: 'Alpha',
      suggestedSlug: 'alpha-imported',
    };
    const companyPortabilityService = {
      exportCompany: vi.fn(),
      previewImport: vi.fn(async () => response),
      importAsNewCompany: vi.fn(),
      listTemplates: vi.fn(),
      installTemplate: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        companyPortabilityService,
      }),
    );

    const result = await handlers.companiesPreviewImportPackage({
      packagePath: 'C:/tmp/alpha.teamx-package.json',
    });

    expect(companyPortabilityService.previewImport).toHaveBeenCalledWith({
      packagePath: 'C:/tmp/alpha.teamx-package.json',
    });
    expect(result).toEqual(response);
  });

  it('validates and delegates companies.importPackage', async () => {
    const bus = { emit: vi.fn() };
    const response: ImportCompanyPackageResponse = {
      companyId: 'company-imported',
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
      exportCompany: vi.fn(),
      previewImport: vi.fn(),
      importAsNewCompany: vi.fn(async () => response),
      listTemplates: vi.fn(),
      installTemplate: vi.fn(),
    };
    const secretsStore = {
      setApiKey: vi.fn(async () => undefined),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        bus,
        companyPortabilityService,
        secretsStore,
      }),
    );

    const result = await handlers.companiesImportPackage({
      packageRef: 'rocky/team-x-templates/templates/alpha.teamx-package.json#main',
      name: 'Alpha Copy',
      slug: 'alpha-copy',
      secretBindings: [
        {
          providerId: 'anthropic',
          key: 'apiKey',
          value: 'sk-ant-template',
        },
      ],
    });

    expect(secretsStore.setApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-template');
    expect(companyPortabilityService.importAsNewCompany).toHaveBeenCalledWith({
      packageRef: 'rocky/team-x-templates/templates/alpha.teamx-package.json#main',
      name: 'Alpha Copy',
      slug: 'alpha-copy',
      secretBindings: [
        {
          providerId: 'anthropic',
          key: 'apiKey',
          value: 'sk-ant-template',
        },
      ],
    });
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'company.packageImported',
        companyId: 'company-imported',
      }),
    );
    expect(result).toEqual(response);
  });

  it('rejects invalid preview/import requests before touching the portability service', async () => {
    const companyPortabilityService = {
      exportCompany: vi.fn(),
      previewImport: vi.fn(),
      importAsNewCompany: vi.fn(),
      listTemplates: vi.fn(),
      installTemplate: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        companyPortabilityService,
      }),
    );

    await expect(
      handlers.companiesPreviewImportPackage({
        packagePath: '',
      }),
    ).rejects.toThrow(/packagePath is required/i);

    await expect(
      handlers.companiesImportPackage({
        packagePath: 'C:/tmp/alpha.teamx-package.json',
        slug: 42 as never,
      }),
    ).rejects.toThrow(/slug must be a string/i);

    expect(companyPortabilityService.previewImport).not.toHaveBeenCalled();
    expect(companyPortabilityService.importAsNewCompany).not.toHaveBeenCalled();
  });

  it('delegates companies.listTemplates and companies.installTemplate', async () => {
    const bus = { emit: vi.fn() };
    const listResponse: ListCompanyTemplatesResponse = {
      templates: [
        {
          packagePath: 'C:/Team-X/templates/alpha-template.teamx-package.json',
          manifest: {
            packageId: 'pkg-template-1',
            packageVersion: 1,
            mode: 'template',
            workspaceOriginId: 'workspace-origin-1',
            companyOriginId: 'company-origin-1',
            sourceAppVersion: '1.2.1',
            exportedAt: '2026-04-23T18:30:00.000Z',
            exportedByOperatorId: 'rocky',
            sharingMode: 'local',
            sections: ['company', 'employees', 'autonomy'],
            redactions: [],
            compatibility: [],
          },
          company: {
            name: 'Alpha',
            slug: 'alpha',
            icon: null,
            theme: 'dark',
            settings: {},
          },
          employeeCount: 3,
          runtimeProfileCount: 1,
          routineCount: 2,
          extensionCount: 1,
          starterAssetCount: 0,
        },
      ],
    };
    const firstTemplate = listResponse.templates[0];
    expect(firstTemplate).toBeDefined();
    const installResponse: InstallCompanyTemplateResponse = {
      template: firstTemplate ?? {
        packagePath: 'C:/Team-X/templates/fallback-template.teamx-package.json',
        manifest: {
          packageId: 'pkg-template-fallback',
          packageVersion: 1,
          mode: 'template',
          workspaceOriginId: 'workspace-origin-fallback',
          companyOriginId: 'company-origin-fallback',
          sourceAppVersion: '1.2.1',
          exportedAt: '2026-04-23T18:30:00.000Z',
          exportedByOperatorId: 'rocky',
          sharingMode: 'local',
          sections: ['company'],
          redactions: [],
          compatibility: [],
        },
        company: {
          name: 'Fallback',
          slug: 'fallback',
          icon: null,
          theme: 'dark',
          settings: {},
        },
        employeeCount: 0,
        runtimeProfileCount: 0,
        routineCount: 0,
        extensionCount: 0,
        starterAssetCount: 0,
      },
    };
    const companyPortabilityService = {
      exportCompany: vi.fn(),
      previewImport: vi.fn(),
      importAsNewCompany: vi.fn(),
      listTemplates: vi.fn(async () => listResponse.templates),
      installTemplate: vi.fn(async () => installResponse.template),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        bus,
        companyPortabilityService,
      }),
    );

    const listResult = await handlers.companiesListTemplates({ companyId: 'company-1' });
    const installResult = await handlers.companiesInstallTemplate({
      companyId: 'company-1',
      packagePath: 'C:/tmp/alpha-template.teamx-package.json',
    });

    expect(companyPortabilityService.listTemplates).toHaveBeenCalledWith();
    expect(companyPortabilityService.installTemplate).toHaveBeenCalledWith({
      packagePath: 'C:/tmp/alpha-template.teamx-package.json',
    });
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'company.templateInstalled',
        companyId: 'company-1',
      }),
    );
    expect(listResult).toEqual(listResponse);
    expect(installResult).toEqual(installResponse);
  });
});
