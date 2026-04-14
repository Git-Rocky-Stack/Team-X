import { describe, expect, it, vi } from 'vitest';
import { type EmbedAdapter, createEmbedText } from './embed.js';

describe('createEmbedText', () => {
  it('delegates to the adapter for a single text', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4])),
    };
    const embed = createEmbedText(adapter);
    const result = await embed(['hello']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(adapter.embed).toHaveBeenCalledWith(['hello']);
  });

  it('returns empty for empty input without calling adapter', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: vi.fn(),
    };
    const embed = createEmbedText(adapter);
    const result = await embed([]);
    expect(result).toEqual([]);
    expect(adapter.embed).not.toHaveBeenCalled();
  });

  it('throws if adapter returns wrong dimension', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 4,
      embed: async () => [[0.1, 0.2]],
    };
    const embed = createEmbedText(adapter);
    await expect(embed(['x'])).rejects.toThrow(/dimension/i);
  });

  it('throws if adapter returns wrong count', async () => {
    const adapter: EmbedAdapter = {
      model: 'test-model',
      dimension: 2,
      embed: async () => [[0.1, 0.2]],
    };
    const embed = createEmbedText(adapter);
    await expect(embed(['x', 'y'])).rejects.toThrow(/count/i);
  });
});
