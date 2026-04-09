import keytar from 'keytar';

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
   */
  async getApiKey(providerId: string): Promise<string | null> {
    return keytar.getPassword(SERVICE, providerAccount(providerId));
  }

  /**
   * Store or replace the API key for an LLM provider. Always overwrites any
   * existing value for the same `providerId`.
   *
   * @param providerId - Registry id of the provider.
   * @param key - The raw API key to store. Not validated here; callers are
   *   responsible for basic shape checks before calling.
   */
  async setApiKey(providerId: string, key: string): Promise<void> {
    await keytar.setPassword(SERVICE, providerAccount(providerId), key);
  }

  /**
   * Remove the API key for an LLM provider. Safe to call when no key is
   * stored — `keytar.deletePassword` is a no-op in that case and does not
   * throw, so callers can use this as an idempotent "ensure absent".
   *
   * @param providerId - Registry id of the provider.
   */
  async deleteApiKey(providerId: string): Promise<void> {
    await keytar.deletePassword(SERVICE, providerAccount(providerId));
  }
}
