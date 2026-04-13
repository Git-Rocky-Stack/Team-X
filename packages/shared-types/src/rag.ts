/**
 * RAG (Retrieval-Augmented Generation) types for the intelligence layer.
 * Phase 5 — M28.
 */

/** Content sources that can be embedded and retrieved. */
export type EmbeddingSourceType =
  | 'message'
  | 'ticket'
  | 'vault_file'
  | 'meeting_minutes'
  | 'goal'
  | 'project';

/** A single chunk of embedded content (without the raw vector). */
export interface EmbeddingChunk {
  id: string;
  companyId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  chunkIndex: number;
  contentText: string;
  createdAt: number;
}

/** Result from RAG retrieval — chunk + similarity score. */
export interface RagRetrievalResult {
  chunk: EmbeddingChunk;
  /** Cosine similarity score (0-1). Higher = more relevant. */
  similarity: number;
  /** Human-readable label, e.g. "ticket #42" or "meeting 2026-04-10". */
  sourceLabel: string;
}

/** Configuration for RAG retrieval at agent turn time. */
export interface RagConfig {
  enabled: boolean;
  maxTokens: number;
  threshold: number;
  topK: number;
}

/** Default RAG configuration values. */
export const DEFAULT_RAG_CONFIG: RagConfig = {
  enabled: true,
  maxTokens: 2000,
  threshold: 0.7,
  topK: 5,
};
