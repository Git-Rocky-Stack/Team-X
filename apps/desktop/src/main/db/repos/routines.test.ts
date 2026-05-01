import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createRoutinesRepo } from './routines.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createRoutinesRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createRoutinesRepo(ctx.db);
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

describe('routines repo', () => {
  it('creates routines and selects due rows by company', () => {
    const firstId = repo.create({
      companyId: 'company-1',
      name: 'Daily Review',
      slug: 'daily-review',
      enabled: true,
      triggerKind: 'daily',
      scheduleJson: JSON.stringify({ triggerKind: 'daily', timeOfDay: '09:00' }),
      workConfigJson: JSON.stringify({
        title: 'Review queue',
        description: '',
        assigneeId: 'employee-1',
        priority: 'high',
        labels: ['ops'],
      }),
      nextRunAt: 100,
    });
    repo.create({
      companyId: 'company-1',
      name: 'Weekly Sweep',
      slug: 'weekly-sweep',
      enabled: true,
      triggerKind: 'weekly',
      scheduleJson: JSON.stringify({ triggerKind: 'weekly', dayOfWeek: 1, timeOfDay: '10:00' }),
      workConfigJson: JSON.stringify({
        title: 'Sweep',
        description: '',
        assigneeId: null,
        priority: 'medium',
        labels: [],
      }),
      nextRunAt: 500,
    });

    const due = repo.listDueByCompany('company-1', 200);

    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe(firstId);
  });

  it('creates and updates routine runs', () => {
    const routineId = repo.create({
      companyId: 'company-1',
      name: 'Interval Sweep',
      slug: 'interval-sweep',
      enabled: true,
      triggerKind: 'interval',
      scheduleJson: JSON.stringify({ triggerKind: 'interval', intervalMinutes: 30 }),
      workConfigJson: JSON.stringify({
        title: 'Sweep',
        description: '',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: ['ops'],
      }),
      nextRunAt: 200,
    });

    const runId = repo.createRun({
      companyId: 'company-1',
      routineId,
      status: 'running',
      reason: 'scheduled',
      startedAt: 100,
      scheduledFor: 90,
    });
    repo.updateRun(runId, {
      status: 'success',
      finishedAt: 120,
      ticketId: 'ticket-1',
      message: 'Created ticket ticket-1',
    });

    expect(repo.getRunById(runId)).toEqual(
      expect.objectContaining({
        id: runId,
        status: 'success',
        finishedAt: 120,
        ticketId: 'ticket-1',
      }),
    );
    expect(repo.listRunsByCompany('company-1', 10)).toHaveLength(1);
    expect(repo.listRunsByRoutine('company-1', routineId, 10)).toHaveLength(1);
  });
});
