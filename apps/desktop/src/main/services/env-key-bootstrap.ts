/**
 * Dev-only convenience: transfer an `ANTHROPIC_API_KEY` from a gitignored
 * `apps/desktop/.env` file into the OS keychain on boot, but ONLY if the
 * keychain has no existing key for the `anthropic` provider.
 *
 * Why this exists: keytar is the single source of truth for credentials
 * (per the design doc — see T24), but forcing a developer through the
 * Settings UI (T37+) on every fresh clone would make `pnpm dev` feel
 * ceremonial. A one-time file-based import keeps first-run ergonomics
 * tight without weakening the "no plaintext on disk" posture in any
 * long-lived way: the key is read once, written to the OS keychain, and
 * from then on the orchestrator gets it from keytar like every other boot.
 *
 * Security invariants this function enforces:
 *
 * 1. **Dev-only.** Returns immediately in packaged / production builds.
 *    Production users MUST go through the Settings UI.
 * 2. **Never overwrites.** If keytar already has a key for the anthropic
 *    provider, the .env value is silently ignored — the keychain is the
 *    source of truth the moment it has been populated.
 * 3. **No process.env pollution.** Uses dotenv's `processEnv: {}` option
 *    so the parsed values land in a throwaway object and never leak into
 *    `process.env`, where a later `console.log(process.env)` or an error
 *    report could exfiltrate them.
 * 4. **Never logs the key value.** The confirmation log line states only
 *    that a key was imported; the value itself is never formatted into
 *    any string.
 * 5. **Idempotent + safe to call every boot.** Missing file, missing env
 *    var, empty/whitespace value, and already-populated keychain all
 *    result in a silent no-op.
 *
 * The function is written to be fully unit-testable: `envFilePath`,
 * `isDev`, and `secrets` are all injectable so tests can drive the full
 * code path without needing a real electron `app.isPackaged` or a real
 * filesystem path relative to the compiled main bundle.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadDotenv } from 'dotenv';

import { DEFAULT_ANTHROPIC_ID } from './providers.js';
import { SecretsStore } from './secrets.js';

/**
 * Options for `bootstrapEnvKeys`. Every field has a production-ready
 * default, so calling `bootstrapEnvKeys()` with no argument from
 * `main/index.ts` Just Works. Tests override each field individually.
 */
export interface BootstrapEnvKeysOptions {
  /**
   * Absolute path to the `.env` file to read. Defaults to
   * `apps/desktop/.env` resolved relative to the compiled main bundle
   * (`out/main/index.js` → two parents up to `apps/desktop/`).
   */
  envFilePath?: string;

  /**
   * Whether we are running in a dev build. Defaults to
   * `process.env.NODE_ENV !== 'production'` — true under `pnpm dev` and
   * false under packaged `electron-builder` builds where NODE_ENV is set
   * to 'production' by the electron-vite build output.
   */
  isDev?: boolean;

  /**
   * Secrets store to write the imported key into. Defaults to a fresh
   * `new SecretsStore()`. Tests inject a SecretsStore that wraps the
   * Map-backed keytar mock.
   */
  secrets?: SecretsStore;
}

/**
 * Default location of the `.env` file at runtime.
 *
 * At runtime the compiled main bundle lives at
 * `apps/desktop/out/main/index.js`, so two parents up resolves to
 * `apps/desktop/`, which is where the gitignored `.env` sits alongside
 * the checked-in `.env.example`.
 */
function defaultEnvFilePath(): string {
  return join(__dirname, '../../.env');
}

/**
 * Transfer an `ANTHROPIC_API_KEY` from a `.env` file into the OS keychain
 * iff all of the following hold:
 *
 *   - we are running in dev (`isDev === true`),
 *   - the `.env` file exists on disk,
 *   - it parses cleanly,
 *   - it contains a non-empty, non-whitespace `ANTHROPIC_API_KEY` value,
 *   - the keychain does not already have a key for `DEFAULT_ANTHROPIC_ID`.
 *
 * Any check that fails short-circuits the function with a silent return.
 * Successful imports log a single line confirming the import (without
 * the value).
 */
export async function bootstrapEnvKeys(options: BootstrapEnvKeysOptions = {}): Promise<void> {
  const isDev = options.isDev ?? process.env.NODE_ENV !== 'production';
  if (!isDev) return;

  const envFilePath = options.envFilePath ?? defaultEnvFilePath();
  if (!existsSync(envFilePath)) return;

  // Parse into a local object so the values NEVER land in process.env.
  // `processEnv: {}` tells dotenv to populate the supplied object instead
  // of mutating the real process environment. This is critical: once a
  // key is in process.env, any stray `console.log(process.env)` or
  // crash-reporter dump would leak it.
  const isolatedEnv: Record<string, string> = {};
  const result = loadDotenv({ path: envFilePath, processEnv: isolatedEnv });
  if (result.error || !result.parsed) return;

  const rawKey = isolatedEnv.ANTHROPIC_API_KEY;
  if (typeof rawKey !== 'string') return;
  const trimmedKey = rawKey.trim();
  if (trimmedKey.length === 0) return;

  const secrets = options.secrets ?? new SecretsStore();
  const existing = await secrets.getApiKey(DEFAULT_ANTHROPIC_ID);
  if (existing !== null) return; // keychain wins — never overwrite

  await secrets.setApiKey(DEFAULT_ANTHROPIC_ID, trimmedKey);
  // Log WITHOUT the value. The file path is safe to log — it's the same
  // path the user just configured — but the key itself never hits any
  // log stream, not even a truncated prefix.
  console.log(`[env-keys] imported ANTHROPIC_API_KEY from ${envFilePath} into OS keychain`);
}
