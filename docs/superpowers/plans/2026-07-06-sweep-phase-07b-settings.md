# v3.4.0 Aesthetic Sweep — Phase 7b (Settings + proactive-controls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Execution runs fully inline — no subagents** (Rocky's standing rule for this repo); the test contract is authored centrally and every diff is reviewed, gated, and committed centrally.

**Goal:** Recompose the Settings cluster (`settings-view` + 15 sections + 4 dialogs + `provider-card` + orphaned `proactive-controls`; 22 files / ~7.07k LOC) onto the Command Console / Carbon Pro system, retire the `amoled-menu-surface` recipe, and evict `brand-selected` from its last six consumers — the final recompose rung before the Phase-8 purge.

**Architecture:** Per-file recompose onto the existing `components/console/` library (no new primitives). Contract = source-string-pin tests: a new `features/settings-cluster-sweep.test.ts` grows one per-file block per task (console-present + legacy-absent + selectors-preserved); the cross-file legacy-absence guard + `amoled-menu-surface` recipe deletion land LAST (Phase-3 lesson 5). Existing pinned suites (`permissions-section.test.tsx`, `extensions-section.test.tsx`, etc.) update red→green inside the task that sweeps their file. Visual-only, zero behavior change, every selector preserved.

**Tech Stack:** React 19 + TypeScript, Tailwind (console tokens in `styles/globals.css`), shadcn (Phase-1 restyled), Vitest source-string pins (node env), Biome + ESLint.

**Spec:** `docs/superpowers/specs/2026-07-06-sweep-phase-07b-settings-design.md`

## Global Constraints

- **Branch:** `feat/v3.4.0-sweep-phase-07b-settings` off `main` `c4f4064` (already created; the spec is committed at `ad6beee`). No version bump, no CHANGELOG entry (v3.4.0 tags at Phase 8).
- **Visual-only.** Zero behavior / IPC / data / query / store / hook / draft-commit / clamp / sort / filter / export change. Text content, element identity, child ordering, and every `data-*` / `aria-*` / `role` / `htmlFor` / `id` contract preserved. Decorative-only wrappers may be removed.
- **Form atoms are already console-styled (Phase-1).** Do NOT re-style shadcn `<Input>` (`.well-input`), `<Switch>` (bat-lever `.switch-track`/`.switch-thumb`), or `.brand-range` sliders. **Two raw exceptions to normalize:** the hand-rolled `<button role="switch">` toggles in `rag-section` (`id="rag-enabled-toggle"`) and `copilot-section` (`id="copilot-enabled"`) → shadcn `<Switch>` (preserve `id`/`aria-checked`/`aria-label`/`disabled`/handler); raw `<select>` in `provider-card`, `planner-section`, and `add-provider-dialog` → the console-select recipe (below), same `id`/`aria`/`<option>` set.
- **Zero VuMeters, zero interaction changes.** Number inputs stay number inputs; existing `.brand-range` sliders (rag threshold, enhanced-ai temperature + tracing) stay.
- **Displays-stay-dark both shifts (lesson 29):** anything inside a well / stat / figure reads `var(--display-fg)` — never `text-foreground`, `text-muted-foreground`, or `text-silver-*`.
- **Armed selection lives on chassis rows** (`border-[var(--armed-edge)] bg-[var(--armed-soft)]`), never tinted onto a `.well` (lesson 33).
- **`.cap` is a padding-free recipe** — every caller sizes itself (`px-3 py-1.5 text-button-sm`, or icon `p-1.5`). No bare `className="cap"`.
- **Never build class names with template literals** (lesson 28 — Tailwind purge): static maps only.
- **`Faceplate` spreads NO arbitrary DOM props** (Phase-3 lesson 2) → wrap any `data-*`-carrying element in a `data-*` `<div>`, not on `<Faceplate>`.
- **Untouchable files:** `features/mission/mission-shell.tsx`, `features/mission/mission-shell.test.tsx` (purged Phase 8), `features/memory/memory-formatters.ts`.
- **Gates per task:** from `apps/desktop` unless noted — `pnpm lint` (Biome) · `pnpm lint:eslint` (0 err / 0 warn) · `pnpm typecheck` · the scoped `pnpm vitest run …` named in the step (FULL `pnpm test` + `pnpm audit:claims:strict` at Task 23). Commit only on green.
- **Commits:** imperative subject describing the change (never placeholders); trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Use `git commit -F - <<'EOF'` heredoc via the Bash (Git Bash) tool — PowerShell here-strings mangle UTF-8.
- **Console primitives (verified 2026-07-06 against `components/console/index.ts`):** `LampTone = 'off'|'go'|'hold'|'warn'|'nogo'|'exec'|'armed'`; `SubviewState(lampLabel, lampTone, title, description?, action?, children?, testId?, className?)`; `MetricTile(label, value, hint?, icon?, tone?: 'amber'|'red', onClick?)` spreads `data-*`; `Tag(mono?)`; `Faceplate(kicker?, serial?, bodyClassName?, stripeSlot?)`; `StripeHeader` trailing slot is `children`; `RecessedWell` spreads `data-*`; `LampTile(small?, interactive?, label, tone, …)`.

---

## Canonical Section Recompose (CSR)

Wave-B/C sections share one legacy idiom (`<section className="space-y-3">` + `<h2 className="text-h2 text-foreground">` header + `Loader2` saving spinner + `rounded-lg border border-border bg-surface-50 p-4` panel + `text-label`/`text-code-sm tabular-nums` label/readout pairs + `Skeleton` loading + `text-red-400 bg-red-500/10` error). Each Wave-B/C task applies **CSR** and then lists only its file-specific deltas. CSR = the exact mapping below (do not re-derive per task):

