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
 * Mapping from `.env` variable names to provider ids in the keychain.
 * Each entry represents one potential env-to-keychain import. The
 * provider id must match a seeded row in the `providers` table.
 */
const ENV_KEY_MAP: ReadonlyArray<{ envVar: string; providerId: string }> = [
  { envVar: 'ANTHROPIC_API_KEY', providerId: DEFAULT_ANTHROPIC_ID },
  { envVar: 'OPENAI_API_KEY', providerId: 'openai' },
  { envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', providerId: 'google' },
  { envVar: 'GROQ_API_KEY', providerId: 'groq' },
  { envVar: 'OPENROUTER_API_KEY', providerId: 'openrouter' },
  { envVar: 'TOGETHER_API_KEY', providerId: 'together' },
  { envVar: 'FIREWORKS_API_KEY', providerId: 'fireworks' },
];

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
 * Transfer API keys from a `.env` file into the OS keychain for every
 * provider in `ENV_KEY_MAP`. For each entry, the import happens iff:
 *
 *   - we are running in dev (`isDev === true`),
 *   - the `.env` file exists on disk and parses cleanly,
 *   - it contains a non-empty, non-whitespace value for the env var,
 *   - the keychain does not already have a key for that provider.
 *
 * Any check that fails for a given entry is silently skipped — the
 * remaining entries still run. Successful imports log a single line
 * per key (without the value).
 */
export async function bootstrapEnvKeys(options: BootstrapEnvKeysOptions = {}): Promise<void> {
  const isDev = options.isDev ?? process.env.NODE_ENV !== 'production';
  if (!isDev) return;

  const envFilePath = options.envFilePath ?? defaultEnvFilePath();
  if (!existsSync(envFilePath)) return;

  const isolatedEnv: Record<string, string> = {};
  const result = loadDotenv({ path: envFilePath, processEnv: isolatedEnv });
  if (result.error || !result.parsed) return;

  const secrets = options.secrets ?? new SecretsStore();

  for (const { envVar, providerId } of ENV_KEY_MAP) {
    const rawKey = isolatedEnv[envVar];
    if (typeof rawKey !== 'string') continue;
    const trimmedKey = rawKey.trim();
    if (trimmedKey.length === 0) continue;

    const existing = await secrets.getApiKey(providerId);
    if (existing !== null) continue;

    await secrets.setApiKey(providerId, trimmedKey);
    console.log(`[env-keys] imported ${envVar} from ${envFilePath} into OS keychain`);
  }
}
