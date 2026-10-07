/**
 * RagService — the one-call facade used by both the on-write indexer
 * and the agent-turn retriever. Composes chunker + embedder + repo + cache.
 *
 * Phase 5 — M29 (updated with cache and an optional ANN index).
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';
import type { AnnIndex } from './ann-index.js';
import { buildAnnIndex, queryAnnIndex } from './ann-index.js';

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
 */
export interface RagRepo {
  upsert(input: RagUpsertInput): string;
  deleteBySource(sourceId: string): number;
  listByCompany(companyId: string): RagEmbeddingRow[];
}

export interface RagServiceOptions {
  embedText: EmbedTextFn;
  dimension: number;
  repo: RagRepo;
  chunker?: ChunkOptions;
  /**
   * Replaces the built-in fixed-window chunker. The desktop app passes the
   * semantic chunker here while Settings → Enhanced AI → Semantic Chunking is
   * on; `chunker` options are ignored when this is set. Blank chunks are
   * skipped.
   */
  chunk?: (content: string) => string[] | Promise<string[]>;
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
   * Enable/disable caching at runtime.
   */
  enableCache?: boolean;
  /**
   * Approximate nearest-neighbour retrieval.
   *
   * The exact path scores every stored chunk on every query, which is fine
   * for a small corpus and quadratic-feeling once it is not. The index
   * partitions the company's vectors and scans only the nearest partitions.
   *
   * It engages only above `minVectors`, so a corpus below the floor keeps
   * today's exact behaviour unchanged. That floor is the safety property:
   * ANN is approximate, and silently trading recall for speed on a small
   * corpus would degrade answer quality for no measurable gain.
   */
  ann?: AnnRetrievalOptions;
}

