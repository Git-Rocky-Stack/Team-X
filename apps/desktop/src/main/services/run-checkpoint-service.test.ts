import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRunCheckpointsRepo } from '../db/repos/run-checkpoints.js';
import { companies, threads } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createRunCheckpointService } from './run-checkpoint-service.js';

let ctx: TestDbHandle;
let runCheckpointsRepo: ReturnType<typeof createRunCheckpointsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  runCheckpointsRepo = createRunCheckpointsRepo(ctx.db);

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
});

afterEach(() => {
  ctx.close();
});

describe('run checkpoint service', () => {
  it('flags only non-manual kinds as automatic boundaries', () => {
    const service = createRunCheckpointService({ runCheckpointsRepo });

    expect(service.isAutomaticCheckpointKind('manual')).toBe(false);
    expect(service.isAutomaticCheckpointKind('timeout')).toBe(true);
    expect(service.isAutomaticCheckpointKind('budget-blocked')).toBe(true);
  });

  it('creates checkpoints and round-trips blockers and refs', () => {
    const service = createRunCheckpointService({ runCheckpointsRepo });

    const checkpoint = service.createCheckpoint({
      companyId: 'company-1',
      threadId: 'thread-1',
      checkpointKind: 'approval-blocked',
      objective: 'Ship the user guide',
      progressSummary: 'The draft is ready and waiting on operator approval.',
      blockers: [{ kind: 'approval', refId: 'approval-1', summary: 'Pending publish approval' }],
      nextAction: 'Resume after approval',
      activeArtifactRefs: ['artifact-1'],
      unresolvedApprovalRefs: ['approval-1'],
      resumeOrigin: {
        checkpointId: 'checkpoint-0',
        checkpointKind: 'timeout',
        createdAt: 24,
      },
      createdAt: 25,
    });

    expect(checkpoint).toEqual(
      expect.objectContaining({
        checkpointKind: 'approval-blocked',
        objective: 'Ship the user guide',
        nextAction: 'Resume after approval',
        blockers: [{ kind: 'approval', refId: 'approval-1', summary: 'Pending publish approval' }],
        activeArtifactRefs: ['artifact-1'],
        unresolvedApprovalRefs: ['approval-1'],
        resumeOrigin: {
          checkpointId: 'checkpoint-0',
          checkpointKind: 'timeout',
          createdAt: 24,
        },
      }),
    );
  });

  it('rejects empty progress summaries', () => {
    const service = createRunCheckpointService({ runCheckpointsRepo });

    expect(() =>
      service.createCheckpoint({
        companyId: 'company-1',
        threadId: 'thread-1',
        checkpointKind: 'manual',
        progressSummary: '   ',
      }),
    ).toThrow(/progressSummary is required/);
  });
});
