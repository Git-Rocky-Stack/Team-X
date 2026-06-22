/**
 * Unit tests for `listOllamaModels` — the graceful Ollama `/api/tags`
 * model lister extracted from the `providers.listModels` IPC handler.
 *
 * Regression context (Phase 4a non-blocker cleanup): the handler used
 * to `fetch` Ollama and THROW on a connection failure. With no local
 * Ollama running — the common case — the renderer's `useProviderModels`
 * query (auto-fired on provider-card mount) rejected and Electron logged
 * `Error occurred in handler for 'providers.listModels': ... ECONNREFUSED`
 * to the main-process stderr on every settings visit. These tests pin
 * the graceful posture: success returns sorted/deduped models with
 * `status: 'ok'`; an unreachable server returns the configured default
 * (or empty) with `status: 'unreachable'` and never throws; a reachable
 * server that rejects (auth/5xx/TLS/malformed) returns the fallback with
 * `status: 'error'` + a `detail` so the renderer can surface it instead of
 * silently presenting the default as a detected model.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listOllamaModels } from './ollama-models.js';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Suppress (and capture) the helper's warn-on-real-failure output so the
  // suite stays quiet and each test can assert warn / no-warn precisely.
  warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(impl: (url: string) => Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => impl(String(input))),
  );
}

describe('listOllamaModels', () => {
  it('derives the /api/tags URL by stripping a trailing /api from the base URL', async () => {
    const seen: string[] = [];
    stubFetch(async (url) => {
      seen.push(url);
      return new Response(JSON.stringify({ models: [{ model: 'qwen2.5:3b' }] }), { status: 200 });
    });

    await listOllamaModels('http://localhost:11434/api');

    expect(seen).toEqual(['http://localhost:11434/api/tags']);
  });

  it('appends /api/tags when the base URL has no /api suffix', async () => {
    const seen: string[] = [];
    stubFetch(async (url) => {
      seen.push(url);
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    });

    await listOllamaModels('http://10.0.0.5:11434');

    expect(seen).toEqual(['http://10.0.0.5:11434/api/tags']);
  });

  it('returns sorted, de-duplicated model names with the default folded in (status ok)', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            models: [{ model: 'llama3.1:8b' }, { name: 'qwen2.5:3b' }, { model: 'llama3.1:8b' }],
          }),
          { status: 200 },
        ),
    );

    const result = await listOllamaModels('http://localhost:11434/api', 'phi3:mini');

    expect(result.models).toEqual(['llama3.1:8b', 'phi3:mini', 'qwen2.5:3b']);
    expect(result.status).toBe('ok');
  });

  it('prefers row.model over row.name and trims whitespace (status ok)', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            models: [{ model: '  spaced:1b  ', name: 'ignored' }, { name: 'bare:2b' }],
          }),
          { status: 200 },
        ),
    );

    const result = await listOllamaModels('http://localhost:11434/api');

    expect(result.models).toEqual(['bare:2b', 'spaced:1b']);
    expect(result.status).toBe('ok');
  });

  it('degrades to the configured default model when Ollama is unreachable (ECONNREFUSED)', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('unreachable');
    // "Server not running" is benign — it must NOT spam the main-process log.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns an empty list (never throws) when unreachable (ENOTFOUND) and no default is configured', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    });

    const result = await listOllamaModels('http://localhost:11434/api');

    expect(result.models).toEqual([]);
    expect(result.status).toBe('unreachable');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('reports status error + detail (but still degrades) when Ollama answers a non-OK HTTP status', async () => {
    stubFetch(async () => new Response('upstream boom', { status: 500 }));

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    // A reachable-but-rejecting server (auth/wrong-port/5xx) is a real
    // misconfiguration the user must be able to discover — surface it.
    expect(result.status).toBe('error');
    expect(result.detail).toBe('HTTP 500');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('500');
  });

  it('reports status error (but still degrades) on a reachable-but-broken transport error (TLS / EPROTO)', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('certificate has expired'), { cause: { code: 'EPROTO' } });
    });

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('error');
    expect(result.detail).toBe('certificate has expired');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('/api/tags');
  });

  it('reports status error on malformed JSON from a 200 response (SyntaxError, no errno)', async () => {
    // A non-Ollama service answering 200 with a non-JSON body: response.ok is
    // true, so the helper reaches response.json(), which throws a SyntaxError
    // that carries no `cause.code` — the warn-on-unknown-failure path.
    stubFetch(async () => new Response('<html>not ollama</html>', { status: 200 }));

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('error');
    // The SyntaxError text varies by V8 version, so only assert it is present.
    expect(typeof result.detail).toBe('string');
    expect((result.detail ?? '').length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('/api/tags');
  });

  it('stays silent (status unreachable) for the full "unreachable" code family, not just ECONNREFUSED', async () => {
    // The benign "can't reach the server" family — including the Windows
    // mid-request variants (ECONNRESET / ECONNABORTED) and the Undici
    // variants (UND_ERR_CONNECT_TIMEOUT connect timeout, UND_ERR_SOCKET
    // mid-request socket closure on an Ollama restart) the review flagged.
    const silentCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ECONNABORTED',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ETIMEDOUT',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
    ];
    for (const code of silentCodes) {
      warnSpy.mockClear();
      stubFetch(async () => {
        throw Object.assign(new Error('fetch failed'), { cause: { code } });
      });

      const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

      expect(result.models, `${code} must still degrade to the fallback`).toEqual(['qwen2.5:3b']);
      expect(result.status, `${code} must report status unreachable`).toBe('unreachable');
      expect(warnSpy, `${code} must not warn`).not.toHaveBeenCalled();
    }
  });

  it('ignores a non-string defaultModel (malformed config) without rejecting — fallback path', async () => {
    // `defaultModel` is typed `string | null`, but it originates from a parsed
    // `configJson` blob — a malformed/hand-edited persisted config can hand the
    // helper a non-string at runtime. Calling `.trim()` on that would throw a
    // TypeError before the try block and reject `providers.listModels`,
    // breaking the "never rejects" contract. A number must be ignored, not
    // crash, even when the server is also unreachable.
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });

    const result = await listOllamaModels('http://localhost:11434/api', 123 as unknown as string);

    expect(result.models).toEqual([]);
    expect(result.status).toBe('unreachable');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops a non-string defaultModel on the success path (never folds it into results)', async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ models: [{ model: 'llama3.1:8b' }] }), { status: 200 }),
    );

    const result = await listOllamaModels('http://localhost:11434/api', {
      not: 'a string',
    } as unknown as string);

    expect(result.models).toEqual(['llama3.1:8b']);
    expect(result.status).toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('reports status error on a 200 response whose body lacks a models array (non-Ollama service)', async () => {
    // A wrong-port service answering 200 with valid JSON that is NOT Ollama's
    // /api/tags shape (no `models` array). Folding the configured default in
    // and reporting 'ok' would present the default as a "detected" model and
    // hide the misconfiguration — the same concealment the status contract
    // exists to prevent. A reachable-but-wrong server must surface as 'error'.
    stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('error');
    expect(typeof result.detail).toBe('string');
    expect((result.detail ?? '').length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('/api/tags');
  });

  it('treats a 200 response with an empty models array as ok (Ollama running, nothing pulled yet)', async () => {
    // Regression guard for the shape check above: an EMPTY array is a genuine
    // Ollama server with no models pulled — it must stay 'ok' (default folded
    // in), NOT be over-rejected as a wrong-shape error.
    stubFetch(async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));

    const result = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('reports status error (never rejects, never fetches) when baseUrl is a non-string (malformed config)', async () => {
    // `baseUrl` originates from a parsed configJson blob; a hand-edited or
    // corrupted config can hand a non-string at runtime. Building the
    // /api/tags URL via String.prototype.replace would throw a TypeError
    // BEFORE the try block and reject providers.listModels, breaking the
    // never-reject contract. fetch must not even be reached.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await listOllamaModels(123 as unknown as string, 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('error');
    expect(typeof result.detail).toBe('string');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('reports status error (never fetches) when baseUrl is empty / whitespace-only', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await listOllamaModels('   ', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('degrades silently (status unreachable) on an Undici connect timeout (UND_ERR_CONNECT_TIMEOUT)', async () => {
    // Node/Electron global fetch (Undici) reports an unreachable-host connect
    // timeout as cause.code UND_ERR_CONNECT_TIMEOUT, not the libuv ETIMEDOUT.
    // A remote Ollama that is simply down must degrade silently, not warn on
    // every fresh listing.
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), {
        cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
      });
    });

    const result = await listOllamaModels('http://10.0.0.5:11434/api', 'qwen2.5:3b');

    expect(result.models).toEqual(['qwen2.5:3b']);
    expect(result.status).toBe('unreachable');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('never writes Ollama URL credentials to the log on the HTTP-error path', async () => {
    // A remote Ollama behind auth may be configured as
    // http://user:secret@host/api — the warning must log only a sanitized
    // origin+path so credentials never leak into application logs.
    stubFetch(async () => new Response('unauthorized', { status: 401 }));

    const result = await listOllamaModels(
      'http://admin:s3cr3tT0ken@10.0.0.5:11434/api',
      'qwen2.5:3b',
    );

    expect(result.status).toBe('error');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = String(warnSpy.mock.calls[0]?.[0]);
    expect(logged).not.toContain('s3cr3tT0ken');
    expect(logged).not.toContain('admin:');
    // The sanitized origin + path is still present for diagnosis.
    expect(logged).toContain('10.0.0.5:11434');
    expect(logged).toContain('/api/tags');
  });

  it('never writes Ollama URL credentials to the log on the catch (transport-error) path', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('certificate has expired'), { cause: { code: 'EPROTO' } });
    });

    const result = await listOllamaModels(
      'http://admin:s3cr3tT0ken@10.0.0.5:11434/api',
      'qwen2.5:3b',
    );

    expect(result.status).toBe('error');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0]?.map((arg) => String(arg)).join(' ') ?? '';
    expect(logged).not.toContain('s3cr3tT0ken');
    expect(logged).not.toContain('admin:');
    expect(logged).toContain('10.0.0.5:11434');
  });
});
