/**
 * `privateOperator.*` IPC handlers — expose the private-operator access plan
 * and its mission-control snapshot to the renderer's Settings panel.
 *
 * Kept in its own module rather than folded into the monolithic `handlers.ts`
 * for the reason the rag/vault/backup splits give: the service is a pure
 * decision function over two other services, so the `handlers.ts` DI surface
 * does not need to grow a dependency for one read-only pair of channels.
 *
 * This module is the trust boundary. `createPrivateOperatorAccessService`
 * already normalises what it is given — an unknown mode falls back to
 * `localhost`, a non-loopback bind host raises a warning that blocks every
 * action — but "the service would have caught it" is defence in depth, not a
 * reason to forward renderer input verbatim. So the request is rebuilt field by
 * field here:
 *
 *   - `companyId` must be a non-empty string, or the call throws.
 *   - the three opt-in flags are compared against `true` rather than coerced,
 *     because `"false"`, `1` and `{}` are all truthy and any of them reaching
 *     `Boolean(...)` would unlock a rung of the capability ladder the operator
 *     never opted into.
 *   - `mode` is accepted only if it is a member of PRIVATE_OPERATOR_ACCESS_MODES.
 *   - `bindHost` and `port` are dropped entirely. Where the listener would bind
 *     is a main-process policy decision; the renderer has no say in it, so the
 *     field never leaves this function.
 *
 * Unit-tested against a hand-rolled fake service in
 * `private-operator-handlers.test.ts`; the Electron wiring that maps these onto
 * `ipcMain.handle` lives in `main/index.ts` next to the service construction.
 */

import type {
  PrivateOperatorAccessMode,
  PrivateOperatorAccessPlan,
  PrivateOperatorAccessRequest,
  PrivateOperatorMissionControlSnapshot,
} from '@team-x/shared-types';
import { PRIVATE_OPERATOR_ACCESS_MODES } from '@team-x/shared-types';

export interface PrivateOperatorHandlersDeps {
  privateOperatorAccessService: {
    plan(input: PrivateOperatorAccessRequest): PrivateOperatorAccessPlan;
    snapshot(input: PrivateOperatorAccessRequest): PrivateOperatorMissionControlSnapshot;
  };
}

export interface PrivateOperatorHandlers {
  /** `privateOperator.plan` — what this workspace would allow, and why. */
  plan(req: PrivateOperatorAccessRequest): Promise<PrivateOperatorAccessPlan>;
  /** `privateOperator.snapshot` — the plan plus the state it authorises reading. */
  snapshot(req: PrivateOperatorAccessRequest): Promise<PrivateOperatorMissionControlSnapshot>;
}

/**
 * Identity-compare against `true`. `Boolean("false")` is `true`, and that one
 * coercion is the whole difference between "the operator enabled secret
 * mutation" and "a malformed payload said something truthy".
 */
function optIn(value: unknown): boolean {
  return value === true;
}

function normalizeMode(value: unknown): PrivateOperatorAccessMode {
  return PRIVATE_OPERATOR_ACCESS_MODES.includes(value as PrivateOperatorAccessMode)
    ? (value as PrivateOperatorAccessMode)
    : 'localhost';
}

/**
 * Rebuild the request from known fields only. Note this returns a fresh object
 * literal — `bindHost` and `port` are absent by construction, not deleted.
 */
function sanitize(
  req: PrivateOperatorAccessRequest,
  channel: string,
): PrivateOperatorAccessRequest {
  if (typeof req?.companyId !== 'string' || req.companyId.length === 0) {
    throw new Error(`[ipc] ${channel}: companyId is required`);
  }
  return {
    companyId: req.companyId,
    operatorId: typeof req.operatorId === 'string' && req.operatorId ? req.operatorId : null,
    mode: normalizeMode(req.mode),
    allowApprovalActions: optIn(req.allowApprovalActions),
    allowRuntimeActions: optIn(req.allowRuntimeActions),
    allowSecretChanges: optIn(req.allowSecretChanges),
  };
}

export function buildPrivateOperatorHandlers(
  deps: PrivateOperatorHandlersDeps,
): PrivateOperatorHandlers {
  return {
    async plan(req) {
      return deps.privateOperatorAccessService.plan(sanitize(req, 'privateOperator.plan'));
    },

    async snapshot(req) {
      return deps.privateOperatorAccessService.snapshot(sanitize(req, 'privateOperator.snapshot'));
    },
  };
}
