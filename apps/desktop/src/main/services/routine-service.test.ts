import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { companies, employees } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createRoutineService } from './routine-service.js';

let ctx: TestDbHandle;

beforeEach(async () => {
  ctx = await makeTestDb();
  ctx.db
    .insert(companies)
    .values({
      id: 'company-1',
      name: 'Alpha',
      slug: 'alpha',
      createdAt: 1,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    })
    .run();
  ctx.db
    .insert(employees)
    .values({
      id: 'employee-1',
      companyId: 'company-1',
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha',
      level: 'officer',
      name: 'Iris',
      title: 'CEO',
      status: 'idle',
      modelPref: null,
      providerPref: null,
      toolsAllowedJson: '[]',
      toolsDeniedJson: '[]',
      avatar: null,
      isSystem: false,
      createdAt: 1,
    })
    .run();
});

afterEach(() => ctx.close());

describe('routine service', () => {
  it('creates routines with computed next run time and unique slugs', () => {
    const nowMs = 1_000;
    const service = createRoutineService({
      routinesRepo: createRoutinesRepo(ctx.db),
      companiesRepo: createCompaniesRepo(ctx.db),
      employeesRepo: createEmployeesRepo(ctx.db),
      createTicket: vi.fn(async () => ({ ticketId: 'ticket-1' })),
      now: () => nowMs,
    });

    const firstId = service.create({
      companyId: 'company-1',
      name: 'Daily Review',
      schedule: { triggerKind: 'daily', timeOfDay: '09:00' },
      workConfig: {
        title: 'Review queue',
        description: '',
        assigneeId: 'employee-1',
        priority: 'high',
        labels: ['ops'],
      },
    });
    const secondId = service.create({
      companyId: 'company-1',
      name: 'Daily Review',
      schedule: { triggerKind: 'daily', timeOfDay: '09:00' },
      workConfig: {
        title: 'Review queue again',
        description: '',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: [],
      },
    });

    const routines = service.list('company-1');

    expect(firstId).not.toBe(secondId);
    expect(routines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'daily-review', nextRunAt: expect.any(Number) }),
        expect.objectContaining({ slug: 'daily-review-2' }),
      ]),
    );
  });

  it('materializes due routines into visible tickets and persists the run', async () => {
    let nowMs = new Date('2026-04-22T08:00:00.000Z').getTime();
    const createTicket = vi.fn(async () => ({ ticketId: 'ticket-42' }));
    const service = createRoutineService({
      routinesRepo: createRoutinesRepo(ctx.db),
      companiesRepo: createCompaniesRepo(ctx.db),
      employeesRepo: createEmployeesRepo(ctx.db),
      createTicket,
      now: () => nowMs,
    });

    const routineId = service.create({
      companyId: 'company-1',
      name: 'Interval Sweep',
      schedule: { triggerKind: 'interval', intervalMinutes: 30 },
      workConfig: {
        title: 'Sweep queue',
        description: 'Check blockers',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: ['ops'],
      },
    });

    nowMs += 31 * 60_000;
    const runs = await service.tick('company-1');
    const routines = service.list('company-1');
    const history = service.listRuns({ companyId: 'company-1', routineId });

    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        title: 'Sweep queue',
        assigneeId: 'employee-1',
      }),
    );
    expect(runs[0]).toEqual(
      expect.objectContaining({
        routineId,
        status: 'success',
        ticketId: 'ticket-42',
      }),
    );
    expect(history[0]?.ticketId).toBe('ticket-42');
    expect(routines[0]?.lastRunStatus).toBe('success');
    expect(routines[0]?.nextRunAt).toBeGreaterThan(nowMs);
  });

  it('persists failed manual runs and rethrows the error', async () => {
    const service = createRoutineService({
      routinesRepo: createRoutinesRepo(ctx.db),
      companiesRepo: createCompaniesRepo(ctx.db),
      employeesRepo: createEmployeesRepo(ctx.db),
      createTicket: vi.fn(async () => {
        throw new Error('ticket path unavailable');
      }),
      now: () => 2_000,
    });

    const routineId = service.create({
      companyId: 'company-1',
      name: 'Manual Drill',
      enabled: false,
      schedule: { triggerKind: 'interval', intervalMinutes: 60 },
      workConfig: {
        title: 'Drill',
        description: '',
        assigneeId: null,
        priority: 'low',
        labels: [],
      },
    });

    await expect(service.runNow({ routineId })).rejects.toThrow('ticket path unavailable');

    const history = service.listRuns({ companyId: 'company-1', routineId });
    expect(history[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        errorMessage: 'ticket path unavailable',
      }),
    );
  });
});
