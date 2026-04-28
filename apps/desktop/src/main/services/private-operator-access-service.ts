import type {
  CompanySharingReadinessSummary,
  OperatorAccessEntry,
  OperatorInvite,
  RuntimeOperationsSnapshot,
} from '@team-x/shared-types';

import type { OperatorAccessService } from './operator-access-service.js';
import type { RuntimeOperationsService } from './runtime-operations-service.js';

export const PRIVATE_OPERATOR_ACCESS_MODES = ['localhost', 'tailscale', 'hosted-bridge'] as const;
export type PrivateOperatorAccessMode = (typeof PRIVATE_OPERATOR_ACCESS_MODES)[number];

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

export interface PrivateOperatorAccessServiceDeps {
  operatorAccessService: Pick<
    OperatorAccessService,
    'getSharingReadiness' | 'listByCompany' | 'listInvitesByCompany'
  >;
  runtimeOperationsService: Pick<RuntimeOperationsService, 'snapshot'>;
  now?: () => number;
}

const DEFAULT_BIND_HOST = '127.0.0.1';
const DEFAULT_PORT = 48731;
const LOCALHOST_ALIASES = new Set(['127.0.0.1', 'localhost', '::1']);

function normalizeMode(
  mode: PrivateOperatorAccessMode | null | undefined,
): PrivateOperatorAccessMode {
  return mode && PRIVATE_OPERATOR_ACCESS_MODES.includes(mode) ? mode : 'localhost';
}

function normalizePort(port: number | null | undefined): number {
  if (!Number.isInteger(port)) return DEFAULT_PORT;
  return port as number;
}

function pushAction(
  decisions: PrivateOperatorAccessActionDecision[],
  action: PrivateOperatorAccessAction,
  allowed: boolean,
  reason: string,
): void {
  decisions.push({ action, allowed, reason });
}

function selectOperator(
  entries: readonly OperatorAccessEntry[],
  operatorId: string | null | undefined,
): OperatorAccessEntry | null {
  if (operatorId) {
    return entries.find((entry) => entry.operator.id === operatorId) ?? null;
  }
  return (
    entries.find((entry) => entry.membership.role === 'owner') ??
    entries.find((entry) => entry.membership.role === 'admin') ??
    entries[0] ??
    null
  );
}

function guidanceForMode(mode: PrivateOperatorAccessMode): string[] {
  if (mode === 'tailscale') {
    return [
      'Bind Team-X to localhost and expose it through a device-scoped Tailscale funnel or private tailnet route.',
      'Keep the Team-X listener off public interfaces; tunnel policy owns device admission and audit.',
      'Start with read-only mobile Mission Control before enabling approval review actions.',
    ];
  }
  if (mode === 'hosted-bridge') {
    return [
      'Use the hosted bridge only for read-only supervision until workspace sync and hosted auth are healthy.',
      'Mirror runtime and ticket state outward; do not accept runtime launch or secret mutation callbacks.',
      'Require operator membership provenance before any approval action is accepted.',
    ];
  }
  return [
    'Bind to localhost only by default.',
    'Use a private tunnel such as Tailscale when a mobile device needs access off the desktop.',
    'Enable read-only Mission Control first, approval review second, and runtime or secret mutation last.',
  ];
}

function guardrailsForMode(mode: PrivateOperatorAccessMode): string[] {
  const common = [
    'Never bind the private operator surface to 0.0.0.0 or a LAN address.',
    'Never include decrypted runtime secrets in snapshots, logs, URLs, or renderer-visible payloads.',
    'Treat the remote surface as supervision, not as an unattended runtime launcher.',
  ];
  if (mode === 'hosted-bridge') {
    return [
      ...common,
      'Hosted bridge callbacks may request reviews, but Team-X keeps launch and secret mutation local-only.',
    ];
  }
  return common;
}

