import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createOperatorsRepo } from './operators.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createOperatorsRepo>;

const COMPANY_ID = 'company-alpha';
const OTHER_COMPANY_ID = 'company-beta';

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createOperatorsRepo(ctx.db);
  ctx.db
    .insert(companies)
    .values([
      {
        id: COMPANY_ID,
        name: 'Alpha',
        slug: 'alpha',
        createdAt: 1,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
      {
        id: OTHER_COMPANY_ID,
        name: 'Beta',
        slug: 'beta',
        createdAt: 2,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
    ])
    .run();
});

afterEach(() => ctx.close());

describe('operators repo', () => {
  it('creates and lists operators', () => {
    const firstId = repo.create({
      id: 'operator-1',
      displayName: 'Local Owner',
      authMode: 'local',
    });
    const secondId = repo.create({
      id: 'operator-2',
      displayName: 'Invited Reviewer',
      authMode: 'invited',
      email: 'reviewer@example.com',
    });

    expect(firstId).toBe('operator-1');
    expect(secondId).toBe('operator-2');
    expect(repo.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'operator-1',
          displayName: 'Local Owner',
          authMode: 'local',
        }),
        expect.objectContaining({
          id: 'operator-2',
          email: 'reviewer@example.com',
          authMode: 'invited',
        }),
      ]),
    );
  });

  it('upserts company memberships idempotently', () => {
    repo.create({
      id: 'operator-1',
      displayName: 'Local Owner',
      authMode: 'local',
    });

    const firstId = repo.upsertMembership({
      operatorId: 'operator-1',
      companyId: COMPANY_ID,
      role: 'owner',
      canApproveBudget: true,
      canApproveAuthority: true,
    });
    const secondId = repo.upsertMembership({
      operatorId: 'operator-1',
      companyId: COMPANY_ID,
      role: 'admin',
      canManageRoutines: true,
      canManageRuntimes: true,
    });

    expect(secondId).toBe(firstId);
    expect(repo.getMembership('operator-1', COMPANY_ID)).toEqual(
      expect.objectContaining({
        id: firstId,
        role: 'admin',
        canApproveBudget: true,
        canApproveAuthority: true,
        canManageRoutines: true,
        canManageRuntimes: true,
      }),
    );
  });

  it('lists only memberships for the requested company', () => {
    repo.create({
      id: 'operator-1',
      displayName: 'Owner',
      authMode: 'local',
    });
    repo.create({
      id: 'operator-2',
      displayName: 'Reviewer',
      authMode: 'invited',
    });

    const membershipId = repo.upsertMembership({
      operatorId: 'operator-1',
      companyId: COMPANY_ID,
      role: 'owner',
    });
    repo.upsertMembership({
      operatorId: 'operator-2',
      companyId: OTHER_COMPANY_ID,
      role: 'reviewer',
    });

    expect(repo.listMembershipsByCompany(COMPANY_ID)).toEqual([
      expect.objectContaining({
        id: membershipId,
        operatorId: 'operator-1',
        companyId: COMPANY_ID,
      }),
    ]);
  });
});
