import type {
  AcceptOperatorInviteResponse,
  CompanyCloudLinkStatus,
  CompanySettings,
  CompanySharingModeReadiness,
  CompanySharingReadiness,
  CompanySharingReadinessSummary,
  OperatorAccessEntry,
  OperatorAuthMode,
  OperatorInvite,
  OperatorMembershipRole,
  SharedOperatorAuthMode,
} from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { OperatorInviteRow, OperatorRow, OperatorsRepo } from '../db/repos/operators.js';

/**
 * Legacy compatibility note:
 *
 * Team-X's existing chat, thread, and audit rows already use the hardcoded
 * human actor id `"rocky"`. The first operator-foundation slice preserves
 * that durable id so historical rows stay attributable after the new
 * operators table lands. A later migration can rename the public-facing
 * label without rewriting every historical row.
 */
export const LOCAL_OWNER_OPERATOR_ID = 'rocky';
export const LOCAL_OWNER_OPERATOR_NAME = 'Local Owner';

function rowToOperatorInvite(row: OperatorInviteRow): OperatorInvite {
  return {
    id: row.id,
    companyId: row.companyId,
    email: row.email,
    displayName: row.displayName,
    authMode: row.authMode as SharedOperatorAuthMode,
    role: row.role as OperatorMembershipRole,
    sourceKind: row.sourceKind as OperatorInvite['sourceKind'],
    cloudWorkspaceId: row.cloudWorkspaceId,
    hostedInviteId: row.hostedInviteId,
    note: row.note,
    inviteToken: row.inviteToken,
    status: row.status as OperatorInvite['status'],
    invitedByOperatorId: row.invitedByOperatorId,
    acceptedOperatorId: row.acceptedOperatorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

export interface OperatorAccessServiceDeps {
  companiesRepo: {
    getById(id: string): CompanyRow | null;
  };
  cloudLinkService?: {
    getWorkspaceLink(companyId: string): CompanyCloudLinkStatus;
  };
  operatorsRepo: OperatorsRepo;
}

function parseCompanySettings(settingsJson: string): CompanySettings {
  try {
    const parsed = JSON.parse(settingsJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CompanySettings;
    }
  } catch {
    // Fall through to the empty settings object.
  }
  return {};
}

function effectiveModeFromEntries(entries: readonly OperatorAccessEntry[]): OperatorAuthMode {
  if (entries.some((entry) => entry.operator.authMode === 'cloud')) return 'cloud';
  if (entries.some((entry) => entry.operator.authMode === 'invited')) return 'invited';
  return 'local';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function defaultOperatorDisplayName(invite: OperatorInvite): string {
  if (invite.displayName?.trim()) return invite.displayName.trim();
  const localPart = invite.email.split('@')[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : 'Invited Operator';
}

function membershipCapabilitiesForRole(role: OperatorMembershipRole) {
  if (role === 'owner' || role === 'admin') {
    return {
      canApproveBudget: true,
      canApproveAuthority: true,
      canManageRoutines: true,
      canManageRuntimes: true,
    };
  }
  return {
    canApproveBudget: false,
    canApproveAuthority: false,
    canManageRoutines: false,
    canManageRuntimes: false,
  };
}

function normalizeOperatorAuthMode(
  authMode: string | null | undefined,
  fallback: OperatorAuthMode,
): OperatorAuthMode {
  return authMode === 'local' || authMode === 'invited' || authMode === 'cloud'
    ? authMode
    : fallback;
}

function summarizeModeReadiness(input: {
  mode: OperatorAuthMode;
  hasWorkspaceOrigin: boolean;
  hasCompanyOrigin: boolean;
  ownerCount: number;
  invitedOperatorCount: number;
  cloudOperatorCount: number;
  lastExportedAt: string | null;
}): CompanySharingModeReadiness {
  const missingRequirements: string[] = [];

  if (!input.hasWorkspaceOrigin) {
    missingRequirements.push('Workspace origin metadata is missing.');
  }
  if (!input.hasCompanyOrigin) {
    missingRequirements.push('Company origin metadata is missing.');
  }
  if (input.ownerCount === 0) {
    missingRequirements.push('At least one owner membership is required.');
  }

  if (input.mode === 'invited' && input.invitedOperatorCount === 0) {
    missingRequirements.push('Add at least one invited operator membership.');
  }
  if (input.mode === 'cloud' && input.cloudOperatorCount === 0) {
    missingRequirements.push('Add at least one cloud operator identity.');
  }
  if (input.mode !== 'local' && !input.lastExportedAt) {
    missingRequirements.push('Export the workspace or save a template before sharing it.');
  }

  let readiness: CompanySharingReadiness = 'ready';
  if (
    missingRequirements.some(
      (requirement) =>
        requirement.includes('origin metadata') || requirement.includes('owner membership'),
    )
  ) {
    readiness = 'blocked';
  } else if (missingRequirements.length > 0) {
    readiness = 'warning';
  }

  let summary = 'Local-first posture with no external operator requirements.';
  if (input.mode === 'invited') {
    summary =
      'Invited posture uses local-first memberships so more than one human can supervise the workspace.';
  } else if (input.mode === 'cloud') {
    summary =
      'Cloud posture prepares the workspace for hosted/shared supervision once real sync and auth land.';
  }

  return {
    mode: input.mode,
    readiness,
    missingRequirements,
    summary,
  };
}

export function createOperatorAccessService({
  companiesRepo,
  cloudLinkService,
  operatorsRepo,
}: OperatorAccessServiceDeps) {
  function ensureOperator(
    id: string,
    displayName: string,
    authMode: OperatorAuthMode,
  ): OperatorRow {
    const existing = operatorsRepo.getById(id);
    if (existing) return existing;
    operatorsRepo.create({
      id,
      displayName,
      authMode,
    });
    const created = operatorsRepo.getById(id);
    if (!created) {
      throw new Error(`[operator-access] failed to bootstrap operator ${id}`);
    }
    return created;
  }

  function ensureMembership(
    operatorId: string,
    companyId: string,
    role: OperatorMembershipRole,
  ): string {
    return operatorsRepo.upsertMembership({
      operatorId,
      companyId,
      role,
      canApproveBudget: true,
      canApproveAuthority: true,
      canManageRoutines: true,
      canManageRuntimes: true,
    });
  }

  function ensureLocalOwner(): OperatorRow {
    return ensureOperator(LOCAL_OWNER_OPERATOR_ID, LOCAL_OWNER_OPERATOR_NAME, 'local');
  }

  function ensureLocalOwnerForCompany(companyId: string): {
    operatorId: string;
    membershipId: string;
  } {
    const owner = ensureLocalOwner();
    const membershipId = ensureMembership(owner.id, companyId, 'owner');
    return { operatorId: owner.id, membershipId };
  }

  function resolveOperatorIdForCompany(
    companyId: string,
    preferredOperatorId?: string | null,
  ): string {
    const memberships = operatorsRepo.listMembershipsByCompany(companyId);

    if (preferredOperatorId) {
      const matchingMembership = memberships.find(
        (membership) => membership.operatorId === preferredOperatorId,
      );
      if (!matchingMembership) {
        throw new Error(
          `[operator-access] operator ${preferredOperatorId} does not belong to company ${companyId}`,
        );
      }
      return preferredOperatorId;
    }

    return ensureLocalOwnerForCompany(companyId).operatorId;
  }

  function listByCompany(companyId: string): OperatorAccessEntry[] {
    const memberships = operatorsRepo.listMembershipsByCompany(companyId);
    return memberships
      .map((membership) => {
        const operator = operatorsRepo.getById(membership.operatorId);
        if (!operator) return null;
        return { operator, membership };
      })
      .filter((entry): entry is OperatorAccessEntry => entry !== null);
  }

  function resolveInviteSource(companyId: string): {
    sourceKind: OperatorInvite['sourceKind'];
    cloudWorkspaceId: string | null;
    hostedInviteId: string | null;
  } {
    if (!cloudLinkService) {
      return {
        sourceKind: 'local',
        cloudWorkspaceId: null,
        hostedInviteId: null,
      };
    }

    const link = cloudLinkService.getWorkspaceLink(companyId);
    if (!link.isLinked || !link.cloudWorkspaceId) {
      return {
        sourceKind: 'local',
        cloudWorkspaceId: null,
        hostedInviteId: null,
      };
    }

    return {
      sourceKind: 'hosted',
      cloudWorkspaceId: link.cloudWorkspaceId,
      hostedInviteId: `hosted_invite_${link.cloudWorkspaceId}_${Date.now()}`,
    };
  }

  function listInvitesByCompany(companyId: string): OperatorInvite[] {
    return operatorsRepo.listInvitesByCompany(companyId).map(rowToOperatorInvite);
  }

  return {
    getLocalOwnerId(): string {
      return LOCAL_OWNER_OPERATOR_ID;
    },

    ensureLocalOwner,
    ensureLocalOwnerForCompany,

    ensureLocalOwnerForCompanies(companyIds: string[]): void {
      for (const companyId of companyIds) {
        ensureLocalOwnerForCompany(companyId);
      }
    },

    resolveOperatorIdForCompany,

    listByCompany,

    listInvitesByCompany,

    createInvite(input: {
      companyId: string;
      email: string;
      displayName?: string | null;
      authMode: SharedOperatorAuthMode;
      role: OperatorMembershipRole;
      note?: string | null;
      invitedByOperatorId?: string | null;
    }): OperatorInvite {
      const company = companiesRepo.getById(input.companyId);
      if (!company) {
        throw new Error(`[operator-access] company not found: ${input.companyId}`);
      }
      const inviterId =
        typeof input.invitedByOperatorId === 'string' && input.invitedByOperatorId.length > 0
          ? resolveOperatorIdForCompany(input.companyId, input.invitedByOperatorId)
          : ensureLocalOwnerForCompany(input.companyId).operatorId;
      const source = resolveInviteSource(input.companyId);
      const invite = operatorsRepo.createInvite({
        companyId: input.companyId,
        email: normalizeEmail(input.email),
        displayName: input.displayName?.trim() || null,
        authMode: input.authMode,
        role: input.role,
        sourceKind: source.sourceKind,
        cloudWorkspaceId: source.cloudWorkspaceId,
        hostedInviteId: source.hostedInviteId,
        note: input.note?.trim() || null,
        invitedByOperatorId: inviterId,
      });
      return rowToOperatorInvite(invite);
    },

    revokeInvite(inviteId: string): OperatorInvite {
      const updated = operatorsRepo.updateInviteStatus(inviteId, 'revoked');
      if (!updated) {
        throw new Error(`[operator-access] invite not found: ${inviteId}`);
      }
      return rowToOperatorInvite(updated);
    },

    acceptInvite(inviteId: string): AcceptOperatorInviteResponse {
      const inviteRow = operatorsRepo.getInviteById(inviteId);
      if (!inviteRow) {
        throw new Error(`[operator-access] invite not found: ${inviteId}`);
      }
      const invite = rowToOperatorInvite(inviteRow);
      if (invite.status !== 'pending') {
        throw new Error(
          `[operator-access] invite ${inviteId} is ${invite.status}; only pending invites can be accepted`,
        );
      }
      if (invite.role === 'owner') {
        throw new Error('[operator-access] owner invite acceptance is not supported yet');
      }
      const company = companiesRepo.getById(invite.companyId);
      if (!company) {
        throw new Error(`[operator-access] company not found: ${invite.companyId}`);
      }

      const normalizedEmail = normalizeEmail(invite.email);
      const existingOperator = operatorsRepo
        .list()
        .find((operator) => normalizeEmail(operator.email ?? '') === normalizedEmail);

      let operatorId = existingOperator?.id ?? null;
      const reusedOperator = operatorId !== null;

      if (!operatorId) {
        operatorId = operatorsRepo.create({
          displayName: defaultOperatorDisplayName(invite),
          email: normalizedEmail,
          authMode: invite.authMode,
        });
      } else {
        operatorsRepo.update(operatorId, {
          displayName: existingOperator?.displayName?.trim() || defaultOperatorDisplayName(invite),
          email: normalizedEmail,
          authMode:
            normalizeOperatorAuthMode(existingOperator?.authMode, invite.authMode) === 'local'
              ? invite.authMode
              : normalizeOperatorAuthMode(existingOperator?.authMode, invite.authMode),
        });
      }

      const membershipId = operatorsRepo.upsertMembership({
        operatorId,
        companyId: invite.companyId,
        role: invite.role,
        sourceKind: invite.sourceKind === 'hosted' ? 'hosted' : 'local',
        cloudWorkspaceId: invite.sourceKind === 'hosted' ? invite.cloudWorkspaceId : null,
        hostedInviteId: invite.sourceKind === 'hosted' ? invite.hostedInviteId : null,
        ...membershipCapabilitiesForRole(invite.role),
      });
      const accepted = operatorsRepo.acceptInvite(inviteId, operatorId);
      if (!accepted) {
        throw new Error(`[operator-access] failed to accept invite: ${inviteId}`);
      }
      return {
        invite: rowToOperatorInvite(accepted),
        operatorId,
        membershipId,
        reusedOperator,
      };
    },

    getSharingReadiness(companyId: string): CompanySharingReadinessSummary {
      const company = companiesRepo.getById(companyId);
      if (!company) {
        throw new Error(`[operator-access] company not found: ${companyId}`);
      }

      ensureLocalOwnerForCompany(companyId);

      const entries = listByCompany(companyId);
      const settings = parseCompanySettings(company.settingsJson);
      const sharing = settings.sharing;
      const configuredMode = sharing?.mode ?? effectiveModeFromEntries(entries);
      const ownerCount = entries.filter((entry) => entry.membership.role === 'owner').length;
      const adminCount = entries.filter((entry) => entry.membership.role === 'admin').length;
      const localOperatorCount = entries.filter(
        (entry) => entry.operator.authMode === 'local',
      ).length;
      const invitedOperatorCount = entries.filter(
        (entry) => entry.operator.authMode === 'invited',
      ).length;
      const cloudOperatorCount = entries.filter(
        (entry) => entry.operator.authMode === 'cloud',
      ).length;
      const hasWorkspaceOrigin =
        typeof company.workspaceOriginId === 'string' && company.workspaceOriginId.length > 0;
      const hasCompanyOrigin =
        typeof company.companyOriginId === 'string' && company.companyOriginId.length > 0;
      const lastExportedAt = sharing?.lastExportedAt ?? null;
      const lastExportMode = sharing?.lastExportMode ?? null;

      const modeReadiness = (
        ['local', 'invited', 'cloud'] as const satisfies readonly OperatorAuthMode[]
      ).map((mode) =>
        summarizeModeReadiness({
          mode,
          hasWorkspaceOrigin,
          hasCompanyOrigin,
          ownerCount,
          invitedOperatorCount,
          cloudOperatorCount,
          lastExportedAt,
        }),
      );
      const selected =
        modeReadiness.find((entry) => entry.mode === configuredMode) ??
        summarizeModeReadiness({
          mode: configuredMode,
          hasWorkspaceOrigin,
          hasCompanyOrigin,
          ownerCount,
          invitedOperatorCount,
          cloudOperatorCount,
          lastExportedAt,
        });

      const effectiveMode = effectiveModeFromEntries(entries);

      return {
        companyId,
        configuredMode,
        effectiveMode,
        readiness: selected.readiness,
        missingRequirements: selected.missingRequirements,
        operatorCount: entries.length,
        ownerCount,
        adminCount,
        localOperatorCount,
        invitedOperatorCount,
        cloudOperatorCount,
        hasWorkspaceOrigin,
        hasCompanyOrigin,
        lastExportedAt,
        lastExportMode,
        modeReadiness,
      };
    },
  };
}

export type OperatorAccessService = ReturnType<typeof createOperatorAccessService>;
