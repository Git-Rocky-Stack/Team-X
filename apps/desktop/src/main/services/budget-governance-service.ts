import type {
  ActorKind,
  ApprovalDecision,
  ApprovalItem,
  ApprovalItemStatus,
  BudgetAlertLevel,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  BudgetPolicyPeriod,
  BudgetPolicySummary,
  BudgetScopeKind,
  EventType,

  BudgetApprovalRequestedPayload,
  BudgetCompanyPausedPayload,
  BudgetExceededPayload,
  BudgetPolicyCreatedPayload,
  BudgetPolicyDeletedPayload,
  BudgetPolicyUpdatedPayload,
  BudgetWarningPayload} from '@team-x/shared-types';

import type {
  ApprovalDecisionRow,
  ApprovalItemRow,
  BudgetLedgerEntryRow,
  BudgetPolicyRow,
  BudgetsRepo,
} from '../db/repos/budgets.js';
import type { EmployeeRow } from '../db/repos/employees.js';
import type { RoutineRunRow } from '../db/repos/routines.js';
import type { RunRow } from '../db/repos/runs.js';
import type { TicketRow } from '../db/repos/tickets.js';

export interface CreateBudgetPolicyInput {
  companyId: string;
  scopeKind: BudgetScopeKind;
  scopeRefId: string;
  period?: BudgetPolicyPeriod;
  hardCapUsd: string;
  warningThresholdPct?: number;
  autoPause?: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled?: boolean;
}

export interface UpdateBudgetPolicyInput {
  policyId: string;
  hardCapUsd?: string;
  warningThresholdPct?: number;
  autoPause?: boolean;
  requireApprovalAboveUsd?: string | null;
  enabled?: boolean;
}

export interface ListBudgetLedgerEntriesInput {
  companyId: string;
  scopeKind?: BudgetScopeKind;
  scopeRefId?: string;
  limit?: number;
}

export interface ListApprovalItemsInput {
  companyId: string;
  status?: ApprovalItemStatus;
}

export interface BudgetAdmissionInput {
  companyId: string;
  employeeId?: string | null;
  routineId?: string | null;
  executionKind: 'routine' | 'agentic' | 'copilot';
}

export interface BudgetAdmissionResult {
  allowed: boolean;
  policy: BudgetPolicySummary | null;
  reason: string | null;
  approvalItem: ApprovalItem | null;
}

export interface BudgetGovernanceServiceDeps {
  budgetsRepo: BudgetsRepo;
  employeesRepo: {
    getById(id: string): EmployeeRow | null;
  };
  runsRepo: {
    getById(id: string): RunRow | null;
  };
  ticketsRepo: {
    getByThreadId(threadId: string): TicketRow | null;
  };
  routinesRepo: {
    getLatestRunByTicketId(ticketId: string): RoutineRunRow | null;
  };
  runtimeProfilesService: {
    getProfileForEmployee(employeeId: string): { id: string } | null;
  };
  bus?: {
    emit<T>(input: {
      type: EventType;
      companyId: string;
      actorId: string;
      actorKind: ActorKind;
      payload: T;
    }): unknown;
  };
  orchestrator?: {
    pauseCompany(companyId: string): Promise<void>;
  };
  operatorId?: string;
  now?(): number;
  logger?: {
    warn(msg: string, err?: unknown): void;
    error(msg: string, err?: unknown): void;
  };
}

export interface BudgetGovernanceService {
  listPolicies(companyId: string): BudgetPolicy[];
  createPolicy(input: CreateBudgetPolicyInput): string;
  updatePolicy(input: UpdateBudgetPolicyInput): void;
  deletePolicy(policyId: string): void;
  listLedgerEntries(input: ListBudgetLedgerEntriesInput): BudgetLedgerEntry[];
  getOverview(companyId: string): BudgetOverview;
  listApprovalItems(input: ListApprovalItemsInput): ApprovalItem[];
  assertExecutionAllowed(input: BudgetAdmissionInput): Promise<BudgetAdmissionResult>;
  recordRunSpend(runId: string): Promise<void>;
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

function formatUsd(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : '0.000000';
}

function parseUsd(value: string | null | undefined, label: string): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`[budgets] ${label} must be a non-negative USD amount`);
  }
  return parsed;
}

