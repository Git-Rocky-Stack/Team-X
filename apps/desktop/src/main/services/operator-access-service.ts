import type {
  OperatorAccessEntry,
  OperatorAuthMode,
  OperatorMembershipRole,
} from '@team-x/shared-types';

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
  operatorsRepo: OperatorsRepo;
}

export function createOperatorAccessService({ operatorsRepo }: OperatorAccessServiceDeps) {
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

    listByCompany(companyId: string): OperatorAccessEntry[] {
      const memberships = operatorsRepo.listMembershipsByCompany(companyId);
      return memberships
        .map((membership) => {
          const operator = operatorsRepo.getById(membership.operatorId);
          if (!operator) return null;
          return { operator, membership };
        })
        .filter((entry): entry is OperatorAccessEntry => entry !== null);
    },
  };
}

export type OperatorAccessService = ReturnType<typeof createOperatorAccessService>;
