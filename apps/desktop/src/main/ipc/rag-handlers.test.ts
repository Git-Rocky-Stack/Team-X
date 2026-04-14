import { describe, expect, it, vi } from 'vitest';

import { type RagHandlersDeps, buildRagHandlers } from './rag-handlers.js';

function makeDeps(overrides: Partial<RagHandlersDeps> = {}): RagHandlersDeps {
  return {
    embeddingsRepo: {
      countByCompany: vi.fn(() => 42),
      listByCompany: vi.fn(() => [{ createdAt: 100 }, { createdAt: 200 }] as never[]),
    },
    isRagEnabled: () => true,
    deleteAllForCompany: vi.fn(() => 42),
    rebuildSources: vi.fn(async () => 10),
    ...overrides,
  };
}

describe('rag.stats', () => {
  it('returns count, last ts, enabled state', async () => {
    const deps = makeDeps();
    const handlers = buildRagHandlers(deps);
    const result = await handlers.stats('c1');
    expect(result).toEqual({ embeddingCount: 42, lastIndexedAt: 200, enabled: true });
  });

  it('returns null lastIndexedAt when no rows', async () => {
    const deps = makeDeps({
      embeddingsRepo: {
        countByCompany: vi.fn(() => 0),
        listByCompany: vi.fn(() => []),
      },
    });
    const handlers = buildRagHandlers(deps);
    const result = await handlers.stats('c1');
    expect(result.lastIndexedAt).toBeNull();
  });

  it('surfaces enabled=false when isRagEnabled returns false', async () => {
    const deps = makeDeps({ isRagEnabled: () => false });
    const handlers = buildRagHandlers(deps);
    const result = await handlers.stats('c1');
    expect(result.enabled).toBe(false);
  });
});

describe('rag.rebuildAll', () => {
  it('wipes existing embeddings BEFORE rebuilding (strict order)', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      deleteAllForCompany: vi.fn((cid: string) => {
        order.push(`delete:${cid}`);
        return 42;
      }),
      rebuildSources: vi.fn(async (cid: string) => {
        order.push(`rebuild:${cid}`);
        return 10;
      }),
    });
    const handlers = buildRagHandlers(deps);
    const result = await handlers.rebuildAll('c1');
    expect(order).toEqual(['delete:c1', 'rebuild:c1']);
    expect(result.scheduled).toBe(10);
  });
});

describe('rag.deleteForCompany', () => {
  it('returns the delete count', async () => {
    const deps = makeDeps();
    const handlers = buildRagHandlers(deps);
    const result = await handlers.deleteForCompany('c1');
    expect(result.deleted).toBe(42);
  });
});
