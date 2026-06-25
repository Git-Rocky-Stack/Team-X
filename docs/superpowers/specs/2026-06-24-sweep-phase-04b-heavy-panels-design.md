# v3.4.0 Aesthetic Sweep — Phase 4b (Heavy Autonomy Panels) Design

- **Document date:** 2026-06-24
- **Status:** Approved (brainstorming, Rocky sign-off 2026-06-24) → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-04b-heavy-panels` (off `main` `22a51bd`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 4 = Autonomy cluster), `docs/superpowers/specs/2026-06-17-sweep-phase-04a-autonomy-shell-design.md` (the playbook this phase inherits verbatim)
- **Precedent:** Phases 1–4a all merged to `main` (4a = PR #29 squash `22a51bd`). This phase repeats the 4a recomposition playbook on the four remaining heavy autonomy panels and **completes the Autonomy cluster (Phase 4).**

---

## Goal

Recompose the **four heavy autonomy instrumentation panels** onto the Command Console / Carbon Pro design system — **visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved** — finishing the densest instrumentation surface in the app and closing out Phase 4.

## Context

The sweep spec (§3) defines **Phase 4 = the Autonomy cluster** (~12 files, ~5,000+ LOC), split for CR-7 tractability (Rocky, 2026-06-17):

- **4a (merged):** `autonomy-view.tsx` shell + the six light panels (doctor, benchmark, agent-improvement, approvals, artifacts, memory).
- **4b (this spec):** the four heavy panels — `runtime-profiles-panel` (1,035 LOC), `routines-panel` (628), `budgets-panel` (579), `runtime-operations-panel`. ~2,800 LOC total across 4 files.

These are "heavy" because of **data density** — runtime-adapter forms + diagnostics grids, scheduling, budget policies + spend ledger + approvals + provider mix, live runtime operations + projections — **not** because of data-viz. A scan confirmed **none of the four use charts** (no Recharts / SVG / sparklines / progress bars); the instrumentation is metric tiles, lamps, tags, recessed wells, and (where a real ratio exists) VU meters. So there is no chart-styling problem to solve.

All four are built on the legacy `Mission*` primitive family (`MissionInsetSurface / MetricTile / Pill / StateBlock / IconButton`), the same shared `mission-shell.tsx` library 4a migrated its seven files off of.

## Scope decisions (Rocky, 2026-06-24)

1. **All four panels in one Phase 4b** — one spec / plan / PR / CR-7 wall. The recompose is mechanical and delegatable to parallel subagents (as 4a did its seven). 4a's five Codex passes were almost entirely on **new auxiliary code** (the `ollama-models` helper), not the recompose itself; 4b adds **no new services**, so the Codex/security surface is far lighter.
2. **Strictly visual-only.** Keep 4a's exact invariant: zero behavior / IPC / data change. A VU meter appears **only where a true `0–1` ratio already exists in the panel's current data** — no new IPC, queries, store reads, or feature wiring. This satisfies the "truthful VU" rule (meter only what is real-and-present) while preserving the clean "zero behavior change" review claim. The new-data-feed VUs the 4a design-review deferred are a **separate future feature phase**, not this sweep.

## Scope

### In (Phase 4b)
| File | Role |
|---|---|
| `features/autonomy/runtime-profiles-panel.tsx` (1,035) | Runtime adapter profiles: create/edit forms, per-kind config fields, adapter diagnostics grid, validation results, employee bindings |
| `features/autonomy/routines-panel.tsx` (628) | Scheduled routines: create/edit, cadence, enable/disable, run state |
| `features/autonomy/budgets-panel.tsx` (579) | Budget policies, spend ledger, pending approvals, provider mix, real burn ratios |
| `features/autonomy/runtime-operations-panel.tsx` | Live runtime operations + projections (`runtime-operations-projections` helper) |

Co-located source-pin tests (new/extended) alongside each.

### Out
- **`mission-shell.tsx` itself:** untouched; purged in Phase 8 once usage reaches zero. 4b removes these four files' imports of `Mission*`; the remaining consumers (telemetry/chat/tickets/copilot/user-guide/workspace/memory-card) fall in Phases 5–7.
- **No behavior / IPC / data change.** Hooks, mutations, query wiring, store usage untouched.
- **No structural file-split** — visual-only, even for the 1,035-LOC profiles panel (same discipline as Phase 3's 1,760-LOC dashboard). A future split may be *noted*, not done here.
- **New-data-feed VUs** the 4a review deferred — out; future feature phase.

## Approach — recompose onto existing console primitives

1:1 mapping inherited verbatim from the 4a spec, applied to the four heavy panels:

| `Mission*` (legacy) | → Console primitive |
|---|---|
| `MissionInsetSurface` / entity cards (`PolicyCard`, `RuntimeProfileCard`, routine card) | `RecessedWell` / `Faceplate` (`bodyClassName` for density) |
| `MissionMetricTile` | `MetricTile` (Departure-Mono phosphor readout) |
| `MissionStateBlock` | `SubviewState` |
| `MissionSegmentedButton` (if any) | `nav-tile` / `nav-tile-active` recipe + `aria-current="page"` |
| `MissionIconButton` | console chrome-cap icon button |
| `MissionPill` | `LampTile` when the pill encodes **status**; `Tag` when it encodes a **category/label** |
| Inline form fields (`FIELD_CLASSNAME` / `LABEL_CLASSNAME`) | `.well-input` recipe + label recipe (the recipes already shipped) |
| `bg-black` / `border-white/N` / `rounded-[Npx]` / `font-mono` / raw status colors (`text-amber-300`, `text-red-200`, `text-brand`) | Carbon console tokens + recipes (enforced by the legacy-absent pin) |

**Extraction rule (reuse-first).** Extract a *new* shared console primitive only on clear duplication, the way Phase 3 extracted `SubviewState` and 4a extracted `MetricTile` / `Tag`. The likely candidates across the heavy panels are the **diagnostics / metric grid** and the **entity card** (`PolicyCard` / `RuntimeProfileCard` / routine card). If either factors cleanly, extract a thin shared helper later phases inherit; otherwise compose inline from `Faceplate` / `MetricTile`. Flagged as a single judgment point per the plan, not a pre-built abstraction (YAGNI). Form fields already have `.well-input`.

## Instrumentation intent (VU + lamps) — functional-only, real-ratio-only

Per the visual-only decision, every VU binds to a `0–1` ratio **already present** in the panel's current data, and every one is clamped/guarded to stay in `[0, 1]` (the Phase 3 P1 lesson — derive from a scoped, non-empty base or guard explicitly). No new data is wired.

| Panel | VU (0–1, functional, already in data) | Lamps / MetricTile |
|---|---|---|
| **budgets** | burn = `currentSpendUsd / hardCapUsd` (clamped) | `alertLevel` → `LampTile` (`exceeded`=NO-GO, `warning`/`approval-required`=HOLD, else GO); company-burn / active-policies / warning+exceeded / pending-approval counts → `MetricTile`; scope/runKind/provider → `Tag` |
| **runtime-profiles** | native-ratio = `nativeCount / profiles.length` (guarded) | `lastHealthStatus` → `LampTile` (healthy=GO, warning=HOLD, error=NO-GO); profiles/native/planned/bound counts → `MetricTile`; kind/executionMode/enabled → `Tag`/`LampTile` |
| **runtime-operations** | existing projection/utilization ratio from `runtime-operations-projections` **iff** already `[0,1]` | live op state → lamps; counts/throughput → `MetricTile` |
| **routines** | enabled/total or a real cadence fraction **iff** one exists | routine state (enabled/disabled/running) → lamps; cadence/scope → `Tag`; counts → `MetricTile` |

Lamp tone vocabulary is the Phase 3/4a canon: `EXEC / STBY / HOLD / GO / NO-GO`; steady `NO-GO` (`--led-nogo`) for terminal faults, blinking `WARN` reserved for AnnunciatorRail unacknowledged alerts only. The plan finalizes exact signal bindings.

## Contract preservation + test mechanism

- **Structural-only DOM changes.** Text content, element identity, and ordering preserved; only the visual wrapper/classes change. CSS `text-transform` handles stencil casing without altering DOM text.
- **Every E2E/a11y selector preserved verbatim.** These panels carry the densest contract in the cluster — e.g. `data-runtime-profiles-panel`, `data-runtime-profile-card`, `data-runtime-adapter-diagnostics`, `data-runtime-validation-result`, `data-runtime-employee-binding`, `data-budgets-panel`, `data-budget-policy`, `data-budget-ledger`, `data-budget-approval`, plus routines/runtime-operations roots and any `aria-label`/`title`. The plan inventories and pins each one per file before recompose.
- **Displays-stay-dark** in both shifts; **dual-shift** (Night Ops `.dark` / Day Shift) correct.
- **No-mix:** post-sweep these four use console composition *exclusively*; no `Mission*` / `.mission-*` / `.brand-selected` / status-badge family. The other `mission-shell` consumers stay legacy until their phases — 4b does not touch them.
- **Tests = source-string-pin**, extending the established harness: each swept file asserts **console-present** (the primitives/recipes it now uses) + **legacy-absent** (no `bg-black`, `border-white/N`, `mission-*`, `rounded-[Npx]`, `font-mono`, raw status colors) + **selectors-preserved**; a final cross-file legacy-absence pin (à la `autonomy-cluster-sweep.test.ts`) guards against drift. RTL/jsdom is available, but for a visual recompose with unchanged behavior, source-pin is the correct, deterministic tool.

## Delivery

Own spec → plan (`writing-plans`) → execution (`executing-plans`, per-task TDD red→green with Biome / typecheck / ESLint 0-0 / vitest gates). The four mechanical recomposes are **delegatable to parallel `elite-executor` subagents** (edit-only-this-file + no-tooling/no-git constraints), with the new test contract authored centrally and every diff reviewed / gated / committed centrally — the 4a model, confirmed at the execution checkpoint once scale is clear. Then PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered · Stage 4 Rocky sign-off → merge). No version bump (v3.4.0 tags only at Phase 8). **Merging 4b completes the Autonomy cluster (Phase 4).**

## Risks / open items

- **VU denominator guards** — every functional VU must be domain-safe (the Phase 3 P1 class of bug): guard zero/empty denominators and clamp to `[0, 1]`.
- **Selector-inventory completeness** — these are the most selector-dense panels in the cluster; an incomplete inventory risks breaking the E2E/a11y contract. The plan inventories each file's selectors before recompose and pins them.
- **Extraction judgment** (shared diagnostics-grid / entity-card primitive vs inline) — decided during implementation against the "clear duplication" bar; flagged in the plan, not pre-built.
- **`runtime-operations` ratio reality** — its projection helper must expose a genuine `[0,1]` fraction for a VU; if none exists, that surface gets lamps + MetricTiles only (no fabricated meter).
