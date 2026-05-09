import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createAuthorityRepo, createExtensionsRepo } from '../db/repos/extensions.js';
import { createPendingDelegationsRepo } from '../db/repos/pending-delegations.js';
import { companies, employees } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createApprovalInboxService } from './approval-inbox-service.js';

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

describe('approval inbox service', () => {
  it('lists budget and authority approval work in one queue', () => {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const authorityRepo = createAuthorityRepo(ctx.db);
    const service = createApprovalInboxService({
      budgetsRepo,
      authorityRepo,
    });

    budgetsRepo.createApprovalItem({
      companyId: 'company-1',
      kind: 'budget-exception',
      priority: 'high',
      requestedByEmployeeId: 'employee-1',
      subjectRefKind: 'budget-policy',
      subjectRefId: 'policy-1',
      summary: 'Budget approval required for company scope company-1.',
      payloadJson: JSON.stringify({
        budgetPolicyId: 'policy-1',
        scopeKind: 'company',
        scopeRefId: 'company-1',
      }),
    });

    const extensionId = extensionsRepo.create({
      companyId: 'company-1',
      kind: 'skill',
      name: 'Workspace Skill',
      slug: 'workspace-skill',
      sourceKind: 'local',
      sourceRef: 'C:/Skills/workspace-skill',
      trustState: 'pending-review',
    });
    authorityRepo.createRequest({
      extensionId,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      requestedPermission: 'allow',
      reason: 'Needs repo access',
    });

    const items = service.listItems({ companyId: 'company-1' });

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['budget-exception', 'authority-request']),
    );
    expect(items.find((item) => item.kind === 'budget-exception')?.summary).toMatch(
      /Budget approval required/i,
    );
    expect(items.find((item) => item.kind === 'authority-request')?.payload).toEqual(
      expect.objectContaining({
        extensionId,
        resourceKind: 'path',
      }),
    );
  });

  it('approves authority requests and records the decision trail', async () => {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const extensionsRepo = createExtensionsRepo(ctx.db);
    const authorityRepo = createAuthorityRepo(ctx.db);
    const service = createApprovalInboxService({
      budgetsRepo,
      authorityRepo,
    });

    const extensionId = extensionsRepo.create({
      companyId: 'company-1',
      kind: 'skill',
      name: 'Workspace Skill',
      slug: 'workspace-skill',
      sourceKind: 'local',
      sourceRef: 'C:/Skills/workspace-skill',
      trustState: 'pending-review',
    });
    const requestId = authorityRepo.createRequest({
      extensionId,
      resourceKind: 'path',
      resourceId: 'C:/Projects/Alpha',
      requestedPermission: 'allow',
      reason: 'Needs repo access',
    });

    const result = await service.reviewItem({
      companyId: 'company-1',
      itemId: requestId,
      kind: 'authority-request',
      decision: 'approved',
      rationale: 'Approved for this workspace.',
      operatorId: 'operator-7',
    });

    expect(result.grantId).toBeTruthy();
    expect(authorityRepo.getRequestById(requestId)?.status).toBe('approved');
    expect(result.item.latestDecision?.decision).toBe('approved');
    expect(result.item.latestDecision?.rationale).toBe('Approved for this workspace.');
    expect(result.item.latestDecision?.decidedByOperatorId).toBe('operator-7');
  });
});

// ---------------------------------------------------------------------------
// C4 (audit 2026-05-07) — delegation-request kind tests.
// ---------------------------------------------------------------------------

