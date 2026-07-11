# v3.4.0 Aesthetic Sweep — Phase 8 (Purge + Polish + Release) Design Spec

**Date:** 2026-07-10 · **Status:** Rocky-approved design (brainstorming Q&A, this session) · **Author:** brainstorming session with Rocky

## Goal

Close out the v3.4.0 Aesthetic Sweep: wire the one remaining orphaned console surface into the app, delete every dead legacy composition artifact the sweep left behind, pay down the logged design-debt follow-ups, audit the whole app in both shifts, and ship the v3.4.0 release. After this phase the renderer carries exactly one composition family (Command Console / Carbon Pro), zero dead recipes, and the repo is tagged.

## Rocky's scope decisions (recorded verbatim from the brainstorming Q&A)

1. **Scope = Full polish + purge + release** (not purge-only): mechanical purge + release PLUS logged follow-up debt PLUS a dedicated full-app Day-Shift audit pass.
2. **`proactive-controls.tsx` = WIRE, not delete:** mount it in Mission Control.
3. **Placement = beside the Copilot widget** (the dashboard secondary rail), compact-widget idiom.
4. **Structure = single PR, 5 waves** on one branch; tag `v3.4.0` on `main` after merge (CR-7 Stage-5 is release-only — this phase IS the release).

## Source-verified census (2026-07-10, main @ `e43aeb2`)

- **`features/mission/mission-shell.tsx` + `mission-shell.test.tsx`:** ZERO importers repo-wide. The string `mission-shell` survives only in negative test pins across the cluster-sweep suites + one prose comment in `workspace-switcher.tsx`. The only `.mission-*` **class** consumer is `mission-shell.tsx` itself.
- **`.mission-*` recipe block** (`styles/globals.css` ≈ lines 585–670): 16 recipes (`mission-app-shell`, `mission-shell`, `mission-grid`, `mission-hero`, `mission-panel`, `mission-chrome-panel`, `mission-control-row`, `mission-metric-tile`, `mission-pill`, `mission-segmented-button`, `mission-icon-button`, `mission-inset-surface`, `mission-sheet-header`, `mission-state-block`, `mission-workspace-trigger`, `mission-select` + its hover/focus). Dead once mission-shell.tsx is deleted.
- **`.brand-selected` family** (globals.css ≈ lines 412–465): base + `:hover` + `:focus-visible` + `-green`/`-blue`/`-amber` variants. ZERO consumers after Phase 7b. **`.brand-range` (≈ 320–385) is LIVE and stays** (rag threshold, enhanced-ai temperature + tracing sliders).
- **`proactive-controls.tsx`** (`features/proactive/`): fully dead module — no file imports it or its hooks. Takes `companyId: string` prop; queries are live IPC (`ipc.settings.getProactive()`, `ipc.proactive.getState({companyId})` with 5 s `refetchInterval`); already recomposed onto console primitives in 7b (Faceplate/MetricTile/SubviewState/Tag/Switch).
- **Dashboard mount target:** `mission-control-dashboard.tsx` ≈ line 1492 — a 3-column secondary-rail grid (`grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)_minmax(320px,0.9fr)]`) of Faceplate panels; `<CopilotDashboardWidget />` sits in the first cell inside a `RecessedWell` with `data-dashboard-secondary-panel="copilot"`.
- **Sidenav dual-form violation:** `app/sidenav.tsx:20` `statusColor` maps `error → bg-[var(--led-warn)]` — steady warn-red violates the dual-form rule (blinking `--led-warn` = unacked alerts ONLY; steady fault = `--led-nogo`). `thinking → --armed-lit` (LIVE, correct), `blocked → --led-hold` (correct).
- **Plural bug:** `chat-view.tsx:154` `{threads.length} visible threads` renders "1 visible threads".
- **Scrim:** exactly one raw scrim remains — `add-provider-dialog.tsx` `bg-black/50` (accepted in 7b Task 19 as interim).
- **Stale follow-up names:** `SignalRow` and `STATUS_META` have ZERO source matches — the 5b/6 follow-up log predates renames or the items were already absorbed. Plan-time census must re-verify each logged follow-up and DROP resolved ones (no invented work).
- **Release state:** both `package.json` (root + `apps/desktop`) at `3.2.1`; `CHANGELOG.md` (Keep a Changelog) carries an `[Unreleased]` section (docs pass + E2E-noise fixes). Release flow: `git tag v3.4.0` → `release.yml` → GitHub Releases (electron-updater manifests). `mac.identity: null` stays (Mac signing external — v3.2.1 follow-ups memory).

