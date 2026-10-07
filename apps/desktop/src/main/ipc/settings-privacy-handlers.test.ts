import type { PrivacyTier, ProviderConfig } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type IpcHandlerDeps, createIpcHandlers } from './handlers.js';

/**
 * settings.getPrivacy / settings.setPrivacy — the Privacy panel's data
 * source. Besides the per-provider `allowed` flag, `getPrivacy` reports
 * which providers the current tier would actually refuse at run time
 * (configured + enabled + above the tier), so the panel can show the
 * consequence before a run fails.
 */

const ROWS: ProviderConfig[] = [
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    kind: 'ollama',
    privacyTier: 'local',
    enabled: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    privacyTier: 'proprietary-cloud',
    enabled: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'groq',
    privacyTier: 'open-source-cloud',
    enabled: true,
  },
  // Above the tier but unconfigured — cannot run, so nothing to block.
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    privacyTier: 'proprietary-cloud',
    enabled: true,
  },
  // Above the tier but disabled — never selected, so nothing to block.
  {
    id: 'google',
    name: 'Google',
    kind: 'google',
    privacyTier: 'proprietary-cloud',
    enabled: false,
  },
];

const CONFIGURED = new Set(['ollama-local', 'anthropic', 'groq', 'google']);

function makeDeps(maxTier: string | undefined): {
  deps: IpcHandlerDeps;
  settingsRepo: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
} {
  const noop = {} as never;
  const settingsRepo = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'max_privacy_tier' && maxTier !== undefined ? maxTier : fallback,
    ),
    set: vi.fn(),
  };
  const providersService = {
    list: vi.fn(() => ROWS),
    get: vi.fn((id: string) => ROWS.find((r) => r.id === id) ?? null),
    isConfigured: vi.fn(async (id: string) => CONFIGURED.has(id)),
  };
  const deps = {
    companiesRepo: noop,
    employeesRepo: noop,
    threadsRepo: noop,
    messagesRepo: noop,
    ticketsRepo: noop,
    ticketAttachmentsRepo: noop,
    goalsRepo: noop,
    projectsRepo: noop,
    meetingsRepo: noop,
    runsRepo: noop,
    eventsRepo: noop,
    orchestrator: noop,
    meetingService: noop,
    roleLookup: noop,
    mcpHost: noop,
    mcpServersRepo: noop,
    providersService,
    secretsStore: noop,
    settingsRepo,
    vaultService: noop,
    backupService: noop,
    auditRepo: noop,
    updaterService: noop,
    bus: { emit: vi.fn() } as never,
    getHardwareProfile: () => ({}) as never,
  } as unknown as IpcHandlerDeps;
  return { deps, settingsRepo };
}

describe('settings.getPrivacy IPC handler', () => {
  it('lists the configured, enabled providers the current tier would refuse', async () => {
    const handlers = createIpcHandlers(makeDeps('local').deps);

    const result = await handlers.settingsGetPrivacy();

    expect(result.maxTier).toBe('local');
    expect(result.blockedProviders).toEqual([
      { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' },
      { id: 'groq', name: 'Groq', kind: 'groq', privacyTier: 'open-source-cloud' },
    ]);
  });

  it('narrows the blocked list as the tier rises', async () => {
    const handlers = createIpcHandlers(makeDeps('open-source-cloud').deps);

    const result = await handlers.settingsGetPrivacy();

    expect(result.blockedProviders.map((p) => p.id)).toEqual(['anthropic']);
  });

  it('reports nothing blocked when the tier allows all providers', async () => {
    const handlers = createIpcHandlers(makeDeps('proprietary-cloud').deps);

    const result = await handlers.settingsGetPrivacy();

    expect(result.blockedProviders).toEqual([]);
  });

  it('defaults to All Providers when the tier was never set', async () => {
    const handlers = createIpcHandlers(makeDeps(undefined).deps);

    const result = await handlers.settingsGetPrivacy();

    expect(result.maxTier).toBe('proprietary-cloud');
    expect(result.blockedProviders).toEqual([]);
  });

  it('keeps the per-provider allowed flag for the availability list', async () => {
    const handlers = createIpcHandlers(makeDeps('local').deps);

    const result = await handlers.settingsGetPrivacy();

    expect(result.availableProviders.find((p) => p.id === 'ollama-local')?.allowed).toBe(true);
    expect(result.availableProviders.find((p) => p.id === 'openai')?.allowed).toBe(false);
  });
});

describe('settings.setPrivacy IPC handler', () => {
  it('persists a recognised tier', async () => {
    const { deps, settingsRepo } = makeDeps('proprietary-cloud');
    const handlers = createIpcHandlers(deps);

    await handlers.settingsSetPrivacy({ maxTier: 'local' });

    expect(settingsRepo.set).toHaveBeenCalledWith('max_privacy_tier', 'local');
  });

  it('rejects an unrecognised tier instead of persisting it', async () => {
    const { deps, settingsRepo } = makeDeps('proprietary-cloud');
    const handlers = createIpcHandlers(deps);

    await expect(
      handlers.settingsSetPrivacy({ maxTier: 'anywhere' as PrivacyTier }),
    ).rejects.toThrow(/privacy tier/i);
    expect(settingsRepo.set).not.toHaveBeenCalled();
  });
});
