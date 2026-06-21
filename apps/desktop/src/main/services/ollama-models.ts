/**
 * Graceful Ollama model lister.
 *
 * Queries an Ollama server's `/api/tags` endpoint and returns the
 * available model names (de-duplicated, sorted, with the configured
 * default folded in). Extracted from the `providers.listModels` IPC
 * handler so the network-I/O-with-graceful-degradation logic can be
 * unit-tested in isolation from the handler dependency graph.
 *
 * Why graceful degradation matters: the renderer's `useProviderModels`
 * query auto-fires when a provider card mounts. When the local Ollama
 * server isn't running — the common case for a user who simply hasn't
 * started it yet — a thrown error here surfaces as
 * `Error occurred in handler for 'providers.listModels': ... ECONNREFUSED`
 * on the main-process stderr for every settings visit. "Ollama isn't
 * running" is an expected, benign state, not an error. This helper
 * therefore mirrors the posture of `providers.testConnection`: an
 * unreachable server (or any fetch/parse failure) yields the configured
 * default model — so the user still sees their own pick as a suggestion
 * — or an empty list, and never throws.
 *
 * Silent vs. surfaced: only the benign "not running" codes
 * (`ECONNREFUSED` / `ENOTFOUND`) degrade silently. A reachable server that
 * rejects the request (auth `401`/`403`, a wrong-port service answering, an
 * upstream `5xx`) or any other unexpected failure shape (TLS error,
 * malformed JSON from a non-Ollama server answering `200`) is `console.warn`
 * -logged before the fallback so a genuine misconfiguration stays
 * discoverable in the main-process log instead of vanishing — unlike the
 * user-initiated `testConnection`, this query auto-fires in the background
 * and is the user's only signal here.
 */

import type { ListProviderModelsResponse } from '@team-x/shared-types';

/**
 * Transport-layer error codes that mean "the Ollama endpoint can't be
 * reached / didn't stay connected" — the benign "not running / not
 * reachable" family. These degrade SILENTLY (no log) because they're an
 * expected state for a user who simply hasn't started Ollama (or whose
 * remote endpoint is momentarily down). On Windows (the primary target) a
 * gone or mid-restart server surfaces `ECONNRESET` / `ECONNABORTED` rather
 * than `ECONNREFUSED`, so the set must cover the whole family or the spam
 * this helper exists to kill creeps back in. `ETIMEDOUT` is treated as
 * benign here: for a non-critical suggestion list it reads the same as
 * "can't reach it right now," and warning on every settings visit to a
 * slow/remote server is exactly the noise we're avoiding. Node/Electron's
 * global `fetch` (Undici) reports an unreachable-host connect timeout as
 * `UND_ERR_CONNECT_TIMEOUT` rather than the libuv `ETIMEDOUT`, so that code is
 * included too. Anything OUTSIDE this set (a reachable-but-rejecting HTTP
 * status, a TLS error, malformed JSON, or an unrecognised failure) is surfaced
 * via `console.warn`.
 */
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED', // nothing listening on the port (Ollama not started)
  'ENOTFOUND', // DNS: host not found
  'ECONNRESET', // peer reset the connection (Ollama crashed/restarted mid-request)
  'ECONNABORTED', // connection aborted (common Windows variant)
  'EHOSTUNREACH', // host unreachable
  'ENETUNREACH', // network unreachable
  'ETIMEDOUT', // connection timed out (libuv)
  'EAI_AGAIN', // DNS temporary failure
  'UND_ERR_CONNECT_TIMEOUT', // Undici (Node/Electron fetch) connect timeout — host unreachable
]);

/**
 * List the models advertised by an Ollama server.
 *
 * @param baseUrl       The provider base URL. A trailing `/api` is
 *                      stripped before `/api/tags` is appended, so both
 *                      `http://host:11434` and `http://host:11434/api`
 *                      resolve to `http://host:11434/api/tags`. A non-string
 *                      or empty value (possible from a malformed persisted
 *                      config) yields a `status:'error'` response without any
 *                      network call — the helper never rejects.
 * @param defaultModel  The provider's configured default model, if any.
 *                      Always folded into the result on success, and
 *                      returned as the sole suggestion when the server
 *                      is unreachable. A non-string value (possible from a
 *                      malformed persisted config) is ignored — the helper
 *                      never rejects.
 * @returns             A listing: `models` (sorted + de-duplicated on
 *                      success, the configured-default fallback otherwise)
 *                      plus `status` ('ok' | 'unreachable' | 'error') and, for
 *                      'error', a `detail` — so the renderer can surface a
 *                      genuine server failure rather than silently presenting
 *                      the default as detected. Never rejects.
 */
