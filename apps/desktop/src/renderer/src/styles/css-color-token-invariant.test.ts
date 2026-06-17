import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Design-system invariant: a CSS custom property defined as a FULL color value
 * (`#hex` or `rgb()/rgba()`) must never be wrapped in `hsl()`.
 *
 * `hsl(var(--token))` only resolves when `--token` is an HSL channel triplet
 * (e.g. `0 0% 15%`, the shadcn convention). When `--token` is already a complete
 * color — `--hairline: rgba(255,255,255,0.08)`, `--display-fg: #b3b3b3` — the
 * declaration becomes `hsl(rgba(...))` / `hsl(#hex)`, which is invalid CSS. The
 * browser silently drops it and the element falls back to an inherited value
 * (e.g. an intended hairline border renders as `border-border`, dim phosphor
 * text renders at full platinum). The Phase-1/2 shell uses the correct bare
 * `[var(--token)]` form; this test locks that convention in for every later
 * sweep so the regression cannot return.
 */

const here = dirname(fileURLToPath(import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const srcRoot = join(here, '..');
const globalsPath = join(here, 'globals.css');

/** Recursively collect every `.ts`/`.tsx`/`.css` file under the renderer src. */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Token names defined directly as a hex or rgb/rgba literal in globals.css. */
function fullColorTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  const defRe = /--([a-z0-9-]+)\s*:\s*(?:#|rgba?\()/gi;
  for (const match of css.matchAll(defRe)) {
    const name = match[1];
    if (name) tokens.add(name);
  }
  return tokens;
}

describe('CSS color-token invariant', () => {
  const css = readFileSync(globalsPath, 'utf8');
  const tokens = fullColorTokens(css);

  it('parses the known full-color tokens (guards against a vacuous pass)', () => {
    // If the parser regressed and collected nothing, the offender scan below
    // would pass for the wrong reason. Anchor it on tokens we know are full
    // colors so a broken parser fails loudly here instead.
    for (const expected of ['hairline', 'display-fg', 'void', 'armed-edge', 'armed-soft']) {
      expect(
        tokens.has(expected),
        `expected '${expected}' to be parsed as a full-color token`,
      ).toBe(true);
    }
    expect(tokens.size).toBeGreaterThan(10);
  });

  it('never wraps a full-color token in hsl() anywhere in renderer src', () => {
    const alternation = [...tokens].join('|');
    const offenderRe = new RegExp(`hsl\\(var\\(--(${alternation})\\)`, 'g');

    const offenders: string[] = [];
    for (const file of collectSourceFiles(srcRoot)) {
      if (file === selfPath) continue;
      const content = readFileSync(file, 'utf8');
      for (const hit of content.matchAll(offenderRe)) {
        const token = hit[1] ?? 'unknown';
        offenders.push(`${relative(srcRoot, file)} → hsl(var(--${token}))`);
      }
    }

    expect(
      offenders,
      `Full-color CSS tokens must use bare var(--token), not hsl(var(--token)):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
