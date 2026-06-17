# Design Review — Team-X v3.4.0 Aesthetic Sweep · Phase 3 (Mission Control)

- **Document date:** 2026-06-17
- **Review conducted:** 2026-06-16 (fixes + screenshots), reconciliation closed 2026-06-16, consolidated here 2026-06-17
- **Branch:** `feat/v3.4.0-sweep-phase-03-mission-control` (diff vs `main`)
- **Canonical reference:** `DESIGN.md` (Command Console / Carbon Pro, Rocky-approved 2026-06-10)
- **Skill:** gstack `/design-review` — Hybrid mode (source-grounded audit + real-renderer screenshots)
- **Surfaces reviewed:** Mission Control dashboard shell + sub-tabs (cards, timeline, stream, floor, commands) + employee-card
- **Method:** triangulated — primary (Claude Code) + design subagent (elite-ui-architect, source consistency) + Codex (`model_reasoning_effort=high`, read-only). All three converged on the same findings.
- **Renderer note:** the Mission Control renderer is an IPC-coupled Electron surface; the headless `browse` binary can't render it. Phase B screenshots use the Playwright `_electron.launch()` harness booted in `NODE_ENV=test` (canned provider, 2 auto-seeded employees, dashboard is the default view).

---

## 1. Headline

The Phase 3 console **primitives + token layer are excellent and faithful** to DESIGN.md — four-layer raised-hardware depth, displays-stay-dark, Departure-Mono telemetry, machined radii, dual-form blink envelope, and reduced-motion handling are all correct. The **dashboard shell** (`mission-control-dashboard.tsx`) is a strong, near-canonical application of the system: faceplates, `RecessedWell`s, `LcdWell` + `font-data`/`text-numeric`, a functional VU meter, and full loading/empty/error/disabled coverage.

The gap, at review time, was concentrated in two places:

1. **One systemic color-semantics defect** — steady `--led-warn` red used for faults app-wide, violating the dual-form red rule (`--led-warn` is blink-only / never-steady).
2. **The secondary sub-views** (`timeline`, `stream`, `floor`, partly `commands`) — only partially swept: status rendered as icons/dots rather than stencil word-lamps, off-system empty/error/loading surfaces, and an off-canon lamp vocabulary that drifted across views.

Both classes are now resolved. The branch moved from a **B− / B** baseline to **A− / A** final.

| Metric | Baseline | Final |
|---|---|---|
| **Design Score** | B− | **A−** |
| **AI-Slop Score** | B | **A** |

---

## 2. Positive confirmations (no action needed)

These were verified clean and are called out so future phases don't "fix" what isn't broken:

- **No composition-family mixing.** Zero `.mission-*`, `.brand-selected`, or legacy status-badge usage in any of the 8 swept files. Selection uses the sanctioned `cap cap-select`; navigation uses `.nav-tile`/`.nav-tile-active`. (Confirmed by all three reviewers + grep.)
- **Displays-stay-dark, clean.** Streams render on `bg-[hsl(var(--void))]`; `LcdWell` / `VuMeter` / `LampTile` carry literal dark values in **both** shifts.
- **Tokens clean.** No raw hex; colors flow through `--armed` / `--led-*` / carbon tokens; spacing via `--sp-*`; radii via the `borderRadius` remap (`md`→`--r-control`, `sm`→`--r-card`) — so `rounded-md` / `rounded-full` are **not** off-scale (a false positive that was verified and dropped).
- **AnnunciatorRail** correctly implements the dual-form rule end-to-end (alert → blink → acknowledge → teleport to steady).

---

## 3. Baseline category grades (source audit)

| Category | Baseline | Driver |
|---|---|---|
| Visual Hierarchy | B | Sub-views lacked faceplate depth |
| Typography | B | Hero display H1 fell back to Public Sans (not Archivo) |
| Color & Contrast | C | Steady-warn faults; armed-red as seniority / chart-fill |
| Spacing & Layout | A− | Token scale clean, no arbitrary spacing, radii remap correctly |
| Interaction States | B− | cards-view missing empty state; sub-view states off-system |
| Responsive | A− | Breakpoints present (source); confirmed in Phase B |
| Content / Microcopy | B | Off-canon + inconsistent lamp words; "Mission Control" label collision |
| AI Slop | B | Status-as-icons (timeline/floor) |
| Motion | B | Generic spinners on sub-views; envelopes otherwise correct |
| Performance Feel | n/a | — |

---

## 4. Findings (triaged)

