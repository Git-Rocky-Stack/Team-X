/**
 * Enhanced AI service specs.
 *
 * Audit F1 — `chunkText` infinite-looped on every input: once a window
 * reached `content.length`, `start = end - overlap` moved the cursor
 * *backwards* relative to the terminal window, so the same tail chunk was
 * re-emitted forever. The function is synchronous and reachable from the
 * live `enhancedAi.indexWithSemanticChunking` IPC handler, so the loop
 * froze the Electron main process and allocated without bound.
 */

import { describe, expect, it } from 'vitest';

import { chunkText } from './enhanced-ai.js';

describe('chunkText', () => {
  it('terminates on content shorter than one window', () => {
    const chunks = chunkText('x'.repeat(100), 512, 64);
    expect(chunks).toEqual(['x'.repeat(100)]);
  });

  it('terminates on content spanning several windows', () => {
    const chunks = chunkText('y'.repeat(2048), 512, 64);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(20);
  });

  it('covers every character of the input', () => {
    const content = Array.from({ length: 1000 }, (_, i) => String(i % 10)).join('');
    const chunks = chunkText(content, 256, 32);

    // Re-stitch by dropping the overlap that each successive chunk repeats.
    let stitched = chunks[0] ?? '';
    for (let i = 1; i < chunks.length; i++) {
      stitched += (chunks[i] ?? '').slice(32);
    }
    expect(stitched).toBe(content);
  });

  it('overlaps consecutive chunks by exactly the overlap size', () => {
    const content = 'z'.repeat(1000);
    const chunks = chunkText(content, 256, 32);
    expect(chunks.length).toBeGreaterThan(2);

    const first = chunks[0] as string;
    const second = chunks[1] as string;
    expect(second.slice(0, 32)).toBe(first.slice(-32));
  });

  it('never emits an empty or duplicate trailing chunk', () => {
    for (const len of [100, 256, 257, 512, 600, 1000, 2048]) {
      const chunks = chunkText('q'.repeat(len), 512, 64);
      expect(chunks.every((c) => c.length > 0)).toBe(true);
      const last = chunks[chunks.length - 1];
      const secondLast = chunks[chunks.length - 2];
      if (secondLast !== undefined) {
        expect(last).not.toBe(secondLast);
      }
    }
  });

  it('returns no chunks for empty content', () => {
    expect(chunkText('', 512, 64)).toEqual([]);
  });

  it('terminates when overlap is greater than or equal to the window size', () => {
    // A caller-supplied degenerate overlap must not be able to hang the
    // main process; the cursor has to advance regardless.
    const chunks = chunkText('w'.repeat(500), 100, 100);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(50);
  });
});
