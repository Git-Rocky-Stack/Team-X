# v3.4.0 Aesthetic Sweep — Phase 7a (Ops Surfaces: Telemetry + Audit + Vault) Design

- **Document date:** 2026-07-05
- **Status:** Approved scope (Rocky decision 2026-07-05: Phase 7 split **7a Ops first, 7b Settings**) → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-07a-ops-surfaces` (off `main` `6a6b961`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 7 = Ops + Settings), `docs/superpowers/specs/2026-07-04-sweep-phase-05b-06-work-comms-design.md` (the recomposition playbook this phase inherits verbatim)
- **Precedent:** Phases 1–6 all merged to `main` (5b/6 = `6a6b961`). Phase 7 covers the ladder's last recompose row before the Phase 8 purge.

---

## Goal

Recompose the **Ops surfaces** — Telemetry (4 files), Audit (2 view files + the event-tone helper), and Vault (1 file) — onto the Command Console / Carbon Pro design system, and establish the **Recharts → console-token chart theme** the master spec assigns to Phase 7. **Visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved.** After this phase, **zero `mission-shell` consumers remain in the renderer** — the Phase 8 purge gate for the mission-family becomes reachable, with only Settings (`7b`) left on the recompose ladder.

## Context — the Phase 7 split (Rocky, 2026-07-05)

Full Phase 7 is ~30 source files / ~9.1k LOC — nearly double the combined 5b/6 PR. Per the 4a/4b and 5a/5b precedents Rocky approved a split:

- **7a (this spec): Ops surfaces** — Telemetry + Audit + Vault, ~10 files, ~3k LOC. Kills the last four `mission-shell` consumers, establishes the phase's one novel pattern (Recharts theming) in the smaller PR, and unblocks the Phase 8 purge path.
- **7b (next): Settings** — `settings-view` + 15 sections + 4 dialogs + `provider-card` + `proactive-controls.tsx` (~21 files, ~6.4k LOC). `proactive-controls` joins 7b because it renders inside `settings/extensions-section.tsx` (the same shared-child rule that pulled `thread-memory-card` into 5b/6). A pure vocabulary-swap grind once 7a's patterns are set; its own spec/plan follows this PR's merge.

Scope-discovery census (2026-07-05, verified at source):

1. **`mission-shell` importers repo-wide = exactly the 4 telemetry files** (`telemetry-view`, `company-telemetry`, `employee-telemetry`, `cost-breakdown`). Confirms the 5b/6 post-phase census.
2. **`brand-selected` consumers = `audit-view` + 6 settings sections.** 7a retires the audit instance; the settings six fall in 7b.
3. **`amoled-menu-surface`** (legacy globals.css recipe) has two consumers: `audit-view` (7a) and `settings-view` (7b). The recipe itself is deleted in 7b or Phase 8, whichever sweeps its last consumer first.
4. **Recharts appears ONLY in `company-telemetry` (2 AreaCharts) + `cost-breakdown` (PieChart + BarChart)** — the whole app's chart surface is inside this phase.
5. **`audit-event-chip-helpers.ts` (632 LOC)** is a logic file whose `EVENT_TYPE_COLORS` map (~60 event types) carries the repo's largest remaining raw-palette block (`bg-green-600/20 text-green-400`, zinc/sky/rose/violet/…). Unlike `memory-formatters.ts` (bridged, untouched), this map's values ARE the rendered visual — they re-tone in place (keys and all non-color logic untouched), the `levelPalette` precedent from 5b/6.
6. **No genuine `0–1` ratio exists anywhere in this cluster's current data** — every numeric is a count, cost, or latency. **Phase 7a ships ZERO VuMeters** (anti-slop: no fabricated meters; a budget-burn meter would need net-new data joins = out per the new-data-feed rule).

## Scope decisions

1. **7a = one branch, one PR, one CR-7 wall.** Waves preserve reviewability: chart theme → telemetry → audit → vault.
2. **Strictly visual-only.** The 4a/4b/5a/5b6 invariant exactly: zero behavior / IPC / data / query / store / hook change. Text content, element identity, and child ordering preserved.
3. **Recharts console theme (the phase's novel pattern).** One shared module `features/telemetry/chart-theme.ts` exports the axis/grid/tooltip/series constants all four charts consume — "themed explicitly via props reading console tokens" per the master spec. Core decisions:
   - Charts are **display surfaces** — they mount inside `RecessedWell`s and stay dark in both shifts. Axis ticks read `var(--display-fg)` (lesson 29: never `muted-foreground`/`silver` on display surfaces — they flip on Day Shift), grid strokes read `var(--display-border)`, tooltip is a machined plate (`--carbon-850` bg, `--hairline-strong` border, `--r-inset` radius, `--display-fg` text).
   - Series tones: daily **token** volume = `var(--armed)` (usage burn — the money-burning signal, matching the budget VU precedent); daily **cost** = `var(--led-go)` (replaces raw `#22c55e`).
   - The categorical provider palette (pie/bar) maps the 8 known providers onto the **non-armed LED + metal family** (`--led-go`, `--led-hold`, `--led-scope`, `--led-warn`, `--phosphor`, `--platinum`, `--chrome`, `--graphite`) with a graphite fallback ramp — armed red stays reserved for LIVE. Categorical assignment confirmed at `/design-review`.
   - SVG accepts `var()` in presentation attributes (modern Chromium); verified during execution on the real renderer before the pack.
