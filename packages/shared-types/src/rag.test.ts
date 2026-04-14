import { describe, expect, it } from 'vitest';
import type { EmbeddingChunk, EmbeddingSourceType, RagRetrievalResult } from './rag.js';

describe('RAG types', () => {
  it('EmbeddingSourceType is a valid union', () => {
    const types: EmbeddingSourceType[] = [
      'message',
      'ticket',
      'vault_file',
      'meeting_minutes',
      'goal',
      'project',
    ];
    expect(types).toHaveLength(6);
  });

  it('EmbeddingChunk has required fields', () => {
    const chunk: EmbeddingChunk = {
      id: 'emb-1',
      companyId: 'co-1',
      sourceType: 'message',
      sourceId: 'msg-1',
      chunkIndex: 0,
      contentText: 'Hello world',
      createdAt: Date.now(),
    };
    expect(chunk.sourceType).toBe('message');
    expect(chunk.chunkIndex).toBe(0);
  });

  it('RagRetrievalResult includes similarity score', () => {
    const result: RagRetrievalResult = {
      chunk: {
        id: 'emb-1',
        companyId: 'co-1',
        sourceType: 'ticket',
        sourceId: 'tkt-1',
        chunkIndex: 0,
        contentText: 'Fix the login bug',
        createdAt: Date.now(),
      },
      similarity: 0.85,
      sourceLabel: 'ticket #42',
    };
    expect(result.similarity).toBeGreaterThan(0.7);
  });
});
