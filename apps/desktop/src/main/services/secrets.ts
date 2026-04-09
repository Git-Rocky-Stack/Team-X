// Canonical namespace import for CJS modules whose `.d.ts` declares only
// named exports (`export declare function ...`). keytar has no `default`
// export in its types, so `import keytar from 'keytar'` would compile only
// under `esModuleInterop` + `allowSyntheticDefaultImports` — a fragile
// implicit dependency on tsconfig flags. The namespace form is stable under
// every sane tsconfig and matches how the types are actually declared.
import * as keytar from 'keytar';

/**
 * Service name under which all Team-X secrets are stored in the OS keychain.
 *
 * - **Windows:** `team-x` in Windows Credential Manager (Generic Credentials)
 * - **macOS:**   `team-x` in Keychain Access (Passwords)
 * - **Linux:**   `team-x` via libsecret / Secret Service API
 *
 * Changing this constant invalidates every previously stored secret across
 * the user base, so treat it as a public contract. If it ever needs to
 * change, the release must ship a migration that reads under the old name
 * and writes under the new one before deleting the old entries.
 */
const SERVICE = 'team-x';

/**
 * Namespace helper for LLM-provider API-key account keys.
 *
 * All provider keys live under `provider:<providerId>` so the `provider:`
 * prefix stays reserved for LLM credentials. Future secret categories —
 * for example `mcp:<server>` for MCP server tokens (Phase 2) or
 * `backup:passphrase` for backup encryption (Phase 4) — can sit alongside
 * it without any risk of collision.
 */
function providerAccount(providerId: string): string {
  return `provider:${providerId}`;
}

/**
 * Guard against empty / whitespace-only provider ids.
 *
 * keytar has its own `checkRequired` that throws on empty service or
 * account strings, but the `provider:` prefix means `providerAccount('')`
 * returns the non-empty string `"provider:"` — which slips past keytar's
 * guard and silently stores keys under a garbage account. We catch it here
 * so callers get a descriptive, Team-X-scoped error instead of either a
 * cryptic keytar message or a silent corruption.
 */
function assertProviderId(providerId: string): void {
  if (!providerId || providerId.trim().length === 0) {
    throw new Error('[secrets] providerId is required and must be non-empty.');
  }
}

/**
 * Thin, stateless wrapper around `keytar` for Team-X's secrets.
 *
 * The class is intentionally minimal: every API-key accessor is a single
 * call into `keytar`, and no state is cached in memory — the OS keychain
 * is the one source of truth. This keeps the surface area trivially
 * auditable and makes the class safe to instantiate ad-hoc from any
 * main-process caller.
 *
 * Phase 1 only supports LLM-provider API keys. Additional secret types
 * (MCP server tokens, backup passphrases, etc.) will extend this class in
 * later phases with their own namespaced accessors that follow the same
 * `SERVICE` + namespaced-account pattern.
 *
 * **Security posture:** API keys never hit disk in plaintext. The renderer
 * never touches this class directly — all reads and writes cross the typed
 * IPC bridge so the keychain stays locked to the main process.
 */
export class SecretsStore {
  /**
   * Look up the API key stored for an LLM provider.
   *
   * @param providerId - Registry id of the provider (e.g. `"anthropic"`,
   *   `"openai"`, `"groq"`).
   * @returns the stored key, or `null` if none is configured.
   * @throws if `providerId` is empty or whitespace-only.
   */
  async getApiKey(providerId: string): Promise<string | null> {
    assertProviderId(providerId);
    return keytar.getPassword(SERVICE, providerAccount(providerId));
  }

  /**
   * Store or replace the API key for an LLM provider. Always overwrites any
   * existing value for the same `providerId`.
   *
   * The `key` argument is forwarded to `keytar.setPassword`, which runs its
   * own non-empty check — an empty key therefore throws with keytar's native
   * `"Password is required."` message. We intentionally do not shadow that
   * error since it is already descriptive and scoped to the credential.
   *
   * @param providerId - Registry id of the provider.
   * @param key - The raw API key to store.
   * @throws if `providerId` is empty or whitespace-only, or if `key` is empty.
   */
  async setApiKey(providerId: string, key: string): Promise<void> {
    assertProviderId(providerId);
    await keytar.setPassword(SERVICE, providerAccount(providerId), key);
  }

  /**
   * Remove the API key for an LLM provider. Safe to call when no key is
   * stored — keytar's `deletePassword` returns `false` without throwing,
   * so this method acts as an idempotent "ensure absent".
   *
   * @param providerId - Registry id of the provider.
   * @returns `true` if a key existed and was removed, `false` if no key was
   *   stored for the provider. Callers (e.g. the T25 providers service) can
   *   use this to drive confirmation UI in the renderer.
   * @throws if `providerId` is empty or whitespace-only.
   */
  async deleteApiKey(providerId: string): Promise<boolean> {
    assertProviderId(providerId);
    return keytar.deletePassword(SERVICE, providerAccount(providerId));
  }
}
