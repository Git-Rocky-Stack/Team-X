/**
 * Ollama embedding adapter. Calls `/api/embed` on a local Ollama
 * instance. Default dimension for `nomic-embed-text` is 768.
 *
 * Phase 5 — M29.
 */

import type { EmbedAdapter } from '../embed.js';

export interface OllamaEmbedAdapterOptions {
  baseURL?: string;
  model: string;
  dimension: number;
  fetchImpl?: typeof fetch;
}

export function makeOllamaEmbedAdapter(opts: OllamaEmbedAdapterOptions): EmbedAdapter {
  const baseURL = opts.baseURL ?? 'http://127.0.0.1:11434';
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    model: opts.model,
    dimension: opts.dimension,
    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetchImpl(`${baseURL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: opts.model, input: texts }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama /api/embed failed: ${response.status} ${body}`);
      }
      const json = (await response.json()) as { embeddings?: number[][] };
      if (!json.embeddings || !Array.isArray(json.embeddings)) {
        throw new Error('Ollama /api/embed returned no embeddings array');
      }
      return json.embeddings;
    },
  };
}
