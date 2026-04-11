import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Map-backed in-memory stand-in for the OS keychain. Same pattern as
 * `secrets.test.ts` — the real keytar module is a native binding and must
 * never be loaded under Vitest. Entries are keyed as `${service}:${account}`.
 *
 * The mock factory exposes top-level named functions (NOT a `{ default: ... }`
 * wrapper) because production `secrets.ts` uses `import * as keytar from
 * 'keytar'`, which means the module namespace IS the factory return value.
 */
const keytarStore = new Map<string, string>();

vi.mock('keytar', () => ({
  getPassword: async (service: string, account: string): Promise<string | null> =>
    keytarStore.get(`${service}:${account}`) ?? null,
  setPassword: async (service: string, account: string, password: string): Promise<void> => {
    keytarStore.set(`${service}:${account}`, password);
  },
  deletePassword: async (service: string, account: string): Promise<boolean> =>
    keytarStore.delete(`${service}:${account}`),
}));

import { providers as providersTable } from '../db/schema.js';
import { type TestDbHandle, makeTestDb } from '../db/test-helpers.js';
import {
  DEFAULT_ANTHROPIC_ID,
  DEFAULT_OLLAMA_LOCAL_ID,
  createProvidersService,
} from './providers.js';
import { SecretsStore } from './secrets.js';

describe('createProvidersService', () => {
  let ctx: TestDbHandle;
  let secrets: SecretsStore;
  let service: ReturnType<typeof createProvidersService<void>>;

  beforeEach(async () => {
    keytarStore.clear();
    ctx = await makeTestDb();
    secrets = new SecretsStore();
    service = createProvidersService(ctx.db, secrets);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('seedIfEmpty', () => {
    it('inserts exactly two default provider rows on an empty database', () => {
      service.seedIfEmpty();
      expect(service.list()).toHaveLength(2);
    });

    it('is idempotent — a second call on a seeded database does not duplicate rows', () => {
      service.seedIfEmpty();
      service.seedIfEmpty();
      expect(service.list()).toHaveLength(2);
    });

    it('does not touch existing rows if the providers table is non-empty', () => {
      // Manually insert one unrelated provider to simulate a partially
      // hand-configured user setup. The seed must leave it alone.
      ctx.db
        .insert(providersTable)
        .values({
          id: 'custom-openrouter',
          name: 'Custom OpenRouter',
          kind: 'openrouter',
          configJson: '{"baseUrl":"https://openrouter.ai/api/v1"}',
          privacyTier: 'proprietary-cloud',
          enabled: true,
        })
        .run();

      service.seedIfEmpty();

      const all = service.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('custom-openrouter');
    });

    it('seeds ollama-local with the correct kind, privacy tier, and base URL', () => {
      service.seedIfEmpty();
      const ollama = service.get(DEFAULT_OLLAMA_LOCAL_ID);
      expect(ollama).not.toBeNull();
      expect(ollama?.kind).toBe('ollama');
      expect(ollama?.privacyTier).toBe('local');
      // MUST end in /api — the ollama-ai-provider SDK appends
      // /chat, /embed, etc. directly to this base URL.  See the
      // comment in services/providers.ts seedIfEmpty for the full
      // rationale.
      expect(ollama?.baseUrl).toBe('http://localhost:11434/api');
      expect(ollama?.enabled).toBe(true);
      expect(ollama?.name).toBe('Ollama (Local)');
    });

    it('seeds anthropic with the correct kind and privacy tier, without a base URL', () => {
      service.seedIfEmpty();
      const anthropic = service.get(DEFAULT_ANTHROPIC_ID);
      expect(anthropic).not.toBeNull();
      expect(anthropic?.kind).toBe('anthropic');
      expect(anthropic?.privacyTier).toBe('proprietary-cloud');
      expect(anthropic?.baseUrl).toBeUndefined();
      expect(anthropic?.enabled).toBe(true);
      expect(anthropic?.name).toBe('Anthropic');
    });
  });

  describe('list', () => {
    it('returns an empty array on a fresh database', () => {
      expect(service.list()).toEqual([]);
    });

    it('returns every seeded provider after seedIfEmpty', () => {
      service.seedIfEmpty();
      const all = service.list();
      const ids = all.map((p) => p.id).sort();
      expect(ids).toEqual([DEFAULT_ANTHROPIC_ID, DEFAULT_OLLAMA_LOCAL_ID].sort());
    });

    it('tolerates a row with malformed configJson and returns it with no baseUrl', () => {
      // A corrupted or user-edited row must not crash `list()`. F10
      // robustness — the provider should still appear, just without the
      // baseUrl that the parser could not extract.
      ctx.db
        .insert(providersTable)
        .values({
          id: 'broken',
          name: 'Broken',
          kind: 'custom-openai',
          configJson: 'not-valid-json{{',
          privacyTier: 'proprietary-cloud',
          enabled: true,
        })
        .run();

      const all = service.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('broken');
      expect(all[0]?.baseUrl).toBeUndefined();
    });
  });

  describe('get', () => {
    it('returns null for a provider id that does not exist', () => {
      expect(service.get('missing')).toBeNull();
    });

    it('returns the matching provider row mapped to ProviderConfig shape', () => {
      service.seedIfEmpty();
      const ollama = service.get(DEFAULT_OLLAMA_LOCAL_ID);
      expect(ollama).toMatchObject({
        id: DEFAULT_OLLAMA_LOCAL_ID,
        kind: 'ollama',
        privacyTier: 'local',
        enabled: true,
      });
    });
  });

  describe('isConfigured', () => {
    it('returns false for a provider that does not exist', async () => {
      expect(await service.isConfigured('missing-provider')).toBe(false);
    });

    it('returns true for a local provider even without a stored API key', async () => {
      // Local providers (ollama, LM Studio, etc.) do not need an API key
      // to be considered "ready to use" — they talk to a local daemon.
      service.seedIfEmpty();
      expect(await service.isConfigured(DEFAULT_OLLAMA_LOCAL_ID)).toBe(true);
    });

    it('returns false for a cloud provider with no stored API key', async () => {
      service.seedIfEmpty();
      expect(await service.isConfigured(DEFAULT_ANTHROPIC_ID)).toBe(false);
    });

    it('returns true for a cloud provider once an API key is stored', async () => {
      service.seedIfEmpty();
      await secrets.setApiKey(DEFAULT_ANTHROPIC_ID, 'sk-ant-test-live');
      expect(await service.isConfigured(DEFAULT_ANTHROPIC_ID)).toBe(true);
    });

    it('returns false for a disabled cloud provider even with an API key', async () => {
      // Manually insert a disabled anthropic row to exercise the enabled
      // short-circuit — a user who has explicitly disabled a provider must
      // not be reported as "configured and ready to dispatch work to".
      ctx.db
        .insert(providersTable)
        .values({
          id: 'anthropic-disabled',
          name: 'Anthropic (disabled)',
          kind: 'anthropic',
          configJson: '{}',
          privacyTier: 'proprietary-cloud',
          enabled: false,
        })
        .run();
      await secrets.setApiKey('anthropic-disabled', 'sk-ant-real');
      expect(await service.isConfigured('anthropic-disabled')).toBe(false);
    });

    it('returns false for a disabled local provider (disabled overrides local)', async () => {
      ctx.db
        .insert(providersTable)
        .values({
          id: 'ollama-disabled',
          name: 'Ollama (disabled)',
          kind: 'ollama',
          configJson: '{}',
          privacyTier: 'local',
          enabled: false,
        })
        .run();
      expect(await service.isConfigured('ollama-disabled')).toBe(false);
    });
  });
});
