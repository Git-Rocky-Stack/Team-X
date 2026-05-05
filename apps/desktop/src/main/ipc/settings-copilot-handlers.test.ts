/**
 * Unit tests for the `settings.getCopilot` + `settings.setCopilot` IPC
 * handlers. Exercises the IpcHandlers surface directly through
 * `createIpcHandlers()` with a stub deps surface — same pattern the
 * rest of `handlers.ts` uses (no electron, no DB, no orchestrator).
 *
 * Phase 5 — M33 T7.
 */

import type {
  CopilotCategory,
  CopilotCategoryWeights,
  SettingsGetCopilotResponse,
  SettingsGetCopilotWeightsRequest,
  SettingsGetCopilotWeightsResponse,
  SettingsSetCopilotRequest,
  SettingsSetCopilotWeightsRequest,
  SettingsSetCopilotWeightsResponse,
} from '@team-x/shared-types';
import { COPILOT_CATEGORY_WEIGHTS_DEFAULT } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeCopilotSnapshot(
  overrides: Partial<SettingsGetCopilotResponse> = {},
): SettingsGetCopilotResponse {
  return {
    enabled: true,
    intervalMinutes: 5,
    categories: ['operational', 'cost', 'org', 'workflow', 'anomaly'] as CopilotCategory[],
    ...overrides,
  };
}

function makeWeights(overrides: Partial<CopilotCategoryWeights> = {}): CopilotCategoryWeights {
  return {
    ...COPILOT_CATEGORY_WEIGHTS_DEFAULT,
    ...overrides,
  };
}

type CopilotWeightHandlers = ReturnType<typeof createIpcHandlers> & {
  settingsGetCopilotWeights(
    req: SettingsGetCopilotWeightsRequest,
  ): Promise<SettingsGetCopilotWeightsResponse>;
  settingsSetCopilotWeights(
    req: SettingsSetCopilotWeightsRequest,
  ): Promise<SettingsSetCopilotWeightsResponse>;
};

function asCopilotWeightHandlers(handlers: ReturnType<typeof createIpcHandlers>) {
  return handlers as CopilotWeightHandlers;
}

/**
 * Minimal deps harness — every property is a no-op stub EXCEPT the
 * settings repo and the copilot analyzer, which the two tests below
 * observe. `createIpcHandlers` only wires closures lazily so unused
 * reps can stay as empty objects cast to the right interface.
 */
function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const settingsRepo = {
    get: vi.fn(),
    set: vi.fn(),
    getAgentic: vi.fn(),
    setAgentic: vi.fn(),
    getPlanner: vi.fn(),
    setPlanner: vi.fn(),
    getCopilot: vi.fn(() => makeCopilotSnapshot()),
    setCopilot: vi.fn(),
    getCopilotWeights: vi.fn(() => ({ weights: makeWeights() })),
    setCopilotWeights: vi.fn(() => ({ weights: makeWeights() })),
  } as unknown as IpcHandlerDeps['settingsRepo'];
  const copilotAnalyzerService = { restart: vi.fn() };
  const bus = { emit: vi.fn() };
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
    copilotAnalyzerService,
    bus,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('settings.getCopilot IPC handler', () => {
  it('round-trips the repo snapshot through the handler', async () => {
    const snapshot = makeCopilotSnapshot({
      enabled: false,
      intervalMinutes: 17,
      categories: ['operational', 'anomaly'] as CopilotCategory[],
    });
    const getCopilot = vi.fn(() => snapshot);
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot,
      setCopilot: vi.fn(),
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const handlers = createIpcHandlers(makeDeps({ settingsRepo }));

    const result = await handlers.settingsGetCopilot();

    expect(getCopilot).toHaveBeenCalledTimes(1);
    expect(result).toEqual(snapshot);
  });
});

