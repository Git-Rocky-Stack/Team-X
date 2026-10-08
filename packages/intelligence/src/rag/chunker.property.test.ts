/**
 * Property and fuzz tests for both RAG chunkers (audit 2026-10-07 P1-2).
 *
 * The example tests pin specific shapes. These generate thousands of
 * documents and check the invariants retrieval depends on, for any input:
 *
 *   - empty or blank input yields no chunks;
 *   - no chunk exceeds the size ceiling (fixed: maxTokens; semantic:
 *     maxChunkTokens), at zero and at maximum overlap;
 *   - no content is lost: every word of the input survives in some chunk;
 *   - chunking always terminates, including markdown whose prose segments
 *     once recursed without bound;
 *   - chunk metadata is well formed (sequential indexes, positions inside
 *     the document).
 *
 * Inputs: prose, markdown with balanced and unbalanced code fences, lists
 * and tables, minified JSON, code, CJK text with no spaces, emoji, and huge
 * unbroken runs. Seeds are fixed so a failure reproduces; set FC_SEED to
 * explore further.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { semanticChunk, chunkText as semanticChunkText } from './chunker-v2.js';
import { chunkText as fixedChunkText, splitToMaxChars } from './chunker.js';

const CHARS_PER_TOKEN = 4;
const SEED = Number(process.env.FC_SEED ?? 20261008);
const RUNS = Number(process.env.FC_RUNS ?? 200);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Words are short and drawn from a wide alphabet so each occurrence is
 * findable. Long unbroken runs get their own generator below.
 */
const word = fc.stringMatching(/^[a-zA-Z0-9_]{1,12}$/);
const unicodeWord = fc.constantFrom('naïve', 'café', 'Ωmega', 'привет', 'données', '🙂ok', 'x̃y');

const sentence = fc
  .tuple(
    fc.array(fc.oneof({ weight: 5, arbitrary: word }, unicodeWord), {
      minLength: 1,
      maxLength: 18,
    }),
    fc.constantFrom('.', '!', '?', '', '...'),
  )
  .map(([ws, end]) => `${ws.join(' ')}${end}`);

const paragraph = fc.array(sentence, { minLength: 1, maxLength: 8 }).map((s) => s.join(' '));

const prose = fc
  .array(paragraph, { minLength: 0, maxLength: 12 })
  .chain((ps) => fc.constantFrom('\n\n', '\n', ' ').map((sep) => ps.join(sep)));

const codeLine = fc
  .tuple(word, word, fc.integer({ min: 0, max: 9999 }))
  .map(([a, b, n]) => `const ${a} = ${b}(${n});`);
const codeBlock = fc.array(codeLine, { minLength: 1, maxLength: 60 }).map((ls) => ls.join('\n'));

const markdown = fc
  .array(
    fc.oneof(
      word.map((w) => `# ${w}`),
      word.map((w) => `## ${w} section`),
      paragraph,
      fc
        .array(word, { minLength: 1, maxLength: 6 })
        .map((ws) => ws.map((w) => `- ${w}`).join('\n')),
      fc
        .array(word, { minLength: 2, maxLength: 4 })
        .map((ws) => `| ${ws.join(' | ')} |\n|${ws.map(() => '---').join('|')}|`),
      codeBlock.map((c) => `\`\`\`ts\n${c}\n\`\`\``),
      // An unbalanced fence: a writer forgot to close it.
      codeBlock.map((c) => `\`\`\`\n${c}`),
    ),
    { minLength: 0, maxLength: 14 },
  )
  .map((blocks) => blocks.join('\n\n'));

const minifiedJson = fc
  .array(fc.record({ id: fc.integer(), name: word, tags: fc.array(word, { maxLength: 4 }) }), {
    minLength: 0,
    maxLength: 400,
  })
  .map((rows) => JSON.stringify(rows));

/** CJK has no spaces at all: the whole document is one unbroken run. */
const cjk = fc
  .array(fc.constantFrom('日本語', '中文', '한국어', '文字', '検索'), {
    minLength: 0,
    maxLength: 600,
  })
  .map((parts) => parts.join(''));

