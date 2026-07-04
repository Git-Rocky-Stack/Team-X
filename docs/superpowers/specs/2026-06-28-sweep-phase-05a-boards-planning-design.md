# v3.4.0 Aesthetic Sweep — Phase 5a (Boards & Planning Core) Design

- **Document date:** 2026-06-28
- **Status:** Approved (brainstorming, Rocky sign-off 2026-06-28) → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-05a-boards-planning` (off `main` `49cc856`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 5 = Work surfaces), `docs/superpowers/specs/2026-06-17-sweep-phase-04a-autonomy-shell-design.md` + `docs/superpowers/specs/2026-06-24-sweep-phase-04b-heavy-panels-design.md` (the recomposition playbook this phase inherits verbatim)
- **Precedent:** Phases 1–4 all merged to `main` (Phase 4 Autonomy COMPLETE = 4a `22a51bd` + 4b `49cc856`). This phase opens **Phase 5 (Work surfaces)** and applies the proven 4a/4b recomposition playbook to the boards & planning core.

---

## Goal

Recompose the **Projects and Tickets surfaces** — the boards, kanbans, entity cards, detail panels, schedule grid, and create-dialogs of the Work cluster — onto the Command Console / Carbon Pro design system. **Visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved.** This is the first of two Phase-5 sub-phases.

## Context

The sweep spec (§3) defines **Phase 5 = Work surfaces** (Projects, schedule-view, Tickets kanban, Meetings, Org Chart). A scan established the cluster is **26 source files / ~5,195 LOC — roughly 2× the entire Phase 4** — and is **heterogeneous**: genuine legacy (`Mission*` / `mission-*`) lives almost entirely in Tickets + schedule-view, while Meetings / Org Chart / Hire are already on restyled-shadcn primitives and only need recompose to the console *vocabulary*.

Given that size, Rocky split Phase 5 into two sub-phases (2026-06-28), mirroring the 4a/4b cadence:

- **5a (this spec):** **Projects + Tickets** — the boards/planning core, **16 files, ~3,437 LOC**. Carries essentially all the cluster's genuine legacy. Harder recompose, done first.
- **5b (next cycle):** Meetings + Org Chart + Hire — the people surfaces, 10 files, ~1,758 LOC, shadcn-clean. Its own spec → plan → implementation.

**No screen in the Work cluster uses charts, Recharts, SVG, or canvas** — it is all cards, boards, lists, and forms — so (as in 4b) there is no chart-styling problem to solve. The org-chart "tree" (a `<ul role="tree">` indented list, deferred to 5b) is likewise not a viz.

## Scope decisions (Rocky, 2026-06-28)

1. **Two sub-phases** — 5a = Projects + Tickets; 5b = Meetings + Org Chart + Hire. One spec / plan / PR / CR-7 wall each.
2. **Strictly visual-only.** Keep the 4a/4b invariant exactly: zero behavior / IPC / data change. A VU meter appears **only where a true `0–1` ratio already exists** in the surface's current data — no new IPC, queries, store reads, or feature wiring.
3. **Extraction: inline-first.** The two DnD kanbans (`projects-kanban`, `tickets/kanban-board`) and the entity cards are the obvious duplication. Follow the 4b precedent: default to inline-composing each from `Faceplate` / `RecessedWell` / `MetricTile`; extract a shared `KanbanColumn` / entity-card console primitive **only if it factors cleanly** during implementation. One plan judgment point, not a pre-built abstraction (YAGNI).
4. **Instrumentation: real ratios only.** Mount VU strictly where a genuine `[0,1]` ratio is already present; every other surface gets `LampTile` + `MetricTile`. No fabricated/decorative meters (a design-review failure).

## Scope

### In (Phase 5a)

**Projects (11 files, ~2,309 LOC)**

| File | LOC | Role |
|---|---|---|
| `features/projects/schedule-view.tsx` | 843 | 7-day team schedule grid + agenda + scheduler form. Legacy: `mission-select` ×5, inline `SummaryTile`/`ScheduleCard`, raw priority/status colors, `rounded-full` count badges |
| `features/projects/project-detail.tsx` | 473 | Project detail panel (tasks/goals, progress, metadata) |
| `features/projects/create-project-dialog.tsx` | 202 | Create-project form dialog |
| `features/projects/goal-detail.tsx` | 158 | Goal detail panel |
| `features/projects/projects-view.tsx` | 116 | Projects screen shell + subtab host |
| `features/projects/create-goal-dialog.tsx` | 112 | Create-goal form dialog |
| `features/projects/projects-kanban.tsx` | 104 | Projects DnD kanban board |
| `features/projects/goals-view.tsx` | 88 | Goals list view |
| `features/projects/project-card.tsx` | 83 | Project entity card |
| `features/projects/goal-row.tsx` | 82 | Goal list row |
| `features/projects/projects-subtabs.tsx` | 48 | Projects/Goals/Schedule subtab nav |

**Tickets (5 files, ~1,128 LOC)**

| File | LOC | Role |
|---|---|---|
| `features/tickets/ticket-detail.tsx` | 424 | Ticket detail panel |
| `features/tickets/tickets-view.tsx` | 263 | Tickets screen — **genuine `mission-shell` consumer** (`MissionMetricTile` / `MissionPill` / `MissionStateBlock`) |
| `features/tickets/create-ticket-dialog.tsx` | 179 | Create-ticket form dialog |
| `features/tickets/kanban-board.tsx` | 143 | Tickets DnD kanban board |
| `features/tickets/ticket-card.tsx` | 119 | Ticket entity card |

Co-located source-pin tests (new/extended) per file, plus one cross-file cluster sweep test.

### Out

- **`mission-shell.tsx` itself:** untouched; purged in Phase 8 once usage reaches zero. 5a removes these files' imports of `Mission*`; remaining consumers (telemetry/chat/copilot/user-guide/workspace/memory-card) fall in Phases 6–7.
- **Meetings / Org Chart / Hire** — Phase 5b.
- **No behavior / IPC / data change.** Hooks, mutations, query wiring, store usage untouched.
- **No structural file-split** — visual-only, even for the 843-LOC `schedule-view` and 473-LOC `project-detail` (same discipline as Phase 3's 1,760-LOC dashboard and 4b's 1,035-LOC profiles panel). A future split may be *noted*, not done here.
- **New-data-feed VUs** — out; a future feature phase, not this sweep.

## Approach — recompose onto existing console primitives

1:1 mapping inherited verbatim from the 4a/4b specs, applied to the boards & planning surfaces. Console primitives already shipped in `components/console/` (Phase 1 + 4a additions: `Faceplate`, `RecessedWell`, `MetricTile`, `LampTile`, `Tag`, `VuMeter`, `StripeHeader`, `SubviewState`) and the `.well-input` / `.cap` / `nav-tile` recipes.

| Current (legacy / shadcn) | → Console primitive |
|---|---|
| `MissionMetricTile` (tickets-view); inline `SummaryTile` (schedule) | `MetricTile` (Departure-Mono phosphor readout) |
| `MissionStateBlock`; ad-hoc loading/error/empty blocks | `SubviewState` |
| `MissionPill` / status chips — encodes **status** | `LampTile` word-lamp |
| `MissionPill` / chips — encodes **category/label** (kind, priority name, source) | `Tag` |
| `MissionInsetSurface` / entity cards (`project-card`, `ticket-card`, `goal-row`, `ScheduleCard`); kanban columns | `RecessedWell` / `Faceplate` (`bodyClassName` for density) |
| `MissionIconButton` / inline icon buttons (complete/delete/close/week-nav) | console chrome-cap icon button (`.cap`) |
| `mission-select` (schedule ×5); form inputs/textareas | `.well-input` recipe + label recipe |
| Section/hero headers + week-nav bar | `StripeHeader` + `Faceplate` |
| `bg-black` / `border-white/N` / `rounded-[Npx]` / `font-mono` / raw status colors (`text-emerald-500`, `border-l-red-500`, `text-amber-500`, `text-brand`) / `rounded-full` count badges | Carbon console tokens + recipes (enforced by the legacy-absent pin) |

**Extraction rule (reuse-first, inline-first default).** Default: inline-compose each board/card from `Faceplate` / `RecessedWell` / `MetricTile`. Extract a *new* shared console primitive only on **clear duplication that factors cleanly** — the prime candidates are a `KanbanColumn` (the two near-identical DnD boards) and a shared entity-card shell (`project-card` / `ticket-card` / `goal-row`). The boards differ in payload (tickets carry priority/assignee; projects carry status lanes), so inline is the safe default and extraction is a judgment call made during implementation, not pre-built. Flagged as a single plan judgment point. Form fields already have `.well-input`.

## Instrumentation intent (VU + lamps) — functional-only, real-ratio-only

Per the real-ratios-only decision, every VU binds to a `0–1` ratio **already present** in the surface's current data, clamped/guarded to `[0, 1]` (the Phase-3 P1 lesson — derive from a scoped, non-empty base or guard explicitly). No new data is wired. Work surfaces are less instrument-dense than Autonomy, so VU homes are sparse by design; the plan confirms or **drops** each candidate per file.

| Surface | VU candidate (`0–1`, verify already-in-data) | Lamps / MetricTile / Tag |
|---|---|---|
| **project-detail / project-card** | task-or-goal completion fraction *iff a clean count/total already exists* | project status → `LampTile`; project/goal/task counts → `MetricTile`; priority/label → `Tag` |
| **goal-detail / goal-row** | goal progress fraction *iff present* | goal status → `LampTile`; counts → `MetricTile` |
| **tickets-view / kanban-board** | resolved-ratio or per-column fill *iff a non-empty denominator exists* | priority/status → `LampTile`; total / critical / unassigned / collaborators → `MetricTile`; kind/priority name → `Tag` |
| **ticket-detail** | — (no genuine ratio expected) | status/priority → `LampTile`; metadata → `Tag` / `MetricTile` |
| **schedule-view** | overdue-or-load fraction *iff it resolves to `[0,1]`* | today / overdue / next-14 / agent-wakes → `MetricTile`; day-count badges → `Tag`; per-item source/status → `Tag` / `LampTile` |

Lamp tone vocabulary is the Phase 3/4a/4b canon: `EXEC / STBY / HOLD / GO / NO-GO`; steady `NO-GO` (`--led-nogo`) for terminal/overdue states, blinking reserved for AnnunciatorRail unacknowledged alerts only. The plan finalizes exact signal bindings and drops any candidate whose denominator is not genuinely present.

## Contract preservation + test mechanism

- **Structural-only DOM changes.** Text content, element identity, and ordering preserved; only the visual wrapper/classes change. CSS `text-transform` handles stencil casing without altering DOM text.
- **Every E2E/a11y selector preserved verbatim.** The plan inventories and pins each selector per file before recompose. Known roots/handles include `data-projects-*`, `data-project-card`, `data-goal-*`, `data-schedule-*` (e.g. the scheduler form field ids `schedule-title` / `schedule-kind` / `schedule-priority` / …, and the `aria-label`/`title` on week-nav + complete/delete buttons), `data-tickets-*`, `data-ticket-card`, `data-kanban-*`, plus every dialog's labelled controls.
- **Displays-stay-dark** in both shifts; **dual-shift** (Night Ops `.dark` / Day Shift) correct.
- **No-mix:** post-sweep these 16 files use console composition *exclusively* — no `Mission*` / `.mission-*` / `.brand-selected` / status-badge family / `mission-select`. Other `mission-shell` consumers stay legacy until their phases — 5a does not touch them.
- **Tests = source-string-pin**, extending the established harness (`heavy-panels-cluster-sweep.test.ts` is the template): each swept file asserts **console-present** (the primitives/recipes it now uses) + **legacy-absent** (no `bg-black`, `border-white/N`, `mission-*`, `mission-select`, `rounded-[Npx]`, `font-mono`, raw status colors, `rounded-full` badges) + **selectors-preserved**. A final cross-file `boards-planning-cluster-sweep.test.ts` (reading both `projects/` and `tickets/`; exact location finalized in the plan) guards against drift. RTL/jsdom is available, but for a visual recompose with unchanged behavior, source-pin is the correct deterministic tool.

## Delivery

Own spec → plan (`writing-plans`) → execution (`executing-plans`, per-task TDD red→green with Biome / typecheck / ESLint 0-0 / vitest gates). The 16 mechanical recomposes are **delegatable to parallel `elite-executor` subagents** (edit-only-this-file + no-tooling/no-git constraints), with the new test contract authored centrally and every diff reviewed / gated / committed centrally — the 4a/4b model, confirmed at the execution checkpoint once scale is clear. Then PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered · Stage 4 Rocky sign-off → squash-merge). No version bump (v3.4.0 tags only at Phase 8).

## Per-phase definition of done (inherited)

1. **CI Stage 1 green** — typecheck, Biome, ESLint, tests ×3 OS, Electron E2E smoke. E2E passes **unchanged** (visual-only sweep).
2. **`/design-review` skill audit** against DESIGN.md's anti-slop checklist → all findings fixed.
3. **Screenshot pack** — every swept surface × Night Ops + Day Shift → Rocky's eyeball sign-off.
4. **CR-7 wall** — `/review` (Stage 2) → Codex (Stage 3, Rocky-triggered; any HIGH/[P1] blocks) → Rocky sign-off (Stage 4) → squash-merge.

## Risks / open items

- **VU denominator guards** — every functional VU must be domain-safe (the Phase-3 P1 class of bug): guard zero/empty denominators and clamp to `[0, 1]`. Drop the meter rather than fabricate one.
- **Selector-inventory completeness** — `tickets-view` and the dialogs are selector-dense and form-heavy; an incomplete inventory risks breaking the E2E/a11y contract. The plan inventories each file's selectors before recompose and pins them.
- **schedule-view weight** — 843 LOC, the cluster's heaviest file, recomposed visual-only in one pass (no split). The 7-day grid columns and agenda cards become `RecessedWell`/`Faceplate`; the `mission-select` form fields become `.well-input`; priority/status colors become console tones. 60 fps verified (depth recipes on containers, never on virtualized rows).
- **Extraction judgment** (`KanbanColumn` / entity-card primitive vs inline) — decided during implementation against the "clear duplication that factors cleanly" bar; flagged in the plan, not pre-built.
- **Cross-file test location** — the sweep test spans two feature dirs (`projects/`, `tickets/`); its home (features root vs one dir with relative reads) is finalized in the plan.
