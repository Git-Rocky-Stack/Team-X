/**
 * `AiServiceConfig` options that were declared but never read.
 *
 * `memory.factExtraction.minConfidence`, `planning.planningThreshold` and
 * `observability.traceSampleRate` were accepted and silently ignored: the
 * memory service always filtered at its own 0.7, every query was planned
 * whenever planning was on, and every span was recorded whatever the rate.
 * Each now changes behaviour.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import type { RagEmbeddingRow, RagRepo, RagUpsertInput } from '../rag/service.js';
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

const FACTS_REPLY = JSON.stringify([
  { fact: 'The signing certificate expires on Friday', type: 'status', confidence: 0.95 },
  { fact: 'Dana owns the billing migration', type: 'relationship', confidence: 0.8 },
]);

async function buildService(
  overrides: Partial<AiServiceConfig> = {},
): Promise<{ service: ReturnType<typeof createAiService>; prompts: string[] }> {
  const prompts: string[] = [];
  const service = createAiService({
    embedding: { embedText, dimension: DIMENSION },
    rag: { repo: createInMemoryRagRepo(), topK: 5, threshold: 0 },
    llm: {
      model: 'test-model',
      provider: 'test',
      complete: async (prompt: string) => {
        prompts.push(prompt);
        if (prompt.includes('Extract key facts')) return FACTS_REPLY;
        return 'generated answer';
      },
    },
    ...overrides,
  });
  await service.initialize();
  await service.index({
    companyId: 'co-1',
    sourceType: 'message' as EmbeddingSourceType,
    sourceId: 'msg-1',
    content: 'The release is blocked because the signing certificate expired last Friday.',
  });
  return { service, prompts };
}

const planned = (prompts: string[]) => prompts.some((p) => p.includes('planning assistant'));

describe('createAiService — memory.factExtraction.minConfidence', () => {
  it('drops extracted facts below the configured confidence', async () => {
    const { service } = await buildService({
      memory: { factExtraction: { minConfidence: 0.9 } },
    });

    const facts = await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(facts.map((f) => f.fact)).toEqual(['The signing certificate expires on Friday']);
  });

  it('keeps the 0.7 floor when no threshold is configured', async () => {
    const { service } = await buildService();

    const facts = await service.extractFacts('co-1', 'thread-1', 'conversation text');

    expect(facts).toHaveLength(2);
  });
});

describe('createAiService — planning.planningThreshold', () => {
  const planning = { enablePlanning: true, planningThreshold: 40 };

  it('does not plan a query shorter than the threshold', async () => {
    const { service, prompts } = await buildService({ planning });

    const result = await service.query('co-1', 'release blocked?');

    expect(planned(prompts)).toBe(false);
    expect(result.plan).toBeUndefined();
  });

  it('plans a query at or over the threshold', async () => {
    const { service, prompts } = await buildService({ planning });

    const result = await service.query(
      'co-1',
      'why is the release blocked and who owns the certificate renewal?',
    );

    expect(planned(prompts)).toBe(true);
    expect(result.plan).toBeDefined();
  });

  it('lets an explicit usePlan override the threshold', async () => {
    const { service, prompts } = await buildService({ planning });

    await service.query('co-1', 'release blocked?', { usePlan: true });

    expect(planned(prompts)).toBe(true);
  });
});

describe('createAiService — observability.traceSampleRate', () => {
  it('records no spans at a sample rate of 0', async () => {
    const { service } = await buildService({
      observability: { enableTracing: true, traceSampleRate: 0 },
    });

    await service.query('co-1', 'why is the release blocked?');

    expect(service.getTracer()?.exportTraces()).toBe('[]');
    expect(service.getStats().observability.totalSpans).toBe(0);
  });

  it('records the whole query trace at a sample rate of 1', async () => {
    const { service } = await buildService({
      observability: { enableTracing: true, traceSampleRate: 1 },
    });

    await service.query('co-1', 'why is the release blocked?');

    const traces = JSON.parse(service.getTracer()?.exportTraces() ?? '[]') as Array<{
      name: string;
    }>;
    expect(traces.map((t) => t.name)).toEqual(['ai.query']);
    expect(service.getStats().observability.totalSpans).toBeGreaterThan(0);
  });
});
