/**
 * ANN index — approximate nearest-neighbour search over stored embeddings.
 *
 * The retrieval path scores every stored chunk against the query on every
 * call (`rag/service.ts`, `listByCompany` then a full cosine scan). That is
 * O(N·D) per query: at 10k chunks and 768 dimensions it is ~7.7M multiply-adds
 * before any result is returned, and it grows linearly with the corpus.
 *
 * This index trades exactness for sublinear scan. Vectors are grouped into
 * clusters by k-means; a query scores the centroids, then scans only the
 * `nProbe` nearest clusters. Cost falls to roughly O(k·D + (N/k)·nProbe·D).
 *
 * Two properties make the approximation safe to reason about, and both are
 * pinned below:
 *
 *   - Probing every cluster is exactly brute force. Not "close to" — the same
 *     ids in the same order. That makes the index a superset of the exact
 *     path, with `nProbe` as the only knob that trades recall for speed.
 *   - Recall at a realistic `nProbe` is measured against brute-force ground
 *     truth rather than asserted, so a change that quietly degrades it fails.
 *
 * Determinism is a requirement, not a convenience: k-means seeded from
 * `Math.random` would make recall vary run to run and turn any recall
 * assertion into a flaky test.
 */

import { describe, expect, it } from 'vitest';

import { buildAnnIndex, queryAnnIndex } from './ann-index.js';
import { rankBySimilarity } from './retriever.js';

/** mulberry32 — small seeded PRNG so every fixture below is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, so cluster fixtures are gaussian rather than uniform blobs. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * `count` vectors drawn from `clusterCount` gaussian blobs — the shape real
 * embeddings actually have. Uniform noise would make every cluster equally
 * close to every query and measure nothing.
 */
function clusteredVectors(
  count: number,
  dimension: number,
  clusterCount: number,
  seed: number,
): { id: string; vector: number[] }[] {
  const rand = seededRandom(seed);
  const centres = Array.from({ length: clusterCount }, () =>
    Array.from({ length: dimension }, () => gaussian(rand) * 4),
  );
  return Array.from({ length: count }, (_, i) => {
    const centre = centres[i % clusterCount] as number[];
    return {
      id: `v${i}`,
      vector: centre.map((c) => c + gaussian(rand)),
    };
  });
}

const ids = (hits: { id: string }[]): string[] => hits.map((h) => h.id);

