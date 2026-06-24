import type { ApprovalItem, ApprovalItemKind, ApprovalItemStatus } from '@team-x/shared-types';
import { BadgeDollarSign, CheckSquare2, FolderLock, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
} from '@/components/console/index.js';
import { useApprovals, useReviewApproval } from '@/hooks/use-approvals.js';
import { useInstalledExtensions } from '@/hooks/use-extensions.js';
import { cn } from '@/lib/utils.js';

const FIELD_CLASSNAME =
  'well-input min-h-[96px] w-full px-3 py-3 text-body text-foreground outline-none';

type KindFilter = 'all' | 'authority-request' | 'budget-exception' | 'delegation-request';
type StatusFilter = 'all' | 'pending' | 'approved' | 'denied';

function formatTimestamp(value: number | null): string {
  if (!value) return 'Not resolved yet';
  return new Date(value).toLocaleString();
}

function kindLabel(kind: ApprovalItemKind): string {
  if (kind === 'authority-request') return 'Authority';
  if (kind === 'budget-exception') return 'Budget';
  if (kind === 'delegation-request') return 'Delegation';
  return kind;
}

function kindTone(kind: ApprovalItemKind): LampTone {
  if (kind === 'authority-request') return 'go';
  if (kind === 'budget-exception') return 'hold';
  if (kind === 'delegation-request') return 'hold';
  return 'off';
}

function statusTone(status: ApprovalItemStatus): LampTone {
  if (status === 'approved') return 'go';
  if (status === 'denied' || status === 'dismissed') return 'nogo';
  return 'hold';
}

function describeItem(item: ApprovalItem, extensionNameById: Map<string, string>): string {
  const payload = item.payload ?? {};
  if (item.kind === 'authority-request') {
    const extensionId =
      typeof payload.extensionId === 'string' ? payload.extensionId : item.subjectRefId;
    const extensionName = extensionNameById.get(extensionId) ?? extensionId;
    const resourceKind =
      typeof payload.resourceKind === 'string' ? payload.resourceKind : 'resource';
    const resourceId =
      typeof payload.resourceId === 'string' ? payload.resourceId : item.subjectRefId;
    return `${extensionName} requested ${resourceKind} access to ${resourceId}.`;
  }

  if (item.kind === 'budget-exception') {
    const scopeKind = typeof payload.scopeKind === 'string' ? payload.scopeKind : 'budget';
    const scopeRefId =
      typeof payload.scopeRefId === 'string' ? payload.scopeRefId : item.subjectRefId;
    const currentSpendUsd =
      typeof payload.currentSpendUsd === 'string' ? payload.currentSpendUsd : null;
    const approvalUsd =
      typeof payload.requireApprovalAboveUsd === 'string' ? payload.requireApprovalAboveUsd : null;
    return `${scopeKind} scope ${scopeRefId}${currentSpendUsd ? ` is at $${Number(currentSpendUsd).toFixed(2)}` : ''}${approvalUsd ? ` with an approval gate at $${Number(approvalUsd).toFixed(2)}` : ''}.`;
  }

  if (item.kind === 'delegation-request') {
    // C4 (audit 2026-05-07) — delegate_subtask parks delegations here
    // and the operator approves them to materialize tickets. Surface
    // the four-component score breakdown so the operator can read
    // "WHY this assignee?" before clicking approve.
    const assigneeName =
      typeof payload.assigneeName === 'string' && payload.assigneeName.length > 0
        ? payload.assigneeName
        : typeof payload.assigneeId === 'string'
          ? payload.assigneeId
          : 'unknown assignee';
    const subtaskTitle =
      typeof payload.subtaskTitle === 'string' ? payload.subtaskTitle : 'subtask';
    const score = typeof payload.assigneeScore === 'number' ? payload.assigneeScore : null;
    const breakdown =
      payload.scoreBreakdown && typeof payload.scoreBreakdown === 'object'
        ? (payload.scoreBreakdown as Record<string, unknown>)
        : null;
    const fmt = (n: unknown) => (typeof n === 'number' ? n.toFixed(2) : '—');
    const breakdownTrail = breakdown
      ? ` (role_fit ${fmt(breakdown.roleFit)} · load ${fmt(breakdown.load)} · availability ${fmt(breakdown.availability)} · past_performance ${fmt(breakdown.pastPerformance)})`
      : '';
    const fallbackTrail =
      payload.fallbackUsed === true
        ? ` — fallback selected on attempt ${typeof payload.attemptCount === 'number' ? payload.attemptCount : '?'}`
        : '';
    const scoreTrail = score !== null ? ` Score ${score.toFixed(2)}.` : '';
    return `Assign "${subtaskTitle}" to ${assigneeName}.${scoreTrail}${breakdownTrail}${fallbackTrail}`;
  }

  return item.summary;
}

