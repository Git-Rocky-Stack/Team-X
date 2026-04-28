import type {
  CompanySharingReadinessSummary,
  OperatorAccessEntry,
  OperatorInvite,
  RuntimeOperationsSnapshot,
} from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { createPrivateOperatorAccessService } from './private-operator-access-service.js';

const baseEntry: OperatorAccessEntry = {
  operator: {
    id: 'rocky',
    displayName: 'Local Owner',
    email: null,
    authMode: 'local',
    createdAt: 1,
    updatedAt: 1,
  },
  membership: {
    id: 'membership-1',
    operatorId: 'rocky',
    companyId: 'company-1',
    role: 'owner',
    sourceKind: 'local',
    cloudWorkspaceId: null,
    hostedInviteId: null,
    canApproveBudget: true,
    canApproveAuthority: true,
    canManageRoutines: true,
    canManageRuntimes: true,
    createdAt: 1,
    updatedAt: 1,
  },
};

const readiness: CompanySharingReadinessSummary = {
  companyId: 'company-1',
  configuredMode: 'local',
  effectiveMode: 'local',
  readiness: 'ready',
  missingRequirements: [],
  operatorCount: 1,
  ownerCount: 1,
  adminCount: 0,
  localOperatorCount: 1,
  invitedOperatorCount: 0,
  cloudOperatorCount: 0,
  hasWorkspaceOrigin: true,
  hasCompanyOrigin: true,
  lastExportedAt: null,
  lastExportMode: null,
  modeReadiness: [],
};

function makeService(entries: OperatorAccessEntry[] = [baseEntry], invites: OperatorInvite[] = []) {
  const runtimeSnapshot: RuntimeOperationsSnapshot = {
    companyId: 'company-1',
    generatedAt: 1234,
    sessions: [],
    activeCheckouts: [],
  };
  const runtimeOperationsService = {
    snapshot: vi.fn(() => runtimeSnapshot),
  };
  const service = createPrivateOperatorAccessService({
    now: () => 1234,
    operatorAccessService: {
      listByCompany: vi.fn(() => entries),
      getSharingReadiness: vi.fn(() => readiness),
      listInvitesByCompany: vi.fn(() => invites),
    },
    runtimeOperationsService,
  });
  return { service, runtimeOperationsService };
}

describe('private operator access service', () => {
  it('defaults to localhost-only read-only Mission Control supervision', () => {
    const { service } = makeService();

    const plan = service.plan({ companyId: 'company-1' });

    expect(plan).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        mode: 'localhost',
        status: 'warning',
        bindHost: '127.0.0.1',
        port: 48731,
        exposure: 'localhost-only',
        operatorId: 'rocky',
        operatorRole: 'owner',
      }),
    );
    expect(plan.allowedActions.map((action) => action.action)).toEqual([
      'mission-control.read',
      'runtime.read',
      'tickets.read',
      'artifacts.read',
    ]);
    expect(plan.blockedActions.map((action) => action.action)).toEqual([
      'approvals.review',
      'runtime.launch',
      'secrets.write',
    ]);
  });

  it('keeps Tailscale mode localhost-bound and documents private tunnel guidance', () => {
    const { service } = makeService();

    const plan = service.plan({ companyId: 'company-1', mode: 'tailscale' });

    expect(plan.bindHost).toBe('127.0.0.1');
    expect(plan.guidance.join('\n')).toMatch(/Tailscale/i);
    expect(plan.guardrails.join('\n')).toMatch(/0\.0\.0\.0/i);
  });

  it('blocks snapshots when callers attempt to bind the private surface publicly', () => {
    const { service, runtimeOperationsService } = makeService();

    const snapshot = service.snapshot({
      companyId: 'company-1',
      bindHost: '0.0.0.0',
    });

    expect(snapshot.access.status).toBe('blocked');
    expect(snapshot.access.warnings.join('\n')).toMatch(/Refusing private operator bind host/i);
    expect(snapshot.runtimeOperations).toBeNull();
    expect(runtimeOperationsService.snapshot).not.toHaveBeenCalled();
  });

  it('allows approval review only after explicit opt-in and operator capability checks', () => {
    const { service } = makeService();

    const plan = service.plan({
      companyId: 'company-1',
      allowApprovalActions: true,
    });

    expect(plan.allowedActions.map((action) => action.action)).toContain('approvals.review');
    expect(plan.blockedActions.map((action) => action.action)).not.toContain('approvals.review');
  });

  it('keeps secret changes local-only even when tunneled runtime actions are allowed', () => {
    const { service } = makeService();

    const plan = service.plan({
      companyId: 'company-1',
      mode: 'tailscale',
      allowApprovalActions: true,
      allowRuntimeActions: true,
      allowSecretChanges: true,
    });

    expect(plan.allowedActions.map((action) => action.action)).toContain('runtime.launch');
    expect(plan.blockedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'secrets.write',
          reason: expect.stringMatching(/local-only/i),
        }),
      ]),
    );
  });
});
