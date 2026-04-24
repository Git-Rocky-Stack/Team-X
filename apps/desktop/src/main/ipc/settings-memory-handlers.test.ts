import { describe, expect, it, vi } from 'vitest';

import type { SettingsGetMemoryResponse, SettingsSetMemoryRequest } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeMemorySnapshot(
  overrides: Partial<SettingsGetMemoryResponse> = {},
): SettingsGetMemoryResponse {
  return {
    defaultTargetTokenBudget: 4096,
    recentTurnLimit: 12,
    checkpointHistoryLimit: 6,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const settingsRepo = {
    get: vi.fn(),
    set: vi.fn(),
    getAgentic: vi.fn(),
    setAgentic: vi.fn(),
    getPlanner: vi.fn(),
    setPlanner: vi.fn(),
    getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
    setExtensions: vi.fn(),
    getMemory: vi.fn(() => makeMemorySnapshot()),
    setMemory: vi.fn(),
    getCopilot: vi.fn(() => ({ enabled: true, intervalMinutes: 5, categories: [] })),
    setCopilot: vi.fn(),
    getCopilotWeights: vi.fn(() => ({ weights: {} })),
    setCopilotWeights: vi.fn(() => ({ weights: {} })),
  } as unknown as IpcHandlerDeps['settingsRepo'];

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
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    copilotAnalyzerService: { restart: vi.fn() },
    bus: { emit: vi.fn() } as never,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('settings.getMemory IPC handler', () => {
  it('round-trips the repo snapshot through the handler', async () => {
    const snapshot = makeMemorySnapshot({ defaultTargetTokenBudget: 8192, recentTurnLimit: 18 });
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(),
      getMemory: vi.fn(() => snapshot),
      setMemory: vi.fn(),
      getCopilot: vi.fn(() => ({ enabled: true, intervalMinutes: 5, categories: [] })),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(() => ({ weights: {} })),
      setCopilotWeights: vi.fn(() => ({ weights: {} })),
    } as unknown as IpcHandlerDeps['settingsRepo'];

    const handlers = createIpcHandlers(makeDeps({ settingsRepo }));
    const result = await handlers.settingsGetMemory();

    expect(settingsRepo.getMemory).toHaveBeenCalledTimes(1);
    expect(result).toEqual(snapshot);
  });
});

describe('settings.setMemory IPC handler', () => {
  it('persists the requested patch through the settings repo', async () => {
    const req: SettingsSetMemoryRequest = {
      defaultTargetTokenBudget: 2048,
      recentTurnLimit: 14,
      checkpointHistoryLimit: 8,
    };
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(),
      getMemory: vi.fn(() => makeMemorySnapshot()),
      setMemory: vi.fn(),
      getCopilot: vi.fn(() => ({ enabled: true, intervalMinutes: 5, categories: [] })),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(() => ({ weights: {} })),
      setCopilotWeights: vi.fn(() => ({ weights: {} })),
    } as unknown as IpcHandlerDeps['settingsRepo'];

    const handlers = createIpcHandlers(makeDeps({ settingsRepo }));
    await handlers.settingsSetMemory(req);

    expect(settingsRepo.setMemory).toHaveBeenCalledWith(req);
  });
});