export function ApprovalsPanel({ companyId }: { companyId: string }) {
  const approvalsQuery = useApprovals(companyId);
  const reviewApproval = useReviewApproval(companyId);
  const extensionsQuery = useInstalledExtensions(companyId);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [rationales, setRationales] = useState<Record<string, string>>({});

  const extensionNameById = useMemo(
    () => new Map((extensionsQuery.data ?? []).map((extension) => [extension.id, extension.name])),
    [extensionsQuery.data],
  );

  const allItems = approvalsQuery.data ?? [];
  const filteredItems = allItems.filter((item) => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  });

  const pendingCount = allItems.filter((item) => item.status === 'pending').length;
  const authorityCount = allItems.filter((item) => item.kind === 'authority-request').length;
  const budgetCount = allItems.filter((item) => item.kind === 'budget-exception').length;
  const urgentCount = allItems.filter(
    (item) => item.priority === 'critical' || item.priority === 'high',
  ).length;

  function setRationale(itemId: string, value: string) {
    setRationales((current) => ({ ...current, [itemId]: value }));
  }

  function submitDecision(item: ApprovalItem, decision: 'approved' | 'denied' | 'dismissed') {
    reviewApproval.mutate({
      companyId,
      itemId: item.id,
      kind: item.kind,
      decision,
      rationale: rationales[item.id]?.trim() || undefined,
    });
  }

  if (approvalsQuery.isLoading) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Loading approvals inbox"
        description="Team-X is assembling budget and authority reviews into one operator queue."
      />
    );
  }

  if (approvalsQuery.isError) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Approvals inbox could not load"
        description="The shared approvals service is wired, but the current workspace review query failed."
      />
    );
  }

  return (
    <div className="space-y-4" data-approvals-panel="">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Pending"
          value={String(pendingCount)}
          hint="Awaiting operator action"
          icon={CheckSquare2}
          tone={pendingCount > 0 ? 'amber' : undefined}
        />
        <MetricTile
          label="Authority"
          value={String(authorityCount)}
          hint="Extension trust and access reviews"
          icon={FolderLock}
        />
        <MetricTile
          label="Budget"
          value={String(budgetCount)}
          hint="Spend gates blocking autonomy"
          icon={BadgeDollarSign}
        />
        <MetricTile
          label="High Priority"
          value={String(urgentCount)}
          hint="High or critical items in the queue"
          icon={ShieldCheck}
        />
      </div>

      <RecessedWell className="space-y-4 p-4">
        <div className="space-y-1">
          <h3 className="text-h3 text-foreground">Unified Approval Queue</h3>
          <p className="text-caption text-muted-foreground">
            Budget exceptions and extension authority reviews now resolve through the same inbox and
            audit trail.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-eyebrow text-muted-foreground">Kind</div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                ['all', 'authority-request', 'budget-exception', 'delegation-request'] as const
              ).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setKindFilter(value)}
                  data-approval-kind-filter={value}
                  className={cn(
                    'cap px-3 py-1.5 text-button-sm',
                    kindFilter === value && 'cap-select',
                  )}
                >
                  {value === 'all' ? 'All' : kindLabel(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-eyebrow text-muted-foreground">Status</div>
            <div className="flex flex-wrap items-center gap-2">
              {(['pending', 'approved', 'denied', 'all'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  data-approval-status-filter={value}
                  className={cn(
                    'cap px-3 py-1.5 text-button-sm',
                    statusFilter === value && 'cap-select',
                  )}
                >
                  {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </RecessedWell>

      {filteredItems.length === 0 ? (
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No approvals match the current filters"
          description="Pending budget exceptions and authority reviews will land here as the workspace needs operator decisions."
        />
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <RecessedWell key={item.id} className="space-y-4 p-4" data-approval-card={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-strong text-foreground">{item.summary}</span>
                    <LampTile
                      label={kindLabel(item.kind)}
                      tone={kindTone(item.kind)}
                      small
                      interactive={false}
                    />
                    <LampTile
                      label={item.status}
                      tone={statusTone(item.status)}
                      small
                      interactive={false}
                    />
                    <Tag>{item.priority}</Tag>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {describeItem(item, extensionNameById)}
                  </p>
                </div>
                <div className="text-caption text-muted-foreground">
                  <div>Created {formatTimestamp(item.createdAt)}</div>
                  <div>Resolved {formatTimestamp(item.resolvedAt)}</div>
                </div>
              </div>

              {item.latestDecision?.rationale ? (
                <RecessedWell className="px-3 py-3 text-body text-muted-foreground">
                  <span className="font-semibold text-foreground">Latest rationale:</span>{' '}
                  {item.latestDecision.rationale}
                </RecessedWell>
              ) : null}

              {item.status === 'pending' ? (
                <div className="space-y-3">
                  <textarea
                    className={FIELD_CLASSNAME}
                    placeholder="Optional rationale to record with this decision"
                    value={rationales[item.id] ?? ''}
                    onChange={(event) => setRationale(item.id, event.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {item.kind === 'budget-exception' ? (
                      <button
                        type="button"
                        className="cap px-3 py-2 text-button-sm uppercase tracking-[0.14em] disabled:opacity-50"
                        onClick={() => submitDecision(item, 'dismissed')}
                        disabled={reviewApproval.isPending}
                      >
                        Dismiss
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="cap px-3 py-2 text-button-sm uppercase tracking-[0.14em] disabled:opacity-50"
                      onClick={() => submitDecision(item, 'denied')}
                      disabled={reviewApproval.isPending}
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      className="cap cap-select px-3 py-2 text-button-sm uppercase tracking-[0.14em] disabled:opacity-50"
                      onClick={() => submitDecision(item, 'approved')}
                      disabled={reviewApproval.isPending}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ) : null}
            </RecessedWell>
          ))}
        </div>
      )}

      {reviewApproval.isError ? (
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Approval decision failed"
          description="The item stayed unchanged. Retry from this inbox after checking the latest workspace state."
        />
      ) : null}
    </div>
  );
}
