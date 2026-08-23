/**
 * Enhanced AI service behaviour specs.
 *
 * Audit F4 + F5 — the service was a simulation shim in front of ~3,700
 * lines of real, fully-implemented intelligence code, and the seven
 * Settings toggles that appear to control it were write-only.
 *
 * What the shim did, with a real `llmComplete`, `embedText`, `ragRepo` and
 * `dimension` all wired in by the composition root and then discarded:
 *   - enhancedQuery         -> returned "Found N relevant context items."
 *                              as the ANSWER
 *   - streamQuery           -> echoed the user's own question back
 *                              word-by-word with 20ms delays
 *   - extractAndStoreFacts  -> returned 0
 *   - queryKnowledge        -> returned { nodes: [], edges: [] }
 *   - createPlan            -> returned { id: 'placeholder', steps: [] }
 *   - getStats              -> returned hardcoded zeros
 *
 * And `handlers.ts` (settings.getEnhancedAiConfig / setEnhancedAiConfig)
 * held the ONLY reads of the seven feature flags, so every Switch in
 * Settings -> Enhanced AI was inert.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { type EnhancedAiServiceOptions, createEnhancedAiService } from './enhanced-ai.js';

const DIM = 16;

/** Deterministic lexical embedder — real vector math, no retrieval mocking. */
function embedOne(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) | 0;
    const slot = Math.abs(hash) % DIM;
    vec[slot] = (vec[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

interface Row {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  embedding: Buffer;
  createdAt: number;
}

function makeRagRepo() {
  const rows: Row[] = [];
  return {
    upsert(input: Row): string {
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
    listByCompany(companyId: string): Row[] {
      return rows.filter((r) => r.companyId === companyId);
    },
  };
}

const FACTS_JSON = JSON.stringify([
  {
    fact: 'The signing certificate expired on Friday',
    type: 'status',
    confidence: 0.9,
    entities: ['signing certificate'],
  },
]);

const ANSWER = 'The release is blocked by an expired signing certificate. [1]';
const SOURCE_TEXT = 'The release is blocked because the signing certificate expired last Friday.';

function buildService(overrides: Partial<EnhancedAiServiceOptions> = {}): {
  service: ReturnType<typeof createEnhancedAiService>;
  prompts: string[];
} {
  const prompts: string[] = [];
  const llmComplete = vi.fn(async (prompt: string) => {
    prompts.push(prompt);
    // The long-term-memory service asks for a JSON array of facts;
    // everything else is a prose answer.
    if (prompt.includes('Extract key facts')) return FACTS_JSON;
    return ANSWER;
  });

  const service = createEnhancedAiService({
    ragService: null,
    embedText: async (texts: string[]) => texts.map(embedOne),
    dimension: DIM,
    ragRepo: makeRagRepo() as unknown as EnhancedAiServiceOptions['ragRepo'],
    llmComplete,
    ...overrides,
  });

  return { service, prompts };
}

async function seed(service: ReturnType<typeof createEnhancedAiService>): Promise<void> {
  await service.indexWithSemanticChunking({
    companyId: 'co-1',
    sourceType: 'message' as EmbeddingSourceType,
    sourceId: 'msg-1',
    content: SOURCE_TEXT,
  });
}

describe('enhanced-ai — real answers (F4)', () => {
  it('returns a generated answer, not a count of retrieved items', async () => {
    const { service } = buildService();
    await seed(service);

    const result = await service.enhancedQuery('why is the release blocked?', {
      companyId: 'co-1',
      threshold: 0,
    });

    expect(result.answer).not.toMatch(/^Found \d+ relevant context items\.$/);
    expect(result.answer).toContain('signing certificate');
  });

  it('grounds the answer prompt in the retrieved context', async () => {
    const { service, prompts } = buildService();
    await seed(service);

    await service.enhancedQuery('why is the release blocked?', {
      companyId: 'co-1',
      threshold: 0,
    });

    // Query expansion also sees the raw question, so match the answer
    // prompt specifically by its grounding preamble.
    const answerPrompt = prompts.find((p) => p.includes('Context:'));
    expect(answerPrompt).toBeDefined();
    expect(answerPrompt).toContain('why is the release blocked?');
    expect(answerPrompt).toContain('signing certificate expired');
  });

  it('streams the generated answer rather than echoing the question back', async () => {
    const { service } = buildService();
    await seed(service);

    let streamed = '';
    for await (const chunk of service.streamQuery('why is the release blocked?', {
      companyId: 'co-1',
      threshold: 0,
    })) {
      if (chunk.type === 'text') streamed += chunk.content;
    }

    expect(streamed).toBe(ANSWER);
    expect(streamed).not.toContain('why is the release blocked?');
  });

  it('extracts and stores real facts instead of returning zero', async () => {
    const { service } = buildService();

    const count = await service.extractAndStoreFacts('The signing cert expired on Friday.', {
      sourceId: 'thread-1',
      companyId: 'co-1',
    });

    expect(count).toBe(1);
  });

  it('surfaces knowledge-graph nodes once facts have been ingested', async () => {
    const { service } = buildService();
    await service.extractAndStoreFacts('The signing cert expired on Friday.', {
      sourceId: 'thread-1',
      companyId: 'co-1',
    });

    const graph = service.queryKnowledge('signing certificate', { companyId: 'co-1' });

    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('builds a plan with a real id rather than the literal "placeholder"', async () => {
    const { service } = buildService({
      features: { planningEnabled: true, planningThreshold: 0 },
    });

    const plan = await service.createPlan('Ship the release once signing is fixed');

    expect(plan.id).not.toBe('placeholder');
    expect(plan.id.length).toBeGreaterThan(0);
  });

  it('reports real counters from getStats', async () => {
    const { service } = buildService();
    await service.extractAndStoreFacts('The signing cert expired on Friday.', {
      sourceId: 'thread-1',
      companyId: 'co-1',
    });

    expect(service.getStats().memory.factsCount).toBeGreaterThan(0);
  });
});

describe('enhanced-ai — feature flags actually gate behaviour (F5)', () => {
  it('skips fact extraction when long-term memory is disabled', async () => {
    const { service, prompts } = buildService({
      features: { longTermMemoryEnabled: false },
    });

    const count = await service.extractAndStoreFacts('The cert expired.', {
      sourceId: 'thread-1',
      companyId: 'co-1',
    });

    expect(count).toBe(0);
    expect(prompts.some((p) => p.includes('Extract key facts'))).toBe(false);
  });

  it('returns an empty graph when the knowledge graph is disabled', async () => {
    const { service } = buildService({ features: { knowledgeGraphEnabled: false } });
    await service.extractAndStoreFacts('The signing cert expired on Friday.', {
      sourceId: 'thread-1',
      companyId: 'co-1',
    });

    expect(service.queryKnowledge('signing certificate', { companyId: 'co-1' })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it('emits the answer as a single chunk when streaming is disabled', async () => {
    const { service } = buildService({ features: { streamingEnabled: false } });
    await seed(service);

    const textChunks: string[] = [];
    for await (const chunk of service.streamQuery('why is the release blocked?', {
      companyId: 'co-1',
      threshold: 0,
    })) {
      if (chunk.type === 'text') textChunks.push(chunk.content);
    }

    expect(textChunks).toEqual([ANSWER]);
  });

  it('indexes content under both chunking strategies', async () => {
    const content = [
      '# Release status',
      '',
      SOURCE_TEXT,
      '',
      '# Next steps',
      '',
      'Renew the certificate, then re-run the notarization job and publish.',
    ].join('\n');

    const fixed = buildService({ features: { semanticChunkingEnabled: false } });
    const semantic = buildService({ features: { semanticChunkingEnabled: true } });

    const fixedCount = await fixed.service.indexWithSemanticChunking({
      companyId: 'co-1',
      sourceType: 'message' as EmbeddingSourceType,
      sourceId: 'doc-1',
      content,
    });
    const semanticCount = await semantic.service.indexWithSemanticChunking({
      companyId: 'co-1',
      sourceType: 'message' as EmbeddingSourceType,
      sourceId: 'doc-1',
      content,
    });

    expect(fixedCount).toBeGreaterThan(0);
    expect(semanticCount).toBeGreaterThan(0);
  });

  it('does not run query expansion when the flag is off', async () => {
    const { service, prompts } = buildService({
      features: { queryExpansionEnabled: false },
    });
    await seed(service);

    await service.enhancedQuery('why is the release blocked?', {
      companyId: 'co-1',
      threshold: 0,
    });

    // HyDE expansion prompts the model to draft a hypothetical document.
    expect(prompts.some((p) => /hypothetical/i.test(p))).toBe(false);
  });
});
