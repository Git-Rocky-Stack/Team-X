import { describe, expect, it } from 'vitest';
import { cosineSimilarity, rankBySimilarity } from './retriever.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0, 0], [1, 0, 0, 0])).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('handles non-unit vectors', () => {
    expect(cosineSimilarity([3, 4], [3, 4])).toBeCloseTo(1.0, 5);
  });

  it('scores vectors of different dimensions as no match', () => {
    // Comparing only the shared prefix made [1, 0] a "perfect" match for
    // [1, 0, 0, 0, 9, 9]. Vectors from different embedding spaces have no
    // meaningful cosine.
    expect(cosineSimilarity([1, 0], [1, 0, 0, 0, 9, 9])).toBe(0);
    expect(cosineSimilarity([1, 0, 0, 0], [1, 0])).toBe(0);
  });
});

describe('rankBySimilarity', () => {
  it('returns top-k results sorted by similarity', () => {
    const query = [1, 0, 0];
    const candidates = [
      { id: 'a', vector: [1, 0, 0], meta: { text: 'exact' } },
      { id: 'b', vector: [0, 1, 0], meta: { text: 'orthogonal' } },
      { id: 'c', vector: [0.9, 0.1, 0], meta: { text: 'close' } },
      { id: 'd', vector: [0.5, 0.5, 0], meta: { text: 'partial' } },
    ];
    const results = rankBySimilarity(query, candidates, { topK: 2, threshold: 0.0 });
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('a');
    expect(results[1]?.id).toBe('c');
  });

  it('filters by threshold', () => {
    const results = rankBySimilarity(
      [1, 0],
      [
        { id: 'a', vector: [1, 0], meta: {} },
        { id: 'b', vector: [0, 1], meta: {} },
      ],
      { topK: 10, threshold: 0.5 },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('a');
  });

  it('skips candidates whose dimension differs from the query', () => {
    // Consistent with the ANN index, which leaves such vectors out entirely:
    // a 0 score would still pass a threshold of 0 or below.
    const results = rankBySimilarity(
      [1, 0, 0],
      [
        { id: 'a', vector: [1, 0, 0], meta: {} },
        { id: 'short', vector: [1, 0], meta: {} },
        { id: 'long', vector: [1, 0, 0, 1], meta: {} },
      ],
      { topK: 10, threshold: -1 },
    );
    expect(results.map((r) => r.id)).toEqual(['a']);
  });

  it('returns empty when nothing exceeds threshold', () => {
    const results = rankBySimilarity([1, 0], [{ id: 'a', vector: [0, 1], meta: {} }], {
      topK: 10,
      threshold: 0.9,
    });
    expect(results).toHaveLength(0);
  });
});
