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

  return chunks;
}

function splitSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!raw) return [text];
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}
