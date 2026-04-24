import { describe, expect, it, vi } from 'vitest';

import type {
  CreateRoutineRequest,
  ListRoutineRunsRequest,
  Routine,
  RoutineRun,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const routineService = {
    start: vi.fn(),
    stop: vi.fn(),
    list: vi.fn((): Routine[] => [
      {
        id: 'routine-1',
        companyId: 'company-1',
        name: 'Daily Review',
        slug: 'daily-review',
        enabled: true,
        triggerKind: 'daily',
        schedule: { triggerKind: 'daily', timeOfDay: '09:00' },
        workKind: 'ticket',
        workConfig: {
          title: 'Review queue',
          description: '',
          assigneeId: 'employee-1',
          priority: 'high',
          labels: ['ops'],
        },
        lastRunStatus: 'never',
        lastRunMessage: null,
        lastRunAt: null,
        nextRunAt: 100,
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    listRuns: vi.fn((): RoutineRun[] => [
      {
        id: 'run-1',
        companyId: 'company-1',
        routineId: 'routine-1',
        status: 'success',
        reason: 'manual',
        workKind: 'ticket',
        scheduledFor: null,
        startedAt: 10,
        finishedAt: 20,
        ticketId: 'ticket-1',
        message: 'Created ticket ticket-1',
        errorMessage: null,
      },
    ]),
    create: vi.fn(() => 'routine-1'),
    update: vi.fn(),
    delete: vi.fn(),
    runNow: vi.fn(
      async (): Promise<RoutineRun> => ({
        id: 'run-1',
        companyId: 'company-1',
        routineId: 'routine-1',
        status: 'success',
        reason: 'manual',
        workKind: 'ticket',
        scheduledFor: null,
        startedAt: 10,
        finishedAt: 20,
        ticketId: 'ticket-1',
        message: 'Created ticket ticket-1',
        errorMessage: null,
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
    routineService,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('routine IPC handlers', () => {
  it('lists routines through routines.list', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.routinesList({ companyId: 'company-1' });

    expect(deps.routineService?.list).toHaveBeenCalledWith('company-1');
    expect(result[0]?.triggerKind).toBe('daily');
  });

  it('creates routines through routines.create', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);
    const req: CreateRoutineRequest = {
      companyId: 'company-1',
      name: 'Queue Sweep',
      schedule: { triggerKind: 'interval', intervalMinutes: 60 },
      workConfig: {
        title: 'Sweep queue',
        description: '',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: ['ops'],
      },
    };

    const result = await handlers.routinesCreate(req);

    expect(deps.routineService?.create).toHaveBeenCalledWith(req);
    expect(result).toEqual({ routineId: 'routine-1' });
  });

  it('rejects invalid trigger kinds before dispatch', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.routinesCreate({
        companyId: 'company-1',
        name: 'Broken',
        schedule: { triggerKind: 'broken' as never },
        workConfig: {
          title: 'Broken',
          description: '',
          assigneeId: null,
          priority: 'low',
          labels: [],
        },
      }),
    ).rejects.toThrow(/schedule.triggerKind is invalid/i);
  });

  it('lists runs and supports run-now dispatch', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);
    const listReq: ListRoutineRunsRequest = {
      companyId: 'company-1',
      routineId: 'routine-1',
      limit: 5,
    };

    const history = await handlers.routinesListRuns(listReq);
    const run = await handlers.routinesRunNow({ routineId: 'routine-1' });

    expect(deps.routineService?.listRuns).toHaveBeenCalledWith(listReq);
    expect(deps.routineService?.runNow).toHaveBeenCalledWith({ routineId: 'routine-1' });
    expect(history[0]?.ticketId).toBe('ticket-1');
    expect(run.status).toBe('success');
  });
});