| Legacy | → Console |
|---|---|
| `<section className="space-y-3" [data-*]>` root | keep the `<section>` **and any `data-*` on it**; body wrapped in `<Faceplate kicker="…" serial="…">` |
| `<h2 className="text-h2 text-foreground">Title</h2>` + description `<p className="text-body-sm text-muted-foreground">` | `<Faceplate kicker="<short descriptor>" serial="<SHORT-UPPER>">` **keeping** `<h2 className="text-h2 text-foreground">Title</h2>` inside the body (kicker/serial are small mono stripe labels, NOT the title — the 7a telemetry-view idiom), with description as `<p className="text-caption text-silver-mute">` |
| inline saving `Loader2 … aria-label="Saving"` (spinner) | `<LampTile small interactive={false} label="SYNC" tone="hold" />` rendered under the same `{isPending && …}` guard, wrapped in `<span aria-label="Saving">` (aria preserved; `animate-spin` removed) |
| `rounded-lg border border-border bg-surface-50 p-4` panel | `<RecessedWell className="space-y-4 p-4">` |
| sub-card `rounded-md border border-border bg-background/40` | inner `<div className="rounded-inset border border-[var(--hairline)] bg-[var(--void)]/40 …">` |
| `text-label text-muted-foreground` label | keep (current token) |
| `text-code-sm tabular-nums text-foreground` readout | `text-code-sm tabular-nums text-[var(--display-fg)]` (LCD figure) |
| `Skeleton` full-panel loading (in the `isLoading` early return) | `<SubviewState lampLabel="SYNC" lampTone="hold" title="Loading <thing>…" />` |
| error early-return `rounded-lg border border-red-400/30 bg-red-500/10 … text-red-400` | `<SubviewState lampLabel="NO-GO" lampTone="nogo" title="Failed to load <thing>." />` |
| inline save-error banner `rounded-lg bg-red-500/10 … text-red-400` | `<div className="rounded-inset border border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] px-3 py-2 text-body text-led-nogo">` (text content kept) |
| chooser cards `brand-selected` / idle `border-border bg-surface-50 …` | armed chassis: selected `border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground` / idle `border-[var(--hairline)] bg-transparent text-muted-foreground hover:border-[var(--hairline-strong)] transition-colors` — via a static map, keeping the `<button>`/`<label>`/radio + all `onClick`/`data-*`/`aria` |
| idle chooser Buttons `border-white/10 bg-black/10 hover:bg-black/20` | same armed-chassis idle recipe (drop the raw chrome) |
| status `Badge` (Enabled/Detected/Active) green LED family | `<LampTile small interactive={false} label="ON" tone="go" />` (Detecting → `label="SYNC" tone="hold"`; Disabled/Offline/None → `label="OFF" tone="nogo"`); the visible badge text is kept as an adjacent `text-caption` span |
| category / count `Badge variant="outline"` | `<Tag mono>…</Tag>` |
| raw `<select … className="h-8 … border border-border bg-background …">` | **console-select recipe:** `className="h-8 w-full rounded-inset border border-[var(--hairline-strong)] bg-[var(--void)] px-3 text-code-sm text-[var(--display-fg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"` — `id`/`value`/`onChange`/`disabled`/`<option>`/`<optgroup>` byte-identical |
| action `Button size="sm"` with legacy className overrides | **keep the Phase-1 restyled `<Button>` variant** (`outline`/`default`/`ghost`/`destructive` — already console-styled) and **strip only** the legacy overrides (raw palette, zinc, `border-white/10 bg-black/10`) — the 7a export-button idiom. Use a **raw `<button className="cap px-3 py-1.5 text-button-sm">`** (icon-only `cap p-1.5`; destructive `cap cap-warn`) ONLY for pagination / icon-only / segmented buttons where the machined-cap look is intended |
| `text-brand` accent icon | `text-[var(--armed)]` |
| `text-green-400` / `text-destructive` inline status | `text-led-go` / `text-led-nogo` |
| `text-amber-400 bg-amber-500/10 border-amber-400/30` info banner | `text-led-warn bg-[var(--warn-soft)] border-[var(--led-warn-edge)]` |

**Guardrail:** every section's early-return states (loading/error) and its `<section data-*>` attribute must survive verbatim; only composition + palette change.

---

### Task 1: Settings shell + sweep-test harness (Wave A)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/settings/settings-view.tsx`
- Create: `apps/desktop/src/renderer/src/features/settings-cluster-sweep.test.ts` (harness + first block)

**Interfaces:**
- Produces: the `settings-cluster-sweep.test.ts` harness (`readSrc(rel)` + one `describe` per file) that Tasks 2–22 extend; the cross-file guard (Task 23) closes it.

- [ ] **Step 1: Create the harness + settings-view block (red)**

```ts
// apps/desktop/src/renderer/src/features/settings-cluster-sweep.test.ts
/**
 * Phase 7b Settings-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard + amoled-menu-surface recipe check
 * land with the final task (Phase-3 lesson 5: global pins land last).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('settings-view shell sweep', () => {
  const src = readSrc('settings/settings-view.tsx');

  it('drops the amoled shell for a console layout', () => {
    expect(src).toContain('<Faceplate');
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toMatch(/\bbg-black\b/);
    // NOTE: `text-h1 text-foreground` is a CURRENT Carbon type token, not legacy —
    // the console recompose KEEPS the <h1> title inside the Faceplate body.
  });

  it('preserves all 15 scroll targets + the focus effect', () => {
    for (const sel of [
      'data-settings-section="enhanced-ai"',
      'data-settings-section="extensions"',
      'data-settings-section="portability"',
      'data-settings-section="memory"',
      'data-settings-section="providers"',
    ]) {
      expect(src).toContain(sel);
    }
    expect(src).toContain('settingsFocusSection');
    expect(src).toContain('scrollIntoView');
    expect(src).toContain('componentName="UpdaterSection"');
  });
});
```

*(Mirrors the 7a `ops-cluster-sweep.test.ts` harness: `readSrc` is a local const, not exported. Every later task adds its `describe` block to this same file.)*

