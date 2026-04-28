import { describe, expect, it, vi } from 'vitest';

import type {
  AutonomyBenchmarkReport,
  AutonomyDoctorReport,
  RuntimeOperationsSnapshot,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const runtimeOperationsService = {
    snapshot: vi.fn(
      (companyId: string): RuntimeOperationsSnapshot => ({
        companyId,
        generatedAt: 500,
        sessions: [
          {
            id: 'session-1',
            companyId,
            employeeId: 'employee-1',
            runtimeProfileId: 'profile-1',
            adapterKind: 'codex',
            status: 'working',
            currentRunId: 'run-1',
            currentTicketId: 'ticket-1',
            pid: null,
            endpointUrl: null,
            workspacePath: 'C:\\Team-X\\runtime-home',
            capabilities: { heartbeatContract: 'team-x-runtime-heartbeat/v1' },
            lastHeartbeatAt: 450,
            leaseExpiresAt: 650,
            failureReason: null,
            startedAt: 100,
            endedAt: null,
            createdAt: 100,
            updatedAt: 450,
          },
        ],
        activeCheckouts: [
          {
            id: 'checkout-1',
            companyId,
            ticketId: 'ticket-1',
            employeeId: 'employee-1',
            runtimeSessionId: 'session-1',
            runId: 'run-1',
            status: 'active',
            claimedAt: 120,
            lastHeartbeatAt: 450,
            expiresAt: 650,
            releasedAt: null,
            releaseReason: null,
            createdAt: 120,
            updatedAt: 450,
          },
        ],
      }),
    ),
  };
  const autonomyDoctorService = {
    run: vi.fn(
      async (input: { companyId: string }): Promise<AutonomyDoctorReport> => ({
        companyId: input.companyId,
        generatedAt: 600,
        status: 'ok',
        checks: [],
        totals: {
          ok: 0,
          warning: 0,
          blocked: 0,
          findingCount: 0,
        },
      }),
    ),
  };
  const autonomyBenchmarkService = {
    run: vi.fn(
      async (input: {
        companyId: string;
        runtimeKinds?: string[];
        scenarioIds?: string[];
      }): Promise<AutonomyBenchmarkReport> => ({
        id: 'benchmark-1',
        generatedAt: 700,
        mode: 'control-plane-simulated',
        runtimeKinds: (input.runtimeKinds ?? ['bash']) as AutonomyBenchmarkReport['runtimeKinds'],
        scenarioIds: (input.scenarioIds ?? [
          'race-for-one-ticket',
        ]) as AutonomyBenchmarkReport['scenarioIds'],
        results: [],
        summary: {
          scenarioCount: 0,
          passedCount: 0,
          failedCount: 0,
          successRate: 0,
          duplicateWorkRate: 0,
          meanLatencyMs: 0,
          meanStaleRecoveryMs: null,
          totalCostUsd: '0.000000',
          totalTokenCount: 0,
          operatorInterventions: 0,
          artifactCompleteness: 0,
        },
      }),
    ),
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
    settingsRepo: noop,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    getHardwareProfile: () => ({}) as never,
    runtimeOperationsService,
    autonomyDoctorService,
    autonomyBenchmarkService,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('runtime operations IPC handlers', () => {
  it('returns the live runtime operations snapshot for a company', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.runtimeOperationsSnapshot({ companyId: 'company-1' });

    expect(deps.runtimeOperationsService?.snapshot).toHaveBeenCalledWith('company-1');
    expect(result.sessions[0]?.status).toBe('working');
    expect(result.activeCheckouts[0]?.ticketId).toBe('ticket-1');
  });

  it('rejects snapshot reads without a company id', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(handlers.runtimeOperationsSnapshot({ companyId: '' })).rejects.toThrow(
      /companyId is required/i,
    );
  });

  it('runs the autonomy doctor report for a company', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.autonomyDoctorRun({ companyId: 'company-1' });

    expect(deps.autonomyDoctorService?.run).toHaveBeenCalledWith({ companyId: 'company-1' });
    expect(result.status).toBe('ok');
  });

  it('rejects autonomy doctor runs without a company id', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(handlers.autonomyDoctorRun({ companyId: '' })).rejects.toThrow(
      /companyId is required/i,
    );
  });

  it('runs autonomy benchmark reports for selected runtimes and scenarios', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.autonomyBenchmarkRun({
      companyId: 'company-1',
      runtimeKinds: ['bash'],
      scenarioIds: ['race-for-one-ticket'],
    });

    expect(deps.autonomyBenchmarkService?.run).toHaveBeenCalledWith({
      companyId: 'company-1',
      runtimeKinds: ['bash'],
      scenarioIds: ['race-for-one-ticket'],
    });
    expect(result.mode).toBe('control-plane-simulated');
  });

  it('rejects autonomy benchmark runs without a company id', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(handlers.autonomyBenchmarkRun({ companyId: '' })).rejects.toThrow(
      /companyId is required/i,
    );
  });

  it('rejects unknown autonomy benchmark runtime and scenario filters', async () => {
    const handlers = createIpcHandlers(makeDeps());

    await expect(
      handlers.autonomyBenchmarkRun({
        companyId: 'company-1',
        runtimeKinds: ['unknown-runtime' as never],
      }),
    ).rejects.toThrow(/unknown runtime kind/i);
    await expect(
      handlers.autonomyBenchmarkRun({
        companyId: 'company-1',
        scenarioIds: ['unknown-scenario' as never],
      }),
    ).rejects.toThrow(/unknown scenario/i);
  });
});
