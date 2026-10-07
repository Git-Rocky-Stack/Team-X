/**
 * Vector similarity math shared by the retrieval paths: cosine similarity and
 * an exact brute-force ranking. `service.ts` scores with `cosineSimilarity` on
 * its exact path; `ann-index.ts` is checked against `rankBySimilarity` as
 * ground truth. (sqlite-vec was removed entirely — there is no native path.)
 * Phase 5 — M28.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  // Vectors of different lengths come from different embedding spaces.
  // Scoring the shared prefix made [1, 0] a perfect match for
  // [1, 0, 0, 0, 9, 9]; report no similarity instead, as for a zero vector.
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) continue;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface SimilarityCandidate<T = unknown> {
  id: string;
  vector: number[];
  meta: T;
}

export interface RankOptions {
  topK: number;
  threshold: number;
}

export interface RankedResult<T = unknown> {
  id: string;
  similarity: number;
  meta: T;
}

export function rankBySimilarity<T>(
  query: number[],
  candidates: SimilarityCandidate<T>[],
  options: RankOptions,
): RankedResult<T>[] {
  // Mismatched-dimension candidates are skipped outright rather than scored
  // 0, which would still pass a threshold of 0 or below. This matches the
  // ANN index, which leaves them out of the index entirely.
  return candidates
    .filter((c) => c.vector.length === query.length)
    .map((c) => ({
      id: c.id,
      similarity: cosineSimilarity(query, c.vector),
      meta: c.meta,
    }))
    .filter((r) => r.similarity >= options.threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.topK);
}