4. **Audit event tones collapse to the LED family.** `EVENT_TYPE_COLORS` values re-map ~60 event types onto a small semantic tone set (created/completed/verified → go; review/pending/stale → hold; failed/violation/conflict → nogo; informational/lifecycle → scope; neutral/unknown → graphite). Keys, labels, aria-labels, `buildRowSummary`, and every exported symbol keep their exact contracts; `audit-event-chip.test.tsx`'s color-value assertions update red→green in the same commit.
5. **Existing pinned tests update red→green, selectors never.** `telemetry-view.test.tsx`'s "mission-language carry-forward" block pins the Mission composition itself (`<MissionPageShell`, `<MissionHero`, `<MissionSectionCard`, `<MissionControlRow`) — those pins rewrite to the console composition in the same TDD commit as each recompose. Every `data-telemetry-*` selector, behavior pin, and `telemetry-subviews.test.tsx` (hook wiring only) stays verbatim-green.
6. **Selection idioms:** vault file rows and audit event-type chips are chooser/selection sites → armed selection on **chassis rows** (`border-[var(--armed-edge)] bg-[var(--armed-soft)]`, the meetings-row/thread-list idiom; lesson 33: never tint a `.well`). `brand-selected` exits audit-view.
7. **Zero VuMeters** (see census #6). Counts → `MetricTile`; statuses → `LampTile`; categories → `Tag`.

## Scope

### In — Wave A: Chart theme (1 new file)

| File | LOC | Work |
|---|---|---|
| `features/telemetry/chart-theme.ts` (NEW) | ~60 | Console-token chart constants: grid stroke, tick style, tooltip `contentStyle`, series tokens, categorical provider palette fn. Unit-tested (node env, pure constants/fn). |

### In — Wave B: Telemetry (4 files, ~1,202 LOC — the mission-shell endgame)

| File | LOC | Recompose weight |
|---|---|---|
| `features/telemetry/telemetry-view.tsx` | 332 | 8 `Mission*` primitives → console (`MissionPageShell`/`Hero` → root + `Faceplate`/`StripeHeader`; `MissionMetricTile`×7 → `MetricTile`; `MissionPill`×3 → `Tag`×2 + status `LampTile`; `MissionSegmentedButton` subtabs + kind chips → `.nav-tile` with `aria-pressed`/`data-telemetry-*` preserved; `MissionStateBlock` → `SubviewState`; `MissionControlRow` → flex divs). Legacy `border-white/10 bg-black/20` Badge + governance button → console recipes. |
| `features/telemetry/company-telemetry.tsx` | 272 | `MissionMetricTile`×5 → `MetricTile`; states → `SubviewState`; 2 AreaCharts → `RecessedWell` + chart-theme (kills `#c53439`/`#22c55e` hardcodes). |
| `features/telemetry/employee-telemetry.tsx` | 264 | `MissionInsetSurface` table → `RecessedWell` display table (`--display-fg` cells, `--display-border` row hairlines, Departure-Mono/`tabular-nums` figures preserved); sort-header buttons keep wiring; states → `SubviewState`. |
| `features/telemetry/cost-breakdown.tsx` | 334 | Range `MissionSegmentedButton`s → `.nav-tile`; PieChart/BarChart → wells + chart-theme categorical palette (kills the raw-hex `PROVIDER_COLORS`); provider-summary table = employee-table idiom; states → `SubviewState`. |

### In — Wave C: Audit (3 files, ~1,178 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/audit/audit-event-chip-helpers.ts` | 632 | `EVENT_TYPE_COLORS` + `DEFAULT_COLOR` **values** re-toned to LED-family chip classes; every key, label, and helper contract untouched. |
| `features/audit/audit-event-chip.tsx` | 87 | Chip shell keeps `Badge` + `aria-label` + `data-event-type`; `text-xs` → type-scale token. |
| `features/audit/audit-view.tsx` | 459 | Full zinc-palette + `amoled-menu-surface`/`bg-black` shell → console: `Faceplate` header, summary `Card`s → `MetricTile`, event-type chips `brand-selected`/`rounded-full` → chassis-chip armed selection, Input zinc overrides stripped (Phase-1 restyled shadcn + `.well-input` for the date fields), event list → `RecessedWell` display list, payload `<pre>` → stream recipe (`--void` + `text-code-sm` + `--display-fg`), spinner/empty → `SubviewState`, pagination buttons → `.cap` (sized). |

### In — Wave D: Vault (1 file, 349 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/vault/vault-view.tsx` | 349 | Header → `Faceplate`; file rows `bg-brand/5 border-brand` selection → armed chassis-row selection; tag `Badge`s → `Tag`; detail panel → labeled rows + SHA256 in a display well; verify result raw green/red → `LampTile` (`go`/`nogo`) + text; `Loader2`/empty states → `SubviewState`. |

Plus one new cross-file source-pin test: `features/ops-cluster-sweep.test.ts`, and red→green updates to the two existing pinned suites (`telemetry-view.test.tsx` composition block, `audit-event-chip.test.tsx` color values).

### Out

- **`mission-shell.tsx` + `mission-shell.test.tsx` deletion** — after 7a they have zero consumers, but the file purge (with the rest of the legacy classes/fonts) is **Phase 8's zero-usage grep gate**, not this PR.
- **Settings (all of it), `proactive-controls.tsx`, `amoled-menu-surface` recipe deletion** — Phase 7b.
- **No behavior / IPC / data change.** Hooks, mutations, query wiring, store usage, sort logic, filter logic, export logic untouched.
- **No structural file-split**; no VuMeters; no new console primitives (7a composes from the existing library only).
- **`vault-view`'s `console.log` download handler + `electronAPI` upload fallback** — pre-existing behavior, untouched (logged follow-up, not visual).

## Approach — recompose onto existing console primitives

1:1 mapping inherited from 4a/4b/5a/5b6 (primitives verified against `components/console/` source 2026-07-05 — `LampTone = 'off' | 'go' | 'hold' | 'warn' | 'nogo' | 'exec' | 'armed'`; `SubviewState` takes `lampLabel`/`lampTone`/`title`/`description`/`action`/`testId`/`className`; `MetricTile` takes `label`/`value`/`hint`/`icon`/`tone`/`onClick` and spreads `data-*`):

| Current (legacy / shadcn) | → Console replacement |
|---|---|
| `MissionPageShell` + `MissionHero` | root `<div>` + `Faceplate` (kicker/serial) + `StripeHeader` — the tickets-view/meetings-view idiom |
| `MissionSectionCard` | `Faceplate` with `StripeHeader` kicker |
| `MissionMetricTile` | `MetricTile` |
| `MissionStateBlock` / ad-hoc spinner/empty | `SubviewState` (data-state attr preserved via `testId`/wrapper) |
| `MissionSegmentedButton` (subtabs, kind chips, ranges) | `.nav-tile px-3 py-1.5 text-button-sm` + `.nav-tile-active` (aria-pressed + `data-*` preserved — the copilot-sidebar idiom) |
| `MissionPill` — status (Live analytics / Summary unavailable) | `LampTile small` word-lamp (stencil 2–6 chars) |
| `MissionPill` — category/kind labels | `Tag` (`mono` for ids/counts) |
| `MissionInsetSurface` / `MissionControlRow` | `RecessedWell` / plain flex `<div>` |
| Tables (employee, provider-summary, audit event list) | `RecessedWell` display surface — `--display-fg` text, `--display-border` hairlines, `tabular-nums` figures |
| Charts | `RecessedWell` + `chart-theme.ts` tokens |
| Chip selection (`brand-selected`, `bg-brand/5 border-brand`) | armed chassis selection: `border-[var(--armed-edge)] bg-[var(--armed-soft)]` |
| Payload `<pre>` / SHA256 block | stream recipe: `--void` bg + `text-code-sm` + `--display-fg` |
| Raw palette (zinc/green/red/sky/… + chart hexes) | `--led-go / --led-hold / --led-warn / --led-nogo / --led-scope / --armed / --graphite` + metals |
| `amoled-menu-surface bg-black` shell | plain console layout (`bg-background` root, faceplates carry depth) |

## Contract preservation + test mechanism

- **E2E selector contract (verified in `apps/desktop/e2e/`):** `telemetry-kind-filter.spec.ts` clicks `[data-telemetry-kind-filter="work"|"copilot"]` and reads `[data-telemetry-stat="total-runs"]`; `vault-backup.spec.ts` asserts `File Vault` heading + `N file(s)` count text + row filename text; audit chips expose `data-event-type`. All preserved verbatim, plus every `data-telemetry-*-state` and `data-telemetry-*` selector in the existing suites.
- **Existing pinned suites:** `telemetry-subviews.test.tsx` (hook wiring — untouched, stays green), `telemetry-view.test.tsx` (composition block updates red→green per recompose task), `audit-event-chip.test.tsx` (color values update red→green with the re-tone; all label/aria/summary assertions untouched).
- **Displays-stay-dark** both shifts; wells/tables/charts/payloads read `--display-fg`, never `text-foreground`/`silver` (lesson 29).
- **No-mix:** post-sweep all 8 swept files use console composition exclusively; `mission-shell` importer count hits **0**.
- **Tests = source-string-pin** (`ops-cluster-sweep.test.ts`, the 5a/5b6 harness shape): per-file console-present + legacy-absent + selectors-preserved blocks added in each task, cross-file legacy-absence guard in the final task (lesson 5: global pin lands last). Forbidden set extends 5b/6's with `mission-shell`, `amoled-menu-surface`, `MissionSegmentedButton`, chart hexes (`#c53439`, `#22c55e`, `#d97706`-family), and the zinc palette.

## Delivery

Spec → plan (`writing-plans`) → execution (per-task TDD red→green with Biome / typecheck / ESLint 0-0 / vitest gates; mechanical recomposes delegatable to `elite-executor` subagents — edit-only-this-file, no git/tooling, never read/traverse `~/.claude`, any `.claude/`, or any `agents/` directory — with the test contract authored centrally and every diff reviewed/gated/committed centrally). Then `/design-review` audit → dual-shift screenshot pack (telemetry needs seeded run history and vault needs seeded files — seed via the E2E test-mode direct-IPC recipe; capture NEVER concurrent with the vitest suite, lesson 32) → PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered · Stage 4 Rocky sign-off → squash-merge). No version bump (v3.4.0 tags at Phase 8).

