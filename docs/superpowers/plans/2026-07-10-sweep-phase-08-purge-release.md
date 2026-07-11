# v3.4.0 Aesthetic Sweep — Phase 8 (Purge + Polish + Release) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Execution runs fully inline — no subagents** (Rocky's standing rule for this repo).

**Goal:** Wire `ProactiveControls` into the Mission Control secondary rail, delete every dead legacy composition artifact (mission-shell, `.mission-*` recipes, `.brand-selected` family, `--mission-red` alias), pay down the logged polish debt, run the full-app dual-shift audit, and ship v3.4.0.

**Architecture:** Per-task TDD source-pin contract in a new `features/purge-release-sweep.test.ts` (7a/7b harness pattern: `readSrc` + one `describe` per concern; destructive/global pins land in the task that makes them true). One behavior change only (the Wave-A mount); everything else is deletion, retint, or copy.

**Tech Stack:** React 19 + TypeScript, Tailwind (console tokens in `styles/globals.css`), tailwind-merge v2 `extendTailwindMerge`, Vitest source pins (node env), Biome + ESLint.

**Spec:** `docs/superpowers/specs/2026-07-10-sweep-phase-08-purge-release-design.md` (commit `cff9a81`)

## Global Constraints

- **Branch:** `feat/v3.4.0-sweep-phase-08-purge-release` off `main` `e43aeb2` (already created; spec committed `cff9a81`).
- **One behavior change (Task 1 mount) — everything else visual/deletion/docs/release.** Every `data-*`/`aria-*`/`id` contract preserved except where a file is deleted outright.
- **Untouchable:** `features/memory/memory-formatters.ts`. (`mission-shell.tsx`/`.test.tsx` graduate from untouchable to DELETED this phase.)
- **`.brand-range` recipe + `--scrollbar-thumb*` tokens are LIVE — never delete;** they consume `--mission-red`, which Task 3 renames to `--armed-hsl` (same values, console vocabulary).
- **Lesson 35 (inverted here):** Task 3 pins `globals.css` free of the literal strings `.mission-`, `brand-selected`, `--mission-red` — so every surviving *comment* in globals.css naming them must be reworded prefix-free in the same task.
- **Lesson 28:** never build class names with template literals. Text content template literals (e.g. plural copy) are fine.
- **Lesson 32/34 (Wave D):** never run `_electron` capture concurrently with vitest; delete throwaway capture specs before the PR.
- **Gates per task:** from repo root — `pnpm lint` · `pnpm lint:eslint` · `pnpm typecheck` · the scoped `pnpm vitest run …` named in the step (run vitest from `apps/desktop`). FULL `pnpm test` + `pnpm audit:claims:strict` at Task 10.
- **Commits:** imperative subject; trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Use `git commit -F - <<'EOF'` heredoc via the Bash (Git Bash) tool.
- **CR-7 wall applies IN FULL** (no waivers assumed): CI → `/review` (inline) → Codex (Rocky-triggered) → Rocky sign-off → merge → tag (Stage-5, Rocky-held).

---

### Task 1: Wave A — Wire ProactiveControls into the dashboard secondary rail

**Files:**
- Create: `apps/desktop/src/renderer/src/features/purge-release-sweep.test.ts` (harness + Wave-A block)
- Modify: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx` (~line 1597, after the telemetry-snapshot cell)
- Modify: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx` (~line 58, wiring-pin block)

**Interfaces:**
- Consumes: `ProactiveControls({ companyId: string })` from `features/proactive/proactive-controls.tsx` (exists, 7b-recomposed); dashboard locals `companyId: string | null`, `PanelMessageState`, `Faceplate`.
- Produces: the sweep-test harness (`readSrc`) Tasks 2–7 extend; selector `data-dashboard-secondary-panel="proactive"` + `dataState="proactive-unselected"` for Wave D.

