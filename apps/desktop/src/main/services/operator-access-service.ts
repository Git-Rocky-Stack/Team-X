import type {
  CompanySharingModeReadiness,
  CompanySharingReadiness,
  CompanySharingReadinessSummary,
  CompanySettings,
  OperatorAccessEntry,
  OperatorAuthMode,
  OperatorMembershipRole,
} from '@team-x/shared-types';

import type { CompanyRow } from '../db/repos/companies.js';
import type { OperatorRow, OperatorsRepo } from '../db/repos/operators.js';

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

export interface OperatorAccessServiceDeps {
  companiesRepo: {
    getById(id: string): CompanyRow | null;
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
    missingRequirements.some((requirement) =>
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
      const localOperatorCount = entries.filter((entry) => entry.operator.authMode === 'local').length;
      const invitedOperatorCount = entries.filter(
        (entry) => entry.operator.authMode === 'invited',
      ).length;
      const cloudOperatorCount = entries.filter((entry) => entry.operator.authMode === 'cloud').length;
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
