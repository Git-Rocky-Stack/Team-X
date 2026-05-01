import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createRuntimeProfilesRepo } from './runtime-profiles.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createRuntimeProfilesRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createRuntimeProfilesRepo(ctx.db);
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

describe('runtime profiles repo', () => {
  it('creates and updates runtime profiles', () => {
    const profileId = repo.create({
      companyId: 'company-1',
      name: 'Mission Control Internal',
      slug: 'mission-control-internal',
      kind: 'teamx-internal',
      configJson: JSON.stringify({ providerId: 'anthropic' }),
    });

    repo.update(profileId, {
      name: 'Mission Control Cloud',
      lastHealthStatus: 'healthy',
      lastHealthMessage: 'Ready',
      lastValidatedAt: 10,
    });

    expect(repo.getById(profileId)).toEqual(
      expect.objectContaining({
        id: profileId,
        name: 'Mission Control Cloud',
        kind: 'teamx-internal',
        lastHealthStatus: 'healthy',
        lastHealthMessage: 'Ready',
        lastValidatedAt: 10,
      }),
    );
  });

  it('upserts one runtime binding per employee', () => {
    const firstProfileId = repo.create({
      companyId: 'company-1',
      name: 'Internal',
      slug: 'internal',
      kind: 'teamx-internal',
    });
    const secondProfileId = repo.create({
      companyId: 'company-1',
      name: 'HTTP',
      slug: 'http',
      kind: 'http',
    });

    const firstBinding = repo.upsertBinding({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: firstProfileId,
    });
    const secondBinding = repo.upsertBinding({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: secondProfileId,
    });

    expect(secondBinding.id).toBe(firstBinding.id);
    expect(repo.getBindingByEmployeeId('employee-1')).toEqual(
      expect.objectContaining({
        id: firstBinding.id,
        runtimeProfileId: secondProfileId,
      }),
    );
  });

  it('lists company bindings and deletes them by employee', () => {
    const profileId = repo.create({
      companyId: 'company-1',
      name: 'Internal',
      slug: 'internal',
      kind: 'teamx-internal',
    });

    repo.upsertBinding({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: profileId,
    });
    expect(repo.listBindingsByCompany('company-1')).toHaveLength(1);

    repo.deleteBindingByEmployeeId('employee-1');
    expect(repo.listBindingsByCompany('company-1')).toEqual([]);
  });
});
