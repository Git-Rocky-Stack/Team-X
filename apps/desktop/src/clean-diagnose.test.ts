// scripts/clean-diagnose.mjs (audit 2026-10-07 P3-3): report-only by default,
// and --remove deletes only the classes it is given.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { RESIDUE, plan } from '../../../scripts/clean-diagnose.mjs';

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function seed(...paths: string[]) {
  root = mkdtempSync(join(tmpdir(), 'clean-diagnose-'));
  for (const p of paths) {
    mkdirSync(join(root, p), { recursive: true });
    writeFileSync(join(root, p, 'x'), 'x');
  }
}

describe('clean-diagnose plan', () => {
  it('removes only the requested class, and only paths that exist', () => {
    seed('coverage', 'apps/desktop/out', 'release', '.llama-cache');
    const targets = plan(root, ['build-output']).map((p: string) => p.slice(root.length + 1));
    expect(targets.sort()).toEqual(['apps/desktop/out', 'coverage']);
  });

  it('never touches release output unless the release class is named', () => {
    seed('release', 'coverage');
    expect(
      plan(root, ['build-output', 'downloads']).some((p: string) => p.endsWith('release')),
    ).toBe(false);
    expect(plan(root, ['release']).map((p: string) => p.slice(root.length + 1))).toEqual([
      'release',
    ]);
  });

  it('refuses an unknown class instead of guessing', () => {
    seed();
    expect(() => plan(root, ['everything'])).toThrow(/unknown class/);
  });

  it('classifies regenerable output separately from downloads and releases', () => {
    expect(RESIDUE['build-output']).toContain('coverage');
    expect(RESIDUE.downloads).toContain('.llama-cache');
    expect(RESIDUE.release).toEqual(['release']);
  });
});
