import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { companies, employees } from '../db/schema.js';
import { createBudgetGovernanceService } from './budget-governance-service.js';

let ctx: TestDbHandle;

beforeEach(async () => {
  ctx = await makeTestDb();
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

describe('budget governance service', () => {
  it('records real run spend, attributes routine scope, and raises thresholds', async () => {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const runsRepo = createRunsRepo(ctx.db);
    const ticketsRepo = createTicketsRepo(ctx.db);
    const routinesRepo = createRoutinesRepo(ctx.db);
    const threadsRepo = createThreadsRepo(ctx.db);
    const pauseCompany = vi.fn(async () => {});
    const emit = vi.fn();
    const service = createBudgetGovernanceService({
      budgetsRepo,
      employeesRepo: createEmployeesRepo(ctx.db),
      runsRepo,
      ticketsRepo,
      routinesRepo,
      runtimeProfilesService: {
        getProfileForEmployee: () => null,
      },
      orchestrator: { pauseCompany },
      bus: { emit },
      now: () => new Date('2026-04-23T12:00:00.000Z').getTime(),
    });

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '5',
      warningThresholdPct: 50,
      requireApprovalAboveUsd: '2',
    });

    const routineId = routinesRepo.create({
      companyId: 'company-1',
      name: 'Morning Sweep',
      slug: 'morning-sweep',
      enabled: true,
      triggerKind: 'interval',
      scheduleJson: JSON.stringify({ triggerKind: 'interval', intervalMinutes: 60 }),
      workConfigJson: JSON.stringify({
        title: 'Sweep queue',
        description: '',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: ['ops'],
      }),
      nextRunAt: 100,
    });
    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'routine',
      scopeRefId: routineId,
      hardCapUsd: '2',
      warningThresholdPct: 50,
      autoPause: true,
    });

    const ticketId = ticketsRepo.create({
      companyId: 'company-1',
      title: 'Sweep queue',
      description: '',
      priority: 'medium',
      assigneeId: 'employee-1',
      reporterId: 'rocky',
      reporterKind: 'user',
      labelsJson: '[]',
    });
    const threadId = threadsRepo.create({
      companyId: 'company-1',
      kind: 'ticket',
      subject: 'Sweep queue',
      createdBy: 'rocky',
    });
    ticketsRepo.setThreadId(ticketId, threadId);
    routinesRepo.createRun({
      companyId: 'company-1',
      routineId,
      status: 'success',
      reason: 'scheduled',
      startedAt: 100,
      finishedAt: 120,
      ticketId,
      message: 'Created ticket',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'ollama',
      model: 'gemma',
      threadId,
      kind: 'work',
    });
    runsRepo.finish(runId, {
      status: 'success',
      promptTokens: 10,
      completionTokens: 12,
      latencyMs: 200,
      costUsd: '2.500000',
    });

    await service.recordRunSpend(runId);

    const ledger = service.listLedgerEntries({ companyId: 'company-1', limit: 10 });
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeKind: 'company', scopeRefId: 'company-1', amountUsd: '2.500000' }),
        expect.objectContaining({ scopeKind: 'routine', scopeRefId: routineId, amountUsd: '2.500000' }),
      ]),
    );

    const overview = service.getOverview('company-1');
    const routineSummary = overview.policySummaries.find((policy) => policy.scopeKind === 'routine');
    expect(overview.companySpendUsd).toBe('2.5');
    expect(overview.pendingApprovalCount).toBe(1);
    expect(routineSummary?.alertLevel).toBe('exceeded');
    expect(pauseCompany).toHaveBeenCalledWith('company-1');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget.approvalRequested' }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget.companyPaused' }));
  });

  it('blocks new autonomous execution once a policy is already past approval threshold', async () => {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const runsRepo = createRunsRepo(ctx.db);
    const service = createBudgetGovernanceService({
      budgetsRepo,
      employeesRepo: createEmployeesRepo(ctx.db),
      runsRepo,
      ticketsRepo: createTicketsRepo(ctx.db),
      routinesRepo: createRoutinesRepo(ctx.db),
      runtimeProfilesService: {
        getProfileForEmployee: () => null,
      },
      now: () => new Date('2026-04-23T12:00:00.000Z').getTime(),
    });

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
      warningThresholdPct: 50,
      requireApprovalAboveUsd: '1',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'openai',
      model: 'gpt-5.4',
      kind: 'agentic',
    });
    runsRepo.finish(runId, {
      status: 'success',
      promptTokens: 10,
      completionTokens: 12,
      latencyMs: 200,
      costUsd: '1.500000',
    });
    await service.recordRunSpend(runId);

    const admission = await service.assertExecutionAllowed({
      companyId: 'company-1',
      employeeId: 'employee-1',
      executionKind: 'agentic',
    });

    expect(admission.allowed).toBe(false);
    expect(admission.approvalItem?.status).toBe('pending');
    expect(admission.reason).toMatch(/Budget approval required/i);
  });
});
