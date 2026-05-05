/**
 * Cross-Encoder Reranker for RAG
 *
 * Reranks retrieval results using a cross-encoder model for improved precision.
 * Cross-encoders take (query, document) pairs and output relevance scores.
 * They're more accurate than bi-encoders but slower, so we only use them on top-K results.
 *
 * Expected improvement: 10-20% increase in Precision@5
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

export interface RerankResult {
  /** Document ID */
  id: string;

  /** Source ID */
  sourceId: string;

  /** Source type */
  sourceType: string;

  /** Chunk index */
  chunkIndex: number;

  /** Document content */
  content: string;

  /** Original retrieval score (bi-encoder) */
  originalScore: number;

  /** Reranked score (cross-encoder) */
  rerankedScore: number;

  /** Combined/hybrid score */
  finalScore: number;
}

/**
 * Options for reranking.
 */
export interface RerankerOptions {
  /** Number of top results to rerank */
  topN?: number;

  /** Weight for original score in final score (0-1) */
  originalWeight?: number;

  /** Weight for reranked score in final score (0-1) */
  rerankWeight?: number;

  /** Minimum relevance threshold */
  threshold?: number;

  /** Whether to normalize scores before combining */
  normalize?: boolean;
}

/**
 * Cross-encoder scoring function signature.
 *
 * Takes a query and document, returns a relevance score (0-1).
 * Can be implemented with:
 * - Local model (e.g., Transformers.js)
 * - API (e.g., OpenAI, Cohere Rerank)
 * - Mock for testing
 */
export type CrossEncoderScoreFn = (
  query: string,
  documents: Array<{
    id: string;
    content: string;
  }>,
) => Promise<Array<{ id: string; score: number }>>;

/**
 * Create a mock cross-encoder for testing.
 * Uses lexical overlap as a proxy for semantic relevance.
 */
export function createMockCrossEncoder(): CrossEncoderScoreFn {
  return async (query, documents) => {
    const queryTerms = new Set(query.toLowerCase().match(/[a-z0-9]+/g) || []);

    return documents.map((doc) => {
      const content = doc.content.toLowerCase();
      let matches = 0;
      for (const term of queryTerms) {
        if (content.includes(term)) matches++;
      }
      const score = queryTerms.size > 0 ? matches / queryTerms.size : 0;
      return { id: doc.id, score };
    });
  };
}

/**
 * Create a cross-encoder using an API service.
 *
 * Supports:
 * - Cohere Rerank API: https://docs.cohere.com/reference/rerank
 * - OpenAI custom fine-tunes
 * - Custom endpoints
 */
export interface ApiCrossEncoderOptions {
  /** API base URL */
  baseURL: string;

  /** API key */
  apiKey: string;

  /** Model name */
  model: string;

  /** Fetch implementation */
  fetchImpl?: typeof fetch;

  /** Request timeout in ms */
  timeout?: number;
}

