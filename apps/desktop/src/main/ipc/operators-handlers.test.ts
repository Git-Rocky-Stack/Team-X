import { describe, expect, it, vi } from 'vitest';

import type {
  CompanySharingReadinessSummary,
  OperatorAccessEntry,
  OperatorInvite,
} from '@team-x/shared-types';

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
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
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
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
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
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
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

  it('lists operator invites for a workspace', async () => {
    const invites: OperatorInvite[] = [
      {
        id: 'invite-1',
        companyId: 'company-1',
        email: 'ops@strategia-x.com',
        displayName: 'Shared Operator',
        authMode: 'invited',
        role: 'operator',
        note: 'Bring in shared supervision.',
        inviteToken: 'token-1',
        status: 'pending',
        invitedByOperatorId: 'rocky',
        createdAt: 5,
        updatedAt: 5,
        resolvedAt: null,
      },
    ];
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(),
      listByCompany: vi.fn(() => []),
      listInvitesByCompany: vi.fn(() => invites),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsListInvites({ companyId: 'company-1' });

    expect(operatorAccessService.listInvitesByCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual(invites);
  });

  it('creates an operator invite through the operator access service', async () => {
    const invite: OperatorInvite = {
      id: 'invite-1',
      companyId: 'company-1',
      email: 'ops@strategia-x.com',
      displayName: 'Shared Operator',
      authMode: 'cloud',
      role: 'admin',
      note: 'Shared workspace pilot.',
      inviteToken: 'token-1',
      status: 'pending',
      invitedByOperatorId: 'rocky',
      createdAt: 5,
      updatedAt: 5,
      resolvedAt: null,
    };
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(),
      listByCompany: vi.fn(() => []),
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(() => invite),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        companiesRepo: {
          list: vi.fn(() => []),
          create: vi.fn(() => 'company-1'),
          getById: vi.fn(() => ({
            id: 'company-1',
            name: 'Acme',
            slug: 'acme',
            status: 'running',
            theme: 'dark',
            icon: null,
            createdAt: 1,
            settingsJson: '{}',
            workspaceOriginId: 'company-1',
            companyOriginId: 'company-1',
          })),
          archive: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        } as unknown as IpcHandlerDeps['companiesRepo'],
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsCreateInvite({
      companyId: 'company-1',
      email: ' ops@strategia-x.com ',
      displayName: 'Shared Operator',
      authMode: 'cloud',
      role: 'admin',
      note: 'Shared workspace pilot.',
    });

    expect(operatorAccessService.createInvite).toHaveBeenCalledWith({
      companyId: 'company-1',
      email: 'ops@strategia-x.com',
      displayName: 'Shared Operator',
      authMode: 'cloud',
      role: 'admin',
      note: 'Shared workspace pilot.',
    });
    expect(result).toEqual({ invite });
  });

  it('revokes an operator invite', async () => {
    const invite: OperatorInvite = {
      id: 'invite-1',
      companyId: 'company-1',
      email: 'ops@strategia-x.com',
      displayName: null,
      authMode: 'invited',
      role: 'operator',
      note: null,
      inviteToken: 'token-1',
      status: 'revoked',
      invitedByOperatorId: 'rocky',
      createdAt: 5,
      updatedAt: 10,
      resolvedAt: 10,
    };
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(),
      listByCompany: vi.fn(() => []),
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(() => invite),
      acceptInvite: vi.fn(),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsRevokeInvite({ inviteId: 'invite-1' });

    expect(operatorAccessService.revokeInvite).toHaveBeenCalledWith('invite-1');
    expect(result).toEqual(invite);
  });

  it('accepts a pending operator invite into a real membership', async () => {
    const resultPayload = {
      invite: {
        id: 'invite-1',
        companyId: 'company-1',
        email: 'ops@strategia-x.com',
        displayName: 'Shared Operator',
        authMode: 'invited',
        role: 'admin',
        note: null,
        inviteToken: 'token-1',
        status: 'accepted',
        invitedByOperatorId: 'rocky',
        acceptedOperatorId: 'operator-2',
        createdAt: 5,
        updatedAt: 6,
        resolvedAt: 6,
      },
      operatorId: 'operator-2',
      membershipId: 'membership-2',
      reusedOperator: false,
    };
    const operatorAccessService = {
      ensureLocalOwnerForCompany: vi.fn(() => ({
        operatorId: 'rocky',
        membershipId: 'membership-1',
      })),
      getSharingReadiness: vi.fn(),
      listByCompany: vi.fn(() => []),
      listInvitesByCompany: vi.fn(() => []),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(() => resultPayload),
    };
    const handlers = createIpcHandlers(
      makeDeps({
        operatorAccessService,
      }),
    );

    const result = await handlers.operatorsAcceptInvite({ inviteId: 'invite-1' });

    expect(operatorAccessService.acceptInvite).toHaveBeenCalledWith('invite-1');
    expect(result).toEqual(resultPayload);
  });
});
