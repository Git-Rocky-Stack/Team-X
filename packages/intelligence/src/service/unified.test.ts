/**
 * Unified AI service specs.
 *
 * Audit F13 — `queryStream` synthesized its "answer" by concatenating the
 * first 50 characters of the top three retrieved chunks:
 *
 *   const answer = `Based on the retrieved context, here's what I found: ${...}`
 *
 * `config.llm.complete` was wired and available, but never consulted for
 * answer generation — so a configured provider produced a canned string
 * rather than a generated answer. `query()` delegates to `queryStream()`,
 * so both paths were affected.
 *
 * This file is also the module's first test coverage of any kind.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import type { RagEmbeddingRow, RagRepo, RagUpsertInput } from '../rag/service.js';
import { type AiServiceConfig, createAiService } from './unified.js';

/**
 * Deterministic embedder: each text maps to a unit vector whose direction is
 * driven by its lowercase token set, so lexically similar texts score higher.
 * Real vector math, no mocking of the retrieval path.
 */
const DIMENSION = 16;

function embedOne(text: string): number[] {
  const vec = new Array<number>(DIMENSION).fill(0);
  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) | 0;
    const slot = Math.abs(hash) % DIMENSION;
    vec[slot] = (vec[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

const embedText = async (texts: string[]): Promise<number[][]> => texts.map(embedOne);

function createInMemoryRagRepo(): RagRepo {
  const rows: RagEmbeddingRow[] = [];
  return {
    upsert(input: RagUpsertInput): string {
      rows.push({ ...input });
      return input.id;
    },
    deleteBySource(sourceId: string): number {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.sourceId === sourceId) rows.splice(i, 1);
      }
      return before - rows.length;
    },
    listByCompany(companyId: string): RagEmbeddingRow[] {
      return rows.filter((r) => r.companyId === companyId);
    },
  };
}

interface Harness {
  service: ReturnType<typeof createAiService>;
  completeCalls: string[];
}

async function buildService(overrides: Partial<AiServiceConfig> = {}): Promise<Harness> {
  const completeCalls: string[] = [];
  const complete = vi.fn(async (prompt: string) => {
    completeCalls.push(prompt);
    return 'Deployments are blocked on the signing certificate renewal.';
  });

  const service = createAiService({
    embedding: { embedText, dimension: DIMENSION },
    rag: { repo: createInMemoryRagRepo(), topK: 5, threshold: 0 },
    llm: { model: 'test-model', provider: 'test', complete },
    ...overrides,
  });

  await service.initialize();
  return { service, completeCalls };
}

async function seed(service: ReturnType<typeof createAiService>): Promise<void> {
  await service.index({
    companyId: 'co-1',
    sourceType: 'message' as EmbeddingSourceType,
    sourceId: 'msg-1',
    content: 'The release is blocked because the signing certificate expired last Friday.',
  });
}

describe('createAiService — answer generation', () => {
  it('returns the model’s answer rather than a concatenation of context snippets', async () => {
    const { service } = await buildService();
    await seed(service);

    const result = await service.query('co-1', 'why is the release blocked?');

    expect(result.answer).toBe('Deployments are blocked on the signing certificate renewal.');
    expect(result.answer).not.toContain("here's what I found");
  });

  it('sends the retrieved context and the question to the model', async () => {
    const { service, completeCalls } = await buildService();
    await seed(service);

    await service.query('co-1', 'why is the release blocked?');

    const answerPrompt = completeCalls.find((p) => p.includes('why is the release blocked?'));
    expect(answerPrompt).toBeDefined();
    expect(answerPrompt).toContain('signing certificate expired');
  });

  it('streams the model’s answer text through the chunk stream', async () => {
    const { service } = await buildService();
    await seed(service);

    const { stream } = service.queryStream('co-1', 'why is the release blocked?');
    let text = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text') text += chunk.content;
    }

    expect(text).toBe('Deployments are blocked on the signing certificate renewal.');
  });

  it('still answers when retrieval finds nothing, without inventing context', async () => {
    const { service, completeCalls } = await buildService();

    const result = await service.query('co-1', 'anything at all?');

    expect(result.answer).toBe('Deployments are blocked on the signing certificate renewal.');
    expect(completeCalls.some((p) => p.includes('anything at all?'))).toBe(true);
  });

  it('degrades to a clearly-labelled context digest when no model is configured', async () => {
    // Without an LLM there is nothing that can generate prose. The service
    // must say so rather than pass a synthesized string off as an answer.
    const service = createAiService({
      embedding: { embedText, dimension: DIMENSION },
      rag: { repo: createInMemoryRagRepo(), topK: 5, threshold: 0 },
    });
    await service.initialize();
    await seed(service);

    const result = await service.query('co-1', 'why is the release blocked?');

    expect(result.answer).toMatch(/no language model/i);
  });

  it('surfaces a model failure instead of silently returning a canned answer', async () => {
    const { service } = await buildService({
      llm: {
        model: 'test-model',
        provider: 'test',
        complete: async () => {
          throw new Error('provider timeout');
        },
      },
    });
    await seed(service);

    await expect(service.query('co-1', 'why is the release blocked?')).rejects.toThrow(
      /provider timeout/,
    );
  });
});
