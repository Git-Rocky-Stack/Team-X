/**
 * Semantic Chunker - Document-Aware Text Chunking
 *
 * Improvements over original chunker:
 * - Proper tokenization using tiktoken (cl100k_base)
 * - Markdown structure awareness (code blocks, lists, headers)
 * - Adaptive overlap based on content density
 * - Variable chunk sizes by content type
 * - Sentence and paragraph boundary detection
 * - Code block preservation
 *
 * Phase 5 — M29 (Priority 2 enhancement).
 */

/**
 * Content type detection for adaptive chunking.
 */
export type ContentType = 'prose' | 'code' | 'mixed' | 'data' | 'markdown';

/**
 * Detected structural boundary in text.
 */
interface ChunkBoundary {
  /** Position in text (character index) */
  position: number;

  /** Type of boundary */
  type: 'paragraph' | 'sentence' | 'code_block' | 'list' | 'heading' | 'table' | 'frontmatter';

  /** Preference strength (0-1, higher = prefer splitting here) */
  strength: number;

  /** Associated metadata */
  metadata?: {
    language?: string; // For code blocks
    level?: number; // For headings
    delimiter?: string; // For list items
  };
}

/**
 * Enhanced chunking options.
 */
export interface SemanticChunkOptions {
  /** Maximum tokens per chunk (default: 512) */
  maxTokens?: number;

  /** Overlap tokens (default: 64) */
  overlapTokens?: number;

  /** Minimum chunk size in tokens (default: 50) */
  minChunkTokens?: number;

  /** Maximum chunk size in tokens (hard limit, default: 2048) */
  maxChunkTokens?: number;

  /** Preserve document structure (default: true) */
  preserveStructure?: boolean;

  /** Content type for adaptive sizing */
  contentType?: ContentType;

  /** Adaptive overlap based on content density (default: true) */
  adaptiveOverlap?: boolean;

  /** Overlap multiplier for dense content (default: 1.5) */
  denseOverlapMultiplier?: number;

  /** Use proper tokenizer (requires tiktoken, falls back to estimation) */
  useTokenizer?: boolean;

  /** Respect code blocks (don't split them) */
  preserveCodeBlocks?: boolean;

  /** Respect list item boundaries */
  preserveListItems?: boolean;
}

/**
 * Chunk result with metadata.
 */
export interface Chunk {
  /** Chunk content */
  content: string;

  /** Token count (estimated or actual) */
  tokens: number;

  /** Chunk boundaries detected */
  boundaries: ChunkBoundary[];

  /** Chunk index */
  index: number;

  /** Starting position in original text */
  startPos: number;

  /** Ending position in original text */
  endPos: number;

  /** Chunk metadata */
  metadata: {
    contentType: ContentType;
    hasCode: boolean;
    hasList: boolean;
    hasTable: boolean;
    hasHeading: boolean;
    averageWordLength?: number;
  };
}

/**
 * Token counter interface.
 */
export interface TokenCounter {
  count(text: string): number;
  countBatch(texts: string[]): number[];
}

/**
 * Create a token counter using tiktoken cl100k_base encoding.
 * Falls back to character-based estimation if tiktoken is not available.
 */
export async function createTokenCounter(): Promise<TokenCounter> {
  try {
    // Dynamic import of tiktoken
    const { getEncoding } = await import('tiktoken/lite');
    const encoding = getEncoding('cl100k_base');

    return {
      count: (text: string) => encoding.encode(text).length,
      countBatch: (texts: string[]) => {
        return texts.map((t) => encoding.encode(t).length);
      },
    };
  } catch {
    // Fallback to character-based estimation
    const CHARS_PER_TOKEN = 4;
    return {
      count: (text: string) => Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN)),
      countBatch: (texts: string[]) =>
        texts.map((t) => Math.max(1, Math.ceil(t.length / CHARS_PER_TOKEN))),
    };
  }
}

/**
 * Simple character-based token counter (synchronous fallback).
 */
