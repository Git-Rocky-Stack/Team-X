import type {
  OperatorAuthMode,
  OperatorInviteStatus,
  OperatorMembershipRole,
  SharedOperatorAuthMode,
} from '@team-x/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { operatorInvites, operatorMemberships, operators } from '../schema.js';

export type OperatorRow = typeof operators.$inferSelect;
export type OperatorMembershipRow = typeof operatorMemberships.$inferSelect;
export type OperatorInviteRow = typeof operatorInvites.$inferSelect;

export interface CreateOperatorInput {
  id?: string;
  displayName: string;
  email?: string | null;
  authMode?: OperatorAuthMode;
}

export interface UpsertOperatorMembershipInput {
  operatorId: string;
  companyId: string;
  role: OperatorMembershipRole;
  canApproveBudget?: boolean;
  canApproveAuthority?: boolean;
  canManageRoutines?: boolean;
  canManageRuntimes?: boolean;
}

export interface CreateOperatorInviteInput {
  companyId: string;
  email: string;
  displayName?: string | null;
  authMode: SharedOperatorAuthMode;
  role: OperatorMembershipRole;
  note?: string | null;
  invitedByOperatorId: string;
  inviteToken?: string;
}

type OperatorsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createOperatorsRepo<TRunResult>(db: OperatorsDb<TRunResult>) {
  function getMembership(operatorId: string, companyId: string): OperatorMembershipRow | null {
    return (
      db
        .select()
        .from(operatorMemberships)
        .where(
          and(
            eq(operatorMemberships.operatorId, operatorId),
            eq(operatorMemberships.companyId, companyId),
          ),
        )
        .get() ?? null
    );
  }

  return {
    create(input: CreateOperatorInput): string {
      const id = input.id ?? nanoid();
      const now = Date.now();
      db.insert(operators)
        .values({
          id,
          displayName: input.displayName,
          email: input.email ?? null,
          authMode: input.authMode ?? 'local',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): OperatorRow | null {
      return db.select().from(operators).where(eq(operators.id, id)).get() ?? null;
    },

    list(): OperatorRow[] {
      return db.select().from(operators).all();
    },

    getMembership,

    listMembershipsByCompany(companyId: string): OperatorMembershipRow[] {
      return db
        .select()
        .from(operatorMemberships)
        .where(eq(operatorMemberships.companyId, companyId))
        .all();
    },

    getInviteById(id: string): OperatorInviteRow | null {
      return db.select().from(operatorInvites).where(eq(operatorInvites.id, id)).get() ?? null;
    },

    listInvitesByCompany(companyId: string): OperatorInviteRow[] {
      return db
        .select()
        .from(operatorInvites)
        .where(eq(operatorInvites.companyId, companyId))
        .orderBy(desc(operatorInvites.createdAt))
        .all();
    },

    createInvite(input: CreateOperatorInviteInput): OperatorInviteRow {
      const id = nanoid();
      const now = Date.now();
      db.insert(operatorInvites)
        .values({
          id,
          companyId: input.companyId,
          email: input.email,
          displayName: input.displayName ?? null,
          authMode: input.authMode,
          role: input.role,
          note: input.note ?? null,
          inviteToken: input.inviteToken ?? nanoid(24),
          status: 'pending',
          invitedByOperatorId: input.invitedByOperatorId,
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
        })
        .run();
      const created = db.select().from(operatorInvites).where(eq(operatorInvites.id, id)).get();
      if (!created) {
        throw new Error(`[operatorsRepo] failed to create operator invite ${id}`);
      }
      return created;
    },

    updateInviteStatus(id: string, status: OperatorInviteStatus): OperatorInviteRow | null {
      const existing = db.select().from(operatorInvites).where(eq(operatorInvites.id, id)).get();
      if (!existing) return null;
      const now = Date.now();
      db.update(operatorInvites)
        .set({
          status,
          updatedAt: now,
          resolvedAt: status === 'pending' ? null : now,
        })
        .where(eq(operatorInvites.id, id))
        .run();
      return db.select().from(operatorInvites).where(eq(operatorInvites.id, id)).get() ?? null;
    },

    upsertMembership(input: UpsertOperatorMembershipInput): string {
      const existing = getMembership(input.operatorId, input.companyId);
      const now = Date.now();
      if (existing) {
        db.update(operatorMemberships)
          .set({
            role: input.role,
            canApproveBudget: input.canApproveBudget ?? existing.canApproveBudget,
            canApproveAuthority: input.canApproveAuthority ?? existing.canApproveAuthority,
            canManageRoutines: input.canManageRoutines ?? existing.canManageRoutines,
            canManageRuntimes: input.canManageRuntimes ?? existing.canManageRuntimes,
            updatedAt: now,
          })
          .where(eq(operatorMemberships.id, existing.id))
          .run();
        return existing.id;
      }

      const id = nanoid();
      db.insert(operatorMemberships)
        .values({
          id,
          operatorId: input.operatorId,
          companyId: input.companyId,
          role: input.role,
          canApproveBudget: input.canApproveBudget ?? false,
          canApproveAuthority: input.canApproveAuthority ?? false,
          canManageRoutines: input.canManageRoutines ?? false,
          canManageRuntimes: input.canManageRuntimes ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },
  };
}

export type OperatorsRepo = ReturnType<typeof createOperatorsRepo>;
