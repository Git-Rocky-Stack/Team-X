import { describe, expect, it, vi } from 'vitest';

import type {
  ApprovalItem,
  BudgetLedgerEntry,
  BudgetOverview,
  BudgetPolicy,
  CreateBudgetPolicyRequest,
} from '@team-x/shared-types';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const budgetGovernanceService = {
    listPolicies: vi.fn(
      (): BudgetPolicy[] => [
        {
          id: 'policy-1',
          companyId: 'company-1',
          scopeKind: 'company',
          scopeRefId: 'company-1',
          period: 'monthly',
          hardCapUsd: '10.000000',
          warningThresholdPct: 80,
          autoPause: false,
          requireApprovalAboveUsd: '8.000000',
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ),
    createPolicy: vi.fn(() => 'policy-1'),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    listLedgerEntries: vi.fn(
      (): BudgetLedgerEntry[] => [
        {
          id: 'ledger-1',
          companyId: 'company-1',
          budgetPolicyId: 'policy-1',
          scopeKind: 'company',
          scopeRefId: 'company-1',
          runId: 'run-1',
          runKind: 'work',
          threadId: null,
          employeeId: 'employee-1',
          runtimeProfileId: null,
          routineId: null,
          provider: 'ollama',
          model: 'gemma',
          amountUsd: '1.000000',
          occurredAt: 10,
          createdAt: 10,
        },
      ],
    ),
    getOverview: vi.fn(
      (): BudgetOverview => ({
        companyId: 'company-1',
        period: 'monthly',
        periodStartAt: 0,
        periodEndAt: 100,
        companySpendUsd: '1.000000',
        activePolicyCount: 1,
        warningCount: 0,
        exceededCount: 0,
        pendingApprovalCount: 0,
        providerMix: [{ provider: 'ollama', amountUsd: '1.000000' }],
        policySummaries: [
          {
            id: 'policy-1',
            companyId: 'company-1',
            scopeKind: 'company',
            scopeRefId: 'company-1',
            period: 'monthly',
            hardCapUsd: '10.000000',
            warningThresholdPct: 80,
            autoPause: false,
            requireApprovalAboveUsd: '8.000000',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
            currentSpendUsd: '1.000000',
            remainingUsd: '9.000000',
            warningSpendUsd: '8.000000',
            approvalSpendUsd: '8.000000',
            alertLevel: 'ok',
          },
        ],
      }),
    ),
    listApprovalItems: vi.fn(
      (): ApprovalItem[] => [
        {
          id: 'approval-1',
          companyId: 'company-1',
          kind: 'budget-exception',
          status: 'pending',
          priority: 'high',
          requestedByOperatorId: null,
          requestedByEmployeeId: 'employee-1',
          subjectRefKind: 'budget-policy',
          subjectRefId: 'policy-1',
          summary: 'Approval required',
          payload: { budgetPolicyId: 'policy-1' },
          createdAt: 10,
          resolvedAt: null,
        },
      ],
    ),
  };

  return {
    companiesRepo: noop,
    employeesRepo: noop,
    threadsRepo: noop,
    messagesRepo: noop,
    ticketsRepo: noop,
    ticketAttachmentsRepo: noop,
    goalsRepo: noop,
    projectsRepo: noop,
    meetingsRepo: noop,
    orgEdgesRepo: noop,
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService: noop,
    secretsStore: noop,
    settingsRepo: {
      get: vi.fn(),
      set: vi.fn(),
      getAgentic: vi.fn(),
      setAgentic: vi.fn(),
      getPlanner: vi.fn(),
      setPlanner: vi.fn(),
      getExtensions: vi.fn(() => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(),
      getCopilot: vi.fn(),
      setCopilot: vi.fn(),
      getCopilotWeights: vi.fn(),
      setCopilotWeights: vi.fn(),
    } as unknown as IpcHandlerDeps['settingsRepo'],
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    getHardwareProfile: () => ({}) as never,
    budgetGovernanceService,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('budget IPC handlers', () => {
  it('lists and creates policies through the budget control plane', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);
    const req: CreateBudgetPolicyRequest = {
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
      warningThresholdPct: 80,
      requireApprovalAboveUsd: '8',
      autoPause: false,
    };

    const list = await handlers.budgetsListPolicies({ companyId: 'company-1' });
    const created = await handlers.budgetsCreatePolicy(req);

    expect(deps.budgetGovernanceService?.listPolicies).toHaveBeenCalledWith('company-1');
    expect(deps.budgetGovernanceService?.createPolicy).toHaveBeenCalledWith(req);
    expect(list[0]?.scopeKind).toBe('company');
    expect(created).toEqual({ policyId: 'policy-1' });
  });

  it('returns overview, ledger, and approval items', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const overview = await handlers.budgetsGetOverview({ companyId: 'company-1' });
    const ledger = await handlers.budgetsListLedger({ companyId: 'company-1', limit: 5 });
    const approvals = await handlers.budgetsListApprovals({ companyId: 'company-1', status: 'pending' });

    expect(overview.companySpendUsd).toBe('1.000000');
    expect(ledger[0]?.scopeKind).toBe('company');
    expect(approvals[0]?.kind).toBe('budget-exception');
  });

  it('rejects invalid budget scope kinds before dispatch', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.budgetsCreatePolicy({
        companyId: 'company-1',
        scopeKind: 'bogus' as never,
        scopeRefId: 'company-1',
        hardCapUsd: '10',
      }),
    ).rejects.toThrow(/invalid scopeKind/i);
  });
});
