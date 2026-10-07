/**
 * `retrieve()` — grounding without generation — and the memory / knowledge
 * paths it draws on.
 *
 * Callers that already own a model (the desktop Copilot's agentic loop) need
 * the grounding the service assembles — retrieved passages, remembered facts,
 * knowledge-graph entities — without paying for a second answer from a second
 * model call. Before this, the only way in was `query()`, which always
 * generated.
 *
 * The same specs pin three defects in the paths `retrieve()` depends on:
 *
 *   - Fact retrieval ignored the query (`retrieveRankedFacts(companyId,
 *     _query)`), so "relevant facts" were simply the freshest facts.
 *   - The knowledge graph matched a node by compiling the entire question into
 *     a RegExp and testing it against each short label. A natural question
 *     never matches a label, so the graph answered nothing; and a question
 *     containing `+`, `?` or `(` threw a SyntaxError.
 *   - Fact extraction `JSON.parse`d the model's raw reply, so the common
 *     fenced reply (```json … ```) threw and no fact was ever stored.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { createInMemoryGraphRepo } from '../knowledge/graph.js';
import { createInMemoryMemoryRepo } from '../memory/long-term.js';
import {
  type RagEmbeddingRow,
  type RagRepo,
  type RagUpsertInput,
  createRagService,
} from '../rag/service.js';
import { type AiServiceConfig, createAiService } from './unified.js';

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

/** The fenced reply shape models routinely produce for "respond with JSON". */
const FENCED_FACTS = [
  'Here are the facts:',
  '```json',
  JSON.stringify([
    {
      fact: 'The signing certificate expires on Friday',
      type: 'status',
      confidence: 0.95,
      entities: ['signing certificate'],
    },
    {
      fact: 'Dana owns the billing migration',
      type: 'relationship',
      confidence: 0.9,
      entities: ['Dana', 'billing migration'],
    },
    { type: 'status', confidence: 0.99 },
    'not an object',
  ]),
  '```',
].join('\n');

interface Harness {
  service: ReturnType<typeof createAiService>;
  prompts: string[];
}

async function buildService(overrides: Partial<AiServiceConfig> = {}): Promise<Harness> {
  const prompts: string[] = [];
  const service = createAiService({
    embedding: { embedText, dimension: DIMENSION },
    rag: { repo: createInMemoryRagRepo(), topK: 5, threshold: 0 },
    llm: {
      model: 'test-model',
      provider: 'test',
      complete: async (prompt: string) => {
        prompts.push(prompt);
        if (prompt.includes('Extract key facts')) return FENCED_FACTS;
        return 'generated answer';
      },
    },
    ...overrides,
  });
  await service.initialize();
  return { service, prompts };
}

async function seedPassage(service: ReturnType<typeof createAiService>): Promise<void> {
  await service.index({
    companyId: 'co-1',
    sourceType: 'message' as EmbeddingSourceType,
    sourceId: 'msg-1',
    content: 'The release is blocked because the signing certificate expired last Friday.',
  });
}

describe('createAiService — extractFacts', () => {
  it('reads a fenced JSON reply and drops entries that are not facts', async () => {
    const { service } = await buildService();

    const facts = await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(facts.map((f) => f.fact)).toEqual([
      'The signing certificate expires on Friday',
      'Dana owns the billing migration',
    ]);
  });

  it('stores facts in an injected memory repo, so a caller can persist them', async () => {
    const memoryRepo = createInMemoryMemoryRepo();
    const { service } = await buildService({ memory: { repo: memoryRepo } });

    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(memoryRepo.listFactsByCompany('co-1')).toHaveLength(2);
  });

  it('ingests facts into an injected knowledge repo', async () => {
    const graphRepo = createInMemoryGraphRepo();
    const { service } = await buildService({ knowledge: { repo: graphRepo } });

    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(graphRepo.getNodesByCompany('co-1').map((n) => n.label)).toEqual(
      expect.arrayContaining(['Dana', 'billing migration']),
    );
  });
});

