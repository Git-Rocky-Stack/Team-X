// scripts/check-file-size.mjs (audit 2026-10-07 P1-7): production source stays
// under the line budget unless an exception names the file, says why, and caps
// it close to its current size so it can shrink but never grow.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { checkFileSizes, isProductionSource } from '../../../scripts/check-file-size.mjs';

describe('isProductionSource', () => {
  it.each([
    ['apps/desktop/src/main/index.ts', true],
    ['apps/desktop/src/renderer/src/App.tsx', true],
    ['packages/shared-types/src/ipc/bridge.ts', true],
    ['apps/desktop/src/main/ipc/handlers.test.ts', false],
    ['apps/desktop/e2e/smoke.spec.ts', false],
    ['apps/desktop/src/renderer/src/types/window.d.ts', false],
    ['apps/desktop/src/main/db/migrations/0001_init.ts', false],
    ['apps/desktop/src/renderer/src/test-utils/axe.ts', false],
    ['apps/desktop/src/renderer/src/components/console/test-setup.ts', false],
    ['scripts/check-file-size.mjs', false],
  ])('%s → %s', (path, expected) => {
    expect(isProductionSource(path)).toBe(expected);
  });
});

describe('checkFileSizes', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'teamx-filesize-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (rel: string, lines: number) => {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), `${'x\n'.repeat(lines)}`);
  };
  const run = (exceptions: Record<string, { maxLines: number; reason: string }> = {}) =>
    checkFileSizes(root, { maxLines: 100, ratchetSlack: 10, exceptions });

  it('passes files within the budget', () => {
    write('apps/desktop/src/a.ts', 100);
    write('packages/x/src/b.ts', 40);
    expect(run().problems).toEqual([]);
  });

  it('fails a production file over the budget and names it', () => {
    write('apps/desktop/src/big.ts', 101);
    const { problems } = run();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('apps/desktop/src/big.ts');
    expect(problems[0]).toContain('101');
  });

  it('ignores tests and other non-production files however long', () => {
    write('apps/desktop/src/big.test.ts', 5000);
    write('apps/desktop/src/main/db/migrations/0001.ts', 5000);
    expect(run().problems).toEqual([]);
  });

  it('lets an excepted file reach its cap, and no further', () => {
    write('apps/desktop/src/big.ts', 150);
    expect(
      run({ 'apps/desktop/src/big.ts': { maxLines: 150, reason: 'declarative' } }).problems,
    ).toEqual([]);
    write('apps/desktop/src/big.ts', 151);
    const { problems } = run({ 'apps/desktop/src/big.ts': { maxLines: 150, reason: 'decl' } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('cap');
  });

  it('requires a reason for every exception', () => {
    write('apps/desktop/src/big.ts', 150);
    const { problems } = run({ 'apps/desktop/src/big.ts': { maxLines: 150, reason: ' ' } });
    expect(problems).toEqual([expect.stringContaining('reason')]);
  });

  it('ratchets: a cap well above the file must be lowered', () => {
    write('apps/desktop/src/big.ts', 120);
    const { problems } = run({ 'apps/desktop/src/big.ts': { maxLines: 150, reason: 'decl' } });
    expect(problems).toEqual([expect.stringContaining('lower its cap to 120')]);
  });

  it('flags an exception for a file that is gone or back under the budget', () => {
    write('apps/desktop/src/small.ts', 50);
    const { problems } = run({
      'apps/desktop/src/small.ts': { maxLines: 55, reason: 'was large' },
      'apps/desktop/src/gone.ts': { maxLines: 500, reason: 'deleted' },
    });
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('small.ts');
    expect(problems.join('\n')).toContain('gone.ts');
  });
});
