import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createScheduleItemsRepo } from './schedule-items.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createScheduleItemsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createScheduleItemsRepo(ctx.db);

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

describe('schedule items repo', () => {
  it('creates and lists scheduled items by company in calendar order', () => {
    const laterId = repo.create({
      companyId: 'company-1',
      title: 'Later task',
      description: 'Move after the early task',
      kind: 'task',
      priority: 'medium',
      startsAt: 200,
      assigneeId: 'employee-1',
      createdById: 'rocky',
      createdByKind: 'user',
    });
    const earlyId = repo.create({
      companyId: 'company-1',
      title: 'Early deadline',
      kind: 'deadline',
      priority: 'high',
      startsAt: 100,
      reminderAt: 80,
      createdById: 'rocky',
      createdByKind: 'user',
    });

    const list = repo.listByCompany('company-1');

    expect(list.map((item) => item.id)).toEqual([earlyId, laterId]);
    expect(list[0]).toEqual(
      expect.objectContaining({
        title: 'Early deadline',
        kind: 'deadline',
        priority: 'high',
        sourceKind: 'manual',
        startsAt: 100,
        reminderAt: 80,
      }),
    );
  });

  it('updates nullable fields and deletes scheduled items', () => {
    const id = repo.create({
      companyId: 'company-1',
      title: 'Initial',
      startsAt: 100,
      assigneeId: 'employee-1',
      createdById: 'rocky',
    });

    repo.update(id, {
      title: 'Completed',
      status: 'completed',
      assigneeId: null,
      completedAt: 250,
    });

    expect(repo.getById(id)).toEqual(
      expect.objectContaining({
        title: 'Completed',
        status: 'completed',
        assigneeId: null,
        completedAt: 250,
      }),
    );

    repo.delete(id);
    expect(repo.getById(id)).toBeNull();
  });
});
