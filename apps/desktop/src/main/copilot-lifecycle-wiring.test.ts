import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The composition root: `index.ts` plus the boot phases it sequences from
 * `boot/` (audit 2026-10-07 P1-7 split it). Pins read them as one source.
 */
function compositionRootSource(): string {
  const mainDir = dirname(fileURLToPath(import.meta.url));
  const bootDir = join(mainDir, 'boot');
  const boot = readdirSync(bootDir)
    .filter((name) => name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(name))
    .sort()
    .map((name) => join(bootDir, name));
  return [join(mainDir, 'index.ts'), ...boot].map((path) => readFileSync(path, 'utf8')).join('\n');
}

const mainIndexSrc = compositionRootSource();

describe('Copilot lifecycle wiring', () => {
  it('starts analyzer schedules for all active companies during main-process bootstrap', () => {
    expect(mainIndexSrc).toMatch(
      /for \(const company of companiesRepo\.list\(\)\) \{\s+if \(company\.status === 'archived'\) continue;\s+copilotAnalyzerServiceInstance\.start\(company\.id\);\s+\}/,
    );
  });

  it('exposes a lazy start wrapper so companies.create can schedule new companies', () => {
    expect(mainIndexSrc).toContain('start: (cid: string) => {');
    expect(mainIndexSrc).toContain('copilotAnalyzerServiceInstance?.start(cid);');
  });
});
