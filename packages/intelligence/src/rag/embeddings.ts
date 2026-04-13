/**
 * Embedding generator — converts text into vector representations.
 * Provider-agnostic: takes an EmbedTextFn callback wired to the
 * appropriate provider via provider-router. Respects invariant #5.
 * Phase 5 — M28.
 */

export type EmbedTextFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingGeneratorOptions {
  embedText: EmbedTextFn;
  dimension: number;
}

export interface EmbeddingGenerator {
  embed(texts: string[]): Promise<number[][]>;
  embedAsBuffers(texts: string[]): Promise<Buffer[]>;
  readonly dimension: number;
}

export function createEmbeddingGenerator(opts: EmbeddingGeneratorOptions): EmbeddingGenerator {
  const { embedText, dimension } = opts;

  return {
    dimension,

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      return embedText(texts);
    },

    async embedAsBuffers(texts: string[]): Promise<Buffer[]> {
      if (texts.length === 0) return [];
      const vectors = await embedText(texts);
      return vectors.map((vec) => {
        const arr = new Float32Array(vec);
        return Buffer.from(arr.buffer);
      });
    },
  };
}