- [ ] **Step 2: Run — expect FAIL** (source still amoled)

Run (from `apps/desktop`): `pnpm vitest run src/renderer/src/features/settings-cluster-sweep.test.ts`
Expected: FAIL on the `<Faceplate` / no-`amoled` pins.

- [ ] **Step 3: Recompose `settings-view.tsx`.** Root `<div className="amoled-menu-surface flex h-full flex-col bg-black">` → `<div className="flex h-full flex-col bg-background">`. Header block (`border-b border-border px-4 py-4` + `<h1 className="text-h1 text-foreground">Settings</h1>` + subtitle) → a `<div className="border-b border-border px-4 py-4">` wrapping `<Faceplate kicker="Console" serial="SETTINGS">` whose body **keeps** `<h1 className="text-h1 text-foreground">Settings</h1>` plus the subtitle as `<p className="text-caption text-silver-mute">Manage providers, API keys, and system preferences.</p>` (kicker/serial are stripe labels, not the title). The scroll body (`flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6`) and **every** `<ErrorBoundary>` + `<section data-settings-section="…">` wrapper + child ordering stay byte-identical.

- [ ] **Step 4: Run — PASS**, then gates.

Run: `pnpm vitest run src/renderer/src/features/settings-cluster-sweep.test.ts` → PASS
Run from repo root: `pnpm lint && pnpm lint:eslint && pnpm typecheck` → clean

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/settings/settings-view.tsx apps/desktop/src/renderer/src/features/settings-cluster-sweep.test.ts
git commit -F - <<'EOF'
feat(sweep): Phase 7b — Settings shell onto console layout + sweep-test harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Wave B — System-knob sections (Tasks 2–8)

Each task: add the file's `describe` block to `settings-cluster-sweep.test.ts` (red) → run FAIL → apply **CSR** + the listed deltas → run PASS + gates → commit. The pin block template per file:

```ts
describe('<file> sweep', () => {
  const src = readSrc('settings/<file>.tsx');
  it('composes from console primitives', () => { /* file-specific console-present pins */ });
  it('carries zero legacy composition', () => {
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-surface-50');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toMatch(/from '@\/components\/ui\/card'/);
    /* + file-specific legacy strings */
  });
  it('preserves selectors + handlers', () => { /* file-specific */ });
});
```

### Task 2: `updater-section.tsx` (card-root, 6 status banners)

- [ ] **Pin (console-present):** `<Faceplate`, `<SubviewState` or `<LampTile`, `.cap`. **Legacy-absent:** `bg-surface-50`, `bg-brand/5`, `bg-blue-500/10`, `text-blue-400`, `text-green-400`, `text-red-400`, `bg-surface-100`. **Preserve:** `checkUpdate.mutate()`, `installUpdate.mutate()`, `Check for Updates`, `Install & Restart`, `Team-X never phones home`.
- [ ] **Deltas:** root is a card (`rounded-lg border border-border bg-surface-50 p-4`), not `<section>` → `<Faceplate kicker="Ops" serial="UPDATES">`. The 6 status branches (available `border-brand/30 bg-brand/5`; downloading `bg-blue-500/10 text-blue-400`; success/not-available `bg-green-500/10 text-green-400`; failed/error `bg-red-500/10 text-red-400`) → one shared status row recipe: `<div className="flex items-center gap-2 rounded-inset border …">` toned by state (`--led-go`/`--led-nogo`/`--led-scope` + soft bg), icon kept. Release-notes `bg-surface-100` → `bg-[var(--void)] text-[var(--display-fg)]`. Buttons → `.cap`; `text-brand` RefreshCw → `text-[var(--armed)]`.
- [ ] **Commit:** `feat(sweep): Phase 7b — UpdaterSection onto console faceplate + LED status rows`

### Task 3: `runtime-section.tsx` (`brand-selected` strategy chooser + hardware grid)

- [ ] **Pin:** `<Faceplate`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]`, `<MetricTile` (hardware grid). **Legacy-absent:** `brand-selected`, `bg-surface-50`, `text-brand`. **Preserve:** `setRuntime.mutate({ strategy: opt.value })`, `orchestrator slot`, `{hw.cpuCores} cores`, `{hw.totalRamGb} GB`.
- [ ] **Deltas (apply CSR):** 4-strategy `brand-selected` chooser → armed chassis buttons. Effective-state row (`Activity` `text-brand`) → `RecessedWell` + `text-[var(--armed)]` icon. Hardware profile grid (CPU/RAM/GPU/VRAM cards `bg-surface-50`) → `MetricTile` ×4 (`label`/`value`/`icon`), preserving the conditional VRAM tile.
- [ ] **Commit:** `feat(sweep): Phase 7b — RuntimeSection chooser onto armed chassis + hardware MetricTiles`

### Task 4: `privacy-section.tsx` (6× `brand-selected` + tier-semantic variants)

- [ ] **Pin:** `<Faceplate`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]`, `<LampTile` (tier tone). **Legacy-absent:** `brand-selected`, `brand-selected-green`, `brand-selected-blue`, `brand-selected-amber`, `bg-surface-50`, `text-green-400`. **Preserve:** `setPrivacy.mutate({ maxTier: opt.value })`, `Local Only`, `Open-Source Cloud`, `All Providers`, `Allowed`, `Blocked`.
- [ ] **Deltas:** the 3 tier buttons use `.brand-selected` + a `selectedVariant` (green/blue/amber = local/open/proprietary). Selection → armed chassis; **the tier semantic** is re-expressed as a persistent per-row `<LampTile small interactive={false} label="…" tone={…} />` (local→`tone="go"`, open-source-cloud→`tone="scope"`, proprietary-cloud→`tone="warn"`) via a static `TIER_TONE` map — replacing the `selectedVariant` field. Provider-availability list (`bg-surface-50 divide-y`) → `RecessedWell` display rows; allowed/blocked `text-green-400`/`text-destructive` → `text-led-go`/`text-led-nogo`; kind `Badge` → `<Tag mono>`.
- [ ] **Commit:** `feat(sweep): Phase 7b — PrivacySection tiers onto armed chassis + LED tier tones`

