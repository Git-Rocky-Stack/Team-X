/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * Complete RAG pipeline for semantic search and retrieval.
 * Phase 5 — M28 (updated with semantic chunking v2).
 */

// V2 chunker with semantic awareness
export {
  chunkText,
  semanticChunk,
  analyzeTextForChunking,
  detectContentType,
  detectBoundaries,
  createTokenCounter,
  type SemanticChunkOptions,
  type Chunk,
  type ContentType,
  type TokenCounter,
} from './chunker-v2.js';

// V1 chunker (backward compatible)
export { chunkText as chunkTextV1, type ChunkOptions as ChunkOptionsV1 } from './chunker.js';
export {
  createEmbeddingGenerator,
  type EmbedTextFn,
  type EmbeddingGenerator,
  type EmbeddingGeneratorOptions,
} from './embeddings.js';
export {
  cosineSimilarity,
  rankBySimilarity,
  type SimilarityCandidate,
  type RankOptions,
  type RankedResult,
} from './retriever.js';
// Approximate retrieval. `service.ts` drives this itself once a company's
// corpus passes the floor; exported so callers can tune or disable it, and so
// the index is usable directly for ranking outside the RAG service.
export {
  buildAnnIndex,
  queryAnnIndex,
  type AnnEntry,
  type AnnIndex,
  type AnnIndexOptions,
  type AnnQueryOptions,
  type AnnHit,
} from './ann-index.js';
export {
  createRagService,
  type RagService,
  type RagServiceOptions,
  type RagRepo,
  type RagEmbeddingRow,
  type RagUpsertInput,
  type IndexSourceInput,
  type RetrieveInput,
  type RetrievalHit,
  type AnnRetrievalOptions,
} from './service.js';
export {
  createQueryCache,
  QueryCache,
  createCacheKey,
  type CacheOptions,
  type CachedRetrieval,
  type CacheStats,
  type RetrievalOptions,
} from './cache.js';
export {
  rerank,
  createRerankerService,
  createLexicalCrossEncoder,
  createApiCrossEncoder,
  retrieveWithRerank,
  extractContentFromHits,
  rerankedToHits,
  type RerankResult,
  type RerankerOptions,
  type RerankerService,
  type CrossEncoderScoreFn,
  type ApiCrossEncoderOptions,
} from './reranker.js';
export {
  StructuredLogger,
  createRAGLoggingContext,
  createLoggedRagService,
  createSessionId,
  hashQuery,
  getLoggingSummary,
  type RetrievalLogEntry,
  type EmbeddingLogEntry,
  type IndexingLogEntry,
  type LoggerOptions,
  type RAGLoggingContext,
  type LoggedRagServiceOptions,
} from './logging.js';
export {
  createQueryExpansionService,
  expandQuerySemantically,
  expandQueryWithSynonyms,
  expandQueryWithEntities,
  expandQueryWithHyDE,
  expandQueryCombined,
  type QueryExpansionService,
  type EntityContext,
  type ExpandedQuery,
  type HyDEOptions,
} from './query-expansion.js';
