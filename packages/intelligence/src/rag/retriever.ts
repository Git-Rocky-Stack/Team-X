/**
 * Vector similarity retriever — brute-force fallback for when sqlite-vec
 * is not available, plus shared cosine similarity math.
 * Phase 5 — M28.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
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
  return candidates
    .map((c) => ({
      id: c.id,
      similarity: cosineSimilarity(query, c.vector),
      meta: c.meta,
    }))
    .filter((r) => r.similarity >= options.threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.topK);
}