**Placement rationale (recorded):** the secondary rail grid (`xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)_minmax(320px,0.9fr)]`, ~line 1492) has 3 cells: copilot / recent-commands / telemetry-snapshot. ProactiveControls appends as the **4th cell** — at `xl` it wraps to row 2 column 1, directly under the copilot cell ("same region" per Rocky's placement answer) — chosen over widening the template because it keeps every existing panel's grid position stationary. Wave D screenshots validate.

- [ ] **Step 1: Write the failing harness + block**

```ts
// apps/desktop/src/renderer/src/features/purge-release-sweep.test.ts
/**
 * Phase 8 purge + polish contract (source-string pins).
 * Wave A: proactive mount. Wave B: legacy deletion (file-absence + CSS pins
 * land in the task that deletes them — Phase-3 lesson 5). Wave C: polish pins.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('dashboard proactive mount (Wave A)', () => {
  const src = readSrc('dashboard/mission-control-dashboard.tsx');

  it('mounts ProactiveControls as the fourth secondary-rail cell', () => {
    expect(src).toContain("from '@/features/proactive/proactive-controls.js'");
    expect(src).toContain('<ProactiveControls companyId={companyId} />');
    expect(src).toContain('data-dashboard-secondary-panel="proactive"');
  });

  it('guards the null-workspace case with the panel-state idiom', () => {
    expect(src).toContain('dataState="proactive-unselected"');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (not yet mounted)

Run (from `apps/desktop`): `pnpm vitest run src/renderer/src/features/purge-release-sweep.test.ts`
Expected: FAIL on all Wave-A pins.

- [ ] **Step 3: Mount.** In `mission-control-dashboard.tsx`:
  1. Add import (beside the CopilotDashboardWidget import, ~line 47):
     `import { ProactiveControls } from '@/features/proactive/proactive-controls.js';`
  2. Add `Bot` to the existing `lucide-react` import if not already present.
  3. After the closing `</div>` of the `data-dashboard-telemetry-snapshot` cell (the third grid child), insert the fourth cell:

```tsx
              <div data-dashboard-secondary-panel="proactive">
                {companyId ? (
                  <ProactiveControls companyId={companyId} />
                ) : (
                  <Faceplate kicker="Autonomy" serial="PROACTIVE">
                    <PanelMessageState
                      icon={Bot}
                      title="Select a workspace"
                      description="Pick a workspace to load proactive execution status."
                      dataState="proactive-unselected"
                    />
                  </Faceplate>
                )}
              </div>
```

- [ ] **Step 4: Extend the dashboard wiring-pin test.** In `mission-control-dashboard.test.tsx`, in the block ending `expect(missionControlSrc).toContain('CopilotDashboardWidget');` (~line 58), add:

```ts
    expect(missionControlSrc).toContain('ProactiveControls');
```

- [ ] **Step 5: Run — PASS**, then gates.

Run: `pnpm vitest run src/renderer/src/features/purge-release-sweep.test.ts src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx src/renderer/src/features/settings-cluster-sweep.test.ts` → PASS (the 7b proactive block must stay green — the mount doesn't touch that file).
From repo root: `pnpm lint && pnpm lint:eslint && pnpm typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/features/purge-release-sweep.test.ts apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx
git commit -F - <<'EOF'
feat(sweep): Phase 8 — mount ProactiveControls in the dashboard secondary rail

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Wave B — Delete mission-shell files

**Files:**
- Delete: `apps/desktop/src/renderer/src/features/mission/mission-shell.tsx`, `.../mission/mission-shell.test.tsx` (the directory's only two files → directory disappears)
- Modify: `purge-release-sweep.test.ts` (add block)

- [ ] **Step 1: Write the failing pins**

```ts
describe('mission-shell purge (Wave B)', () => {
  it('deletes the legacy primitive library and its test', () => {
    expect(existsSync(join(featuresDir, 'mission/mission-shell.tsx'))).toBe(false);
    expect(existsSync(join(featuresDir, 'mission/mission-shell.test.tsx'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL** (files exist). `pnpm vitest run src/renderer/src/features/purge-release-sweep.test.ts`

- [ ] **Step 3: Delete both files** (`git rm apps/desktop/src/renderer/src/features/mission/mission-shell.tsx apps/desktop/src/renderer/src/features/mission/mission-shell.test.tsx`). Pre-verified: zero importers repo-wide (2026-07-10 census); the string appears only in negative pins + a historical prose comment in `workspace-switcher.tsx` (accurate history — keep).

- [ ] **Step 4: Run — PASS** the sweep test, then **full renderer scope** to prove nothing depended on it: `pnpm vitest run src/renderer` → all green. Gates from root: `pnpm lint && pnpm lint:eslint && pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(sweep): Phase 8 — delete mission-shell primitive library (zero importers)` (+ trailer).

---

### Task 3: Wave B — Purge `.mission-*` recipes, `.brand-selected` family, `--mission-red` alias from globals.css

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css`
- Modify: `purge-release-sweep.test.ts` (add block)

**Interfaces:**
- Produces: `--armed-hsl` channel token (`:root` = `358 68% 40%`, `.dark` = `358 75% 51%`) consumed by `.brand-range` + `--scrollbar-thumb*`. No TSX consumer of `--mission-red` exists (grep-verified).

- [ ] **Step 1: Write the failing pins**

```ts
describe('globals.css legacy purge (Wave B)', () => {
  const css = readFileSync(join(featuresDir, '../styles/globals.css'), 'utf8');

  it('carries none of the retired families, even in comments', () => {
    expect(css).not.toContain('.mission-');
    expect(css).not.toContain('brand-selected');
    expect(css).not.toContain('--mission-red');
  });

  it('renames the channel alias to console vocabulary in both shifts', () => {
    expect(css).toContain('--armed-hsl: 358 68% 40%');
    expect(css).toContain('--armed-hsl: 358 75% 51%');
    expect(css).toContain('hsl(var(--armed-hsl) / 0.58)'); // scrollbar thumb
  });
});
```

*(Note: `css` is read at module load — after Step 3's edits the re-run picks up the new content.)*

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Edit globals.css (four regions):**
  1. **Delete the `.brand-selected` region:** from the doc comment starting `/* * Selected-state primitive — applied to the active choice…` (~line 390) through the `.brand-selected-amber { … }` closing brace (~line 463). Keep the enclosing `@layer`'s own closing brace (~line 464) — `.brand-range` lives in the same layer above and stays.
  2. **Delete the `.mission-*` region:** from `.mission-app-shell {` (~line 585) through the `.mission-select:focus { … }` closing brace (~line 669). Keep `.stencil` above and the `/* ==== CONSOLE RECIPES` comment below.
  3. **Rename the alias:** `--mission-red` → `--armed-hsl` at its `:root` definition (~line 51) and `.dark` override (~line 184), and at every surviving consumer: the `--scrollbar-thumb`/`--scrollbar-thumb-hover` definitions (~157–158) and the six `.brand-range` thumb/track rules (~352, 354, 361, 365, 378, 385, 387). Update the two definition comments from `/* legacy alias → armed (purged Phase 8) */` to `/* armed, as HSL channels — for alpha-composed consumers (brand-range, scrollbar) */`.
  4. **Reword surviving comments naming purged literals prefix-free** (lesson 35): the scrollbar comment (~line 156) `composes with the per-shift --mission-red` → `composes with the per-shift armed channels`; the chooser-caps comment (~line 942) `the swept replacement for \`.brand-selected\`` → `the swept replacement for the legacy chooser-selection recipe (retired v3.4.0)`. Then `grep -n "mission-\|brand-selected" apps/desktop/src/renderer/src/styles/globals.css` → zero hits.

- [ ] **Step 4: Run — PASS:** `pnpm vitest run src/renderer/src/features/purge-release-sweep.test.ts src/renderer/src/app/css-color-token-invariant.test.ts src/renderer/src/app/shell-foundation.test.tsx` (invariant + foundation suites re-parse globals.css). Then build-output check: `pnpm -F @team-x/desktop build` and grep `out/renderer/assets/*.css` to confirm `.brand-range` styles survived and no `mission-` rule remains (lesson 28 class, inverted). Gates from root.

*(If `css-color-token-invariant.test.ts` or `shell-foundation.test.tsx` live at different paths, locate with `pnpm vitest run --reporter=verbose -t "color token"` and run those files.)*

- [ ] **Step 5: Commit** — `feat(sweep): Phase 8 — purge mission recipes + chooser-selection family; alias token to armed-hsl` (+ trailer).

---

### Task 4: Wave B — Docs closure (CLAUDE.md + DESIGN.md)

**Files:**
- Modify: `Team-X/CLAUDE.md`, `Team-X/DESIGN.md` (repo root)

- [ ] **Step 1: CLAUDE.md.** (a) Replace the **Transition state** paragraph (begins `**Transition state (amended 2026-06-10, sweep Q3):**`) with: `**Sweep complete (2026-07-10, Phase 8):** every renderer surface composes from the DESIGN.md console vocabulary. The legacy composition families (mission primitives, chooser-selection recipe, status-badge family) are deleted; do not reintroduce them.` (b) Delete the entire `## Design system reminders (LEGACY — shipped code, superseded by DESIGN.md per-screen at sweep time)` section **except** the `.brand-range` documentation, which moves under the Design System section as a current primitive (copy its existing text verbatim). The status-badge table and the chooser-selection primitive documentation go entirely.
- [ ] **Step 2: DESIGN.md.** Update line ~279 (tier/selection chips row): `Supersedes the legacy chooser-selection family during the sweep` → `Superseded the legacy chooser-selection family (deleted v3.4.0)`. Line ~282 (status-badge migration): drop the `Until a screen is swept…` sentence, state the badge family is deleted. Line ~353 (source-of-truth footer): drop `Until a screen is touched by the aesthetic sweep, existing shipped primitives remain in force; never mix old and new families on one swept screen.` and replace with `The aesthetic sweep completed in v3.4.0 — every screen composes from this document's vocabulary.` **Do not name deleted class literals with their prefixes in either doc** (lesson 35 — keep future grep-guards clean).
- [ ] **Step 3: Verify:** `grep -rn "brand-selected" CLAUDE.md DESIGN.md` → zero hits. Gates: `pnpm lint` (Biome checks md formatting? if not, skip), commit.
- [ ] **Step 4: Commit** — `docs(sweep): Phase 8 — CLAUDE.md + DESIGN.md sweep-complete closure` (+ trailer).

---

### Task 5: Wave C — Sidenav dual-form fix

**Files:** Modify `apps/desktop/src/renderer/src/app/sidenav.tsx:26-27` + sweep-test block.

- [ ] **Step 1: Failing pin**

```ts
describe('sidenav dual-form fix (Wave C)', () => {
  const src = readFileSync(join(featuresDir, '../app/sidenav.tsx'), 'utf8');

  it('steady error dot uses the NO-GO fault token, not the alert-red', () => {
    expect(src).toContain('bg-[var(--led-nogo)]');
    expect(src).not.toContain('--led-warn');
  });
});
```

- [ ] **Step 2: Run — FAIL.** **Step 3:** in `statusColor`, change `case 'error': return 'bg-[var(--led-warn)]';` → `case 'error': return 'bg-[var(--led-nogo)]';` (dual-form rule: blinking `--led-warn` = unacked AnnunciatorRail alerts ONLY; steady fault = NO-GO). **Step 4: PASS + gates.** **Step 5: Commit** — `fix(sweep): Phase 8 — sidenav steady error dot onto NO-GO (dual-form rule)` (+ trailer).

---

### Task 6: Wave C — `--display-fg-mute` token + inside-well muted text

**Files:** Modify `globals.css` (~line 131, beside `--display-fg`), the census-hit TSX files, + sweep-test block.

- [ ] **Step 1: Add the token** (shift-invariant — displays stay dark in both shifts):

```css
    --display-fg-mute: #8a8a86; /* muted text on always-dark surfaces — ≥4.5:1 on --void; NOT --silver-mute (chassis-calibrated, AA-marginal on wells in Day) */
```

- [ ] **Step 2: Census.** `grep -rn "text-silver-mute" apps/desktop/src/renderer/src --include="*.tsx"` (51 files at plan time). For each hit, swap to `text-[var(--display-fg-mute)]` **only when the element renders inside an always-dark display subtree** (`RecessedWell`, `LcdWell`, `.well`, `.lcd` ancestors); chassis-context hits (Faceplate bodies, cards, tiles' eyebrow labels) keep `text-silver-mute`. Two pre-verified swaps to seed the pattern: `message-list.tsx:111` (Live-stream eyebrow inside a `.well`) and `mission-control-dashboard.tsx:1495` (caption inside the copilot `RecessedWell`).
- [ ] **Step 3: Pin** (token exists + the two seed files carry it):

```ts
describe('display-fg-mute token (Wave C)', () => {
  it('defines the always-dark muted text token', () => {
    const css = readFileSync(join(featuresDir, '../styles/globals.css'), 'utf8');
    expect(css).toContain('--display-fg-mute: #8a8a86');
  });

  it('moves in-well muted text off the chassis token', () => {
    expect(readSrc('chat/message-list.tsx')).toContain('text-[var(--display-fg-mute)]');
    expect(readSrc('dashboard/mission-control-dashboard.tsx')).toContain('text-[var(--display-fg-mute)]');
  });
});
```

- [ ] **Step 4: Red → apply token + census swaps → PASS.** Run the sweep test + every existing pinned suite of a touched file (e.g. `work-comms-cluster-sweep.test.ts` if chat files change — update any pin that asserted the old class **in a well context only**). Gates from root. **Step 5: Commit** — `feat(sweep): Phase 8 — display-fg-mute token; in-well muted text off chassis silver` (+ trailer).

---

### Task 7: Wave C — Systemic `extendTailwindMerge` fontSize config

**Files:**
- Modify: `apps/desktop/src/renderer/src/lib/utils.ts`
- Create: `apps/desktop/src/renderer/src/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn()` with identical signature; behavior change = custom text-size classes no longer collapse against text-color classes.

- [ ] **Step 1: Verify tailwind-merge major version** (`grep '"tailwind-merge"' apps/desktop/package.json`) — the config below is the v2 API (`extendTailwindMerge({ extend: { classGroups } })`); v1 uses a flat config object. Adjust shape only if v1.
- [ ] **Step 2: Enumerate the component text classes:** `grep -oE '\.text-[a-z-]+' apps/desktop/src/renderer/src/styles/globals.css | sort -u` — expected family: `.text-eyebrow`, `.text-eyebrow-sm`, `.text-code`, `.text-code-sm`, `.text-shortcut`, `.text-numeric` (+ any `-sm` variants), `.text-menu-label`. Include exactly what the grep returns.
- [ ] **Step 3: Failing behavioral test**

```ts
// apps/desktop/src/renderer/src/lib/utils.test.ts
import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn() custom fontSize class-groups', () => {
  it('keeps a custom text-size alongside a text color (no false conflict)', () => {
    expect(cn('text-caption', 'text-led-go')).toBe('text-caption text-led-go');
  });

  it('still collapses two sizes to the later one', () => {
    expect(cn('text-h2', 'text-body')).toBe('text-body');
    expect(cn('text-caption', 'text-xs')).toBe('text-xs');
  });
});
```

- [ ] **Step 4: Run — the first assertion FAILS on stock twMerge** (it treats both as conflicting `text-*`). **Step 5: Implement:**

```ts
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * The renderer defines semantic fontSize tokens (tailwind.config.ts) and
 * component text classes (globals.css). Stock tailwind-merge cannot tell a
 * custom text-SIZE from a text-COLOR, so `cn('text-caption','text-led-go')`
 * silently dropped the size (the 4b/7a "collapsed token" bug class).
 * Registering them in the font-size group fixes the conflict detection.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        // tailwind.config.ts fontSize tokens
        'text-display', 'text-h1', 'text-h2', 'text-h3', 'text-h4',
        'text-body', 'text-body-strong', 'text-body-sm',
        'text-caption', 'text-label',
        'text-button', 'text-button-sm', 'text-menu-item',
        // globals.css component text classes (Step-2 grep output — adjust to match)
        'text-eyebrow', 'text-eyebrow-sm', 'text-code', 'text-code-sm',
        'text-shortcut', 'text-numeric', 'text-menu-label',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Run — PASS, then the FULL vitest suite** (`pnpm test` from root — `cn()` is app-wide; any test pinning collapsed-class output surfaces now, fix each at the pin with the newly-correct expectation). Gates. **Step 7: Commit** — `fix(sweep): Phase 8 — register semantic text tokens with tailwind-merge (kills the collapsed-fontSize bug class)` (+ trailer).

---

### Task 8: Wave C — Small polish items (verify-first; drop resolved)

**Files:** `features/chat/chat-view.tsx:154`, `features/settings/add-provider-dialog.tsx`, `globals.css`, `components/console/metric-tile.tsx` (+ its test), `features/chat/message-list.tsx`, + sweep-test block.

- [ ] **Step 1: Plural fix.** `chat-view.tsx:154`: `<Tag>{threads.length} visible threads</Tag>` → `<Tag>{threads.length === 1 ? '1 visible thread' : `${threads.length} visible threads`}</Tag>`. Pin: `expect(readSrc('chat/chat-view.tsx')).toContain("1 visible thread'")`.
- [ ] **Step 2: Scrim token.** globals.css, beside `--void` (~line 127): `--scrim: rgb(0 0 0 / 0.5); /* modal backdrop — both shifts */`. `add-provider-dialog.tsx`: `bg-black/50` → `bg-[var(--scrim)]`. Pins: css contains `--scrim:`; dialog src not-contains `bg-black/50`. (7b's settings-cluster guard already forbids raw hex there — `var()` is clean.)
- [ ] **Step 3: MetricTile truncate** (7a Stage-2 informational): in `metric-tile.tsx` line 47, `<span className="text-numeric tabular-nums">{value}</span>` → `<span className="block truncate text-numeric tabular-nums" title={value}>{value}</span>`. Run `pnpm vitest run src/renderer/src/components/console/metric-tile.test.tsx` — update any pin on the old span string; visual check in Wave D.
- [ ] **Step 4: Verify-and-drop sweep** (each gets a one-line disposition in the commit body): (a) `message-list` "double-wrap" — read the file; if a redundant nested breaking wrapper exists inside the `.well` bubbles (the `whitespace-pre-wrap` div inside an already-`break-words` well is the suspect), remove the redundant layer; if rendering is single-wrapped, record RESOLVED and change nothing. (b) `SignalRow` and (c) `STATUS_META` — `git grep -n "SignalRow\|STATUS_META" apps/desktop/src` → zero hits at plan time → record RESOLVED unless the grep finds them. (d) meeting-transcript markdown — `grep -rn "react-markdown\|marked" apps/desktop/package.json` → no renderer exists in-repo; adding a markdown dependency is feature scope, not polish → record DEFERRED to v3.5 with a PR-body flag (do NOT hand-roll a renderer).
- [ ] **Step 5: Red → fix → PASS + gates.** Scoped: sweep test + `work-comms-cluster-sweep.test.ts` + `settings-cluster-sweep.test.ts` + metric-tile test. **Step 6: Commit** — `fix(sweep): Phase 8 — plural copy, scrim token, MetricTile truncate; follow-up dispositions` (+ trailer, dispositions in body).

---

### Task 9: Wave D — Build, full-app dual-shift pack, audit, /design-review

- [ ] **Step 1: Full local gate first** (`pnpm lint && pnpm lint:eslint && pnpm typecheck && pnpm test` from root) — the pack captures a green tree only.
- [ ] **Step 2: Build + pack.** `pnpm build`; `_electron` launch of the built app in test mode (5a/7a recipe; seed employees/providers/grants/boards via the direct-IPC pattern). Capture Night Ops + Day Shift for: dashboard (hero + all subviews + the NEW proactive cell, both enabled/disabled states), autonomy (shell + 10 panels), boards/tickets, chat, meetings, org chart, telemetry, audit, vault, user guide, settings (all 15 sections + 4 dialogs open). Save to `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/sweep-phase-08/`. NEVER concurrently with vitest (lesson 32).
- [ ] **Step 3: Audit the pack vs DESIGN.md both shifts** — bolt corners, well/select legibility (this retro-covers the 7b surfaces whose pack was waived), semantic-tone partitions, armed-chassis-on-opaque, dual-form (sidenav dot now NO-GO), the new `--display-fg-mute` contrast, proactive cell layout at `xl`/narrow. Fix findings as atomic commits + re-capture affected shots.
- [ ] **Step 4: `/design-review`** against DESIGN.md's anti-slop checklist → fix all findings. Delete any throwaway capture spec from `e2e/` (lesson 34).

---

### Task 10: Wave E — CHANGELOG + version bump + final gate

**Files:** `CHANGELOG.md`, `package.json` (root), `apps/desktop/package.json`.

- [ ] **Step 1: CHANGELOG.** Insert a fresh `## [Unreleased]` stub above, and rename the current `## [Unreleased]` → `## [3.4.0] - 2026-07-<merge day>`. Prepend to its content an `### Added` + `### Changed` block covering: the Command Console / Carbon Pro aesthetic sweep (Phases 1–8 one-line-each: foundation, shell, mission control, autonomy, boards, work/comms, ops, settings, purge), the ProactiveControls dashboard widget (the release's user-facing feature), the polish fixes (dual-form sidenav dot, display-fg-mute contrast, tailwind-merge fontSize registration, plural copy, scrim token, MetricTile truncate), and a `### Internal` note for the v3.3.0 local-GGUF backend groundwork (explicitly NOT user-usable — standing rule). Keep the existing docs/E2E-noise entries inside 3.4.0 (they shipped in this window).
- [ ] **Step 2: Version bump.** `"version": "3.2.1"` → `"3.4.0"` in root `package.json` AND `apps/desktop/package.json`. `grep -rn '"version": "3.2.1"' --include=package.json .` → only `packages/*` internals may remain (they version independently — leave them).
- [ ] **Step 3: Final full gate:** `pnpm lint && pnpm lint:eslint && pnpm typecheck && pnpm test && pnpm audit:claims:strict` → all green, 0 UNALLOWED.
- [ ] **Step 4: Commit** — `chore(release): v3.4.0 — CHANGELOG + version bump` (+ trailer).

---

### Task 11: PR + CR-7 wall + tag (Stage-5)

- [ ] **Step 1: Push + PR.** Body: scope table (1 mount + 2 deleted files + 2 purged recipe families + 1 renamed token + 7 polish items + release bump), purge evidence (`grep` zero-hits for the three literals), the Wave-D pack link, follow-up dispositions (RESOLVED/DEFERRED table from Task 8), CR-7 checklist.
- [ ] **Step 2: Stage-1 CI** → green on the head. **Stage-2 `/review`** inline (no subagents) → fix findings. **STOP: Stage-3 Codex is Rocky-triggered; Stage-4 is Rocky's sign-off. Never self-clear.**
- [ ] **Step 3 (post-merge, Rocky-held):** on updated `main`: `git tag v3.4.0 && git push origin v3.4.0` → `release.yml` → verify GitHub Release artifacts + electron-updater manifests + SHA256SUMS (v3.2.1 fixes cover the merge-collision + glob classes; `mac.identity: null` stays until Mac signing).

---

## Self-review (spec coverage · placeholders · type consistency)

- **Spec coverage:** Wave A (T1), Wave B (T2 files, T3 CSS + token, T4 docs), Wave C (T5 sidenav, T6 display-fg-mute, T7 twMerge, T8 small items incl. verify-drop + markdown deferral), Wave D (T9), Wave E (T10), wall + tag (T11). Every census fact from the spec maps to a task; `--mission-red` (found during planning, annotated "purged Phase 8" in source) is handled by T3's rename — a spec addendum candidate, recorded here.
- **Placeholders:** none — every pin/edit carries exact strings; the two enumeration steps (T7 Step 2 grep, T6 Step 2 census) define exact commands + decision rules, and T8's verify-drops name their grep + disposition rule. T3 Step 4's alternate-path note names the exact fallback command.
- **Type consistency:** `ProactiveControls({ companyId: string })` matches the null-guard mount; `cn()` signature unchanged; `--armed-hsl` consumers keep `hsl(var() / alpha)` channel composition (the reason it can't be the full-color `--armed`); MetricTile change stays inside its existing props.
