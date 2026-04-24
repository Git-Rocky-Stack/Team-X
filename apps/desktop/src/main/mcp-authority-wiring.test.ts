import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const MAIN_INDEX_PATH = join(currentDirname, 'index.ts');
const mainIndexSrc = readFileSync(MAIN_INDEX_PATH, 'utf8');

describe('MCP authority wiring', () => {
  it('resolves effective authority before MCP tool filtering and execution', () => {
    expect(mainIndexSrc).toContain(
      'const effectiveAuthority = authorityResolver.resolveEmployee(company.id, employee.id);',
    );
    expect(mainIndexSrc).toContain('toolsAllowed = effectiveAuthority.toolsAllowed;');
    expect(mainIndexSrc).toContain('toolsDenied = effectiveAuthority.toolsDenied;');
    expect(mainIndexSrc).toContain(
      'failed to resolve effective authority for ${employee.id}; falling back to role defaults',
    );
  });
});
