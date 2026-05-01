import type { RuntimeProfile } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';


import type { EmployeeRow } from '../db/repos/employees.js';

import { createRuntimeProfileProviderService } from './runtime-profile-provider-service.js';

function makeEmployee(): EmployeeRow {
  return {
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
  };
}

function makeProfile(
  kind: RuntimeProfile['kind'],
  config: Record<string, unknown>,
): RuntimeProfile {
  return {
    id: `profile-${kind}`,
    companyId: 'company-1',
    name: `Profile ${kind}`,
    slug: `profile-${kind}`,
    kind,
    enabled: true,
    config,
    lastHealthStatus: 'healthy',
    lastHealthMessage: null,
    lastValidatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('runtime profile provider service', () => {
  it('uses direct external adapters for execution-backed runtime profiles', async () => {
    const employee = makeEmployee();
    const providerFactory = {
      create: vi.fn(),
      resolveForEmployee: vi.fn(async () => ({
        providerName: 'anthropic',
        providerKind: 'anthropic',
        model: 'claude-haiku-4-5',
        stream: vi.fn(),
      })),
    };
    const externalRuntimeAdapters = {
      createResolvedProvider: vi.fn(() => ({
        providerName: 'runtime:bash',
        providerKind: 'bash',
        model: 'profile-bash',
        stream: vi.fn(),
      })),
    };
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: {
        getProfileForEmployee: vi.fn(() =>
          makeProfile('bash', { command: 'C:\\Tools\\runtime.cmd' }),
        ),
      } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters,
    });

    const result = await service.resolveForEmployee(employee);

    expect(externalRuntimeAdapters.createResolvedProvider).toHaveBeenCalled();
    expect(providerFactory.resolveForEmployee).not.toHaveBeenCalled();
    expect(result.providerName).toBe('runtime:bash');
  });

  it('uses configured codex-style adapters instead of falling through to the internal provider path', async () => {
    const employee = makeEmployee();
    const providerFactory = {
      create: vi.fn(),
      resolveForEmployee: vi.fn(async () => ({
        providerName: 'anthropic',
        providerKind: 'anthropic',
        model: 'claude-haiku-4-5',
        stream: vi.fn(),
      })),
    };
    const externalRuntimeAdapters = {
      createResolvedProvider: vi.fn(() => ({
        providerName: 'runtime:codex',
        providerKind: 'codex',
        model: 'profile-codex',
        stream: vi.fn(),
      })),
    };
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: {
        getProfileForEmployee: vi.fn(() =>
          makeProfile('codex', {
            command: 'codex',
          }),
        ),
      } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters,
    });

    const result = await service.resolveForEmployee(employee);

    expect(externalRuntimeAdapters.createResolvedProvider).toHaveBeenCalled();
    expect(providerFactory.resolveForEmployee).not.toHaveBeenCalled();
    expect(result.providerName).toBe('runtime:codex');
  });

  it('applies runtime-profile provider and model overrides for teamx-internal bindings', async () => {
    const employee = makeEmployee();
    const providerFactory = {
      create: vi.fn(async ({ providerId, model }: { providerId: string; model?: string }) => ({
        providerName: providerId,
        providerKind: providerId,
        model: model ?? 'fallback',
        stream: vi.fn(),
      })),
      resolveForEmployee: vi.fn(),
    };
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: {
        getProfileForEmployee: vi.fn(() =>
          makeProfile('teamx-internal', {
            providerId: 'ollama-local',
            model: 'llama3.1:8b',
          }),
        ),
      } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters: {
        createResolvedProvider: vi.fn(),
      },
    });

    const result = await service.resolveForEmployee(employee);

    expect(providerFactory.create).toHaveBeenCalledWith({
      providerId: 'ollama-local',
      model: 'llama3.1:8b',
    });
    expect(result.providerName).toBe('ollama-local');
    expect(result.model).toBe('llama3.1:8b');
  });

  it('falls back to the normal provider path when an adapter-backed profile has no executable transport', async () => {
    const employee = makeEmployee();
    const providerFactory = {
      create: vi.fn(),
      resolveForEmployee: vi.fn(async () => ({
        providerName: 'anthropic',
        providerKind: 'anthropic',
        model: 'claude-haiku-4-5',
        stream: vi.fn(),
      })),
    };
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: {
        getProfileForEmployee: vi.fn(() =>
          makeProfile('codex', {
            command: 'codex',
          }),
        ),
      } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters: {
        createResolvedProvider: vi.fn(() => null),
      },
    });

    const result = await service.resolveForEmployee(employee);

    expect(providerFactory.resolveForEmployee).toHaveBeenCalledWith(employee);
    expect(result.providerName).toBe('anthropic');
  });
});