function createCharTokenCounter(): TokenCounter {
  const CHARS_PER_TOKEN = 4;
  return {
    count: (text: string) => Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN)),
    countBatch: (texts: string[]) =>
      texts.map((t) => Math.max(1, Math.ceil(t.length / CHARS_PER_TOKEN))),
  };
}

/**
 * Detect content type from text sample.
 */
export function detectContentType(text: string, sampleSize = 500): ContentType {
  const sample = text.slice(0, sampleSize);

  // Check for code patterns
  const codeIndicators = [
    /^(function|const|let|var|class|import|export|def|return)\s/m,
    /^\s*(if|for|while|switch|catch|try|finally)\s*\{/m,
    /^\s*```[a-z]*\n/m, // Code fence
    /^\s*(public|private|protected|static|async|await)\s/m,
    /[{}<>]=/, // Common in code
  ];

  const codeScore = codeIndicators.reduce((sum, pattern) => {
    return sum + (pattern.test(sample) ? 1 : 0);
  }, 0);

  // Check for data patterns (JSON, CSV, etc.)
  const dataIndicators = [
    /^\s*[\{\[].*[\}\]],?\s*$/m, // JSON/array
    /^\s*"[^"]+"\s*(,"[^"]+"\s*)*\s*$/m, // CSV
    /^\s*\w+\s*=\s*\w+/m, // Key-value pairs
  ];

  const dataScore = dataIndicators.reduce((sum, pattern) => {
    return sum + (pattern.test(sample) ? 1 : 0);
  }, 0);

  // Check for markdown patterns
  const markdownIndicators = [
    /^#{1,6}\s/m, // Headings
    /^\s*[-*+]\s*$/m, // Horizontal rules
    /\[.*\]\(.*\)/, // Links
    /^\s*```/m, // Code fences
    /^\s*\*[^*]+\*\s*/m, // Bold
    /^\s*_[^_]+_\s*/m, // Italic
    /^\s*[-*+]\s+/m, // Lists
  ];

  const markdownScore = markdownIndicators.reduce((sum, pattern) => {
    return sum + (pattern.test(sample) ? 1 : 0);
  }, 0);

  // Determine content type
  if (codeScore >= 3) return 'code';
  if (dataScore >= 2) return 'data';
  if (markdownScore >= 2) return 'markdown';
  if (codeScore > 0 || markdownScore > 0) return 'mixed';
  return 'prose';
}

/**
 * Detect structural boundaries in text.
 */
export function detectBoundaries(text: string, contentType: ContentType): ChunkBoundary[] {
  const boundaries: ChunkBoundary[] = [];

  if (contentType === 'code' || contentType === 'data') {
    // For code/data, detect line-based boundaries
    const lines = text.split('\n');
    let currentPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineLength = line.length + 1; // +1 for newline

      // Detect empty lines (paragraph boundaries)
      if (line.trim() === '') {
        boundaries.push({
          position: currentPos + lineLength,
          type: 'paragraph',
          strength: 0.9,
        });
      }

      // Detect code blocks (markdown fences)
      if (line.trim().startsWith('```')) {
        boundaries.push({
          position: currentPos,
          type: 'code_block',
          strength: 1.0,
          metadata: { language: line.trim().slice(3).trim() || 'text' },
        });
      }

      currentPos += lineLength;
    }
  }

  // For prose and markdown, detect richer structure
  if (contentType === 'prose' || contentType === 'markdown' || contentType === 'mixed') {
    // Detect headings
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    for (const match of text.matchAll(headingRegex)) {
      boundaries.push({
        position: match.index,
        type: 'heading',
        strength: 0.95,
        metadata: { level: (match[1] ?? '').length },
      });
    }

    // Detect code blocks (fenced)
    const fenceRegex = /`{3}([a-z]*)\n([\s\S]*?)```{3}/g;
    for (const match of text.matchAll(fenceRegex)) {
      boundaries.push({
        position: match.index,
        type: 'code_block',
        strength: 1.0,
        metadata: { language: match[1] || 'text' },
      });
      boundaries.push({
        position: match.index + match[0].length,
        type: 'code_block',
        strength: 1.0,
        metadata: { language: match[1] || 'text' },
      });
    }

    // Detect list items
    const listRegex = /^(\s*)([-*+]|\d+\.)\s+/gm;
    for (const match of text.matchAll(listRegex)) {
      boundaries.push({
        position: match.index + (match[1] ?? '').length,
        type: 'list',
        strength: 0.7,
        metadata: { delimiter: match[2] },
      });
    }

    // Detect tables (basic)
    const tableRegex = /\|[^|\n]+\|/g;
    let inTable = false;
    let tableStart = 0;
    for (const match of text.matchAll(tableRegex)) {
      if (!inTable) {
        tableStart = match.index;
        inTable = true;
      }
      // Check if table ends
      const afterMatch = text.slice(match.index + match[0].length);
      if (!afterMatch.startsWith('|') && afterMatch.trim().length > 0) {
        boundaries.push({
          position: tableStart,
          type: 'table',
          strength: 0.8,
        });
        inTable = false;
      }
    }

    // Detect frontmatter (YAML/TOML)
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
    const frontmatterMatch = text.match(frontmatterRegex);
    if (frontmatterMatch) {
      boundaries.push({
        position: 0,
        type: 'frontmatter',
        strength: 1.0,
      });
      boundaries.push({
        position: frontmatterMatch[0].length,
        type: 'frontmatter',
        strength: 1.0,
      });
    }

    // Detect sentences (for prose)
    const sentenceRegex = /[.!?]+\s+(?=[A-Z]|["'])/g;
    for (const match of text.matchAll(sentenceRegex)) {
      boundaries.push({
        position: match.index + match[0].length,
        type: 'sentence',
        strength: 0.6,
      });
    }

    // Detect paragraphs (double newlines)
    const paragraphRegex = /\n\n+/g;
    for (const match of text.matchAll(paragraphRegex)) {
      boundaries.push({
        position: match.index,
        type: 'paragraph',
        strength: 0.8,
      });
    }
  }

  // Sort boundaries by position
  boundaries.sort((a, b) => a.position - b.position);

  return boundaries;
}

/**
 * Calculate content density for adaptive overlap.
 * Dense content (complex terms) needs more overlap to maintain context.
 */
export function calculateContentDensity(text: string): {
  averageWordLength: number;
  uniqueWordRatio: number;
  density: number; // 0-1, higher = denser
} {
  const words = text.match(/[a-zA-Z0-9]+/g) || [];
  if (words.length === 0) {
    return { averageWordLength: 0, uniqueWordRatio: 0, density: 0 };
  }

  const totalLength = words.join('').length;
  const averageWordLength = totalLength / words.length;

  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const uniqueWordRatio = uniqueWords.size / words.length;

  // Density combines word length and uniqueness
  const density = Math.min(1, (averageWordLength / 10 + uniqueWordRatio) / 2);

  return { averageWordLength, uniqueWordRatio, density };
}

/**
 * Semantic chunking with document structure awareness.
 */
export async function semanticChunk(
  text: string,
  options: SemanticChunkOptions = {},
): Promise<Chunk[]> {
  const opts: Required<SemanticChunkOptions> = {
    maxTokens: 512,
    overlapTokens: 64,
    minChunkTokens: 50,
    maxChunkTokens: 2048,
    preserveStructure: true,
    contentType: detectContentType(text),
    adaptiveOverlap: true,
    denseOverlapMultiplier: 1.5,
    useTokenizer: false,
    preserveCodeBlocks: true,
    preserveListItems: true,
    ...options,
  };

  // Get token counter
  const counter = opts.useTokenizer ? await createTokenCounter() : createCharTokenCounter();

  // Detect boundaries if preserving structure
  const boundaries = opts.preserveStructure ? detectBoundaries(text, opts.contentType) : [];

  // Calculate content density for adaptive overlap
  const density = calculateContentDensity(text);
  const adaptiveOverlap = opts.adaptiveOverlap
    ? Math.floor(opts.overlapTokens * (1 + density.density * (opts.denseOverlapMultiplier - 1)))
    : opts.overlapTokens;

  const maxChars = opts.maxTokens * 4; // Fallback char estimation
  const overlapChars = adaptiveOverlap * 4;

  // Special handling for code content
  if (opts.contentType === 'code' || opts.contentType === 'data') {
    return chunkCodeOrData(text, opts, counter);
  }

  // Special handling for markdown with code blocks
  if (opts.contentType === 'markdown' && opts.preserveCodeBlocks) {
    return chunkMarkdownWithCodeBlocks(text, opts, counter, boundaries);
  }

  // General semantic chunking for prose
  const chunks: Chunk[] = [];
  const currentStart = 0;
  let chunkIndex = 0;

  // Split by boundaries first
  const segments = splitByBoundaries(text, boundaries);

  let currentSegments: string[] = [];
  let currentLength = 0;

  for (const segment of segments) {
    const segmentLength = segment.content.length;

    // Check if adding this segment would exceed max chunk size
    if (currentLength + segmentLength > maxChars && currentSegments.length > 0) {
      // Create chunk from current segments
      const content = currentSegments.join(' ');
      const tokens = counter.count(content);

      if (tokens >= opts.minChunkTokens) {
        chunks.push({
          content,
          tokens,
          boundaries: segment.boundaries,
          index: chunkIndex++,
          startPos: currentStart,
          endPos: currentStart + content.length,
          metadata: {
            contentType: opts.contentType,
            hasCode: false,
            hasList: false,
            hasTable: false,
            hasHeading: false,
          },
        });

        // Calculate overlap for next chunk
        const overlapSegments: string[] = [];
        let overlapLength = 0;

        for (let i = currentSegments.length - 1; i >= 0; i--) {
          const seg = currentSegments[i];
          if (seg === undefined) continue;
          const segLength = seg.length;
          if (overlapLength + segLength > overlapChars) break;

          overlapSegments.unshift(seg);
          overlapLength += segLength + 1; // +1 for space
        }

        currentSegments = overlapSegments;
        currentLength = overlapLength;
      }
    }

    currentSegments.push(segment.content);
    currentLength += segmentLength + 1; // +1 for space
  }

  // Flush whatever remains.
  //
  // `minChunkTokens` is a MERGE threshold, not a discard threshold. Gating
  // this branch on `tokens >= minChunkTokens` with no fallback silently threw
  // away every document shorter than the minimum (~200 chars at the default
  // of 50 tokens) and every short trailing fragment of a longer one — the
  // caller saw an empty chunk list and indexed nothing, with no error. Short
  // tickets, chat messages and notes are exactly the content a workspace
  // indexes most, so the loss was both large and invisible.
  if (currentSegments.length > 0) {
    const content = currentSegments.join(' ').trim();
    if (content.length > 0) {
      const tokens = counter.count(content);
      const previous = chunks[chunks.length - 1];

      if (tokens >= opts.minChunkTokens || previous === undefined) {
        // Either it stands on its own, or it is the whole document — an
        // undersized document still has to be indexed.
        chunks.push({
          content,
          tokens,
          boundaries: [],
          index: chunkIndex++,
          startPos: currentStart,
          endPos: currentStart + content.length,
          metadata: {
            contentType: opts.contentType,
            hasCode: false,
            hasList: false,
            hasTable: false,
            hasHeading: false,
          },
        });
      } else {
        // Undersized tail with a predecessor: merge so the text survives.
        const merged = `${previous.content} ${content}`.trim();
        previous.content = merged;
        previous.tokens = counter.count(merged);
        previous.endPos = previous.startPos + merged.length;
      }
    }
  }

  return chunks;
}

/**
 * Split text by detected boundaries.
 */
function splitByBoundaries(
  text: string,
  boundaries: ChunkBoundary[],
): Array<{ content: string; boundaries: ChunkBoundary[] }> {
  if (boundaries.length === 0) {
    return [{ content: text, boundaries: [] }];
  }

  const segments: Array<{ content: string; boundaries: ChunkBoundary[] }> = [];
  let lastPos = 0;

  for (const boundary of boundaries) {
    if (boundary.position > lastPos) {
      const segmentContent = text.slice(lastPos, boundary.position);
      if (segmentContent.length > 0) {
        segments.push({
          content: segmentContent,
          boundaries: [boundary],
        });
      }
    }
    lastPos = boundary.position;
  }

  // Add final segment
  if (lastPos < text.length) {
    segments.push({
      content: text.slice(lastPos),
      boundaries: [],
    });
  }

  return segments;
}

/**
 * Specialized chunking for code or data.
 * Preserves line-based structure.
 */
function chunkCodeOrData(
  text: string,
  options: Required<SemanticChunkOptions>,
  counter: TokenCounter,
): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = text.split('\n');
  const maxLines = Math.ceil(options.maxTokens / 10); // Rough line count
  // Overlap must leave at least one fresh line per window, or the buffer
  // never shrinks below `maxLines` and every later window keeps growing.
  const overlapLines = Math.max(0, Math.min(Math.ceil(options.overlapTokens / 10), maxLines - 1));

  let currentLines: string[] = [];
  // Leading lines of `currentLines` carried over as overlap from the previous
  // chunk. They are already emitted, so a merge must not append them twice.
  let carriedLines = 0;
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined) {
      currentLines.push(line);
    }

    if (currentLines.length >= maxLines || i === lines.length - 1) {
      const content = currentLines.join('\n');
      const tokens = counter.count(content);
      const previous = chunks[chunks.length - 1];

      // Same merge-or-keep rule as the prose flush in `semanticChunk`:
      // `minChunkTokens` is a merge threshold, not a discard threshold.
      // Discarding here dropped every short snippet or config file outright
      // and every short tail of a longer one, with no error to show for it.
      // A whitespace-only window has nothing to index and is never emitted.
      if (content.trim().length > 0) {
        if (tokens >= options.minChunkTokens || previous === undefined) {
          // Either it stands on its own, or it is the whole document.
          chunks.push({
            content,
            tokens,
            boundaries: [],
            index: chunkIndex++,
            startPos: 0, // Not tracking for code
            endPos: content.length,
            metadata: {
              contentType: options.contentType,
              hasCode: true,
              hasList: false,
              hasTable: false,
              hasHeading: false,
            },
          });
        } else {
          // Undersized with a predecessor: append only the lines it has not
          // already seen, so the text survives without duplicating the overlap.
          const fresh = currentLines.slice(carriedLines).join('\n');
          if (fresh.trim().length > 0) {
            const merged = `${previous.content}\n${fresh}`;
            previous.content = merged;
            previous.tokens = counter.count(merged);
            previous.endPos = merged.length;
          }
        }
      }

      // Overlap. `slice(-0)` is `slice(0)` — the whole buffer — so zero
      // overlap needs its own branch or every chunk re-carries all before it.
      currentLines = overlapLines > 0 ? currentLines.slice(-overlapLines) : [];
      carriedLines = currentLines.length;
    }
  }

  return chunks;
}

