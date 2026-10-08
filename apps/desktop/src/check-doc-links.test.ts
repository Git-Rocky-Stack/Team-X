// scripts/check-doc-links.mjs (audit 2026-10-07 P2-6): GitHub anchor rules and
// link extraction, pinned so the gate neither misses a broken link nor flags
// a working one.

import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { anchorsOf, linksOf, slugify } from '../../../scripts/check-doc-links.mjs';

describe('slugify (GitHub heading anchors)', () => {
  it.each([
    ['v3.5.0 (2026-10-08)', 'v350-2026-10-08'],
    ['Privacy you can rely on', 'privacy-you-can-rely-on'],
    [
      '3a. Renderer Trust Boundary (`main/security/renderer-boundary.ts`)',
      '3a-renderer-trust-boundary-mainsecurityrenderer-boundaryts',
    ],
    ['Q&A — FAQ', 'qa--faq'],
  ])('%s → #%s', (heading, slug) => {
    expect(slugify(heading)).toBe(slug);
  });

  it('numbers repeated headings like GitHub', () => {
    const anchors = anchorsOf('# Setup\n\n## Setup\n\n### Setup\n');
    expect([...anchors]).toEqual(['setup', 'setup-1', 'setup-2']);
  });

  it('ignores headings inside code fences and honours explicit anchors', () => {
    const anchors = anchorsOf('```\n# not a heading\n```\n<a name="custom"></a>\n# Real\n');
    expect(anchors.has('not-a-heading')).toBe(false);
    expect(anchors.has('custom')).toBe(true);
    expect(anchors.has('real')).toBe(true);
  });
});

describe('linksOf', () => {
  it('returns relative targets with their line, skipping URLs and code', () => {
    const md = [
      'See [guide](./guide.md#install) and [site](https://example.com).',
      '`[not](a-link.md)` and [mail](mailto:x@y.z)',
      '```',
      '[inside](fence.md)',
      '```',
      '[anchor only](#top) <[angle](<docs/a b.md>)>',
    ].join('\n');
    expect(linksOf(md)).toEqual([
      { target: './guide.md#install', line: 1 },
      { target: '#top', line: 6 },
      { target: 'docs/a b.md', line: 6 },
    ]);
  });
});
