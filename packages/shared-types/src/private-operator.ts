/**
 * Private operator access — the contract for supervising a Team-X workspace
 * from a device that is not the workstation running it.
 *
 * These types live in `shared-types` rather than beside the service that
 * computes them because both sides of the IPC boundary need them: the main
 * process builds a plan, and the renderer's Settings panel renders the
 * guardrails, warnings, and per-action decisions it contains.
 *
 * Nothing here opens a socket. A plan is a *decision record* — what the
 * workspace would allow, and why — computed from operator membership and the
 * requested exposure mode. The transport that would act on it is deliberately
 * not part of this contract.
 */

import type {
  CompanySharingReadinessSummary,
  OperatorAccessEntry,
  OperatorInvite,
} from './entities.js';
// `RuntimeOperationsSnapshot` is declared in ipc.ts, which in turn imports the
// plan types declared here. Both directions are `import type`, so the cycle is
// erased at compile time and never reaches a module graph at runtime.
import type { RuntimeOperationsSnapshot } from './ipc.js';

/**
 * How a non-workstation device would reach the workspace.
 *
 * `localhost` is the only mode that never leaves the machine, which is why it
 * is the default and the only mode permitted to authorise secret mutation.
 */
export const PRIVATE_OPERATOR_ACCESS_MODES = ['localhost', 'tailscale', 'hosted-bridge'] as const;
export type PrivateOperatorAccessMode = (typeof PRIVATE_OPERATOR_ACCESS_MODES)[number];

/**
 * The capability ladder, in the order it is meant to be climbed: read-only
 * supervision first, approval review second, runtime launch third, and secret
 * mutation last.
 */
export const PRIVATE_OPERATOR_ACCESS_ACTIONS = [
  'mission-control.read',
  'runtime.read',
  'tickets.read',
  'artifacts.read',
  'approvals.review',
  'runtime.launch',
  'secrets.write',
] as const;
export type PrivateOperatorAccessAction = (typeof PRIVATE_OPERATOR_ACCESS_ACTIONS)[number];

export type PrivateOperatorAccessStatus = 'ready' | 'warning' | 'blocked';

export interface PrivateOperatorAccessRequest {
  companyId: string;
  operatorId?: string | null;
  mode?: PrivateOperatorAccessMode;
  bindHost?: string;
  port?: number;
  allowApprovalActions?: boolean;
  allowRuntimeActions?: boolean;
  allowSecretChanges?: boolean;
}

export interface PrivateOperatorAccessActionDecision {
  action: PrivateOperatorAccessAction;
  allowed: boolean;
  reason: string;
}

export interface PrivateOperatorAccessPlan {
  companyId: string;
  generatedAt: number;
  mode: PrivateOperatorAccessMode;
  status: PrivateOperatorAccessStatus;
  bindHost: string;
  port: number;
  operatorId: string | null;
  operatorRole: OperatorAccessEntry['membership']['role'] | null;
  exposure: 'localhost-only';
  guidance: string[];
  warnings: string[];
  guardrails: string[];
  allowedActions: PrivateOperatorAccessActionDecision[];
  blockedActions: PrivateOperatorAccessActionDecision[];
}

export interface PrivateOperatorMissionControlSnapshot {
  companyId: string;
  generatedAt: number;
  access: PrivateOperatorAccessPlan;
  sharingReadiness: CompanySharingReadinessSummary;
  operators: OperatorAccessEntry[];
  pendingInvites: OperatorInvite[];
  runtimeOperations: RuntimeOperationsSnapshot | null;
}
