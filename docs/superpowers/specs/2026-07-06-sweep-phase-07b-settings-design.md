# v3.4.0 Aesthetic Sweep — Phase 7b (Settings + proactive-controls) Design

- **Document date:** 2026-07-06
- **Status:** Approved scope (Rocky decisions 2026-07-06: single PR / internal waves; recompose the orphaned `proactive-controls` in place + flag for Phase 8; delete the `amoled-menu-surface` recipe in 7b's final wave) → ready for `writing-plans`
- **Branch:** `feat/v3.4.0-sweep-phase-07b-settings` (off `main` `c4f4064`)
- **Canonical references:** `DESIGN.md` (Command Console / Carbon Pro), `docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` (sweep ladder; Phase 7 = Ops + Settings), `docs/superpowers/specs/2026-07-05-sweep-phase-07a-ops-surfaces-design.md` (the 7a Ops spec that split Phase 7 and pre-scoped this phase), `docs/superpowers/specs/2026-07-04-sweep-phase-05b-06-work-comms-design.md` (the recomposition playbook this phase inherits verbatim)
- **Precedent:** Phases 1–7a all merged to `main` (7a = `c4f4064`). Phase 7b is the ladder's **final recompose row** before the Phase 8 purge.

---

## Goal

Recompose the **Settings cluster** — `settings-view` shell + 15 sections + 4 dialogs + `provider-card` + `proactive-controls` — onto the Command Console / Carbon Pro design system, retire the `amoled-menu-surface` legacy recipe (its last consumer is the Settings shell), and evict `brand-selected` from its final six consumers. **Visual-only, zero behavior/IPC/data change, every E2E/a11y/scroll-target selector preserved.** After this phase, **every renderer surface is swept** — no `mission-shell`, no `amoled-menu-surface`, no `brand-selected`, no legacy `Card`-in-settings composition remains — and the Phase 8 purge gate (delete legacy classes/fonts/`mission-shell` + Day-Shift polish + release tags) is fully reachable.

## Context — the Phase 7 split (Rocky, 2026-07-05)

Full Phase 7 was ~30 source files / ~9.1k LOC — nearly double the combined 5b/6 PR. Per the 4a/4b and 5a/5b precedents Rocky approved a split:

- **7a (merged, `c4f4064`): Ops surfaces** — Telemetry + Audit + Vault. Killed the last four `mission-shell` consumers and established the Recharts→console chart theme.
- **7b (this spec): Settings** — the long-tail forms/tables/dialogs cluster.

**Scope-discovery census (2026-07-06, verified at source):**

1. **Source-file inventory = exactly 22 files.** `settings-view.tsx` (shell) + **15** `*-section.tsx` + **4** dialogs + `provider-card.tsx` + `features/proactive/proactive-controls.tsx`. The "10–11 sections" cited in the master ladder was a user-facing grouping; the accurate file-level count is **15 section files**. Total ≈ **7,072 LOC** (7a estimated ~21 files / ~6.4k; `proactive-controls` + the fourth dialog push the real figure higher).
2. **`Mission*` primitives appear in ZERO settings files.** Confirmed against the 7a census (`mission-shell` importers were only the 4 telemetry files). Settings' legacy vocabulary is: shadcn `Card`, `brand-selected`, `amoled-menu-surface`, hand-rolled toggles, raw `<select>`, and raw palette — never `Mission*`.
3. **`brand-selected` consumers = exactly 6 sections:** `privacy` (6× — a tier chooser), `runtime`, `memory`, `permissions`, `extensions`, `portability`. 7b evicts all six; after this phase `brand-selected` has **0** consumers.
4. **`amoled-menu-surface` consumers = exactly 1:** `settings-view.tsx` (audit-view was its other consumer, swept in 7a). Sweeping the shell here makes 7b the phase that "sweeps its last consumer first," so the recipe is deleted in this PR (Rocky-confirmed 2026-07-06).
5. **Form atoms are already console-styled (Phase-1 foundation).** shadcn `<Input>` renders `.well-input`; `<Switch>` renders the bat-lever (`.switch-track`/`.switch-thumb`); `rag-section`'s threshold already uses `.brand-range`. **Two raw exceptions remain:** `rag-section`'s hand-rolled `<button role="switch">` master toggle, and raw `<select>` elements in `provider-card` + all 4 dialogs. These normalize to `<Switch>` / console-retinted `<select>` respectively — same element identity, same `id`/`aria`/options.
6. **Four semantic color maps** re-tone in place (the 7a `EVENT_TYPE_COLORS` / `levelPalette` precedent, repeating): `provider-card` `TIER_STYLE`, `rag` status badges, `extensions` `permissionBadgeClass`, `portability` `readinessTone`/`actionTone`. Their **values** map to the LED family; every key, label, and non-color contract is untouched.
7. **`proactive-controls.tsx` has ZERO importers** — no component or hook (`useDecomposeGoal`/`useScanForWork`) reference exists in the renderer. `extensions-section` re-implements the proactive toggle inline rather than mounting `<ProactiveControls>`. The 7a spec's "renders inside extensions-section" note is stale. Per Rocky (2026-07-06) it is **recomposed in place** for post-phase vocabulary consistency and **flagged in the PR as a Phase-8 dead-code deletion candidate** (delete-vs-wire is a behavior decision, out of scope for a visual-only phase).
8. **No genuine live `0–1` ratio exists in this cluster** — bounded numerics (orchestrator slots, provider caps, budget/step/token/timeout knobs) are *typed setting targets*, not measurements. **Phase 7b ships ZERO VuMeters and ZERO interaction changes** (anti-slop: no fabricated meters; converting a number input to a gauge/slider would break element-identity + the visual-only invariant). `rag`'s existing threshold slider stays a slider (already `.brand-range`).

## Scope decisions

1. **One branch, one PR, one CR-7 wall, five internal waves** (A→E) — waves preserve reviewability exactly as 7a's A/B/C/D did. (Rocky decision 2026-07-06 vs a two/three-PR split.)
2. **Strictly visual-only.** The 4a/4b/5a/5b6/7a invariant verbatim: zero behavior / IPC / data / query / store / hook / draft-commit / clamp / sort / filter / export change. Text content, element identity, child ordering, and every `data-*` / `aria-*` / `role` / `htmlFor` / `id` contract preserved. Decorative-only wrappers may be removed.
3. **Form atoms untouched; composition recomposed.** 7b does not re-style `<Input>`/`<Switch>`/`.brand-range` (Phase-1 already did). It recomposes the shells, cards, headers, states, choosers, and palette around them. The two raw exceptions (§census-5) normalize to the existing console form primitives.
4. **Zero VuMeters, zero interaction changes** (§census-8). Number inputs stay number inputs; value readouts become LCD-well display figures (`--display-fg tabular-nums`). rag's threshold slider stays.
5. **Semantic tone maps re-tone in place** (§census-6). Values map to `--led-go` / `--led-scope` / `--led-warn` / `--led-nogo` / `--armed`; keys/labels/contracts untouched. Tier semantics preserved (green=local safe, blue=open-source, amber=proprietary) — the documented `.brand-selected` color-variant meanings, now expressed in LED tones.
6. **`brand-selected` exits all 6 sections** (§census-3). Chooser selection → armed selection on **chassis rows** (`border-[var(--armed-edge)] bg-[var(--armed-soft)]`) or `.cap-select` for cap-style pickers — never tinted on a `.well` (lesson 33).
7. **`amoled-menu-surface` recipe deleted in 7b, Wave E** (§census-4), after the shell is swept — the "whichever sweeps its last consumer first" rule; the 7a spec pre-assigned this deletion here.
8. **`proactive-controls.tsx` recomposed in place, flagged for Phase 8** (§census-7).
9. **Displays-stay-dark both shifts** (lesson 29): anything inside a well / stat / figure / payload reads `var(--display-fg)` — never `text-foreground`, `text-muted-foreground`, or `text-silver-*`.

## Scope

### In — Wave A: Shell (1 file)

| File | LOC | Recompose weight |
|---|---|---|
| `features/settings/settings-view.tsx` | 115 | `amoled-menu-surface bg-black` root → console layout (`bg-background` root; `Faceplate` header carrying the "Settings" title + subtitle via kicker/`StripeHeader`); `text-h1`/`text-body-sm` → type-scale tokens. **Preserved verbatim:** all 15 `data-settings-section="…"` scroll targets, the `settingsFocusSection` scroll-into-view effect, every `ErrorBoundary` wrapper and its `componentName`, and section child ordering. |

### In — Wave B: System-knob sections (7 files, ~1,461 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `agentic-section.tsx` | 215 | 3 number-knob rows (maxSteps/maxTokens/timeoutMs) → `Faceplate` + well; readouts → display figures; `Skeleton`/error/`isError` banner → `SubviewState`; raw `text-red-400 bg-red-500/10` → tokens; `Loader2` saving spinner kept. |
| `concurrency-section.tsx` | 208 | Orchestrator-slots row + per-provider-kind cap grid → well rows; `bg-surface-50` panel + `bg-background/40` sub-cards → wells; empty-kinds notice + states → `SubviewState`; `htmlFor`/`id` per kind preserved. |
| `permissions-section.tsx` | 407 | `brand-selected` chooser → armed chassis; shadcn Dialog/Select → console; states → `SubviewState`. **264-line co-located test may pin composition → red→green; behavior/aria pins stay verbatim-green.** |
| `privacy-section.tsx` | 117 | **6× `brand-selected`** privacy-tier chooser → armed chassis rows (heaviest single chooser re-map in the phase). |
| `runtime-section.tsx` | 122 | `brand-selected` strategy chooser → armed chassis; `bg-surface-50` panel → well. |
| `planner-section.tsx` | 260 | Guardrail knob rows → well; readouts → display figures; states → `SubviewState`; raw palette → tokens. |
| `updater-section.tsx` | 132 | Update status + check/download actions → `Faceplate` + `LampTile` (status) + `.cap` (actions); raw palette → tokens. |

### In — Wave C: AI & data sections (7 files, ~2,645 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `rag-section.tsx` | 625 | Heaviest config. Master-toggle card + **raw `<button role="switch">` → shadcn `<Switch>`** (bat-lever; `aria-checked`/`aria-label`/`id="rag-enabled-toggle"` preserved); embedding provider/model/dimension inputs; Top-K (number) / Threshold (**slider stays** `.brand-range`) / Max-tokens (number); Index-Stats card → `MetricTile`s + status `LampTile`; Maintenance rebuild/delete inline-confirm rows → chassis rows + `.cap`; **17 raw-palette hits (green/red/amber feedback + status badges) → tokens / `LampTile`.** |
| `enhanced-ai-section.tsx` | 459 | 9 raw-palette hits → tokens; shadcn `Card`s → `Faceplate`/wells; toggle/knob rows → well rows; states → `SubviewState`. |
| `copilot-section.tsx` | 338 | 5 raw-palette → tokens; knob/toggle rows → wells; states → `SubviewState`. |
| `extensions-section.tsx` | 521 | Most complex section. 4 shadcn `Card`s (`CardHeader`/`Content`/`Title`/`Description`) → `Faceplate`s; `brand-selected` autonomy chooser (3 modes) → armed chassis; inline proactive toggle + Active/Queued/Scan status → well + `MetricTile`s + `.cap`; **`permissionBadgeClass` (allow/deny/prompt = brand/red/amber) re-toned to LED family**; pending-review + active-grant lists → `RecessedWell` display rows; `Badge` counts → `Tag`. **Preserved:** `data-extensions-authority-stable`, `data-extension-add-skill`, `data-extension-add-mcp`, hosted `<InstallSkillDialog>`/`<ImportMcpDialog>`. |
| `backup-section.tsx` | 218 | 9 raw-palette → tokens; backup/restore actions → `.cap`; progress/result states → `SubviewState`/`LampTile`. |
| `memory-section.tsx` | 209 | `brand-selected` → armed chassis; memory list → display rows; states → `SubviewState`. |
| `proactive-controls.tsx` | 275 | **Orphan (0 importers) — recomposed for consistency, flagged Phase-8 delete candidate.** `Card` → `Faceplate`; `Skeleton`/error → `SubviewState`; Active/Queued/Last-Scan rows → `MetricTile`/display rows; autonomy `Badge` → `Tag`/`LampTile`; Scan button → `.cap`; raw `text-red-400`/`bg-muted` → tokens. Exported `useDecomposeGoal`/`useScanForWork` hooks untouched. |

### In — Wave D: Portability + Providers + dialogs (7 files, ~2,851 LOC)

| File | LOC | Recompose weight |
|---|---|---|
| `portability-section.tsx` | 1082 | Heaviest file in the phase. Cloud-workspace link/reconnect/unlink + company templates (export/install) + workspace package export + company package import (preview/plan/secret-binding) + operator invites + sharing readiness. **4 semantic maps re-toned:** `readinessTone` (ready/warning/blocked = emerald/amber/red), `actionTone` (create/rename/replace/skip = emerald/amber/brand/neutral), `modeLabel`/`modeDescription`, plus the `brand-selected` `OPERATOR_AUTH_MODES` chooser → armed chassis. Forms/lists/preview panels → wells + armed rows + `.cap`; `emerald`/`amber`/`red`/`brand`/`white/10`/`black/10` palette → LED family + tokens. |
| `provider-card.tsx` | 428 | Card shell (`bg-surface-50`) → `Faceplate`; **`TIER_STYLE` (local/open-source/proprietary = green/blue/amber) re-toned**; raw `<select>` Ollama model picker (with `optgroup`s) → console-retinted select (tokened border/bg, `id`/options preserved); enabled toggle-button + Test + Remove → `.cap`; connection status text (Connected/Failed/Error) → tokens / `LampTile`; `Badge` kind/tier → `Tag`. |
| `providers-section.tsx` | 65 | Thin list host + Add-Provider entry point → `Faceplate` header + `.cap`; renders `<ProviderCard>` list + `<AddProviderDialog>`. |
| `add-provider-dialog.tsx` | 297 | Hand-rolled panel (`bg-background p-6 shadow-xl` + `bg-black/50` backdrop) → machined-plate console dialog; 2 raw `<select>`s (kind, tier) → console-retinted select; footer buttons → `.cap`; `text-destructive` error → token. `open`/`onOpenChange`/form submit/reset preserved. |
| `import-mcp-dialog.tsx` | 389 | Same dialog idiom; MCP import form + fields/lists → console; selects/inputs retinted; buttons → `.cap`. |
| `install-skill-dialog.tsx` | 290 | Same dialog idiom; skill install form → console. |
| `grant-authority-dialog.tsx` | 300 | Same dialog idiom; authority scope/permission chooser + selects → console; buttons → `.cap`. |

### In — Wave E: Cross-file guard + recipe purge (no new source files)

- **New** `features/settings-cluster-sweep.test.ts` — the 5a/7a source-string-pin harness. Per-file console-present + legacy-absent + selectors-preserved blocks are added by the task that sweeps each file; the **cross-file legacy-absence guard lands LAST** (lesson 5: global pins land last). Forbidden set (repo-wide across the 22 files): `amoled-menu-surface`, `brand-selected`, `from '@/components/ui/card'` in settings, `bg-surface-50` (verified absent from every 7a-swept file), and raw palette (`text-red-4`, `bg-red-5`, `text-green-4`, `bg-green-`, `text-amber`, `emerald`, `text-blue-4`, hex literals). **Not forbidden** (current Carbon foundation, not legacy): the `text-h*`/`text-body*`/`text-caption` type-scale tokens; retinted shadcn `<Input>`/`<Switch>` + `.brand-range`; and the modal-scrim `bg-black/NN` (the shadcn `DialogOverlay` primitive itself uses `bg-black/80`, so the 4 dialogs' backdrops keep it — only `settings-view`'s `amoled-menu-surface … bg-black` chassis shell is legacy, and the `amoled-menu-surface` guard already catches that).
- **Delete the `amoled-menu-surface` recipe** from `styles/globals.css` (its last consumer, `settings-view`, is swept in Wave A).
- **Red→green** updates to the existing pinned tests where they assert composition/color: primarily `permissions-section.test.tsx` (264) and `extensions-section.test.tsx` (128); `concurrency`/`memory`/`copilot`/`portability`/`provider-card` tests updated only where they pin swept classes. All behavior/hook/aria assertions stay verbatim-green.

### Out

- **`mission-shell.tsx` + `mission-shell.test.tsx` deletion, legacy class/font purge, CLAUDE.md legacy-section removal** — Phase 8's zero-usage grep gate.
- **`proactive-controls.tsx` delete-vs-wire decision** — flagged in the 7b PR; resolved in Phase 8 (behavior change, not visual).
- **No behavior / IPC / data change** — hooks, mutations, query wiring, store usage, draft/commit logic, clamps, sort/filter, export/import logic untouched.
- **No structural file-split, no new console primitives, no VuMeters, no interaction changes** (7b composes from the existing `components/console/` library only).
- **Marketplace-install flow** (already removed from `extensions-section` per its own note) — not reintroduced.

## Approach — recompose onto existing console primitives

1:1 mapping inherited from 4a/4b/5a/5b6/7a (primitives verified against `components/console/` source 2026-07-06 — `LampTone = 'off' | 'go' | 'hold' | 'warn' | 'nogo' | 'exec' | 'armed'`; `SubviewState(lampLabel, lampTone, title, description?, action?, children?, testId?, className?)`; `MetricTile(label, value, hint?, icon?, tone?: 'amber'|'red', onClick?)` spreads `data-*`; `Faceplate(kicker?, serial?, bodyClassName?, stripeSlot?)`; `RecessedWell` spreads `data-*`; `Tag(mono?)`):

| Current (legacy / shadcn / raw) | → Console replacement |
|---|---|
| `amoled-menu-surface bg-black` shell | plain console layout (`bg-background` root; `Faceplate` carries header depth) |
| shadcn `Card`/`CardHeader`/`CardContent`/`CardTitle`/`CardDescription` | `Faceplate` (+ `StripeHeader` kicker) wrapping a well body |
| `text-h1`/`text-h2`/`text-h3` section headers | `Faceplate` kicker / type-scale tokens |
| `bg-surface-50` / `bg-background/40` / `bg-muted/*` panels | `RecessedWell` / chassis rows |
| `brand-selected` chooser cards | armed chassis selection (`border-[var(--armed-edge)] bg-[var(--armed-soft)]`) or `.cap-select` |
| hand-rolled `<button role="switch">` (rag) | shadcn `<Switch>` (bat-lever; a11y attrs preserved) |
| raw `<select>` (provider-card, dialogs) | console-retinted `<select>` (tokened border/bg, `.well-input` sizing; `id`/`aria`/options preserved) |
| `Skeleton` / ad-hoc spinner / error `div` | `SubviewState` (loading / nogo, data-state via `testId`/wrapper) |
| status `Badge` (Enabled/Indexing/…) | `LampTile` word-lamp (stencil 2–6 chars: GO / STBY / OFF / LIVE) |
| category/kind/count `Badge` | `Tag` (`mono` for ids/counts) |
| count/metric tiles (`bg-muted/20` grids) | `MetricTile` |
| number-input value readouts | LCD-well display figures (`--display-fg tabular-nums`) |
| semantic tone maps (`TIER_STYLE`/`permissionBadgeClass`/`readinessTone`/`actionTone`) | LED-family tone values (`--led-go`/`--led-scope`/`--led-warn`/`--led-nogo`/`--armed`) — keys/labels untouched |
| raw palette (`text-red-4`, `bg-red-5`, `emerald`, `amber`, `blue-4`, hex) | `--led-*` / `--armed` / display tokens |
| action `Button`s | `.cap` (sized: `px-3 py-1.5 text-button-sm` or icon `p-1.5`) |
| hand-rolled dialog panel | machined-plate console dialog (`--carbon-850` plate, `--hairline-strong` border, `--r-inset` radius); backdrop kept |

## Contract preservation + test mechanism

- **Selectors are law** (verified at source): all 15 `data-settings-section` values; `data-extensions-authority-stable`, `data-extension-add-skill`, `data-extension-add-mcp`; every input `id`/`htmlFor`/`aria-label`; rag toggle `role="switch"` + `aria-checked` + `id="rag-enabled-toggle"`; every slider `aria-valuemin/max/now`; dialog `open`/`onOpenChange`; `ErrorBoundary` `componentName`s. Preserved verbatim.
- **Displays-stay-dark** both shifts — wells/stats/figures/payloads read `--display-fg`, never `text-foreground`/`silver`/`muted-foreground` (lesson 29).
- **Tests = source-string pins** (`settings-cluster-sweep.test.ts`, the 5a/7a harness; node env, pure string assertions — Settings has no jsdom/@testing-library renderer stack, sections are E2E-covered). Per-file console-present + legacy-absent + selectors-preserved blocks grow with each task; cross-file legacy-absence guard lands last.
- **Existing pinned suites** update red→green only where they assert swept composition/color; behavior/hook/aria assertions stay verbatim-green.
- **No-mix:** post-phase all 22 files use console composition exclusively; `amoled-menu-surface`, `brand-selected`, and settings-`Card` consumer counts each hit **0** (asserted by the Wave-E guard).
- **`.cap` is a padding-free visual recipe** — every caller sizes itself. **`.nav-tile` segmented buttons** keep `aria-pressed` + `data-*`. **Never build class names with template literals** (lesson 28 — Tailwind purge): static maps only.

## Delivery

Spec → plan (`writing-plans`) → per-task TDD red→green (Biome `pnpm lint` · `pnpm lint:eslint` 0-err/0-warn · `pnpm typecheck` · `pnpm test`/scoped vitest, FULL suite at the wave-closing tasks; commit only on green) → **real-renderer verification** (bat-lever swap, retinted selects, semantic-tone maps, dialogs) → `/design-review` audit against the anti-slop checklist → **dual-shift screenshot pack** (all 15 sections × Night Ops + Day Shift, plus each of the 4 dialogs open; the orphan `proactive-controls` gets a note, not a shot, absent a harness mount) → PR → full **CR-7 wall** (Stage 1 CI · Stage 2 `/review` · Stage 3 Codex, Rocky-triggered, any HIGH/[P1] blocks · Stage 4 Rocky sign-off → squash-merge). **No version bump** (v3.4.0 tags at Phase 8).

**Execution runs fully inline — no subagents** (Rocky's standing rule for this repo), overriding the 7a spec's delegatable-to-`elite-executor` note. The test contract is authored centrally and every diff is reviewed, gated, and committed centrally regardless.

Commits: imperative subject describing the change (never placeholders), trailer on every commit:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Per-phase definition of done (inherited)

1. **CI Stage 1 green** — typecheck, Biome, ESLint, tests ×3 OS, Electron E2E smoke, claim-evidence audit. E2E passes **unchanged**.
2. **`/design-review` skill audit** against DESIGN.md's anti-slop checklist → all findings fixed.
3. **Screenshot pack** — every swept section × Night Ops + Day Shift + all 4 dialogs → Rocky's eyeball sign-off.
4. **CR-7 wall** — `/review` (Stage 2) → Codex (Stage 3, Rocky-triggered; any HIGH/[P1] blocks) → Rocky sign-off (Stage 4) → squash-merge.

## Risks / open items

- **Semantic-tone-map fidelity (4 maps).** `provider-card` `TIER_STYLE`, `rag` status badges, `extensions` `permissionBadgeClass`, and `portability` `readinessTone`/`actionTone` carry meaning in color. Re-tone MUST preserve the semantic partition (safe/local → go; open/informational → scope; caution/proprietary/pending → warn; fail/blocked/deny → nogo; active/command → armed) and MUST NOT touch keys, labels, or non-color logic. Confirmed at `/design-review`.
- **`brand-selected` → armed-chassis on opaque surfaces (lesson 33).** The 6 choosers must land the armed tint on chassis rows, never on a `.well` (invisible on opaque `background-image`). Privacy's 6× chooser is the highest-density case.
- **rag toggle swap is the one atom change.** Replacing the hand-rolled `<button role="switch">` with `<Switch>` must preserve `aria-checked`, `aria-label`, `id`, `disabled`, and the `handleToggle` wiring exactly — verified on the real renderer.
- **Retinted raw `<select>` legibility both shifts.** Native `<option>`/`<optgroup>` styling is OS-controlled; only the closed control is tokened. Checked on Day Shift for contrast; `optgroup` structure preserved (provider-card, dialogs).
- **`permissions`/`extensions` test scale.** The 264-line + 128-line suites mix composition pins with behavior/aria pins; red→green updates touch only swept classes and MUST NOT alter behavior/aria assertions.
- **`portability` is 1082 LOC.** The single largest recompose; its wave-D task is the phase's heaviest and should be split into sub-steps in the plan (cloud-link / templates / import-preview / operators) to keep each TDD cycle reviewable.
- **Screenshot-pack volume.** 15 sections × 2 shifts + 4 dialogs ≈ 34 shots. Capture NEVER concurrent with the vitest suite (lesson 32). Sections needing seeded state (providers, extensions grants, portability templates, rag stats) seed via the E2E test-mode direct-IPC recipe.
- **`proactive-controls` has no screenshot** (unmounted). Its recompose is verified by source-pin + typecheck only; noted in the pack as a Phase-8 dead-code candidate.
- **60 fps** — depth recipes on containers only; long lists (extension grants, portability plan actions, provider cards) stay flat interactive rows inside one well (no per-row gradient stacks).