describe('settings.getCopilotWeights IPC handler', () => {
  it('requires companyId', async () => {
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps()));

    await expect(handlers.settingsGetCopilotWeights({ companyId: '' })).rejects.toThrow(
      /settings\.getCopilotWeights: companyId is required/,
    );
  });

  it('round-trips the repo weight snapshot through the handler', async () => {
    const snapshot = { weights: makeWeights({ cost: 0.4 }) };
    const getCopilotWeights = vi.fn(() => snapshot);
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot: vi.fn(() => makeCopilotSnapshot()),
      setCopilot: vi.fn(),
      getCopilotWeights,
      setCopilotWeights: vi.fn(),
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps({ settingsRepo })));

    const result = await handlers.settingsGetCopilotWeights({ companyId: 'company-42' });

    expect(getCopilotWeights).toHaveBeenCalledTimes(1);
    expect(result).toEqual(snapshot);
  });
});

describe('settings.setCopilotWeights IPC handler', () => {
  it('requires companyId', async () => {
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps()));

    await expect(
      handlers.settingsSetCopilotWeights({ companyId: '', weights: { cost: 0.5 } }),
    ).rejects.toThrow(/settings\.setCopilotWeights: companyId is required/);
  });

  it('persists and returns the repo-clamped weights', async () => {
    const before = { weights: makeWeights() };
    const after = { weights: makeWeights({ cost: 0.3 }) };
    const req: SettingsSetCopilotWeightsRequest = {
      companyId: 'company-42',
      weights: { cost: 0.25 },
    };
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot: vi.fn(() => makeCopilotSnapshot()),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(() => before),
      setCopilotWeights: vi.fn(() => after),
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps({ settingsRepo })));

    const result = await handlers.settingsSetCopilotWeights(req);

    expect(settingsRepo.setCopilotWeights).toHaveBeenCalledWith(req);
    expect(result).toEqual(after);
  });

  it('emits copilot.weights.changed with changedKeys after the durable write', async () => {
    const before = { weights: makeWeights() };
    const after = { weights: makeWeights({ cost: 0.3, org: 2 }) };
    const setCopilotWeights = vi.fn(() => after);
    const bus = { emit: vi.fn() };
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot: vi.fn(() => makeCopilotSnapshot()),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(() => before),
      setCopilotWeights,
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps({ settingsRepo, bus })));

    const result = await handlers.settingsSetCopilotWeights({
      companyId: 'company-42',
      weights: { cost: 0.25, org: 2 },
    });

    expect(setCopilotWeights).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'copilot.weights.changed',
        companyId: 'company-42',
        actorId: 'rocky',
        actorKind: 'user',
        payload: expect.objectContaining({
          weights: result.weights,
          changedKeys: ['cost', 'org'],
        }),
      }),
    );
  });

  it('swallows bus emit failures after the durable write', async () => {
    const before = { weights: makeWeights() };
    const after = { weights: makeWeights({ workflow: 0 }) };
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot: vi.fn(() => makeCopilotSnapshot()),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(() => before),
      setCopilotWeights: vi.fn(() => after),
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const bus = {
      emit: vi.fn(() => {
        throw new Error('bus down');
      }),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers = asCopilotWeightHandlers(createIpcHandlers(makeDeps({ settingsRepo, bus })));

    const result = await handlers.settingsSetCopilotWeights({
      companyId: 'company-42',
      weights: { workflow: 0 },
    });

    expect(settingsRepo.setCopilotWeights).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledTimes(1);
    expect(result).toEqual(after);
    consoleError.mockRestore();
  });
});

describe('settings.setCopilot IPC handler', () => {
  it('persists the patch and restarts the per-company analyzer timer', async () => {
    const setCopilot = vi.fn();
    const restart = vi.fn();
    const settingsRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getCopilot: vi.fn(() => makeCopilotSnapshot()),
      setCopilot,
    } as unknown as IpcHandlerDeps['settingsRepo'];
    const copilotAnalyzerService = { restart };
    const handlers = createIpcHandlers(makeDeps({ settingsRepo, copilotAnalyzerService }));

    const req: SettingsSetCopilotRequest = {
      companyId: 'company-42',
      enabled: true,
      intervalMinutes: 11,
      categories: ['operational'] as CopilotCategory[],
    };
    await handlers.settingsSetCopilot(req);

    // Repo write fires first so the analyzer restart sees the new
    // persisted settings on its next `getSettings` call.
    expect(setCopilot).toHaveBeenCalledTimes(1);
    expect(setCopilot).toHaveBeenCalledWith(req);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledWith('company-42');
  });
});