export interface AnnRetrievalOptions {
  /** Default true — but inert until the corpus passes `minVectors`. */
  enabled?: boolean;
  /**
   * Corpus size at which the index starts being used. Default 4096: below
   * that a full scan costs single-digit milliseconds and exactness is free.
   */
  minVectors?: number;
  /** k-means partitions. Default √N. */
  clusters?: number;
  /**
   * Partitions scanned per query. Default ⌈clusters/3⌉, which measured ~97.5%
   * recall@10 on the clustered fixture in `ann-index.test.ts`.
   */
  nProbe?: number;
  /** Fixed by default, so cluster layout and recall are reproducible. */
  seed?: number;
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

export function createRagService(opts: RagServiceOptions): RagService {
  const now = opts.now ?? Date.now;
  const idGen =
    opts.idGen ??
    (() => `emb_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`);
  const chunkerOpts: ChunkOptions = opts.chunker ?? { maxTokens: 512, overlapTokens: 64 };
  const cache = opts.cache;
  const cacheEnabled = opts.enableCache !== false && !!cache;
  const cacheTtl = opts.cacheTtl ?? 300000; // 5 minutes default

  const annOpts = opts.ann ?? {};
  const annEnabled = annOpts.enabled !== false;
  const annMinVectors = annOpts.minVectors ?? 4096;

  /**
   * Per-company index, rebuilt whenever the company's vectors change.
   *
   * The write paths below drop the entry outright. `rowIds` catches what they
   * cannot see: rows changed by something other than this service instance
   * (another instance sharing the embeddings table). It must be the exact id
   * set, not a count — a re-index swaps ids one-for-one, so the count holds
   * steady while the cached layout stops covering the live rows.
   */
  const annIndexes = new Map<string, { index: AnnIndex; rowIds: ReadonlySet<string> }>();

  /** True when `rowIds` is exactly the id set of `rows` (ids are unique). */
  function coversExactly(rowIds: ReadonlySet<string>, rows: readonly RagEmbeddingRow[]): boolean {
    if (rowIds.size !== rows.length) return false;
    for (const row of rows) if (!rowIds.has(row.id)) return false;
    return true;
  }

  return {
    async indexSource(input: IndexSourceInput): Promise<number> {
      if (!input.content.trim()) return 0;

      const chunks = (
        opts.chunk ? await opts.chunk(input.content) : chunkText(input.content, chunkerOpts)
      ).filter((c) => c.trim().length > 0);
      if (chunks.length === 0) return 0;

      // Invalidate cache when indexing new content
      if (cache) {
        cache.invalidateByCompany(input.companyId);
      }
      // The partition layout was built from the old vector set. Drop it, or
      // the next retrieve answers from a snapshot that predates this write
      // and the new chunks are unreachable — silently, with no error.
      annIndexes.delete(input.companyId);

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

      // Rows of any other length (left behind by a different embedding model)
      // are skipped on both paths: no cosine against the query means anything.
      // The configured dimension wins over the query's when it is set, so a
      // stray query from the wrong model returns nothing rather than garbage.
      const dimension = opts.dimension > 0 ? opts.dimension : queryVector.length;
      if (queryVector.length !== dimension) return [];

      // Two ranking paths over the company's stored chunks: an exact
      // brute-force cosine scan, and — once the corpus reaches
      // `ann.minVectors` (and ANN is not disabled) — the in-process IVF index
      // from `ann-index.ts`, which scans only the nearest partitions.
      //
      // (The earlier sqlite-vec branch via `repo.similaritySearch` is gone:
      // its table was never created, so it threw on every call and fell
      // through to the scan. It was removed with its `forceBruteForce` hatch.)
      const rows = opts.repo.listByCompany(input.companyId);
      const exclude = new Set(input.excludeSourceIds ?? []);

      let results: RetrievalHit[];

      if (annEnabled && rows.length >= annMinVectors) {
        // Partitioned scan. Reuse the cached index when the corpus has not
        // moved; the rows themselves are re-read every call, so `contentText`
        // is always current even when the partition layout is not rebuilt.
        // The id-set check is O(N), against O(N·D) for the scoring it guards.
        let cachedIndex = annIndexes.get(input.companyId);
        if (!cachedIndex || !coversExactly(cachedIndex.rowIds, rows)) {
          cachedIndex = {
            index: buildAnnIndex(
              rows.map((row) => ({ id: row.id, vector: bufferToFloatArray(row.embedding) })),
              { clusters: annOpts.clusters, seed: annOpts.seed ?? 0x5eed, dimension },
            ),
            rowIds: new Set(rows.map((row) => row.id)),
          };
          annIndexes.set(input.companyId, cachedIndex);
        }

        const byId = new Map(rows.map((row) => [row.id, row]));
        const nProbe = annOpts.nProbe ?? Math.max(1, Math.ceil(cachedIndex.index.clusterCount / 3));

        results = queryAnnIndex(cachedIndex.index, queryVector, {
          topK: input.topK,
          threshold: input.threshold,
          nProbe,
          // Excluded sources are dropped inside the scan so they do not
          // consume slots out of topK.
          filter: (id) => {
            const row = byId.get(id);
            return row !== undefined && !exclude.has(row.sourceId);
          },
        }).flatMap((hit) => {
          const row = byId.get(hit.id);
          if (!row) return [];
          return [
            {
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              chunkIndex: row.chunkIndex,
              contentText: row.contentText,
              similarity: hit.similarity,
            },
          ];
        });
      } else {
        const ranked: RetrievalHit[] = [];
        for (const row of rows) {
          if (exclude.has(row.sourceId)) continue;
          const vector = bufferToFloatArray(row.embedding);
          if (vector.length !== dimension) continue;
          const similarity = cosineSimilarity(queryVector, vector);
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
      // This signature carries no companyId, so the owning company cannot be
      // identified — clear every layout rather than guess. Deletes are rare
      // and a rebuild is one k-means pass, so correctness wins over reuse.
      annIndexes.clear();
      return opts.repo.deleteBySource(sourceId);
    },

    invalidateCache(companyId: string): void {
      if (cache) {
        cache.invalidateByCompany(companyId);
      }
      annIndexes.delete(companyId);
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
