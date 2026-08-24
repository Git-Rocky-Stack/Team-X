import type {
  PrivateOperatorAccessPlan,
  PrivateOperatorMissionControlSnapshot,
} from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  type PrivateOperatorHandlersDeps,
  buildPrivateOperatorHandlers,
} from './private-operator-handlers.js';

const PLAN: PrivateOperatorAccessPlan = {
  companyId: 'c1',
  generatedAt: 1_700_000_000_000,
  mode: 'localhost',
  status: 'ready',
  bindHost: '127.0.0.1',
  port: 48731,
  operatorId: 'op-1',
  operatorRole: 'owner',
  exposure: 'localhost-only',
  guidance: ['Bind to localhost only by default.'],
  warnings: [],
  guardrails: ['Never bind the private operator surface to 0.0.0.0 or a LAN address.'],
  allowedActions: [{ action: 'mission-control.read', allowed: true, reason: 'read-only first' }],
  blockedActions: [{ action: 'secrets.write', allowed: false, reason: 'final stage' }],
};

const SNAPSHOT: PrivateOperatorMissionControlSnapshot = {
  companyId: 'c1',
  generatedAt: 1_700_000_000_000,
  access: PLAN,
  sharingReadiness: {
    companyId: 'c1',
    readiness: 'ready',
    mode: 'local',
    operatorCount: 1,
    pendingInviteCount: 0,
    blockers: [],
    warnings: [],
  },
  operators: [],
  pendingInvites: [],
  runtimeOperations: null,
};

function makeDeps(
  overrides: Partial<PrivateOperatorHandlersDeps> = {},
): PrivateOperatorHandlersDeps {
  return {
    privateOperatorAccessService: {
      plan: vi.fn(() => PLAN),
      snapshot: vi.fn(() => SNAPSHOT),
    },
    ...overrides,
  };
}

describe('privateOperator.plan', () => {
  it('returns the plan the service computed', async () => {
    const handlers = buildPrivateOperatorHandlers(makeDeps());
    await expect(handlers.plan({ companyId: 'c1' })).resolves.toEqual(PLAN);
  });

  it('rejects a missing companyId instead of planning for an empty workspace', async () => {
    const handlers = buildPrivateOperatorHandlers(makeDeps());
    await expect(handlers.plan({ companyId: '' })).rejects.toThrow(/companyId is required/);
  });

  it('forwards the four opt-in flags when the renderer sets them', async () => {
    const deps = makeDeps();
    const handlers = buildPrivateOperatorHandlers(deps);
    await handlers.plan({
      companyId: 'c1',
      operatorId: 'op-9',
      mode: 'tailscale',
      allowApprovalActions: true,
      allowRuntimeActions: true,
      allowSecretChanges: true,
    });
    expect(deps.privateOperatorAccessService.plan).toHaveBeenCalledWith({
      companyId: 'c1',
      operatorId: 'op-9',
      mode: 'tailscale',
      allowApprovalActions: true,
      allowRuntimeActions: true,
      allowSecretChanges: true,
    });
  });

  it('coerces a truthy non-boolean opt-in to false rather than escalating', async () => {
    // The renderer is across a trust boundary. `"false"`, `1` and `{}` are all
    // truthy in JS, so a plain `Boolean(input.allowSecretChanges)` here would
    // let a malformed payload unlock the highest rung of the capability ladder.
    const deps = makeDeps();
    const handlers = buildPrivateOperatorHandlers(deps);
    await handlers.plan({
      companyId: 'c1',
      allowSecretChanges: 'true' as unknown as boolean,
      allowRuntimeActions: 1 as unknown as boolean,
    });
    expect(deps.privateOperatorAccessService.plan).toHaveBeenCalledWith({
      companyId: 'c1',
      operatorId: null,
      mode: 'localhost',
      allowApprovalActions: false,
      allowRuntimeActions: false,
      allowSecretChanges: false,
    });
  });

  it('drops an unrecognised mode instead of forwarding renderer-supplied strings', async () => {
    const deps = makeDeps();
    const handlers = buildPrivateOperatorHandlers(deps);
    await handlers.plan({ companyId: 'c1', mode: 'public-internet' as never });
    expect(deps.privateOperatorAccessService.plan).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'localhost' }),
    );
  });

  it('never forwards a bindHost or port supplied by the renderer', async () => {
    // Bind host and port are a main-process policy decision. Accepting them
    // from the renderer would let the UI ask to listen on 0.0.0.0; the service
    // would warn, but the request should not reach it in the first place.
    const deps = makeDeps();
    const handlers = buildPrivateOperatorHandlers(deps);
    await handlers.plan({
      companyId: 'c1',
      bindHost: '0.0.0.0',
      port: 80,
    } as never);
    const forwarded = vi.mocked(deps.privateOperatorAccessService.plan).mock.calls[0]?.[0];
    expect(forwarded).not.toHaveProperty('bindHost');
    expect(forwarded).not.toHaveProperty('port');
  });
});

describe('privateOperator.snapshot', () => {
  it('returns the mission-control snapshot the service computed', async () => {
    const handlers = buildPrivateOperatorHandlers(makeDeps());
    await expect(handlers.snapshot({ companyId: 'c1' })).resolves.toEqual(SNAPSHOT);
  });

  it('rejects a missing companyId', async () => {
    const handlers = buildPrivateOperatorHandlers(makeDeps());
    await expect(handlers.snapshot({ companyId: '' })).rejects.toThrow(/companyId is required/);
  });

  it('applies the same flag coercion as plan', async () => {
    const deps = makeDeps();
    const handlers = buildPrivateOperatorHandlers(deps);
    await handlers.snapshot({
      companyId: 'c1',
      allowSecretChanges: 'yes' as unknown as boolean,
    });
    expect(deps.privateOperatorAccessService.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ allowSecretChanges: false }),
    );
  });
});
