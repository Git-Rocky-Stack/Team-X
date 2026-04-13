import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world', { maxTokens: 512, overlapTokens: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world');
  });

  it('splits long text into overlapping chunks', () => {
    const sentences = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} with some content.`);
    const longText = sentences.join(' ');
    const chunks = chunkText(longText, { maxTokens: 50, overlapTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // Verify content continuity: last word of chunk i should appear in chunk i+1
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i]!;
      const nextChunk = chunks[i + 1]!;
      const currentWords = currentChunk.split(/\s+/);
      const nextWords = nextChunk.split(/\s+/);
      const lastWords = currentWords.slice(-10);
      const hasOverlap = lastWords.some((w) => nextChunk.includes(w));
      expect(hasOverlap).toBe(true);
    }
  });

  it('preserves all content across chunks', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const longText = words.join(' ');
    const chunks = chunkText(longText, { maxTokens: 80, overlapTokens: 10 });
    for (const word of words) {
      const found = chunks.some((c) => c.includes(word));
      expect(found, `"${word}" missing`).toBe(true);
    }
  });

  it('handles empty text', () => {
    expect(chunkText('', { maxTokens: 512, overlapTokens: 64 })).toHaveLength(0);
  });

  it('respects sentence boundaries when possible', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const chunks = chunkText(text, { maxTokens: 10, overlapTokens: 2 });
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (chunk !== chunks[chunks.length - 1]) {
        expect(trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')).toBe(true);
      }
    }
  });

  it('uses default options when none provided', () => {
    expect(chunkText('Short text')).toHaveLength(1);
  });
});
