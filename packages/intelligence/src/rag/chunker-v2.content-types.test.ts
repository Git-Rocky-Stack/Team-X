/**
 * Semantic chunker — markdown and code/data routing.
 *
 * Two defects on the non-prose paths:
 *
 *   - `chunkMarkdownWithCodeBlocks` handed each prose segment back to
 *     `semanticChunk` with the caller's options untouched, so
 *     `contentType` was still 'markdown' and the call routed straight back
 *     into `chunkMarkdownWithCodeBlocks` — unbounded recursion, ending in
 *     `RangeError: Maximum call stack size exceeded` on every markdown
 *     document.
 *   - `chunkCodeOrData` gated emission on `tokens >= minChunkTokens` with no
 *     fallback, so a short snippet or config file produced zero chunks and a
 *     short trailing fragment of a longer one was dropped. The prose path
 *     already treats `minChunkTokens` as a merge threshold; this pins the
 *     same rule here.
 */

import { describe, expect, it } from 'vitest';

import { semanticChunk } from './chunker-v2.js';

describe('semanticChunk — markdown', () => {
  it('chunks an auto-detected markdown document without recursing forever', async () => {
    const text = [
      '# Title',
      '',
      '- item one',
      '- item two',
      '',
      'Some prose that follows the list and explains what the items mean.',
    ].join('\n');

    const chunks = await semanticChunk(text);

    expect(chunks.length).toBeGreaterThan(0);
    const joined = chunks.map((c) => c.content).join(' ');
    for (const fragment of ['# Title', 'item one', 'item two', 'Some prose']) {
      expect(joined).toContain(fragment);
    }
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it('honours an explicit markdown contentType on plain text', async () => {
    const chunks = await semanticChunk('Just a sentence.', { contentType: 'markdown' });

    expect(chunks.map((c) => c.content)).toEqual(['Just a sentence.']);
  });

  it('keeps a fenced code block intact and chunks the prose around it', async () => {
    const code = 'const x = 1;\nconst y = 2;\nexport { x, y };\n';
    const text = [
      '# Setup',
      '',
      'Install the dependencies first.',
      '',
      `\`\`\`ts\n${code}\`\`\``,
      '',
      'Then run the build.',
    ].join('\n');

    const chunks = await semanticChunk(text, { contentType: 'markdown' });

    // The whole fence is one chunk, language tag included, so "the
    // TypeScript example" can find it.
    const codeChunks = chunks.filter((c) => c.metadata.contentType === 'code');
    expect(codeChunks.map((c) => c.content)).toEqual([`\`\`\`ts\n${code}\`\`\``]);
    for (const c of chunks) expect(text.slice(c.startPos, c.endPos)).toBe(c.content);

    const joined = chunks.map((c) => c.content).join(' ');
    expect(joined).toContain('Install the dependencies first.');
    expect(joined).toContain('Then run the build.');
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('still splits long markdown prose into multiple chunks', async () => {
    const prose = 'The deployment pipeline runs nightly and publishes artifacts. '.repeat(80);
    const text = `# Pipeline\n\n${prose}\n\n\`\`\`sh\nmake release\n\`\`\`\n`;

    const chunks = await semanticChunk(text, { contentType: 'markdown' });

    expect(chunks.filter((c) => c.metadata.contentType !== 'code').length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.content === '```sh\nmake release\n```')).toBe(true);
  });
});

describe('semanticChunk — code and data below minChunkTokens', () => {
  it('still emits a chunk for a short data document', async () => {
    const text = 'status = open\nowner = rocky\n{"a":1}';

    const chunks = await semanticChunk(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe(text);
    expect(chunks[0]?.metadata.contentType).toBe('data');
  });

  it('still emits a chunk for a short code snippet', async () => {
    const chunks = await semanticChunk('const answer = 42;', { contentType: 'code' });

    expect(chunks.map((c) => c.content)).toEqual(['const answer = 42;']);
  });

  it('merges an undersized trailing fragment into its predecessor', async () => {
    // 52 lines fill the first chunk (maxTokens 512 → 52 lines); the two
    // extra lines plus the 7-line overlap fall under minChunkTokens: 100.
    const lines = Array.from({ length: 52 }, (_, i) => `const value_${i} = compute(${i});`);
    lines.push('const tail_one = 1;', 'const tail_marker = 2;');

    const chunks = await semanticChunk(lines.join('\n'), {
      contentType: 'code',
      minChunkTokens: 100,
    });

    expect(chunks).toHaveLength(1);
    // Every line survives exactly once — the overlap lines the tail carried
    // over from its predecessor are not duplicated by the merge.
    expect(chunks[0]?.content.split('\n')).toEqual(lines);
  });

  it('does not repeat earlier lines when overlap is zero', async () => {
    // `currentLines.slice(-0)` is `slice(0)` — the whole buffer — so with no
    // overlap every chunk re-carried every line before it.
    const lines = Array.from({ length: 30 }, (_, i) => `const value_${i} = compute(${i});`);

    const chunks = await semanticChunk(lines.join('\n'), {
      contentType: 'code',
      maxTokens: 100,
      overlapTokens: 0,
      minChunkTokens: 1,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap((c) => c.content.split('\n'))).toEqual(lines);
  });

  it('terminates with a bounded window when overlap is as large as the window', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `const value_${i} = compute(${i});`);

    const chunks = await semanticChunk(lines.join('\n'), {
      contentType: 'code',
      maxTokens: 50,
      overlapTokens: 50,
      minChunkTokens: 1,
    });

    // Every chunk stays within the 5-line window instead of growing unbounded.
    for (const chunk of chunks) expect(chunk.content.split('\n').length).toBeLessThanOrEqual(5);
    expect(chunks.at(-1)?.content.split('\n').at(-1)).toBe(lines.at(-1));
  });

  it('never emits an empty or whitespace-only chunk', async () => {
    expect(await semanticChunk('', { contentType: 'code' })).toEqual([]);
    expect(await semanticChunk('  \n\n  \n', { contentType: 'data' })).toEqual([]);
  });
});
