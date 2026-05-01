import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createArtifactsRepo } from '../db/repos/artifacts.js';
import { createBudgetsRepo } from '../db/repos/budgets.js';
import { createRoutinesRepo } from '../db/repos/routines.js';
import { createVaultRepo } from '../db/repos/vault.js';
import { companies, employees, operators, tickets } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createArtifactService } from './artifact-service.js';

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
  ctx.db
    .insert(operators)
    .values({
      id: 'rocky',
      displayName: 'Rocky',
      email: null,
      authMode: 'local',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
});

afterEach(() => ctx.close());

describe('artifact service', () => {
  it('records routine, approval, and vault artifacts with provenance', () => {
    const artifactsRepo = createArtifactsRepo(ctx.db);
    const routinesRepo = createRoutinesRepo(ctx.db);
    const budgetsRepo = createBudgetsRepo(ctx.db);
    const vaultRepo = createVaultRepo(ctx.db);
    const service = createArtifactService({ artifactsRepo });

    const routineId = routinesRepo.create({
      companyId: 'company-1',
      name: 'Daily Standup',
      slug: 'daily-standup',
      triggerKind: 'daily',
      scheduleJson: JSON.stringify({ triggerKind: 'daily', timeOfDay: '09:00' }),
      workConfigJson: JSON.stringify({
        title: 'Standup follow-up',
        description: '',
        assigneeId: 'employee-1',
        priority: 'medium',
        labels: [],
      }),
    });
    const approvalItemId = budgetsRepo.createApprovalItem({
      companyId: 'company-1',
      kind: 'budget-exception',
      priority: 'high',
      requestedByEmployeeId: 'employee-1',
      subjectRefKind: 'budget-policy',
      subjectRefId: 'policy-1',
      summary: 'Budget approval required for policy-1.',
    });
    const approvalDecisionId = budgetsRepo.createApprovalDecision({
      companyId: 'company-1',
      approvalKind: 'budget-exception',
      approvalRefId: approvalItemId,
      decision: 'approved',
      decidedByOperatorId: 'rocky',
      rationale: 'Approved.',
    });
    ctx.db
      .insert(tickets)
      .values({
        id: 'ticket-1',
        companyId: 'company-1',
        title: 'Standup follow-up',
        description: '',
        status: 'open',
        priority: 'medium',
        assigneeId: 'employee-1',
        reporterId: 'rocky',
        reporterKind: 'user',
        labelsJson: '[]',
        dependenciesJson: '[]',
        slaHours: null,
        dueAt: null,
        threadId: null,
        createdAt: 5,
        updatedAt: 5,
        closedAt: null,
      })
      .run();
    const fileId = vaultRepo.create({
      companyId: 'company-1',
      filename: 'brief.md',
      originalName: 'brief.md',
      mimeType: 'text/markdown',
      sizeBytes: 128,
      sha256: 'abc123',
      vaultPath: 'ab/brief.md',
      uploadedBy: 'rocky',
    });

    service.recordRoutineTicketArtifact({
      companyId: 'company-1',
      routineId,
      runId: 'run-1',
      ticketId: 'ticket-1',
      title: 'Standup follow-up',
      summary: 'Created ticket ticket-1',
      assigneeId: 'employee-1',
      createdAt: 10,
    });
    service.recordApprovalOutcomeArtifact({
      companyId: 'company-1',
      approvalItemId,
      approvalDecisionId,
      decision: 'approved',
      subjectRefKind: 'budget-policy',
      subjectRefId: 'policy-1',
      summary: 'Budget exception approved',
      rationale: 'Approved.',
      approvedByOperatorId: 'rocky',
      createdAt: 20,
    });
    service.recordVaultFileArtifact({
      companyId: 'company-1',
      fileId,
      originalName: 'brief.md',
      mimeType: 'text/markdown',
      sizeBytes: 128,
      sha256: 'abc123',
      uploadedBy: 'rocky',
      createdAt: 30,
    });

    const rows = service.list({ companyId: 'company-1' });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.sourceKind)).toEqual([
      'vault-file',
      'approval-decision',
      'routine-run',
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        kind: 'vault-file',
        fileId,
        uri: `vault:${fileId}`,
      }),
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({
        kind: 'approval-record',
        approvalItemId,
        approvalDecisionId,
        outcomeKind: 'approval-complete',
      }),
    );
    expect(rows[2]).toEqual(
      expect.objectContaining({
        kind: 'ticket-output',
        ticketId: 'ticket-1',
        createdByRoutineId: routineId,
      }),
    );
  });

  it('records runtime output artifacts as first-class execution deliverables', () => {
    const artifactsRepo = createArtifactsRepo(ctx.db);
    const service = createArtifactService({ artifactsRepo });

    const artifact = service.recordRuntimeOutputArtifact({
      companyId: 'company-1',
      runtimeSessionId: 'session-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      runId: 'run-1',
      ticketId: null,
      employeeId: 'employee-1',
      title: 'Runtime output for codex',
      outputText: 'Implemented runtime audit normalization.',
      usage: { promptTokens: 11, completionTokens: 5 },
      createdAt: 40,
    });

    expect(artifact).toEqual(
      expect.objectContaining({
        kind: 'runtime-output',
        sourceKind: 'runtime-execution',
        sourceRefId: 'run-1',
        uri: 'runtime:session-1',
        createdByEmployeeId: 'employee-1',
        summary: 'Implemented runtime audit normalization.',
      }),
    );
    expect(artifact.preview).toEqual(
      expect.objectContaining({
        runtimeSessionId: 'session-1',
        runtimeProfileId: 'profile-1',
        adapterKind: 'codex',
        runId: 'run-1',
        usage: { promptTokens: 11, completionTokens: 5 },
      }),
    );
  });

  it('deduplicates artifacts by company, kind, and source', () => {
    const artifactsRepo = createArtifactsRepo(ctx.db);
    const vaultRepo = createVaultRepo(ctx.db);
    const service = createArtifactService({ artifactsRepo });
    const fileId = vaultRepo.create({
      companyId: 'company-1',
      filename: 'brief.md',
      originalName: 'brief.md',
      mimeType: 'text/markdown',
      sizeBytes: 128,
      sha256: 'abc123',
      vaultPath: 'ab/brief.md',
      uploadedBy: 'rocky',
    });

    service.recordVaultFileArtifact({
      companyId: 'company-1',
      fileId,
      originalName: 'brief.md',
      mimeType: 'text/markdown',
      sizeBytes: 128,
      sha256: 'abc123',
      uploadedBy: 'rocky',
      createdAt: 10,
    });
    service.recordVaultFileArtifact({
      companyId: 'company-1',
      fileId,
      originalName: 'brief.md',
      mimeType: 'text/markdown',
      sizeBytes: 128,
      sha256: 'abc123',
      uploadedBy: 'rocky',
      createdAt: 20,
    });

    const rows = service.list({ companyId: 'company-1' });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceRefId).toBe(fileId);
  });
});
