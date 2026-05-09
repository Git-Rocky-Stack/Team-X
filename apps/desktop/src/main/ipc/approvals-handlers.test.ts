import type { ApprovalItem } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const noop = {} as never;
  const approvalInboxService = {
    listItems: vi.fn((): ApprovalItem[] => [
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
        summary: 'Budget approval required',
        payload: { budgetPolicyId: 'policy-1' },
        createdAt: 10,
        resolvedAt: null,
        latestDecision: null,
      },
    ]),
    reviewItem: vi.fn(async () => ({
      item: {
        id: 'approval-1',
        companyId: 'company-1',
        kind: 'budget-exception',
        status: 'approved',
        priority: 'high',
        requestedByOperatorId: null,
        requestedByEmployeeId: 'employee-1',
        subjectRefKind: 'budget-policy',
        subjectRefId: 'policy-1',
        summary: 'Budget approval required',
        payload: { budgetPolicyId: 'policy-1' },
        createdAt: 10,
        resolvedAt: 12,
        latestDecision: {
          id: 'decision-1',
          companyId: 'company-1',
          approvalKind: 'budget-exception',
          approvalRefId: 'approval-1',
          decision: 'approved',
          decidedByOperatorId: 'rocky',
          rationale: 'Approved for the rest of the month.',
          payload: null,
          createdAt: 12,
        },
      },
      grantId: null,
    })),
  } as unknown as IpcHandlerDeps['approvalInboxService'];
  const operatorAccessService = {
    resolveOperatorIdForCompany: vi.fn(
      (_companyId: string, preferredOperatorId?: string | null) => preferredOperatorId ?? 'rocky',
    ),
    listByCompany: vi.fn(() => []),
    ensureLocalOwnerForCompany: vi.fn(() => ({
      operatorId: 'rocky',
      membershipId: 'membership-1',
    })),
  } as unknown as IpcHandlerDeps['operatorAccessService'];

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
    approvalInboxService,
    operatorAccessService,
    getHardwareProfile: () => ({}) as never,
    ...overrides,
  } as unknown as IpcHandlerDeps;
}

describe('approvals IPC handlers', () => {
  it('lists unified approval items through approvals.list', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const list = await handlers.approvalsList({ companyId: 'company-1', status: 'pending' });

    expect(deps.approvalInboxService?.listItems).toHaveBeenCalledWith({
      companyId: 'company-1',
      status: 'pending',
    });
    expect(list[0]?.kind).toBe('budget-exception');
  });

  it('reviews one approval item through approvals.review', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    const result = await handlers.approvalsReview({
      companyId: 'company-1',
      itemId: 'approval-1',
      kind: 'budget-exception',
      decision: 'approved',
      rationale: 'Approved for the rest of the month.',
    });

    expect(deps.approvalInboxService?.reviewItem).toHaveBeenCalledWith({
      companyId: 'company-1',
      itemId: 'approval-1',
      kind: 'budget-exception',
      decision: 'approved',
      rationale: 'Approved for the rest of the month.',
      operatorId: 'rocky',
    });
    expect(result).toEqual({ grantId: null });
  });

  it('resolves an explicit workspace operator for approvals.review', async () => {
    const deps = makeDeps();
    const handlers = createIpcHandlers(deps);

    await handlers.approvalsReview({
      companyId: 'company-1',
      itemId: 'approval-1',
      kind: 'budget-exception',
      decision: 'approved',
      operatorId: 'operator-9',
    });

    expect(deps.operatorAccessService?.resolveOperatorIdForCompany).toHaveBeenCalledWith(
      'company-1',
      'operator-9',
    );
    expect(deps.approvalInboxService?.reviewItem).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'operator-9',
      }),
    );
  });
});
