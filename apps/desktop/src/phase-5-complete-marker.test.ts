/**
 * M35 T10 — Phase 5 COMPLETE release-marker pins.
 *
 * Three mechanical guards that lock the Phase 5 exit state across
 * three canonical docs. If ANY of these three assertions fails,
 * the repo is in an "in progress but v1.1.0 tagged" ambiguous
 * state — either a doc was flipped back to "in progress" without
 * re-tagging, or v1.1.0 was tagged without flipping every required
 * marker. Both are release-blocking, so catch them at the unit
 * layer rather than at post-release regret.
 *
 * Why pure Node + fs (no jsdom, no React): same source-string-audit
 * pattern as M35 T3 (audit-event-chip-helpers), M35 T8 (top-bar
 * badge freeze), and M35 T9 (e2e-regression-guards). Vitest env is
 * `node`; we regex-scan on-disk files. No DOM, no renderer, no
 * IPC touchpoints.
 *
 * Placement rationale: lives under `apps/desktop/src/` (not the
 * repo root) because the per-workspace Vitest config picks up
 * `.test.ts` files under `src/` and the root `vitest.workspace.ts`
 * routes them through the desktop project's config. Placing this
 * outside `apps/desktop/src/` would silently skip it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// `apps/desktop/src/phase-5-complete-marker.test.ts` → repo root
const REPO_ROOT = join(HERE, '..', '..', '..');

function read(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

describe('Phase 5 COMPLETE release-marker pins (M35 T10)', () => {
  /**
   * Pin #1 — CLAUDE.md Phase 5 status line is the flagship marker.
   * The literal phrase is referenced by the Loki Continuity
   * protocol and by the M35 plan doc §3 T10 row. A regression
   * here — e.g. a docs sweep that reverts it to "in progress" —
   * would contradict the v1.1.0 git tag.
   */
  test('CLAUDE.md declares Phase 5 complete with the v1.1.0 marker', () => {
    const claudeMd = read('CLAUDE.md');
    expect(
      claudeMd,
      'CLAUDE.md must carry the Phase 5 COMPLETE literal (flipped from "in progress" in M35 T10). If this test fails, either the literal was reverted or v1.1.0 was tagged without the flip.',
    ).toMatch(
      /Phase 5 \(Intelligence Layer\) — complete\. All 8 milestones shipped \(M28 → M35\)\. v1\.1\.0\./,
    );
    expect(
      claudeMd,
      'CLAUDE.md must NOT still carry the "Phase 5 (Intelligence Layer) — in progress" literal — the T10 marker flip must have landed.',
    ).not.toMatch(/Phase 5 \(Intelligence Layer\) — in progress/);
  });

  /**
   * Pin #2 — Phase 5 design doc §9 M35 row is the single source
   * of truth for Phase 5 milestone status. M35 row flipping to
   * ✅ Complete is the definition of Phase 5 done.
   */
  test('Phase 5 design doc §9 M35 row shows ✅ Complete', () => {
    const designDoc = read('docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md');
    // The §9 table row for M35: `| **M35** | Demo + hardening | ✅ Complete (YYYY-MM-DD) | ...`
    expect(
      designDoc,
      'Phase 5 design doc §9 M35 row must be flipped from 📋 Planned to ✅ Complete — the row is the single source of truth for Phase 5 milestone status.',
    ).toMatch(/\|\s*\*\*M35\*\*\s*\|\s*Demo \+ hardening\s*\|\s*✅ Complete/);
    expect(designDoc, 'Phase 5 design doc §9 M35 row must NOT still show 📋 Planned.').not.toMatch(
      /\|\s*\*\*M35\*\*\s*\|\s*Demo \+ hardening\s*\|\s*📋 Planned/,
    );
  });

  /**
   * Pin #3 — CONTINUITY.md top carries the Phase 5 COMPLETE
   * header. The Loki continuity protocol reads the top of
   * CONTINUITY.md on every session start; a missing Phase 5
   * COMPLETE header here would mislead the next session into
   * treating Phase 5 as still in flight.
   *
   * Scope: first 200 lines only (CONTINUITY.md grows append-only;
   * the newest session is always at the top).
   */
  test('CONTINUITY.md top carries the Phase 5 COMPLETE header', () => {
    const continuity = read('.loki/CONTINUITY.md');
    const top = continuity.split('\n').slice(0, 200).join('\n');
    expect(
      top,
      'CONTINUITY.md must carry a "Phase 5 COMPLETE" header in the first 200 lines so the next session\'s Loki bootstrap reads the correct phase state. Without it, the next session will treat Phase 5 as still in flight.',
    ).toMatch(/Phase 5 COMPLETE/);
  });
});
