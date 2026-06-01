// packages/local-gguf-runtime/src/metadata/embedding-arches.test.ts
import { describe, expect, it } from 'vitest';
import { isEmbeddingArch } from './embedding-arches';

describe('isEmbeddingArch', () => {
  it('returns true for the curated embedding architectures', () => {
    for (const arch of ['bert', 'nomic-bert', 'xlm-roberta', 'e5', 'bge', 't5', 'mpnet']) {
      expect(isEmbeddingArch(arch)).toBe(true);
    }
  });

  it('returns true for the S3 embedding fixtures (nomic-bert, bert)', () => {
    expect(isEmbeddingArch('nomic-bert')).toBe(true);
    expect(isEmbeddingArch('bert')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isEmbeddingArch('BERT')).toBe(true);
    expect(isEmbeddingArch('Nomic-BERT')).toBe(true);
    expect(isEmbeddingArch('XLM-RoBERTa')).toBe(true);
  });

  it('returns false for generative architectures', () => {
    for (const arch of ['llama', 'qwen2', 'gemma2', 'phi3', 'deepseek2', 'mistral']) {
      expect(isEmbeddingArch(arch)).toBe(false);
    }
  });

  it('returns false for unknown / empty arch', () => {
    expect(isEmbeddingArch('')).toBe(false);
    expect(isEmbeddingArch('unknown')).toBe(false);
    expect(isEmbeddingArch('not-an-arch')).toBe(false);
  });
});
