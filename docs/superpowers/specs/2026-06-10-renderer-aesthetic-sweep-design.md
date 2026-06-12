# Renderer Aesthetic Sweep — Design

**Date:** 2026-06-10
**Status:** Approved by Rocky (brainstorming Q1–Q9, 2026-06-10)
**Canon:** `DESIGN.md` (Command Console — GO/NO-GO · Carbon Pro chassis, canonized 2026-06-10) + approved preview `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/design-system-20260609/team-x-design-preview.html`
**Target release:** v3.4.0 "Command Console" (tag-driven; main may carry a partially-recomposed app between phases)

## 1. Goal

Apply the canonized Command Console / Carbon Pro design system to the entire
Electron renderer (`apps/desktop/src/renderer/`) — 148 `.tsx` files, 19
screens/views, 19 shadcn-style UI primitives — replacing the legacy
AMOLED-black + mission-red system (`.mission-*`, `.brand-selected`,
Inter/JetBrains Mono) with the dual-shift Carbon Pro system, ending with the
legacy system fully deleted. The sweep is **visual-only**: zero behavior,
data-flow, or IPC changes. E2E specs (role/aria/testid selectors) must pass
unchanged throughout.

## 2. Decisions made (with rationale)

| # | Decision | Rationale |
|---|---|---|
| Q1 | Rocky merges PR #25 first (restores main's lint gate); sweep branch cut from fresh main; commit #1 = DESIGN.md + CLAUDE.md amendment | Clean lineage; canon rides with its first consumer |
| Q2 | Staged phase PRs, each through the full CR-7 wall; release tagged at the end | Reviewable diffs; matches v3.3.0 phase workflow; releases are tag-driven so partial sweep on main is invisible to users |
| Q3 | **Global foundation** — tokens, fonts, and shadcn primitives swap app-wide in Phase 1. The CLAUDE.md "never mix families on one screen" rule is **amended to apply to composition, not tokens** | Avoids dual token trees / dual-styled components / double font payloads; transition look is coherent (Carbon skin on legacy shapes) |
| Q4 | **Both shifts from foundation** — Phase 1 ships the full dual token layer: `dark` → Night Ops, `light` → Day Shift; displays-stay-dark enforced at token level | One pass per screen; light-mode workspaces never see a broken hybrid; no second migration |
| Q5 | Per-phase proof gate: `/design-review` skill audit **then** screenshot pack (every swept screen × both shifts) for Rocky's eyeball sign-off, before the PR | Maximum rigor; human eye is the final gate |
| Q6 | **Hybrid strategy (C)** — Foundation does both the global token/font/shadcn retarget AND builds the new console primitive library; screens then recompose cluster by cluster; final phase purges legacy | Instant app-wide coherence + clean end-state architecture |
| Q7–Q9 | 8-phase ladder, foundation architecture, recomposition/validation/purge design approved as specified below | — |

## 3. Phase ladder

Each phase = its own branch off `main` = its own PR through CR-7
(CI → `/review` → Codex [Rocky-triggered] → Rocky sign-off → merge).

| Phase | Scope | Key files/surfaces |
|---|---|---|
| **1 — Foundation** | Canon docs commit; dual-shift Carbon token layer; font swap; 19 shadcn primitives restyled in place (APIs frozen); console primitive library + recipes; legacy classes retinted | `DESIGN.md`, `CLAUDE.md`, `src/styles/globals.css`, `tailwind.config.ts`, `components/ui/*`, new `components/console/*`, `package.json` (fonts) |
| **2 — Shell + Command Deck** | App chrome: layout, top bar, sidenav, workspace switcher, command palette; **AnnunciatorRail mounted** | `app/layout.tsx`, `app/top-bar.tsx`, `app/sidenav.tsx`, `features/workspace/*`, `features/command/command-palette.tsx` (1,141 LOC) |
| **3 — Mission Control** | Flagship dashboard + sub-views; establishes the recomposition pattern | `features/dashboard/mission-control-dashboard.tsx` (1,760), commands/timeline/stream/floor views, `features/mission/mission-shell.tsx` |
| **4 — Autonomy cluster** | Densest instrumentation surface — primary home of VU meters and lamps | `features/autonomy/*`: autonomy-view (1,091), runtime-profiles (1,035), routines (628), budgets (579), approvals/memory/artifacts/doctor panels |
| **5 — Work surfaces** | Planning/board screens (shared card/board patterns) | Projects, schedule-view (843), Tickets kanban, Meetings, Org Chart |
| **6 — Comms + Guide** | Conversation surfaces; stream viewports (Iosevka, display-dark) | Chat + chat-drawer (661), copilot UI, user-guide-view (525) |
| **7 — Ops + Settings** | Long-tail forms/tables; Recharts restyle | Settings (11 sections incl. portability 1,082 + RAG 625), Telemetry, Audit, Vault |
| **8 — Day Shift polish + legacy purge** | Zero-usage grep gate → delete legacy classes/fonts; CLAUDE.md legacy section removed; app-wide `/design-review` + `/qa` both shifts; perf + a11y final pass; CHANGELOG + VERSION | Whole app |

