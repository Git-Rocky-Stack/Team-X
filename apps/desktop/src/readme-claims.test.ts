/**
 * README countable-claim guard.
 *
 * The README makes numeric claims about this repository — test counts, E2E
 * spec counts, documentation size. Those drift silently: nothing fails when a
 * suite grows and the badge does not, and a stale number reads exactly like a
 * current one.
 *
 * This session removed two README claims that were simply false (a package
 * described as containing an "HF hub client" and a "benchmark runner" that
 * were never in it), so the drift is not hypothetical. Prose claims about
 * behaviour are not mechanically checkable, but *counts* are, and counts are
 * where the rot starts.
 *
 * Deliberately checks two different things:
 *   1. **Internal agreement** — the badge, the tech table and the Testing
 *      section all state the unit-test count. A partial bump that updates one
 *      of the three is the most common way this goes stale.
 *   2. **External truth** — E2E spec files, E2E cases and documentation files
 *      are counted off the filesystem and compared.
 *
 * The unit-test total is deliberately NOT asserted against a live count: this
 * file is itself part of the suite, so any such assertion would have to
 * predict its own contribution and would fail on every test added anywhere.
 * Internal agreement plus a human-updated number is the honest bound.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** apps/desktop/src → repo root. */
const repoRoot = join(here, '..', '..', '..');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

/** Recursively count files matching `ext` under `dir`. */
function countFiles(dir: string, ext: string): number {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) total += countFiles(full, ext);
    else if (entry.endsWith(ext)) total += 1;
  }
  return total;
}

describe('README unit-test claims agree with each other', () => {
  it('states the same test count in the badge, the tech table and the Testing section', () => {
    const badge = readme.match(/tests-([\d%C,]+)%20passing/)?.[1]?.replace(/%2C/g, ',');
    const table = readme.match(/Vitest \(([\d,]+) tests \/ (\d+) files\)/);
    const prose = readme.match(/\*\*([\d,]+) unit tests\*\* across (\d+) files/);

    expect(badge).toBeDefined();
    expect(table).not.toBeNull();
    expect(prose).not.toBeNull();

    expect(table?.[1]).toBe(badge);
    expect(prose?.[1]).toBe(badge);
    // File counts must agree too — they drift independently of the test total.
    expect(prose?.[2]).toBe(table?.[2]);
  });
});

describe('README counts match the repository', () => {
  it('claims the real number of Playwright E2E spec files', () => {
    const claimed = Number(readme.match(/\*\*(\d+) Playwright E2E specs\*\*/)?.[1]);
    const actual = readdirSync(join(here, '..', 'e2e')).filter((f) =>
      f.endsWith('.spec.ts'),
    ).length;

    expect(claimed).toBe(actual);
  });

  it('claims the real number of E2E cases', () => {
    const claimed = Number(readme.match(/\*\*\d+ Playwright E2E specs\*\* \((\d+) cases\)/)?.[1]);
    const e2eDir = join(here, '..', 'e2e');
    const actual = readdirSync(e2eDir)
      .filter((f) => f.endsWith('.spec.ts'))
      .reduce(
        (sum, f) =>
          sum + (readFileSync(join(e2eDir, f), 'utf8').match(/^\s*test\(/gm)?.length ?? 0),
        0,
      );

    expect(claimed).toBe(actual);
  });

  it('claims the real number of migrations, and every migration file is journaled', () => {
    // Two failure modes, both real. The README stated "38 migrations" while
    // `migrations/` held 38 `.sql` files but `meta/_journal.json` listed 37:
    // `0022_sqlite_vec_integration.sql` collided on index 0022 with
    // `0022_long_run_resume_origin.sql` and was never journaled, so drizzle
    // never applied it and the table it created never existed. Counting files
    // alone would have called that healthy.
    const migrationsDir = join(here, 'main', 'db', 'migrations');
    const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const journal = JSON.parse(
      readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };

    // Every file on disk is applied by the migrator, and vice versa.
    const tags = new Set(journal.entries.map((e) => e.tag));
    const unjournaled = sqlFiles.filter((f) => !tags.has(f.replace(/\.sql$/, '')));
    expect(unjournaled).toEqual([]);
    expect(journal.entries.length).toBe(sqlFiles.length);

    // Both README mentions state that same number.
    const mentions = [...readme.matchAll(/\((\d+) migrations\)/g)].map((m) => Number(m[1]));
    expect(mentions.length).toBeGreaterThan(0);
    for (const claimed of mentions) {
      expect(claimed).toBe(sqlFiles.length);
    }
  });

  it('does not understate the documentation set', () => {
    // Written as "N files" rather than a vague "50+": a floor that is 86 files
    // below the truth is not a useful statement about the project.
    const claimed = Number(
      readme.match(/documentation across ([\d,]+) files/)?.[1]?.replace(',', ''),
    );
    const actual = countFiles(join(repoRoot, 'docs'), '.md');

    expect(claimed).toBe(actual);
  });
});
