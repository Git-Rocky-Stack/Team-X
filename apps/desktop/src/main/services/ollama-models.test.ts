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
 * the graceful posture: success returns sorted/deduped models; an
 * unreachable server returns the configured default (or empty) and
 * never throws.
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

  it('returns sorted, de-duplicated model names with the default folded in', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            models: [{ model: 'llama3.1:8b' }, { name: 'qwen2.5:3b' }, { model: 'llama3.1:8b' }],
          }),
          { status: 200 },
        ),
    );

    const models = await listOllamaModels('http://localhost:11434/api', 'phi3:mini');

    expect(models).toEqual(['llama3.1:8b', 'phi3:mini', 'qwen2.5:3b']);
  });

  it('prefers row.model over row.name and trims whitespace', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            models: [{ model: '  spaced:1b  ', name: 'ignored' }, { name: 'bare:2b' }],
          }),
          { status: 200 },
        ),
    );

    const models = await listOllamaModels('http://localhost:11434/api');

    expect(models).toEqual(['bare:2b', 'spaced:1b']);
  });

  it('degrades to the configured default model when Ollama is unreachable (ECONNREFUSED)', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });

    const models = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(models).toEqual(['qwen2.5:3b']);
    // "Server not running" is benign — it must NOT spam the main-process log.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns an empty list (never throws) when unreachable (ENOTFOUND) and no default is configured', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    });

    await expect(listOllamaModels('http://localhost:11434/api')).resolves.toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns with the status (but still degrades) when Ollama answers a non-OK HTTP status', async () => {
    stubFetch(async () => new Response('upstream boom', { status: 500 }));

    await expect(listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b')).resolves.toEqual([
      'qwen2.5:3b',
    ]);
    // A reachable-but-rejecting server (auth/wrong-port/5xx) is a real
    // misconfiguration the user must be able to discover — surface it.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('500');
  });

  it('warns (but still degrades) on an unexpected failure shape — TLS / DNS-oddity / malformed JSON', async () => {
    stubFetch(async () => {
      throw Object.assign(new Error('certificate has expired'), { cause: { code: 'EPROTO' } });
    });

    const models = await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

    expect(models).toEqual(['qwen2.5:3b']);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('/api/tags');
  });

  it('stays silent for the benign not-running codes (ECONNREFUSED, ENOTFOUND)', async () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND']) {
      warnSpy.mockClear();
      stubFetch(async () => {
        throw Object.assign(new Error('fetch failed'), { cause: { code } });
      });

      await listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b');

      expect(warnSpy, `${code} must not warn`).not.toHaveBeenCalled();
    }
  });
});