### Task 5: `concurrency-section.tsx` (number knobs, no chooser)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, `<SubviewState`. **Legacy-absent:** `bg-surface-50`, `bg-background/40`, `text-red-400`. **Preserve:** every `htmlFor="provider-cap-${kind}"` / `id`, `commitSlots`, `commitProviderCap`, `orchestrator-slots`, `Per-Provider Kind Caps`.
- [ ] **Deltas (apply CSR):** orchestrator-slots row + per-kind cap grid → `RecessedWell` + inner void sub-cards; readouts → `--display-fg`; loading/error early returns → `SubviewState`; empty-kinds notice `border-dashed` kept inside a well.
- [ ] **Commit:** `feat(sweep): Phase 7b — ConcurrencySection onto console wells`

### Task 6: `agentic-section.tsx` (3 number knobs)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, `<SubviewState`. **Legacy-absent:** `bg-surface-50`, `text-red-400`, `bg-red-500/10`. **Preserve:** `agentic-max-steps`, `agentic-max-tokens`, `agentic-timeout-ms` ids, `commit('maxSteps', …)`, `budget_exhausted`.
- [ ] **Deltas (apply CSR):** header + description + 3-knob panel + save-error banner exactly per CSR.
- [ ] **Commit:** `feat(sweep): Phase 7b — AgenticSection budget knobs onto console wells`

### Task 7: `planner-section.tsx` (3 knobs + raw `<select>`)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, console-select recipe (`bg-[var(--void)]`). **Legacy-absent:** `bg-surface-50`, `text-red-400`, `bg-background px-3` (the raw select bg). **Preserve:** `planner-max-tickets`, `planner-max-depth`, `planner-approval-level`, `planner-escalation-threshold` ids, `commitLevel`, `commitNumeric`, `decompose_project`.
- [ ] **Deltas (apply CSR):** 3 number knobs per CSR; the `planner-approval-level` raw `<select>` → console-select recipe (options + `commitLevel` wiring byte-identical).
- [ ] **Commit:** `feat(sweep): Phase 7b — PlannerSection knobs + approval select onto console vocabulary`

### Task 8: `permissions-section.tsx` (shadcn Cards + `brand-selected` presets + test selectors)