export function createApiCrossEncoder(opts: ApiCrossEncoderOptions): CrossEncoderScoreFn {
  const { baseURL, apiKey, model, fetchImpl = fetch, timeout = 10000 } = opts;

  return async (query, documents) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetchImpl(`${baseURL}/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          query,
          documents: documents.map((d) => ({ id: d.id, text: d.content })),
          top_n: documents.length,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Cross-encoder API failed: ${response.status} ${body}`);
      }

      const json = (await response.json()) as {
        results: Array<{ index: number; relevance_score: number }>;
      };
      const results = json.results;

      return results.map((r) => ({
        id: documents[r.index]?.id ?? '',
        score: r.relevance_score,
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Rerank retrieval results using a cross-encoder.
 */
export async function rerank(
  query: string,
  candidates: Array<{
    id: string;
    sourceId: string;
    sourceType: string;
    chunkIndex: number;
    content: string;
    score: number;
  }>,
  scoreFn: CrossEncoderScoreFn,
  options: RerankerOptions = {},
): Promise<RerankResult[]> {
  const {
    topN = candidates.length,
    originalWeight = 0.3,
    rerankWeight = 0.7,
    threshold = 0.0,
    normalize = true,
  } = options;

  // Score all candidates with cross-encoder
  const scores = await scoreFn(
    query,
    candidates.map((c) => ({ id: c.id, content: c.content })),
  );

  // Create a map of id -> score
  const scoreMap = new Map(scores.map((s) => [s.id, s.score]));

  // Compute reranked results
  const reranked: RerankResult[] = candidates.map((candidate) => {
    const originalScore = candidate.score;
    const rerankedScore = scoreMap.get(candidate.id) ?? 0;

    // Normalize scores if requested
    const maxOriginal = Math.max(...candidates.map((c) => c.score), 1);
    const maxRerank = Math.max(...Array.from(scoreMap.values()), 1);

    const normalizedOriginal = normalize ? originalScore / maxOriginal : originalScore;
    const normalizedRerank = normalize ? rerankedScore / maxRerank : rerankedScore;

    // Compute final weighted score
    const finalScore = normalizedOriginal * originalWeight + normalizedRerank * rerankWeight;

    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      sourceType: candidate.sourceType,
      chunkIndex: candidate.chunkIndex,
      content: candidate.content,
      originalScore,
      rerankedScore,
      finalScore,
    };
  });

  // Filter by threshold and sort by final score
  return reranked
    .filter((r) => r.finalScore >= threshold)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topN);
}

/**
 * Create a reranking service.
 */
export interface RerankerService {
  /**
   * Rerank retrieval results.
   */
  rerank(
    query: string,
    candidates: Array<{
      id: string;
      sourceId: string;
      sourceType: string;
      chunkIndex: number;
      content: string;
      score: number;
    }>,
  ): Promise<RerankResult[]>;

  /**
   * Get reranking statistics.
   */
  getStats(): {
    totalReranks: number;
    totalCandidates: number;
    avgCandidatesPerRerank: number;
  };
}

export function createRerankerService(
  scoreFn: CrossEncoderScoreFn,
  options?: RerankerOptions,
): RerankerService {
  const opts = options || {};
  let totalReranks = 0;
  let totalCandidates = 0;

  return {
    async rerank(query, candidates) {
      totalReranks++;
      totalCandidates += candidates.length;

      return rerank(query, candidates, scoreFn, opts);
    },

    getStats() {
      return {
        totalReranks,
        totalCandidates,
        avgCandidatesPerRerank: totalReranks > 0 ? totalCandidates / totalReranks : 0,
      };
    },
  };
}

/**
 * Utility to extract content from retrieval hits for reranking.
 */
export function extractContentFromHits(
  hits: Array<{
    id: string;
    sourceId: string;
    sourceType: string;
    chunkIndex: number;
    contentText: string;
    similarity: number;
  }>,
): Array<{
  id: string;
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  score: number;
}> {
  return hits.map((h) => ({
    id: h.id,
    sourceId: h.sourceId,
    sourceType: h.sourceType,
    chunkIndex: h.chunkIndex,
    content: h.contentText,
    score: h.similarity,
  }));
}

/**
 * Convert reranked results back to retrieval hits format.
 */
export function rerankedToHits(reranked: RerankResult[]): Array<{
  id: string;
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  contentText: string;
  similarity: number;
}> {
  return reranked.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    sourceType: r.sourceType,
    chunkIndex: r.chunkIndex,
    contentText: r.content,
    similarity: r.finalScore,
  }));
}

/**
 * Integration helper: Rerank with automatic top-N selection.
 *
 * Reranks the top-N results from a larger retrieval set.
 * This is the recommended pattern: retrieve 20-50, rerank top 20, return top 10.
 */
export async function retrieveWithRerank(
  query: string,
  initialRetrieve: (topK: number) => Promise<
    Array<{
      id: string;
      sourceId: string;
      sourceType: string;
      chunkIndex: number;
      contentText: string;
      similarity: number;
    }>
  >,
  scoreFn: CrossEncoderScoreFn,
  options: {
    initialK?: number; // Initial retrieval count (default: 20)
    rerankTopN?: number; // How many to rerank (default: 20)
    returnTopK?: number; // Final return count (default: 10)
  } = {},
): Promise<
  Array<{
    id: string;
    sourceId: string;
    sourceType: string;
    chunkIndex: number;
    contentText: string;
    similarity: number;
  }>
> {
  const { initialK = 20, rerankTopN = 20, returnTopK = 10 } = options;

  // Step 1: Retrieve initial results
  const initial = await initialRetrieve(initialK);

  // Step 2: Rerank top candidates
  const candidates = extractContentFromHits(initial.slice(0, rerankTopN));
  const reranked = await rerank(query, candidates, scoreFn);

  // Step 3: Return top-K reranked results
  return rerankedToHits(reranked.slice(0, returnTopK));
}
