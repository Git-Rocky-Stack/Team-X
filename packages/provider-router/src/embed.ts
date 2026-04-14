/**
 * Embedding interface — the provider-router's single seam for
 * turning text into vectors. Mirrors the `ProviderStreamFn` pattern
 * for chat: a minimal adapter contract, a pure factory that enforces
 * invariants (dimension + count), and zero coupling to any specific
 * provider SDK outside the adapter files.
 *
 * Phase 5 — M29.
 */

export interface EmbedAdapter {
  readonly model: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export type EmbedTextFn = (texts: string[]) => Promise<number[][]>;

export function createEmbedText(adapter: EmbedAdapter): EmbedTextFn {
  return async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return [];
    const vectors = await adapter.embed(texts);

    if (vectors.length !== texts.length) {
      throw new Error(
        `embedText: adapter returned ${vectors.length} vectors for ${texts.length} inputs (count mismatch)`,
      );
    }
    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      if (!vec || vec.length !== adapter.dimension) {
        throw new Error(
          `embedText: vector ${i} has dimension ${vec?.length ?? 'undefined'}, expected ${adapter.dimension}`,
        );
      }
    }
    return vectors;
  };
}
