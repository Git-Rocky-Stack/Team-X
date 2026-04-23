import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { companies } from '../db/schema.js';
import { createOperatorsRepo } from '../db/repos/operators.js';
import {
  LOCAL_OWNER_OPERATOR_ID,
  LOCAL_OWNER_OPERATOR_NAME,
  createOperatorAccessService,
} from './operator-access-service.js';

let ctx: TestDbHandle;
let operatorsRepo: ReturnType<typeof createOperatorsRepo>;
let service: ReturnType<typeof createOperatorAccessService>;

beforeEach(async () => {
  ctx = await makeTestDb();
  operatorsRepo = createOperatorsRepo(ctx.db);
  service = createOperatorAccessService({ operatorsRepo });
  ctx.db
    .insert(companies)
    .values([
      {
        id: 'company-alpha',
        name: 'Alpha',
        slug: 'alpha',
        createdAt: 1,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
      {
        id: 'company-beta',
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

describe('operator access service', () => {
  it('bootstraps the local owner operator with the legacy durable id', () => {
    const operator = service.ensureLocalOwner();

    expect(operator).toEqual(
      expect.objectContaining({
        id: LOCAL_OWNER_OPERATOR_ID,
        displayName: LOCAL_OWNER_OPERATOR_NAME,
        authMode: 'local',
      }),
    );
    expect(service.getLocalOwnerId()).toBe(LOCAL_OWNER_OPERATOR_ID);
  });

  it('creates idempotent owner memberships for every workspace', () => {
    service.ensureLocalOwnerForCompanies(['company-alpha', 'company-beta']);
    service.ensureLocalOwnerForCompanies(['company-alpha', 'company-beta']);

    const alphaEntries = service.listByCompany('company-alpha');
    const betaEntries = service.listByCompany('company-beta');

    expect(alphaEntries).toEqual([
      expect.objectContaining({
        operator: expect.objectContaining({ id: LOCAL_OWNER_OPERATOR_ID }),
        membership: expect.objectContaining({
          companyId: 'company-alpha',
          role: 'owner',
          canApproveBudget: true,
          canApproveAuthority: true,
          canManageRoutines: true,
          canManageRuntimes: true,
        }),
      }),
    ]);
    expect(betaEntries).toEqual([
      expect.objectContaining({
        operator: expect.objectContaining({ id: LOCAL_OWNER_OPERATOR_ID }),
        membership: expect.objectContaining({
          companyId: 'company-beta',
          role: 'owner',
        }),
      }),
    ]);
  });

  it('resolves an explicit company member and rejects foreign operators', () => {
    operatorsRepo.create({
      id: 'operator-invited',
      displayName: 'Invited Operator',
      authMode: 'invited',
    });
    operatorsRepo.upsertMembership({
      operatorId: 'operator-invited',
      companyId: 'company-alpha',
      role: 'operator',
      canApproveBudget: true,
      canApproveAuthority: false,
      canManageRoutines: true,
      canManageRuntimes: false,
    });

    expect(service.resolveOperatorIdForCompany('company-alpha', 'operator-invited')).toBe(
      'operator-invited',
    );
    expect(service.resolveOperatorIdForCompany('company-beta')).toBe(LOCAL_OWNER_OPERATOR_ID);
    expect(() =>
      service.resolveOperatorIdForCompany('company-beta', 'operator-invited'),
    ).toThrow(/does not belong to company company-beta/i);
  });
});
