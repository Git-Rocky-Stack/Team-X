import { describe, expect, it, vi } from 'vitest';

import type { SkillAssignment } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const companiesRepo = {
    getById: vi.fn((id: string) =>
      id === 'company-1'
        ? {
            id: 'company-1',
            name: 'Alpha',
            slug: 'alpha',
            status: 'running',
            icon: null,
            theme: 'dark',
            createdAt: 1,
            settingsJson: '{}',
          }
        : null,
    ),
  } as unknown as IpcHandlerDeps['companiesRepo'];
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
  const skillsService = {
    installLocal: vi.fn(async () => ({ extensionId: 'skill-1' })),
    installGithub: vi.fn(async () => ({ extensionId: 'skill-2' })),
    listAssignments: vi.fn((): SkillAssignment[] => [
      {
        id: 'assign-1',
        extensionId: 'skill-1',
        companyId: 'company-1',
        employeeId: null,
        enabled: true,
        source: 'workspace-default',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'assign-2',
        extensionId: 'missing-skill',
        companyId: 'company-1',
        employeeId: null,
        enabled: true,
        source: 'workspace-default',
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    upsertAssignment: vi.fn(() => 'assign-1'),
    deleteAssignment: vi.fn(),
  } as unknown as IpcHandlerDeps['skillsService'];
  const extensionsRegistry = {
    listByCompany: vi.fn(() => [
      {
        id: 'skill-1',
        companyId: 'company-1',
        kind: 'skill',
        name: 'Ops Briefing',
        slug: 'ops-briefing',
        sourceKind: 'local',
        sourceRef: 'C:/skills/ops-briefing',
        version: '1.0.0',
        updateChannel: null,
        manifestJson: '{}',
        requestedCapabilitiesJson: '[]',
        requestedPathsJson: '[]',
        enabled: true,
        trustState: 'trusted',
        runtimeRefId: null,
        installedAt: 1,
        updatedAt: 1,
      },
      {
        id: 'mcp-1',
        companyId: 'company-1',
        kind: 'mcp',
        name: 'Context7',
        slug: 'context7',
        sourceKind: 'template',
        sourceRef: 'Built-in template',
        version: null,
        updateChannel: null,
        manifestJson: '{}',
        requestedCapabilitiesJson: '[]',
        requestedPathsJson: '[]',
        enabled: true,
        trustState: 'trusted',
        runtimeRefId: 'server-1',
        installedAt: 1,
        updatedAt: 1,
      },
    ]),
  } as unknown as IpcHandlerDeps['extensionsRegistry'];

  return {
    companiesRepo,
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
    extensionsRegistry,
    skillsService,
    authorityRepo: noop,
    authorityResolver: noop,
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

describe('skill IPC handlers', () => {
  it('forwards local installs to the skills service', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.extensionsInstallLocalSkill({
      companyId: 'company-1',
      folderPath: 'C:/skills/ops-briefing',
    });

    expect(deps.skillsService?.installLocal).toHaveBeenCalledWith({
      companyId: 'company-1',
      folderPath: 'C:/skills/ops-briefing',
    });
    expect(result).toEqual({ extensionId: 'skill-1' });
  });

  it('lists only assignments for skills visible to the target workspace', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.extensionsListSkillAssignments({ companyId: 'company-1' });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'assign-1',
        extensionId: 'skill-1',
      }),
    ]);
  });

  it('rejects assignment writes for non-skill extensions', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.extensionsUpsertSkillAssignment({
        companyId: 'company-1',
        extensionId: 'mcp-1',
        enabled: true,
      }),
    ).rejects.toThrow(/extension must be a skill/i);
  });

  it('deletes a persisted assignment through the skills service', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await handlers.extensionsDeleteSkillAssignment({ assignmentId: 'assign-1' });

    expect(deps.skillsService?.deleteAssignment).toHaveBeenCalledWith('assign-1');
  });
});
