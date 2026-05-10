import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createEmployeesRepo } from '../db/repos/employees.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { createRunsRepo } from '../db/repos/runs.js';
import { createThreadsRepo } from '../db/repos/threads.js';
import { createTicketsRepo } from '../db/repos/tickets.js';
import { companies, employees } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createApprovalInboxService } from './approval-inbox-service.js';
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
        expect.objectContaining({
          scopeKind: 'company',
          scopeRefId: 'company-1',
          amountUsd: '2.500000',
        }),
        expect.objectContaining({
          scopeKind: 'routine',
          scopeRefId: routineId,
          amountUsd: '2.500000',
        }),
      ]),
    );

    const overview = service.getOverview('company-1');
    const routineSummary = overview.policySummaries.find(
      (policy) => policy.scopeKind === 'routine',
    );
    expect(overview.companySpendUsd).toBe('2.5');
    expect(overview.pendingApprovalCount).toBe(1);
    expect(routineSummary?.alertLevel).toBe('exceeded');
    expect(pauseCompany).toHaveBeenCalledWith('company-1');
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'budget.approvalRequested' }),
    );
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

  it('allows future execution after the current period budget exception is approved', async () => {
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

    const pending = service.listApprovalItems({ companyId: 'company-1', status: 'pending' });
    const pendingItem = pending[0];
    expect(pendingItem).toBeDefined();
    const approvalService = createApprovalInboxService({
      budgetsRepo,
      authorityRepo: {
        getRequestById: () => null,
        listRequestsByCompany: () => [],
        reviewRequest: () => {},
        createGrant: () => '',
      } as never,
    });
    await approvalService.reviewItem({
      companyId: 'company-1',
      itemId: pendingItem?.id ?? '',
      kind: 'budget-exception',
      decision: 'approved',
      rationale: 'Keep running this month.',
      operatorId: 'operator-1',
    });

    const admission = await service.assertExecutionAllowed({
      companyId: 'company-1',
      employeeId: 'employee-1',
      executionKind: 'agentic',
    });

    expect(admission.allowed).toBe(true);
    expect(admission.approvalItem?.status).toBe('approved');
    expect(admission.approvalItem?.latestDecision?.rationale).toBe('Keep running this month.');
  });
});

// ---------------------------------------------------------------------------
// H8 — cost-ledger write on cancel/stop/timeout (audit 2026-05-07)
//
// Audit complaint: "Cancelled runs skip cost ledger. Budget reconciliation
// has a blind spot on stop/timeout branches." — `budget-governance-service.ts:625`.
//
// Pre-fix behavior: `recordRunSpend` early-exited when `run.status === 'cancelled'`
// AND the agentic-loop-service.ts:544 call site short-circuited with a
// `runStatus !== 'cancelled'` filter. Cancelled runs that had accumulated real
// cost via `state.costUsd += step.telemetry.costUsd` were written to
// `runs.costUsd` but never landed in `budget_ledger`, so
// `SUM(runs.costUsd) ≠ SUM(budget_ledger.amountUsd)` for any company that
// hit the stop button mid-loop.
//
// Post-fix: `recordRunSpend` skips only `running` (mid-flight, not yet
// finalized). The existing `amountUsd <= 0` guard handles legitimate
// zero-cost cancels without spurious ledger entries. The agentic-loop-service
// call-site filter is also removed so the function — not the caller — owns
// the "is this run recordable?" decision.
// ---------------------------------------------------------------------------

