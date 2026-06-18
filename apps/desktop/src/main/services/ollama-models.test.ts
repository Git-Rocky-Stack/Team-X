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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { listOllamaModels } from './ollama-models.js';

afterEach(() => {
  vi.unstubAllGlobals();
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
  });

  it('returns an empty list (never throws) when unreachable and no default is configured', async () => {
    stubFetch(async () => {
      throw new Error('fetch failed');
    });

    await expect(listOllamaModels('http://localhost:11434/api')).resolves.toEqual([]);
  });

  it('degrades gracefully when Ollama answers with a non-OK HTTP status', async () => {
    stubFetch(async () => new Response('upstream boom', { status: 500 }));

    await expect(listOllamaModels('http://localhost:11434/api', 'qwen2.5:3b')).resolves.toEqual([
      'qwen2.5:3b',
    ]);
  });
});
