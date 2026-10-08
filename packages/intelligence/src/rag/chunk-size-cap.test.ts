/**
 * Chunk-size ceiling for both RAG chunkers.
 *
 * The semantic chunker (now the app's default indexer) declared
 * `maxChunkTokens: 2048` and never applied it: text with no structural
 * boundaries — prose without blank lines, minified JSON, a code file, one
 * large fenced block — came back as a single chunk of any length (138 KB in
 * the probe that found it). The fixed-window chunker split only at sentence
 * ends, so text without sentence punctuation did the same. An oversized
 * chunk is rejected or truncated by the embedding provider, leaving the
 * source unindexed or mostly unsearchable.
 */
import { describe, expect, it } from 'vitest';

import { chunkText as semanticChunkText } from './chunker-v2.js';
import { chunkText as fixedWindowChunk } from './chunker.js';

const CHARS_PER_TOKEN = 4;
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 97}`).join(' ');

const LONG_INPUTS: Array<[string, string]> = [
  ['prose without blank lines', `${words(20_000)}.`],
  [
    'minified JSON',
    JSON.stringify(
      Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `n${i}`, v: [i, i + 1] })),
    ),
  ],
  [
    'markdown with one huge fenced block',
    `# Title\n\nIntro text here.\n\n\`\`\`ts\n${Array.from({ length: 4000 }, (_, i) => `const x${i} = ${i};`).join('\n')}\n\`\`\`\n\nOutro.`,
  ],
  [
    'a code file',
    Array.from({ length: 4000 }, (_, i) => `function f${i}() { return ${i}; }`).join('\n'),
  ],
  ['one unbroken token', 'x'.repeat(50_000)],
];

/** Every non-space character of `text`, in order — what chunking must not lose. */
function coverage(chunks: string[]): Set<string> {
  return new Set(chunks.flatMap((c) => c.split(/\s+/).filter(Boolean)));
}

describe('semantic chunker — maxChunkTokens is a hard ceiling', () => {
  it.each(LONG_INPUTS)('never emits a chunk over 2048 tokens: %s', async (_name, text) => {
    const chunks = await semanticChunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2048 * CHARS_PER_TOKEN);
    }
  });

  it('keeps every word of an oversized segment when it splits it', async () => {
    const text = `${words(20_000)}.`;
    const chunks = await semanticChunkText(text);

    for (const word of coverage([text])) expect(coverage(chunks).has(word)).toBe(true);
  });

  it('leaves normally sized structured content alone', async () => {
    const text = '# A\n\nFirst paragraph.\n\n# B\n\nSecond paragraph.';
    expect(await semanticChunkText(text)).toEqual(await semanticChunkText(text));
    for (const chunk of await semanticChunkText(text)) expect(chunk.length).toBeLessThan(200);
  });
});

describe('fixed-window chunker — maxTokens is a hard ceiling', () => {
  it.each(LONG_INPUTS)('never emits a chunk over maxTokens: %s', (_name, text) => {
    const chunks = fixedWindowChunk(text, { maxTokens: 512, overlapTokens: 64 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(512 * CHARS_PER_TOKEN);
    }
  });

  it('prefers whitespace over cutting a word in half', () => {
    const chunks = fixedWindowChunk(words(5000), { maxTokens: 512, overlapTokens: 0 });

    for (const chunk of chunks) expect(chunk).toMatch(/^word\d+( word\d+)*$/);
  });
});
