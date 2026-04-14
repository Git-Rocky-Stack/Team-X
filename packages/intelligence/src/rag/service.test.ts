import { describe, expect, it, vi } from 'vitest';
import type { EmbedTextFn } from './embeddings.js';
import {
  type RagEmbeddingRow,
  type RagRepo,
  type RagUpsertInput,
  createRagService,
} from './service.js';

const fakeEmbed: EmbedTextFn = async (texts) =>
  texts.map((t) => [t.length % 10, (t.charCodeAt(0) || 0) % 10, 1, 0]);

function makeFakeRepo(): RagRepo & { rows: Map<string, RagEmbeddingRow[]> } {
  const rows = new Map<string, RagEmbeddingRow[]>();
  return {
    rows,
    upsert(row: RagUpsertInput): string {
      const list = rows.get(row.companyId) ?? [];
      list.push(row as RagEmbeddingRow);
      rows.set(row.companyId, list);
      return row.id;
    },
    deleteBySource(sourceId: string): number {
      let removed = 0;
      for (const [cid, list] of rows.entries()) {
        const filtered = list.filter((r) => r.sourceId !== sourceId);
        removed += list.length - filtered.length;
        rows.set(cid, filtered);
      }
      return removed;
    },
    listByCompany(companyId: string): RagEmbeddingRow[] {
      return rows.get(companyId) ?? [];
    },
  };
}

describe('RagService.indexSource', () => {
  it('chunks, embeds and upserts a document', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'm1',
      content: 'Hello world. This is a message.',
    });
    expect(repo.listByCompany('c1').length).toBeGreaterThan(0);
  });

  it('replaces existing chunks on re-index (deleteBySource first)', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'm1',
      content: 'v1 content first pass',
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'm1',
      content: 'v2 content second pass',
    });
    const rows = repo.listByCompany('c1');
    expect(rows.every((r) => r.contentText.includes('v2'))).toBe(true);
    expect(rows.every((r) => !r.contentText.includes('v1'))).toBe(true);
  });

  it('skips empty content without embedding', async () => {
    const repo = makeFakeRepo();
    const embed = vi.fn(fakeEmbed);
    const svc = createRagService({
      embedText: embed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'm1',
      content: '   ',
    });
    expect(embed).not.toHaveBeenCalled();
    expect(repo.listByCompany('c1').length).toBe(0);
  });
});

describe('RagService.retrieve', () => {
  it('returns top-K results above threshold, filtered by company', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'a',
      content: 'Apples are sweet',
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'b',
      content: 'Oranges are citrus',
    });
    await svc.indexSource({
      companyId: 'c2',
      sourceType: 'message',
      sourceId: 'c',
      content: 'Apples in another company',
    });

    const results = await svc.retrieve({
      companyId: 'c1',
      query: 'apples',
      topK: 5,
      threshold: 0.0,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.sourceId === 'a' || r.sourceId === 'b')).toBe(true);
  });

  it('returns empty when threshold is too high', async () => {
    const repo = makeFakeRepo();
    const svc = createRagService({
      embedText: fakeEmbed,
      dimension: 4,
      repo,
      chunker: { maxTokens: 64, overlapTokens: 8 },
    });
    await svc.indexSource({
      companyId: 'c1',
      sourceType: 'message',
      sourceId: 'a',
      content: 'Apples are sweet',
    });
    const results = await svc.retrieve({
      companyId: 'c1',
      query: 'orange',
      topK: 5,
      threshold: 0.999,
    });
    expect(results).toHaveLength(0);
  });
});
