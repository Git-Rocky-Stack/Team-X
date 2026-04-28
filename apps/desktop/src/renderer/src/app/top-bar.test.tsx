/**
 * Release-marker freeze tests (Phase 6 — M41 T6).
 *
 * Two small guards that only fail on a mistaken version / phase bump:
 *
 *   1. `top-bar.tsx` must render the literal badge text "Phase 6".
 *      Catches release-marker drift before the final Phase 6 gate.
 *      Every Phase 6 E2E spec that asserts the app badge should stay in
 *      lockstep with this source-string marker.
 *
 *   2. Every workspace `package.json` carrying the Team-X release
 *      marker must carry the current release version. Pins the release
 *      marker so a wrong semver change (e.g. an accidental downgrade,
 *      partial bump, or mistaken future bump) lands with a failing CI
 *      run.
 *
 * Per the M35 T3 (`audit-event-chip.test.tsx`) convention: pure
 * source-string audit only. No jsdom, no React rendering — the per-
 * workspace vitest config (`apps/desktop/vitest.config.ts`) runs
 * `environment: 'node'`, and every renderer test to date reads source
 * files as strings and asserts on content. Adding jsdom to just pin
 * two literals would be a heavy regression for zero benefit.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);

// `top-bar.tsx` lives beside this test file.
const TOP_BAR_PATH = join(currentDirname, 'top-bar.tsx');

// `apps/desktop/package.json` is four directories up from
// `apps/desktop/src/renderer/src/app/`:
//   app/ → src/ → renderer/ → src/ → apps/desktop/
const DESKTOP_PACKAGE_JSON_PATH = join(currentDirname, '..', '..', '..', '..', 'package.json');
const REPO_ROOT_DIR = join(currentDirname, '..', '..', '..', '..', '..', '..');
const REPO_ROOT_PACKAGE_JSON_PATH = join(REPO_ROOT_DIR, 'package.json');

const RELEASE_PACKAGE_JSON_PATHS = [
  REPO_ROOT_PACKAGE_JSON_PATH,
  DESKTOP_PACKAGE_JSON_PATH,
  join(REPO_ROOT_DIR, 'packages', 'shared-types', 'package.json'),
  join(REPO_ROOT_DIR, 'packages', 'role-schema', 'package.json'),
  join(REPO_ROOT_DIR, 'packages', 'provider-router', 'package.json'),
  join(REPO_ROOT_DIR, 'packages', 'intelligence', 'package.json'),
  join(REPO_ROOT_DIR, 'packages', 'telemetry-core', 'package.json'),
];

describe('top-bar release-marker freeze (M41 T6)', () => {
  it('renders the literal badge text "Phase 6"', () => {
    const src = readFileSync(TOP_BAR_PATH, 'utf8');

    // Match the <Badge ...>children</Badge> block — whitespace-tolerant
    // on both sides of the children so JSX formatting drift (Biome, a
    // future Prettier bump, or hand-edits) does not false-fail this.
    const badgeMatch = src.match(/<Badge[\s\S]*?>\s*([\s\S]*?)\s*<\/Badge>/);

    expect(badgeMatch, 'top-bar.tsx must contain a <Badge>...</Badge> element').toBeTruthy();
    const captured = badgeMatch?.[1]?.trim() ?? '';
    expect(captured).toBe('Phase 6');
  });

  it("pins all release package.json versions to '2.0.0'", () => {
    for (const packageJsonPath of RELEASE_PACKAGE_JSON_PATHS) {
      const raw = readFileSync(packageJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };

      expect(typeof parsed.version, `${packageJsonPath} version must be a string`).toBe('string');
      expect(parsed.version, `${packageJsonPath} version`).toBe('2.0.0');
    }
  });
});
