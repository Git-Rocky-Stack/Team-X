import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const mainIndexSrc = readFileSync(join(currentDirname, 'index.ts'), 'utf8');

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
