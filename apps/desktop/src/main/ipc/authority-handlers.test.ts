import { describe, expect, it, vi } from 'vitest';

import type { CreateAuthorityGrantRequest, EffectiveAuthoritySnapshot } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const authorityRepo = {
    createGrant: vi.fn(() => 'grant-1'),
    getGrantById: vi.fn(() => ({
      id: 'grant-1',
      scopeKind: 'company',
      scopeId: 'company-1',
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      permission: 'allow',
      metadataJson: null,
      createdAt: 1,
      updatedAt: 1,
    })),
    listByCompany: vi.fn(() => []),
    createRequest: vi.fn(),
    getRequestById: vi.fn((id: string) =>
      id === 'request-1'
        ? {
            id: 'request-1',
            extensionId: 'skill-1',
            employeeId: null,
            resourceKind: 'path',
            resourceId: 'C:/Projects/Alpha',
            requestedPermission: 'allow',
            status: 'pending',
            reason: 'Requested by installed skill manifest',
            createdAt: 1,
            reviewedAt: null,
          }
        : null,
    ),
    listRequestsByCompany: vi.fn(() => [
      {
        id: 'request-1',
        extensionId: 'skill-1',
        employeeId: null,
        resourceKind: 'path',
        resourceId: 'C:/Projects/Alpha',
        requestedPermission: 'allow',
        status: 'pending',
        reason: 'Requested by installed skill manifest',
        createdAt: 1,
        reviewedAt: null,
      },
    ]),
    reviewRequest: vi.fn(),
    listForEmployee: vi.fn(() => []),
    deleteGrant: vi.fn(),
  } as unknown as IpcHandlerDeps['authorityRepo'];
  const employeesRepo = {
    getById: vi.fn((id: string) =>
      id === 'employee-1'
        ? {
            id: 'employee-1',
            companyId: 'company-1',
            roleId: 'ceo',
            rolePackId: 'strategia-official',
            roleMdSha: 'sha',
            level: 'officer',
            name: 'Employee 1',
            title: 'CEO',
            status: 'idle',
            modelPref: null,
            providerPref: null,
            toolsAllowedJson: '[]',
            toolsDeniedJson: '[]',
            avatar: null,
            isSystem: false,
            createdAt: 1,
          }
        : null,
    ),
  } as unknown as IpcHandlerDeps['employeesRepo'];
  const authorityResolver = {
    resolveEmployee: vi.fn(
      (): EffectiveAuthoritySnapshot => ({
        companyId: 'company-1',
        employeeId: 'employee-1',
        entries: [],
        toolsAllowed: ['browse'],
        toolsDenied: ['shell'],
      }),
    ),
  };
  const approvalInboxService = {
    listItems: vi.fn(() => []),
    reviewItem: vi.fn(() => ({
      item: {
        id: 'request-1',
        companyId: 'company-1',
        kind: 'authority-request',
        status: 'approved',
        priority: 'high',
        requestedByOperatorId: null,
        requestedByEmployeeId: null,
        subjectRefKind: 'extension',
        subjectRefId: 'skill-1',
        summary: 'Authority review required for path C:/Projects/Alpha.',
        payload: {
          extensionId: 'skill-1',
          resourceKind: 'path',
          resourceId: 'C:/Projects/Alpha',
          requestedPermission: 'allow',
        },
        createdAt: 1,
        resolvedAt: 2,
        latestDecision: {
          id: 'decision-1',
          companyId: 'company-1',
          approvalKind: 'authority-request',
          approvalRefId: 'request-1',
          decision: 'approved',
          decidedByOperatorId: 'rocky',
          rationale: null,
          payload: null,
          createdAt: 2,
        },
      },
      grantId: 'grant-1',
    })),
  } as unknown as IpcHandlerDeps['approvalInboxService'];

  return {
    companiesRepo: noop,
    employeesRepo,
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
    extensionsRegistry: noop,
    approvalInboxService,
    authorityRepo,
    authorityResolver,
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

describe('authority IPC handlers', () => {
  it('creates a workspace grant through authority.create', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);
    const req: CreateAuthorityGrantRequest = {
      companyId: 'company-1',
      scopeKind: 'company',
      scopeId: 'company-1',
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      permission: 'allow',
    };

    const result = await handlers.authorityCreate(req);

    expect(deps.authorityRepo?.createGrant).toHaveBeenCalledWith({
      scopeKind: 'company',
      scopeId: 'company-1',
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      permission: 'allow',
      metadataJson: null,
    });
    expect(result).toEqual({ grantId: 'grant-1' });
  });

  it('rejects employee overrides for employees outside the target company', async () => {
    const deps = makeDeps({
      employeesRepo: {
        getById: vi.fn(() => ({
          id: 'employee-2',
          companyId: 'company-2',
          roleId: 'ceo',
          rolePackId: 'strategia-official',
          roleMdSha: 'sha',
          level: 'officer',
          name: 'Wrong Company',
          title: 'CEO',
          status: 'idle',
          modelPref: null,
          providerPref: null,
          toolsAllowedJson: '[]',
          toolsDeniedJson: '[]',
          avatar: null,
          isSystem: false,
          createdAt: 1,
        })),
      } as unknown as IpcHandlerDeps['employeesRepo'],
    });
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.authorityCreate({
        companyId: 'company-1',
        scopeKind: 'employee',
        scopeId: 'employee-2',
        resourceKind: 'path',
        resourceId: 'C:/Projects/Alpha',
        permission: 'allow',
      }),
    ).rejects.toThrow(/does not belong to company/);
  });

  it('forwards authority.getEffective to the resolver', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.authorityGetEffective({
      companyId: 'company-1',
      employeeId: 'employee-1',
    });

    expect(deps.authorityResolver?.resolveEmployee).toHaveBeenCalledWith('company-1', 'employee-1');
    expect(result.toolsAllowed).toEqual(['browse']);
    expect(result.toolsDenied).toEqual(['shell']);
  });

  it('deletes an existing grant through authority.delete', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await handlers.authorityDelete({ grantId: 'grant-1' });

    expect(deps.authorityRepo?.deleteGrant).toHaveBeenCalledWith('grant-1');
  });

  it('reviews a pending extension authority request and creates an extension-scoped grant on approval', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.authorityReviewRequest({
      companyId: 'company-1',
      requestId: 'request-1',
      decision: 'approved',
    });

    expect(deps.approvalInboxService?.reviewItem).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        itemId: 'request-1',
        kind: 'authority-request',
        decision: 'approved',
      }),
    );
    expect(result).toEqual({ grantId: 'grant-1' });
  });
});
