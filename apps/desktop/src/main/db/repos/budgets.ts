import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type {
  ApprovalDecisionStatus,
  ApprovalItemKind,
  ApprovalItemStatus,
  ApprovalPriority,
  ApprovalSubjectKind,
  BudgetPolicyPeriod,
  BudgetScopeKind,
} from '@team-x/shared-types';

import type { Schema } from '../client.js';
import {
  approvalDecisions,
  approvalItems,
  budgetLedgerEntries,
  budgetPolicies,
} from '../schema.js';

export type BudgetPolicyRow = typeof budgetPolicies.$inferSelect;
export type BudgetLedgerEntryRow = typeof budgetLedgerEntries.$inferSelect;
export type ApprovalItemRow = typeof approvalItems.$inferSelect;
export type ApprovalDecisionRow = typeof approvalDecisions.$inferSelect;

export interface CreateBudgetPolicyInput {
  companyId: string;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  period: BudgetPolicyPeriod;
  hardCapUsd: string;
  warningThresholdPct: number;
  autoPause: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled: boolean;
}

export interface UpdateBudgetPolicyInput {
  hardCapUsd?: string;
  warningThresholdPct?: number;
  autoPause?: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled?: boolean;
}

export interface CreateBudgetLedgerEntryInput {
  companyId: string;
  budgetPolicyId?: string | null;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  runId: string;
  runKind: 'work' | 'agentic' | 'copilot';
  threadId?: string | null;
  employeeId: string;
  runtimeProfileId?: string | null;
  routineId?: string | null;
  provider: string;
  model: string;
  amountUsd: string;
  occurredAt: number;
}

export interface ListBudgetLedgerEntriesInput {
  companyId: string;
  scopeKind?: BudgetScopeKind;
  scopeRefId?: string;
  limit?: number;
}

export interface CreateApprovalItemInput {
  companyId: string;
  kind: ApprovalItemKind;
  status?: ApprovalItemStatus;
  priority: ApprovalPriority;
  requestedByOperatorId?: string | null;
  requestedByEmployeeId?: string | null;
  subjectRefKind: ApprovalSubjectKind;
  subjectRefId: string;
  summary: string;
  payloadJson?: string;
}

export interface ResolveApprovalItemInput {
  itemId: string;
  status: Exclude<ApprovalItemStatus, 'pending'>;
}

export interface CreateApprovalDecisionInput {
  companyId: string;
  approvalKind: ApprovalItemKind;
  approvalRefId: string;
  decision: ApprovalDecisionStatus;
  decidedByOperatorId?: string | null;
  rationale?: string | null;
  payloadJson?: string | null;
}

type BudgetsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createBudgetsRepo<TRunResult>(db: BudgetsDb<TRunResult>) {
  function findLedgerEntry(
    scopeKind: BudgetScopeKind,
    scopeRefId: string,
    runId: string,
  ): BudgetLedgerEntryRow | null {
    return (
      db
        .select()
        .from(budgetLedgerEntries)
        .where(
          and(
            eq(budgetLedgerEntries.scopeKind, scopeKind),
            eq(budgetLedgerEntries.scopeRefId, scopeRefId),
            eq(budgetLedgerEntries.runId, runId),
          ),
        )
        .get() ?? null
    );
  }

  return {
    createPolicy(input: CreateBudgetPolicyInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(budgetPolicies)
        .values({
          id,
          companyId: input.companyId,
          scopeKind: input.scopeKind,
          scopeRefId: input.scopeRefId,
          period: input.period,
          hardCapUsd: input.hardCapUsd,
          warningThresholdPct: input.warningThresholdPct,
          autoPause: input.autoPause,
          requireApprovalAboveUsd: input.requireApprovalAboveUsd ?? null,
          enabled: input.enabled,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getPolicyById(id: string): BudgetPolicyRow | null {
      return db.select().from(budgetPolicies).where(eq(budgetPolicies.id, id)).get() ?? null;
    },

    findPolicy(
      companyId: string,
      scopeKind: BudgetScopeKind,
      scopeRefId: string,
      period: BudgetPolicyPeriod = 'monthly',
    ): BudgetPolicyRow | null {
      return (
        db
          .select()
          .from(budgetPolicies)
          .where(
            and(
              eq(budgetPolicies.companyId, companyId),
              eq(budgetPolicies.scopeKind, scopeKind),
              eq(budgetPolicies.scopeRefId, scopeRefId),
              eq(budgetPolicies.period, period),
            ),
          )
          .get() ?? null
      );
    },

    listPoliciesByCompany(companyId: string): BudgetPolicyRow[] {
      return db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId))
        .all()
        .sort(
          (a, b) =>
            a.scopeKind.localeCompare(b.scopeKind) || a.scopeRefId.localeCompare(b.scopeRefId),
        );
    },

    updatePolicy(id: string, input: UpdateBudgetPolicyInput): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.hardCapUsd !== undefined) set.hardCapUsd = input.hardCapUsd;
      if (input.warningThresholdPct !== undefined) {
        set.warningThresholdPct = input.warningThresholdPct;
      }
      if (input.autoPause !== undefined) set.autoPause = input.autoPause;
      if (input.requireApprovalAboveUsd !== undefined) {
        set.requireApprovalAboveUsd = input.requireApprovalAboveUsd;
      }
      if (input.enabled !== undefined) set.enabled = input.enabled;
      db.update(budgetPolicies).set(set).where(eq(budgetPolicies.id, id)).run();
    },

    deletePolicy(policyId: string): void {
      db.delete(budgetPolicies).where(eq(budgetPolicies.id, policyId)).run();
    },

    findLedgerEntry,

    createLedgerEntry(input: CreateBudgetLedgerEntryInput): string {
      const existing = findLedgerEntry(input.scopeKind, input.scopeRefId, input.runId);
      if (existing) return existing.id;

      const id = nanoid();
      const now = Date.now();
      db.insert(budgetLedgerEntries)
        .values({
          id,
          companyId: input.companyId,
          budgetPolicyId: input.budgetPolicyId ?? null,
          scopeKind: input.scopeKind,
          scopeRefId: input.scopeRefId,
          runId: input.runId,
          runKind: input.runKind,
          threadId: input.threadId ?? null,
          employeeId: input.employeeId,
          runtimeProfileId: input.runtimeProfileId ?? null,
          routineId: input.routineId ?? null,
          provider: input.provider,
          model: input.model,
          amountUsd: input.amountUsd,
          occurredAt: input.occurredAt,
          createdAt: now,
        })
        .run();
      return id;
    },

    listLedgerEntries(input: ListBudgetLedgerEntriesInput): BudgetLedgerEntryRow[] {
      const conditions = [eq(budgetLedgerEntries.companyId, input.companyId)];
      if (input.scopeKind !== undefined) {
        conditions.push(eq(budgetLedgerEntries.scopeKind, input.scopeKind));
      }
      if (input.scopeRefId !== undefined) {
        conditions.push(eq(budgetLedgerEntries.scopeRefId, input.scopeRefId));
      }
      return db
        .select()
        .from(budgetLedgerEntries)
        .where(and(...conditions))
        .orderBy(desc(budgetLedgerEntries.occurredAt), desc(budgetLedgerEntries.createdAt))
        .limit(input.limit ?? 50)
        .all();
    },

    sumLedgerAmount(
      companyId: string,
      scopeKind: BudgetScopeKind,
      scopeRefId: string,
      fromMs: number,
      toMs: number,
    ): string {
      const row = db
        .select({
          amountUsd:
            sql<string>`coalesce(sum(cast(${budgetLedgerEntries.amountUsd} as real)), 0)`.as(
              'amount_usd',
            ),
        })
        .from(budgetLedgerEntries)
        .where(
          and(
            eq(budgetLedgerEntries.companyId, companyId),
            eq(budgetLedgerEntries.scopeKind, scopeKind),
            eq(budgetLedgerEntries.scopeRefId, scopeRefId),
            gte(budgetLedgerEntries.occurredAt, fromMs),
            lte(budgetLedgerEntries.occurredAt, toMs),
          ),
        )
        .get();
      return String(row?.amountUsd ?? '0');
    },

    providerMix(
      companyId: string,
      fromMs: number,
      toMs: number,
    ): Array<{ provider: string; amountUsd: string }> {
      const rows = db
        .select({
          provider: budgetLedgerEntries.provider,
          amountUsd:
            sql<string>`coalesce(sum(cast(${budgetLedgerEntries.amountUsd} as real)), 0)`.as(
              'amount_usd',
            ),
        })
        .from(budgetLedgerEntries)
        .where(
          and(
            eq(budgetLedgerEntries.companyId, companyId),
            eq(budgetLedgerEntries.scopeKind, 'company'),
            eq(budgetLedgerEntries.scopeRefId, companyId),
            gte(budgetLedgerEntries.occurredAt, fromMs),
            lte(budgetLedgerEntries.occurredAt, toMs),
          ),
        )
        .groupBy(budgetLedgerEntries.provider)
        .orderBy(desc(sql`sum(cast(${budgetLedgerEntries.amountUsd} as real))`))
        .all();
      return rows.map((row) => ({
        provider: row.provider,
        amountUsd: String(row.amountUsd),
      }));
    },

    createApprovalItem(input: CreateApprovalItemInput): string {
      const id = nanoid();
      db.insert(approvalItems)
        .values({
          id,
          companyId: input.companyId,
          kind: input.kind,
          status: input.status ?? 'pending',
          priority: input.priority,
          requestedByOperatorId: input.requestedByOperatorId ?? null,
          requestedByEmployeeId: input.requestedByEmployeeId ?? null,
          subjectRefKind: input.subjectRefKind,
          subjectRefId: input.subjectRefId,
          summary: input.summary,
          payloadJson: input.payloadJson ?? '{}',
          createdAt: Date.now(),
          resolvedAt: null,
        })
        .run();
      return id;
    },

    getApprovalItemById(id: string): ApprovalItemRow | null {
      return db.select().from(approvalItems).where(eq(approvalItems.id, id)).get() ?? null;
    },

    findPendingApprovalItem(
      companyId: string,
      kind: ApprovalItemKind,
      subjectRefKind: ApprovalSubjectKind,
      subjectRefId: string,
    ): ApprovalItemRow | null {
      return (
        db
          .select()
          .from(approvalItems)
          .where(
            and(
              eq(approvalItems.companyId, companyId),
              eq(approvalItems.kind, kind),
              eq(approvalItems.status, 'pending'),
              eq(approvalItems.subjectRefKind, subjectRefKind),
              eq(approvalItems.subjectRefId, subjectRefId),
            ),
          )
          .get() ?? null
      );
    },

    listApprovalItemsForSubject(
      companyId: string,
      kind: ApprovalItemKind,
      subjectRefKind: ApprovalSubjectKind,
      subjectRefId: string,
      status?: ApprovalItemStatus,
    ): ApprovalItemRow[] {
      const conditions = [
        eq(approvalItems.companyId, companyId),
        eq(approvalItems.kind, kind),
        eq(approvalItems.subjectRefKind, subjectRefKind),
        eq(approvalItems.subjectRefId, subjectRefId),
      ];
      if (status !== undefined) conditions.push(eq(approvalItems.status, status));
      return db
        .select()
        .from(approvalItems)
        .where(and(...conditions))
        .orderBy(desc(approvalItems.createdAt))
        .all();
    },

    listApprovalItems(
      companyId: string,
      kind?: ApprovalItemKind,
      status?: ApprovalItemStatus,
    ): ApprovalItemRow[] {
      const conditions = [eq(approvalItems.companyId, companyId)];
      if (kind !== undefined) conditions.push(eq(approvalItems.kind, kind));
      if (status !== undefined) conditions.push(eq(approvalItems.status, status));
      return db
        .select()
        .from(approvalItems)
        .where(and(...conditions))
        .orderBy(desc(approvalItems.createdAt))
        .all();
    },

    resolveApprovalItem(input: ResolveApprovalItemInput): void {
      db.update(approvalItems)
        .set({
          status: input.status,
          resolvedAt: Date.now(),
        })
        .where(eq(approvalItems.id, input.itemId))
        .run();
    },

    createApprovalDecision(input: CreateApprovalDecisionInput): string {
      const id = nanoid();
      db.insert(approvalDecisions)
        .values({
          id,
          companyId: input.companyId,
          approvalKind: input.approvalKind,
          approvalRefId: input.approvalRefId,
          decision: input.decision,
          decidedByOperatorId: input.decidedByOperatorId ?? null,
          rationale: input.rationale ?? null,
          payloadJson: input.payloadJson ?? '{}',
          createdAt: Date.now(),
        })
        .run();
      return id;
    },

    getLatestApprovalDecision(
      companyId: string,
      approvalKind: ApprovalItemKind,
      approvalRefId: string,
    ): ApprovalDecisionRow | null {
      return (
        db
          .select()
          .from(approvalDecisions)
          .where(
            and(
              eq(approvalDecisions.companyId, companyId),
              eq(approvalDecisions.approvalKind, approvalKind),
              eq(approvalDecisions.approvalRefId, approvalRefId),
            ),
          )
          .orderBy(desc(approvalDecisions.createdAt))
          .get() ?? null
      );
    },
  };
}

export type BudgetsRepo = ReturnType<typeof createBudgetsRepo>;
