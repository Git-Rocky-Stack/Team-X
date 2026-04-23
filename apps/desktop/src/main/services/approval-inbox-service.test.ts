import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createAuthorityRepo, createExtensionsRepo } from '../db/repos/extensions.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { companies, employees } from '../db/schema.js';
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
    expect(items.find((item) => item.kind === 'budget-exception')?.summary).toMatch(/Budget approval required/i);
    expect(items.find((item) => item.kind === 'authority-request')?.payload).toEqual(
      expect.objectContaining({
        extensionId,
        resourceKind: 'path',
      }),
    );
  });

  it('approves authority requests and records the decision trail', () => {
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

    const result = service.reviewItem({
      companyId: 'company-1',
      itemId: requestId,
      kind: 'authority-request',
      decision: 'approved',
      rationale: 'Approved for this workspace.',
    });

    expect(result.grantId).toBeTruthy();
    expect(authorityRepo.getRequestById(requestId)?.status).toBe('approved');
    expect(result.item.latestDecision?.decision).toBe('approved');
    expect(result.item.latestDecision?.rationale).toBe('Approved for this workspace.');
  });
});
