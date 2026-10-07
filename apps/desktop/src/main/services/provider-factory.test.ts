import type { PrivacyTier, ProviderConfig } from '@team-x/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeeRow } from '../db/repos/employees.js';

import {
  PrivacyTierViolationError,
  type ProviderFactoryCompaniesRepo,
  type SecretsReader,
  buildEmbedAdapter,
  createProviderFactory,
} from './provider-factory.js';
import type { ProvidersService } from './providers.js';

/**
 * Tests for the desktop `provider-factory` service.
 *
 * The factory binds three things together:
 *   - the `ProvidersService` (DB-backed registry rows + isConfigured),
 *   - the `SecretsStore` (keychain-backed API key reader),
 *   - the live adapters from `@team-x/provider-router`.
 *
 * The unit suite isolates the factory's selection + wiring logic from
 * all three by:
 *   - mocking `@team-x/provider-router`'s `makeAnthropicStream` /
 *     `makeOllamaStream` so calls are observable but no SDKs are loaded,
 *   - injecting hand-rolled fakes for `ProvidersService` and the
 *     `SecretsReader` (no DB, no keychain).
 *
 * Behaviors covered:
 *   1. `create({ providerId, model })` happy paths for Anthropic + Ollama
 *   2. `create` rejects on missing / disabled / unconfigured providers
 *   3. `resolveForEmployee` honors `employee.providerPref` first
 *   4. `resolveForEmployee` falls back when the preferred provider isn't
 *      configured
 *   5. `resolveForEmployee` honors `employee.modelPref`, falling through
 *      to the per-kind default otherwise
 *   6. Anthropic adapter receives the apiKey pulled from the secrets
 *      reader; Ollama adapter receives the baseURL from the provider row
 *   7. The `ResolvedProvider` shape matches what the orchestrator's
 *      `ResolveProvider` contract expects (providerName + model + stream)
 *   8. Privacy-tier enforcement: `create` + `resolveForEmployee` refuse a
 *      provider above Settings → Privacy's max tier with a typed
 *      `PrivacyTierViolationError`, read the tier per call, and keep
 *      today's behaviour when no tier getter is injected
 *   9. `buildEmbedAdapter` applies the same rule at embed time, before
 *      any text reaches the provider
 */

const calls = {
  makeAnthropic: [] as Array<{ apiKey: string; model: string; baseURL?: string }>,
  makeOllama: [] as Array<{ model: string; baseURL?: string; headers?: Record<string, string> }>,
  /** Texts that reached a mocked embed adapter — i.e. content that would
   * have left the process. Privacy refusals must leave this empty. */
  embedded: [] as Array<{ adapter: 'ollama' | 'openai'; texts: string[] }>,
};

function fakeEmbedAdapter(
  adapter: 'ollama' | 'openai',
  opts: { model: string; dimension: number },
) {
  return {
    model: opts.model,
    dimension: opts.dimension,
    embed: async (texts: string[]) => {
      calls.embedded.push({ adapter, texts });
      return texts.map(() => new Array<number>(opts.dimension).fill(0));
    },
  };
}

/** Stream functions returned by the mocked adapter factories. Tests
 * compare against these by reference to assert routing. */
const fakeAnthropicStream = async function* () {
  yield { delta: 'a' };
};
const fakeOllamaStream = async function* () {
  yield { delta: 'o' };
};

vi.mock('@team-x/provider-router', () => ({
  makeAnthropicStream: (opts: { apiKey: string; model: string; baseURL?: string }) => {
    calls.makeAnthropic.push(opts);
    return fakeAnthropicStream;
  },
  makeOllamaStream: (opts: {
    model: string;
    baseURL?: string;
    headers?: Record<string, string>;
  }) => {
    calls.makeOllama.push(opts);
    return fakeOllamaStream;
  },
  makeOllamaEmbedAdapter: (opts: { model: string; dimension: number }) =>
    fakeEmbedAdapter('ollama', opts),
  makeOpenAIEmbedAdapter: (opts: { model: string; dimension: number }) =>
    fakeEmbedAdapter('openai', opts),
}));

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeProvidersService implements ProvidersService {
  private rows = new Map<string, ProviderConfig>();
  /** Set of provider ids that should report `isConfigured() === true`. */
  configured = new Set<string>();

  set(provider: ProviderConfig, configured = true): void {
    this.rows.set(provider.id, provider);
    if (configured) this.configured.add(provider.id);
    else this.configured.delete(provider.id);
  }

  seedIfEmpty(): void {
    /* unused in tests */
  }

  list(): ProviderConfig[] {
    return [...this.rows.values()];
  }

  get(id: string): ProviderConfig | null {
    return this.rows.get(id) ?? null;
  }

  async isConfigured(id: string): Promise<boolean> {
    return this.configured.has(id);
  }
}