export function createPrivateOperatorAccessService({
  operatorAccessService,
  runtimeOperationsService,
  now = Date.now,
}: PrivateOperatorAccessServiceDeps) {
  function plan(input: PrivateOperatorAccessRequest): PrivateOperatorAccessPlan {
    const generatedAt = now();
    const mode = normalizeMode(input.mode);
    const bindHost = input.bindHost?.trim() || DEFAULT_BIND_HOST;
    const port = normalizePort(input.port);
    const warnings: string[] = [];
    const actions: PrivateOperatorAccessActionDecision[] = [];
    const operators = operatorAccessService.listByCompany(input.companyId);
    const selected = selectOperator(operators, input.operatorId);

    if (!selected) {
      warnings.push('No operator membership is available for this workspace.');
    } else if (input.operatorId && selected.operator.id !== input.operatorId) {
      warnings.push(`Operator ${input.operatorId} does not belong to this workspace.`);
    }

    if (!LOCALHOST_ALIASES.has(bindHost.toLowerCase())) {
      warnings.push(
        `Refusing private operator bind host "${bindHost}". Use 127.0.0.1 and place private tunnel policy in front of it.`,
      );
    }

    if (port < 1024 || port > 65_535) {
      warnings.push(`Port ${port} is outside the supported private operator range 1024-65535.`);
    }

    const blocked = warnings.length > 0;
    const role = selected?.membership.role ?? null;
    const canApprove =
      Boolean(selected?.membership.canApproveAuthority) ||
      Boolean(selected?.membership.canApproveBudget);
    const canManageRuntimes = Boolean(selected?.membership.canManageRuntimes);
    const isPrivileged = role === 'owner' || role === 'admin';

    for (const action of [
      'mission-control.read',
      'runtime.read',
      'tickets.read',
      'artifacts.read',
    ] as const) {
      pushAction(
        actions,
        action,
        !blocked,
        blocked
          ? 'Read-only supervision is unavailable until the private operator guardrails pass.'
          : 'Read-only mobile Mission Control is the first enabled private operator capability.',
      );
    }

    pushAction(
      actions,
      'approvals.review',
      !blocked && Boolean(input.allowApprovalActions) && canApprove,
      !input.allowApprovalActions
        ? 'Approval review actions are second-stage and require an explicit operator opt-in.'
        : canApprove
          ? 'This operator can review approval work after read-only access is proven.'
          : 'This operator membership cannot approve budget or authority requests.',
    );

    pushAction(
      actions,
      'runtime.launch',
      !blocked && Boolean(input.allowRuntimeActions) && canManageRuntimes,
      !input.allowRuntimeActions
        ? 'Runtime launch remains disabled until the operator explicitly enables late-stage control.'
        : canManageRuntimes
          ? 'Runtime launch is allowed only after read-only and approval stages are already explicit.'
          : 'This operator membership cannot manage runtimes.',
    );

    pushAction(
      actions,
      'secrets.write',
      !blocked &&
        Boolean(input.allowSecretChanges) &&
        canManageRuntimes &&
        isPrivileged &&
        mode === 'localhost',
      !input.allowSecretChanges
        ? 'Secret changes are the final stage and stay disabled by default.'
        : mode !== 'localhost'
          ? 'Secret changes stay local-only and are blocked for tunneled or hosted supervision.'
          : canManageRuntimes && isPrivileged
            ? 'Secret changes require a localhost-only privileged operator session.'
            : 'Secret changes require an owner or admin who can manage runtimes.',
    );

    const allowedActions = actions.filter((action) => action.allowed);
    const blockedActions = actions.filter((action) => !action.allowed);
    const readOnlyAllowed = allowedActions.some(
      (action) => action.action === 'mission-control.read',
    );
    const status: PrivateOperatorAccessStatus = blocked
      ? 'blocked'
      : blockedActions.length > 0 && readOnlyAllowed
        ? 'warning'
        : 'ready';

    return {
      companyId: input.companyId,
      generatedAt,
      mode,
      status,
      bindHost: DEFAULT_BIND_HOST,
      port,
      operatorId: selected?.operator.id ?? null,
      operatorRole: role,
      exposure: 'localhost-only',
      guidance: guidanceForMode(mode),
      warnings,
      guardrails: guardrailsForMode(mode),
      allowedActions,
      blockedActions,
    };
  }

  return {
    plan,

    snapshot(input: PrivateOperatorAccessRequest): PrivateOperatorMissionControlSnapshot {
      const access = plan(input);
      const operators = operatorAccessService.listByCompany(input.companyId);
      const pendingInvites = operatorAccessService
        .listInvitesByCompany(input.companyId)
        .filter((invite) => invite.status === 'pending');
      return {
        companyId: input.companyId,
        generatedAt: access.generatedAt,
        access,
        sharingReadiness: operatorAccessService.getSharingReadiness(input.companyId),
        operators,
        pendingInvites,
        runtimeOperations: access.allowedActions.some(
          (action) => action.action === 'mission-control.read',
        )
          ? runtimeOperationsService.snapshot(input.companyId)
          : null,
      };
    },
  };
}

export type PrivateOperatorAccessService = ReturnType<typeof createPrivateOperatorAccessService>;