const unbroken = fc
  .tuple(fc.constantFrom('x', 'ab', '0', '🙂'), fc.integer({ min: 0, max: 30_000 }))
  .map(([unit, n]) => unit.repeat(n));

const blank = fc.constantFrom('', ' ', '\n\n\n', '\t \n ');

const anyDocument = fc.oneof(prose, markdown, minifiedJson, codeBlock, cjk, unbroken, blank);

/** Options including the edges: zero overlap and overlap equal to the window. */
const fixedOptions = fc.integer({ min: 16, max: 600 }).chain((maxTokens) =>
  fc.record({
    maxTokens: fc.constant(maxTokens),
    overlapTokens: fc.oneof(
      fc.constant(0),
      fc.constant(maxTokens),
      fc.integer({ min: 0, max: maxTokens }),
    ),
  }),
);

const semanticOptions = fc.integer({ min: 16, max: 600 }).chain((maxTokens) =>
  fc.record({
    maxTokens: fc.constant(maxTokens),
    overlapTokens: fc.oneof(
      fc.constant(0),
      fc.constant(maxTokens),
      fc.integer({ min: 0, max: maxTokens }),
    ),
    maxChunkTokens: fc.integer({ min: maxTokens, max: maxTokens * 4 }),
    minChunkTokens: fc.integer({ min: 1, max: 80 }),
  }),
);

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

/** Words of at most 12 characters: never split by a window of >= 64 chars. */
function shortWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 0 && w.length <= 12);
}

function expectNoWordLost(text: string, chunks: string[]): void {
  const haystack = chunks.join('\u0000');
  for (const w of new Set(shortWords(text))) {
    if (!haystack.includes(w)) {
      throw new Error(`word "${w}" from the input is in no chunk`);
    }
  }
}

/** Every non-whitespace character of an unbroken run must be covered. */
function expectRunCovered(text: string, chunks: string[]): void {
  const stripped = text.replace(/\s+/g, '');
  const covered = chunks.join('').replace(/\s+/g, '').length;
  expect(covered).toBeGreaterThanOrEqual(stripped.length);
  for (const c of chunks)
    expect(text.includes(c.trim()) || stripped.includes(c.replace(/\s+/g, ''))).toBe(true);
}

const params = { seed: SEED, numRuns: RUNS, endOnFailure: true } as const;

// ---------------------------------------------------------------------------
// Fixed-window chunker (chunker.ts)
// ---------------------------------------------------------------------------

describe('fixed-window chunker — properties', () => {
  it('blank input yields no chunks', () => {
    fc.assert(
      fc.property(blank, fixedOptions, (text, opts) => {
        expect(fixedChunkText(text, opts)).toEqual([]);
      }),
      params,
    );
  });

  it('never emits a chunk over maxTokens, at any overlap', () => {
    fc.assert(
      fc.property(anyDocument, fixedOptions, (text, opts) => {
        for (const chunk of fixedChunkText(text, opts)) {
          expect(chunk.length).toBeLessThanOrEqual(opts.maxTokens * CHARS_PER_TOKEN);
        }
      }),
      params,
    );
  });

  it('loses no word of structured text', () => {
    fc.assert(
      fc.property(
        fc.oneof(prose, markdown, minifiedJson, codeBlock),
        fixedOptions,
        (text, opts) => {
          expectNoWordLost(text, fixedChunkText(text, opts));
        },
      ),
      params,
    );
  });

  it('covers every character of an unbroken run', () => {
    fc.assert(
      fc.property(fc.oneof(unbroken, cjk), fixedOptions, (text, opts) => {
        const chunks = fixedChunkText(text, opts);
        if (text.trim() === '') return;
        expectRunCovered(text, chunks);
      }),
      params,
    );
  });

  it('emits no empty chunk', () => {
    fc.assert(
      fc.property(anyDocument, fixedOptions, (text, opts) => {
        for (const chunk of fixedChunkText(text, opts))
          expect(chunk.trim().length).toBeGreaterThan(0);
      }),
      params,
    );
  });
});

