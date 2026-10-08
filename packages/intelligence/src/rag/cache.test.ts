/**
 * QueryCache invalidation — scope and counters.
 *
 * `invalidateByCompany` used to flush every company's entries (a write in
 * one company threw away every other company's warm cache), and
 * `invalidateBySourceIds` cleared the whole cache while counting the number
 * of source IDs it was handed as "invalidations". Both now remove only the
 * entries they make stale and count exactly what they removed.
 */

import { describe, expect, it } from 'vitest';
import { type CachedRetrieval, type RetrievalOptions, createQueryCache } from './cache.js';

function opts(companyId: string): RetrievalOptions {
  return { companyId, topK: 5, threshold: 0.5 };
}

function hit(sourceId: string): CachedRetrieval['results'][number] {
  return {
    sourceId,
    sourceType: 'ticket',
    chunkIndex: 0,
    contentText: `content of ${sourceId}`,
    similarity: 0.9,
  };
}

describe('QueryCache.invalidateByCompany', () => {
  it("removes only that company's entries and counts what it removed", () => {
    const cache = createQueryCache();
    cache.set('q1', opts('co-a'), [hit('a1')]);
    cache.set('q2', opts('co-a'), [hit('a2')]);
    cache.set('q1', opts('co-b'), [hit('b1')]);

    const removed = cache.invalidateByCompany('co-a');

    expect(removed).toBe(2);
    expect(cache.get('q1', opts('co-a'))).toBeNull();
    expect(cache.get('q2', opts('co-a'))).toBeNull();
    expect(cache.get('q1', opts('co-b'))?.results).toEqual([hit('b1')]);
    expect(cache.getStats().invalidations).toBe(2);
  });

  it('removes nothing and counts nothing for a company with no entries', () => {
    const cache = createQueryCache();
    cache.set('q1', opts('co-b'), [hit('b1')]);

    expect(cache.invalidateByCompany('co-a')).toBe(0);
    expect(cache.getStats()).toMatchObject({ entries: 1, invalidations: 0 });
  });

  it('does not leak the internal company tag onto a cache hit', () => {
    const cache = createQueryCache();
    cache.set('q1', opts('co-a'), [hit('a1')]);

    const cached = cache.get('q1', opts('co-a'));
    expect(cached).not.toBeNull();
    expect(Object.keys(cached ?? {}).sort()).toEqual(['cachedAt', 'hit', 'results']);
  });
});

describe('QueryCache.invalidateBySourceIds', () => {
  it('removes only entries whose results reference a deleted source', () => {
    const cache = createQueryCache();
    cache.set('q1', opts('co-a'), [hit('doc-1'), hit('doc-2')]);
    cache.set('q2', opts('co-a'), [hit('doc-3')]);
    cache.set('q3', opts('co-b'), [hit('doc-1')]);

    const removed = cache.invalidateBySourceIds(['doc-1', 'doc-unknown']);

    expect(removed).toBe(2);
    expect(cache.get('q1', opts('co-a'))).toBeNull();
    expect(cache.get('q3', opts('co-b'))).toBeNull();
    expect(cache.get('q2', opts('co-a'))?.results).toEqual([hit('doc-3')]);
    // Counts entries removed, not the number of IDs passed in.
    expect(cache.getStats().invalidations).toBe(2);
  });
});
