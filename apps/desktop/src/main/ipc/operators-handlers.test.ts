import { describe, expect, it, vi } from 'vitest';

import type { OperatorAccessEntry } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  return {
    companiesRepo: {
      list: vi.fn(() => []),
      create: vi.fn(() => 'company-1'),
      getById: vi.fn(() => null),
      archive: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

describe('operators IPC handlers', () => {
  it('lists workspace operator access entries', async () => {
    const entries: OperatorAccessEntry[] = [
      {
        operator: {
          id: 'rocky',
          displayName: 'Local Owner',
          email: null,
          authMode: 'local',
          createdAt: 1,
          updatedAt: 1,
        },
        membership: {
          id: 'membership-1',
          operatorId: 'rocky',
          companyId: 'company-1',
          role: 'owner',
          canApproveBudget: true,
          canApproveAuthority: true,
          canManageRoutines: true,
          canManageRuntimes: true,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      listByCompany: vi.fn(() => entries),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsList({ companyId: 'company-1' });

    expect(operatorAccessService.listByCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual(entries);
  });

  it('bootstraps a local owner membership when a new company is created', async () => {
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      listByCompany: vi.fn(() => []),
    };
    const ensureSystemForCompany = vi.fn(() => ({
      agentEmployeeId: 'system-agent',
      copilotEmployeeId: 'system-copilot',
      agentCreated: true,
      copilotCreated: true,
    }));
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
        ensureSystemForCompany,
        bus: {
          emit: vi.fn(),
        },
      }),
    );

    const result = await handlers.companiesCreate({ name: 'Acme', slug: 'acme' });

    expect(operatorAccessService.ensureLocalOwnerForCompany).toHaveBeenCalledWith('company-1');
    expect(ensureSystemForCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual({
      companyId: 'company-1',
      systemAgentEmployeeId: 'system-agent',
      systemCopilotEmployeeId: 'system-copilot',
    });
  });
});
