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

/**
 * List the models advertised by an Ollama server.
 *
 * @param baseUrl       The provider base URL. A trailing `/api` is
 *                      stripped before `/api/tags` is appended, so both
 *                      `http://host:11434` and `http://host:11434/api`
 *                      resolve to `http://host:11434/api/tags`.
 * @param defaultModel  The provider's configured default model, if any.
 *                      Always folded into the result on success, and
 *                      returned as the sole suggestion when the server
 *                      is unreachable.
 * @returns             Sorted, de-duplicated model names. Never rejects.
 */
export async function listOllamaModels(
  baseUrl: string,
  defaultModel?: string | null,
): Promise<string[]> {
  const fallback = defaultModel && defaultModel.trim().length > 0 ? [defaultModel.trim()] : [];
  const tagsUrl = `${baseUrl.replace(/\/api$/, '')}/api/tags`;

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
      return fallback;
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };

    const models = new Set<string>();
    for (const row of data.models ?? []) {
      const model =
        typeof row.model === 'string' && row.model.trim().length > 0 ? row.model : row.name;
      if (typeof model === 'string' && model.trim().length > 0) {
        models.add(model.trim());
      }
    }
    if (defaultModel && defaultModel.trim().length > 0) {
      models.add(defaultModel.trim());
    }

    return [...models].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    // "Server not running" (ECONNREFUSED / ENOTFOUND) is an expected,
    // benign state — degrade silently so the main-process log stays clean.
    // Any OTHER failure shape (TLS error, DNS oddity, malformed JSON from a
    // non-Ollama server answering 200) is unexpected and worth surfacing so
    // a genuine misconfiguration is discoverable instead of vanishing.
    const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
    if (code !== 'ECONNREFUSED' && code !== 'ENOTFOUND') {
      console.warn(`[ollama-models] ${tagsUrl} request failed; using fallback model list:`, err);
    }
    return fallback;
  }
}