- [ ] **Pin:** `<Faceplate`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]`, `<SubviewState`. **Legacy-absent:** `from '@/components/ui/card'`, `brand-selected`, `border-destructive/30`, `bg-muted/20`. **Preserve (LAW — the 264-line test pins these):** `data-permissions-section=""`, `data-testid={\`preset-card-${key}\`}`, `id={\`preset-${key}\`}`, `aria-label={\`${key}-preset\`}`, `aria-label="Show advanced authority matrix"`, `applyPreset`, `addCustomPath`, `handleSelectDirectory`, `Safe Mode`/`Standard`/`Advanced`.
- [ ] **Deltas:** 3 shadcn `Card`s → `Faceplate`s; preset cards `brand-selected` → armed chassis (**keep** the `data-testid`, radio `id`, `aria-label`, sr-only radio, `label` htmlFor); no-company/loading/error `Card` states → `SubviewState`; `Switch` (advanced) kept; custom-path `Input` + Browse/Add `Button`s → `.cap`; grant rows (`bg-muted/20`) → display rows; `Badge`s → `Tag`; `text-destructive` → `text-led-nogo`. Then update `permissions-section.test.tsx` red→green **only** where it asserts swept classes (`brand-selected`, Card) — leave every `data-testid`/`aria`/preset-behavior assertion byte-identical.
- [ ] **Commit:** `feat(sweep): Phase 7b — PermissionsSection presets onto console faceplates (test selectors intact)`

---

## Wave C — AI & data sections (Tasks 9–15)

### Task 9: `rag-section.tsx` (heaviest; raw toggle → Switch)

**Files:** modify `settings/rag-section.tsx` + add block to `settings-cluster-sweep.test.ts`.

- [ ] **Pin (console-present):** `<Faceplate`, `<RecessedWell`, `<MetricTile`, `<LampTile`, `<Switch`, `className="brand-range"` (threshold stays). **Legacy-absent:** `bg-surface-50`, `role="switch"` on a `<button`, `bg-brand`, `text-green-400`, `text-red-400`, `text-amber-400`, `bg-green-500/10`, `border-green-400/40`. **Preserve:** `id="rag-enabled-toggle"`, `aria-label="Enable RAG"`, `rag-embedding-provider`/`-model`/`-dimension`, `rag-top-k`, `rag-threshold`, `rag-max-tokens` ids, `handleToggle`, `handleRebuildConfirm`, `handleDeleteConfirm`, `Chunks Indexed`, `Rebuild Index`, `Delete All Embeddings`.
- [ ] **Deltas:** master-toggle card → `Faceplate` + `RecessedWell`; the hand-rolled `<button role="switch" id="rag-enabled-toggle">` → `<Switch id="rag-enabled-toggle" checked={enabled} onCheckedChange={handleToggle} disabled={setConfig.isPending} aria-label="Enable RAG" />` (drop the `bg-brand`/`translate-x` markup). Embedding + retrieval panels → `RecessedWell`; **threshold `.brand-range` slider stays**; Top-K/max-tokens number inputs per CSR. Enabled/Disabled + Indexing status `Badge`s → `LampTile` (go/nogo/hold). Index-Stats (`Chunks Indexed`/`Last Indexed`) → `MetricTile` ×2. Maintenance rebuild/delete inline-confirm rows → chassis rows + `.cap`/`.cap-warn`; feedback banners (green/red/amber) → toned status rows (`--led-go`/`--led-nogo`/`--led-warn` + soft bg). `disabledKnobs` opacity + `aria-disabled` kept.
- [ ] **Steps:** red → FAIL → recompose → `pnpm vitest run src/renderer/src/features/settings-cluster-sweep.test.ts` PASS + gates → commit `feat(sweep): Phase 7b — RagSection onto console primitives; raw toggle → Switch`

### Task 10: `enhanced-ai-section.tsx` (6 switches + 3 sliders + status badge)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, `<LampTile`, `<Switch`, `className="brand-range"`. **Legacy-absent:** `bg-surface-50`, `text-green-400`, `text-red-400`, `text-amber-400`, `border-green-400/40`. **Preserve:** `ai-llm-provider`/`-model`/`-max-tokens`/`-temperature`/`-planning-threshold`/`-tracing-sample-rate` ids, all 7 `aria-label="Toggle …"`, `commit('queryExpansionEnabled', …)` etc.
- [ ] **Deltas (apply CSR):** 2 panels → `RecessedWell`s; Detecting/Detected/No-LLM status `Badge`s → `LampTile` (hold/go/nogo); 6 `<Switch>`es kept; temperature + tracing `.brand-range` sliders kept; number inputs per CSR; save-error + amber info banner → toned status rows.
- [ ] **Commit:** `feat(sweep): Phase 7b — EnhancedAiSection onto console wells + LED detection lamp`

### Task 11: `copilot-section.tsx` (2nd raw toggle + raw-hex chips)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, `<Switch`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]` (category chips). **Legacy-absent:** `bg-surface-50`, `#FFAA2024`, `role="switch"` on `<button`, `bg-surface-200`, `text-red-400`. **Preserve:** `id="copilot-enabled"`, `aria-checked`, `copilot-interval-minutes`, `data-copilot-weight-category={cat}`, `copilot-weight-${cat}` ids, `commitEnabled`, `toggleCategory`, `commitWeight`, `Allowed Categories`, `Category weighting`.
- [ ] **Deltas:** panel → `RecessedWell`; the hand-rolled `<button role="switch" id="copilot-enabled">` (raw-hex `bg-[#FFAA2024]/80`) → `<Switch id="copilot-enabled" checked={draft.enabled} onCheckedChange={() => commitEnabled(!draft.enabled)} … aria-checked` — keep `role`/`aria` contract via Switch's native `role="switch"`; category `<label>` chips (raw-hex checked tint + `accent-brand` checkbox) → armed chassis chips (static map; **keep** the checkbox + `onChange` + `data-copilot-weight-category`); interval + weight number inputs per CSR; errors → toned rows.
- [ ] **Commit:** `feat(sweep): Phase 7b — CopilotSection onto console vocabulary; raw toggle → Switch, hex chips → armed chassis`

### Task 12: `extensions-section.tsx` (most complex; 4 Cards + semantic map)

- [ ] **Pin:** `<Faceplate`, `<MetricTile`, `<SubviewState`, `<Tag`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]`. **Legacy-absent:** `from '@/components/ui/card'`, `brand-selected`, `bg-muted/20`, `border-destructive/30`, `bg-brand-900`, `bg-red-950`, `bg-amber-950`. **Preserve (LAW):** `data-extensions-authority-stable=""`, `data-extension-add-skill=""`, `data-extension-add-mcp=""`, `handleProactiveToggle`, `reviewRequest`, `<InstallSkillDialog`, `<ImportMcpDialog`, `Autonomy Policy`, `Authority Snapshot`, `Pending Authority Reviews`, `Active Authority Grants`.
- [ ] **Deltas:** 4 shadcn `Card`s (`CardHeader`/`Content`/`Title`/`Description`) → `Faceplate` + `StripeHeader` kicker + caption; `brand-selected` autonomy chooser (3 modes) → armed chassis; inline proactive `<Switch>` kept; Active/Queued/Scan block → `MetricTile` ×2 + `.cap`; `permissionBadgeClass` (allow=`brand-900`, deny=`red-950`, prompt=`amber-950`) → LED-family static map (allow→`--armed`, deny→`--led-nogo`, prompt→`--led-warn`) keeping `PERMISSION_LABEL`; 2×2 snapshot tiles (`bg-muted/20`) → `MetricTile`; review/grant lists → `RecessedWell` display rows; all `border-destructive/30 bg-destructive/10` errors → `SubviewState`/toned rows; `Badge` counts → `Tag`.
- [ ] **Commit:** `feat(sweep): Phase 7b — ExtensionsSection onto console faceplates; permission tones → LED family`

### Task 13: `backup-section.tsx` (card-root, list + inline confirm)

- [ ] **Pin:** `<Faceplate`, `<SubviewState` or `<LampTile`, `<Tag`, `.cap`. **Legacy-absent:** `bg-surface-50`, `bg-surface-100`, `text-green-400`, `text-red-400`, `bg-green-500/10`. **Preserve:** `data-backup-delete={backup.filename}`, `aria-label={\`Delete backup ${backup.filename}\`}`, `createBackup.mutate`, `restoreBackup.mutate`, `deleteBackup.mutate`, `Create Backup`, `Overwrite all data?`.
- [ ] **Deltas:** card-root → `Faceplate kicker="Ops" serial="BACKUP"`; success/error banners (green/red) → toned status rows; empty-state (`bg-surface-100`) → `SubviewState`; backup rows (`bg-surface-100`) → chassis/display rows; manifest `Badge`s → `Tag`; Restore/Delete `Button`s → `.cap`/`.cap-warn` (keep `data-backup-delete` + aria-label); inline-confirm rows kept.
- [ ] **Commit:** `feat(sweep): Phase 7b — BackupSection onto console faceplate + toned status rows`

### Task 14: `memory-section.tsx` (`brand-selected` budget chooser)

- [ ] **Pin:** `<Faceplate`, `<RecessedWell`, `border-[var(--armed-edge)] bg-[var(--armed-soft)]`. **Legacy-absent:** `brand-selected`, `border-white/10 bg-black/10`, `bg-surface-50`, `text-red-400`. **Preserve:** `data-settings-memory=""`, `memory-recent-turn-limit`, `memory-checkpoint-history-limit` ids, `commit('defaultTargetTokenBudget', …)`, `Default pack budget`.
- [ ] **Deltas (apply CSR):** budget-chooser `Button`s (`brand-selected` / idle `border-white/10 bg-black/10`) → armed-chassis `.cap-select`-style buttons (static map); 2 number knobs per CSR; keep `data-settings-memory` on the `<section>`.
- [ ] **Commit:** `feat(sweep): Phase 7b — MemorySection budget chooser onto armed chassis`

### Task 15: `proactive/proactive-controls.tsx` (orphan — recompose, flag Phase 8)

- [ ] **Pin:** `<Faceplate`, `<SubviewState`, `<MetricTile`, `<Tag` or `<LampTile`, `.cap`. **Legacy-absent:** `from '@/components/ui/card'`, `text-red-400`, `bg-muted/50`, `bg-muted`, `border-red-400/30`. **Preserve:** `handleToggleEnabled`, `handleScanNow`, `useDecomposeGoal`, `useScanForWork` exports, `aria-label="Toggle proactive mode"`, `Proactive Mode`, `Active Work`, `Queued Work`, `Last Scan`, `Scan for Work Now`.
- [ ] **Deltas:** `Card` → `Faceplate`; header `text-h3` + Bot → kicker; `<Switch>` kept; description + autonomy `Badge` (`bg-muted`) → caption + `<Tag>`; loading `Skeleton` + error → `SubviewState`; work-status rows (`bg-muted/50`) → `MetricTile`/display rows; Scan `Button` → `.cap`; disabled-state message kept; raw `text-red-400`/`bg-red-500/10` → tokens. Read via `readSrc('proactive/proactive-controls.tsx')`.
- [ ] **Commit:** `feat(sweep): Phase 7b — ProactiveControls recomposed onto console primitives (orphan; Phase-8 dead-code candidate)`

---

## Wave D — Portability + Providers + dialogs (Tasks 16–22)

### Task 16: `portability-section.tsx` (1082 LOC — recompose in region sub-steps)

**Files:** modify `settings/portability-section.tsx` + add block to `settings-cluster-sweep.test.ts`.

- [ ] **Preserve (LAW — all 8 selectors, verified verbatim across every sub-step):** `data-settings-portability=""`, `data-cloud-link-shell=""`, `data-portability-invite-readiness=""`, `data-portability-manifest-preview=""`, `data-portability-import-plan=""`, `data-portability-runtime-template-diagnostics=""`, `data-portability-secret-wizard=""`, `data-portability-secret-input={secret.id}`, `aria-label="Working"`.
- [ ] **Recompose in 5 committed sub-steps.** Each sub-step follows strict TDD: **add that sub-step's region pins to the portability `describe` block (red) → run FAIL → recompose that region → run PASS + gates → commit.** No commit ever lands on a red test; the block grows one region's pins per sub-step (the intra-file mirror of the cluster harness's grow-per-task pattern). The `describe('portability-section sweep')` block is created in 16a and extended in 16b–16e.
  - [ ] **16a — tone helpers + header/shell.** *Pins:* `<Faceplate`, `<LampTile` (SYNC), and legacy-absent `emerald`, `text-amber-3`, `text-red-3` in the two tone maps. *Recompose:* re-tone `readinessTone` (ready/warning/blocked = emerald/amber/red → `--led-go`/`--led-warn`/`--led-nogo` + soft bg) and `actionTone` (create/rename/replace/skip → `--led-go`/`--led-warn`/`--armed`/neutral) as static maps; `modeLabel`/`modeDescription` untouched (text). Header (`<section data-settings-portability>` + `aria-label="Working"` spinner) → `Faceplate` + SYNC lamp. Commit `feat(sweep): Phase 7b — PortabilitySection tone maps + header`.
  - [ ] **16b — cloud-link shell.** *Pins:* `data-cloud-link-shell=""` preserved + `<RecessedWell` present + no `bg-surface-50` in that region. *Recompose:* panels → `RecessedWell`; link/reconnect/unlink `Button`s → `.cap`; status → toned rows. Commit.
  - [ ] **16c — operator invites + readiness.** *Pins:* `data-portability-invite-readiness=""` preserved + `border-[var(--armed-edge)] bg-[var(--armed-soft)]` present + no `brand-selected`. *Recompose:* `OPERATOR_AUTH_MODES` `brand-selected` chooser → armed chassis; readiness badges → `LampTile`/toned rows; invite list → display rows. Commit.
  - [ ] **16d — manifest preview + import plan + diagnostics.** *Pins:* `data-portability-manifest-preview=""`, `data-portability-import-plan=""`, `data-portability-runtime-template-diagnostics=""` preserved + `<Tag` present. *Recompose:* preview/plan panels → `RecessedWell`; plan-action rows use the `actionTone` map; `Tag`s for labels. Commit.
  - [ ] **16e — secret wizard + whole-file sweep.** *Pins:* `data-portability-secret-wizard=""`, `data-portability-secret-input={secret.id}` preserved + the **whole-file** legacy-absent assertion (`brand-selected`, `bg-surface-50`, `emerald`, `border-white/10 bg-black/10` all zero across the file). *Recompose:* secret-binding inputs kept (`.well-input`); wizard panel → `RecessedWell`; sweep any residual raw palette. Full block + gates green. Commit `feat(sweep): Phase 7b — PortabilitySection secret wizard; region sweep complete`.

### Task 17: `providers-section.tsx` (thin host)

- [ ] **Pin:** `<Faceplate`, `<SubviewState`, `.cap`. **Legacy-absent:** `text-destructive`. **Preserve:** `setAddOpen(true)`, `<ProviderCard`, `<AddProviderDialog`, `Add Provider`, `AI Providers`.
- [ ] **Deltas:** header → `Faceplate kicker="Console" serial="PROVIDERS"` + `.cap` Add button; loading/error/empty states → `SubviewState`; `ProviderCard` grid + `AddProviderDialog` render kept.
- [ ] **Commit:** `feat(sweep): Phase 7b — ProvidersSection host onto console faceplate`

### Task 18: `provider-card.tsx` (TIER_STYLE + raw select)

- [ ] **Pin:** `<Faceplate`, console-select recipe, `<Tag`, `.cap`, `<LampTile` or `text-led-go`. **Legacy-absent:** `bg-surface-50`, `text-green-400`, `text-blue-400`, `text-amber-400`, `border-green-400/30`, `bg-background px-3` (raw select). **Preserve:** `handleToggle`, `handleSaveKey`, `handleTest`, `handleRemove`, `saveOllamaModel`, `provider-model-${provider.id}`, `provider-model-select-${provider.id}` ids, `Set API Key`, `Test`, `Remove`, `Connected`, all `<optgroup>` labels.
- [ ] **Deltas:** card shell (`bg-surface-50`) → `Faceplate`; `TIER_STYLE` (local=green/open=blue/proprietary=amber) → LED static map (`--led-go`/`--led-scope`/`--led-warn`) keeping `TIER_LABEL`; kind/tier `Badge` → `Tag`; raw `<select>` model picker (`bg-background`) → console-select recipe (keep `optgroup`s + `onChange`); enabled toggle-button + Test + Remove `Button`s → `.cap`/`.cap-warn`; connection status (`text-green-400`/`text-destructive`) → `text-led-go`/`text-led-nogo`; API-key + model forms kept.
- [ ] **Commit:** `feat(sweep): Phase 7b — ProviderCard onto console faceplate; tier palette → LED family`

### Task 19: `add-provider-dialog.tsx` (hand-rolled panel + 2 raw selects)

- [ ] **Pin:** console-select recipe, `.cap`. **Legacy-absent:** `bg-background p-6 shadow-xl` (raw panel), `text-destructive`, `border border-input bg-background` (raw select). **Preserve:** `<Dialog open={open} onOpenChange={onOpenChange}`, `handleSubmit`, `handleKindChange`, `provider-kind`, `provider-name`, `provider-tier`, `provider-key`, `provider-url` ids, `Add Provider`, `Add Provider` submit, `Stored in your OS keychain`.
- [ ] **Deltas:** hand-rolled panel (`rounded-lg border border-border bg-background p-6 shadow-xl`) → machined-plate: `rounded-overlay border border-[var(--hairline-strong)] bg-[var(--carbon-850)] p-6 shadow-xl` (backdrop `bg-black/50` kept — accepted scrim); title `text-h3` kept; 2 raw `<select>`s (`selectClass`) → console-select recipe; footer `Button`s → `.cap`; `text-destructive` → `text-led-nogo`.
- [ ] **Commit:** `feat(sweep): Phase 7b — AddProviderDialog onto machined-plate + console selects`

### Task 20: `import-mcp-dialog.tsx` (shadcn Dialog — content only)

- [ ] **Pin:** `.cap`. **Legacy-absent:** `text-destructive`, `text-red-4`, `bg-surface-50`, `bg-muted`. **Preserve:** `<Dialog`, `<DialogContent>`, `<DialogTitle>Import MCP`, `handleSubmit`, form field `id`s.
- [ ] **Deltas:** shadcn `Dialog` shell (Phase-1 restyled) kept; form content — any `bg-surface-*`/`bg-muted` sub-panels → wells, raw palette → tokens, footer `Button`s → `.cap`. (Read the file at execution to enumerate its exact fields; no special selectors exist.)
- [ ] **Commit:** `feat(sweep): Phase 7b — ImportMcpDialog content onto console vocabulary`

### Task 21: `install-skill-dialog.tsx` (shadcn Dialog — content only)

- [ ] **Pin/Deltas:** identical shape to Task 20; **Preserve:** `<DialogTitle>Install Skill`, `handleSubmit`, field `id`s. Sub-panels → wells, raw palette → tokens, `Button`s → `.cap`.
- [ ] **Commit:** `feat(sweep): Phase 7b — InstallSkillDialog content onto console vocabulary`

### Task 22: `grant-authority-dialog.tsx` (shadcn Dialog — content only)

- [ ] **Pin/Deltas:** identical shape to Task 20; **Preserve:** `<DialogTitle>Grant Authority`, `handleSubmit`, any scope/permission chooser + field `id`s. Choosers → armed chassis / console-select, raw palette → tokens, `Button`s → `.cap`.
- [ ] **Commit:** `feat(sweep): Phase 7b — GrantAuthorityDialog content onto console vocabulary`

---

### Task 23: Cross-file legacy-absence guard + `amoled` recipe purge + full gate (Wave E)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/settings-cluster-sweep.test.ts` (final block)
- Modify: `apps/desktop/src/renderer/src/styles/globals.css` (delete the `amoled-menu-surface` recipe)
- Modify (red→green, only if still red): any remaining existing settings test that pins a swept class.

- [ ] **Step 1: Add the cross-file guard**

```ts
describe('settings cluster cross-file legacy absence', () => {
  const files = [
    'settings/settings-view.tsx', 'settings/updater-section.tsx', 'settings/runtime-section.tsx',
    'settings/privacy-section.tsx', 'settings/concurrency-section.tsx', 'settings/agentic-section.tsx',
    'settings/planner-section.tsx', 'settings/permissions-section.tsx', 'settings/rag-section.tsx',
    'settings/enhanced-ai-section.tsx', 'settings/copilot-section.tsx', 'settings/extensions-section.tsx',
    'settings/backup-section.tsx', 'settings/memory-section.tsx', 'proactive/proactive-controls.tsx',
    'settings/portability-section.tsx', 'settings/providers-section.tsx', 'settings/provider-card.tsx',
    'settings/add-provider-dialog.tsx', 'settings/import-mcp-dialog.tsx',
    'settings/install-skill-dialog.tsx', 'settings/grant-authority-dialog.tsx',
  ];

  it('keeps every swept settings file free of the legacy composition families', () => {
    for (const file of files) {
      const src = readSrc(file);
      expect(src, file).not.toContain('amoled-menu-surface');
      expect(src, file).not.toContain('brand-selected');
      expect(src, file).not.toMatch(/from '@\/components\/ui\/card'/);
      expect(src, file).not.toContain('bg-surface-50');
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{6,8}\b/);
      expect(src, file).not.toMatch(/\b(text|bg|border)-(red|green|amber|emerald|blue)-[0-9]/);
    }
  });

  it('confirms the amoled-menu-surface recipe is deleted from globals.css', () => {
    const css = readFileSync(
      join(featuresDir, '../styles/globals.css'), 'utf8',
    );
    expect(css).not.toContain('.amoled-menu-surface');
  });
});
```

- [ ] **Step 2: Run — expect the CSS pin RED** (recipe still present); all file pins green if Tasks 1–22 complete.

Run: `pnpm vitest run src/renderer/src/features/settings-cluster-sweep.test.ts`

- [ ] **Step 3: Delete the `.amoled-menu-surface` recipe** from `styles/globals.css` (the whole rule block; verify no remaining consumer via `grep -rn "amoled-menu-surface" apps/desktop/src` → only this test's negative pins).

- [ ] **Step 4: Full local gate**

Run from repo root: `pnpm lint && pnpm lint:eslint && pnpm typecheck && pnpm test`
Expected: Biome clean · ESLint 0 err/0 warn · typecheck clean · full vitest green.
Also: `pnpm audit:claims:strict` → 0 unallowed.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/settings-cluster-sweep.test.ts apps/desktop/src/renderer/src/styles/globals.css
git commit -F - <<'EOF'
test(sweep): Phase 7b cross-file legacy guard + delete amoled-menu-surface recipe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 24: Proof gate — build, dual-shift screenshot pack, PR

- [ ] **Step 1: Build + real-renderer verify.** `pnpm build`; boot the E2E test-mode harness; verify on the real renderer: rag + copilot bat-lever toggles switch correctly, retinted `<select>`s (provider-card, planner, add-provider) are legible both shifts, the four semantic-tone maps render, and each dialog opens. Fix any defect as an atomic commit + re-run the affected pins.
- [ ] **Step 2: Screenshot pack** — the 5a/7a recipe (`_electron` launch of the built app in test mode; seed providers/extensions-grants/portability-templates/rag-stats via the E2E direct-IPC pattern; **NEVER concurrent with the vitest suite** — lesson 32). Surfaces × Night Ops + Day Shift: each of the 15 sections + the 4 dialogs open (≈34 shots). `proactive-controls` is unmounted → note it, no shot. Save under `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/sweep-phase-07b/`. Delete any throwaway capture spec from `e2e/` before the PR (lesson 34).
- [ ] **Step 3: Audit the pack vs DESIGN.md both shifts** — bolt corners, Day-Shift well/select legibility, semantic-tone partition (the 5a defect classes). Fix findings as atomic commits, re-capture.
- [ ] **Step 4: `/design-review`** against DESIGN.md's anti-slop checklist (tier/permission/readiness tone partitions + armed-chassis-on-opaque are explicit review items) → fix all findings.
- [ ] **Step 5: Push branch, open PR** — body lists: scope table (22 files / ~7.07k LOC), `brand-selected`→0 + `amoled-menu-surface`-deleted evidence, the four semantic-tone-map tables, zero-VuMeter rationale, `proactive-controls` Phase-8 dead-code flag, screenshot pack link. Then Stage-1 CI → Stage-2 `/review` → **STOP: Stage-3 Codex is Rocky-triggered; Stage-4 is Rocky's sign-off. Never self-clear.**

---

## Self-review (spec coverage · placeholders · type consistency)

- **Spec coverage:** shell + amoled retirement (T1, T23), Wave-B 7 sections (T2–T8), Wave-C 7 files incl. orphan (T9–T15), Wave-D portability sub-steps + providers + card + 4 dialogs (T16–T22), cross-file guard + recipe purge (T23), build/pack/wall (T24). All 22 files + the `amoled` recipe + the 4 semantic-tone maps + the 2 raw-toggle swaps + the 3 raw-select retints have a task. Zero VuMeters, zero interaction changes — per spec §census-8. `mission-shell` deletion absent (Phase 8). `proactive-controls` delete-vs-wire absent (Phase 8 flag).
- **Placeholder scan:** the CSR carries the exact class strings once; each task carries its file's exact pins (real selectors/ids/handlers/text verified at source) + exact deltas + exact commit subject. Tasks 20–22 (shadcn dialogs, no special selectors) name the exact preserved `<DialogTitle>` text + `handleSubmit` and instruct enumerating fields at execution — no field is invented. No "TBD"/"similar to"/"add error handling".
- **Type consistency:** `<Switch id … checked onCheckedChange disabled aria-label>` matches the shadcn signature used in extensions/enhanced-ai; console-select recipe is a className swap (no prop change); `LampTone`/`SubviewState`/`MetricTile`/`Faceplate`/`Tag` props match the verified `components/console/index.ts` interfaces; the semantic-tone re-maps stay `Record<string,string>` (value-only), so every `TIER_STYLE`/`permissionBadgeClass`/`readinessTone`/`actionTone` caller contract is unchanged.
