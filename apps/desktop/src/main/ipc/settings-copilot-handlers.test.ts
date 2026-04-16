/**
 * Unit tests for the `settings.getCopilot` + `settings.setCopilot` IPC
 * handlers. Exercises the IpcHandlers surface directly through
 * `createIpcHandlers()` with a stub deps surface — same pattern the
 * rest of `handlers.ts` uses (no electron, no DB, no orchestrator).
 *
 * Phase 5 — M33 T7.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  CopilotCategory,
  SettingsGetCopilotResponse,
  SettingsSetCopilotRequest,
} from '@team-x/shared-types';

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
  } as unknown as IpcHandlerDeps['settingsRepo'];
  const copilotAnalyzerService = { restart: vi.fn() };
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
