import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createBudgetsRepo } from './budgets.js';
import { createRunsRepo } from './runs.js';

let ctx: TestDbHandle;
let budgetsRepo: ReturnType<typeof createBudgetsRepo>;
let runsRepo: ReturnType<typeof createRunsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  budgetsRepo = createBudgetsRepo(ctx.db);
  runsRepo = createRunsRepo(ctx.db);

  ctx.db
    .insert(companies)
    .values({
      id: 'company-1',
      name: 'Alpha',
      slug: 'alpha',
      createdAt: 1,
      settingsJson: '{}',
      icon: null,
      theme: 'dark',
      status: 'running',
    })
    .run();
  ctx.db
    .insert(employees)
    .values({
      id: 'employee-1',
      companyId: 'company-1',
      rolePackId: 'strategia-official',
      roleId: 'ceo',
      roleMdSha: 'sha',
      level: 'officer',
      name: 'Iris',
      title: 'CEO',
      status: 'idle',
      modelPref: null,
      providerPref: null,
      toolsAllowedJson: '[]',
      toolsDeniedJson: '[]',
      avatar: null,
      isSystem: false,
      createdAt: 1,
    })
    .run();
});

afterEach(() => ctx.close());

describe('budgets repo', () => {
  it('creates and updates budget policies per scope', () => {
    const policyId = budgetsRepo.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      period: 'monthly',
      hardCapUsd: '25.000000',
      warningThresholdPct: 80,
      autoPause: true,
      requireApprovalAboveUsd: '20.000000',
      enabled: true,
    });

    budgetsRepo.updatePolicy(policyId, {
      hardCapUsd: '30.000000',
      enabled: false,
    });

    const policy = budgetsRepo.getPolicyById(policyId);
    expect(policy).toEqual(
      expect.objectContaining({
        id: policyId,
        hardCapUsd: '30.000000',
        enabled: false,
      }),
    );
    expect(budgetsRepo.findPolicy('company-1', 'company', 'company-1')).toEqual(
      expect.objectContaining({ id: policyId }),
    );
  });

  it('aggregates ledger spend and provider mix from scoped run entries', () => {
    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'ollama',
      model: 'gemma',
      kind: 'work',
    });
    runsRepo.finish(runId, {
      status: 'success',
      promptTokens: 10,
      completionTokens: 12,
      latencyMs: 200,
      costUsd: '1.250000',
    });

    budgetsRepo.createLedgerEntry({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      runId,
      runKind: 'work',
      employeeId: 'employee-1',
      provider: 'ollama',
      model: 'gemma',
      amountUsd: '1.250000',
      occurredAt: 10,
    });
    budgetsRepo.createLedgerEntry({
      companyId: 'company-1',
      scopeKind: 'employee',
      scopeRefId: 'employee-1',
      runId,
      runKind: 'work',
      employeeId: 'employee-1',
      provider: 'ollama',
      model: 'gemma',
      amountUsd: '1.250000',
      occurredAt: 10,
    });

    expect(budgetsRepo.sumLedgerAmount('company-1', 'company', 'company-1', 0, 1000)).toBe('1.25');
    expect(budgetsRepo.providerMix('company-1', 0, 1000)).toEqual([
      { provider: 'ollama', amountUsd: '1.25' },
    ]);
  });

  it('stores and lists pending budget approval items', () => {
    const itemId = budgetsRepo.createApprovalItem({
      companyId: 'company-1',
      kind: 'budget-exception',
      priority: 'high',
      subjectRefKind: 'budget-policy',
      subjectRefId: 'policy-1',
      summary: 'Approval required for company budget',
      payloadJson: JSON.stringify({ budgetPolicyId: 'policy-1' }),
    });

    const pending = budgetsRepo.listApprovalItems('company-1', 'budget-exception', 'pending');

    expect(itemId).toBeTruthy();
    expect(pending[0]).toEqual(
      expect.objectContaining({
        id: itemId,
        status: 'pending',
        subjectRefId: 'policy-1',
      }),
    );
  });

  it('records approval decisions alongside approval items', () => {
    const itemId = budgetsRepo.createApprovalItem({
      companyId: 'company-1',
      kind: 'budget-exception',
      priority: 'high',
      subjectRefKind: 'budget-policy',
      subjectRefId: 'policy-1',
      summary: 'Approval required for company budget',
    });

    budgetsRepo.resolveApprovalItem({ itemId, status: 'approved' });
    budgetsRepo.createApprovalDecision({
      companyId: 'company-1',
      approvalKind: 'budget-exception',
      approvalRefId: itemId,
      decision: 'approved',
      decidedByOperatorId: 'rocky',
      rationale: 'Approved for the current month.',
    });

    const latest = budgetsRepo.getLatestApprovalDecision('company-1', 'budget-exception', itemId);
    const resolved = budgetsRepo.getApprovalItemById(itemId);

    expect(resolved?.status).toBe('approved');
    expect(latest).toEqual(
      expect.objectContaining({
        approvalRefId: itemId,
        decision: 'approved',
        rationale: 'Approved for the current month.',
      }),
    );
  });
});
