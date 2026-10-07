/**
 * Source guard: the fabricated developer CLI and the broken eval entry
 * points stay gone.
 *
 * `ai-cli` (bin `team-x-ai`) printed made-up output — a zeroed "mockStats"
 * graph, "Example fact 1/2" with invented freshness, literal-zero trace
 * summaries, and an `eval` that only said what it "would" run — and parsed
 * argv twice, so every command ran twice. `ai:eval` pointed at a script that
 * did not exist, the root benchmark imported an unexported subpath, and
 * `golden-dataset.ts` held nothing but `*_PLACEHOLDER` document IDs. None of
 * it was backed by a real store, so all of it was removed rather than
 * patched. The tested evaluation library (`createRagEvaluator`, metrics)
 * stays and is reached through `AiService.evaluate` with a real dataset.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..');
const repoRoot = join(pkgRoot, '..', '..');

describe('removed fake entry points', () => {
  it('ships no ai-cli sources', () => {
    expect(existsSync(join(pkgRoot, 'src', 'cli'))).toBe(false);
  });

  it('ships no placeholder golden dataset', () => {
    expect(existsSync(join(here, 'golden-dataset.ts'))).toBe(false);
    const index = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(index).not.toMatch(/golden-dataset/);
  });

  it('ships no benchmark scripts against the placeholder dataset', () => {
    expect(existsSync(join(repoRoot, 'scripts', 'eval'))).toBe(false);
    expect(existsSync(join(pkgRoot, 'scripts', 'eval'))).toBe(false);
  });

  it('declares no bin and no ai:* scripts in the package manifest', () => {
    const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      bin?: unknown;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(manifest.bin).toBeUndefined();
    expect(Object.keys(manifest.scripts ?? {}).filter((k) => k.startsWith('ai:'))).toEqual([]);
    // `commander` existed only to parse the fake CLI's argv.
    expect(manifest.dependencies?.commander).toBeUndefined();
  });

  it('does not document the removed CLI commands as working', () => {
    const doc = readFileSync(join(repoRoot, 'docs', 'user-guide', 'cli-reference.md'), 'utf8');
    expect(doc).not.toMatch(/What `ai-cli` supports today/);
    expect(doc).not.toMatch(/src\/cli\/ai-cli\.ts/);
  });
});
