/**
 * Accessibility regression guard: every Radix Dialog/Sheet content
 * surface must supply an accessible description.
 *
 * `@radix-ui/react-dialog` (which backs both our `DialogContent` and
 * `SheetContent` primitives) emits
 *   "Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}."
 * whenever a content surface mounts without a `Description` element or
 * an explicit `aria-describedby`. That warning is both an a11y defect
 * (screen-reader users get no dialog summary) and noise on the E2E
 * main-process stderr. This guard scans the renderer source for every
 * `<DialogContent` / `<SheetContent` usage and fails if the same file
 * does not also provide a `DialogDescription` / `SheetDescription` /
 * `aria-describedby`.
 *
 * Pure Node + fs source audit (same pattern as `e2e-regression-guards`):
 * no DOM, no React render — just a regex scan of on-disk files. The
 * file-level heuristic is deliberately coarse (a description anywhere
 * in the file counts) because our dialogs render exactly one content
 * surface each; it is strict enough to have caught the Phase 4a
 * offenders (command-palette + chat-drawer) and cheap enough to keep
 * green forever.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// `apps/desktop/src/renderer/src/dialog-a11y-guards.test.ts` → the
// renderer source root is this file's own directory.
const RENDERER_SRC = dirname(fileURLToPath(import.meta.url));

function collectComponentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectComponentFiles(full));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Matches a JSX usage of `<DialogContent` or `<SheetContent`. */
const CONTENT_USAGE_RE = /<(?:Dialog|Sheet)Content[\s>]/;

/** Matches an accessible description: a Radix Description or aria-describedby. */
const DESCRIPTION_RE = /(?:Dialog|Sheet)Description|aria-describedby/;

describe('Dialog/Sheet accessibility guard', () => {
  it('every Dialog/Sheet content surface provides an accessible description', () => {
    const offenders: string[] = [];
    for (const file of collectComponentFiles(RENDERER_SRC)) {
      const src = readFileSync(file, 'utf8');
      if (CONTENT_USAGE_RE.test(src) && !DESCRIPTION_RE.test(src)) {
        offenders.push(file.slice(RENDERER_SRC.length + 1).replace(/\\/g, '/'));
      }
    }
    expect(
      offenders,
      `Radix Dialog/Sheet content rendered without an accessible description (a11y defect + E2E main-stderr noise). Add a <DialogDescription>/<SheetDescription> (sr-only is fine) or an explicit aria-describedby:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
