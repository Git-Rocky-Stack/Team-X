# v3.4.0 Aesthetic Sweep — Phase 4a (Autonomy Shell + Light Panels) Design

- **Document date:** 2026-06-17
- **Status:** Approved (brainstorming, Rocky sign-off 2026-06-17) → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-04a-autonomy-shell` (off `main` `2d576a8`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 4 = Autonomy cluster)
- **Precedent:** Phases 1–3 (foundation → shell → Mission Control), all merged to `main`. This phase repeats the Phase 3 recomposition playbook on the autonomy surface.

---

## Goal

Recompose the **Autonomy shell + its lighter panels** onto the Command Console / Carbon Pro design system — **visual-only**, zero behavior/IPC change, every E2E/a11y selector preserved — establishing the console vocabulary for the densest instrumentation surface in the app.

## Context

The sweep spec (§3) defines **Phase 4 = the Autonomy cluster**, called out as *"the densest instrumentation surface — primary home of VU meters and lamps."* The cluster is ~3× Phase 3's footprint: **12 files, ~5,000+ LOC**. To keep the CR-7 review/Codex gates tractable it is **split into two sub-phases** (Rocky decision, 2026-06-17):

- **4a (this spec):** `autonomy-view.tsx` (the shell) + the six light panels.
- **4b (separate spec/plan):** the four heavy instrumentation panels — `runtime-profiles` (1,035), `routines` (628), `budgets` (579), `runtime-operations`.

**The `mission-shell.tsx` question (resolved):** every autonomy file is built on the legacy `Mission*` primitive family (`MissionPageShell / Hero / SectionCard / RailCard / MetricTile / Pill / SegmentedButton / IconButton / InsetSurface / SheetHeader / StateBlock / ControlRow`). That family is the shared shell for **~23 screens** (autonomy + telemetry + chat + tickets + copilot + user-guide + memory + workspace). Per the sweep spec's purge model (§5), legacy primitives were token-retinted in Phase 1, each consumer migrates **off** them in its own phase, and `mission-shell.tsx` is **purged in Phase 8** once usage reaches zero. Sweeping `mission-shell.tsx` *in place* now would flip all 22 still-unswept consumers to console composition mid-body — the exact no-mix violation deferred in Phase 3.

**Decision (Rocky, 2026-06-17):** 4a recomposes autonomy **off** `Mission*` onto the **existing** console primitives Phase 1/3 already shipped; extract a *new* shared console primitive only on clear duplication (the way Phase 3 extracted `SubviewState`). `mission-shell.tsx` is left untouched for its other consumers and purged in Phase 8.

## Scope

### In (Phase 4a)
| File | Role |
|---|---|
| `features/autonomy/autonomy-view.tsx` (1,091) | Shell: page wrapper + per-subview hero + 10-tab segmented nav + inline **Access** subview (operators, invites, cloud-link posture) |
| `features/autonomy/autonomy-doctor-panel.tsx` | Self-diagnostics: per-check pass/fail |
| `features/autonomy/autonomy-benchmark-panel.tsx` | Benchmark runs + scores |
| `features/autonomy/agent-improvement-panel.tsx` | Improvement tickets list |
| `features/autonomy/approvals-panel.tsx` | Pending/approved/rejected approvals |
| `features/autonomy/artifacts-panel.tsx` | Produced artifacts list |
| `features/autonomy/memory-panel.tsx` | Memory threads |

Test files (new/extended) co-located alongside each.

### Out
- **4b panels:** `runtime-profiles`, `routines`, `budgets`, `runtime-operations` (own spec/plan).
- **`mission-shell.tsx` itself:** untouched; purged Phase 8.
- **No structural refactor** of `autonomy-view.tsx` (visual-only; Phase 3 left the 1,760-LOC dashboard intact — same discipline). A file-split may be *noted* as a future item but is not done here.
- **No behavior/IPC/data change.** Hooks, mutations, query wiring, and store usage are untouched.

## Approach — recompose onto existing console primitives

1:1 mapping to primitives Phase 1/3 already shipped:

| `Mission*` (legacy) | → Console primitive |
|---|---|
| `MissionPageShell` | plain padded container (the brushed chassis + grid live at the app-shell level since Phase 2) |
| `MissionHero` | `StripeHeader` + `Faceplate` header (Phase 3 hero pattern) |
| `MissionSectionCard` / `MissionRailCard` | `Faceplate` (`bodyClassName` for content density) |
| `MissionMetricTile` | `LcdWell` (Departure-Mono phosphor readout) |
| `MissionInsetSurface` | `RecessedWell` |
| `MissionStateBlock` | `SubviewState` (the shared recessed-well + word-lamp primitive extracted in Phase 3) |
| `MissionSegmentedButton` (10-tab nav) | `nav-tile` / `nav-tile-active` recipe + `aria-current="page"` (identical to Phase 3 dashboard subtabs) |
| `MissionIconButton` | console icon button (chrome cap) |
| `MissionPill` | `LampTile` when the pill encodes **status**; retinted tag token when it encodes a **category/label** |
| `MissionSheetHeader` | `StripeHeader` |

**Extraction rule.** Reuse first. Extract a new *shared* console primitive only when a shape clearly repeats. The autonomy-view **hero + segmented-nav** is the prime candidate (it recurs in telemetry/tickets, future Phases 5–7); if it factors cleanly, extract a thin `ConsoleHero` / nav helper that later phases inherit; otherwise inline it. The plan flags this as a single judgment point, not a pre-built abstraction (YAGNI).

## Instrumentation intent (VU + lamps) — lean-in

The sweep spec names autonomy *"the primary home of VU meters and lamps,"* and Rocky approved a **lean-in** posture (2026-06-17): instrument richly. The Phase 3 **functional-only** rule still governs — **every VU meter is bound to a real 0–1 ratio; no decorative meters** — but where a meaningful ratio or status exists, surface it.

Lamp tone vocabulary is the canon established in Phase 3: `EXEC / STBY / HOLD / GO / NO-GO / WARN` — steady `NO-GO` (`--led-nogo`) for terminal faults, blinking `WARN` reserved for AnnunciatorRail unacknowledged alerts only.

Proposed per-surface instrumentation (the plan finalizes exact signal bindings):

| Surface | VU (0–1, functional) | Lamps / LcdWell |
|---|---|---|
| **Shell / nav** | — | nav-tile rail (`aria-current`); per-subview `StripeHeader` hero |
| **Access (inline)** | sharing-readiness ratio if a true fraction exists | operator-count `LcdWell`; role/auth-mode/source → tags or `LampTile`; link posture → `GO/HOLD/NO-GO` lamp |
| **Doctor** | checks-passing / total | per-check `LampTile` (`GO`/`NO-GO`/`HOLD`); pass-count `LcdWell` |
| **Benchmark** | latest pass-rate / score-normalized | per-run lamp; score `LcdWell` |
| **Agent-improvement** | — (or open/closed ratio if meaningful) | ticket-state lamps; `cap` rows; **preserve** `aria-label="Open {ticket.title}"` |
| **Approvals** | pending / total (if a true fraction) | state lamps (`HOLD` pending / `GO` approved / `NO-GO` rejected); pending-count `LcdWell` |
| **Artifacts** | — | count `LcdWell`; type/status tags or lamps |
| **Memory** | — | thread-count `LcdWell`; state lamps |

Any VU whose denominator can be zero or whose numerator can exceed it must be clamped/guarded to stay in `[0, 1]` (the Phase 3 P1 lesson — derive ratios from a scoped, non-empty base or guard explicitly).

## Contract preservation + test mechanism

- **Structural-only DOM changes.** Text content, element identity, and ordering preserved; only the visual wrapper/classes change. CSS `text-transform` handles stencil casing without altering DOM text.
- **Every E2E/a11y selector preserved verbatim.** The 4a surface has a *light* contract — notably `agent-improvement`'s `aria-label="Open {ticket.title}"`. The plan inventories and pins each one.
- **Displays-stay-dark** in both shifts; **dual-shift** (Night Ops `.dark` / Day Shift) correct.
- **No-mix:** post-sweep, autonomy uses console composition *exclusively*. The other `mission-shell` consumers stay legacy until their phases — 4a does not touch them.
- **Tests = source-string-pin**, extending the established harness: each swept file asserts **console-present** (the primitives/recipes it now uses) + **legacy-absent** (no `bg-black`, `border-white/N`, `mission-*`, `rounded-[Npx]`, `font-mono`, raw status colors) + **selectors-preserved**. RTL/jsdom is available, but for a visual recompose with unchanged behavior, source-pin is the correct, deterministic tool; a final per-file legacy-absence pin guards against drift.

## Delivery

Own spec → plan (`writing-plans`) → execution (`executing-plans`, per-task TDD red→green with Biome / typecheck / ESLint / vitest gates) → PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered · Stage 4 Rocky sign-off → merge). No version bump (v3.4.0 tags only at Phase 8). 4b follows in its own cycle.

## Risks / open items

- **Extraction judgment** (hero/nav shared primitive vs inline) — decided during implementation against the "clear duplication" bar; flagged in the plan.
- **VU denominator guards** — every functional VU must be domain-safe (the Phase 3 P1 class of bug).
- **`autonomy-view.tsx` size (1,091 LOC)** — not split here (visual-only); a future structural-split may be noted but is out of scope for the sweep.
- **`mission-shell.tsx` coupling** — 4a removes its **7 files'** imports of `Mission*` (of the ~23 total importers), leaving ~16 consumers (the four 4b panels + telemetry/chat/tickets/copilot/user-guide/workspace/memory-card); 4b removes 4 more, the rest fall in Phases 5–7, and the file is purged in Phase 8. No behavioral coupling is changed.
