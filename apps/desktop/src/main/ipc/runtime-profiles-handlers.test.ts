import { describe, expect, it, vi } from 'vitest';

import type {
  BindEmployeeRuntimeProfileRequest,
  CreateRuntimeProfileRequest,
  RuntimeProfileSummary,
  RuntimeProfileValidation,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const runtimeProfilesService = {
    list: vi.fn(
      (): RuntimeProfileSummary[] => [
        {
          id: 'profile-1',
          companyId: 'company-1',
          name: 'Mission Control Internal',
          slug: 'mission-control-internal',
          kind: 'teamx-internal',
          enabled: true,
          config: { providerId: 'anthropic' },
          lastHealthStatus: 'healthy',
          lastHealthMessage: 'Ready',
          lastValidatedAt: 10,
          createdAt: 1,
          updatedAt: 10,
          executionMode: 'native',
          boundEmployeeIds: ['employee-1'],
          boundEmployeeCount: 1,
        },
      ],
    ),
    create: vi.fn(() => 'profile-1'),
    update: vi.fn(),
    delete: vi.fn(),
    bindEmployee: vi.fn((req: BindEmployeeRuntimeProfileRequest) =>
      req.runtimeProfileId === null
        ? null
        : {
            id: 'binding-1',
            companyId: req.companyId,
            employeeId: req.employeeId,
            runtimeProfileId: req.runtimeProfileId,
            createdAt: 1,
            updatedAt: 1,
          },
    ),
    validateProfile: vi.fn(
      async (): Promise<RuntimeProfileValidation> => ({
        profileId: 'profile-1',
        status: 'healthy',
        message: 'Ready',
        checkedAt: 10,
        supportsExecution: true,
        details: { providerId: 'anthropic' },
      }),
    ),
  };

  return {
    companiesRepo: noop,
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
    runtimeProfilesService,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('runtime profile IPC handlers', () => {
  it('lists runtime profiles through runtimeProfiles.list', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.runtimeProfilesList({ companyId: 'company-1' });

    expect(deps.runtimeProfilesService?.list).toHaveBeenCalledWith('company-1');
    expect(result[0]?.executionMode).toBe('native');
  });

  it('creates runtime profiles through runtimeProfiles.create', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);
    const req: CreateRuntimeProfileRequest = {
      companyId: 'company-1',
      name: 'Remote Runtime',
      kind: 'http',
      config: { baseUrl: 'http://127.0.0.1:8787' },
    };

    const result = await handlers.runtimeProfilesCreate(req);

    expect(deps.runtimeProfilesService?.create).toHaveBeenCalledWith(req);
    expect(result).toEqual({ profileId: 'profile-1' });
  });

  it('rejects unknown runtime kinds before dispatch', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.runtimeProfilesCreate({
        companyId: 'company-1',
        name: 'Broken',
        kind: 'wrong-kind' as never,
      }),
    ).rejects.toThrow(/invalid runtime kind/i);
  });

  it('binds or unbinds an employee through runtimeProfiles.bindEmployee', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const bound = await handlers.runtimeProfilesBindEmployee({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
    });
    const unbound = await handlers.runtimeProfilesBindEmployee({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: null,
    });

    expect(bound.binding).toEqual(
      expect.objectContaining({
        employeeId: 'employee-1',
        runtimeProfileId: 'profile-1',
      }),
    );
    expect(unbound.binding).toBeNull();
  });

  it('returns persisted validation output through runtimeProfiles.validate', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.runtimeProfilesValidate({
      companyId: 'company-1',
      profileId: 'profile-1',
    });

    expect(deps.runtimeProfilesService?.validateProfile).toHaveBeenCalledWith({
      companyId: 'company-1',
      profileId: 'profile-1',
    });
    expect(result.status).toBe('healthy');
  });
});
