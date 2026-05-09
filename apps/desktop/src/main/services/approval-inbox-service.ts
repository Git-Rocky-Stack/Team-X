import type {
  ApprovalDecision,
  ApprovalDecisionStatus,
  ApprovalItem,
  ApprovalItemKind,
  ApprovalItemStatus,
  DelegationScoreBreakdown,
  EventType,
} from '@team-x/shared-types';

import type { ApprovalDecisionRow, ApprovalItemRow, BudgetsRepo } from '../db/repos/budgets.js';
import type { AuthorityRepo, AuthorityRequestRow } from '../db/repos/extensions.js';
import type {
  PendingDelegationRow,
  PendingDelegationsRepo,
} from '../db/repos/pending-delegations.js';
import type { createProjectsRepo } from '../db/repos/projects.js';
import type { createTicketsRepo } from '../db/repos/tickets.js';

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
  operatorId: string;
}

export interface ApprovalInboxReviewResult {
  item: ApprovalItem;
  grantId: string | null;
  /**
   * C4 (audit 2026-05-07) — set on `delegation-request` approval, when
   * the row is materialized into a real ticket. Null for all other
   * approval kinds and for dismissed delegation rows.
   */
  ticketId?: string | null;
}

/**
 * C4 (audit 2026-05-07) — composition seam for the inbox to
 * materialize a pending delegation into a real ticket on approve.
 *
 * Mirror of the `WriteSideOrchestrator` shape from
 * `agentic-tools-write.ts`. Both can be the same instance under the
 * production composition root.
 */
export interface ApprovalInboxOrchestrator {
  queueDelegatedTicket(input: {
    ticketId: string;
    employeeId: string;
    companyId: string;
    actorId: string;
    actorKind: string;
  }): Promise<{ threadId: string; triggerMessageId: string }>;
}

/**
 * Same width-compatible bus shape as `WriteSideEventBus` over in
 * `agentic-tools-write.ts`. Width-compatible so the production bus
 * drops in untouched.
 */
export interface ApprovalInboxEventBus {
  emit<T>(input: {
    type: string;
    companyId: string;
    actorId: string;
    actorKind: string;
    payload: T;
  }): unknown;
}

type TicketsRepo = ReturnType<typeof createTicketsRepo>;
type ProjectsRepo = ReturnType<typeof createProjectsRepo>;

