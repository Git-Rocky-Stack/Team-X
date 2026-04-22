import { describe, expect, it, vi } from 'vitest';

import type { TelemetryRunKind } from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const runsRepo = {
    companyStats: vi.fn((_companyId: string, _kind?: TelemetryRunKind) => ({
      totalRuns: 0,
      totalTokens: 0,
      totalCostUsd: '0',
      avgLatencyMs: 0,
      totalToolCalls: 0,
    })),
    dailyUsage: vi.fn(
      (_companyId: string, _fromMs: number, _toMs: number, _kind?: TelemetryRunKind) => [],
    ),
    employeeStats: vi.fn((_companyId: string, _kind?: TelemetryRunKind) => []),
    recentRuns: vi.fn((_companyId: string, _limit: number, _kind?: TelemetryRunKind) => []),
    costBreakdown: vi.fn(
      (_companyId: string, _fromMs?: number, _toMs?: number, _kind?: TelemetryRunKind) => [],
    ),
  } as unknown as IpcHandlerDeps['runsRepo'];

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
    runsRepo,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo: noop,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    copilotAnalyzerService: noop,
    bus: noop,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('telemetry IPC handlers', () => {
  it('passes kind through to all telemetry aggregate repo methods', async () => {
    const runsRepo = makeDeps().runsRepo;
    const handlers = createIpcHandlers(makeDeps({ runsRepo }));

    await handlers.telemetryCompanyStats({ companyId: 'company-1', kind: 'agentic' });
    await handlers.telemetryDailyUsage({
      companyId: 'company-1',
      fromMs: 10,
      toMs: 20,
      kind: 'copilot',
    });
    await handlers.telemetryEmployeeStats({ companyId: 'company-1', kind: 'work' });
    await handlers.telemetryRecentRuns({ companyId: 'company-1', kind: 'agentic', limit: 6 });
    await handlers.telemetryCostBreakdown({
      companyId: 'company-1',
      fromMs: 30,
      toMs: 40,
      kind: 'agentic',
    });

    expect(runsRepo.companyStats).toHaveBeenCalledWith('company-1', 'agentic');
    expect(runsRepo.dailyUsage).toHaveBeenCalledWith('company-1', 10, 20, 'copilot');
    expect(runsRepo.employeeStats).toHaveBeenCalledWith('company-1', 'work');
    expect(runsRepo.recentRuns).toHaveBeenCalledWith('company-1', 6, 'agentic');
    expect(runsRepo.costBreakdown).toHaveBeenCalledWith('company-1', 30, 40, 'agentic');
  });

  it('rejects invalid runtime kind values before repo access', async () => {
    const runsRepo = makeDeps().runsRepo;
    const handlers = createIpcHandlers(makeDeps({ runsRepo }));

    await expect(
      handlers.telemetryCompanyStats({
        companyId: 'company-1',
        kind: 'invalid-kind',
      } as never),
    ).rejects.toThrow(/telemetry\.companyStats: kind must be work, agentic, or copilot/);

    expect(runsRepo.companyStats).not.toHaveBeenCalled();
  });

  it('rejects invalid recent-runs limits before repo access', async () => {
    const runsRepo = makeDeps().runsRepo;
    const handlers = createIpcHandlers(makeDeps({ runsRepo }));

    await expect(
      handlers.telemetryRecentRuns({
        companyId: 'company-1',
        kind: 'agentic',
        limit: 0,
      }),
    ).rejects.toThrow(/telemetry\.recentRuns: limit must be between 1 and 12/);

    expect(runsRepo.recentRuns).not.toHaveBeenCalled();
  });
});