## Design — five waves, one branch

**Branch:** `feat/v3.4.0-sweep-phase-08-purge-release` off `main` `e43aeb2`. Test contract: new `purge-release-sweep.test.ts` grows per-wave (the 7a/7b harness pattern); global/destructive pins land in the wave that makes them true. TDD red→green per task; gates per task = Biome · ESLint · typecheck · scoped vitest; full gate + `audit:claims:strict` at the end.

### Wave A — Wire ProactiveControls (the one behavior change)

Mount `<ProactiveControls companyId={companyId} />` as a sibling Faceplate panel in the dashboard secondary-rail grid beside COPILOT INSIGHTS. The component already renders its own `Faceplate` — it slots in as a grid cell like its neighbors. Layout: the grid gains one cell; at `xl` the 3-column template either widens to 4 or the new panel wraps to a second row — decided at plan time by reading the full grid region and testing both shifts (no hardcoded pixel budget in this spec). Add `data-dashboard-secondary-panel="proactive"` on its well/wrapper (mirror of the copilot cell's selector). Zero backend change; the IPC families already exist and are exercised by extensions-section.
**Pins:** dashboard imports + renders `ProactiveControls`; selector present; the component's existing 7b sweep block stays green. The Phase-8 dead-code flag on this file retires.
**A11y:** the component ships `aria-label="Toggle proactive mode"` + loading/error/disabled states from 7b — preserved as-is.

### Wave B — The purge

1. Delete `features/mission/mission-shell.tsx` + `features/mission/mission-shell.test.tsx` (git history preserves them).
2. Delete the `.mission-*` recipe block and the `.brand-selected` family from `globals.css`. `.brand-range` untouched.
3. New purge-guard pins: `features/mission/` contains no files (or the specific files are absent); `globals.css` contains neither `.mission-` nor `.brand-selected`; repo-wide grep-pin that no source file references `mission-shell.js`.
4. Retire stale references: the `workspace-switcher.tsx` prose comment; the `preload/index.ts` comment naming `proactive-controls` as orphaned (it's mounted now).
5. Doc alignment: Team-X `CLAUDE.md` — the "Design system reminders (LEGACY)" section and `.brand-selected` primitive documentation come out (superseded by DESIGN.md across every screen); the transition-state amendment in the Design System section is replaced by a "sweep complete" note. DESIGN.md gets the matching closure note. (Lesson 35 applies: never name a forbidden literal with its prefix inside guard-pinned files — doc edits must respect the cross-file guards' file lists.)

### Wave C — Polish debt (logged follow-ups, each verified at source)

1. **Sidenav dual-form fix:** `statusColor` `error` → `bg-[var(--led-nogo)]`. One-line + pin.
2. **`--display-fg-mute` token:** add to globals.css (both shifts; Night ≈ current silver-mute value, Day-calibrated to ≥ 4.5:1 on well/void backgrounds); apply where `text-silver-mute` renders INSIDE wells/displays (census at plan time; the 5a finding was AA-marginal ≈ 3.1:1 in Day). Display surfaces stay dark in both shifts, so the token's job is contrast against `--void`/well gradients, not shift-flipping.
3. **Systemic `extendTailwindMerge`:** replace bare `twMerge(clsx())` in `lib/utils.ts` `cn()` with `extendTailwindMerge` configured with the custom fontSize class-group keys (`text-h1…`, `text-body…`, `text-caption`, `text-code…`, `text-label`, `text-button…`, `text-eyebrow…`, `text-numeric`, etc. — enumerated from the Tailwind config at plan time). Kills the recurring "custom text-size silently collapsed by a color utility" bug class (Phase 4b lesson 27, 7a Stage-2 finding). Regression test: `cn('text-caption','text-led-go')` keeps both; `cn('text-h2','text-body')` keeps only the latter.
4. **Small items (each re-verified, dropped if stale):** "1 visible threads" plural (`chat-view.tsx:154`); scrim token (`--scrim` in globals.css; `add-provider-dialog.tsx` uses it); message-list double-wrap; meeting-transcript markdown rendering; MetricTile truncate decision (shared primitive — decide: truncate + title tooltip vs wrap); `SignalRow` + `STATUS_META` (no current source match — verify, drop if resolved).

### Wave D — Full-app dual-shift audit (the proof gate, restored)

Build → `_electron` test-mode boot → seed via the established direct-IPC pattern → screenshot pack covering **every** top-level surface + the Settings sections and dialogs (retroactively covering the 7b pack that was waived on 2026-07-10) × Night Ops + Day Shift. Audit vs DESIGN.md (bolt corners, well/select legibility, semantic-tone partitions, armed-chassis-on-opaque, dual-form rule). Findings fixed as atomic commits + re-captured. Lessons 32 (never concurrent with vitest) and 34 (delete throwaway capture specs pre-PR) apply. `/design-review` runs against the pack + source.

### Wave E — Release

1. CHANGELOG: roll `[Unreleased]` into `[3.4.0] - <merge date>`; author the release entry — the Aesthetic Sweep (Command Console / Carbon Pro, per-phase summary, `brand-selected`/`amoled`/`mission-*` retirement), the ProactiveControls dashboard widget (the release's one feature), polish-debt fixes, and the v3.3.0 local-GGUF groundwork documented as **backend-only internal groundwork** (never user-usable — standing rule).
2. Version bump: both `package.json` files `3.2.1 → 3.4.0` (skipping 3.3.0 as a published version — its content ships inside 3.4.0; the CHANGELOG says so explicitly).
3. README/docs version refs re-verified.
4. **Post-merge, on `main`:** `git tag v3.4.0` + push → `release.yml` → GitHub Releases; verify electron-updater manifests + SHA256SUMS artifacts (v3.2.1 follow-ups: merge-collision + greedy-glob fixes already shipped; `mac.identity: null` remains until Mac signing).

## Testing strategy

- Per-wave TDD source pins in `purge-release-sweep.test.ts` (console-present / legacy-absent / selector-preserved / file-absent).
- Wave A additionally extends `mission-control-dashboard.test.tsx` (import + render + selector pins beside the existing `CopilotDashboardWidget` pin).
- Wave C item 3 gets behavioral unit tests (twMerge probes), not just source pins.
- Full gate at close: Biome · ESLint 0/0 · typecheck ×7 · full vitest · E2E 26-spec suite · `audit:claims:strict`.
- CR-7 wall applies IN FULL: Stage-1 CI → Stage-2 `/review` (inline, no subagents) → Stage-3 Codex (Rocky-triggered) → Stage-4 sign-off → merge → **Stage-5 `/ship`-equivalent: tag + release verification (release-only stage — applies to this phase).**

## Error handling / risks

- **Purge safety:** every cluster-sweep negative pin asserts absence in *other* files, so the deletions cannot redden them; `css-color-token-invariant.test.ts` re-parses globals.css post-deletion (deletions are safe input). The Tailwind build is re-verified (`out/renderer/assets/*.css`) to confirm no live recipe vanished (lesson 28 class of failure, inverted).
- **Wave A layout risk:** a 4th secondary-rail cell may crowd `xl`; the plan evaluates 4-col vs wrap empirically in both shifts before pinning.
- **`extendTailwindMerge` blast radius:** changing `cn()` affects every component — mitigations: exact class-group enumeration from the Tailwind config, the behavioral probe tests, and the full vitest + E2E + dual-shift pack in the same PR.
- **Release tag is outward-facing and irreversible-ish:** tag fires `release.yml` publishing artifacts — the tag step happens only after Rocky's Stage-4 sign-off on the merged main, as an explicit final step he can hold.

## Out of scope

- Any new console primitive, VU meter, or behavior change beyond the ProactiveControls mount.
- Mac signing / `mac.identity` removal (external dependency, v3.4.x+).
- Local-GGUF renderer UI (future phase; stays backend-only in docs).
- The `docs/superpowers/` history and `.jez/reviews/` archives (untouched).

## Spec self-review (coverage · placeholders · consistency)

- **Coverage:** all four Rocky decisions encoded; every census item maps to a wave; release mechanics + Stage-5 explicit; 7b's waived proof gate is explicitly repaid in Wave D.
- **Placeholders:** none invented — items without a current source match (`SignalRow`, `STATUS_META`) are explicitly marked verify-then-drop; plan-time enumerations (grid layout, fontSize class-groups, display-fg-mute call sites) are named as plan tasks, not left vague.
- **Consistency:** `.brand-range` kept (live) vs `.brand-selected` deleted (dead) stated in both census and Wave B; dual-form fix direction (steady fault = NO-GO) matches DESIGN.md canon; version-skip of 3.3.0 is stated with its CHANGELOG treatment.
