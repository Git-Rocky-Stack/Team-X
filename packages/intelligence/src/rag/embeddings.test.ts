import { describe, expect, it } from 'vitest';
import { createEmbeddingGenerator, type EmbedTextFn } from './embeddings.js';

const fakeEmbed: EmbedTextFn = async (texts) => {
  return texts.map((text) => {
    const dim = 4;
    return new Array(dim).fill(0).map((_, i) => (text.length + i) / 100);
  });
};

describe('EmbeddingGenerator', () => {
  it('generates embeddings for a single text', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed(['Hello world']);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveLength(4);
    expect(typeof results[0]![0]).toBe('number');
  });

  it('generates embeddings for multiple texts', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed(['First', 'Second', 'Third']);
    expect(results).toHaveLength(3);
  });

  it('converts vectors to Float32Array buffers', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const buffers = await gen.embedAsBuffers(['Hello world']);
    expect(buffers).toHaveLength(1);
    expect(buffers[0]).toBeInstanceOf(Buffer);
    expect(buffers[0]!.byteLength).toBe(16);
  });

  it('handles empty input', async () => {
    const gen = createEmbeddingGenerator({ embedText: fakeEmbed, dimension: 4 });
    const results = await gen.embed([]);
    expect(results).toHaveLength(0);
  });
});