export async function listOllamaModels(
  baseUrl: string,
  defaultModel?: string | null,
): Promise<ListProviderModelsResponse> {
  // Normalise the configured default ONCE, behind a runtime `typeof` guard.
  // `defaultModel` is typed `string | null`, but it originates from a parsed
  // `configJson` blob, so a malformed persisted config can hand us a non-string
  // at runtime. Calling `.trim()` on that would throw a TypeError here — before
  // the try block — and reject `providers.listModels`, breaking this helper's
  // "never rejects" contract. Guarding the type keeps the contract whole and
  // folds the trimming de-dup into one place.
  const trimmedDefault =
    typeof defaultModel === 'string' && defaultModel.trim().length > 0
      ? defaultModel.trim()
      : undefined;
  const fallback = trimmedDefault ? [trimmedDefault] : [];

  // Validate `baseUrl` behind the same runtime guard as `defaultModel` above:
  // it also originates from a parsed `configJson` blob, so a malformed/
  // hand-edited config can hand us a non-string (or empty) value at runtime.
  // Building the /api/tags URL via String.prototype.replace on that throws a
  // TypeError HERE — before the try block — and rejects `providers.listModels`,
  // breaking the "never rejects" contract. A bad base URL is a real, surfaced
  // misconfiguration, so warn + report 'error' without ever reaching fetch.
  const trimmedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (trimmedBaseUrl.length === 0) {
    console.warn('[ollama-models] invalid/empty provider base URL; using fallback model list');
    return { models: fallback, status: 'error', detail: 'Invalid Ollama base URL' };
  }
  const tagsUrl = `${trimmedBaseUrl.replace(/\/api$/, '')}/api/tags`;

  try {
    const response = await fetch(tagsUrl, { method: 'GET' });
    if (!response.ok) {
      // Server reachable but rejecting the request (auth 401/403, a
      // wrong-port service answering, an upstream 5xx) is a real
      // misconfiguration — not the benign "not running" case — so surface
      // it before degrading to the fallback rather than failing silently.
      console.warn(
        `[ollama-models] ${tagsUrl} returned HTTP ${response.status}; using fallback model list`,
      );
      return { models: fallback, status: 'error', detail: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };

    // A genuine Ollama /api/tags response always carries a `models` ARRAY
    // (empty when nothing has been pulled yet). A 200 whose JSON parses but
    // lacks that array is not Ollama — e.g. a wrong-port service answering 200.
    // Coercing the missing field to [] and folding the configured default in
    // would report 'ok' and present that default as a "detected" model, hiding
    // the misconfiguration the status contract exists to surface — so treat an
    // absent/non-array `models` as a reachable-but-wrong server (status error).
    if (!Array.isArray(data.models)) {
      console.warn(
        `[ollama-models] ${tagsUrl} returned 200 without a models array; using fallback model list`,
      );
      return {
        models: fallback,
        status: 'error',
        detail: 'Unexpected response shape from /api/tags',
      };
    }

    const models = new Set<string>();
    for (const row of data.models) {
      const model =
        typeof row.model === 'string' && row.model.trim().length > 0 ? row.model : row.name;
      if (typeof model === 'string' && model.trim().length > 0) {
        models.add(model.trim());
      }
    }
    if (trimmedDefault) {
      models.add(trimmedDefault);
    }

    return { models: [...models].sort((a, b) => a.localeCompare(b)), status: 'ok' };
  } catch (err) {
    // Degrade silently only for the "can't reach the server" family
    // (UNREACHABLE_CODES) — a benign not-running/connectivity state. Every
    // other failure — a TLS error, malformed JSON from a non-Ollama server
    // answering 200 (a SyntaxError with no `cause.code`), or any unrecognised
    // shape — is a reachable-but-broken server: surfaced via `console.warn`
    // AND reported as status 'error' so the renderer can show it instead of
    // silently presenting the default as a detected model.
    const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
    if (code && UNREACHABLE_CODES.has(code)) {
      return { models: fallback, status: 'unreachable' };
    }
    console.warn(`[ollama-models] ${tagsUrl} request failed; using fallback model list:`, err);
    return {
      models: fallback,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
