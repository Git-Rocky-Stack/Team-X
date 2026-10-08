/**
 * Real Ollama round trip (audit 2026-10-07 P1-6: E2E runs a canned provider,
 * so nothing proved the Ollama adapter against a live server).
 *
 * Opt-in: runs only with RUN_INTEGRATION_TESTS=true and OLLAMA_TEST_MODEL set
 * (the nightly Integration workflow pulls a small model and sets both).
 * OLLAMA_HOST overrides the default http://127.0.0.1:11434.
 */

import { describe, expect, it } from 'vitest';

import { makeOllamaStream } from './ollama.js';

const MODEL = process.env.OLLAMA_TEST_MODEL;
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true' && Boolean(MODEL);
const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';

describe.skipIf(!RUN)('Ollama adapter (integration, real server)', () => {
  it('streams a completion with text and a usage-bearing done chunk', async () => {
    const stream = makeOllamaStream({ model: MODEL as string, baseURL: `${HOST}/api` });
    let text = '';
    let done: { usage?: { promptTokens: number; completionTokens: number } } | undefined;
    for await (const chunk of stream({
      system: 'Reply with one short sentence.',
      messages: [{ role: 'user', content: 'Say hello.' }],
    })) {
      if ('delta' in chunk && typeof chunk.delta === 'string') text += chunk.delta;
      if ('done' in chunk && chunk.done) done = chunk as typeof done;
    }
    expect(text.trim().length).toBeGreaterThan(0);
    expect(done?.usage?.promptTokens).toBeGreaterThan(0);
    expect(done?.usage?.completionTokens).toBeGreaterThan(0);
  }, 120_000);

  it('honours an abort signal', async () => {
    const stream = makeOllamaStream({ model: MODEL as string, baseURL: `${HOST}/api` });
    const controller = new AbortController();
    controller.abort();
    await expect(
      (async () => {
        for await (const _ of stream({
          system: 's',
          messages: [{ role: 'user', content: 'Count to one hundred.' }],
          signal: controller.signal,
        })) {
          // drain
        }
      })(),
    ).rejects.toThrow();
  }, 60_000);
});
