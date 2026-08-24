/**
 * React Query hooks for the `privateOperator.*` IPC surface — planning for
 * supervising this workspace from a device that is not the workstation.
 *
 * Both channels are reads, and both are *pure*: asking for a plan changes
 * nothing and opens nothing. That is why these are `useQuery` and not
 * mutations, and why a mode change is a cache-key change rather than a write.
 *
 * ## Read-only by default
 *
 * The three opt-ins default to `false` here as well as in the main-process
 * handler. The duplication is deliberate: the handler's defaults protect the
 * workspace from a malformed payload, and these protect the panel from
 * accidentally *displaying* a plan that authorises more than the operator
 * asked for. A caller has to name the escalation to see it.
 *
 * Routes through `@/lib/ipc` rather than `window.teamx`, matching `use-rag.ts`
 * and `use-local-gguf.ts`.
 */

import { useQuery } from '@tanstack/react-query';
import type {
  PrivateOperatorAccessMode,
  PrivateOperatorAccessPlan,
  PrivateOperatorAccessRequest,
  PrivateOperatorMissionControlSnapshot,
} from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

/** What a caller may vary. `companyId` is positional; everything else opts in. */
export interface PrivateOperatorOptions {
  operatorId?: string | null;
  mode?: PrivateOperatorAccessMode;
  allowApprovalActions?: boolean;
  allowRuntimeActions?: boolean;
  allowSecretChanges?: boolean;
}

/**
 * Build the full request explicitly rather than spreading the options object.
 * Every field is always present, so the cache key below and the payload the
 * main process receives can never disagree about what was asked for.
 */
function toRequest(
  companyId: string,
  options: PrivateOperatorOptions,
): PrivateOperatorAccessRequest {
  return {
    companyId,
    operatorId: options.operatorId ?? null,
    mode: options.mode ?? 'localhost',
    allowApprovalActions: options.allowApprovalActions === true,
    allowRuntimeActions: options.allowRuntimeActions === true,
    allowSecretChanges: options.allowSecretChanges === true,
  };
}

/**
 * Key on the resolved request, not on `companyId` alone. A plan for
 * `hosted-bridge` says something different from a plan for `localhost`, so
 * sharing one cache entry between them would show the operator a decision
 * record for an exposure mode they are no longer looking at.
 */
function keyFor(scope: string, req: PrivateOperatorAccessRequest) {
  return [
    'private-operator',
    scope,
    req.companyId,
    req.operatorId,
    req.mode,
    req.allowApprovalActions,
    req.allowRuntimeActions,
    req.allowSecretChanges,
  ] as const;
}

/** `privateOperator.plan` — which actions this exposure would permit, and why. */
export function usePrivateOperatorPlan(
  companyId: string | null,
  options: PrivateOperatorOptions = {},
) {
  const enabled = typeof companyId === 'string' && companyId.length > 0;
  const request = toRequest(companyId ?? '', options);
  return useQuery<PrivateOperatorAccessPlan>({
    queryKey: keyFor('plan', request),
    queryFn: () => ipc.privateOperator.plan(request),
    enabled,
  });
}

/** `privateOperator.snapshot` — the plan plus the state it authorises reading. */
export function usePrivateOperatorSnapshot(
  companyId: string | null,
  options: PrivateOperatorOptions = {},
) {
  const enabled = typeof companyId === 'string' && companyId.length > 0;
  const request = toRequest(companyId ?? '', options);
  return useQuery<PrivateOperatorMissionControlSnapshot>({
    queryKey: keyFor('snapshot', request),
    queryFn: () => ipc.privateOperator.snapshot(request),
    enabled,
  });
}
