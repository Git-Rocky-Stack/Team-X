import type { PrivacyTier, RuntimeProfile } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';

import { PrivacyTierViolationError } from './provider-factory.js';
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

describe('runtime profile provider service — privacy tier', () => {
  // External runtimes used to bypass Settings → Privacy entirely: the tier
  // check lived only in the provider factory, and a Codex / Claude Code /
  // Cursor / command / HTTP profile never goes through it.
  function harness(
    profile: RuntimeProfile,
    maxTier: PrivacyTier,
    lookup?: (host: string) => Promise<Array<{ address: string; family: number }>>,
  ) {
    const providerFactory = {
      create: vi.fn(),
      resolveForEmployee: vi.fn(async () => ({
        providerName: 'ollama-local',
        providerKind: 'ollama',
        model: 'llama3.1:8b',
        stream: vi.fn(),
      })),
    };
    const stream = vi.fn();
    const externalRuntimeAdapters = {
      createResolvedProvider: vi.fn(() => ({
        providerName: `runtime:${profile.kind}`,
        providerKind: profile.kind,
        model: profile.slug,
        stream,
      })),
    };
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: { getProfileForEmployee: vi.fn(() => profile) } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters,
      getMaxPrivacyTier: () => maxTier,
      ...(lookup ? { lookup } : {}),
    });
    return { service, providerFactory, stream };
  }

  it.each(['codex', 'claude-code', 'cursor'] as const)(
    'refuses a %s profile under Local Only, naming the profile and the setting',
    async (kind) => {
      const { service, providerFactory } = harness(makeProfile(kind, { command: kind }), 'local');

      const err = await service.resolveForEmployee(makeEmployee()).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PrivacyTierViolationError);
      expect((err as Error).message).toMatch(
        new RegExp(`^Runtime profile "Profile ${kind} \\(.+\\)" is Proprietary Cloud-tier`),
      );
      expect((err as Error).message).toContain('Settings → Privacy allows Local Only');
      // Refused, never silently re-routed to another provider.
      expect(providerFactory.resolveForEmployee).not.toHaveBeenCalled();
    },
  );

  it('treats a vendor CLI reached through an endpoint URL as cloud too', async () => {
    const { service } = harness(
      makeProfile('codex', { endpointUrl: 'http://127.0.0.1:9000' }),
      'open-source-cloud',
    );

    await expect(service.resolveForEmployee(makeEmployee())).rejects.toBeInstanceOf(
      PrivacyTierViolationError,
    );
  });

  it('allows every runtime under All Providers without resolving any host', async () => {
    const lookup = vi.fn();
    const { service } = harness(
      makeProfile('http', { baseUrl: 'https://agents.example.com' }),
      'proprietary-cloud',
      lookup,
    );

    await expect(service.resolveForEmployee(makeEmployee())).resolves.toMatchObject({
      providerName: 'runtime:http',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses a command runtime under Local Only, because its destination is unknown', async () => {
    const { service } = harness(makeProfile('bash', { command: './run.sh' }), 'local');

    await expect(service.resolveForEmployee(makeEmployee())).rejects.toThrow(
      /Runtime profile "Profile bash \(command\)".*cannot confirm/,
    );
  });

  it('allows an HTTP runtime on loopback under Local Only', async () => {
    const { service } = harness(
      makeProfile('http', { baseUrl: 'http://127.0.0.1:8080/run' }),
      'local',
    );

    await expect(service.resolveForEmployee(makeEmployee())).resolves.toMatchObject({
      providerName: 'runtime:http',
    });
  });

  it('allows an HTTP runtime whose LAN name resolves only to private addresses', async () => {
    const lookup = vi.fn(async () => [{ address: '192.168.1.40', family: 4 }]);
    const { service } = harness(
      makeProfile('http', { baseUrl: 'http://bench-rig:8080' }),
      'local',
      lookup,
    );

    await expect(service.resolveForEmployee(makeEmployee())).resolves.toMatchObject({
      providerName: 'runtime:http',
    });
    expect(lookup).toHaveBeenCalledWith('bench-rig', { all: true });
  });

  it('refuses an HTTP runtime whose LAN name resolves to a public address', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]);
    const { service } = harness(
      makeProfile('http', { baseUrl: 'http://bench-rig:8080' }),
      'local',
      lookup,
    );

    await expect(service.resolveForEmployee(makeEmployee())).rejects.toThrow(
      /"bench-rig" resolves to 8\.8\.8\.8/,
    );
  });

  it('refuses a public HTTP runtime under Open-Source Cloud', async () => {
    const { service } = harness(
      makeProfile('http', { baseUrl: 'https://agents.example.com' }),
      'open-source-cloud',
    );

    await expect(service.resolveForEmployee(makeEmployee())).rejects.toThrow(
      /is Proprietary Cloud-tier, but Settings → Privacy allows Open-Source Cloud/,
    );
  });

  it('never starts a refused runtime', async () => {
    const { service, stream } = harness(makeProfile('codex', { command: 'codex' }), 'local');

    await service.resolveForEmployee(makeEmployee()).catch(() => undefined);

    expect(stream).not.toHaveBeenCalled();
  });

  it('leaves a profile with no executable transport to the provider factory', async () => {
    const { providerFactory } = harness(makeProfile('codex', {}), 'local');
    // The factory applies its own tier check to whatever it resolves.
    const service = createRuntimeProfileProviderService({
      runtimeProfilesService: {
        getProfileForEmployee: vi.fn(() => makeProfile('codex', {})),
      } as never,
      providerFactory: providerFactory as never,
      externalRuntimeAdapters: { createResolvedProvider: vi.fn(() => null) },
      getMaxPrivacyTier: () => 'local',
    });

    await expect(service.resolveForEmployee(makeEmployee())).resolves.toMatchObject({
      providerName: 'ollama-local',
    });
  });
});
