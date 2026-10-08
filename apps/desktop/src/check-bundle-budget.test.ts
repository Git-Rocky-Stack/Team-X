// scripts/check-bundle-budget.mjs (audit 2026-10-07 P2-2): the gate fails a
// build whose output outgrows its budget, and fails a budget that no longer
// matches anything, so a renamed entry cannot slip out from under its cap.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { BUDGETS, checkBudgets, matchGlob } from '../../../scripts/check-bundle-budget.mjs';

describe('matchGlob', () => {
  it.each([
    ['renderer/assets/index-*.js', 'renderer/assets/index-BU6p4jYU.js', true],
    ['renderer/assets/index-*.js', 'renderer/assets/index-BEBQG-9U.css', false],
    ['renderer/assets/*.js', 'renderer/assets/telemetry-view-DPc74.js', true],
    ['renderer/assets/*.js', 'renderer/assets/nested/x.js', false],
    ['renderer/**', 'renderer/assets/nested/x.js', true],
    ['main/index.js', 'main/index.js', true],
  ])('%s ~ %s → %s', (glob, path, expected) => {
    expect(matchGlob(glob, path)).toBe(expected);
  });
});

describe('checkBudgets', () => {
  let out: string;

  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'teamx-budget-'));
    mkdirSync(join(out, 'renderer', 'assets'), { recursive: true });
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  const write = (rel: string, bytes: number) =>
    writeFileSync(join(out, rel), 'x'.repeat(bytes), 'utf8');

  it('passes output within every budget and reports each measurement', () => {
    write('renderer/assets/index-a.js', 900);
    write('renderer/assets/view-b.js', 400);
    const { problems, rows } = checkBudgets(out, [
      { name: 'entry', glob: 'renderer/assets/index-*.js', mode: 'each', maxBytes: 1000 },
      { name: 'all js', glob: 'renderer/assets/*.js', mode: 'total', maxBytes: 1500 },
    ]);
    expect(problems).toEqual([]);
    expect(rows.map((r: { name: string; bytes: number }) => [r.name, r.bytes])).toEqual([
      ['entry', 900],
      ['all js', 1300],
    ]);
  });

  it('fails a file over its raw budget, naming the file', () => {
    write('renderer/assets/index-a.js', 1200);
    const { problems } = checkBudgets(out, [
      { name: 'entry', glob: 'renderer/assets/index-*.js', mode: 'each', maxBytes: 1000 },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('index-a.js');
    expect(problems[0]).toContain('1200');
  });

  it('fails a file over its compressed budget even when the raw size fits', () => {
    // Random bytes do not compress, so gzip size ≈ raw size.
    writeFileSync(
      join(out, 'renderer/assets/index-a.js'),
      Buffer.from(Array.from({ length: 800 }, (_, i) => (i * 7919) % 251)),
    );
    const { problems } = checkBudgets(out, [
      {
        name: 'entry',
        glob: 'renderer/assets/index-*.js',
        mode: 'each',
        maxBytes: 1000,
        maxGzipBytes: 100,
      },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('gzip');
  });

  it('leaves out the files a budget excludes', () => {
    write('renderer/assets/index-a.js', 5000);
    write('renderer/assets/view-b.js', 400);
    const { problems, rows } = checkBudgets(out, [
      {
        name: 'chunk',
        glob: 'renderer/assets/*.js',
        exclude: 'renderer/assets/index-*.js',
        mode: 'each',
        maxBytes: 1000,
      },
    ]);
    expect(problems).toEqual([]);
    expect(rows.map((r: { label: string }) => r.label)).toEqual([
      'chunk renderer/assets/view-b.js',
    ]);
  });

  it('fails a total budget when the files together outgrow it', () => {
    write('renderer/assets/a.js', 600);
    write('renderer/assets/b.js', 600);
    const { problems } = checkBudgets(out, [
      { name: 'all js', glob: 'renderer/assets/*.js', mode: 'total', maxBytes: 1000 },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('all js');
  });

  it('fails a budget that matches no file, so a renamed bundle cannot escape its cap', () => {
    const { problems } = checkBudgets(out, [
      { name: 'entry', glob: 'renderer/assets/index-*.js', mode: 'each', maxBytes: 1000 },
    ]);
    expect(problems).toEqual([expect.stringContaining('matches no file')]);
  });
});

describe('BUDGETS', () => {
  it('caps the renderer entry, every lazy chunk, styles, fonts, main and preload', () => {
    const names = BUDGETS.map((b: { name: string }) => b.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'renderer entry',
        'renderer chunk',
        'renderer styles',
        'renderer font',
        'renderer total',
        'main process',
        'preload',
      ]),
    );
    for (const b of BUDGETS as Array<{ maxBytes: number; maxGzipBytes?: number }>) {
      expect(b.maxBytes).toBeGreaterThan(0);
    }
  });
});
