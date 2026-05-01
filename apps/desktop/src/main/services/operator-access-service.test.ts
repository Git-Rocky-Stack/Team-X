import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from '../db/repos/companies.js';
import { createOperatorsRepo } from '../db/repos/operators.js';
import { companies } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import {
  LOCAL_OWNER_OPERATOR_ID,
  LOCAL_OWNER_OPERATOR_NAME,
  createOperatorAccessService,
} from './operator-access-service.js';

let ctx: TestDbHandle;
let companiesRepo: ReturnType<typeof createCompaniesRepo>;
let operatorsRepo: ReturnType<typeof createOperatorsRepo>;
let service: ReturnType<typeof createOperatorAccessService>;

beforeEach(async () => {
  ctx = await makeTestDb();
  companiesRepo = createCompaniesRepo(ctx.db);
  operatorsRepo = createOperatorsRepo(ctx.db);
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
        workspaceOriginId: 'company-alpha',
        companyOriginId: 'company-alpha',
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
        workspaceOriginId: 'company-beta',
        companyOriginId: 'company-beta',
      },
    ])
    .run();
  service = createOperatorAccessService({
    companiesRepo,
    operatorsRepo,
  });
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
    expect(() => service.resolveOperatorIdForCompany('company-beta', 'operator-invited')).toThrow(
      /does not belong to company company-beta/i,
    );
  });

  it('summarizes sharing readiness for local, invited, and cloud posture', () => {
    service.ensureLocalOwnerForCompany('company-alpha');
    operatorsRepo.create({
      id: 'operator-invited',
      displayName: 'Invited Operator',
      authMode: 'invited',
    });
    operatorsRepo.upsertMembership({
      operatorId: 'operator-invited',
      companyId: 'company-alpha',
      role: 'operator',
      canApproveBudget: false,
      canApproveAuthority: false,
      canManageRoutines: false,
      canManageRuntimes: false,
    });
    companiesRepo.update('company-alpha', {
      settings: {
        sharing: {
          mode: 'cloud',
          readiness: 'warning',
          lastExportedAt: '2026-04-23T12:00:00.000Z',
          lastExportMode: 'template',
        },
      },
    });

    const summary = service.getSharingReadiness('company-alpha');

    expect(summary.configuredMode).toBe('cloud');
    expect(summary.effectiveMode).toBe('invited');
    expect(summary.operatorCount).toBe(2);
    expect(summary.ownerCount).toBe(1);
    expect(summary.invitedOperatorCount).toBe(1);
    expect(summary.cloudOperatorCount).toBe(0);
    expect(summary.readiness).toBe('warning');
    expect(summary.missingRequirements).toContain('Add at least one cloud operator identity.');
    expect(summary.modeReadiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'local', readiness: 'ready' }),
        expect.objectContaining({ mode: 'invited', readiness: 'ready' }),
        expect.objectContaining({ mode: 'cloud', readiness: 'warning' }),
      ]),
    );
  });

  it('creates and revokes shared operator invites with the local owner as inviter', () => {
    service.ensureLocalOwnerForCompany('company-alpha');

    const invite = service.createInvite({
      companyId: 'company-alpha',
      email: '  ops@strategia-x.com  ',
      displayName: ' Shared Operator ',
      authMode: 'invited',
      role: 'operator',
      note: ' Shared workspace pilot ',
    });

    expect(invite).toEqual(
      expect.objectContaining({
        companyId: 'company-alpha',
        email: 'ops@strategia-x.com',
        displayName: 'Shared Operator',
        authMode: 'invited',
        role: 'operator',
        sourceKind: 'local',
        cloudWorkspaceId: null,
        hostedInviteId: null,
        note: 'Shared workspace pilot',
        invitedByOperatorId: LOCAL_OWNER_OPERATOR_ID,
        status: 'pending',
      }),
    );

    expect(service.listInvitesByCompany('company-alpha')).toEqual([
      expect.objectContaining({ id: invite.id }),
    ]);

    const revoked = service.revokeInvite(invite.id);

    expect(revoked.status).toBe('revoked');
    expect(revoked.resolvedAt).not.toBeNull();
  });

  it('accepts a pending invite into a real operator membership', () => {
    service.ensureLocalOwnerForCompany('company-alpha');
    const invite = service.createInvite({
      companyId: 'company-alpha',
      email: 'shared@strategia-x.com',
      displayName: 'Shared Operator',
      authMode: 'invited',
      role: 'admin',
      note: 'Shared ops owner',
    });

    const accepted = service.acceptInvite(invite.id);

    expect(accepted.reusedOperator).toBe(false);
    expect(accepted.invite).toEqual(
      expect.objectContaining({
        id: invite.id,
        status: 'accepted',
        acceptedOperatorId: accepted.operatorId,
      }),
    );

    const entries = service.listByCompany('company-alpha');
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: expect.objectContaining({
            id: accepted.operatorId,
            email: 'shared@strategia-x.com',
            authMode: 'invited',
          }),
          membership: expect.objectContaining({
            companyId: 'company-alpha',
            role: 'admin',
            sourceKind: 'local',
            cloudWorkspaceId: null,
            hostedInviteId: null,
            canApproveBudget: true,
            canApproveAuthority: true,
            canManageRoutines: true,
            canManageRuntimes: true,
          }),
        }),
      ]),
    );
  });

  it('creates hosted invites and hosted memberships when the workspace is linked', () => {
    const hostedService = createOperatorAccessService({
      companiesRepo,
      operatorsRepo,
      cloudLinkService: {
        getWorkspaceLink: () => ({
          companyId: 'company-alpha',
          state: 'linked',
          cloudWorkspaceId: 'workspace_company-alpha',
          cloudTenantId: 'tenant_company-alpha',
          deviceId: 'device-1',
          linkedDeviceId: 'device-1',
          lastSyncedCursor: null,
          lastSnapshotId: null,
          lastSyncAt: null,
          lastSyncError: null,
          isLinked: true,
          canLink: false,
          canUnlink: true,
        }),
      },
    });
    hostedService.ensureLocalOwnerForCompany('company-alpha');

    const invite = hostedService.createInvite({
      companyId: 'company-alpha',
      email: 'cloud@strategia-x.com',
      displayName: 'Cloud Operator',
      authMode: 'cloud',
      role: 'reviewer',
      note: 'Hosted collaboration pilot',
    });

    expect(invite).toEqual(
      expect.objectContaining({
        sourceKind: 'hosted',
        cloudWorkspaceId: 'workspace_company-alpha',
      }),
    );
    expect(invite.hostedInviteId).toMatch(/^hosted_invite_workspace_company-alpha_/);

    const accepted = hostedService.acceptInvite(invite.id);
    const entries = hostedService.listByCompany('company-alpha');
    expect(accepted.invite).toEqual(
      expect.objectContaining({
        id: invite.id,
        sourceKind: 'hosted',
        cloudWorkspaceId: 'workspace_company-alpha',
        hostedInviteId: invite.hostedInviteId,
        status: 'accepted',
      }),
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operator: expect.objectContaining({
            id: accepted.operatorId,
            authMode: 'cloud',
          }),
          membership: expect.objectContaining({
            companyId: 'company-alpha',
            role: 'reviewer',
            sourceKind: 'hosted',
            cloudWorkspaceId: 'workspace_company-alpha',
            hostedInviteId: invite.hostedInviteId,
          }),
        }),
      ]),
    );
  });
});