Remaining v3.3.0 Local-GGUF work may interleave between phases; overlap with
renderer styling is minimal.

## 4. Foundation architecture (Phase 1)

### 4.1 Token layer — same mechanism, new values

- Keep the shadcn CSS-variable architecture untouched as a *mechanism*:
  `:root` + `.dark` HSL-tuple swap, Tailwind utilities reading the vars.
  Zero churn in how 148 files consume color.
- **`.dark` → Night Ops:** carbon ramp `#000000 / #050505 / #0D0D0D… / #1A1A1A`,
  silver text ramp `#F5F5F5 / #B3B3B3 / #888888`, armed `#AA2024`.
- **`:root` → Day Shift:** silver-anodized faceplate `#F5F5F3 → #D8D8D4`,
  silver bolts, black-gloss chrome inversions per the approved preview.
- **Added console tokens** (from the approved preview's `:root` block):
  armed triplet (`#AA2024 / #E0252B / #7F171A`), LED palette
  (`#41E25E / #FFB000 / #FF4438 / #58C4BC`), chrome `#E6E6E6`,
  Fibonacci base-4 spacing `--sp-1..7` (4/8/12/20/32/52/84), machined radii
  (`--r-card: 2px / --r-control: 4px / --r-overlay: 8px`), ease curves, and
  the four-layer depth shadow stacks.
- Tailwind `brand-*` palette retargets to the armed ramp; `surface-*` to the
  carbon ramp. Existing semantic tokens (`--primary`, `--border`, `--ring`, …)
  retarget to Carbon Pro values.

### 4.2 Displays-stay-dark — enforced at token level

Display surfaces (LCD wells, stream viewports, VU arrays, lamp caps) consume a
dedicated `--display-*` token group defined **once** and **never overridden in
Day Shift**. The rule becomes impossible to break per-screen.

### 4.3 Fonts (Fontsource, local-first, no CDN)

| Role | Font | Package |
|---|---|---|
| Display / placards | Archivo (wdth 118–125, 750–800 caps) | `@fontsource-variable/archivo` |
| Body | Public Sans | `@fontsource-variable/public-sans` |
| Live telemetry / LCD wells | Departure Mono | `@fontsource/departure-mono` |
| Streams | Iosevka | `@fontsource-variable/iosevka` |

`body` → Public Sans. Typography utility classes (`.text-eyebrow*`,
`.text-numeric*`, `.text-code*`, `.text-shortcut`, `.text-menu-label`)
retarget in place so all usage sites inherit instantly. Inter + JetBrains Mono
Fontsource packages are removed in the same phase (nothing references them
after the retarget). Verify exact Fontsource package names/availability at
implementation time; if a package is unavailable, bundle the OFL font files
directly via `@font-face`.

### 4.4 shadcn primitives — restyled in place, APIs frozen

All 19 components in `components/ui/` retarget to console recipes via tokens.
Button = raised control; Input/Select/Textarea = recessed wells; Card =
faceplate-lite; Dialog/Sheet = overlay radius (8px); Badge gains lamp-style
variants. **Variant names and props do not change in Phase 1** — call sites
are untouched until their screen's recomposition phase.

### 4.5 Console primitive library — `components/console/`

| Component | Purpose / contract |
|---|---|
| `Faceplate` | Raised panel: layered gradients + inset/drop shadows + edge-light, per the canonical recipe |
| `RecessedWell` | Recessed surface for inputs/content wells |
| `LcdWell` | Void-black phosphor LCD readout (Departure Mono, display-dark tokens) |
| `LampTile` | Stencil word-lamp (`GO/HOLD/NO-GO/STBY/EXEC/ON AIR`). Dual-form red rule: steady = live/armed; blinking 1 Hz = unacknowledged → click-to-ack |
| `AnnunciatorRail` | App-level rail: strike ignition (80 ms attack / 240 ms decay), master-caution ack, tile teleport. Built in Phase 1, mounted in Phase 2 |
| `VuMeter` | Segment meter, IEC 60268-17 ballistics. **Functional-only:** must be fed a real signal prop; no decorative use |
| `StripeHeader` | Brushed-aluminum stripe header (directional repeating-linear-gradient grain — never fractal noise) + `MOD·NAME·NN` serial stripe |
| `HexBolt` | 3-layer hex socket cap bolt |
| `ShiftToggle` | Night Ops / Day Shift switch (wires to existing company-level theme persistence) |

CSS recipes land in `globals.css` `@layer components` (`.faceplate`, `.well`,
`.control`, `.stripe`, `.hex`), adapted from the approved preview. Every
component ships with vitest + testing-library tests (TDD per repo default) —
lamp dual-form/ack logic and VU ballistics especially.

### 4.6 Theming mechanics

Company-level persistence (`company.theme: 'dark' | 'light'` in SQLite via
IPC) is **kept as-is**: `dark` → Night Ops, `light` → Day Shift. The `.dark`
class remains the switching mechanism. `ShiftToggle` is a restyle of the
existing setting, not a new preference store.

### 4.7 Legacy classes — retinted, not removed

`.mission-*` (~23 classes, 195+ sites) and `.brand-selected` family (16 sites)
retarget to carbon/armed tokens in Phase 1 so unswept screens look coherent.
They are deleted in Phase 8 once usage reaches zero.

## 5. Recomposition pattern (Phases 2–7)

Visual-only; zero behavior change. Standard mapping per screen:

| Legacy surface | Console replacement |
|---|---|
| Hero / section headers | `StripeHeader` + `Faceplate` |
| `.mission-panel` / `.mission-hero` | `Faceplate` |
| Metric tiles / numeric readouts | `LcdWell` (Departure Mono) |
| Status badges (LED + label family) | `LampTile` word-lamps |
| `.brand-selected` chooser sites | Raised-control selection with armed glow (+ semantic tint variants) |
| Inputs / selects | Recessed wells |
| Stream viewports | Iosevka on display-dark tokens |
| `.mission-pill` | Lamp-tile or stencil tag per DESIGN.md vocabulary |

Per-screen rules:

- Both shifts verified before the phase PR.
- `VuMeter` mounts only where a **real signal** exists (token throughput,
  queue depth, run concurrency, …). Each phase plan names its signals.
  Decorative meters are a design-review failure.
- Read `DESIGN.md` before each screen; missing patterns fall back to
  Vision-X `DESIGN.md`; Team-X divergences win.

## 6. Per-phase definition of done

1. **CI Stage 1 green** — typecheck, Biome, ESLint, tests ×3 OS, Electron E2E
   smoke. E2E passes **unchanged** (visual-only sweep).
2. **`/design-review` skill audit** against DESIGN.md's anti-slop checklist →
   all findings fixed.
3. **Screenshot pack** — every swept screen × Night Ops + Day Shift, captured
   from the dev server → **Rocky's eyeball sign-off**.
4. **CR-7 wall** — `/review` (Stage 2) → Codex (Stage 3, Rocky-triggered; any
   HIGH/[P1] blocks) → Rocky sign-off (Stage 4) → merge.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Paint cost of gradient+shadow depth stacks | Recipes applied to containers/panels, never to virtualized list rows; 60 fps verified on dashboard + schedule views |
| Blinking-lamp jank / accessibility | Pure CSS animation (compositor-friendly); `prefers-reduced-motion` collapses blink to steady alt-state with visible "UNACK" affix (semantics survive) |
| Recharts default theming clashes | Axis/grid/tooltip themed explicitly via props reading console tokens (Phase 7) |
| Day Shift rot | Both shifts in every per-phase screenshot pack |
| Stale-branch merges (the #24 incident) | Every phase branch cut fresh from just-pulled `main`; no re-merging merged branches |
| Font package availability | Verified at Phase 1 start; `@font-face` fallback with bundled OFL files |

## 8. Phase 8 — purge + release gate

- Scripted zero-usage check before deletion: grep gate for `.mission-`,
  `brand-selected`, `brand-range`, `Inter`, `JetBrains` → must be 0 hits in
  renderer source.
- Delete legacy classes, legacy typography targets, old font packages.
- Remove the CLAUDE.md "LEGACY" design section (transition state over).
- App-wide `/design-review` + `/qa`, both shifts.
- Perf (60 fps) + a11y (WCAG AA, keyboard, 44 px targets) final pass.
- CHANGELOG + VERSION → Rocky tags `v3.4.0`.

## 9. Out of scope

- Any behavior, data-flow, schema, or IPC change.
- The Team-X marketing website mirror (separate downstream effort; inherits
  this system structurally per DESIGN.md's Website Mirror Mandate).
- New features (annunciator rail surfaces *existing* alert/approval signals
  only).
