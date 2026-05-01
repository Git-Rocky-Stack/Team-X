import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProviderConfig } from '@team-x/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


import { createEmployeesRepo } from '../db/repos/employees.js';
import { createRuntimeProfilesRepo } from '../db/repos/runtime-profiles.js';
import { companies } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';

import { createRuntimeProfilesService } from './runtime-profiles-service.js';

let ctx: TestDbHandle;
let runtimeProfilesRepo: ReturnType<typeof createRuntimeProfilesRepo>;
let employeesRepo: ReturnType<typeof createEmployeesRepo>;
let tempDir: string;

const providers: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    privacyTier: 'proprietary-cloud',
    enabled: true,
  },
  {
    id: 'ollama-local',
    name: 'Ollama',
    kind: 'ollama',
    privacyTier: 'local',
    enabled: true,
  },
];

beforeEach(async () => {
  ctx = await makeTestDb();
  runtimeProfilesRepo = createRuntimeProfilesRepo(ctx.db);
  employeesRepo = createEmployeesRepo(ctx.db);
  tempDir = await mkdtemp(join(tmpdir(), 'teamx-runtime-profiles-'));

  ctx.db
    .insert(companies)
    .values([
      {
        id: 'company-1',
        name: 'Alpha',
        slug: 'alpha',
        createdAt: 1,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
      {
        id: 'company-2',
        name: 'Beta',
        slug: 'beta',
        createdAt: 2,
        settingsJson: '{}',
        icon: null,
        theme: 'dark',
        status: 'running',
      },
    ])
    .run();

  employeesRepo.create({
    companyId: 'company-1',
    rolePackId: 'strategia-official',
    roleId: 'ceo',
    roleMdSha: 'sha',
    level: 'officer',
    name: 'Iris',
    title: 'CEO',
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  ctx.close();
});

function createService(args?: {
  configuredProviderIds?: string[];
  fetchFn?: typeof fetch;
}) {
  const configuredProviderIds = new Set(args?.configuredProviderIds ?? ['anthropic']);
  return createRuntimeProfilesService({
    runtimeProfilesRepo,
    employeesRepo,
    providersService: {
      list: () => providers,
      get: (id: string) => providers.find((provider) => provider.id === id) ?? null,
      isConfigured: vi.fn(async (id: string) => configuredProviderIds.has(id)),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      seedIfEmpty: vi.fn(),
    },
    fetchFn: args?.fetchFn,
  });
}

describe('runtime profiles service', () => {
  it('creates profiles and binds employees inside one company', () => {
    const service = createService();
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Mission Control Internal',
      kind: 'teamx-internal',
      config: { providerId: 'anthropic' },
    });

    const employeeId = employeesRepo.listVisibleByCompany('company-1')[0]?.id;
    const binding = service.bindEmployee({
      companyId: 'company-1',
      employeeId,
      runtimeProfileId: profileId,
    });

    expect(binding).toEqual(
      expect.objectContaining({
        employeeId,
        runtimeProfileId: profileId,
      }),
    );
    expect(service.list('company-1')[0]).toEqual(
      expect.objectContaining({
        id: profileId,
        boundEmployeeIds: [employeeId],
        executionMode: 'native',
      }),
    );
  });

  it('rejects cross-company employee bindings', () => {
    const service = createService();
    const profileId = service.create({
      companyId: 'company-2',
      name: 'Beta Runtime',
      kind: 'teamx-internal',
    });
    const employeeId = employeesRepo.listVisibleByCompany('company-1')[0]?.id;

    expect(() =>
      service.bindEmployee({
        companyId: 'company-1',
        employeeId,
        runtimeProfileId: profileId,
      }),
    ).toThrow(/does not belong to company/);
  });

  it('validates internal runtime profiles against configured providers', async () => {
    const service = createService({ configuredProviderIds: ['anthropic'] });
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Anthropic Internal',
      kind: 'teamx-internal',
      config: { providerId: 'anthropic', model: 'claude-haiku-4-5' },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(result.status).toBe('healthy');
    expect(result.supportsExecution).toBe(true);
    expect(result.message).toMatch(/Anthropic/);
  });

  it('validates internal runtime working directories before marking execution healthy', async () => {
    const service = createService({ configuredProviderIds: ['anthropic'] });
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Anthropic Internal',
      kind: 'teamx-internal',
      config: {
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
        workingDirectory: tempDir,
      },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(result.status).toBe('healthy');
    expect(result.supportsExecution).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        providerId: 'anthropic',
        workingDirectory: tempDir,
      }),
    );
  });

  it('rejects inaccessible internal runtime working directories', async () => {
    const service = createService({ configuredProviderIds: ['anthropic'] });
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Anthropic Internal',
      kind: 'teamx-internal',
      config: {
        providerId: 'anthropic',
        workingDirectory: join(tempDir, 'missing'),
      },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(result.status).toBe('error');
    expect(result.supportsExecution).toBe(false);
    expect(result.message).toMatch(/working directory is not accessible/i);
  });

  it('validates bash runtime profiles with an absolute command path', async () => {
    const service = createService();
    const commandPath = join(tempDir, 'launcher.exe');
    await writeFile(commandPath, 'echo team-x');
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Local Launcher',
      kind: 'bash',
      config: { command: commandPath, workingDirectory: tempDir },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(result.status).toBe('healthy');
    expect(result.supportsExecution).toBe(true);
    expect(service.list('company-1')[0]?.executionMode).toBe('native');
  });

  it('validates http runtime profiles through the injected fetch', async () => {
    const fetchFn: typeof fetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const service = createService({ fetchFn });
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Remote Runtime',
      kind: 'http',
      config: { baseUrl: 'http://127.0.0.1:8787', healthPath: '/health' },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(fetchFn).toHaveBeenCalled();
    expect(result.status).toBe('healthy');
    expect(result.supportsExecution).toBe(true);
    expect(result.message).toMatch(/responded successfully/i);
    expect(service.list('company-1')[0]?.executionMode).toBe('native');
  });

  it('treats configured codex-style profiles as native execution posture', async () => {
    const service = createService();
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Codex Runner',
      kind: 'codex',
      config: { command: 'codex' },
    });

    const result = await service.validateProfile({
      companyId: 'company-1',
      profileId,
    });

    expect(result.supportsExecution).toBe(true);
    expect(result.message).toMatch(/launcher command|execution-backed/i);
    expect(service.list('company-1')[0]?.executionMode).toBe('native');
  });

  it('leaves adapter-backed profiles as planned posture until a launcher or endpoint is configured', () => {
    const service = createService();
    service.create({
      companyId: 'company-1',
      name: 'Future Cursor',
      kind: 'cursor',
      config: {},
    });

    expect(service.list('company-1')[0]?.executionMode).toBe('planned');
  });

  it('rejects inline sensitive runtime config values', () => {
    const service = createService();

    expect(() =>
      service.create({
        companyId: 'company-1',
        name: 'Unsafe Codex',
        kind: 'codex',
        config: {
          env: {
            ANTHROPIC_API_KEY: 'sk-ant-unsafe',
          },
        },
      }),
    ).toThrow(/inline sensitive value/);
  });

  it('allows runtime config secret refs for environment injection', () => {
    const service = createService();
    const profileId = service.create({
      companyId: 'company-1',
      name: 'Safe Codex',
      kind: 'codex',
      config: {
        env: {
          ANTHROPIC_API_KEY: {
            type: 'secret_ref',
            providerId: 'anthropic',
            key: 'apiKey',
            version: 'latest',
          },
        },
      },
    });

    expect(service.list('company-1')[0]).toEqual(
      expect.objectContaining({
        id: profileId,
        executionMode: 'planned',
      }),
    );
  });
});
