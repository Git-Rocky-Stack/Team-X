import { beforeEach, describe, expect, it, vi } from 'vitest';

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
 */

const calls = {
  makeAnthropic: [] as Array<{ apiKey: string; model: string; baseURL?: string }>,
  makeOllama: [] as Array<{ model: string; baseURL?: string; headers?: Record<string, string> }>,
};

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
}));

import type { ProviderConfig } from '@team-x/shared-types';

import type { EmployeeRow } from '../db/repos/employees.js';

import { type SecretsReader, createProviderFactory } from './provider-factory.js';
import type { ProvidersService } from './providers.js';

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
  let factory: ReturnType<typeof createProviderFactory>;

  beforeEach(() => {
    calls.makeAnthropic.length = 0;
    calls.makeOllama.length = 0;
    providers = new FakeProvidersService();
    secrets = new FakeSecrets();
    factory = createProviderFactory({ providersService: providers, secretsStore: secrets });
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
