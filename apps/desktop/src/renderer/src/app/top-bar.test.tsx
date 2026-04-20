/**
 * Release-marker freeze tests (Phase 5 — M35 T8).
 *
 * Two small guards that only fail on a mistaken version / phase bump:
 *
 *   1. `top-bar.tsx` must render the literal badge text "Phase 5".
 *      Catches an accidental flip to "Phase 6" before Phase 6 work
 *      officially begins. Every Phase 5 E2E spec (smoke, ticket-flow,
 *      meeting-flow, vault-backup, copilot-ui, phase-5-integration,
 *      etc.) pins this string; a premature bump would cascade the
 *      whole suite red on CI. This unit test fails first, cheapest,
 *      and with the clearest error.
 *
 *   2. `apps/desktop/package.json` must carry the current release
 *      version. Pins the release marker so a wrong semver change
 *      (e.g. an accidental downgrade, or a premature 1.2.0 / 2.0.0
 *      bump) lands with a failing CI run. Paired with the repo-wide
 *      version sweep across all seven workspace package.json files.
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

describe('top-bar release-marker freeze (M35 T8)', () => {
  it('renders the literal badge text "Phase 5" (not "Phase 6")', () => {
    const src = readFileSync(TOP_BAR_PATH, 'utf8');

    // Match the <Badge ...>children</Badge> block — whitespace-tolerant
    // on both sides of the children so JSX formatting drift (Biome, a
    // future Prettier bump, or hand-edits) does not false-fail this.
    const badgeMatch = src.match(/<Badge[\s\S]*?>\s*([\s\S]*?)\s*<\/Badge>/);

    expect(badgeMatch, 'top-bar.tsx must contain a <Badge>...</Badge> element').toBeTruthy();
    const captured = badgeMatch?.[1]?.trim() ?? '';
    expect(captured).toBe('Phase 5');
  });

  it("pins apps/desktop/package.json version to '1.1.1'", () => {
    const raw = readFileSync(DESKTOP_PACKAGE_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };

    expect(typeof parsed.version, 'version must be a string').toBe('string');
    expect(parsed.version).toBe('1.1.1');
  });
});
