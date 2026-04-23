import type {
  ApprovalDecision,
  ApprovalDecisionStatus,
  ApprovalItem,
  ApprovalItemKind,
  ApprovalItemStatus,
} from '@team-x/shared-types';

import type {
  AuthorityRepo,
  AuthorityRequestRow,
} from '../db/repos/extensions.js';
import type {
  ApprovalDecisionRow,
  ApprovalItemRow,
  BudgetsRepo,
} from '../db/repos/budgets.js';
import { LOCAL_OWNER_OPERATOR_ID } from './operator-access-service.js';

export interface ListApprovalInboxItemsInput {
  companyId: string;
  kind?: ApprovalItemKind;
  status?: ApprovalItemStatus;
}

export interface ReviewApprovalInboxItemInput {
  companyId: string;
  itemId: string;
  kind: ApprovalItemKind;
  decision: ApprovalDecisionStatus;
  rationale?: string | null;
}

export interface ApprovalInboxReviewResult {
  item: ApprovalItem;
  grantId: string | null;
}

export interface ApprovalInboxServiceDeps {
  budgetsRepo: BudgetsRepo;
  authorityRepo: AuthorityRepo;
  operatorId?: string;
}

function parsePayloadJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }
  return null;
}

function toApprovalDecision(row: ApprovalDecisionRow): ApprovalDecision {
  return {
    id: row.id,
    companyId: row.companyId,
    approvalKind: row.approvalKind as ApprovalDecision['approvalKind'],
    approvalRefId: row.approvalRefId,
    decision: row.decision as ApprovalDecision['decision'],
    decidedByOperatorId: row.decidedByOperatorId,
    rationale: row.rationale,
    payload: parsePayloadJson(row.payloadJson),
    createdAt: row.createdAt,
  };
}

function withLatestDecision(
  item: ApprovalItem,
  budgetsRepo: BudgetsRepo,
): ApprovalItem {
  const latest = budgetsRepo.getLatestApprovalDecision(item.companyId, item.kind, item.id);
  return {
    ...item,
    latestDecision: latest ? toApprovalDecision(latest) : null,
  };
}

function budgetRowToApprovalItem(
  row: ApprovalItemRow,
  budgetsRepo: BudgetsRepo,
): ApprovalItem {
  return withLatestDecision(
    {
      id: row.id,
      companyId: row.companyId,
      kind: row.kind as ApprovalItem['kind'],
      status: row.status as ApprovalItem['status'],
      priority: row.priority as ApprovalItem['priority'],
      requestedByOperatorId: row.requestedByOperatorId,
      requestedByEmployeeId: row.requestedByEmployeeId,
      subjectRefKind: row.subjectRefKind as ApprovalItem['subjectRefKind'],
      subjectRefId: row.subjectRefId,
      summary: row.summary,
      payload: parsePayloadJson(row.payloadJson),
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    },
    budgetsRepo,
  );
}

function authorityPriority(row: AuthorityRequestRow): ApprovalItem['priority'] {
  if (row.resourceKind === 'path' && row.requestedPermission === 'allow') return 'high';
  return 'medium';
}

