import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const artifactRows: ArtifactRecord[] = [
    {
      id: 'artifact-1',
      companyId: 'company-1',
      kind: 'ticket-output',
      outcomeKind: 'artifact-created',
      status: 'ready',
      title: 'Standup follow-up',
      summary: 'Created ticket ticket-1',
      sourceKind: 'routine-run',
      sourceRefId: 'run-1',
      ticketId: 'ticket-1',
      fileId: null,
      approvalItemId: null,
      approvalDecisionId: null,
      uri: 'ticket:ticket-1',
      preview: { ticketId: 'ticket-1', runId: 'run-1' },
      createdByEmployeeId: 'employee-1',
      createdByRoutineId: 'routine-1',
      approvedByOperatorId: null,
      createdAt: 10,
      updatedAt: 10,
    },
  ];

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
    artifactService: {
      list: vi.fn(() => artifactRows),
    },
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('artifact IPC handlers', () => {
  it('lists artifacts through artifacts.list', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.artifactsList({ companyId: 'company-1', limit: 50 });

    expect(deps.artifactService?.list).toHaveBeenCalledWith({ companyId: 'company-1', limit: 50 });
    expect(result[0]?.sourceKind).toBe('routine-run');
  });

  it('rejects invalid artifact list limits before dispatch', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await expect(handlers.artifactsList({ companyId: 'company-1', limit: 0 })).rejects.toThrow(
      /limit must be an integer between 1 and 200/i,
    );
  });
});
