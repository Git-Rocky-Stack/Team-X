/**
 * RagService — the one-call facade used by both the on-write indexer
 * and the agent-turn retriever. Composes chunker + embedder + repo + cache.
 *
 * Phase 5 — M29 (updated with cache, sqlite-vec accelerated retrieval).
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';

import type { QueryCache, RetrievalOptions } from './cache.js';
import { type ChunkOptions, chunkText } from './chunker.js';
import type { EmbedTextFn } from './embeddings.js';
import { cosineSimilarity } from './retriever.js';

export interface RagEmbeddingRow {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  embedding: Buffer;
  createdAt: number;
}

export interface RagUpsertInput {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  embedding: Buffer;
  createdAt: number;
}

/**
 * Structural interface the service needs from the embeddings repo.
 * Updated to include the new similaritySearch method.
 */
export interface RagRepo {
  upsert(input: RagUpsertInput): string;
  deleteBySource(sourceId: string): number;
  listByCompany(companyId: string): RagEmbeddingRow[];
  /**
   * Fast similarity search using sqlite-vec.
   * If not available, falls back to listByCompany + brute force.
   */
  similaritySearch?(input: {
    companyId: string;
    queryVector: Float32Array;
    topK: number;
    threshold: number;
    excludeSourceIds?: string[];
  }): Promise<
    Array<{
      id: string;
      sourceId: string;
      sourceType: EmbeddingSourceType;
      chunkIndex: number;
      contentText: string;
      similarity: number;
    }>
  >;
}

export interface RagServiceOptions {
  embedText: EmbedTextFn;
  dimension: number;
  repo: RagRepo;
  chunker?: ChunkOptions;
  now?: () => number;
  idGen?: () => string;
  /**
   * Optional query cache for improved performance.
   * If provided, will cache retrieval results.
   */
  cache?: QueryCache;
  /**
   * Default TTL for cached results (ms).
   */
  cacheTtl?: number;
  /**
   * Force fallback to brute-force retrieval even if similaritySearch is available.
   * Useful for testing or when sqlite-vec is not available.
   */
  forceBruteForce?: boolean;
  /**
   * Enable/disable caching at runtime.
   */
  enableCache?: boolean;
}

export interface IndexSourceInput {
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
}

export interface RetrieveInput {
  companyId: string;
  query: string;
  topK: number;
  threshold: number;
  excludeSourceIds?: string[];
}

export interface RetrievalHit {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  similarity: number;
}

export interface RagService {
  indexSource(input: IndexSourceInput): Promise<number>;
  retrieve(input: RetrieveInput): Promise<RetrievalHit[]>;
  deleteBySource(sourceId: string): number;
  /**
   * Invalidate cache for a company.
   * Call when content is added/updated/deleted.
   */
  invalidateCache?(companyId: string): void;
  /**
   * Get cache statistics.
   */
  getCacheStats?(): ReturnType<QueryCache['getStats']>;
}

function bufferToFloatArray(buf: Buffer): number[] {
  const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(view);
}

function floatArrayToBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

/**
 * Normalize a vector to unit length (L2 normalization).
 * Required for sqlite-vec distance calculations to work correctly.
 */