export function createApprovalInboxService({
  budgetsRepo,
  authorityRepo,
  operatorId = LOCAL_OWNER_OPERATOR_ID,
}: ApprovalInboxServiceDeps) {
  function listItems(input: ListApprovalInboxItemsInput): ApprovalItem[] {
    const items: ApprovalItem[] = [];

    if (input.kind === undefined || input.kind === 'budget-exception') {
      items.push(
        ...budgetsRepo
          .listApprovalItems(input.companyId, 'budget-exception', input.status)
          .map((row) => budgetRowToApprovalItem(row, budgetsRepo)),
      );
    }

    if (input.kind === undefined || input.kind === 'authority-request') {
      if (input.status !== 'dismissed') {
        items.push(
          ...authorityRepo
            .listRequestsByCompany(
              input.companyId,
              input.status === undefined ? undefined : (input.status as 'pending' | 'approved' | 'denied'),
            )
            .map((row) =>
              withLatestDecision(
                {
                  id: row.id,
                  companyId: input.companyId,
                  kind: 'authority-request',
                  status: row.status as ApprovalItem['status'],
                  priority: authorityPriority(row),
                  requestedByOperatorId: null,
                  requestedByEmployeeId: row.employeeId,
                  subjectRefKind: 'extension',
                  subjectRefId: row.extensionId,
                  summary: `Authority review required for ${row.resourceKind} ${row.resourceId}.`,
                  payload: {
                    extensionId: row.extensionId,
                    resourceKind: row.resourceKind,
                    resourceId: row.resourceId,
                    requestedPermission: row.requestedPermission,
                    reason: row.reason,
                  },
                  createdAt: row.createdAt,
                  resolvedAt: row.reviewedAt,
                },
                budgetsRepo,
              ),
            ),
        );
      }
    }

    return items.sort((a, b) => b.createdAt - a.createdAt || a.summary.localeCompare(b.summary));
  }

  function reviewItem(input: ReviewApprovalInboxItemInput): ApprovalInboxReviewResult {
    if (input.kind === 'budget-exception') {
      const existing = budgetsRepo.getApprovalItemById(input.itemId);
      if (!existing || existing.companyId !== input.companyId) {
        throw new Error(`[approvals] budget approval item not found: ${input.itemId}`);
      }
      if (existing.status !== 'pending') {
        throw new Error(`[approvals] budget approval item ${input.itemId} is already ${existing.status}`);
      }

      budgetsRepo.resolveApprovalItem({
        itemId: input.itemId,
        status: input.decision,
      });
      budgetsRepo.createApprovalDecision({
        companyId: input.companyId,
        approvalKind: 'budget-exception',
        approvalRefId: input.itemId,
        decision: input.decision,
        decidedByOperatorId: operatorId,
        rationale: input.rationale ?? null,
        payloadJson: existing.payloadJson,
      });

      const resolved = budgetsRepo.getApprovalItemById(input.itemId);
      if (!resolved) {
        throw new Error(`[approvals] budget approval item disappeared: ${input.itemId}`);
      }
      return {
        item: budgetRowToApprovalItem(resolved, budgetsRepo),
        grantId: null,
      };
    }

    if (input.kind === 'authority-request') {
      if (input.decision === 'dismissed') {
        throw new Error('[approvals] authority requests cannot be dismissed');
      }
      const request = authorityRepo.getRequestById(input.itemId);
      if (!request) {
        throw new Error(`[approvals] authority request not found: ${input.itemId}`);
      }
      const visibleRequestIds = new Set(
        authorityRepo.listRequestsByCompany(input.companyId).map((row) => row.id),
      );
      if (!visibleRequestIds.has(input.itemId)) {
        throw new Error(
          `[approvals] authority request ${input.itemId} does not belong to company ${input.companyId}`,
        );
      }
      if (request.status !== 'pending') {
        throw new Error(`[approvals] authority request ${input.itemId} is already ${request.status}`);
      }

      let grantId: string | null = null;
      if (input.decision === 'approved') {
        grantId = authorityRepo.createGrant({
          scopeKind: 'extension',
          scopeId: request.extensionId,
          resourceKind: request.resourceKind as 'capability' | 'path',
          resourceId: request.resourceId,
          permission: request.requestedPermission as 'allow' | 'deny' | 'prompt',
          metadataJson: JSON.stringify({
            source: 'authority-request',
            requestId: input.itemId,
          }),
        });
      }

      authorityRepo.reviewRequest({
        requestId: input.itemId,
        status: input.decision,
        reason: input.rationale ?? null,
        reviewedAt: Date.now(),
      });
      budgetsRepo.createApprovalDecision({
        companyId: input.companyId,
        approvalKind: 'authority-request',
        approvalRefId: input.itemId,
        decision: input.decision,
        decidedByOperatorId: operatorId,
        rationale: input.rationale ?? null,
        payloadJson: JSON.stringify({
          extensionId: request.extensionId,
          resourceKind: request.resourceKind,
          resourceId: request.resourceId,
          requestedPermission: request.requestedPermission,
        }),
      });

      const updated = authorityRepo.getRequestById(input.itemId);
      if (!updated) {
        throw new Error(`[approvals] authority request disappeared: ${input.itemId}`);
      }
      return {
        item: withLatestDecision(
          {
            id: updated.id,
            companyId: input.companyId,
            kind: 'authority-request',
            status: updated.status as ApprovalItem['status'],
            priority: authorityPriority(updated),
            requestedByOperatorId: null,
            requestedByEmployeeId: updated.employeeId,
            subjectRefKind: 'extension',
            subjectRefId: updated.extensionId,
            summary: `Authority review required for ${updated.resourceKind} ${updated.resourceId}.`,
            payload: {
              extensionId: updated.extensionId,
              resourceKind: updated.resourceKind,
              resourceId: updated.resourceId,
              requestedPermission: updated.requestedPermission,
              reason: updated.reason,
            },
            createdAt: updated.createdAt,
            resolvedAt: updated.reviewedAt,
          },
          budgetsRepo,
        ),
        grantId,
      };
    }

    throw new Error(`[approvals] unsupported approval kind: ${input.kind}`);
  }

  return {
    listItems,
    reviewItem,
  };
}

export type ApprovalInboxService = ReturnType<typeof createApprovalInboxService>;