class FakeSecrets implements SecretsReader {
  private keys = new Map<string, string>();

  set(providerId: string, key: string): void {
    this.keys.set(providerId, key);
  }

  async getApiKey(providerId: string): Promise<string | null> {
    return this.keys.get(providerId) ?? null;
  }
}

class FakeCompaniesRepo implements ProviderFactoryCompaniesRepo {
  private settings = new Map<string, string>();

  setSettings(companyId: string, settings: Record<string, unknown>): void {
    this.settings.set(companyId, JSON.stringify(settings));
  }

  getById(id: string): { settingsJson: string | null } | null {
    return { settingsJson: this.settings.get(id) ?? '{}' };
  }
}

const ANTHROPIC_ROW: ProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  kind: 'anthropic',
  privacyTier: 'proprietary-cloud',
  enabled: true,
};

const OLLAMA_ROW: ProviderConfig = {
  id: 'ollama-local',
  name: 'Ollama (Local)',
  kind: 'ollama',
  privacyTier: 'local',
  baseUrl: 'http://localhost:11434',
  enabled: true,
};

function makeEmployee(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: 'emp_test_1',
    companyId: 'co_test_1',
    rolePackId: 'strategia-official',
    roleId: 'chief-executive-officer',
    roleMdSha: 'a'.repeat(64),
    level: 'officer',
    name: 'Iris Kovač',
    title: 'Chief Executive Officer',
    status: 'idle',
    modelPref: null,
    providerPref: null,
    toolsAllowedJson: '[]',
    toolsDeniedJson: '[]',
    avatar: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  } as EmployeeRow;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('createProviderFactory', () => {
  let providers: FakeProvidersService;
  let secrets: FakeSecrets;
  let companies: FakeCompaniesRepo;
  let factory: ReturnType<typeof createProviderFactory>;

  beforeEach(() => {
    calls.makeAnthropic.length = 0;
    calls.makeOllama.length = 0;
    calls.embedded.length = 0;
    providers = new FakeProvidersService();
    secrets = new FakeSecrets();
    companies = new FakeCompaniesRepo();
    factory = createProviderFactory({
      providersService: providers,
      secretsStore: secrets,
      companiesRepo: companies,
    });
  });

  describe('create({ providerId, model })', () => {
    it('builds an Anthropic stream when given an anthropic provider id', async () => {
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant-real');

      const resolved = await factory.create({
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      });

      expect(resolved.providerName).toBe('anthropic');
      expect(resolved.model).toBe('claude-haiku-4-5');
      expect(resolved.stream).toBe(fakeAnthropicStream);
      expect(calls.makeAnthropic).toEqual([{ apiKey: 'sk-ant-real', model: 'claude-haiku-4-5' }]);
      expect(calls.makeOllama).toEqual([]);
    });

    it('builds an Ollama stream when given an ollama provider id', async () => {
      providers.set(OLLAMA_ROW);

      const resolved = await factory.create({
        providerId: 'ollama-local',
        model: 'qwen2.5:3b',
      });

      expect(resolved.providerName).toBe('ollama-local');
      expect(resolved.model).toBe('qwen2.5:3b');
      expect(resolved.stream).toBe(fakeOllamaStream);
      expect(calls.makeOllama).toEqual([
        { model: 'qwen2.5:3b', baseURL: 'http://localhost:11434' },
      ]);
      expect(calls.makeAnthropic).toEqual([]);
    });

    it('falls through to a per-kind default model when none is supplied', async () => {
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');

      const resolved = await factory.create({ providerId: 'anthropic' });

      expect(resolved.model).toBeTruthy();
      expect(typeof resolved.model).toBe('string');
      expect(calls.makeAnthropic[0]?.model).toBe(resolved.model);
    });

    it('rejects when the provider id does not exist', async () => {
      await expect(factory.create({ providerId: 'nonexistent', model: 'm' })).rejects.toThrow(
        /not found/i,
      );
    });

    it('rejects when the provider exists but is disabled', async () => {
      providers.set({ ...ANTHROPIC_ROW, enabled: false }, false);
      await expect(
        factory.create({ providerId: 'anthropic', model: 'claude-haiku-4-5' }),
      ).rejects.toThrow(/disabled/i);
    });

    it('rejects when an Anthropic provider has no key in the keychain', async () => {
      providers.set(ANTHROPIC_ROW, false);
      await expect(
        factory.create({ providerId: 'anthropic', model: 'claude-haiku-4-5' }),
      ).rejects.toThrow(/configured/i);
    });
  });

  describe('resolveForEmployee', () => {
    it('uses employee.providerPref when set and configured', async () => {
      providers.set(OLLAMA_ROW);
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');

      const employee = makeEmployee({ providerPref: 'anthropic' });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.providerName).toBe('anthropic');
      expect(calls.makeAnthropic).toHaveLength(1);
      expect(calls.makeOllama).toHaveLength(0);
    });

    it('falls back to anthropic when no providerPref is set and anthropic is configured', async () => {
      providers.set(OLLAMA_ROW);
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');

      const employee = makeEmployee({ providerPref: null });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.providerName).toBe('anthropic');
    });

    it('uses the company default provider before hardcoded fallbacks', async () => {
      providers.set(OLLAMA_ROW);
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');
      companies.setSettings('co_test_1', { defaultProviderId: 'ollama-local' });

      const employee = makeEmployee({ providerPref: null });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.providerName).toBe('ollama-local');
      expect(calls.makeOllama).toHaveLength(1);
      expect(calls.makeAnthropic).toHaveLength(0);
    });

    it('falls back to ollama-local when anthropic is unavailable', async () => {
      providers.set(OLLAMA_ROW);
      providers.set(ANTHROPIC_ROW, false); // present but no key

      const employee = makeEmployee({ providerPref: null });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.providerName).toBe('ollama-local');
      expect(calls.makeOllama).toHaveLength(1);
      expect(calls.makeAnthropic).toHaveLength(0);
    });

    it('falls back to ollama-local when the preferred provider is not configured', async () => {
      providers.set(OLLAMA_ROW);
      providers.set(ANTHROPIC_ROW, false);

      const employee = makeEmployee({ providerPref: 'anthropic' });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.providerName).toBe('ollama-local');
    });

    it('honors employee.modelPref over the per-kind default', async () => {
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');

      const employee = makeEmployee({
        providerPref: 'anthropic',
        modelPref: 'claude-opus-4-6',
      });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.model).toBe('claude-opus-4-6');
      expect(calls.makeAnthropic[0]?.model).toBe('claude-opus-4-6');
    });

    it('uses the per-kind default model when employee.modelPref is null', async () => {
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant');

      const employee = makeEmployee({ providerPref: 'anthropic', modelPref: null });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.model).toBeTruthy();
      expect(resolved.model.length).toBeGreaterThan(0);
    });

    it('uses provider.defaultModel before the hardcoded per-kind fallback', async () => {
      providers.set({
        ...OLLAMA_ROW,
        defaultModel: 'glm-5:cloud',
      } as unknown as ProviderConfig);

      const employee = makeEmployee({ providerPref: 'ollama-local', modelPref: null });
      const resolved = await factory.resolveForEmployee(employee);

      expect(resolved.model).toBe('glm-5:cloud');
      expect(calls.makeOllama[0]?.model).toBe('glm-5:cloud');
    });

    it('forwards the Ollama provider row baseUrl into the adapter', async () => {
      providers.set({ ...OLLAMA_ROW, baseUrl: 'http://10.0.0.5:11434' });

      const employee = makeEmployee({ providerPref: 'ollama-local', modelPref: 'qwen2.5:3b' });
      await factory.resolveForEmployee(employee);

      expect(calls.makeOllama).toEqual([{ model: 'qwen2.5:3b', baseURL: 'http://10.0.0.5:11434' }]);
    });

    it('forwards the keychain key as the Anthropic apiKey', async () => {
      providers.set(ANTHROPIC_ROW);
      secrets.set('anthropic', 'sk-ant-secret-from-keychain');

      const employee = makeEmployee({
        providerPref: 'anthropic',
        modelPref: 'claude-haiku-4-5',
      });
      await factory.resolveForEmployee(employee);

      expect(calls.makeAnthropic[0]?.apiKey).toBe('sk-ant-secret-from-keychain');
    });

    it('rejects when no provider is configured at all', async () => {
      providers.set(ANTHROPIC_ROW, false);
      // No ollama row at all

      const employee = makeEmployee({ providerPref: 'anthropic' });
      await expect(factory.resolveForEmployee(employee)).rejects.toThrow(/no configured provider/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Privacy-tier enforcement
// ---------------------------------------------------------------------------

describe('privacy-tier enforcement', () => {
  let providers: FakeProvidersService;
  let secrets: FakeSecrets;
  let companies: FakeCompaniesRepo;
  /** Mutable so a test can flip Settings → Privacy between calls. */
  let maxTier: PrivacyTier;

  function makeFactory() {
    return createProviderFactory({
      providersService: providers,
      secretsStore: secrets,
      companiesRepo: companies,
      getMaxPrivacyTier: () => maxTier,
    });
  }

  beforeEach(() => {
    calls.makeAnthropic.length = 0;
    calls.makeOllama.length = 0;
    calls.embedded.length = 0;
    providers = new FakeProvidersService();
    secrets = new FakeSecrets();
    companies = new FakeCompaniesRepo();
    maxTier = 'local';
    providers.set(ANTHROPIC_ROW);
    providers.set(OLLAMA_ROW);
    secrets.set('anthropic', 'sk-ant');
  });

  describe('create', () => {
    it('refuses a proprietary-cloud provider under Local Only with a typed, actionable error', async () => {
      const attempt = makeFactory().create({ providerId: 'anthropic', model: 'claude-haiku-4-5' });

      await expect(attempt).rejects.toBeInstanceOf(PrivacyTierViolationError);
      await expect(attempt).rejects.toThrow(
        'Provider "Anthropic (claude-haiku-4-5)" is Proprietary Cloud-tier, but Settings → Privacy allows Local Only. Choose a local provider (Ollama) or raise the privacy tier.',
      );
      // Refused before the adapter is built — no client, no key handed out.
      expect(calls.makeAnthropic).toEqual([]);
    });

    it('carries the refused provider + tiers on the error for callers that branch on it', async () => {
      const err = await makeFactory()
        .create({ providerId: 'anthropic', model: 'claude-haiku-4-5' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PrivacyTierViolationError);
      expect(err).toMatchObject({
        name: 'PrivacyTierViolationError',
        providerId: 'anthropic',
        providerName: 'Anthropic',
        providerTier: 'proprietary-cloud',
        maxTier: 'local',
      });
    });

    it('allows a local provider under Local Only', async () => {
      const resolved = await makeFactory().create({
        providerId: 'ollama-local',
        model: 'qwen2.5:3b',
      });

      expect(resolved.providerName).toBe('ollama-local');
      expect(calls.makeOllama).toHaveLength(1);
    });

    it('allows a proprietary-cloud provider when the tier allows all providers', async () => {
      maxTier = 'proprietary-cloud';

      const resolved = await makeFactory().create({
        providerId: 'anthropic',
        model: 'claude-haiku-4-5',
      });

      expect(resolved.providerName).toBe('anthropic');
      expect(calls.makeAnthropic).toHaveLength(1);
    });

    it('ranks by the provider row tier: Open-Source Cloud admits an open-source row, refuses proprietary', async () => {
      maxTier = 'open-source-cloud';
      providers.set({
        ...OLLAMA_ROW,
        id: 'ollama-remote',
        name: 'Ollama (Remote)',
        privacyTier: 'open-source-cloud',
      });
      const factory = makeFactory();

      await expect(
        factory.create({ providerId: 'ollama-remote', model: 'llama3.1:8b' }),
      ).resolves.toMatchObject({
        providerName: 'ollama-remote',
      });
      await expect(
        factory.create({ providerId: 'anthropic', model: 'claude-haiku-4-5' }),
      ).rejects.toThrow(/allows Open-Source Cloud\. Choose a local or open-source cloud provider/);
    });

    it('fails closed on a provider row with an unrecognised privacy tier', async () => {
      maxTier = 'open-source-cloud';
      providers.set({
        ...OLLAMA_ROW,
        id: 'mystery',
        name: 'Mystery',
        privacyTier: 'somewhere' as PrivacyTier,
      });

      await expect(
        makeFactory().create({ providerId: 'mystery', model: 'm' }),
      ).rejects.toBeInstanceOf(PrivacyTierViolationError);
      expect(calls.makeOllama).toEqual([]);
    });
  });

  describe('resolveForEmployee', () => {
    it('refuses when the resolved provider is cloud under Local Only, pointing at the employee', async () => {
      const attempt = makeFactory().resolveForEmployee(
        makeEmployee({ providerPref: 'anthropic', modelPref: 'claude-haiku-4-5' }),
      );

      await expect(attempt).rejects.toBeInstanceOf(PrivacyTierViolationError);
      await expect(attempt).rejects.toThrow(
        'Provider "Anthropic (claude-haiku-4-5)" is Proprietary Cloud-tier, but Settings → Privacy allows Local Only. Choose a local provider (Ollama) for this employee or raise the privacy tier.',
      );
      expect(calls.makeAnthropic).toEqual([]);
    });

    it('allows an employee bound to a local provider under Local Only', async () => {
      const resolved = await makeFactory().resolveForEmployee(
        makeEmployee({ providerPref: 'ollama-local', modelPref: 'qwen2.5:3b' }),
      );

      expect(resolved.providerName).toBe('ollama-local');
      expect(calls.makeOllama).toHaveLength(1);
    });

    it('allows the cloud provider when the tier allows it', async () => {
      maxTier = 'proprietary-cloud';

      const resolved = await makeFactory().resolveForEmployee(
        makeEmployee({ providerPref: 'anthropic' }),
      );

      expect(resolved.providerName).toBe('anthropic');
    });

    it('reads the max tier at call time, so a Settings change applies to the next run', async () => {
      const factory = makeFactory();
      const employee = makeEmployee({ providerPref: 'anthropic' });

      maxTier = 'proprietary-cloud';
      await expect(factory.resolveForEmployee(employee)).resolves.toMatchObject({
        providerName: 'anthropic',
      });

      maxTier = 'local';
      await expect(factory.resolveForEmployee(employee)).rejects.toBeInstanceOf(
        PrivacyTierViolationError,
      );

      maxTier = 'proprietary-cloud';
      await expect(factory.resolveForEmployee(employee)).resolves.toMatchObject({
        providerName: 'anthropic',
      });
    });

    it('keeps today’s behaviour when no tier getter is injected', async () => {
      const factory = createProviderFactory({
        providersService: providers,
        secretsStore: secrets,
        companiesRepo: companies,
      });

      await expect(
        factory.resolveForEmployee(makeEmployee({ providerPref: 'anthropic' })),
      ).resolves.toMatchObject({ providerName: 'anthropic' });
      await expect(factory.create({ providerId: 'anthropic' })).resolves.toMatchObject({
        providerName: 'anthropic',
      });
    });
  });

  describe('buildEmbedAdapter', () => {
    const OPENAI_ROW: ProviderConfig = {
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      privacyTier: 'proprietary-cloud',
      enabled: true,
    };

    beforeEach(() => {
      providers.set(OPENAI_ROW);
      secrets.set('openai', 'sk-openai');
    });

    function build(provider: string, withGetter = true) {
      return buildEmbedAdapter({
        provider,
        model: provider === 'openai' ? 'text-embedding-3-small' : 'nomic-embed-text',
        dimension: 4,
        providersService: providers,
        secretsStore: secrets,
        ...(withGetter ? { getMaxPrivacyTier: () => maxTier } : {}),
      });
    }

    it('refuses to embed through a cloud provider under Local Only — no text leaves the process', async () => {
      const adapter = await build('openai');
      expect(adapter).not.toBeNull();

      const attempt = adapter?.embed(['confidential board memo']);
      await expect(attempt).rejects.toBeInstanceOf(PrivacyTierViolationError);
      await expect(attempt).rejects.toThrow(
        'Embedding provider "OpenAI (text-embedding-3-small)" is Proprietary Cloud-tier, but Settings → Privacy allows Local Only. Choose a local provider (Ollama) in Settings → Retrieval or raise the privacy tier.',
      );
      expect(calls.embedded).toEqual([]);
    });

    it('embeds through a local provider under Local Only', async () => {
      const adapter = await build('ollama-local');

      await expect(adapter?.embed(['hello'])).resolves.toHaveLength(1);
      expect(calls.embedded).toEqual([{ adapter: 'ollama', texts: ['hello'] }]);
    });

    it('preserves the inner adapter model + dimension on the guarded adapter', async () => {
      const adapter = await build('openai');

      expect(adapter?.model).toBe('text-embedding-3-small');
      expect(adapter?.dimension).toBe(4);
    });

    it('reads the max tier per embed call, so a long-lived adapter honours a Settings change', async () => {
      maxTier = 'proprietary-cloud';
      const adapter = await build('openai');

      await expect(adapter?.embed(['a'])).resolves.toHaveLength(1);
      maxTier = 'local';
      await expect(adapter?.embed(['b'])).rejects.toBeInstanceOf(PrivacyTierViolationError);
      expect(calls.embedded).toEqual([{ adapter: 'openai', texts: ['a'] }]);
    });

    it('keeps today’s behaviour when no tier getter is passed', async () => {
      const adapter = await build('openai', false);

      await expect(adapter?.embed(['x'])).resolves.toHaveLength(1);
      expect(calls.embedded).toEqual([{ adapter: 'openai', texts: ['x'] }]);
    });
  });
});