## Per-phase definition of done (inherited)

1. **CI Stage 1 green** — typecheck, Biome, ESLint, tests ×3 OS, Electron E2E smoke, claim-evidence audit. E2E passes **unchanged**.
2. **`/design-review` skill audit** against DESIGN.md's anti-slop checklist → all findings fixed.
3. **Screenshot pack** — every swept surface × Night Ops + Day Shift → Rocky's eyeball sign-off.
4. **CR-7 wall** — `/review` (Stage 2) → Codex (Stage 3, Rocky-triggered; any HIGH/[P1] blocks) → Rocky sign-off (Stage 4) → squash-merge.

## Risks / open items

- **Recharts `var()` support** — SVG presentation attributes accept CSS variables in modern Chromium, but this is the first token-driven chart in the repo; verified on the real renderer during execution BEFORE the screenshot pack. Fallback if a Recharts internal rejects `var()`: read the resolved values once via `getComputedStyle` in the theme module (still token-sourced, no hardcodes).
- **Categorical provider palette semantics** — color carries identity, not status, in the pie/bar; the assignment (and whether `--led-warn` may appear in a categorical ramp) is confirmed at `/design-review`.
- **Chart legibility on Day Shift** — charts sit on display wells (dark in both shifts) so ticks/labels must be `--display-fg`; this is exactly the 5a Day-Shift defect class, checked explicitly in the pack.
- **`audit-event-chip.test.tsx` scale** — 510 lines with exact color-string assertions; the re-tone task updates values mechanically (find/replace per tone group) and MUST NOT touch label/aria/summary assertions. Red→green in one commit.
- **Telemetry seeding for the pack** — charts are empty without completed runs; the capture script seeds runs via the E2E direct-IPC recipe (the vault-backup.spec pattern), and the empty states get their own shots.
- **60 fps** — depth recipes on containers only; the audit event list rows and vault file rows stay flat interactive rows inside one well (no per-row gradient stacks).