describe('createAiService — retrieve', () => {
  it('returns retrieved passages without asking the model for an answer', async () => {
    const { service, prompts } = await buildService();
    await seedPassage(service);

    const result = await service.retrieve('co-1', 'why is the release blocked?');

    expect(result.context.map((h) => h.sourceId)).toEqual(['msg-1']);
    expect(prompts.some((p) => p.includes('Answer the question'))).toBe(false);
  });

  it('returns only the remembered facts that bear on the question', async () => {
    const { service } = await buildService();
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    const result = await service.retrieve('co-1', 'when does the signing certificate expire?');

    expect(result.facts.map((f) => f.fact)).toEqual(['The signing certificate expires on Friday']);
  });

  it('returns knowledge-graph entities the question mentions', async () => {
    const { service } = await buildService();
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    const result = await service.retrieve('co-1', 'What is Dana working on right now?');

    expect(result.related.map((r) => r.entity)).toEqual(
      expect.arrayContaining(['Dana', 'billing migration']),
    );
  });

  it('treats regex metacharacters in a question as text, not a pattern', async () => {
    const { service } = await buildService();
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    await expect(service.retrieve('co-1', 'Is Dana (or C++?) blocked?')).resolves.toMatchObject({
      related: expect.arrayContaining([expect.objectContaining({ entity: 'Dana' })]),
    });
  });

  it('omits facts and entities when the caller opts out of them', async () => {
    const { service } = await buildService();
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    const result = await service.retrieve('co-1', 'What is Dana working on?', {
      includeFacts: false,
      includeRelated: false,
    });

    expect(result.facts).toEqual([]);
    expect(result.related).toEqual([]);
  });

  it('refuses before initialization rather than answering from nothing', async () => {
    const service = createAiService({
      embedding: { embedText, dimension: DIMENSION },
      rag: { repo: createInMemoryRagRepo() },
    });

    await expect(service.retrieve('co-1', 'anything')).rejects.toThrow(/not initialized/i);
  });
});

describe('createAiService — getStats', () => {
  // Previously `avgFreshness` was a literal 0.8 placeholder, `totalFacts`
  // counted only this process's extractions, and the plan / span / cache
  // counters were declared but never incremented.
  it('counts the facts actually stored, as a fresh service over the same repo sees them', async () => {
    const memoryRepo = createInMemoryMemoryRepo();
    const { service } = await buildService({ memory: { repo: memoryRepo } });
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    const { service: nextLaunch } = await buildService({ memory: { repo: memoryRepo } });
    const stats = nextLaunch.getStats('co-1');

    expect(stats.memory.totalFacts).toBe(2);
    expect(stats.memory.avgFreshness).toBeGreaterThan(0);
    expect(stats.memory.avgFreshness).not.toBe(0.8);
  });

  it('reports no company-scoped counts without a company', async () => {
    const { service } = await buildService();
    await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(service.getStats().memory).toEqual({
      totalFacts: 0,
      totalSummaries: 0,
      avgFreshness: 0,
    });
  });

  it('measures query latency only once a query has completed', async () => {
    const { service } = await buildService();
    expect(service.getStats('co-1').rag.avgLatencyMs).toBe(0);

    await seedPassage(service);
    await service.query('co-1', 'why is the release blocked?');

    expect(service.getStats('co-1').rag.totalRetrievals).toBe(1);
    expect(service.getStats('co-1').rag.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('createAiService — shared RAG service', () => {
  // The desktop app already runs a RagService for its indexer. Building a
  // second one over the same table gave the AI service its own query cache,
  // which the indexer's writes never invalidated: a passage indexed after a
  // cached retrieval stayed invisible for the cache TTL (5 minutes).
  it('retrieves through an injected service, so writes made through it are seen at once', async () => {
    const repo = createInMemoryRagRepo();
    const shared = createRagService({ embedText, dimension: DIMENSION, repo });
    const { service } = await buildService({ rag: { service: shared, repo, threshold: 0 } });

    expect((await service.retrieve('co-1', 'why is the release blocked?')).context).toEqual([]);

    await shared.indexSource({
      companyId: 'co-1',
      sourceType: 'message' as EmbeddingSourceType,
      sourceId: 'msg-1',
      content: 'The release is blocked because the signing certificate expired last Friday.',
    });

    const after = await service.retrieve('co-1', 'why is the release blocked?');
    expect(after.context.map((h) => h.sourceId)).toEqual(['msg-1']);
    expect(service.getRagService()).toBe(shared);
  });
});
