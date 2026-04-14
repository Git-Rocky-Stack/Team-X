/**
 * OpenAI embedding adapter. Uses `text-embedding-3-small` (1536-dim)
 * by default. Compatible with any OpenAI-style endpoint (OpenAI,
 * Together, Fireworks, OpenRouter, OpenAI-compat).
 *
 * Phase 5 — M29.
 */

import type { EmbedAdapter } from '../embed.js';

export interface OpenAIEmbedAdapterOptions {
  apiKey: string;
  model: string;
  dimension: number;
  baseURL?: string;
  fetchImpl?: typeof fetch;
}

export function makeOpenAIEmbedAdapter(opts: OpenAIEmbedAdapterOptions): EmbedAdapter {
  const baseURL = opts.baseURL ?? 'https://api.openai.com/v1';
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    model: opts.model,
    dimension: opts.dimension,
    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetchImpl(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({ model: opts.model, input: texts }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI /embeddings failed: ${response.status} ${body}`);
      }
      const json = (await response.json()) as {
        data?: Array<{ embedding: number[]; index: number }>;
      };
      if (!json.data) throw new Error('OpenAI /embeddings returned no data array');
      return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}
