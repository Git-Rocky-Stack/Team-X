import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { companies, employees, runtimeProfiles } from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';
import { createRuntimeSessionsRepo } from './runtime-sessions.js';

let ctx: TestDbHandle;
let repo: ReturnType<typeof createRuntimeSessionsRepo>;

beforeEach(async () => {
  ctx = await makeTestDb();
  repo = createRuntimeSessionsRepo(ctx.db);
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
      roleId: 'cto',
      roleMdSha: 'sha',
      level: 'officer',
      name: 'Iris',
      title: 'CTO',
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
    .insert(runtimeProfiles)
    .values({
      id: 'profile-1',
      companyId: 'company-1',
      name: 'Codex Local',
      slug: 'codex-local',
      kind: 'codex',
      enabled: true,
      configJson: '{}',
      lastHealthStatus: 'healthy',
      lastHealthMessage: null,
      lastValidatedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
});

afterEach(() => ctx.close());

describe('runtime sessions repo', () => {
  it('creates sessions and lists live sessions by company', () => {
    const sessionId = repo.create({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      workspacePath: 'C:\\TeamX\\company\\runtimes\\employee-1\\codex',
      now: 100,
    });

    expect(repo.getById(sessionId)).toEqual(
      expect.objectContaining({
        id: sessionId,
        adapterKind: 'codex',
        status: 'starting',
        workspacePath: 'C:\\TeamX\\company\\runtimes\\employee-1\\codex',
        startedAt: 100,
      }),
    );
    expect(repo.listLiveByCompany('company-1').map((row) => row.id)).toEqual([sessionId]);
  });

  it('records heartbeat history and updates the current session projection atomically', () => {
    const sessionId = repo.create({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      now: 100,
    });

    const heartbeat = repo.recordHeartbeat({
      sessionId,
      status: 'working',
      currentRunId: null,
      currentTicketId: null,
      costDeltaJson: '{"amountUsd":"0.01"}',
      message: 'claimed next ticket',
      leaseExpiresAt: 1_000,
      now: 200,
    });

    expect(heartbeat).toEqual(
      expect.objectContaining({
        sessionId,
        status: 'working',
        message: 'claimed next ticket',
        createdAt: 200,
      }),
    );
    expect(repo.getById(sessionId)).toEqual(
      expect.objectContaining({
        status: 'working',
        lastHeartbeatAt: 200,
        leaseExpiresAt: 1_000,
      }),
    );
    expect(repo.listHeartbeats(sessionId)).toHaveLength(1);
  });

  it('marks live sessions stale when the heartbeat is older than the threshold', () => {
    const staleId = repo.create({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      now: 100,
    });
    repo.recordHeartbeat({ sessionId: staleId, status: 'idle', now: 150 });
    const freshId = repo.create({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      now: 200,
    });
    repo.recordHeartbeat({ sessionId: freshId, status: 'idle', now: 900 });

    const stale = repo.markStaleBefore({
      companyId: 'company-1',
      staleBefore: 500,
      now: 1_000,
    });

    expect(stale.map((row) => row.id)).toEqual([staleId]);
    expect(repo.getById(staleId)?.status).toBe('stale');
    expect(repo.getById(freshId)?.status).toBe('idle');
  });
});
