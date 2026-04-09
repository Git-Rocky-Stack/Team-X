import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * In-memory stand-in for the OS keychain. The real keytar module is a native
 * binding that talks to Windows Credential Manager / macOS Keychain / libsecret
 * and is intentionally not loaded under Vitest: (a) it would require an
 * Electron-ABI binary that Node cannot dlopen, and (b) unit tests must never
 * touch the host's real credential store. Entries are keyed as
 * `${service}:${account}` so assertions can introspect the exact composite
 * account key the production code writes.
 */
const store = new Map<string, string>();

/**
 * The factory returns top-level named functions — NOT a `{ default: { ... } }`
 * wrapper — to match keytar's real module shape: `keytar.d.ts` declares
 * `export declare function getPassword/...` with no default export, and
 * production code uses `import * as keytar from 'keytar'` so the namespace
 * object is the module itself.
 */
vi.mock('keytar', () => ({
  getPassword: async (service: string, account: string): Promise<string | null> =>
    store.get(`${service}:${account}`) ?? null,
  setPassword: async (service: string, account: string, password: string): Promise<void> => {
    store.set(`${service}:${account}`, password);
  },
  deletePassword: async (service: string, account: string): Promise<boolean> =>
    store.delete(`${service}:${account}`),
}));

// Import AFTER vi.mock so the module under test receives the mocked keytar.
// (vi.mock is hoisted by Vitest so the ordering here is cosmetic, but the
// explicit comment makes the TDD intent visible at a glance.)
import { SecretsStore } from './secrets.js';

describe('SecretsStore', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('getApiKey', () => {
    it('returns null for a provider with no stored key', async () => {
      const secrets = new SecretsStore();
      expect(await secrets.getApiKey('openai')).toBeNull();
    });

    it('returns the stored key after setApiKey', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('anthropic', 'sk-ant-test-123');
      expect(await secrets.getApiKey('anthropic')).toBe('sk-ant-test-123');
    });

    it('throws a descriptive error when providerId is empty', async () => {
      const secrets = new SecretsStore();
      await expect(secrets.getApiKey('')).rejects.toThrow(/providerId is required/);
    });
  });

  describe('setApiKey', () => {
    it('persists the key under a deterministic "team-x" service + "provider:<id>" account', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('anthropic', 'sk-ant-live');
      // Contract: the store keys the value under service="team-x",
      // account="provider:anthropic". This namespacing reserves "provider:"
      // for LLM provider keys and leaves room for future namespaces
      // (e.g. "mcp:<server>") without collision.
      expect(store.get('team-x:provider:anthropic')).toBe('sk-ant-live');
    });

    it('overwrites an existing key for the same provider', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('groq', 'sk-first');
      await secrets.setApiKey('groq', 'sk-second');
      expect(await secrets.getApiKey('groq')).toBe('sk-second');
    });

    it('keeps keys for different providers isolated from each other', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('anthropic', 'sk-ant');
      await secrets.setApiKey('openai', 'sk-oai');
      expect(await secrets.getApiKey('anthropic')).toBe('sk-ant');
      expect(await secrets.getApiKey('openai')).toBe('sk-oai');
    });

    it('throws a descriptive error when providerId is empty (keytar does not catch this)', async () => {
      // Without the assertProviderId guard, `providerAccount('')` returns
      // `"provider:"` — which is non-empty, so keytar's own `checkRequired`
      // would NOT catch it and the garbage key would silently land under
      // account=`provider:` in the real keychain.
      const secrets = new SecretsStore();
      await expect(secrets.setApiKey('', 'sk-should-never-store')).rejects.toThrow(
        /providerId is required/,
      );
    });

    it('does not leak the empty-providerId misuse into the store', async () => {
      const secrets = new SecretsStore();
      await expect(secrets.setApiKey('', 'sk-should-never-store')).rejects.toThrow();
      // Nothing should have been written to the mock store.
      expect(store.size).toBe(0);
    });
  });

  describe('deleteApiKey', () => {
    it('removes the key and returns true when a key existed', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('together', 'sk-tog');
      await expect(secrets.deleteApiKey('together')).resolves.toBe(true);
      expect(await secrets.getApiKey('together')).toBeNull();
    });

    it('returns false when deleting a provider with no stored key (idempotent)', async () => {
      const secrets = new SecretsStore();
      await expect(secrets.deleteApiKey('fireworks')).resolves.toBe(false);
    });

    it('only deletes the targeted provider, leaving others untouched', async () => {
      const secrets = new SecretsStore();
      await secrets.setApiKey('anthropic', 'sk-ant');
      await secrets.setApiKey('openai', 'sk-oai');
      await expect(secrets.deleteApiKey('anthropic')).resolves.toBe(true);
      expect(await secrets.getApiKey('anthropic')).toBeNull();
      expect(await secrets.getApiKey('openai')).toBe('sk-oai');
    });

    it('throws a descriptive error when providerId is empty', async () => {
      const secrets = new SecretsStore();
      await expect(secrets.deleteApiKey('')).rejects.toThrow(/providerId is required/);
    });
  });
});
