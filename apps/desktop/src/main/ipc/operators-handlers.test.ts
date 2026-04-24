import { describe, expect, it, vi } from 'vitest';

import type { CompanySharingReadinessSummary, OperatorAccessEntry } from '@team-x/shared-types';

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
      getSharingReadiness: vi.fn(),
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

  it('returns workspace sharing readiness', async () => {
    const readiness: CompanySharingReadinessSummary = {
      companyId: 'company-1',
      configuredMode: 'invited',
      effectiveMode: 'local',
      readiness: 'warning',
      missingRequirements: ['Add at least one invited operator membership.'],
      operatorCount: 1,
      ownerCount: 1,
      adminCount: 0,
      localOperatorCount: 1,
      invitedOperatorCount: 0,
      cloudOperatorCount: 0,
      hasWorkspaceOrigin: true,
      hasCompanyOrigin: true,
      lastExportedAt: null,
      lastExportMode: null,
      modeReadiness: [
        {
          mode: 'local',
          readiness: 'ready',
          missingRequirements: [],
          summary: 'Local-first posture with no external operator requirements.',
        },
        {
          mode: 'invited',
          readiness: 'warning',
          missingRequirements: ['Add at least one invited operator membership.'],
          summary:
            'Invited posture uses local-first memberships so more than one human can supervise the workspace.',
        },
        {
          mode: 'cloud',
          readiness: 'warning',
          missingRequirements: [
            'Add at least one cloud operator identity.',
            'Export the workspace or save a template before sharing it.',
          ],
          summary:
            'Cloud posture prepares the workspace for hosted/shared supervision once real sync and auth land.',
        },
      ],
    };
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(() => readiness),
      listByCompany: vi.fn(() => []),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsReadiness({ companyId: 'company-1' });

    expect(operatorAccessService.getSharingReadiness).toHaveBeenCalledWith('company-1');
    expect(result).toEqual(readiness);
  });

  it('bootstraps a local owner membership when a new company is created', async () => {
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(),
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
