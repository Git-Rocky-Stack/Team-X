/**
 * Unit tests for the proactive.* IPC handlers.
 *
 * Exercises the IpcHandlers surface directly through createIpcHandlers()
 * with a stub deps surface. Tests cover:
 * - proactive.setEnabled
 * - proactive.decomposeGoal
 * - proactive.scanForWork
 * - proactive.getState
 *
 * Phase 6 — Proactive Execution System — Slice 3
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ProactiveDecomposeGoalRequest,
  ProactiveDecomposeGoalResponse,
  ProactiveScanForWorkRequest,
  ProactiveScanForWorkResponse,
  ProactiveSetEnabledRequest,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

type ProactiveHandlers = ReturnType<typeof createIpcHandlers> & {
  proactiveSetEnabled(req: ProactiveSetEnabledRequest): Promise<void>;
  proactiveDecomposeGoal(
    req: ProactiveDecomposeGoalRequest,
  ): Promise<ProactiveDecomposeGoalResponse>;
  proactiveScanForWork(
    req: ProactiveScanForWorkRequest,
  ): Promise<ProactiveScanForWorkResponse>;
  proactiveGetState(req: { companyId: string }): Promise<{
    enabled: boolean;
    activeWork: number;
    queuedWork: number;
    lastScanAt: number | null;
  }>;
};

function asProactiveHandlers(handlers: ReturnType<typeof createIpcHandlers>) {
  return handlers as ProactiveHandlers;
}

/**
 * Minimal deps harness for proactive handler tests.
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
    getCopilot: vi.fn(),
    setCopilot: vi.fn(),
    getCopilotWeights: vi.fn(),
    setCopilotWeights: vi.fn(),
    getProactive: vi.fn(() => ({ enabled: true, autonomyMode: 'balanced' })),
    setProactive: vi.fn(),
  } as unknown as IpcHandlerDeps['settingsRepo'];

  const proactiveTriggerService = {
    isEnabled: vi.fn(() => true),
    setEnabled: vi.fn(),
    decomposeGoal: vi.fn().mockResolvedValue(undefined),
    scanForWork: vi.fn().mockResolvedValue({ queuedCount: 0 }),
  };

  const bus = {
    emit: vi.fn(),
    replaySince: vi.fn(() => []),
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
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    extensionsRegistry: noop,
    skillsService: noop,
    operatorAccessService: noop,
    cloudLinkService: noop,
    runtimeProfilesService: noop,
    runtimeOperationsService: noop,
    autonomyDoctorService: noop,
    autonomyBenchmarkService: noop,
    routineService: noop,
    budgetGovernanceService: noop,
    approvalInboxService: noop,
    artifactService: noop,
    companyPortabilityService: noop,
    threadDigestService: noop,
    runCheckpointService: noop,
    contextAssemblerService: noop,
    contextPackerService: noop,
    authorityRepo: noop,
    authorityResolver: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    copilotInsightsRepo: noop,
    copilotAnalyzerService: noop,
    copilotEventWindow: noop,
    bus,
    ensurePostRestoreBootstrap: noop,
    ensureSystemForCompany: noop,
    getHardwareProfile: noop,
    proactiveTriggerService,
    ...overrides,
  } as IpcHandlerDeps;
}

describe('proactive IPC handlers', () => {
  describe('proactive.setEnabled', () => {
    it('toggles proactive mode via service', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await handlers.proactiveSetEnabled({
        companyId: 'company-123',
        enabled: true,
      });

      expect(deps.proactiveTriggerService.setEnabled).toHaveBeenCalledWith({
        companyId: 'company-123',
        enabled: true,
      });
    });

    it('validates companyId is a non-empty string', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await expect(
        handlers.proactiveSetEnabled({
          companyId: '',
          enabled: true,
        }),
      ).rejects.toThrow(/companyId is required/);
    });
  });

  describe('proactive.decomposeGoal', () => {
    it('calls proactiveTriggerService.decomposeGoal with correct args', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      const result = await handlers.proactiveDecomposeGoal({
        companyId: 'company-123',
        goalId: 'goal-456',
      });

      expect(deps.proactiveTriggerService.decomposeGoal).toHaveBeenCalledWith({
        companyId: 'company-123',
        goalId: 'goal-456',
      });
      expect(result).toEqual({
        success: true,
      });
    });

    it('validates companyId is a non-empty string', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await expect(
        handlers.proactiveDecomposeGoal({
          companyId: '',
          goalId: 'goal-456',
        }),
      ).rejects.toThrow(/companyId is required/);
    });

    it('validates goalId is a non-empty string', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await expect(
        handlers.proactiveDecomposeGoal({
          companyId: 'company-123',
          goalId: '',
        }),
      ).rejects.toThrow(/goalId is required/);
    });
  });

  describe('proactive.scanForWork', () => {
    it('calls proactiveTriggerService.scanForWork and returns count', async () => {
      const deps = makeDeps();
      deps.proactiveTriggerService.scanForWork.mockResolvedValue({ queuedCount: 3 });
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      const result = await handlers.proactiveScanForWork({
        companyId: 'company-123',
      });

      expect(deps.proactiveTriggerService.scanForWork).toHaveBeenCalledWith({
        companyId: 'company-123',
      });
      expect(result).toEqual({
        queuedCount: 3,
      });
    });

    it('validates companyId is a non-empty string', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await expect(
        handlers.proactiveScanForWork({
          companyId: '',
        }),
      ).rejects.toThrow(/companyId is required/);
    });
  });

  describe('proactive.getState', () => {
    it('returns current proactive state', async () => {
      const deps = makeDeps();
      deps.proactiveTriggerService.isEnabled.mockReturnValue(true);
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      const result = await handlers.proactiveGetState({
        companyId: 'company-123',
      });

      expect(deps.proactiveTriggerService.isEnabled).toHaveBeenCalledWith('company-123');
      expect(result).toEqual({
        enabled: true,
        activeWork: 0,
        queuedWork: 0,
        lastScanAt: null,
      });
    });

    it('validates companyId is a non-empty string', async () => {
      const deps = makeDeps();
      const handlers = asProactiveHandlers(createIpcHandlers(deps));

      await expect(
        handlers.proactiveGetState({
          companyId: '',
        }),
      ).rejects.toThrow(/companyId is required/);
    });
  });
});