### HIGH

**H1 — Steady `--led-warn` red used for faults/errors, app-wide (dual-form red rule).**
`DESIGN.md` defines `--led-warn` (#FF4438) as "Blinking 1Hz only — never steady" and explicitly: "never use steady `--led-warn` for errors." Every fault/error lamp passed `tone="warn"` **without** `alert`, so it rendered steady (`lamp-tile.tsx:49,60-61`). Sites: `mission-control-dashboard.tsx` PanelMessageState FAULT (257, 261), layout-error text (870), failure-reason text (1235), agent-run `failed`→warn (~1206), queue `error`→warn (100-130), blocked-work LCD `tone="red"` (~1018); `commands-view.tsx` FAULT (92) + `ERR` outcome (143); `cards-view.tsx` FAULT (49); `employee-card.tsx` `ERR`→warn (103); `floor-view.tsx` error dot `bg-led-warn` (52,85); `timeline-view.tsx` `work.failed`→`XCircle text-led-warn` (40) + error `AlertCircle` (146).
**Architectural root cause:** the system had no steady "fault / NO-GO" tone, and these aren't acknowledge-able live alerts — so blinking them all would have been wrong too. Required a design ruling (see §6).

**H2 — Status rendered as icons/dots, not stencil word-lamps.**
`DESIGN.md` Departure #2 + Anti-Slop: status is a stencil word in a lamp tile; icons are nav-only. `timeline-view.tsx:33-54` mapped every event status to a colored Lucide glyph; `floor-view.tsx:82-88` showed status as a bare colored dot with the word hidden in `title=`.

**H3 — Off-canon / inconsistent lamp vocabulary.**
Canon is `GO / HOLD / NO-GO / STBY / EXEC / ON AIR`. Actual was a drift: `LIVE`/`IDLE` (`stream-view.tsx:36`), `LIVE`/`ERR`/`IDLE` (`employee-card.tsx:22-33`), `OK`/`ERR` (`commands-view.tsx:143`), `Live`/`Blocked`/`Error`/`Idle` (`mission-control-dashboard.tsx:100`). Same concept → different words across views. Test-safe (no test asserted on these strings).

**H4 — `cards-view` has no empty state.**
Loading + error were handled; an empty `employees` array returned a bare empty grid (`cards-view.tsx:62`). Needed a `STBY` lamp + RecessedWell empty state.

### MEDIUM

**M1 — Sub-views lacked faceplate/well/control chassis (depth discipline).**
`timeline-view.tsx:164` was a flat `div` (rows `rounded-control px-3 py-2 hover:bg-carbon-900`, no `.cap`/`.well`); `stream-view.tsx:88` container was flat hairline-bordered; `commands-view` rows were flat border rows (128). (Stream panes + floor already used Faceplate/`.cap` correctly.) — *Partially addressed; timeline stripe-band + stream panes are intentional compositions, the state surfaces were reworked.*

**M2 — Sub-view empty/error/loading states were off-system.**
Raw `Loader2` spinners (`timeline-view.tsx:138,193`), icon-led empty states (`commands-view.tsx:73` Terminal, `floor-view.tsx:113` plain text, `stream-view.tsx:78` plain text), error blocks without lamp/well. The dashboard's `PanelMessageState` (250-268) was the correct pattern to generalize.

**M3 — Hero display H1 was not Archivo.**
`mission-control-dashboard.tsx:744` used `<h1 className="text-display text-foreground">`. The `text-display` fontSize token carries size/weight but **no** font-family, so the largest type on the flagship surface inherited Public Sans, not Archivo. `DESIGN.md`: "Display sizes are always Archivo caps."

**M4 — Armed-red used as an org-seniority category.**
`floor-view.tsx:7-22` `levelColor()` painted the `.cap` border armed-red for `officer` to encode seniority. An idle C-Suite cell glowed armed-red while doing nothing — diluting "red = LIVE." Seniority must use the silver/graphite ramp instead.

**M5 — Redundant steady-warn icon beside FAULT lamp.**
`cards-view.tsx:50` and `PanelMessageState` (261) rendered an `AlertCircle`/Icon in steady `text-led-warn` next to a FAULT lamp — duplicative (the lamp already carries status) and a second steady-red path.

**M6 — `ring-brand` focus instead of the chrome `--ring` outline doctrine.**
`commands-view.tsx:128` used `focus-visible:ring-brand/60`. The `.cap`/`.nav-tile` console doctrine uses an `outline` of `--ring` (chrome), which survives the recipe box-shadow stacks. This was a **DESIGN.md-vs-implementation discrepancy**, not a clear defect — see §6 for the ruling.

### POLISH

- **P1 — Queue distribution bar** (`mission-control-dashboard.tsx:1390-1427`) was a bespoke stacked bar mixing armed-red ("in progress") with LED colors — off the VU/segment vocabulary, and re-spent armed-red as a chart fill.
- **P2 — Escape-hatch type utilities** (`text-xs font-bold`, `text-sm font-semibold`) on avatar initials (`floor-view:75`, `stream-view:24`, `employee-card:96`) bypassed the semantic scale (correct family, wrong token).
- **P3 — "Mission Control" label collision** — the **cards** sub-tab was labeled "Mission Control" (`dashboard-subtabs.tsx:14`) while the parent faceplate kicker is "MISSION CONTROL" and the hero repeats an inline "Mission Control" eyebrow.
- **P4 — Stream "Thinking…" pulsing Radio icon** (`stream-view.tsx:49`) as a live indicator — a steady EXEC/ON AIR lamp + data-bound signal is more on-system.

---

## 5. Decisions taken (Rocky)

1. **Review method:** Hybrid — source-grounded DESIGN.md audit + Codex/subagent outside voices + fix loop, then Playwright real-renderer screenshots.
2. **Fix scope:** **Full sweep this pass** — including structural rewrites, explicitly authorizing crossing the design-fix risk gate.
3. **Dual-form red ruling (H1):** **Add a steady NO-GO tone.** Extend `LampTile` + `globals.css` with a dedicated steady NO-GO red (`--led-nogo`), distinct from blinking `--led-warn`. Reserve blinking `--led-warn` for the AnnunciatorRail's *unacknowledged* alerts. Amend DESIGN.md.
4. **Focus-ring reconciliation (M6):** **Reconcile DESIGN.md to brand-red** (doc edit, not code). Armed-red is the documented default focus voice; machined caps keep a neutral `--ring` outline (Night chrome / Day graphite) for box-shadow-stack survival + contrast against red/warn cap fills. Changing the code would have hurt a11y (a red ring vanishes into red/warn cap fills).

---

## 6. Fix log — 8 commits

| # | Commit | Findings | Status |
|---|---|---|---|
| 1 | `7530ae9` feat — add steady NO-GO lamp tone (dual-form red fix) | H1 (foundation) | verified (typecheck) |
| 2 | `5e432e1` fix — canonical lamp vocabulary + NO-GO for faults | H1, H3, blocked-LCD red→amber | verified (typecheck + 27 dashboard tests) |
| 3 | `40af5e5` fix — status as stencil word-lamps (floor + timeline) | H2, P2 (avatars) | verified (27 tests + screenshots) |
| 4 | `af24130` fix — console state surfaces across the sub-views | M2, H4, M5 | verified (103 tests + screenshots) |
| 5 | `9f8d492` fix — hero Archivo, floor level bezels, queue VU color, polish | M3, M4, M5, P1, P2 | verified (103 tests + screenshots) |
| 6 | `df666ec` style — Biome/ESLint import ordering for sweep edits | (lint) | verified (both linters clean) |
| 7 | `3155147` docs — CHANGELOG: design-review refinements + NO-GO tone | (docs) | n/a |
| 8 | `f074902` docs(design) — reconcile DESIGN.md focus rings to armed-red | M6 (resolution) | doc-only; resolves M6 |

**Bonus bug caught + fixed (not introduced by the sweep):** the floor "level-edge bezels" (a Phase-3 feature from `e3aa2f2`) used `border-[hsl(var(--*-edge))]` wrapping `rgba()` tokens. `hsl(rgba())` is invalid CSS, so the bezels rendered nothing. Fixed to valid `var(--*-edge)` in commit `9f8d492` — the level-edge bezels now actually render.

### What landed where (foundation vs composition)

- **`globals.css`** — added `--led-nogo: #c8453e;` + `--led-nogo-edge` and a `.lamp-nogo` recipe (steady terminal-fault red, distinct phosphor/edge from `--led-warn`).
- **`tailwind.config.ts`** — added `nogo: 'var(--led-nogo)'` under `led:` colors.
- **`lamp-tile.tsx`** — `LampTone` union gained `'nogo'`; `toneClass` gained `nogo: 'lamp-nogo'`; JSDoc updated (warn = blink-until-ack, nogo = steady terminal fault).
- **`dashboard-subview-state.tsx`** (NEW) — shared `SubviewState` primitive (RecessedWell + LampTile + title/description/action/children, no status icon) — the generalization of `PanelMessageState` for sub-views.
- **`mission-control-dashboard.tsx`** — `liveStatusLabel` → EXEC/HOLD/NO-GO/STBY; `lampToneForLiveStatus` error→nogo; added `agentRunLampLabel`/`agentRunLampTone`; runtime tones danger/failed→nogo; PanelMessageState danger → NO-GO/nogo + icon de-tinted to `text-silver-mute`; FAULT block → NO-GO/nogo + AlertTriangle de-tinted; HeroMetric blocked `tone='red'`→`'amber'`; failure-reason + layout-error text → `text-led-nogo`; hero `<h1>` → `text-display font-display`; queue bar `bg-armed`→`bg-led-scope` + counts wrapped in `font-data tabular-nums text-silver`.
- **`employee-card.tsx`** — `lampTone` error→nogo; `statusLampLabel` LIVE→EXEC, ERR→NO-GO, IDLE→STBY; avatar `text-sm`→`text-label`.
- **`stream-view.tsx`** — StreamPane lamp LIVE→EXEC, IDLE→STBY; avatar `text-xs`→`text-label`; empty state → SubviewState.
- **`commands-view.tsx`** — outcome lamp OK→GO/ERR→NO-GO (go/nogo); empty/error states reworked to STBY/NO-GO lamps (kept inline with literal `data-testid`s — see §8).
- **`cards-view.tsx`** — error → SubviewState (NO-GO); added empty state (STBY); dropped AlertCircle + LampTile imports.
- **`floor-view.tsx`** — `statusIndicator`→`statusLamp` returning `{label, tone}` (EXEC/MTG/HOLD/NO-GO/STBY) + `statusHuman` for aria-label; FloorCell dot → `<LampTile>` + `aria-label`; avatar → `text-label`; empty → SubviewState; **levelColor invalid-CSS bezel fixed**.
- **`timeline-view.tsx`** — `eventIcon`→`eventLamp` (EXEC/GO/NO-GO/QUE/MSG/TOOL/STAT/EVT) + `nodeDotClass`; render uses `<LampTile>` + LED rail bead; removed Lucide status icons; error/empty → SubviewState.

---

## 7. DESIGN.md amendments

The sweep made DESIGN.md and the implementation agree again — three canonical edits, all in commits within this branch:

1. **NO-GO LED semantics row** — added `--led-nogo` to the LED-semantics table (steady terminal fault), with the dual-form rule clause amended: blinking `--led-warn` is the *unacknowledged alert* form (AnnunciatorRail), steady `--led-nogo` is the *terminal fault / NO-GO* form. Resolves the architectural gap behind H1.
2. **Focus rings — armed-red (the default focus voice)** — new §Color note: armed-red (`ring-brand/60` / `--armed-glow`) is the default focus voice; the documented exception is machined caps, which keep a neutral `--ring` outline (chrome at Night, graphite in Day) because an outline survives the cap's box-shadow stack and a red ring would vanish into armed/warn cap fills. The `--chrome` token row dropped its blanket "focus rings (night)" claim. Resolves M6.
3. **Decisions log** — recorded both rulings (NO-GO tone, focus-ring reconciliation), dated 2026-06-16.

---

## 8. Intentional / test-pinned (flagged, not changed)

- **M6 (focus ring brand vs chrome):** `mission-control-dashboard.test.tsx:101` pins `focus-visible:ring-brand/60`. Brand-red focus is a deliberate, tested, app-wide choice. **RESOLVED by reconciling DESIGN.md to brand-red** (`f074902`) rather than fighting the test or weakening a11y. Doc-only.
- **P3 ("Mission Control" cards-tab label):** pinned by `dashboard-subtabs` + `mission-control` tests as the intended default-tab name. Intentional — left as-is.
- **P4 (pulsing Radio "Thinking…"):** left as-is; the pane header already carries the EXEC lamp. Low value vs. risk.
- **commands-view state `data-testid`s:** routing the empty/error states through `SubviewState` initially moved the literal `data-testid="commands-empty-state"` / `"commands-error-state"` strings out of the source file, which broke `dashboard-cluster-sweep.test.ts:92` (a source-string-assertion test). Reverted to inline state divs that **keep the literal test-ids** while still carrying the STBY/NO-GO lamps — the visual fix landed without changing the contract the test guards.

---

## 9. Verification

- **Typecheck** (main + preload + renderer + e2e): clean.
- **Biome + ESLint** on the changed surface: clean (the two linters disagree on import ordering; converged on relative-before-`@/` per the cards-view convention, satisfying both).
- **`vitest run`:** **2491 passed / 2491.**
- **Phase B real-renderer screenshots** (Electron test-mode boot + chat round-trip), **both shifts — 14 frames** (see §10). Confirmed: floor STBY word-lamps, timeline GO/EXEC/EVT word-lamps + LED beads, commands STBY empty-state (no Terminal icon), stream STBY panes + concurrency VU, hero/faceplates/LCD wells. **Displays-stay-dark verified in Day Shift** — silver chassis + faceplates, but LCD wells, lamp caps, and LED beads stay void-black/colored. No render-only defects.
  - *Caveat (logged, not hidden):* the new NO-GO red does not appear in any frame because no error state occurred in test-mode (canned provider, healthy boot). NO-GO is verified instead via `lamp-tile` unit tests + the `.lamp-nogo` CSS recipe.

---

## 10. Screenshot inventory

Stored in `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/design-audit-20260616/screenshots/`.

**Night Ops (default shift):**
| Frame | File |
|---|---|
| Cards — idle | `phaseB-01-cards-idle.png` |
| Chat stream (live) | `phaseB-02-chat-stream.png` |
| Timeline | `phaseB-03-timeline.png` |
| Stream | `phaseB-04-stream.png` |
| Floor | `phaseB-05-floor.png` |
| Commands | `phaseB-06-commands.png` |
| Cards — after run | `phaseB-07-cards-after.png` |

**Day Shift (silver chassis — displays stay dark):**
| Frame | File |
|---|---|
| Cards — idle | `phaseB-day-01-cards-idle.png` |
| Chat stream (live) | `phaseB-day-02-chat-stream.png` |
| Timeline | `phaseB-day-03-timeline.png` |
| Stream | `phaseB-day-04-stream.png` |
| Floor | `phaseB-day-05-floor.png` |
| Commands | `phaseB-day-06-commands.png` |
| Cards — after run | `phaseB-day-07-cards-after.png` |

---

## 11. Scores

| Metric | Baseline | Final |
|---|---|---|
| Design Score | B− | **A−** |
| AI-Slop Score | B | **A** |

| Category | Baseline | Final | Driver of the lift |
|---|---|---|---|
| Color & Contrast | C | **A−** | dual-form red resolved; armed-red reserved for LIVE |
| AI Slop | B | **A** | status-as-icons eliminated (floor + timeline word-lamps) |
| Typography | B | **A−** | hero now Archivo |
| Interaction States | B− | **A−** | cards empty state added; sub-views on console state vocab |
| Content / Microcopy | B | **A−** | canonical, consistent lamp words across all views |
| Visual Hierarchy | B | **B+** | sub-view depth largely intact; timeline stripe-band intentional |

---

## 12. PR summary (drop-in)

> Design review found 13 issues, fixed 10 across 8 commits: added a steady **NO-GO** lamp tone (`--led-nogo`) to resolve the dual-form red rule, canonicalized the lamp vocabulary (GO/HOLD/NO-GO/STBY/EXEC), converted floor + timeline status from icons/dots to stencil word-lamps, routed sub-view empty/error/loading states through a shared `SubviewState` console primitive, fixed the hero font to Archivo, and fixed a latent invalid-CSS bezel bug (`hsl(rgba())`) that meant the floor level-edge bezels never rendered. 3 findings were flagged as intentional/test-pinned; the focus-ring color (M6) was a DESIGN.md-vs-impl discrepancy and was resolved by reconciling DESIGN.md to the tested brand-red default. Design score **B− → A−**, AI-slop **B → A**. Full typecheck + Biome + ESLint + **2491** tests green; **14** real-renderer screenshots across both shifts verify displays-stay-dark.

---

## 13. Provenance

- Branch commits implementing this review: `7530ae9` → `f074902` (8 commits, listed in §6).
- Raw artifacts (audit report, `design-baseline.json`, 14 screenshots): `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/design-audit-20260616/`.
- This document consolidates that audit into the repo for the Phase 3 CR-7 review wall.
- **Remaining CR-7 gates (Rocky-driven, not closed by this review):** CI green → internal `/review` → Codex Stage 3 (mandatory, Rocky-triggered) → Rocky sign-off. Phase PR then merges to `main` (release-tagged `/ship` is release-only, not per-phase).
