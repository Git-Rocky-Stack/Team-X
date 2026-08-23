/**
 * Semantic chunker — small-document handling.
 *
 * Audit F14 — `semanticChunk` gated every emission on
 * `tokens >= opts.minChunkTokens` (default 50) with no fallback, including
 * the final-chunk branch. Any document shorter than roughly 200 characters
 * therefore produced ZERO chunks and was silently dropped: `indexSource`
 * returned 0 and the content never entered the RAG index. Short tickets,
 * chat messages and notes — the majority of what a workspace indexes —
 * were affected, with no error to reveal it.
 *
 * `minChunkTokens` is a merge threshold, not a discard threshold: an
 * undersized fragment belongs on the previous chunk, and an undersized
 * *document* still has to be indexed.
 */

import { describe, expect, it } from 'vitest';

import { chunkText, semanticChunk } from './chunker-v2.js';

describe('semanticChunk — documents below minChunkTokens', () => {
  it('still emits a chunk for a short plain-text document', async () => {
    const chunks = await semanticChunk('The signing certificate expired on Friday.');

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain('signing certificate expired');
  });

  it('still emits a chunk for a short markdown document', async () => {
    const content = [
      '# Release status',
      '',
      'The release is blocked because the signing certificate expired last Friday.',
      '',
      '# Next steps',
      '',
      'Renew the certificate, then re-run the notarization job and publish.',
    ].join('\n');

    const chunks = await semanticChunk(content);

    expect(chunks.length).toBeGreaterThan(0);
    const joined = chunks.map((c) => c.content).join(' ');
    expect(joined).toContain('signing certificate');
    expect(joined).toContain('notarization');
  });

  it('preserves a one-sentence document verbatim', async () => {
    const text = 'Ship it.';
    const chunks = await chunkText(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Ship it.');
  });

  it('returns no chunks only when there is genuinely no content', async () => {
    expect(await semanticChunk('')).toEqual([]);
    expect(await semanticChunk('   \n\n  ')).toEqual([]);
  });

  it('does not drop the trailing fragment of a long document', async () => {
    // A long body followed by a short tail: the tail is below the minimum
    // on its own, so it must be merged rather than discarded.
    const body = 'The deployment pipeline runs nightly and publishes artifacts. '.repeat(40);
    const tail = 'Owner: platform team.';
    const chunks = await chunkText(`${body}\n\n${tail}`);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join(' ')).toContain('Owner: platform team.');
  });

  it('keeps honouring minChunkTokens as a merge threshold on long input', async () => {
    // Long input must still be split into multiple chunks — the fix must not
    // collapse everything into one.
    const long = 'Sentence number one about deployments and certificates. '.repeat(200);
    const chunks = await chunkText(long);

    expect(chunks.length).toBeGreaterThan(1);
  });
});
