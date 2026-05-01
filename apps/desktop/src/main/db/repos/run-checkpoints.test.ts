import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees, runCheckpoints, runs, threads } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createRunCheckpointsRepo } from './run-checkpoints.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createRunCheckpointsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createRunCheckpointsRepo(ctx.db);

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
    .insert(threads)
    .values({
      id: 'thread-1',
      companyId: 'company-1',
      kind: 'dm',
      subject: 'Thread One',
      createdBy: 'rocky',
      createdAt: 2,
      lastMessageAt: 2,
      ticketId: null,
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
      createdAt: 3,
    })
    .run();

  ctx.db
    .insert(runs)
    .values({
      id: 'run-1',
      employeeId: 'employee-1',
      threadId: 'thread-1',
      provider: 'anthropic',
      model: 'claude',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1200,
      costUsd: '0.01',
      toolCallsCount: 0,
      startedAt: 4,
      endedAt: 5,
      status: 'success',
      error: null,
      kind: 'work',
    })
    .run();
});

afterEach(() => {
  ctx.close();
});

describe('run checkpoints repo', () => {
  it('creates checkpoints and returns the latest row for a thread', () => {
    repo.create({
      companyId: 'company-1',
      threadId: 'thread-1',
      runId: 'run-1',
      employeeId: 'employee-1',
      checkpointKind: 'completion',
      progressSummary: 'Completed the requested work.',
      resumeOriginJson: '{"checkpointId":"checkpoint-0","checkpointKind":"stopped","createdAt":9}',
      createdAt: 10,
    });
    repo.create({
      companyId: 'company-1',
      threadId: 'thread-1',
      runId: 'run-1',
      employeeId: 'employee-1',
      checkpointKind: 'approval-blocked',
      progressSummary: 'Waiting for operator approval.',
      createdAt: 20,
    });

    expect(repo.getLatestByCompanyThread('company-1', 'thread-1')).toEqual(
      expect.objectContaining({
        checkpointKind: 'approval-blocked',
        progressSummary: 'Waiting for operator approval.',
      }),
    );

    const scopedCheckpoints = repo.listByCompanyThread('company-1', 'thread-1', 10);
    const priorCheckpoint = scopedCheckpoints[1];
    expect(priorCheckpoint).toBeDefined();
    expect(repo.getById(priorCheckpoint?.id)).toEqual(
      expect.objectContaining({
        resumeOriginJson:
          '{"checkpointId":"checkpoint-0","checkpointKind":"stopped","createdAt":9}',
      }),
    );
  });

  it('lists checkpoints newest-first and scoped to the requested thread', () => {
    repo.create({
      companyId: 'company-1',
      threadId: 'thread-1',
      checkpointKind: 'manual',
      progressSummary: 'Manual checkpoint',
      createdAt: 12,
    });
    repo.create({
      companyId: 'company-1',
      threadId: 'thread-1',
      checkpointKind: 'timeout',
      progressSummary: 'Provider timed out',
      createdAt: 18,
    });

    const list = repo.listByCompanyThread('company-1', 'thread-1', 10);

    expect(list.map((row) => row.checkpointKind)).toEqual(['timeout', 'manual']);
    expect(ctx.db.select().from(runCheckpoints).all()).toHaveLength(2);
  });
});