function normalizeVector(vec: number[]): number[] {
  let sumSquares = 0;
  for (const v of vec) {
    sumSquares += v * v;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

export function createRagService(opts: RagServiceOptions): RagService {
  const now = opts.now ?? Date.now;
  const idGen =
    opts.idGen ??
    (() => `emb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`);
  const chunkerOpts: ChunkOptions = opts.chunker ?? { maxTokens: 512, overlapTokens: 64 };
  const cache = opts.cache;
  const cacheEnabled = opts.enableCache !== false && !!cache;
  const cacheTtl = opts.cacheTtl ?? 300000; // 5 minutes default

  return {
    async indexSource(input: IndexSourceInput): Promise<number> {
      if (!input.content.trim()) return 0;

      const chunks = chunkText(input.content, chunkerOpts);
      if (chunks.length === 0) return 0;

      // Invalidate cache when indexing new content
      if (cache) {
        cache.invalidateByCompany(input.companyId);
      }

      // Upsert is idempotent on (sourceId, chunkIndex), but a shorter
      // re-index (fewer chunks than last time) would leave stale rows.
      // Delete first, then bulk re-add.
      opts.repo.deleteBySource(input.sourceId);

      const vectors = await opts.embedText(chunks);
      const ts = now();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vec = vectors[i];
        if (chunk === undefined || vec === undefined) continue;
        opts.repo.upsert({
          id: idGen(),
          companyId: input.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          chunkIndex: i,
          contentText: chunk,
          embedding: floatArrayToBuffer(vec),
          createdAt: ts,
        });
      }

      return chunks.length;
    },

    async retrieve(input: RetrieveInput): Promise<RetrievalHit[]> {
      if (!input.query.trim()) return [];

      // Check cache first
      if (cacheEnabled && cache) {
        const retrievalOptions: RetrievalOptions = {
          companyId: input.companyId,
          topK: input.topK,
          threshold: input.threshold,
          excludeSourceIds: input.excludeSourceIds,
        };

        const cached = cache.get(input.query, retrievalOptions);
        if (cached) {
          // Return cached results
          return cached.results.map((r) => ({
            sourceType: r.sourceType as EmbeddingSourceType,
            sourceId: r.sourceId,
            chunkIndex: r.chunkIndex,
            contentText: r.contentText,
            similarity: r.similarity,
          }));
        }
      }

      // Cache miss - perform actual retrieval
      const vectors = await opts.embedText([input.query]);
      const queryVector = vectors[0];
      if (!queryVector) return [];

      // Normalize query vector for sqlite-vec
      const normalizedQuery = new Float32Array(normalizeVector(queryVector));

      let results: Array<{
        sourceType: EmbeddingSourceType;
        sourceId: string;
        chunkIndex: number;
        contentText: string;
        similarity: number;
      }> = [];

      // Try sqlite-vec accelerated search first
      if (!opts.forceBruteForce && opts.repo.similaritySearch) {
        try {
          const vecResults = await opts.repo.similaritySearch({
            companyId: input.companyId,
            queryVector: normalizedQuery,
            topK: input.topK,
            threshold: input.threshold,
            excludeSourceIds: input.excludeSourceIds,
          });

          results = vecResults.map((r) => ({
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            chunkIndex: r.chunkIndex,
            contentText: r.contentText,
            similarity: r.similarity,
          }));
        } catch (error) {
          // Fall through to brute force if similaritySearch fails
          const errMsg = error instanceof Error ? error.message : String(error);
          console.warn('[RAG] similaritySearch failed, falling back to brute force:', errMsg);
        }
      }

      // Fallback: brute-force cosine similarity (original implementation)
      if (results.length === 0) {
        const rows = opts.repo.listByCompany(input.companyId);
        const exclude = new Set(input.excludeSourceIds ?? []);

        const ranked: RetrievalHit[] = [];
        for (const row of rows) {
          if (exclude.has(row.sourceId)) continue;
          const similarity = cosineSimilarity(queryVector, bufferToFloatArray(row.embedding));
          if (similarity < input.threshold) continue;
          ranked.push({
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            chunkIndex: row.chunkIndex,
            contentText: row.contentText,
            similarity,
          });
        }

        ranked.sort((a, b) => b.similarity - a.similarity);
        results = ranked.slice(0, input.topK);
      }

      // Store in cache if enabled
      if (cacheEnabled && cache) {
        const retrievalOptions: RetrievalOptions = {
          companyId: input.companyId,
          topK: input.topK,
          threshold: input.threshold,
          excludeSourceIds: input.excludeSourceIds,
        };

        cache.set(input.query, retrievalOptions, results, cacheTtl);
      }

      return results;
    },

    deleteBySource(sourceId: string): number {
      // Invalidate cache when deleting
      if (cache) {
        cache.invalidateBySourceIds([sourceId]);
      }
      return opts.repo.deleteBySource(sourceId);
    },

    invalidateCache(companyId: string): void {
      if (cache) {
        cache.invalidateByCompany(companyId);
      }
    },

    getCacheStats() {
      if (!cache) {
        return {
          entries: 0,
          totalLookups: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          evictions: 0,
          invalidations: 0,
          estimatedSizeBytes: 0,
        };
      }
      return cache.getStats();
    },
  };
}
