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
 * Namespace helper for remote-endpoint auth-header account keys.
 *
 * `local_model_endpoints.auth_header_key_ref` persists a reference, never the
 * secret; the value lives here under `endpoint:<keyRef>`. The distinct prefix
 * is what keeps an endpoint named `openai` from reading the `openai` provider
 * key — the two namespaces cannot collide.
 */
function endpointAccount(keyRef: string): string {
  return `endpoint:${keyRef}`;
}

/**
 * Namespace helper for Hugging Face token account keys.
 *
 * `LocalGgufRuntimeSettings.hfTokenKeyRef` names the entry; the token itself
 * lives here under `hf:<keyRef>`, disjoint from `provider:` and `endpoint:`.
 */
function hfAccount(keyRef: string): string {
  return `hf:${keyRef}`;
}

/**
 * Guard against empty / whitespace-only key references.
 *
 * Same failure mode as {@link assertProviderId}: `endpointAccount('')` yields
 * the non-empty string `"endpoint:"`, which slips past keytar's own required
 * check and would silently store every ref-less endpoint's header under one
 * shared account. `hfAccount('')` has the identical problem, so both
 * namespaces share this guard.
 */
function assertKeyRef(keyRef: string): void {
  if (!keyRef || keyRef.trim().length === 0) {
    throw new Error('[secrets] keyRef is required and must be non-empty.');
  }
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
 * Three namespaces exist today: `provider:<id>` for LLM API keys,
 * `endpoint:<keyRef>` for remote GGUF endpoint auth headers, and
 * `hf:<keyRef>` for Hugging Face access tokens. Additional
 * secret types (MCP server tokens, backup passphrases, etc.) extend this
 * class with their own namespaced accessors following the same
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

  /**
   * Look up the auth-header value for a remote GGUF endpoint.
   *
   * The stored secret is the complete `Authorization` header value — e.g.
   * `"Bearer lan-token-123"` — not a bare token, so the caller sends it
   * verbatim and this class never has to guess a scheme.
   *
   * @param keyRef - The endpoint row's `authHeaderKeyRef`.
   * @returns the stored header value, or `null` if none is configured.
   * @throws if `keyRef` is empty or whitespace-only.
   */
  async getEndpointAuthHeader(keyRef: string): Promise<string | null> {
    assertKeyRef(keyRef);
    return keytar.getPassword(SERVICE, endpointAccount(keyRef));
  }

  /**
   * Store or replace the auth-header value for a remote GGUF endpoint.
   * Always overwrites any existing value for the same `keyRef`.
   *
   * @param keyRef - The endpoint row's `authHeaderKeyRef`.
   * @param headerValue - The complete header value to send.
   * @throws if `keyRef` is empty or whitespace-only, or if `headerValue` is
   *   empty (keytar's own required check).
   */
  async setEndpointAuthHeader(keyRef: string, headerValue: string): Promise<void> {
    assertKeyRef(keyRef);
    await keytar.setPassword(SERVICE, endpointAccount(keyRef), headerValue);
  }

  /**
   * Remove the auth-header value for a remote GGUF endpoint. Safe to call
   * when nothing is stored — acts as an idempotent "ensure absent".
   *
   * @param keyRef - The endpoint row's `authHeaderKeyRef`.
   * @returns `true` if a value existed and was removed, `false` otherwise.
   * @throws if `keyRef` is empty or whitespace-only.
   */
  async deleteEndpointAuthHeader(keyRef: string): Promise<boolean> {
    assertKeyRef(keyRef);
    return keytar.deletePassword(SERVICE, endpointAccount(keyRef));
  }

  /**
   * Look up the Hugging Face access token behind a settings key reference.
   *
   * Used by the `localGguf.hf.*` channels for gated repositories and for the
   * higher authenticated rate limit. Anonymous browsing works without one, so
   * `null` is a normal result, not an error.
   *
   * @param keyRef - `LocalGgufRuntimeSettings.hfTokenKeyRef`.
   * @throws if `keyRef` is empty or whitespace-only.
   */
  async getHfToken(keyRef: string): Promise<string | null> {
    assertKeyRef(keyRef);
    return keytar.getPassword(SERVICE, hfAccount(keyRef));
  }

  /**
   * Store or replace a Hugging Face access token.
   *
   * @param keyRef - `LocalGgufRuntimeSettings.hfTokenKeyRef`.
   * @param token - The raw `hf_...` token.
   * @throws if `keyRef` is empty or whitespace-only, or if `token` is empty.
   */
  async setHfToken(keyRef: string, token: string): Promise<void> {
    assertKeyRef(keyRef);
    await keytar.setPassword(SERVICE, hfAccount(keyRef), token);
  }

  /**
   * Remove a Hugging Face access token. Idempotent.
   *
   * @param keyRef - `LocalGgufRuntimeSettings.hfTokenKeyRef`.
   * @returns `true` if a token existed and was removed, `false` otherwise.
   * @throws if `keyRef` is empty or whitespace-only.
   */
  async deleteHfToken(keyRef: string): Promise<boolean> {
    assertKeyRef(keyRef);
    return keytar.deletePassword(SERVICE, hfAccount(keyRef));
  }
}