describe('buildAnnIndex / queryAnnIndex', () => {
  it('matches brute force exactly when every cluster is probed', () => {
    // The defining property: nProbe = clusterCount visits every vector, so
    // "approximate" collapses to exact. If this drifts, the index is not a
    // relaxation of the exact path but a different ranking altogether.
    const entries = clusteredVectors(300, 16, 8, 11);
    const index = buildAnnIndex(entries, { clusters: 8, seed: 7 });
    const query = entries[42]?.vector as number[];

    const approx = queryAnnIndex(index, query, {
      topK: 10,
      threshold: 0,
      nProbe: index.clusterCount,
    });
    const exact = rankBySimilarity(
      query,
      entries.map((e) => ({ id: e.id, vector: e.vector, meta: {} })),
      { topK: 10, threshold: 0 },
    );

    expect(ids(approx)).toEqual(ids(exact));
    for (const [i, hit] of approx.entries()) {
      expect(hit.similarity).toBeCloseTo(exact[i]?.similarity as number, 10);
    }
  });

  it('recovers most of the true top-10 while scanning a fraction of the corpus', () => {
    // Measured, not assumed. 2,000 vectors over 32 clusters, probing 6 —
    // roughly a fifth of the corpus scanned.
    const entries = clusteredVectors(2000, 32, 32, 3);
    const index = buildAnnIndex(entries, { clusters: 32, seed: 5 });
    const candidates = entries.map((e) => ({ id: e.id, vector: e.vector, meta: {} }));

    let hitCount = 0;
    let total = 0;
    const queries = clusteredVectors(40, 32, 32, 99);
    for (const q of queries) {
      const exact = new Set(
        ids(rankBySimilarity(q.vector, candidates, { topK: 10, threshold: 0 })),
      );
      const approx = queryAnnIndex(index, q.vector, { topK: 10, threshold: 0, nProbe: 6 });
      for (const id of ids(approx)) if (exact.has(id)) hitCount++;
      total += exact.size;
    }

    expect(hitCount / total).toBeGreaterThanOrEqual(0.9);
  });

  it('produces identical results for identical seeds', () => {
    const entries = clusteredVectors(200, 12, 6, 21);
    const query = entries[7]?.vector as number[];
    const opts = { topK: 5, threshold: 0, nProbe: 2 };

    const a = queryAnnIndex(buildAnnIndex(entries, { clusters: 6, seed: 4 }), query, opts);
    const b = queryAnnIndex(buildAnnIndex(entries, { clusters: 6, seed: 4 }), query, opts);

    expect(a).toEqual(b);
  });

  it('returns nothing for an empty index', () => {
    const index = buildAnnIndex([], { clusters: 8, seed: 1 });
    expect(index.size).toBe(0);
    expect(queryAnnIndex(index, [1, 0, 0], { topK: 5, threshold: 0 })).toEqual([]);
  });

  it('stays exact when there are fewer vectors than requested clusters', () => {
    // A brand-new company has a handful of chunks. k-means cannot produce 16
    // non-empty clusters from 3 points, and the index must degrade to a
    // correct answer rather than to empty clusters or a crash.
    const entries = [
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0.9, 0.1, 0] },
    ];
    const index = buildAnnIndex(entries, { clusters: 16, seed: 2 });
    const hits = queryAnnIndex(index, [1, 0, 0], {
      topK: 3,
      threshold: 0,
      nProbe: index.clusterCount,
    });
    expect(ids(hits)).toEqual(['a', 'c', 'b']);
  });

  it('scores a zero vector as no match, matching cosineSimilarity', () => {
    // `cosineSimilarity` returns 0 when either magnitude is 0 rather than
    // NaN. Normalising inside the index must not turn that into NaN, which
    // would sort unpredictably and poison the ranking.
    const index = buildAnnIndex(
      [
        { id: 'zero', vector: [0, 0, 0] },
        { id: 'real', vector: [1, 0, 0] },
      ],
      { clusters: 2, seed: 1 },
    );
    const hits = queryAnnIndex(index, [1, 0, 0], {
      topK: 5,
      threshold: -1,
      nProbe: index.clusterCount,
    });
    expect(hits.find((h) => h.id === 'zero')?.similarity).toBe(0);
  });

  it('drops hits below the threshold', () => {
    const index = buildAnnIndex(
      [
        { id: 'near', vector: [1, 0] },
        { id: 'far', vector: [0, 1] },
      ],
      { clusters: 2, seed: 1 },
    );
    const hits = queryAnnIndex(index, [1, 0], {
      topK: 5,
      threshold: 0.5,
      nProbe: index.clusterCount,
    });
    expect(ids(hits)).toEqual(['near']);
  });

  it('caps results at topK', () => {
    const entries = clusteredVectors(60, 8, 4, 13);
    const index = buildAnnIndex(entries, { clusters: 4, seed: 6 });
    const hits = queryAnnIndex(index, entries[0]?.vector as number[], {
      topK: 3,
      threshold: -1,
      nProbe: index.clusterCount,
    });
    expect(hits).toHaveLength(3);
  });

  it('applies the caller filter during the scan, not after slicing', () => {
    // `service.ts` excludes the source a turn is already reading. Filtering
    // after topK would silently return fewer than topK hits whenever an
    // excluded chunk ranked highly; filtering during the scan keeps topK
    // meaning "topK results".
    const entries = [
      { id: 'skip-1', vector: [1, 0] },
      { id: 'skip-2', vector: [0.99, 0.01] },
      { id: 'keep-1', vector: [0.9, 0.1] },
      { id: 'keep-2', vector: [0.8, 0.2] },
    ];
    const index = buildAnnIndex(entries, { clusters: 2, seed: 3 });
    const hits = queryAnnIndex(index, [1, 0], {
      topK: 2,
      threshold: -1,
      nProbe: index.clusterCount,
      filter: (id) => id.startsWith('keep'),
    });
    expect(ids(hits)).toEqual(['keep-1', 'keep-2']);
  });

  it('ranks by direction, not magnitude', () => {
    // Cosine is scale-invariant; a 100x-longer vector pointing the same way
    // must not outrank a closer-pointing one.
    const index = buildAnnIndex(
      [
        { id: 'long-but-off', vector: [50, 50] },
        { id: 'short-but-aligned', vector: [0.01, 0] },
      ],
      { clusters: 2, seed: 1 },
    );
    const hits = queryAnnIndex(index, [1, 0], {
      topK: 2,
      threshold: -1,
      nProbe: index.clusterCount,
    });
    expect(ids(hits)[0]).toBe('short-but-aligned');
  });
});