describe('budget governance service — H8 audit (2026-05-07): cancelled & error runs land in ledger', () => {
  function buildService() {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const runsRepo = createRunsRepo(ctx.db);
    const pauseCompany = vi.fn(async () => {});
    const emit = vi.fn();
    const service = createBudgetGovernanceService({
      budgetsRepo,
      employeesRepo: createEmployeesRepo(ctx.db),
      runsRepo,
      ticketsRepo: createTicketsRepo(ctx.db),
      routinesRepo: createRoutinesRepo(ctx.db),
      runtimeProfilesService: {
        getProfileForEmployee: () => null,
      },
      orchestrator: { pauseCompany },
      bus: { emit },
      now: () => new Date('2026-04-23T12:00:00.000Z').getTime(),
    });
    return { service, runsRepo, pauseCompany, emit };
  }

  it('records a cancelled run with non-zero cost into the ledger (audit-quoted regression)', async () => {
    // The audit's literal scenario: an agentic run accumulates real token
    // cost across multiple iterations, the user fires stop mid-loop, the
    // runs row is finalized with status='cancelled' and costUsd='1.500000'.
    // Pre-H8 the ledger silently skipped this entry; post-H8 it lands.
    const { service, runsRepo } = buildService();

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      kind: 'agentic',
    });
    runsRepo.finish(runId, {
      status: 'cancelled',
      promptTokens: 800,
      completionTokens: 400,
      latencyMs: 4_200,
      costUsd: '1.500000',
      error: 'Run canceled by user',
    });

    await service.recordRunSpend(runId);

    const ledger = service.listLedgerEntries({ companyId: 'company-1', limit: 10 });
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeKind: 'company',
          scopeRefId: 'company-1',
          runId,
          amountUsd: '1.500000',
        }),
        expect.objectContaining({
          scopeKind: 'employee',
          scopeRefId: 'employee-1',
          runId,
          amountUsd: '1.500000',
        }),
      ]),
    );

    const overview = service.getOverview('company-1');
    expect(overview.companySpendUsd).toBe('1.5');
  });

  it('does not write a ledger entry for a cancelled run with zero cost (amountUsd guard)', async () => {
    // Stop fired before any tokens streamed (e.g., user cancelled during
    // admission control). costUsd === 0; the existing `amountUsd <= 0`
    // short-circuit prevents a spurious ledger entry. Without this guard the
    // H8 fix would flood the ledger with no-op rows for every aborted attempt.
    const { service, runsRepo } = buildService();

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'ollama',
      model: 'gemma',
      kind: 'agentic',
    });
    runsRepo.finish(runId, {
      status: 'cancelled',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 50,
      costUsd: '0',
      error: 'Run canceled by user',
    });

    await service.recordRunSpend(runId);

    const ledger = service.listLedgerEntries({ companyId: 'company-1', limit: 10 });
    expect(ledger).toEqual([]);
    expect(service.getOverview('company-1').companySpendUsd).toBe('0');
  });

  it('records an error run with non-zero cost into the ledger (timeout/transient-exhausted regression pin)', async () => {
    // The audit's "stop/timeout branches" — a run that accumulated cost,
    // then errored (provider timeout, idle-timeout, transient exhaustion,
    // generic error). The recordRunSpend function never blocked `error`;
    // this test pins that behavior so any future regression to the status
    // filter trips here.
    const { service, runsRepo } = buildService();

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'openai',
      model: 'gpt-5.4',
      kind: 'agentic',
    });
    runsRepo.finish(runId, {
      status: 'error',
      promptTokens: 600,
      completionTokens: 200,
      latencyMs: 30_000,
      costUsd: '0.750000',
      error: 'provider stream timed out',
    });

    await service.recordRunSpend(runId);

    const ledger = service.listLedgerEntries({ companyId: 'company-1', limit: 10 });
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeKind: 'company',
          runId,
          amountUsd: '0.750000',
        }),
      ]),
    );
  });

  it('still skips in-flight (running) runs', async () => {
    // The runs.costUsd field is not yet final until the orchestrator writes
    // the terminal status. Recording mid-flight would risk double-counting
    // when the run later finalizes via `runsRepo.finish()` and `recordRunSpend`
    // fires again from the orchestrator. Mid-flight skip preserved post-H8.
    const { service, runsRepo } = buildService();

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '10',
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      kind: 'agentic',
    });
    // Note: no finish() — status remains 'running'.

    await service.recordRunSpend(runId);

    const ledger = service.listLedgerEntries({ companyId: 'company-1', limit: 10 });
    expect(ledger).toEqual([]);
  });

  it('cancelled-run cost still raises threshold alerts and approval gates', async () => {
    // A cancelled run that lands in the ledger participates in the same
    // `evaluatePolicyThresholds` loop as a successful one — warning, approval,
    // hard-cap, and autoPause fire on the recorded amount. This test pins
    // the post-record reconciliation flow so the audit's "blind spot" is
    // closed end-to-end (runs row → ledger → thresholds → alerts).
    const { service, runsRepo, pauseCompany, emit } = buildService();

    service.createPolicy({
      companyId: 'company-1',
      scopeKind: 'company',
      scopeRefId: 'company-1',
      hardCapUsd: '5',
      warningThresholdPct: 50,
      requireApprovalAboveUsd: '2',
      autoPause: true,
    });

    const runId = runsRepo.start({
      employeeId: 'employee-1',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      kind: 'agentic',
    });
    runsRepo.finish(runId, {
      status: 'cancelled',
      promptTokens: 5_000,
      completionTokens: 1_200,
      latencyMs: 12_000,
      costUsd: '5.500000',
      error: 'Run canceled by user',
    });

    await service.recordRunSpend(runId);

    expect(pauseCompany).toHaveBeenCalledWith('company-1');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget.warning' }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget.exceeded' }));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'budget.approvalRequested' }),
    );
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget.companyPaused' }));
  });
});
