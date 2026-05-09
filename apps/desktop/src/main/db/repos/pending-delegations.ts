/**
 * Pending delegations repository — persistence for the C4 amber gate.
 *
 * Lifecycle:
 *
 *   create()     — `delegate_subtask` parks a delegation here in
 *                  status='pending' instead of inserting into `tickets`.
 *                  Returns the new pending row id.
 *
 *   getById()    — approval-inbox-service load before materialization.
 *
 *   listByCompany() / listPendingByCompany() — used by the inbox to show
 *                  outstanding rows. The status='pending' filter version
 *                  is what the operator sees in the default view.
 *
 *   markApproved() — operator approved the delegation. Records the
 *                  resolving operator + the materialized ticket id.
 *                  Approval-inbox-service does the actual ticket
 *                  insertion + queue + bus emits; the repo only
 *                  persists the resolution.
 *
 *   markRejected() — operator denied the delegation. Records the
 *                  resolving operator + optional rationale.
 *
 * The repo deliberately does NOT call into `ticketsRepo` or the bus — it
 * stays persistence-only so it can be unit-tested with sql.js and so the
 * approval-inbox-service can compose the full materialization flow.
 *
 * Cross-driver generic typing — same pattern as the other repos.
 */

import { type SQL, and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { pendingDelegations } from '../schema.js';

export type PendingDelegationRow = typeof pendingDelegations.$inferSelect;

export type PendingDelegationStatus = 'pending' | 'approved' | 'rejected';

export interface CreatePendingDelegationInput {
  companyId: string;
  planId: string;
  subtaskTitle: string;
  description?: string;
  priority?: string;
  assigneeId: string;
  assigneeName?: string;
  parentProjectId?: string | null;
  subtaskType?: string | null;
  fallbackUsed?: boolean;
  attemptCount?: number;
  /** Final aggregate score in [0, 1]. */
  score: number;
  /** Score breakdown — all four components in [0, 1]. */
  roleFit: number;
  loadRatio: number;
  availability: number;
  pastPerformance: number;
  reporterId: string;
  reporterKind?: string;
  labelsJson?: string;
  dependenciesJson?: string;
  slaHours?: number | null;
  dueAt?: number | null;
  /** Defaults to `Date.now()`. Injectable for deterministic tests. */
  now?: number;
}

export interface MarkApprovedInput {
  /** Operator id from the IPC handler (the user who clicked Approve). */
  operatorId: string;
  /** Ticket row id created by the materialization step. */
  ticketId: string;
  rationale?: string | null;
  now?: number;
}

export interface MarkRejectedInput {
  operatorId: string;
  rationale?: string | null;
  now?: number;
}

type PendingDelegationsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createPendingDelegationsRepo<TRunResult>(db: PendingDelegationsDb<TRunResult>) {
  return {
    /**
     * Insert a new pending-delegation row and return its id. The caller
     * has already chosen the assignee from the fallback chain and
     * computed the four-component score breakdown.
     */
    create(input: CreatePendingDelegationInput): string {
      const id = nanoid();
      const ts = input.now ?? Date.now();
      db.insert(pendingDelegations)
        .values({
          id,
          companyId: input.companyId,
          planId: input.planId,
          subtaskTitle: input.subtaskTitle,
          description: input.description ?? '',
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId,
          assigneeName: input.assigneeName ?? '',
          parentProjectId: input.parentProjectId ?? null,
          subtaskType: input.subtaskType ?? null,
          fallbackUsed: input.fallbackUsed ? 1 : 0,
          attemptCount: input.attemptCount ?? 1,
          score: input.score,
          roleFit: input.roleFit,
          loadRatio: input.loadRatio,
          availability: input.availability,
          pastPerformance: input.pastPerformance,
          reporterId: input.reporterId,
          reporterKind: input.reporterKind ?? 'agent',
          labelsJson: input.labelsJson ?? '[]',
          dependenciesJson: input.dependenciesJson ?? '[]',
          slaHours: input.slaHours ?? null,
          dueAt: input.dueAt ?? null,
          status: 'pending',
          createdAt: ts,
          updatedAt: ts,
          resolvedAt: null,
          resolvedByOperatorId: null,
          rationale: null,
          ticketId: null,
        })
        .run();
      return id;
    },

    /** Return the pending row with the matching id, or null. */
    getById(id: string): PendingDelegationRow | null {
      return (
        db.select().from(pendingDelegations).where(eq(pendingDelegations.id, id)).get() ?? null
      );
    },

    /** Return every pending-delegation row in a company, newest first. */
    listByCompany(companyId: string, status?: PendingDelegationStatus): PendingDelegationRow[] {
      const conditions: SQL<unknown>[] = [eq(pendingDelegations.companyId, companyId)];
      if (status !== undefined) {
        conditions.push(eq(pendingDelegations.status, status));
      }
      const where = conditions.length === 1 ? conditions[0] : and(...conditions);
      return db
        .select()
        .from(pendingDelegations)
        .where(where)
        .orderBy(desc(pendingDelegations.createdAt))
        .all();
    },

    /** Convenience — equivalent to listByCompany(companyId, 'pending'). */
    listPendingByCompany(companyId: string): PendingDelegationRow[] {
      return this.listByCompany(companyId, 'pending');
    },

    /**
     * Persist the approval resolution. Approval-inbox-service has
     * already created the ticket via `ticketsRepo.create()` and now
     * stamps the pending row as resolved with the materialized ticket id.
     *
     * Throws if the row is not found or is already resolved — this is a
     * loud failure on purpose so approval-inbox-service can emit a
     * meaningful error to the operator instead of silently double-acting.
     */
    markApproved(id: string, input: MarkApprovedInput): PendingDelegationRow {
      const existing = db
        .select()
        .from(pendingDelegations)
        .where(eq(pendingDelegations.id, id))
        .get();
      if (!existing) {
        throw new Error(`[pending-delegations] row not found: ${id}`);
      }
      if (existing.status !== 'pending') {
        throw new Error(
          `[pending-delegations] row ${id} is already ${existing.status}, cannot approve`,
        );
      }
      const ts = input.now ?? Date.now();
      db.update(pendingDelegations)
        .set({
          status: 'approved',
          resolvedAt: ts,
          resolvedByOperatorId: input.operatorId,
          rationale: input.rationale ?? null,
          ticketId: input.ticketId,
          updatedAt: ts,
        })
        .where(eq(pendingDelegations.id, id))
        .run();
      const updated = db
        .select()
        .from(pendingDelegations)
        .where(eq(pendingDelegations.id, id))
        .get();
      if (!updated) {
        throw new Error(`[pending-delegations] row disappeared after approve: ${id}`);
      }
      return updated;
    },

    /**
     * Persist the rejection resolution. Approval-inbox-service emits
     * `task.delegation_rejected` after this returns; the repo only
     * touches storage.
     */
    markRejected(id: string, input: MarkRejectedInput): PendingDelegationRow {
      const existing = db
        .select()
        .from(pendingDelegations)
        .where(eq(pendingDelegations.id, id))
        .get();
      if (!existing) {
        throw new Error(`[pending-delegations] row not found: ${id}`);
      }
      if (existing.status !== 'pending') {
        throw new Error(
          `[pending-delegations] row ${id} is already ${existing.status}, cannot reject`,
        );
      }
      const ts = input.now ?? Date.now();
      db.update(pendingDelegations)
        .set({
          status: 'rejected',
          resolvedAt: ts,
          resolvedByOperatorId: input.operatorId,
          rationale: input.rationale ?? null,
          updatedAt: ts,
        })
        .where(eq(pendingDelegations.id, id))
        .run();
      const updated = db
        .select()
        .from(pendingDelegations)
        .where(eq(pendingDelegations.id, id))
        .get();
      if (!updated) {
        throw new Error(`[pending-delegations] row disappeared after reject: ${id}`);
      }
      return updated;
    },
  };
}

export type PendingDelegationsRepo = ReturnType<typeof createPendingDelegationsRepo>;
