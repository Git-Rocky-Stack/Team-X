/**
 * M41 T7 - Phase 6 COMPLETE release-marker pins.
 *
 * These source-string guards lock the Phase 6 exit state before the
 * final release ledger/tag tasks. They intentionally pin the product
 * completion marker, package-version marker, and current E2E surface
 * without claiming the final v1.2.0 git tag has landed.
 *
 * Placement matches the M35 T10 marker test: this file lives under
 * `apps/desktop/src/` so the desktop Vitest project always picks it up.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

function read(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

describe('Phase 6 COMPLETE release-marker pins (M41 T7)', () => {
  test('CLAUDE.md declares Phase 6 COMPLETE with v1.2.0 and the current E2E count', () => {
    const claudeMd = read('CLAUDE.md');

    expect(
      claudeMd,
      'CLAUDE.md must carry the Phase 6 COMPLETE literal once M41 has enough evidence to flip the status block.',
    ).toMatch(/Phase 6 COMPLETE - v1\.2\.0/);
    expect(claudeMd, 'CLAUDE.md must pin the current M41 E2E surface.').toMatch(
      /17 Playwright specs \/ 22 cases/,
    );
    expect(
      claudeMd,
      'CLAUDE.md must not still say Phase 6 M38 is the next implementation task after the Phase 6 completion marker lands.',
    ).not.toMatch(/Phase 6 M38 Insight Feedback Loop is next/);
  });

  test('Phase 6 design doc records M41 complete with v1.2.0 package markers', () => {
    const designDoc = read('docs/plans/2026-04-20-team-x-phase-6-capabilities-evidence.md');

    expect(designDoc, 'Phase 6 design doc must carry the Phase 6 COMPLETE status literal.').toMatch(
      /Status:\*\* Phase 6 COMPLETE \(2026-04-20\)/,
    );
    expect(designDoc, 'Phase 6 design doc must pin the v1.2.0 marker.').toMatch(/v1\.2\.0/);
    expect(designDoc, 'Phase 6 design doc must mark M41 complete in the milestone table.').toMatch(
      /\|\s*\*\*M41\*\*\s*\|\s*Demo \+ Hardening \+ v1\.2\.0\s*\|\s*\*\*Complete\*\*/,
    );
  });

  test('Phase 6 design doc pins the current E2E count without claiming the final tag', () => {
    const designDoc = read('docs/plans/2026-04-20-team-x-phase-6-capabilities-evidence.md');

    expect(designDoc, 'Phase 6 design doc must pin the current M41 E2E surface.').toMatch(
      /17 Playwright specs \/ 22 cases/,
    );
    expect(
      designDoc,
      'T7 can mark Phase 6 product scope complete, but the final v1.2.0 git tag remains gated on M41 T10.',
    ).toMatch(/final v1\.2\.0 git tag remains gated on M41 T10/);
  });
});
