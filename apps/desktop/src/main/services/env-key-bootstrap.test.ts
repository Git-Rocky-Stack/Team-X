import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Map-backed keytar mock — same shape as `secrets.test.ts` and
 * `providers.test.ts`. Top-level named exports (no `default:` wrapper) to
 * match the namespace-import pattern in `secrets.ts`.
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

import { bootstrapEnvKeys } from './env-key-bootstrap.js';
import { DEFAULT_ANTHROPIC_ID } from './providers.js';
import { SecretsStore } from './secrets.js';

/**
 * Sentinel env var used to verify that `bootstrapEnvKeys` never leaks the
 * parsed value into `process.env`. If any test sees this key pollute the
 * real process environment, the `processEnv: {}` isolation has regressed
 * and would leak production keys on every boot.
 */
const PROCESS_ENV_SENTINEL = 'ANTHROPIC_API_KEY';

describe('bootstrapEnvKeys', () => {
  let tmpDir: string;
  let envPath: string;
  let secrets: SecretsStore;
  let preservedProcessEnv: string | undefined;

  beforeEach(() => {
    keytarStore.clear();
    tmpDir = mkdtempSync(join(tmpdir(), 'teamx-envbootstrap-'));
    envPath = join(tmpDir, '.env');
    secrets = new SecretsStore();
    preservedProcessEnv = process.env[PROCESS_ENV_SENTINEL];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Restore process.env to pre-test state (paranoia — we're asserting
    // it wasn't touched, but if a future regression does touch it we
    // don't want test bleed to contaminate downstream test files).
    if (preservedProcessEnv === undefined) {
      delete process.env[PROCESS_ENV_SENTINEL];
    } else {
      process.env[PROCESS_ENV_SENTINEL] = preservedProcessEnv;
    }
  });

  it('is a no-op when isDev is false', async () => {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=sk-ant-should-be-ignored\n');
    await bootstrapEnvKeys({ isDev: false, envFilePath: envPath, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBeNull();
  });

  it('is a no-op when the .env file does not exist', async () => {
    const missing = join(tmpDir, 'definitely-not-there.env');
    await bootstrapEnvKeys({ isDev: true, envFilePath: missing, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBeNull();
  });

  it('is a no-op when .env has no ANTHROPIC_API_KEY entry at all', async () => {
    writeFileSync(envPath, 'SOMETHING_ELSE=foo\nOLLAMA_BASE_URL=http://localhost:11434\n');
    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBeNull();
  });

  it('is a no-op when ANTHROPIC_API_KEY is present but empty', async () => {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=\n');
    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBeNull();
  });

  it('is a no-op when ANTHROPIC_API_KEY is whitespace-only', async () => {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY="   "\n');
    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBeNull();
  });

  it('does not overwrite a key that already exists in the keychain', async () => {
    await secrets.setApiKey(DEFAULT_ANTHROPIC_ID, 'sk-ant-existing-real');
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=sk-ant-env-stale\n');
    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });
    // The existing key MUST win. Treat keychain as source of truth; .env
    // is a one-time dev convenience, not an ongoing override mechanism.
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBe('sk-ant-existing-real');
  });

  it('imports the key into the keychain when absent and .env has a value', async () => {
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=sk-ant-fresh-dev\n');
    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBe('sk-ant-fresh-dev');
  });

  it('does not leak the parsed key into process.env', async () => {
    // Make absolutely sure the sentinel is not pre-set from a prior test
    // or the dev environment. This test would silently pass if the env
    // var was already populated, so we assert the clean precondition.
    delete process.env[PROCESS_ENV_SENTINEL];
    writeFileSync(envPath, 'ANTHROPIC_API_KEY=sk-ant-never-in-process-env\n');

    await bootstrapEnvKeys({ isDev: true, envFilePath: envPath, secrets });

    expect(process.env[PROCESS_ENV_SENTINEL]).toBeUndefined();
    // And the import still landed in the keychain mock.
    expect(await secrets.getApiKey(DEFAULT_ANTHROPIC_ID)).toBe('sk-ant-never-in-process-env');
  });
});
