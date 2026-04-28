import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRuntimeSessionsRepo } from '../db/repos/runtime-sessions.js';
import { companies, employees, runtimeProfiles } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import { createRuntimeSessionService } from './runtime-session-service.js';

let ctx: TestDbHandle;
let service: ReturnType<typeof createRuntimeSessionService>;

beforeEach(async () => {
  ctx = await makeTestDb();
  service = createRuntimeSessionService({
    runtimeSessionsRepo: createRuntimeSessionsRepo(ctx.db),
  });
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

describe('runtime session service', () => {
  it('projects runtime session JSON into typed runtime session entities', () => {
    const session = service.start({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      capabilities: { tools: ['shell'], maxParallelTasks: 1 },
      now: 100,
    });

    expect(session).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        adapterKind: 'codex',
        capabilities: { tools: ['shell'], maxParallelTasks: 1 },
        startedAt: 100,
      }),
    );
  });

  it('records heartbeat cost deltas without exposing raw JSON to callers', () => {
    const session = service.start({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      now: 100,
    });

    const heartbeat = service.heartbeat({
      sessionId: session.id,
      status: 'working',
      costDeltaJson: '{"amountUsd":"0.02","provider":"codex"}',
      now: 200,
    });

    expect(heartbeat).toEqual(
      expect.objectContaining({
        sessionId: session.id,
        status: 'working',
        costDelta: { amountUsd: '0.02', provider: 'codex' },
      }),
    );
    expect(service.get(session.id)?.lastHeartbeatAt).toBe(200);
  });

  it('emits normalized stale and recovered session audit events', () => {
    const runtimeAuditNormalizer = { emit: vi.fn(), recordArtifact: vi.fn() };
    const auditedService = createRuntimeSessionService({
      runtimeSessionsRepo: createRuntimeSessionsRepo(ctx.db),
      runtimeAuditNormalizer: runtimeAuditNormalizer as never,
    });
    const session = auditedService.start({
      companyId: 'company-1',
      employeeId: 'employee-1',
      runtimeProfileId: 'profile-1',
      adapterKind: 'codex',
      now: 100,
    });
    auditedService.heartbeat({ sessionId: session.id, status: 'working', now: 150 });

    const stale = auditedService.reapStale({
      companyId: 'company-1',
      staleBefore: 200,
      now: 300,
    });
    const recovered = auditedService.recover(session.id, { status: 'idle', now: 400 });

    expect(stale[0]?.status).toBe('stale');
    expect(recovered?.status).toBe('idle');
    expect(runtimeAuditNormalizer.emit.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        type: 'runtime.session.stale',
        sessionId: session.id,
        status: 'stale',
        message: 'runtime heartbeat is stale',
      }),
      expect.objectContaining({
        type: 'runtime.session.recovered',
        sessionId: session.id,
        status: 'idle',
      }),
    ]);
  });
});