describe('fixed-window chunker — text integrity', () => {
  it('never cuts a surrogate pair, even at odd window sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 3, max: 101 }),
        fc.integer({ min: 0, max: 50 }),
        (n, maxChars, overlap) => {
          for (const piece of splitToMaxChars('🙂a'.repeat(n), maxChars, overlap)) {
            expect(piece.isWellFormed()).toBe(true);
          }
        },
      ),
      params,
    );
  });

  it('never cuts a surrogate pair (emoji, astral CJK) in half', () => {
    fc.assert(
      fc.property(anyDocument, fixedOptions, (text, opts) => {
        for (const chunk of fixedChunkText(text, opts)) expect(chunk.isWellFormed()).toBe(true);
      }),
      params,
    );
  });
});

// ---------------------------------------------------------------------------
// Semantic chunker (chunker-v2.ts)
// ---------------------------------------------------------------------------

describe('semantic chunker — properties', () => {
  it('blank input yields no chunks', async () => {
    await fc.assert(
      fc.asyncProperty(blank, semanticOptions, async (text, opts) => {
        expect(await semanticChunkText(text, opts)).toEqual([]);
      }),
      params,
    );
  });

  it('never emits a chunk over maxChunkTokens, at any overlap', async () => {
    await fc.assert(
      fc.asyncProperty(anyDocument, semanticOptions, async (text, opts) => {
        for (const chunk of await semanticChunk(text, opts)) {
          expect(chunk.content.length).toBeLessThanOrEqual(opts.maxChunkTokens * CHARS_PER_TOKEN);
        }
      }),
      params,
    );
  });

  it('loses no word of structured text, including short documents and tails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(prose, markdown, minifiedJson, codeBlock),
        semanticOptions,
        async (text, opts) => {
          expectNoWordLost(text, await semanticChunkText(text, opts));
        },
      ),
      params,
    );
  });

  it('covers every character of an unbroken run', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(unbroken, cjk), semanticOptions, async (text, opts) => {
        if (text.trim() === '') return;
        expectRunCovered(text, await semanticChunkText(text, opts));
      }),
      params,
    );
  });

  it('terminates quickly on markdown, the input that once recursed without bound', async () => {
    await fc.assert(
      fc.asyncProperty(markdown, semanticOptions, async (text, opts) => {
        const started = performance.now();
        await semanticChunk(text, { ...opts, contentType: 'markdown' });
        expect(performance.now() - started).toBeLessThan(2_000);
      }),
      params,
    );
  });

  it('never cuts a surrogate pair (emoji, astral CJK) in half', async () => {
    await fc.assert(
      fc.asyncProperty(anyDocument, semanticOptions, async (text, opts) => {
        for (const chunk of await semanticChunkText(text, opts)) {
          expect(chunk.isWellFormed()).toBe(true);
        }
      }),
      params,
    );
  });

  it('keeps a fenced block whole with its language tag', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('ts', 'python3', 'c++', 'objective-c', ''),
        codeBlock,
        fc.constantFrom(undefined, 'markdown' as const),
        async (lang, code, contentType) => {
          const text = `Intro paragraph.\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\nOutro paragraph.`;
          const chunks = await semanticChunkText(text, { maxChunkTokens: 100_000, contentType });
          expect(chunks.some((c) => c.includes(`\`\`\`${lang}\n${code}`))).toBe(true);
        },
      ),
      params,
    );
  });

  it('reports the exact span of the document each chunk came from', async () => {
    await fc.assert(
      fc.asyncProperty(anyDocument, semanticOptions, async (text, opts) => {
        for (const chunk of await semanticChunk(text, opts)) {
          expect(text.slice(chunk.startPos, chunk.endPos)).toBe(chunk.content);
        }
      }),
      params,
    );
  });

  it('returns well-formed chunk metadata', async () => {
    await fc.assert(
      fc.asyncProperty(anyDocument, semanticOptions, async (text, opts) => {
        const chunks = await semanticChunk(text, opts);
        chunks.forEach((chunk, i) => {
          expect(chunk.index).toBe(i);
          expect(chunk.content.trim().length).toBeGreaterThan(0);
          expect(chunk.startPos).toBeGreaterThanOrEqual(0);
          expect(chunk.endPos).toBeGreaterThanOrEqual(chunk.startPos);
          expect(chunk.endPos).toBeLessThanOrEqual(text.length);
          expect(chunk.tokens).toBeGreaterThan(0);
        });
      }),
      params,
    );
  });
});