/**
 * Specialized chunking for markdown that preserves code blocks.
 */
async function chunkMarkdownWithCodeBlocks(
  text: string,
  options: Required<SemanticChunkOptions>,
  counter: TokenCounter,
  _boundaries: ChunkBoundary[],
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  // Find all code blocks
  const codeBlockRegex = /```[a-z]*\n([\s\S]*?)```/g;
  const codeBlocks: Array<{ start: number; end: number; content: string; language: string }> = [];

  for (const match of text.matchAll(codeBlockRegex)) {
    codeBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1] ?? '',
      language: match[0].match(/```([a-z]*)/)?.[1] || 'text',
    });
  }

  // Split by code blocks
  let lastEnd = 0;
  const segments: Array<{ content: string; isCode: boolean; boundaries: ChunkBoundary[] }> = [];

  for (const block of codeBlocks) {
    // Add text before code block
    if (block.start > lastEnd) {
      const proseText = text.slice(lastEnd, block.start);
      segments.push({ content: proseText, isCode: false, boundaries: [] });
    }

    // Add code block as single segment
    segments.push({ content: block.content, isCode: true, boundaries: [] });
    lastEnd = block.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({ content: text.slice(lastEnd), isCode: false, boundaries: [] });
  }

  // Prose between fences is chunked as plain prose. Passing the caller's
  // options through unchanged left `contentType` at 'markdown', which routed
  // straight back into this function — unbounded recursion and a
  // `RangeError: Maximum call stack size exceeded` on every markdown document.
  const proseOptions: SemanticChunkOptions = { ...options, contentType: 'prose' };

  // Chunk each segment
  for (const segment of segments) {
    if (segment.isCode) {
      // An empty fence carries nothing worth embedding.
      if (segment.content.trim().length === 0) continue;

      // Code blocks stay intact
      const tokens = counter.count(segment.content);
      chunks.push({
        content: segment.content,
        tokens,
        boundaries: [],
        index: chunkIndex++,
        startPos: 0,
        endPos: segment.content.length,
        metadata: {
          contentType: 'code',
          hasCode: true,
          hasList: false,
          hasTable: false,
          hasHeading: false,
        },
      });
    } else {
      // Prose gets regular semantic chunking
      const proseChunks = await semanticChunk(segment.content, proseOptions);
      for (const chunk of proseChunks) {
        chunks.push({
          ...chunk,
          index: chunkIndex++,
          metadata: {
            ...chunk.metadata,
            contentType: options.contentType,
            hasCode: codeBlocks.length > 0, // Parent markdown has code
          },
        });
      }
    }
  }

  return chunks;
}

/**
 * Backward-compatible chunk function (original signature).
 */
export async function chunkText(text: string, options?: SemanticChunkOptions): Promise<string[]> {
  const chunks = await semanticChunk(text, options);
  return chunks.map((c) => c.content);
}

/**
 * Analyze text and return chunking recommendations.
 */
export async function analyzeTextForChunking(text: string): Promise<{
  contentType: ContentType;
  estimatedChunks: number;
  recommendedOptions: SemanticChunkOptions;
  detectedFeatures: string[];
}> {
  const contentType = detectContentType(text);
  const counter = await createTokenCounter();
  const totalTokens = counter.count(text);

  // Estimate chunks based on content type
  let estimatedChunks: number;
  let recommendedOptions: SemanticChunkOptions;

  switch (contentType) {
    case 'code':
      estimatedChunks = Math.ceil(totalTokens / 256); // Smaller chunks for code
      recommendedOptions = {
        contentType: 'code',
        maxTokens: 256,
        overlapTokens: 32,
        minChunkTokens: 20,
        preserveCodeBlocks: true,
        preserveListItems: false,
        preserveStructure: false,
        adaptiveOverlap: false,
      };
      break;

    case 'data':
      estimatedChunks = Math.ceil(totalTokens / 128); // Even smaller for data
      recommendedOptions = {
        contentType: 'data',
        maxTokens: 128,
        overlapTokens: 16,
        minChunkTokens: 10,
        preserveCodeBlocks: false,
        preserveListItems: false,
        preserveStructure: false,
        adaptiveOverlap: false,
      };
      break;

    case 'markdown': {
      // Count code blocks for estimation
      const codeBlockCount = (text.match(/```/g) || []).length / 2;
      estimatedChunks = Math.ceil(totalTokens / 512) + codeBlockCount;
      recommendedOptions = {
        contentType: 'markdown',
        maxTokens: 512,
        overlapTokens: 64,
        preserveCodeBlocks: true,
        preserveListItems: true,
        preserveStructure: true,
        adaptiveOverlap: true,
      };
      break;
    }

    default:
      estimatedChunks = Math.ceil(totalTokens / 512);
      recommendedOptions = {
        contentType: 'prose',
        maxTokens: 512,
        overlapTokens: 64,
        preserveStructure: true,
        adaptiveOverlap: true,
      };
  }

  // Detect features
  const features: string[] = [];
  if (text.includes('```')) features.push('code-blocks');
  if (text.match(/^#{1,6}\s/m)) features.push('headings');
  if (text.match(/^\s*[-*+]\s/m)) features.push('lists');
  if (text.match(/\|.*\|/)) features.push('tables');
  if (text.match(/^---\n/)) features.push('frontmatter');

  return {
    contentType,
    estimatedChunks,
    recommendedOptions,
    detectedFeatures: features,
  };
}