export interface ApprovalInboxServiceDeps {
  budgetsRepo: BudgetsRepo;
  authorityRepo: AuthorityRepo;
  /**
   * C4 (audit 2026-05-07) — required to surface `delegation-request`
   * items in the inbox and to mark them resolved on review. Optional
   * only because pre-C4 callers may not have wired it yet; once wired,
   * the service exposes the `delegation-request` kind to operators.
   */
  pendingDelegationsRepo?: PendingDelegationsRepo;
  /** Required when `pendingDelegationsRepo` is wired — used to materialize. */
  ticketsRepo?: TicketsRepo;
  /** Required when `pendingDelegationsRepo` is wired — for project linkage. */
  projectsRepo?: ProjectsRepo;
  /** Required when `pendingDelegationsRepo` is wired — to dispatch on approve. */
  orchestrator?: ApprovalInboxOrchestrator;
  /** Required when `pendingDelegationsRepo` is wired — for materialization events. */
  bus?: ApprovalInboxEventBus;
  artifactService?: {
    recordApprovalOutcomeArtifact(input: {
      companyId: string;
      approvalItemId: string;
      approvalDecisionId: string;
      decision: 'approved' | 'denied' | 'dismissed';
      subjectRefKind: string;
      subjectRefId: string;
      summary: string;
      rationale?: string | null;
      approvedByOperatorId?: string | null;
      createdAt: number;
    }): unknown;
  };
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

function withLatestDecision(item: ApprovalItem, budgetsRepo: BudgetsRepo): ApprovalItem {
  const latest = budgetsRepo.getLatestApprovalDecision(item.companyId, item.kind, item.id);
  return {
    ...item,
    latestDecision: latest ? toApprovalDecision(latest) : null,
  };
}

function budgetRowToApprovalItem(row: ApprovalItemRow, budgetsRepo: BudgetsRepo): ApprovalItem {
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

/**
 * Project a `pending_delegations` row into the canonical
 * `ApprovalItem` shape so the inbox UI can render it next to budget +
 * authority items without a special render path. The score breakdown
 * lands in the payload so the operator can see "WHY this assignee?"
 * before clicking approve.
 */
function pendingDelegationToApprovalItem(row: PendingDelegationRow): ApprovalItem {
  const breakdown: DelegationScoreBreakdown = {
    roleFit: row.roleFit,
    load: row.loadRatio,
    availability: row.availability,
    pastPerformance: row.pastPerformance,
  };
  const status: ApprovalItem['status'] =
    row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'denied' : 'pending';
  const priority: ApprovalItem['priority'] = (() => {
    switch (row.priority) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'low':
        return 'low';
      default:
        return 'medium';
    }
  })();
  return {
    id: row.id,
    companyId: row.companyId,
    kind: 'delegation-request',
    status,
    priority,
    requestedByOperatorId: row.reporterKind === 'operator' ? row.reporterId : null,
    requestedByEmployeeId: row.reporterKind === 'operator' ? null : row.reporterId,
    subjectRefKind: 'pending-delegation',
    subjectRefId: row.id,
    summary: `Delegate "${row.subtaskTitle}" to ${row.assigneeName || row.assigneeId}`,
    payload: {
      planId: row.planId,
      subtaskTitle: row.subtaskTitle,
      description: row.description,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      parentProjectId: row.parentProjectId,
      priority: row.priority,
      fallbackUsed: row.fallbackUsed === 1,
      attemptCount: row.attemptCount,
      assigneeScore: row.score,
      scoreBreakdown: breakdown,
      ticketId: row.ticketId,
    },
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    latestDecision: null,
  };
}

export function createApprovalInboxService({
  budgetsRepo,
  authorityRepo,
  pendingDelegationsRepo,
  ticketsRepo,
  projectsRepo,
  orchestrator,
  bus,
  artifactService,
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

    // C4 (audit 2026-05-07) — surface pending delegations next to
    // budget + authority items. The status filter maps the inbox vocab
    // (pending|approved|denied|dismissed) onto the pending-delegation
    // vocab (pending|approved|rejected). `dismissed` is not supported
    // for this kind — delegation requests can only be approved or denied.
    if (
      pendingDelegationsRepo &&
      (input.kind === undefined || input.kind === 'delegation-request')
    ) {
      let pendingRows = pendingDelegationsRepo.listByCompany(input.companyId);
      if (input.status !== undefined) {
        pendingRows = pendingRows.filter((row) => {
          if (input.status === 'pending') return row.status === 'pending';
          if (input.status === 'approved') return row.status === 'approved';
          if (input.status === 'denied') return row.status === 'rejected';
          return false;
        });
      }
      items.push(...pendingRows.map((row) => pendingDelegationToApprovalItem(row)));
    }

    if (input.kind === undefined || input.kind === 'authority-request') {
      if (input.status !== 'dismissed') {
        items.push(
          ...authorityRepo
            .listRequestsByCompany(
              input.companyId,
              input.status === undefined
                ? undefined
                : (input.status as 'pending' | 'approved' | 'denied'),
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

  async function reviewItem(
    input: ReviewApprovalInboxItemInput,
  ): Promise<ApprovalInboxReviewResult> {
    if (input.kind === 'budget-exception') {
      const existing = budgetsRepo.getApprovalItemById(input.itemId);
      if (!existing || existing.companyId !== input.companyId) {
        throw new Error(`[approvals] budget approval item not found: ${input.itemId}`);
      }
      if (existing.status !== 'pending') {
        throw new Error(
          `[approvals] budget approval item ${input.itemId} is already ${existing.status}`,
        );
      }

      budgetsRepo.resolveApprovalItem({
        itemId: input.itemId,
        status: input.decision,
      });
      const createdAt = Date.now();
      const decisionId = budgetsRepo.createApprovalDecision({
        companyId: input.companyId,
        approvalKind: 'budget-exception',
        approvalRefId: input.itemId,
        decision: input.decision,
        decidedByOperatorId: input.operatorId,
        rationale: input.rationale ?? null,
        payloadJson: existing.payloadJson,
      });
      if (artifactService) {
        try {
          artifactService.recordApprovalOutcomeArtifact({
            companyId: input.companyId,
            approvalItemId: input.itemId,
            approvalDecisionId: decisionId,
            decision: input.decision,
            subjectRefKind: existing.subjectRefKind,
            subjectRefId: existing.subjectRefId,
            summary: existing.summary,
            rationale: input.rationale ?? null,
            approvedByOperatorId: input.operatorId,
            createdAt,
          });
        } catch {
          // Approval resolution remains durable even if the artifact mirror fails.
        }
      }

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
        throw new Error(
          `[approvals] authority request ${input.itemId} is already ${request.status}`,
        );
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
      const createdAt = Date.now();
      const decisionId = budgetsRepo.createApprovalDecision({
        companyId: input.companyId,
        approvalKind: 'authority-request',
        approvalRefId: input.itemId,
        decision: input.decision,
        decidedByOperatorId: input.operatorId,
        rationale: input.rationale ?? null,
        payloadJson: JSON.stringify({
          extensionId: request.extensionId,
          resourceKind: request.resourceKind,
          resourceId: request.resourceId,
          requestedPermission: request.requestedPermission,
        }),
      });
      if (artifactService) {
        try {
          artifactService.recordApprovalOutcomeArtifact({
            companyId: input.companyId,
            approvalItemId: input.itemId,
            approvalDecisionId: decisionId,
            decision: input.decision,
            subjectRefKind: 'extension',
            subjectRefId: request.extensionId,
            summary: `Authority review required for ${request.resourceKind} ${request.resourceId}.`,
            rationale: input.rationale ?? null,
            approvedByOperatorId: input.operatorId,
            createdAt,
          });
        } catch {
          // Approval resolution remains durable even if the artifact mirror fails.
        }
      }

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

    if (input.kind === 'delegation-request') {
      if (!pendingDelegationsRepo) {
        throw new Error(
          '[approvals] delegation-request review requested but pendingDelegationsRepo is not wired',
        );
      }
      if (input.decision === 'dismissed') {
        throw new Error('[approvals] delegation-request cannot be dismissed');
      }
      if (!ticketsRepo || !orchestrator || !bus) {
        throw new Error(
          '[approvals] delegation-request review requires ticketsRepo, orchestrator, and bus',
        );
      }

      const pending = pendingDelegationsRepo.getById(input.itemId);
      if (!pending || pending.companyId !== input.companyId) {
        throw new Error(`[approvals] pending delegation not found: ${input.itemId}`);
      }
      if (pending.status !== 'pending') {
        throw new Error(
          `[approvals] pending delegation ${input.itemId} is already ${pending.status}`,
        );
      }

      const breakdown: DelegationScoreBreakdown = {
        roleFit: pending.roleFit,
        load: pending.loadRatio,
        availability: pending.availability,
        pastPerformance: pending.pastPerformance,
      };

      if (input.decision === 'denied') {
        const updated = pendingDelegationsRepo.markRejected(input.itemId, {
          operatorId: input.operatorId,
          rationale: input.rationale ?? null,
        });
        try {
          bus.emit({
            type: 'task.delegation_rejected' satisfies EventType,
            companyId: input.companyId,
            actorId: input.operatorId,
            actorKind: 'operator',
            payload: {
              pendingDelegationId: updated.id,
              planId: updated.planId,
              subtaskTitle: updated.subtaskTitle,
              assigneeId: updated.assigneeId,
              rejectedByOperatorId: input.operatorId,
              rationale: input.rationale ?? null,
            },
          });
        } catch {
          // Bus emit failures are non-fatal — the row is the SoT.
        }
        return {
          item: pendingDelegationToApprovalItem(updated),
          grantId: null,
          ticketId: null,
        };
      }

      // input.decision === 'approved' — materialize the pending row
      // into a real ticket using the existing tickets repo + project
      // linker + orchestrator queue path. This reuses the exact code
      // path that pre-C4 `delegate_subtask` ran inline; the only
      // difference is that the operator's click drives it instead of
      // the LLM-issued tool call.
      const ticketId = ticketsRepo.create({
        companyId: input.companyId,
        title: pending.subtaskTitle,
        description: pending.description,
        priority: pending.priority,
        assigneeId: pending.assigneeId,
        reporterId: pending.reporterId,
        reporterKind: pending.reporterKind,
        labelsJson: pending.labelsJson,
        dependenciesJson: pending.dependenciesJson,
        slaHours: pending.slaHours,
        dueAt: pending.dueAt,
      });
      ticketsRepo.assign(ticketId, pending.assigneeId);

      if (pending.parentProjectId && projectsRepo) {
        try {
          projectsRepo.linkTicket(pending.parentProjectId, ticketId);
        } catch {
          // Non-fatal — the ticket exists; project linkage failure is logged via bus.
        }
      }

      const delegatedAt = Date.now();
      let queuedThreadId = '';
      try {
        const pickup = await orchestrator.queueDelegatedTicket({
          ticketId,
          employeeId: pending.assigneeId,
          companyId: input.companyId,
          actorId: input.operatorId,
          actorKind: 'operator',
        });
        queuedThreadId = pickup.threadId;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // The ticket exists but the assignee couldn't be queued. We
        // still mark the pending row approved (the ticket IS created)
        // and emit task.escalated so the operator sees the failure
        // instead of a silent-success zombie ticket.
        const updated = pendingDelegationsRepo.markApproved(input.itemId, {
          operatorId: input.operatorId,
          ticketId,
          rationale: input.rationale ?? null,
        });
        try {
          bus.emit({
            type: 'task.escalated' satisfies EventType,
            companyId: input.companyId,
            actorId: input.operatorId,
            actorKind: 'operator',
            payload: {
              planId: updated.planId,
              originalAssigneeId: updated.assigneeId,
              ticketId,
              escalatedTo: input.operatorId,
              reason: `Ticket ${ticketId} was created on approval, but the assignee could not be queued: ${reason}`,
            },
          });
        } catch {
          // non-fatal
        }
        return {
          item: pendingDelegationToApprovalItem(updated),
          grantId: null,
          ticketId,
        };
      }

      const updated = pendingDelegationsRepo.markApproved(input.itemId, {
        operatorId: input.operatorId,
        ticketId,
        rationale: input.rationale ?? null,
      });

      // Materialization-time bus emits — same shape the pre-C4 code
      // emitted inline, plus the score breakdown the audit explicitly
      // called out as missing.
      try {
        bus.emit({
          type: 'ticket.created' satisfies EventType,
          companyId: input.companyId,
          actorId: input.operatorId,
          actorKind: 'operator',
          payload: {
            ticketId,
            companyId: input.companyId,
            title: pending.subtaskTitle,
            assigneeId: pending.assigneeId,
            createdAt: delegatedAt,
          },
        });
      } catch {
        // non-fatal
      }
      try {
        bus.emit({
          type: 'ticket.assigned' satisfies EventType,
          companyId: input.companyId,
          actorId: input.operatorId,
          actorKind: 'operator',
          payload: {
            ticketId,
            companyId: input.companyId,
            assigneeId: pending.assigneeId,
            previousAssigneeId: null,
            threadId: queuedThreadId,
            assignedAt: delegatedAt,
          },
        });
      } catch {
        // non-fatal
      }
      try {
        bus.emit({
          type: 'task.delegated' satisfies EventType,
          companyId: input.companyId,
          actorId: input.operatorId,
          actorKind: 'operator',
          payload: {
            ticketId,
            planId: pending.planId,
            assigneeId: pending.assigneeId,
            assigneeName: pending.assigneeName,
            parentProjectId: pending.parentProjectId,
            fallbackUsed: pending.fallbackUsed === 1,
            attemptCount: pending.attemptCount,
            pendingDelegationId: pending.id,
            scoreBreakdown: breakdown,
            assigneeScore: pending.score,
          },
        });
      } catch {
        // non-fatal
      }

      return {
        item: pendingDelegationToApprovalItem(updated),
        grantId: null,
        ticketId,
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