function normalizeUsdInput(
  value: string | null | undefined,
  label: string,
): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return formatUsd(parseUsd(value, label));
}

function normalizeThreshold(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error('[budgets] warningThresholdPct must be between 1 and 100');
  }
  return Math.round(value);
}

function currentMonthlyWindow(nowMs: number): { startAt: number; endAt: number } {
  const start = new Date(nowMs);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {
    startAt: start.getTime(),
    endAt: end.getTime(),
  };
}

function rowToBudgetPolicy(row: BudgetPolicyRow): BudgetPolicy {
  return {
    id: row.id,
    companyId: row.companyId,
    scopeKind: row.scopeKind as BudgetScopeKind,
    scopeRefId: row.scopeRefId,
    period: row.period as BudgetPolicyPeriod,
    hardCapUsd: row.hardCapUsd,
    warningThresholdPct: row.warningThresholdPct,
    autoPause: row.autoPause,
    requireApprovalAboveUsd: row.requireApprovalAboveUsd,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToBudgetLedgerEntry(row: BudgetLedgerEntryRow): BudgetLedgerEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    budgetPolicyId: row.budgetPolicyId,
    scopeKind: row.scopeKind as BudgetScopeKind,
    scopeRefId: row.scopeRefId,
    runId: row.runId,
    runKind: row.runKind as BudgetLedgerEntry['runKind'],
    threadId: row.threadId,
    employeeId: row.employeeId,
    runtimeProfileId: row.runtimeProfileId,
    routineId: row.routineId,
    provider: row.provider,
    model: row.model,
    amountUsd: row.amountUsd,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function rowToApprovalItem(row: ApprovalItemRow): ApprovalItem {
  return {
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
  };
}

function rowToApprovalDecision(row: ApprovalDecisionRow): ApprovalDecision {
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

function summarizePolicy(policy: BudgetPolicy, currentSpendUsd: string): BudgetPolicySummary {
  const spend = Number(currentSpendUsd);
  const hardCap = Number(policy.hardCapUsd);
  const warningSpend = hardCap * (policy.warningThresholdPct / 100);
  const approvalSpend = policy.requireApprovalAboveUsd
    ? Number(policy.requireApprovalAboveUsd)
    : null;

  let alertLevel: BudgetAlertLevel = 'ok';
  if (spend >= hardCap) {
    alertLevel = 'exceeded';
  } else if (approvalSpend !== null && spend >= approvalSpend) {
    alertLevel = 'approval-required';
  } else if (spend >= warningSpend) {
    alertLevel = 'warning';
  }

  return {
    ...policy,
    currentSpendUsd: formatUsd(spend),
    remainingUsd: formatUsd(Math.max(0, hardCap - spend)),
    warningSpendUsd: formatUsd(warningSpend),
    approvalSpendUsd: approvalSpend === null ? null : formatUsd(approvalSpend),
    alertLevel,
  };
}

export function createBudgetGovernanceService(
  deps: BudgetGovernanceServiceDeps,
): BudgetGovernanceService {
  const {
    budgetsRepo,
    employeesRepo,
    runsRepo,
    ticketsRepo,
    routinesRepo,
    runtimeProfilesService,
    bus,
    orchestrator,
    operatorId = 'rocky',
    now = () => Date.now(),
    logger = console,
  } = deps;

  function emit<T>(
    type: EventType,
    companyId: string,
    actorId: string,
    actorKind: ActorKind,
    payload: T,
  ): void {
    if (!bus) return;
    try {
      bus.emit<T>({ type, companyId, actorId, actorKind, payload });
    } catch (err) {
      logger.warn(`[budgets] ${type} emit failed`, err);
    }
  }

  function getSummary(policy: BudgetPolicy, referenceMs: number): BudgetPolicySummary {
    const window = currentMonthlyWindow(referenceMs);
    const currentSpendUsd = budgetsRepo.sumLedgerAmount(
      policy.companyId,
      policy.scopeKind,
      policy.scopeRefId,
      window.startAt,
      window.endAt,
    );
    return summarizePolicy(policy, currentSpendUsd);
  }

  function hydrateApprovalItem(row: ApprovalItemRow): ApprovalItem {
    const latestDecision = budgetsRepo.getLatestApprovalDecision(
      row.companyId,
      row.kind as ApprovalItem['kind'],
      row.id,
    );
    return {
      ...rowToApprovalItem(row),
      latestDecision: latestDecision ? rowToApprovalDecision(latestDecision) : null,
    };
  }

  function listPolicies(companyId: string): BudgetPolicy[] {
    return budgetsRepo.listPoliciesByCompany(companyId).map(rowToBudgetPolicy);
  }

  function getOverview(companyId: string): BudgetOverview {
    const referenceMs = now();
    const window = currentMonthlyWindow(referenceMs);
    const policySummaries = listPolicies(companyId).map((policy) =>
      getSummary(policy, referenceMs),
    );
    const approvals = budgetsRepo.listApprovalItems(companyId, 'budget-exception', 'pending');

    return {
      companyId,
      period: 'monthly',
      periodStartAt: window.startAt,
      periodEndAt: window.endAt,
      companySpendUsd: budgetsRepo.sumLedgerAmount(
        companyId,
        'company',
        companyId,
        window.startAt,
        window.endAt,
      ),
      activePolicyCount: policySummaries.filter((policy) => policy.enabled).length,
      warningCount: policySummaries.filter((policy) => policy.alertLevel === 'warning').length,
      exceededCount: policySummaries.filter((policy) => policy.alertLevel === 'exceeded').length,
      pendingApprovalCount: approvals.length,
      providerMix: budgetsRepo.providerMix(companyId, window.startAt, window.endAt),
      policySummaries,
    };
  }

  function listApprovalItems(input: ListApprovalItemsInput): ApprovalItem[] {
    return budgetsRepo
      .listApprovalItems(input.companyId, 'budget-exception', input.status)
      .map(hydrateApprovalItem);
  }

  function getLatestBudgetResolution(
    companyId: string,
    policyId: string,
    referenceMs: number,
  ): ApprovalItem | null {
    const window = currentMonthlyWindow(referenceMs);
    const resolved = budgetsRepo
      .listApprovalItemsForSubject(companyId, 'budget-exception', 'budget-policy', policyId)
      .filter(
        (row) =>
          row.status !== 'pending' &&
          row.createdAt >= window.startAt &&
          row.createdAt <= window.endAt,
      );
    const latest = resolved[0];
    return latest ? hydrateApprovalItem(latest) : null;
  }

  function createBudgetApproval(
    policy: BudgetPolicySummary,
    requestedByEmployeeId?: string | null,
  ): ApprovalItem {
    const existing = budgetsRepo.findPendingApprovalItem(
      policy.companyId,
      'budget-exception',
      'budget-policy',
      policy.id,
    );
    if (existing) return rowToApprovalItem(existing);

    const payload = {
      budgetPolicyId: policy.id,
      scopeKind: policy.scopeKind,
      scopeRefId: policy.scopeRefId,
      currentSpendUsd: policy.currentSpendUsd,
      requireApprovalAboveUsd: policy.approvalSpendUsd,
      hardCapUsd: policy.hardCapUsd,
    };
    const approvalPriority: ApprovalItem['priority'] =
      policy.alertLevel === 'exceeded' ? 'critical' : 'high';
    const itemId = budgetsRepo.createApprovalItem({
      companyId: policy.companyId,
      kind: 'budget-exception',
      priority: approvalPriority,
      requestedByEmployeeId: requestedByEmployeeId ?? null,
      requestedByOperatorId: null,
      subjectRefKind: 'budget-policy',
      subjectRefId: policy.id,
      summary: `Budget approval required for ${policy.scopeKind} scope ${policy.scopeRefId}.`,
      payloadJson: JSON.stringify(payload),
      createdAt: now(),
    });

    const item = budgetsRepo
      .listApprovalItems(policy.companyId, 'budget-exception', 'pending')
      .find((row) => row.id === itemId);
    const approval = item
      ? rowToApprovalItem(item)
      : {
          id: itemId,
          companyId: policy.companyId,
          kind: 'budget-exception' as const,
          status: 'pending' as const,
          priority: approvalPriority,
          requestedByOperatorId: null,
          requestedByEmployeeId: requestedByEmployeeId ?? null,
          subjectRefKind: 'budget-policy' as const,
          subjectRefId: policy.id,
          summary: `Budget approval required for ${policy.scopeKind} scope ${policy.scopeRefId}.`,
          payload,
          createdAt: now(),
          resolvedAt: null,
        };

    emit<BudgetApprovalRequestedPayload>(
      'budget.approvalRequested',
      policy.companyId,
      policy.id,
      'system',
      {
        budgetPolicyId: policy.id,
        approvalItemId: approval.id,
        scopeKind: policy.scopeKind,
        scopeRefId: policy.scopeRefId,
        currentSpendUsd: Number(policy.currentSpendUsd),
        requireApprovalAboveUsd: Number(policy.approvalSpendUsd ?? '0'),
      },
    );

    return approval;
  }

  async function pauseCompanyForBudget(policy: BudgetPolicySummary, reason: string): Promise<void> {
    if (!orchestrator || !policy.autoPause) return;
    try {
      await orchestrator.pauseCompany(policy.companyId);
      emit<BudgetCompanyPausedPayload>(
        'budget.companyPaused',
        policy.companyId,
        policy.id,
        'system',
        {
          budgetPolicyId: policy.id,
          scopeKind: policy.scopeKind,
          scopeRefId: policy.scopeRefId,
          currentSpendUsd: Number(policy.currentSpendUsd),
          hardCapUsd: Number(policy.hardCapUsd),
          reason,
        },
      );
    } catch (err) {
      logger.warn('[budgets] pauseCompany failed', err);
    }
  }

  function collectScopePolicies(
    companyId: string,
    employeeId?: string | null,
    routineId?: string | null,
  ): BudgetPolicy[] {
    const scopes: Array<{ scopeKind: BudgetScopeKind; scopeRefId: string }> = [
      { scopeKind: 'company', scopeRefId: companyId },
    ];

    if (employeeId) {
      scopes.push({ scopeKind: 'employee', scopeRefId: employeeId });
      const runtimeProfile = runtimeProfilesService.getProfileForEmployee(employeeId);
      if (runtimeProfile) {
        scopes.push({ scopeKind: 'runtime-profile', scopeRefId: runtimeProfile.id });
      }
    }

    if (routineId) {
      scopes.push({ scopeKind: 'routine', scopeRefId: routineId });
    }

    const policies: BudgetPolicy[] = [];
    for (const scope of scopes) {
      const row = budgetsRepo.findPolicy(companyId, scope.scopeKind, scope.scopeRefId);
      if (row) policies.push(rowToBudgetPolicy(row));
    }
    return policies;
  }

  async function assertExecutionAllowed(
    input: BudgetAdmissionInput,
  ): Promise<BudgetAdmissionResult> {
    const referenceMs = now();
    const policies = collectScopePolicies(input.companyId, input.employeeId, input.routineId)
      .filter((policy) => policy.enabled)
      .map((policy) => getSummary(policy, referenceMs));

    const exceeded = policies.find((policy) => policy.alertLevel === 'exceeded');
    if (exceeded) {
      await pauseCompanyForBudget(exceeded, `${input.executionKind} admission blocked at hard cap`);
      return {
        allowed: false,
        policy: exceeded,
        reason: `Budget cap reached for ${exceeded.scopeKind} scope ${exceeded.scopeRefId}.`,
        approvalItem: exceeded.approvalSpendUsd
          ? createBudgetApproval(exceeded, input.employeeId)
          : null,
      };
    }

    const approvalRequired = policies.find((policy) => policy.alertLevel === 'approval-required');
    if (approvalRequired) {
      const latestResolution = getLatestBudgetResolution(
        approvalRequired.companyId,
        approvalRequired.id,
        referenceMs,
      );
      if (latestResolution?.status === 'approved') {
        return {
          allowed: true,
          policy: approvalRequired,
          reason: null,
          approvalItem: latestResolution,
        };
      }
      if (latestResolution?.status === 'denied' || latestResolution?.status === 'dismissed') {
        return {
          allowed: false,
          policy: approvalRequired,
          reason: `Budget approval ${latestResolution.status} for ${approvalRequired.scopeKind} scope ${approvalRequired.scopeRefId}.`,
          approvalItem: latestResolution,
        };
      }
      const approvalItem = createBudgetApproval(approvalRequired, input.employeeId);
      return {
        allowed: false,
        policy: approvalRequired,
        reason: `Budget approval required for ${approvalRequired.scopeKind} scope ${approvalRequired.scopeRefId}.`,
        approvalItem,
      };
    }

    return {
      allowed: true,
      policy: null,
      reason: null,
      approvalItem: null,
    };
  }

  async function evaluatePolicyThresholds(
    policy: BudgetPolicy,
    scopeAmountUsd: number,
    requestedByEmployeeId?: string | null,
  ): Promise<void> {
    if (!policy.enabled) return;

    const summary = getSummary(policy, now());
    const currentSpend = Number(summary.currentSpendUsd);
    const previousSpend = Math.max(0, currentSpend - scopeAmountUsd);
    const warningSpend = Number(summary.warningSpendUsd);
    const approvalSpend = summary.approvalSpendUsd ? Number(summary.approvalSpendUsd) : null;
    const hardCapSpend = Number(summary.hardCapUsd);

    if (previousSpend < warningSpend && currentSpend >= warningSpend) {
      emit<BudgetWarningPayload>('budget.warning', policy.companyId, policy.id, 'system', {
        budgetPolicyId: policy.id,
        scopeKind: policy.scopeKind,
        scopeRefId: policy.scopeRefId,
        currentSpendUsd: currentSpend,
        hardCapUsd: hardCapSpend,
        warningThresholdPct: policy.warningThresholdPct,
      });
    }

    if (approvalSpend !== null && previousSpend < approvalSpend && currentSpend >= approvalSpend) {
      createBudgetApproval(summary, requestedByEmployeeId);
    }

    if (previousSpend < hardCapSpend && currentSpend >= hardCapSpend) {
      emit<BudgetExceededPayload>('budget.exceeded', policy.companyId, policy.id, 'system', {
        budgetPolicyId: policy.id,
        scopeKind: policy.scopeKind,
        scopeRefId: policy.scopeRefId,
        currentSpendUsd: currentSpend,
        hardCapUsd: hardCapSpend,
      });
      await pauseCompanyForBudget(summary, 'budget hard cap exceeded after run completion');
    }
  }

  async function recordRunSpend(runId: string): Promise<void> {
    const run = runsRepo.getById(runId);
    if (!run || run.status === 'running' || run.status === 'cancelled') return;
    const amountUsd = Number(run.costUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;

    const employee = employeesRepo.getById(run.employeeId);
    if (!employee) return;

    const runtimeProfileId =
      runtimeProfilesService.getProfileForEmployee(run.employeeId)?.id ?? null;
    const ticket = run.threadId ? ticketsRepo.getByThreadId(run.threadId) : null;
    const routineId = ticket
      ? (routinesRepo.getLatestRunByTicketId(ticket.id)?.routineId ?? null)
      : null;
    const companyId = employee.companyId;

    const scopes: Array<{ scopeKind: BudgetScopeKind; scopeRefId: string }> = [
      { scopeKind: 'company', scopeRefId: companyId },
      { scopeKind: 'employee', scopeRefId: run.employeeId },
    ];
    if (runtimeProfileId) {
      scopes.push({ scopeKind: 'runtime-profile', scopeRefId: runtimeProfileId });
    }
    if (routineId) {
      scopes.push({ scopeKind: 'routine', scopeRefId: routineId });
    }

    // Stamp the ledger entry with the service's clock rather than the run's
    // wall-clock end time. The two are identical in production (runsRepo
    // uses `Date.now()`), but tests inject a fixed `now()` via service deps
    // while runsRepo always uses the real clock — without this normalization
    // a fixed-clock test month never matches the real-clock ledger entry
    // and `getOverview` returns 0 spend.
    const occurredAt = now();
    for (const scope of scopes) {
      const policy = budgetsRepo.findPolicy(companyId, scope.scopeKind, scope.scopeRefId);
      budgetsRepo.createLedgerEntry({
        companyId,
        budgetPolicyId: policy?.id ?? null,
        scopeKind: scope.scopeKind,
        scopeRefId: scope.scopeRefId,
        runId: run.id,
        runKind: run.kind as BudgetLedgerEntry['runKind'],
        threadId: run.threadId,
        employeeId: run.employeeId,
        runtimeProfileId,
        routineId,
        provider: run.provider,
        model: run.model,
        amountUsd: formatUsd(amountUsd),
        occurredAt,
      });
      if (policy) {
        await evaluatePolicyThresholds(rowToBudgetPolicy(policy), amountUsd, run.employeeId);
      }
    }
  }

  return {
    listPolicies,

    createPolicy(input: CreateBudgetPolicyInput): string {
      const scopeRefId = input.scopeKind === 'company' ? input.companyId : input.scopeRefId.trim();
      if (scopeRefId.length === 0) {
        throw new Error('[budgets] scopeRefId is required');
      }
      const policyId = budgetsRepo.createPolicy({
        companyId: input.companyId,
        scopeKind: input.scopeKind,
        scopeRefId,
        period: input.period ?? 'monthly',
        hardCapUsd: formatUsd(parseUsd(input.hardCapUsd, 'hardCapUsd')),
        warningThresholdPct: normalizeThreshold(input.warningThresholdPct) ?? 80,
        autoPause: input.autoPause ?? false,
        requireApprovalAboveUsd:
          input.requireApprovalAboveUsd === undefined
            ? null
            : normalizeUsdInput(input.requireApprovalAboveUsd, 'requireApprovalAboveUsd'),
        enabled: input.enabled ?? true,
      });
      const policy = budgetsRepo.getPolicyById(policyId);
      if (policy) {
        emit<BudgetPolicyCreatedPayload>(
          'budget.policyCreated',
          policy.companyId,
          operatorId,
          'user',
          {
            budgetPolicyId: policy.id,
            scopeKind: policy.scopeKind,
            scopeRefId: policy.scopeRefId,
            hardCapUsd: Number(policy.hardCapUsd),
            warningThresholdPct: policy.warningThresholdPct,
            requireApprovalAboveUsd: policy.requireApprovalAboveUsd
              ? Number(policy.requireApprovalAboveUsd)
              : null,
            autoPause: policy.autoPause,
          },
        );
      }
      return policyId;
    },

    updatePolicy(input: UpdateBudgetPolicyInput): void {
      const before = budgetsRepo.getPolicyById(input.policyId);
      if (!before) {
        throw new Error(`[budgets] policy not found: ${input.policyId}`);
      }
      budgetsRepo.updatePolicy(input.policyId, {
        hardCapUsd:
          input.hardCapUsd === undefined
            ? undefined
            : formatUsd(parseUsd(input.hardCapUsd, 'hardCapUsd')),
        warningThresholdPct: normalizeThreshold(input.warningThresholdPct),
        autoPause: input.autoPause,
        requireApprovalAboveUsd:
          input.requireApprovalAboveUsd === undefined
            ? undefined
            : normalizeUsdInput(input.requireApprovalAboveUsd, 'requireApprovalAboveUsd'),
        enabled: input.enabled,
      });
      const after = budgetsRepo.getPolicyById(input.policyId);
      if (after) {
        emit<BudgetPolicyUpdatedPayload>(
          'budget.policyUpdated',
          after.companyId,
          operatorId,
          'user',
          {
            budgetPolicyId: after.id,
            scopeKind: after.scopeKind,
            scopeRefId: after.scopeRefId,
            hardCapUsd: Number(after.hardCapUsd),
            warningThresholdPct: after.warningThresholdPct,
            requireApprovalAboveUsd: after.requireApprovalAboveUsd
              ? Number(after.requireApprovalAboveUsd)
              : null,
            autoPause: after.autoPause,
          },
        );
      }
    },

    deletePolicy(policyId: string): void {
      const policy = budgetsRepo.getPolicyById(policyId);
      if (!policy) {
        throw new Error(`[budgets] policy not found: ${policyId}`);
      }
      budgetsRepo.deletePolicy(policyId);
      emit<BudgetPolicyDeletedPayload>(
        'budget.policyDeleted',
        policy.companyId,
        operatorId,
        'user',
        {
          budgetPolicyId: policy.id,
          scopeKind: policy.scopeKind,
          scopeRefId: policy.scopeRefId,
        },
      );
    },

    listLedgerEntries(input: ListBudgetLedgerEntriesInput): BudgetLedgerEntry[] {
      return budgetsRepo.listLedgerEntries(input).map(rowToBudgetLedgerEntry);
    },

    getOverview,
    listApprovalItems,
    assertExecutionAllowed,
    recordRunSpend,
  };
}
