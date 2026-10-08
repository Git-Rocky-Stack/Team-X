/**
 * Text chunker for the RAG pipeline.
 * Splits long content into overlapping chunks suitable for embedding.
 * Uses simple word-level tokenization (~4 chars/token) and tries to
 * respect sentence boundaries.
 * Phase 5 — M28.
 */

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxTokens: 512,
  overlapTokens: 64,
};

const CHARS_PER_TOKEN = 4;

export function chunkText(text: string, options?: ChunkOptions): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!text || text.trim().length === 0) return [];

  const maxChars = opts.maxTokens * CHARS_PER_TOKEN;
  const overlapChars = opts.overlapTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) return [text];

  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let currentSentences: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    if (currentLength + sentenceLength > maxChars && currentSentences.length > 0) {
      chunks.push(currentSentences.join(' '));

      const overlapSentences: string[] = [];
      let overlapLength = 0;
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const s = currentSentences[i];
        if (!s) continue;
        if (overlapLength + s.length > overlapChars) break;
        overlapSentences.unshift(s);
        overlapLength += s.length + 1;
      }
      currentSentences = [...overlapSentences];
      currentLength = overlapLength;
    }

    currentSentences.push(sentence);
    currentLength += sentenceLength + 1;
  }

  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(' '));
  }

  // A "sentence" is only bounded by . ! ? — code, minified data or prose
  // without terminal punctuation is one sentence of any length. Window those
  // so no chunk exceeds the budget the embedding provider was sized for.
  return chunks.flatMap((chunk) => splitToMaxChars(chunk, maxChars, overlapChars));
}

/**
 * Split `text` into windows of at most `maxChars`, each overlapping the
 * previous by about `overlapChars`. A window ends at the last whitespace in
 * its second half when there is one, so words are kept whole. Text with no
 * whitespace there (minified JSON, CJK, a long URL) ends after the last
 * punctuation instead, so a key or value is not cut mid-token; only a run
 * with neither is cut at `maxChars`, and never inside a surrogate pair.
 * Text within the limit is returned as is.
 */
export function splitToMaxChars(text: string, maxChars: number, overlapChars = 0): string[] {
  if (maxChars <= 0) throw new RangeError(`maxChars must be positive, got ${maxChars}`);
  if (text.length <= maxChars) return [text];
  const overlap = Math.min(Math.max(0, overlapChars), Math.floor(maxChars / 2));
  const windows: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const half = start + Math.floor(maxChars / 2);
      const breakAt = lastWhitespace(text, half, end);
      if (breakAt > start) end = breakAt;
      else {
        const afterPunct = lastPunctuation(text, half, end);
        if (afterPunct > start) end = afterPunct;
        else if (isHighSurrogate(text.charCodeAt(end - 1)) && end - 1 > start) end -= 1;
      }
    }
    const window = text.slice(start, end).trim();
    if (window.length > 0) windows.push(window);
    if (end >= text.length) break;
    // Step back by the overlap, but always make progress, and start the next
    // window on a word boundary when one is near.
    let next = Math.max(end - overlap, start + 1);
    if (next < text.length && isLowSurrogate(text.charCodeAt(next))) next += 1;
    if (overlap > 0) {
      const wordStart = text.indexOf(' ', next);
      if (wordStart !== -1 && wordStart < end) next = wordStart + 1;
    }
    start = next;
  }
  return windows;
}

const PUNCTUATION = new Set([...',;:)]}>|/&?=、。，；：）」』']);

/** Index just after the last punctuation character in [from, to), or -1. */
function lastPunctuation(text: string, from: number, to: number): number {
  for (let i = to - 1; i >= from; i--) {
    if (PUNCTUATION.has(text[i] ?? '')) return i + 1;
  }
  return -1;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Index of the last whitespace character in [from, to), or -1. */
function lastWhitespace(text: string, from: number, to: number): number {
  for (let i = to - 1; i >= from; i--) {
    const c = text.charCodeAt(i);
    if (c === 32 || c === 10 || c === 9 || c === 13) return i;
  }
  return -1;
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!raw) return [text];
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}
