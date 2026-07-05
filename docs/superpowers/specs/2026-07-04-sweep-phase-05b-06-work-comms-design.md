# v3.4.0 Aesthetic Sweep — Phase 5b/6 (Work Remainder + Comms & Guide) Design

- **Document date:** 2026-07-04
- **Status:** Approved scope (Rocky directive 2026-07-04: "the next sweep target after this merges is the remaining Work/Comms clusters (Phase 5b/6)") → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-05b-06-work-comms` (off `main` `0ae0cbd`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 5 = Work surfaces, Phase 6 = Comms + Guide), `docs/superpowers/specs/2026-06-28-sweep-phase-05a-boards-planning-design.md` (the recomposition playbook this phase inherits verbatim)
- **Precedent:** Phases 1–5a all merged to `main` (5a = `a35d7a3`). This phase completes **Phase 5 (Work surfaces)** and executes **Phase 6 (Comms + Guide)** in one combined branch/PR per Rocky's directive.

---

## Goal

Recompose the **remaining Work surfaces** (Meetings, Org Chart, Hire) **and the entire Comms + Guide cluster** (Chat + chat drawer, thread memory card, Copilot, User Guide) onto the Command Console / Carbon Pro design system. **Visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved.** After this phase, the only remaining `mission-shell` consumers in the renderer are the four Telemetry files (Phase 7), leaving a clean runway to the Phase 8 purge.

## Context

The 5a spec (2026-06-28) split Phase 5 into 5a (Projects + Tickets, merged) and **5b = Meetings + Org Chart + Hire — 10 files, ~1,758 LOC, shadcn-clean**. The master ladder defines **Phase 6 = Comms + Guide** (chat + chat-drawer, copilot UI, user-guide-view). On 2026-07-04 Rocky directed both be taken together as the next target; combined they are **21 files, ~4,870 LOC** — comparable to 5a's 16 files once weighted by recompose difficulty (10 of the 21 are shadcn-clean vocabulary swaps).

Scope discovery findings (2026-07-04 inventory):

1. **`features/memory/thread-memory-card.tsx` (207 LOC) joins the phase.** It is a heavy `Mission*` consumer (`MissionInsetSurface`, `MissionPill`) rendered inside **both** the chat drawer (this phase) **and** the 5a-swept `ticket-detail.tsx` — the tickets screen is currently mixing composition families through this shared child (a known deferral: the 5a spec listed "memory-card" under Phases 6–7). Sweeping it now heals the 5a screen and is mandatory for the drawer (no-mixing rule).
2. **`workspace-switcher.tsx` is a false positive** — its only `mission-` hit is a doc comment; Phase 2 swept it correctly. Not in scope.
3. **Post-phase legacy census:** after this phase the only `mission-shell` consumers are `features/telemetry/*` (4 files, Phase 7); remaining `brand-selected` consumers are `audit-view` + 6 settings sections (Phase 7). The Phase 8 zero-usage grep gate becomes reachable in one more phase.
4. **The Files tab (VaultView) is Phase 7** per the master spec ("Ops + Settings … Telemetry, Audit, Vault") — explicitly out of this phase.
5. **No screen in this scope uses charts/Recharts/SVG viz** — cards, lists, transcripts, and forms only. No chart-styling problem (as in 4b/5a).

## Scope decisions

1. **One combined sub-phase (5b/6), one branch, one PR, one CR-7 wall** — per Rocky's 2026-07-04 directive. Waves inside the plan preserve reviewability (org → people → chat → copilot → guide).
2. **Strictly visual-only.** The 4a/4b/5a invariant exactly: zero behavior / IPC / data / query / store / hook change. Text content, element identity, and child ordering preserved (decorative-only chrome wrappers, e.g. the `mission-grid` overlay div, may be removed — the established recompose norm).
3. **Instrumentation: real ratios only.** Exactly **one** genuine `0–1` ratio exists in this cluster's current data: the User Guide checklist completion `summary.completed / summary.total` (already computed for `percentLabel`). It receives the phase's only `VuMeter` (`variant="progress"`, guarded). Every other numeric is a count → `MetricTile`/`Tag`; no fabricated meters.
4. **Streams follow DESIGN.md §Surfaces + §Type:** token-stream content (live streaming bubble text, code fences) uses the Phase-3 shipped stream recipe — `whitespace-pre-wrap rounded-inset bg-[var(--void)] px-3 py-2 text-code-sm leading-relaxed text-[var(--display-fg)]` (`stream-view.tsx:46`). Conversation prose stays Public Sans inside recessed wells with `--display-fg` (wells are display surfaces — dark in both shifts).
5. **Red = LIVE (ON AIR).** A live meeting and the composer's "Live" state are `armed`-tone lamps burning steady; blinking stays reserved for unacknowledged alerts (AnnunciatorRail). The employee status dot reuses the Phase-2 swept sidenav mapping verbatim (`thinking → --armed-lit animate-pulse-slow`, `blocked → --led-hold`, `error → --led-warn`, idle → `--graphite`), with an LED-square shape (`rounded-sm`) since `rounded-full` is pinned out of this cluster.
6. **Extraction: inline-first.** The bubble treatment shared by `message-list` and `meeting-detail` is the only duplication candidate; judged after Wave C against the "factors cleanly" bar — not pre-built.

## Scope

### In — Wave A: Org Chart (6 files, ~1,035 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/orgchart/org-chart-view.tsx` | 265 | 4 ad-hoc states → `SubviewState`; header → `Faceplate`/`StripeHeader`; toast (`<output>` element kept) |
| `features/orgchart/org-chart-node.tsx` | 204 | `levelPalette` raw palette → console-token values (keys pinned by tests); fire button + manager `<select>` |
| `features/orgchart/employee-profile-dialog.tsx` | 292 | `fieldClass` → `.well-input`; error color |
| `features/orgchart/promote-dialog.tsx` | 112 | select → `.well-input`; error color |
| `features/orgchart/fire-dialog.tsx` | 84 | input → `.well-input`; error color |
| `features/orgchart/org-chart-tree.tsx` | 78 | already clean — cross-file guard only |

### In — Wave B: Meetings + Hire (4 files, ~723 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/meetings/meetings-view.tsx` | 196 | Live/Ended badge → `LampTile` (`armed`/`off`); rows → wells; states → `SubviewState` |
| `features/meetings/meeting-detail.tsx` | 166 | header lamp; transcript bubbles → display wells; composer → `.well-input` |
| `features/meetings/call-meeting-dialog.tsx` | 139 | custom overlay → console scrim + `Faceplate` |
| `features/hire/hire-dialog.tsx` | 222 | role chooser cards → raised-control armed selection; `Badge` → `Tag` |

### In — Wave C: Chat (7 files, ~1,719 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/chat/system-agent-badge.tsx` | 46 | pill shape → console radius; brand tint retained |
| `features/chat/composer.tsx` | 108 | `mission-chrome-panel` → well; Queue/Live → `LampTile`; send → `.cap-armed` |
| `features/chat/message-list.tsx` | 191 | bubbles → display wells; stream recipe; steady armed live LED |
| `features/memory/thread-memory-card.tsx` | 207 | `MissionInsetSurface`/`MissionPill` → `RecessedWell`/`LampTile`/`Tag`/`MetricTile` |
| `features/chat/thread-list.tsx` | 252 | `MissionPill` → `Tag`/lamps; kind chips; armed row selection |
| `features/chat/chat-view.tsx` | 241 | 8 `Mission*` primitives → console (the tickets-view playbook) |
| `features/chat/chat-drawer.tsx` | 674 | `mission-shell`/`mission-grid` + 4 `MissionSheetHeader` views → console sheet idiom |

### In — Wave D: Copilot (3 files, ~826 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/copilot/copilot-insight-card.tsx` | 259 | `SEVERITY_META` raw palette → LED vars; severity → `LampTile`; category → `Tag` |
| `features/copilot/copilot-dashboard-widget.tsx` | 103 | section → `.faceplate` recipe (keeps element identity + selectors) |
| `features/copilot/copilot-sidebar.tsx` | 464 | `MissionSegmentedButton` → `.nav-tile` (aria-pressed + data-* kept); states → `SubviewState` |

### In — Wave E: User Guide (1 file, 525 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `features/user-guide/user-guide-view.tsx` | 525 | 10 `Mission*` primitives → console; the phase's single `VuMeter` (checklist ratio) |

Plus one new cross-file source-pin test: `features/work-comms-cluster-sweep.test.ts`.

### Out

- **`mission-shell.tsx` itself** — untouched; purged in Phase 8. This phase removes these files' imports; the four Telemetry consumers fall in Phase 7.
- **`features/memory/memory-formatters.ts`** — logic file, untouched. Its Mission-tone return values (`'default' | 'accent' | 'warning' | 'danger'`) are bridged to `LampTone` inside `thread-memory-card.tsx` via a local map.
- **Telemetry, Audit, Vault (Files tab), Settings** — Phase 7.
- **No behavior / IPC / data change.** Hooks, mutations, query wiring, store usage untouched.
- **No structural file-split** — visual-only, even for the 674-LOC drawer (same discipline as 5a's 843-LOC schedule-view).
- **New-data-feed VUs** — out (e.g. a meeting elapsed-duration meter would require net-new computation).

## Approach — recompose onto existing console primitives

1:1 mapping inherited from 4a/4b/5a, applied to the people + comms surfaces. Primitives verified in `components/console/` (props confirmed against source 2026-07-04 — note `StripeHeader`'s trailing slot is `children`; only `Faceplate` takes `stripeSlot`):

| Current (legacy / shadcn) | → Console replacement |
|---|---|
| `MissionMetricTile`; memory card's 3 stat blocks | `MetricTile` (spreads `data-*`) |
| `MissionStateBlock`; ad-hoc spinner/error/empty blocks | `SubviewState` (state attr on wrapper `<div>`) |
| `MissionPill` / status chips — encodes **status** (Live/Ended, freshness, checkpoint kind, severity, signal health, queue mode) | `LampTile small` word-lamp |
| `MissionPill` / chips — **category/label/timestamp/count** | `Tag` (`mono` for ids/timestamps/counts) |
| `MissionInsetSurface` / `mission-chrome-panel` cards, rows, bubbles | `RecessedWell` (spreads `data-*`) / `.well` on interactive elements |
| `MissionPageShell` + `MissionHero` / `MissionSectionCard` / `MissionRailCard` | root `<div>` + `Faceplate` + `StripeHeader` (the shipped `tickets-view.tsx` idiom) |
| `MissionSheetHeader` (4 drawer views + copilot) | sheet-header block: `StripeHeader` kicker + preserved `SheetTitle` + description + `.cap` leading/trailing buttons |
| `MissionIconButton` / inline icon buttons | `.cap` (send/ask actions: `.cap-armed`; `.cap-chrome` stays reserved) |
| `MissionSegmentedButton` (copilot filters, guide role track) | `.nav-tile` / `.nav-tile-active` (aria-pressed + `data-*` preserved) |
| `MissionControlRow` | plain flex `<div>` |
| ad-hoc field classes / native selects / textareas | `.well-input` |
| custom dialog overlay `bg-black/60` | `bg-[hsl(0_0%_0%/0.55)]` (the 5a-shipped scrim) |
| live token stream / code fences | Phase-3 stream recipe (`stream-view.tsx:46`), Iosevka via `text-code-sm`, `--display-fg` on `--void` |
| raw palette (emerald/amber/red/sky/fuchsia/blue/teal/slate/zinc) | `--led-go / --led-hold / --led-warn / --led-nogo / --led-info / --armed / --graphite` tokens |

## Contract preservation + test mechanism

- **Every E2E/a11y selector preserved verbatim** — this cluster is pin-dense. Existing source-pin suites that read these files and MUST stay green: `org-chart-view.test.tsx`, `org-chart-interactions.test.tsx` (pin `levelPalette` **keys**, all `data-org-chart-*`), `chat-view.test.tsx`, `chat-drawer.test.tsx` (pin drawer widths `sm:w-[720px]/xl:w-[820px]/2xl:w-[900px]`, `ThreadMemoryCard` titles, composer queue contract), `copilot-sidebar-export.test.tsx` (all `data-copilot-*` + `role="alert"`), `company-settings.test.tsx` (pins `data-hire-manager-select=""` in hire-dialog), `user-guide-shell.test.tsx` (pins wiring in App/store/sidenav — none of which this phase touches; the view file itself is unpinned by it).
- **Displays-stay-dark** in both shifts; wells/transcripts read `--display-fg`, never `text-foreground`.
- **No-mix:** post-sweep these 21 files use console composition exclusively. Sweeping `thread-memory-card` also removes the last legacy child inside 5a's `ticket-detail`.
- **Tests = source-string-pin** (`work-comms-cluster-sweep.test.ts` at features root, the 5a harness shape): per file console-present + legacy-absent + selectors-preserved, plus a cross-file guard. The forbidden set extends 5a's with `mission-grid` and `mission-state-block` (present in this cluster).
- **Meetings gains first-ever test coverage** via its source-pin blocks (it currently has none).

## Delivery

Spec → plan (`writing-plans`) → execution (per-task TDD red→green with Biome / typecheck / ESLint 0-0 / vitest gates; mechanical recomposes delegatable to `elite-executor` subagents — edit-only-this-file, no git/tooling, never read/traverse `~/.claude`, any `.claude/`, or any `agents/` directory — with the test contract authored centrally and every diff reviewed/gated/committed centrally). Then `/design-review` audit → dual-shift screenshot pack (seeded-UI capture flow incl. bolt-corner + Day-Shift well checks from the 5a lessons) → PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered · Stage 4 Rocky sign-off → squash-merge). No version bump (v3.4.0 tags at Phase 8).

## Per-phase definition of done (inherited)

1. **CI Stage 1 green** — typecheck, Biome, ESLint, tests ×3 OS, Electron E2E smoke, claim-evidence audit. E2E passes **unchanged**.
2. **`/design-review` skill audit** against DESIGN.md's anti-slop checklist → all findings fixed.
3. **Screenshot pack** — every swept surface × Night Ops + Day Shift → Rocky's eyeball sign-off.
4. **CR-7 wall** — `/review` (Stage 2) → Codex (Stage 3, Rocky-triggered; any HIGH/[P1] blocks) → Rocky sign-off (Stage 4) → squash-merge.

## Risks / open items

- **Pin density** — chat/copilot/org are the most test-pinned files in the repo. The plan pins every selector per file before recompose; the existing suites are run per wave, not just at the end.
- **Drawer weight** — 674-LOC `chat-drawer` recomposed visual-only in one pass; its four header views share one S7 idiom to avoid divergence.
- **Status-vs-category judgment** — thread-kind chips ("Agent conversation", "Ticket thread") are categories → `Tag`; freshness/checkpoint/severity/live-state are statuses → `LampTile`. Confirmed at `/design-review`.
- **`levelPalette` re-toning** — keys are test-pinned; values move to a monochrome silver rank ramp with `--armed` reserved for `officer` (command authority per DESIGN.md). Confirmed at `/design-review`.
- **Decorative-DOM removals** (`mission-grid` overlay, status-dot span collapses into lamps where the label text already exists) — each called out per task; behavior-bearing nodes never removed.
- **60 fps** — depth recipes on containers only, never on per-message bubbles inside the scrolling transcript (`.well` on bubbles is a flat recipe; verified on a long thread during the proof gate).
