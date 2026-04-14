/**
 * RagService — the one-call facade used by both the on-write indexer
 * and the agent-turn retriever. Composes chunker + embedder + repo.
 *
 * Phase 5 — M29.
 */

import type { EmbeddingSourceType } from '@team-x/shared-types';

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
 * Matches `createEmbeddingsRepo` return value shape; a fake can be
 * a plain object with these three methods.
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
  now?: () => number;
  idGen?: () => string;
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

  return {
    async indexSource(input: IndexSourceInput): Promise<number> {
      if (!input.content.trim()) return 0;

      const chunks = chunkText(input.content, chunkerOpts);
      if (chunks.length === 0) return 0;

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

      const vectors = await opts.embedText([input.query]);
      const queryVector = vectors[0];
      if (!queryVector) return [];

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
      return ranked.slice(0, input.topK);
    },

    deleteBySource(sourceId: string): number {
      return opts.repo.deleteBySource(sourceId);
    },
  };
}