describe('approval inbox service — delegation-request (C4)', () => {
  function setupDelegationDeps() {
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const authorityRepo = createAuthorityRepo(ctx.db);

    // Create a fully-prepared pending delegation row inline so the test
    // covers the inbox materialization end-to-end without dragging
    // delegate_subtask in. Uses the actual repo so we exercise the real
    // schema + storage path.
    const pendingRepo = createPendingDelegationsRepoLocal();

    const ticketCreates: Array<{ companyId: string; assigneeId: string; title: string }> = [];
    const ticketAssigns: Array<{ ticketId: string; assigneeId: string }> = [];
    const ticketsRepoStub = {
      create(input: { companyId: string; title: string; assigneeId?: string | null }) {
        const id = `tkt-${ticketCreates.length + 1}`;
        ticketCreates.push({
          companyId: input.companyId,
          assigneeId: input.assigneeId ?? '',
          title: input.title,
        });
        return id;
      },
      assign(ticketId: string, assigneeId: string) {
        ticketAssigns.push({ ticketId, assigneeId });
      },
    } as unknown as Parameters<typeof createApprovalInboxService>[0]['ticketsRepo'];

    const projectLinks: Array<{ projectId: string; ticketId: string }> = [];
    const projectsRepoStub = {
      linkTicket(projectId: string, ticketId: string) {
        projectLinks.push({ projectId, ticketId });
      },
    } as unknown as Parameters<typeof createApprovalInboxService>[0]['projectsRepo'];

    const queueCalls: Array<{ ticketId: string; employeeId: string; companyId: string }> = [];
    const orchestratorStub = {
      async queueDelegatedTicket(input: {
        ticketId: string;
        employeeId: string;
        companyId: string;
      }) {
        queueCalls.push({
          ticketId: input.ticketId,
          employeeId: input.employeeId,
          companyId: input.companyId,
        });
        return { threadId: `thread-${input.ticketId}`, triggerMessageId: 'msg-1' };
      },
    };

    const busCalls: Array<{ type: string; payload: unknown }> = [];
    const busStub = {
      emit(input: { type: string; payload: unknown }) {
        busCalls.push({ type: input.type, payload: input.payload });
      },
    };

    const service = createApprovalInboxService({
      budgetsRepo,
      authorityRepo,
      pendingDelegationsRepo: pendingRepo,
      ticketsRepo: ticketsRepoStub,
      projectsRepo: projectsRepoStub,
      orchestrator: orchestratorStub,
      bus: busStub,
    });

    return {
      service,
      pendingRepo,
      ticketCreates,
      ticketAssigns,
      projectLinks,
      queueCalls,
      busCalls,
    };
  }

  function createPendingDelegationsRepoLocal() {
    return createPendingDelegationsRepo(ctx.db);
  }

  function makePending(repo: ReturnType<typeof createPendingDelegationsRepoLocal>) {
    return repo.create({
      companyId: 'company-1',
      planId: 'plan-1',
      subtaskTitle: 'Build login',
      description: 'Login screen + session',
      priority: 'high',
      assigneeId: 'employee-1',
      assigneeName: 'Iris',
      parentProjectId: null,
      score: 0.82,
      roleFit: 0.9,
      loadRatio: 0.2,
      availability: 1,
      pastPerformance: 0.55,
      reporterId: 'employee-1',
      reporterKind: 'agent',
    });
  }

  it('lists pending delegations alongside budget + authority items', () => {
    const { service, pendingRepo } = setupDelegationDeps();
    makePending(pendingRepo);
    const items = service.listItems({ companyId: 'company-1' });
    expect(items.map((i) => i.kind)).toContain('delegation-request');
    const delegation = items.find((i) => i.kind === 'delegation-request');
    expect(delegation?.summary).toMatch(/Build login/);
    expect(delegation?.payload).toEqual(
      expect.objectContaining({
        planId: 'plan-1',
        assigneeId: 'employee-1',
        scoreBreakdown: expect.objectContaining({
          roleFit: 0.9,
          load: 0.2,
          availability: 1,
        }),
      }),
    );
  });

  it('filters delegation-request by status when status is supplied', async () => {
    const { service, pendingRepo } = setupDelegationDeps();
    const id = makePending(pendingRepo);
    expect(
      service.listItems({ companyId: 'company-1', kind: 'delegation-request', status: 'pending' }),
    ).toHaveLength(1);
    pendingRepo.markRejected(id, { operatorId: 'op-1', rationale: 'no' });
    expect(
      service.listItems({ companyId: 'company-1', kind: 'delegation-request', status: 'pending' }),
    ).toHaveLength(0);
    expect(
      service.listItems({ companyId: 'company-1', kind: 'delegation-request', status: 'denied' }),
    ).toHaveLength(1);
  });

  it('materializes a ticket on approve, calls orchestrator, and emits task.delegated', async () => {
    const { service, pendingRepo, ticketCreates, ticketAssigns, queueCalls, busCalls } =
      setupDelegationDeps();
    const id = makePending(pendingRepo);

    const result = await service.reviewItem({
      companyId: 'company-1',
      itemId: id,
      kind: 'delegation-request',
      decision: 'approved',
      operatorId: 'operator-9',
    });

    expect(result.ticketId).toBe('tkt-1');
    expect(ticketCreates).toHaveLength(1);
    expect(ticketCreates[0]?.title).toBe('Build login');
    expect(ticketAssigns).toEqual([{ ticketId: 'tkt-1', assigneeId: 'employee-1' }]);
    expect(queueCalls).toEqual([
      { ticketId: 'tkt-1', employeeId: 'employee-1', companyId: 'company-1' },
    ]);
    expect(busCalls.map((c) => c.type)).toEqual([
      'ticket.created',
      'ticket.assigned',
      'task.delegated',
    ]);
    const delegated = busCalls.find((c) => c.type === 'task.delegated');
    expect(delegated?.payload).toEqual(
      expect.objectContaining({
        ticketId: 'tkt-1',
        pendingDelegationId: id,
        assigneeId: 'employee-1',
        scoreBreakdown: expect.objectContaining({
          roleFit: 0.9,
          load: 0.2,
          availability: 1,
          pastPerformance: 0.55,
        }),
        assigneeScore: 0.82,
      }),
    );
    // Pending row marked approved with the materialized ticket id.
    expect(pendingRepo.getById(id)?.status).toBe('approved');
    expect(pendingRepo.getById(id)?.ticketId).toBe('tkt-1');
  });

  it('emits task.delegation_rejected on deny without creating a ticket', async () => {
    const { service, pendingRepo, ticketCreates, busCalls } = setupDelegationDeps();
    const id = makePending(pendingRepo);

    const result = await service.reviewItem({
      companyId: 'company-1',
      itemId: id,
      kind: 'delegation-request',
      decision: 'denied',
      rationale: 'wrong assignee',
      operatorId: 'operator-9',
    });

    expect(result.ticketId).toBeNull();
    expect(ticketCreates).toHaveLength(0);
    expect(busCalls.map((c) => c.type)).toEqual(['task.delegation_rejected']);
    const rejected = busCalls[0];
    expect(rejected?.payload).toEqual(
      expect.objectContaining({
        pendingDelegationId: id,
        assigneeId: 'employee-1',
        rejectedByOperatorId: 'operator-9',
        rationale: 'wrong assignee',
      }),
    );
    expect(pendingRepo.getById(id)?.status).toBe('rejected');
  });

  it('refuses to dismiss a delegation-request', async () => {
    const { service, pendingRepo } = setupDelegationDeps();
    const id = makePending(pendingRepo);
    await expect(
      service.reviewItem({
        companyId: 'company-1',
        itemId: id,
        kind: 'delegation-request',
        decision: 'dismissed',
        operatorId: 'operator-9',
      }),
    ).rejects.toThrowError(/cannot be dismissed/);
  });

  it('refuses to review a missing or already-resolved row', async () => {
    const { service, pendingRepo } = setupDelegationDeps();
    await expect(
      service.reviewItem({
        companyId: 'company-1',
        itemId: 'nope',
        kind: 'delegation-request',
        decision: 'approved',
        operatorId: 'op',
      }),
    ).rejects.toThrowError(/not found/);

    const id = makePending(pendingRepo);
    pendingRepo.markRejected(id, { operatorId: 'op', rationale: 'no' });
    await expect(
      service.reviewItem({
        companyId: 'company-1',
        itemId: id,
        kind: 'delegation-request',
        decision: 'approved',
        operatorId: 'op',
      }),
    ).rejects.toThrowError(/already rejected/);
  });
});
