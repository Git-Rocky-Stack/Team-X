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
