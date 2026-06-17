# Aesthetic Sweep Phase 3 — Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the flagship Mission Control dashboard (`mission-control-dashboard.tsx`, 1,760 LOC) and its eight sub-view files onto the Phase 1 Command Console foundation — establishing the per-screen recomposition pattern that Phases 4–7 will follow — with zero behavior, data-flow, or IPC change and the Playwright E2E suite passing UNMODIFIED.

**Architecture:** Visual-only recomposition of existing components onto the console recipe layer Phase 1 landed in `globals.css` (`.faceplate`, `.plate`, `.well`, `.lcd`, `.lamp*`, `.cap*`, `.cap-select`, `.nav-tile`, `.stripe`, `.hex`, `.stencil`, text/radii utilities, `--carbon/armed/led/tag/display/sp/r/ease` tokens) plus the `components/console/` primitive library (`Faceplate`, `StripeHeader`, `HexBolt`, `RecessedWell`, `LcdWell`, `LampTile`, `VuMeter`). No globals.css changes are expected — the foundation is complete. Two real, normalized 0–1 signals get `VuMeter`s (named in the VU Signal Manifest below); every lamp is bound to an existing state value. The renderer has **no React Testing Library / DOM harness**, so the test mechanism is **source-string-pin tests** (read the component source as a string, assert console primitives present + legacy absent + every E2E/a11y selector preserved) — exactly the Phase 1/2 mechanism (`shell-foundation.test.tsx`, `top-bar.test.tsx`).

**Tech Stack:** React 19, Tailwind 3.4 + console recipes, Radix/shadcn primitives (restyled in Phase 1, APIs frozen), zustand (`app-store`), TanStack Query + IPC hooks, Vitest (workspace env `node`, `globals: false`), Playwright E2E (must pass UNMODIFIED).

---

## Scope deviation from the design spec — READ FIRST

The design spec (`docs/superpowers/specs/2026-06-10-renderer-aesthetic-sweep-design.md` §3) lists `features/mission/mission-shell.tsx` under Phase 3. **This plan deliberately EXCLUDES it.** Recon proved `mission-shell.tsx` is not a Mission Control surface — it is the shared legacy `.mission-*` **primitive library** (`MissionPageShell`, `MissionHero`, `MissionPill`, `MissionSectionCard`, `MissionRailCard`, `MissionControlRow`, `MissionSegmentedButton`, `MissionIconButton`, `MissionInsetSurface`, `MissionSheetHeader`, `MissionStateBlock`, `MissionMetricTile`) imported by **22 feature files** across autonomy, telemetry, chat, tickets, copilot, user-guide, and memory — i.e. the Phase 4 / 6 / 7 surfaces. The flagship `mission-control-dashboard.tsx` does **not** import it (it composes its own internal sub-components).

Recomposing `mission-shell.tsx` now would flip all 22 unswept consumer screens to console composition mid-body, directly violating the CLAUDE.md "never mix composition families on one screen" rule and exploding Phase 3 to a whole-app change. Correct behaviour: `mission-shell.tsx` stays legacy (already retinted to Carbon tokens in Phase 1) and is recomposed/purged when its consumer screens sweep (Phases 4/6/7) and finally deleted in Phase 8's zero-usage purge. **This deviation is the architecturally correct reading of the spec's intent ("flagship dashboard + sub-views; establishes the recomposition pattern") and was flagged to Rocky at plan time.**

---

## Context primer (paste into every implementer prompt)

**Repo:** `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X` — Electron monorepo; renderer at `apps/desktop/src/renderer/src/`. Branch: `feat/v3.4.0-sweep-phase-03-mission-control` (cut fresh from main `c004785`).

**The sweep doctrine (from `DESIGN.md` + the spec):**
- A swept screen uses the console vocabulary EXCLUSIVELY: faceplates, stripe headers, hex bolts, recessed wells, machined caps, lamp tiles, LCD wells, stencil/placard typography. It must NOT contain `.mission-*` classes, `.brand-selected`, `.amoled-menu-surface`, raw `bg-black`, `border-white/NN`, ad-hoc radii (`rounded-[NNpx]`, `rounded-2xl`, `rounded-xl`, `rounded-full` for chrome), `surface-*` palette, or raw status colors (`red-*`/`amber-*`/`emerald-*`/`green-*`/`blue-*`/`purple-*`/`cyan-*`/`slate-*`/`zinc-*`), or `font-mono` literal (use the Iosevka utilities `.text-code`/`.text-code-sm` or `font-stream`).
- The legacy classes stay DEFINED in `globals.css` for unswept screens (purged Phase 8) — you only remove *usages* in the files this phase sweeps.
- **Displays stay dark in BOTH shifts:** `.well`, `.lcd*`, `.lamp*`, `.vu*` carry literal dark values — never add `.dark` variants to them, never put shift-flipping tokens inside them.
- No decorative LEDs/meters. Every lamp is bound to a real state value; `VuMeter` mounts ONLY on the two signals in the VU Signal Manifest.
- Motion: snap/mechanical only (`--ease-snap`); the cap recipes deliberately carry no transitions — do not add any.

**Console class cheat-sheet (all already exist in `globals.css` / `tailwind.config.ts`):**
`.faceplate` (raised section panel, renders its own bolts+stripe via the `Faceplate` component) · `.plate` (Card/Dialog chrome — shadcn Card already applies it) · `.well` (recessed dark display surface) · `.well-input` (recessed input — Input/Textarea/SelectTrigger already apply it) · `.cap` / `.cap-armed` / `.cap-warn` / `.cap-chrome` (Button variants `secondary|outline` / `default` / `destructive` / `chrome` already apply them) · **`.cap.cap-select` / `.cap.cap-select-go` / `.cap.cap-select-hold`** (chooser-selection — compound, MUST be written together with `cap`, e.g. `'cap cap-select'`) · **`.nav-tile` / `.nav-tile-active`** (wayfinding tabs — NOT a cap) · `.lamp` `.lamp-sm` `.lamp-{go,hold,warn,exec,armed}` `.lamp-interactive` · `.lcd` `.lcd-amber` `.lcd-red` · `.stripe` (brushed header band — `StripeHeader`/`Faceplate` emit it) · `.hex` + `.hex-{tl,tr,bl,br}` · `.stencil` (word-lamp lettering for TSX) · `.text-placard` (panel nameplate; CardTitle already applies it) · `.text-eyebrow`/`-sm` · `.text-menu-label` · `.text-shortcut` · `.text-code`/`-sm` (Iosevka) · `.text-numeric`/`-lg` (Departure Mono) · radii utilities `rounded-card|control|overlay|inset|pill` · color utilities `bg-carbon-{950..700}`, `bg-armed`/`text-armed`, `bg-led-{go,hold,warn,scope}` / `text-led-*`, `text-graphite`/`bg-graphite`, `text-silver`/`-bright`/`-mute`, `text-platinum` · fonts `font-display` (Archivo) `font-data` (Departure Mono) `font-stream`/`font-mono` (Iosevka) · tokens via `hsl(var(--…))` or arbitrary `[hsl(var(--display-fg))]`: `--carbon-*`, `--armed*`, `--led-*` + `--led-*-edge`, `--tag-{go,hold,warn}` + `-edge`, `--display-bg-top/-bottom/-border/-fg`, `--void`, `--phosphor`, `--sp-1..7`, `--r-card/control/overlay/inset/pill`, `--ease-snap/led/vu`.

**Console React primitives (`components/console/`, barrel `index.ts`) — exact contracts:**
- `Faceplate({ kicker?, serial?, stripeSlot?, bolts=true, children, className?, bodyClassName? })` → `<section class="faceplate">`; stripe renders ONLY when `kicker` is set; `stripeSlot` is the trailing stripe content (e.g. a `LampTile`). **No `aria-label`/`trail`/`title` prop** — put a region label via `className`/wrapping `aria-label` on the section through native props spread (Faceplate spreads nothing; if you need `aria-label`, wrap or set it on a child — see Task F2).
- `StripeHeader({ kicker (required), serial?, children?, className? })` → `<div class="stripe">`; `children` is the trailing slot.
- `HexBolt({ corner: 'tl'|'tr'|'bl'|'br', className? })`.
- `RecessedWell({ className?, ...divAttrs })` → `<div class="well">`.
- `LcdWell({ tone?: 'go'|'amber'|'red' = 'go', className?, ...divAttrs })` → `<div class="lcd [lcd-amber|lcd-red]">`. Departure Mono phosphor readout. (`LcdTone` is NOT exported.)
- `LampTile({ label (required), tone?: LampTone = 'off', small?, alert?, acknowledged?, onAcknowledge?, interactive?=true, className? })`. `LampTone = 'off'|'go'|'hold'|'warn'|'exec'|'armed'` (exported). Steady when lit; `alert && !acknowledged` → 1 Hz blink (reduced-motion shows `UNACK` affix). With `alert && interactive` it renders a `<button>`; **for a pure status indicator pass `interactive={false}`** so it renders a `<span>` (no spurious button in E2E trees).
- `VuMeter({ value (required, 0–1), segments?=16, orientation?='horizontal', label (required), className? })` → `role="meter"`. Functional-only by doctrine; mount ONLY on a real live 0–1 signal.

**VU SIGNAL MANIFEST (the ONLY two `VuMeter` mounts allowed this phase):**
| Surface | `value` (normalized 0–1) | Source | `label` |
|---|---|---|---|
| Hero "Workforce active" tile (Task F3) | `employees.length > 0 ? queueSummary.activeEmployees / employees.length : 0` | `summarizeDashboardQueues(queueRows)` | `"Workforce utilization"` |
| Stream-view header (Task S2) | `employees.length > 0 ? thinkingCount / employees.length : 0` | `employeeLive[].status === 'thinking'` | `"Live stream concurrency"` |
Any other `VuMeter` is a design-review failure. `floor-view` busy/idle uses `LcdWell` readouts, not a meter (avoids redundancy with stream-view).

**LAMP TONE MAP (use these exact mappings; define the helper once per file that needs it):**
- Employee/agent live status: `thinking`→`exec`, `blocked`→`hold`, `error`→`warn`, `meeting`→`go`, `idle`/default→`off`.
- Dashboard `liveStatus` (`liveStatusLabel`): `thinking`(Live)→`exec`, `blocked`→`hold`, `error`→`warn`, `idle`→`off`.
- Agent run `status`: `running`→`exec`, `completed`→`go`, `failed`→`warn`.
- Runtime session `status`: `working`→`exec`, `blocked`/`stale`→`hold`, `failed`/`offline`→`warn`, else→`off`.
- Runtime `stateTone`: `accent`→`exec`, `warning`→`hold`, `danger`→`warn`, `default`→`off`.
- Command outcome: `ok`→`go`, `error`→`warn`. Command intent chip → `exec`.

**LCD TONE MAP (hero + telemetry numeric tiles):** healthy/neutral→`go`; cost/utilization-caution→`amber`; "Queue pressure" `amber` when `>0`; "Blocked work" `red` when `>0`, else `go`; runtime `RuntimeMetricCell` tone `default|accent`→`go`, `warning`→`amber`, `danger`→`red`.

**HARD E2E + a11y CONTRACT — these strings MUST survive verbatim (specs run UNMODIFIED):**
Flagship `data-*` (all): `data-dashboard-mission-control`, `data-dashboard-hero-toggle="agent-runs"|"employee-queues"`, `data-dashboard-reset-layout`, `data-dashboard-layout-error`, `data-dashboard-primary-panel` (`dataPanel="agent-runs"|"employee-queues"`), `data-dashboard-panel-state` (`"loading"|"agent-runs-ready"|"employee-queues-ready"` + the `dataState` values `agent-runs-unselected|agent-runs-error|agent-runs-empty|employee-queues-unselected|employee-queues-error|employee-queues-empty|runtime-operations-unselected|runtime-operations-error|recent-commands-unselected|recent-commands-error|recent-commands-empty|telemetry-snapshot-unselected|telemetry-snapshot-error|telemetry-snapshot-empty`), `data-dashboard-queue-row`, `data-dashboard-runtime-operations`, `data-dashboard-runtime-state`, `data-dashboard-runtime-budget-blocks`, `data-dashboard-runtime-session-list`, `data-dashboard-runtime-session`, `data-dashboard-runtime-empty`, `data-dashboard-runtime-badge`, `data-dashboard-autonomy-badge="routines"|"approvals"`, `data-dashboard-autonomy-snapshot`, `data-dashboard-secondary-panel="copilot"`, `data-dashboard-recent-commands`, `data-dashboard-telemetry-snapshot`. ARIA: `aria-pressed={layout.agentRuns}`, `aria-pressed={layout.employeeQueues}`, `aria-label={`${layout.agentRuns ? 'Hide' : 'Show'} Agent Runs panel`}`, `…Employee Queues panel`, `aria-label="Reset dashboard layout to the default hybrid view"`, `aria-label={`Open Copilot thread for ${run.label}`}`, `aria-label={`Open chat with ${row.name}`}`, `aria-label="Open full telemetry dashboard"`, `aria-label="Open Autonomy runtimes"`, the layout-persistence `<output … aria-live="polite">` and `role="alert"` block. Hook-wiring lines pinned by the existing test (all behavior, do not touch): `useDashboardAgentRuns(companyId)`, `useTickets(companyId)`, `useCommandHistory(companyId, 5)`, `useCompanyStats(companyId ? { companyId } : null)`, `useDailyUsage(`, `useApprovals(companyId, undefined, 'pending')`, `useBudgetOverview(companyId)`, `useRoutines(companyId)`, `useOperators(companyId)`, `useRuntimeOperations(companyId)`, `summarizeRuntimeOperationsForDashboard(`, `CopilotDashboardWidget`, `<RuntimeOperationsBand`, `label="External runtimes"`, `useDashboardLayoutPreferences(company)`. Constant names pinned (keep names, values may change): `DASHBOARD_TOUCH_BUTTON_CLASS = 'min-h-11'` (value pinned exactly), `DASHBOARD_GLASS_BUTTON_CLASS`, `DASHBOARD_GHOST_BUTTON_CLASS`, `DASHBOARD_PILL_TOGGLE_CLASS`, `DASHBOARD_PILL_GHOST_CLASS`, `DASHBOARD_INTERACTIVE_FOCUS_CLASS` (+ literal `focus-visible:ring-brand/60`). Sub-views: `data-testid="commands-view"`, `data-testid="commands-list"` (its direct children MUST stay `<button>` — `command-palette.spec` asserts `.locator('button').toHaveCount(2)`), `data-testid="commands-loading"`, `data-testid="commands-empty-state"`, `data-testid="commands-error-state"`, `aria-busy="true"`; command rows render raw text (`/fire /i`, `/hire /i`) + intent label text (`Route to Agent`) as top-level visible nodes; `dashboard-subtabs` buttons keep accessible name exactly `Mission Control|Timeline|Stream|Floor|Commands`; `employee-card` keeps `aria-label={`${employee.name}, ${employee.title} — ${statusLabel(displayStatus)}. Click to ${isSelected ? 'close' : 'open'} chat.`}` (em-dash, verbatim) and `title={statusLabel(displayStatus)}`; the SUBTABS line `{ label: 'Mission Control', icon: LayoutGrid, subview: 'cards' }` is pinned verbatim by `mission-control-dashboard.test.tsx`.

**Test conventions:** workspace vitest env is `node` (`globals: false`); source-pin tests import from `vitest` and `node:fs`/`node:path`, read `*.tsx` as a string, and assert substrings/regex — no DOM. `mission-control-dashboard.test.tsx` ALREADY does this; you extend it. New sub-view pins go in ONE consolidated file `dashboard-cluster-sweep.test.ts`. Source-string-pin tests must be updated when you change the strings they pin (that IS the red→green loop). Unit/helper tests and Playwright E2E specs may **not** change.

**Gates to run per task (from repo root):** `pnpm typecheck` · `pnpm lint` (Biome — run `npx biome check --write <files>` to format) · `pnpm lint:eslint` (0 errors; 125-warning baseline) · `pnpm -F @team-x/desktop exec vitest run <paths>` for focused suites, `pnpm test` for the full run. Locate code by SELECTOR/searched string, never by line number (they drift as you edit).

**Commit style:** descriptive subjects, `feat(sweep):` / `fix(sweep):` / `test(sweep):` prefixes; end the body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File map (what this phase touches)

| File | Action | Task |
|---|---|---|
| `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx` (1760) | Recompose flagship | F1–F7 |
| `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx` (165) | Extend source-pins (legacy-absence + console-present), keep all contract pins | F1–F7 |
| `apps/desktop/src/renderer/src/features/dashboard/dashboard-subtabs.tsx` (50) | Recompose → nav-tile rail | S1 |
| `apps/desktop/src/renderer/src/features/dashboard/stream-view.tsx` (123) | Recompose → Faceplate panes + display well + VuMeter | S2 |
| `apps/desktop/src/renderer/src/features/dashboard/cards-view.tsx` (67) | Recompose grid + states | S3 |
| `apps/desktop/src/renderer/src/features/dashboard/employee-card.tsx` (122) | Recompose card + status lamp + stream well | S3 |
| `apps/desktop/src/renderer/src/features/dashboard/timeline-view.tsx` (204) | Recompose → stripe bands + lamps | S4 |
| `apps/desktop/src/renderer/src/features/dashboard/floor-view.tsx` (182) | Recompose → faceplate + lamps + LCD readouts | S5 |
| `apps/desktop/src/renderer/src/features/dashboard/commands-view.tsx` (234) | Recompose (preserve all testids + button rows) | S6 |
| `apps/desktop/src/renderer/src/features/dashboard/dashboard-cluster-sweep.test.ts` | NEW — consolidated sub-view source-pins | S1–S6 |
| `CHANGELOG.md` | Phase 3 entry under `[Unreleased] → Changed` | R1 |

`components/console/index.ts` import line used throughout: `import { Faceplate, StripeHeader, LcdWell, LampTile, RecessedWell, VuMeter, type LampTone } from '@/components/console/index.js';`

---

## Task F0: Branch + verify clean baseline

**Files:** none (git only)

- [ ] **Step 1: Cut the branch fresh from main**

```bash
git fetch origin
git switch main && git pull --ff-only
git switch -c feat/v3.4.0-sweep-phase-03-mission-control
git log --oneline -1   # expect c004785
```

- [ ] **Step 2: Confirm the baseline is green before any edit**

Run: `pnpm typecheck && pnpm -F @team-x/desktop exec vitest run src/features/dashboard`
Expected: PASS (existing dashboard suites green). Record the green baseline; you will keep it green after every task.

- [ ] **Step 3: Commit nothing** — branch only. Proceed to F1.

---

## Task F1: Flagship shell chassis + skeleton

Recompose `MissionControlSkeleton` and the two outer chassis wrappers (the `<section class="mission-shell">` + `<div class="mission-grid">` overlay) onto a plain carbon chassis (global bg) — drop the legacy grid texture; keep `data-dashboard-mission-control`.

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx`
- Test: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx`

- [ ] **Step 1: Add the console import** at the top of the component import block (after the local `./…` imports, with the other `@/components` imports):

```ts
import { Faceplate, StripeHeader, LcdWell, LampTile, RecessedWell, VuMeter, type LampTone } from '@/components/console/index.js';
```

- [ ] **Step 2: Write the failing test** — add to `mission-control-dashboard.test.tsx` inside the existing `describe('MissionControlDashboard renderer shell', …)`:

```ts
it('mounts the swept console chassis without legacy shell/grid classes', () => {
  expect(missionControlSrc).toContain('data-dashboard-mission-control=""');
  expect(missionControlSrc).not.toContain('mission-shell');
  expect(missionControlSrc).not.toContain('mission-grid');
  // skeleton wells, not raw bg-black panels
  expect(missionControlSrc).toContain('<RecessedWell');
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `pnpm -F @team-x/desktop exec vitest run src/features/dashboard/mission-control-dashboard.test.tsx`
Expected: FAIL (source still contains `mission-shell`/`mission-grid`, no `RecessedWell`).

- [ ] **Step 4: Recompose `MissionControlSkeleton`** — replace the whole function body return with:

```tsx
  return (
    <section
      className="relative flex min-h-full flex-col gap-[var(--sp-4)] overflow-hidden p-4 sm:p-6 xl:p-8"
      data-dashboard-mission-control=""
    >
      <Faceplate kicker="MISSION CONTROL" serial="BOOT">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {heroSkeletonKeys.map((key) => (
            <RecessedWell key={key} className="h-28 animate-pulse" />
          ))}
        </div>
      </Faceplate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
        <RecessedWell className="h-[26rem] animate-pulse" />
        <RecessedWell className="h-[26rem] animate-pulse" />
      </div>
    </section>
  );
```

- [ ] **Step 5: Recompose the MAIN component's outer chassis** — find the main return's opening (the `<section className="mission-shell relative min-h-full overflow-hidden" data-dashboard-mission-control="">` and the immediately following `<div className="mission-grid pointer-events-none absolute inset-0 opacity-35" />`). Replace those two lines with a single plain chassis section, and change the inner content wrapper to drop the now-redundant `relative`:

```tsx
    <section
      className="relative flex min-h-full flex-col gap-6 overflow-hidden p-4 sm:p-6 xl:p-8"
      data-dashboard-mission-control=""
    >
      <div className="flex min-h-full flex-col gap-6">
```

(The original inner `<div className="relative flex flex-col gap-6 p-4 sm:p-6 xl:p-8">` is replaced by the line above; the section now owns the padding. Keep the closing `</div></section>` at the end of the component unchanged.)

- [ ] **Step 6: Run the test — expect PASS**

Run: `pnpm -F @team-x/desktop exec vitest run src/features/dashboard/mission-control-dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Gate + commit**

```bash
npx biome check --write apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx
pnpm typecheck && pnpm lint:eslint
git add -A && git commit
```
Commit subject: `feat(sweep): Phase 3 — Mission Control shell chassis on carbon (drop mission-shell/grid)`

---

## Task F2: Hero header chrome → Faceplate + console controls

Recompose the `<header class="mission-hero …">` into a `Faceplate`, retarget the `DASHBOARD_*` button-class constants to console values, convert the panel toggles to `cap-select`, the company pills to lamp tags, and the metadata badge row to recessed readout chips. (The 6-metric grid is Task F3 — leave it in place this task.)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.tsx`
- Test: `apps/desktop/src/renderer/src/features/dashboard/mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test** — add inside the shell `describe`:

```ts
it('renders the hero on a Faceplate with console controls', () => {
  expect(missionControlSrc).not.toContain('mission-hero');
  expect(missionControlSrc).toContain("kicker=\"MISSION CONTROL\"");
  expect(missionControlSrc).toContain("'cap cap-select'");
  // contract pins still present
  expect(missionControlSrc).toContain('data-dashboard-hero-toggle="agent-runs"');
  expect(missionControlSrc).toContain('data-dashboard-hero-toggle="employee-queues"');
  expect(missionControlSrc).toContain('aria-pressed={layout.agentRuns}');
  expect(missionControlSrc).toContain('data-dashboard-reset-layout=""');
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm -F @team-x/desktop exec vitest run src/features/dashboard/mission-control-dashboard.test.tsx`

- [ ] **Step 3: Retarget the button-class constants** — replace the constant block (keep the NAMES; `DASHBOARD_TOUCH_BUTTON_CLASS` value stays `'min-h-11'` exactly):

```ts
const DASHBOARD_TOUCH_BUTTON_CLASS = 'min-h-11';
const DASHBOARD_GLASS_BUTTON_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS}`;
const DASHBOARD_GHOST_BUTTON_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS}`;
const DASHBOARD_PILL_TOGGLE_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS}`;
const DASHBOARD_PILL_GHOST_CLASS = `${DASHBOARD_TOUCH_BUTTON_CLASS}`;
const DASHBOARD_INTERACTIVE_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
```

Rationale: the shadcn `Button` (`variant="outline"` → `.cap`, `variant="ghost"` → `.cap`) supplies all chrome post-Phase-1; these constants now only carry the touch-height + (for interactive card-buttons) the focus ring. `DASHBOARD_INTERACTIVE_FOCUS_CLASS` is unchanged (raised card-buttons keep ring focus — pinned by the test).

- [ ] **Step 4: Replace the `<header>` open + grid background** — change `<header className="mission-hero overflow-hidden rounded-[28px] border border-white/10 p-6 lg:p-7">` and its immediate `<div className="flex flex-col gap-6">` to a `Faceplate` whose body holds the existing hero content:

```tsx
        <Faceplate
          kicker="MISSION CONTROL"
          serial={company?.slug ?? undefined}
          stripeSlot={
            company?.status ? <LampTile label={company.status} tone="exec" small interactive={false} /> : undefined
          }
          bodyClassName="flex flex-col gap-6"
        >
```

Close it with `</Faceplate>` where the original `</header>` was. Delete the now-duplicated `<div className="flex flex-col gap-6">…</div>` wrapper (the `bodyClassName` replaces it) — i.e. unwrap one level so the inner `<div className="flex flex-col gap-4 xl:flex-row …">` becomes the first child of the Faceplate body.

- [ ] **Step 5: Replace the eyebrow + company badges block** — the `<div className="flex flex-wrap items-center gap-2 text-eyebrow text-muted-foreground">` containing `LayoutPanelTop` + "Mission Control" + the slug/status `Badge`s: drop the two `Badge`s (slug/status now live in the Faceplate stripe via `serial`/`stripeSlot`). Keep the icon + the `Mission Control` text node but retag as a placard eyebrow:

```tsx
                <div className="flex flex-wrap items-center gap-2 text-eyebrow text-silver-mute">
                  <LayoutPanelTop className="h-4 w-4 text-armed" />
                  Mission Control
                </div>
```

- [ ] **Step 6: Convert the two panel-toggle buttons to `cap-select`** — for the Agent Runs toggle, replace its `className={cn(DASHBOARD_PILL_TOGGLE_CLASS, layout.agentRuns ? 'border-brand/40 bg-black text-brand hover:bg-black' : 'border-white/10 bg-black text-muted-foreground hover:bg-black')}` with:

```tsx
                    className={cn(DASHBOARD_PILL_TOGGLE_CLASS, layout.agentRuns && 'cap cap-select')}
```

Do the identical change for the Employee Queues toggle (`layout.employeeQueues && 'cap cap-select'`). Keep every other prop (`variant="outline"`, `data-dashboard-hero-toggle`, `aria-pressed`, `aria-label`, `disabled`, icon, label) UNCHANGED.

- [ ] **Step 7: Retoken the Reset-layout ghost button + the metadata badge row** — the Reset button keeps `className={DASHBOARD_PILL_GHOST_CLASS}` (now console). For the `<div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">` badge row, convert each `Badge variant="outline"` count chip to a recessed readout chip. Replace each badge of the form `<Badge variant="outline" className="border-white/10 bg-black text-foreground/80" [data-…]>{N} label</Badge>` with:

```tsx
                  <RecessedWell className="flex items-center gap-2 px-3 py-1.5" [data-…]>
                    <span className="font-data text-label tabular-nums text-[hsl(var(--display-fg))]">{N}</span>
                    <span className="text-eyebrow-sm text-silver-mute">label</span>
                  </RecessedWell>
```

For the three **attention** chips (`data-dashboard-autonomy-badge="routines"`, `data-dashboard-runtime-badge`, `data-dashboard-autonomy-badge="approvals"`), keep the same RecessedWell but append a warn lamp when the attention condition holds, e.g. for approvals:

```tsx
                  <RecessedWell className="flex items-center gap-2 px-3 py-1.5" data-dashboard-autonomy-badge="approvals">
                    <span className="font-data text-label tabular-nums text-[hsl(var(--display-fg))]">{pendingApprovalCount}</span>
                    <span className="text-eyebrow-sm text-silver-mute">pending approvals</span>
                    {pendingApprovalCount > 0 && <LampTile label="ATTN" tone="hold" small interactive={false} />}
                  </RecessedWell>
```

Preserve every `data-dashboard-*` attribute and the existing conditional text (e.g. the runtime chip's `runtimeOperationsReady ? … : 'runtime sessions'`). Keep the `dashboardLayout.isSaving` `<output … aria-live="polite">` and the `dashboardLayout.error` `role="alert"` / `data-dashboard-layout-error=""` block UNCHANGED (retoken `text-red-200` → `text-led-warn`).

- [ ] **Step 8: Retoken the action-button row** — the 5 nav action `Button`s (Open tickets / Command log / Telemetry / Autonomy / Runtimes) keep `variant="outline"` and `className={DASHBOARD_GLASS_BUTTON_CLASS}` (now console). No structural change.

- [ ] **Step 9: Run the test — expect PASS.** Run the dashboard test file. Fix until green.

- [ ] **Step 10: Gate + commit.** Biome write + `pnpm typecheck && pnpm lint:eslint`, then commit:
`feat(sweep): Phase 3 — Mission Control hero on Faceplate, cap-select toggles, readout chips`

---

## Task F3: Hero metrics → LcdWell + the Workforce-utilization VuMeter

Recompose `HeroMetric` to an `LcdWell` readout, and mount the single hero `VuMeter` on the Workforce-active tile per the VU Signal Manifest.

**Files:**
- Modify: `mission-control-dashboard.tsx`
- Test: `mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test:**

```ts
it('renders hero metrics as LCD wells with one workforce VU meter', () => {
  expect(missionControlSrc).toContain('<LcdWell');
  expect(missionControlSrc).toContain('label="Workforce utilization"');
  expect(missionControlSrc).toContain('<VuMeter');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Rewrite the `HeroMetric` component** — replace the whole function with an LCD-well tile (keeps the `onClick`→`<button>` affordance + focus ring, adds a `tone` and optional `meter`):

```tsx
function HeroMetric({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
  tone = 'go',
  meter,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  onClick?: () => void;
  tone?: 'go' | 'amber' | 'red';
  meter?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        <Icon className="h-4 w-4 text-armed" />
        {label}
      </div>
      <LcdWell tone={tone} className="flex items-end justify-between gap-3 px-3 py-2">
        <span className="text-numeric">{value}</span>
        {onClick && <ArrowRight className="h-4 w-4 text-[hsl(var(--display-fg))] transition-transform group-hover:translate-x-0.5" />}
      </LcdWell>
      {meter}
      <p className="text-caption text-silver-mute">{hint}</p>
    </>
  );
  const className = cn(
    'cap group flex flex-col gap-3 p-4 text-left',
    onClick && DASHBOARD_INTERACTIVE_FOCUS_CLASS,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
```

- [ ] **Step 4: Set tones + mount the VuMeter** at the call sites in the 6-metric grid:
  - "Live runs": leave default tone (`go`).
  - "External runtimes": `go`.
  - "Workforce active": add `tone="go"` and the meter prop:
    ```tsx
              <HeroMetric
                label="Workforce active"
                value={!hasWorkspace ? '--' : `${queueSummary.activeEmployees}/${employees.length}`}
                hint={ /* unchanged */ }
                icon={Activity}
                onClick={ /* unchanged */ }
                meter={
                  <VuMeter
                    value={employees.length > 0 ? queueSummary.activeEmployees / employees.length : 0}
                    label="Workforce utilization"
                  />
                }
              />
    ```
  - "Queue pressure": `tone={queueSummary.totalPressure > 0 ? 'amber' : 'go'}`.
  - "Blocked work": `tone={queueSummary.blocked > 0 ? 'red' : 'go'}`.
  - "Today cost": `tone="amber"`.

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Gate + commit:** `feat(sweep): Phase 3 — hero LCD readouts + workforce-utilization VU meter`

---

## Task F4: Shared panel chrome (PrimaryPanel, skeleton, message-state, runtime cell + tone helpers)

Recompose the reusable panel sub-components and the tone-class helper functions so F5/F6/F7 inherit console chrome.

**Files:** `mission-control-dashboard.tsx`, `mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test:**

```ts
it('builds panels from Faceplate + console state blocks', () => {
  expect(missionControlSrc).not.toContain('mission-panel');
  expect(missionControlSrc).toContain('lampToneForLiveStatus');
  expect(missionControlSrc).toContain('lampToneForRuntimeState');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Replace the two `liveStatusClassName` / `runtimeStateClassName` Badge-class helpers with LampTone helpers:**

```ts
function lampToneForLiveStatus(status: DashboardQueueRow['liveStatus']): LampTone {
  switch (status) {
    case 'thinking':
      return 'exec';
    case 'blocked':
      return 'hold';
    case 'error':
      return 'warn';
    default:
      return 'off';
  }
}

function lampToneForRuntimeState(tone: DashboardRuntimeOperationsSummary['stateTone']): LampTone {
  switch (tone) {
    case 'accent':
      return 'exec';
    case 'warning':
      return 'hold';
    case 'danger':
      return 'warn';
    default:
      return 'off';
  }
}

function lcdToneForRuntimeMetric(tone: DashboardRuntimeOperationsSummary['stateTone']): 'go' | 'amber' | 'red' {
  switch (tone) {
    case 'warning':
      return 'amber';
    case 'danger':
      return 'red';
    default:
      return 'go';
  }
}
```

(Delete `liveStatusClassName` and `runtimeStateClassName`; `liveStatusLabel` stays.)

- [ ] **Step 4: Recompose `PrimaryPanel`** — replace the `Card`/`mission-panel` body with a `Faceplate`:

```tsx
function PrimaryPanel({ title, description, countLabel, actions, children, dataPanel }: {
  title: string; description: string; countLabel?: string; actions?: ReactNode; children: ReactNode; dataPanel: string;
}) {
  return (
    <Faceplate
      kicker={title}
      serial={countLabel}
      stripeSlot={actions}
      bodyClassName="flex min-h-[24rem] flex-col gap-4"
      className="flex flex-col"
      data-dashboard-primary-panel={dataPanel}
    >
      <p className="text-body text-silver-mute">{description}</p>
      <div className="flex flex-1 flex-col">{children}</div>
    </Faceplate>
  );
}
```

NOTE: `Faceplate` spreads no extra DOM props, so `data-dashboard-primary-panel` will not reach the DOM through it. To preserve the pinned selector, wrap: keep the `data-dashboard-primary-panel={dataPanel}` on an outer `<div>` around the `Faceplate`:

```tsx
  return (
    <div data-dashboard-primary-panel={dataPanel} className="flex flex-col">
      <Faceplate kicker={title} serial={countLabel} stripeSlot={actions} bodyClassName="flex min-h-[24rem] flex-col gap-4">
        <p className="text-body text-silver-mute">{description}</p>
        <div className="flex flex-1 flex-col">{children}</div>
      </Faceplate>
    </div>
  );
```

- [ ] **Step 5: Recompose `PanelSkeletonRows`** — swap the `bg-black` skeleton blocks for `RecessedWell`:

```tsx
  return (
    <div className={cn('grid gap-3', className)} data-dashboard-panel-state="loading">
      {skeletonKeys.map((key) => (
        <RecessedWell key={key} className={cn(heightClassName, 'animate-pulse')} />
      ))}
    </div>
  );
```

- [ ] **Step 6: Recompose `PanelMessageState`** — replace the danger/default raw-color block with a recessed well + a lamp:

```tsx
  return (
    <RecessedWell
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      data-dashboard-panel-state={dataState}
    >
      <LampTile label={tone === 'danger' ? 'FAULT' : 'STBY'} tone={tone === 'danger' ? 'warn' : 'off'} small interactive={false} />
      <Icon className={cn('h-8 w-8', tone === 'danger' ? 'text-led-warn' : 'text-armed')} />
      <div className="space-y-1">
        <p className="text-body-strong text-[hsl(var(--display-fg))]">{title}</p>
        <p className="max-w-md text-body text-silver-mute">{description}</p>
      </div>
      {action}
    </RecessedWell>
  );
```

- [ ] **Step 7: Recompose `RuntimeMetricCell`** to an `LcdWell` numeric tile:

```tsx
function RuntimeMetricCell({ label, value, hint, icon: Icon, tone = 'default' }: {
  label: string; value: string; hint: string; icon: typeof Activity; tone?: DashboardRuntimeOperationsSummary['stateTone'];
}) {
  return (
    <div className="cap flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        <Icon className="h-4 w-4 text-armed" />
        {label}
      </div>
      <LcdWell tone={lcdToneForRuntimeMetric(tone)} className="px-3 py-2">
        <span className="text-numeric">{value}</span>
      </LcdWell>
      <p className="text-caption text-silver-mute">{hint}</p>
    </div>
  );
}
```

- [ ] **Step 8: Recompose `MissionControlDashboard`'s top-level error `Card`** (the `isError` branch, `mission-panel rounded-[24px]…`) into a `Faceplate`:

```tsx
          <Faceplate kicker="DASHBOARD FAULT" bodyClassName="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
            <LampTile label="FAULT" tone="warn" small interactive={false} />
            <AlertTriangle className="h-10 w-10 text-led-warn" />
            <div className="space-y-1">
              <h2 className="text-h3 text-[hsl(var(--display-fg))]">Dashboard data could not load</h2>
              <p className="text-body text-silver-mute">The mission-control shell is ready, but the employee roster query failed.</p>
            </div>
            {onRetry && (
              <Button type="button" variant="outline" onClick={onRetry} className={DASHBOARD_GLASS_BUTTON_CLASS}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
          </Faceplate>
```

- [ ] **Step 9: Run — expect PASS.** (F5–F7 will consume these.) Gate + commit:
`feat(sweep): Phase 3 — panel chrome on Faceplate + LCD/lamp tone helpers`

---

## Task F5: RuntimeOperationsBand recompose

**Files:** `mission-control-dashboard.tsx`, `mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test:**

```ts
it('recomposes the runtime operations band onto console hardware', () => {
  // contract pins preserved
  expect(missionControlSrc).toContain('data-dashboard-runtime-operations=""');
  expect(missionControlSrc).toContain('data-dashboard-runtime-state={summary.stateLabel}');
  expect(missionControlSrc).toContain('data-dashboard-runtime-session-list=""');
  expect(missionControlSrc).toContain('data-dashboard-runtime-budget-blocks=""');
  expect(missionControlSrc).toContain('data-dashboard-runtime-empty=""');
  // lamp tone helper used for the state + session badges
  expect(missionControlSrc).toContain('lampToneForRuntimeState(summary.stateTone)');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Recompose the band wrapper** — replace the `Card className="mission-panel …" data-dashboard-runtime-operations=""` + its `CardHeader`/`CardTitle` with a `Faceplate` wrapped in a `data-`carrying div (same wrap-for-selector rule as F4):

```tsx
    <div data-dashboard-runtime-operations="">
      <Faceplate
        kicker="EXTERNAL RUNTIME OPS"
        serial="HEARTBEAT · CHECKOUT"
        stripeSlot={
          <div className="flex items-center gap-2">
            <LampTile label={summary.stateLabel} tone={lampToneForRuntimeState(summary.stateTone)} small interactive={false} />
            {summary.budgetBlockedCount > 0 && (
              <span data-dashboard-runtime-budget-blocks="">
                <LampTile label="BUDG" tone="hold" small interactive={false} />
              </span>
            )}
          </div>
        }
        bodyClassName="space-y-4"
      >
        <div data-dashboard-runtime-state={summary.stateLabel} className="sr-only">{summary.stateLabel}</div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-3xl text-body text-silver-mute">
            External agents, active leases, heartbeat freshness, managed workspaces, and budget stop posture.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* keep the existing Refresh + Runtimes Buttons verbatim, classNames already console */}
          </div>
        </div>
        {/* keep the existing state branches (unselected/loading/error/ready) — they now use the F4 helpers */}
      </Faceplate>
    </div>
```

Notes: the `data-dashboard-runtime-state` selector is preserved on the `sr-only` div (it was on a Badge that becomes a LampTile; the Badge's visible text is now the lamp label, the testid moves to the sr-only mirror — the spec asserts the attribute, not the element type). Keep the `data-dashboard-runtime-budget-blocks` wrapper span. Keep the Refresh/Runtimes `Button`s and all four `RuntimeMetricCell`s unchanged (they're recomposed in F4).

- [ ] **Step 4: Recompose the recent-session cards** — the session map (`data-dashboard-runtime-session={session.id}`): replace the outer `rounded-2xl border border-white/10 bg-black p-4` with `cap p-4`, and replace the three status `Badge`s with `LampTile`s:
  - adapter-kind badge → `<LampTile label={session.adapterKind} tone="exec" small interactive={false} />`
  - status badge → `<LampTile label={session.status} tone={lampToneForRuntimeStatus(session.status)} small interactive={false} />` (add the helper below)
  - `workspaceManaged` "isolated" badge → `<LampTile label="ISO" tone="go" small interactive={false} />`
  Retoken `text-amber-200` failure text → `text-led-hold`, `data-dashboard-runtime-empty` block `border-dashed … bg-black` → `RecessedWell`. Add helper:

```ts
function lampToneForRuntimeStatus(status: string): LampTone {
  if (status === 'working') return 'exec';
  if (status === 'blocked' || status === 'stale') return 'hold';
  if (status === 'failed' || status === 'offline') return 'warn';
  return 'off';
}
```

- [ ] **Step 5: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — runtime operations band on Faceplate + lamp state vocabulary`

---

## Task F6: Agent-runs + Employee-queues panel bodies

**Files:** `mission-control-dashboard.tsx`, `mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test:**

```ts
it('recomposes the live board rows onto cap tiles with lamp status', () => {
  expect(missionControlSrc).toContain('data-dashboard-panel-state="agent-runs-ready"');
  expect(missionControlSrc).toContain('data-dashboard-panel-state="employee-queues-ready"');
  expect(missionControlSrc).toContain('data-dashboard-queue-row={row.employeeId}');
  expect(missionControlSrc).toContain('aria-label={`Open Copilot thread for ${run.label}`}');
  expect(missionControlSrc).toContain('aria-label={`Open chat with ${row.name}`}');
  expect(missionControlSrc).toContain('lampToneForLiveStatus(row.liveStatus)');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Agent-run rows** — for each run `<button>` (`aria-label={`Open Copilot thread for ${run.label}`}`): replace the `'group rounded-2xl border border-white/10 bg-black p-4 … hover:border-brand/30 hover:bg-black'` class with `'cap group p-4 text-left'` (keep `DASHBOARD_INTERACTIVE_FOCUS_CLASS`). Replace the status `Badge` (completed/failed/running raw colors) with:

```tsx
                                <LampTile
                                  label={run.status}
                                  tone={run.status === 'completed' ? 'go' : run.status === 'failed' ? 'warn' : 'exec'}
                                  small
                                  interactive={false}
                                />
```

Retoken the `agentRunsQuery.hasHistoryWarning` banner (`border-amber-500/25 bg-black text-amber-100`) → `RecessedWell` + `text-led-hold`; `run.failureReason` `text-red-300` → `text-led-warn`.

- [ ] **Step 4: Employee-queue rows** — for each `data-dashboard-queue-row` cell: replace `rounded-2xl border border-white/10 bg-black p-4` with `cap p-4`. Replace the `liveStatus` `Badge` with:

```tsx
                                    <LampTile label={liveStatusLabel(row.liveStatus)} tone={lampToneForLiveStatus(row.liveStatus)} small interactive={false} />
```

Recompose the pressure bar: change the rail `<div className="h-2 overflow-hidden rounded-full bg-black">` → `<div className="h-2 overflow-hidden rounded-pill bg-carbon-950">`, and the four segment fills:
  - open: `bg-slate-400/70` → `bg-graphite`
  - inProgress: `bg-brand/70` → `bg-armed`
  - blocked: `bg-amber-400/80` → `bg-led-hold`
  - done: `bg-emerald-400/80` → `bg-led-go`

Keep the Chat/Tickets `Button`s and their `aria-label`s verbatim. Recompose the "Primary Panels Hidden" empty `PrimaryPanel`'s inner `border-dashed border-white/10 bg-black` block → `RecessedWell`.

- [ ] **Step 5: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — agent-runs + employee-queues boards on cap tiles, lamp status, LED pressure bar`

---

## Task F7: Secondary rail (Copilot wrapper, Recent Commands, Telemetry Snapshot) + final legacy-absence sweep

**Files:** `mission-control-dashboard.tsx`, `mission-control-dashboard.test.tsx`

- [ ] **Step 1: Write the failing test — the global legacy-absence pins for the whole flagship:**

```ts
it('contains zero legacy composition after the full flagship sweep', () => {
  expect(missionControlSrc).not.toMatch(/\bbg-black\b/);
  expect(missionControlSrc).not.toMatch(/border-white\/\d/);
  expect(missionControlSrc).not.toContain('mission-panel');
  expect(missionControlSrc).not.toContain('rounded-2xl');
  expect(missionControlSrc).not.toContain('rounded-[24px]');
  expect(missionControlSrc).not.toContain('rounded-[28px]');
  expect(missionControlSrc).not.toContain('font-mono');
  expect(missionControlSrc).not.toMatch(/(?:text|bg|border)-(?:red|amber|emerald|slate|zinc)-\d/);
  // contract pins still present
  expect(missionControlSrc).toContain('data-dashboard-secondary-panel="copilot"');
  expect(missionControlSrc).toContain('data-dashboard-recent-commands=""');
  expect(missionControlSrc).toContain('data-dashboard-telemetry-snapshot=""');
  expect(missionControlSrc).toContain('data-dashboard-autonomy-snapshot=""');
});
```

- [ ] **Step 2: Run — expect FAIL** (Copilot/Commands/Telemetry rail not yet swept).

- [ ] **Step 3: Copilot insights rail card** — replace `Card className="mission-panel …"` with a `Faceplate kicker="COPILOT INSIGHTS" serial="SECONDARY RAIL"`. The inner `data-dashboard-secondary-panel="copilot"` block `rounded-2xl border border-white/10 bg-black p-4` → `RecessedWell` (keep the attribute). **Do NOT restyle `CopilotDashboardWidget` internals** (Phase 5/6 surface) — but the existing `[&_[data-copilot-widget…]]` retint overrides reference `bg-black`/`border-white/10`; replace those arbitrary-variant tokens with console equivalents to satisfy the legacy-absence pin: `[&_[data-copilot-widget-count]]:bg-black` → `[&_[data-copilot-widget-count]]:bg-carbon-900`, `…border-white/10` → `…border-[hsl(var(--hairline))]`, etc. Keep the widget itself untouched.

- [ ] **Step 4: Recent Commands card** — replace `Card className="mission-panel …" data-dashboard-recent-commands=""` with a `data-`-carrying div + `Faceplate kicker="RECENT COMMANDS" serial="COMMAND STREAM" stripeSlot={<Full log Button>}`. Each command-row `<button>` (`aria-label={`Open command log entry …`}`): `'group … rounded-2xl border border-white/10 bg-black p-4 … hover:border-brand/30 hover:bg-black'` → `'cap group p-4 text-left'` + keep `DASHBOARD_INTERACTIVE_FOCUS_CLASS`. The intent `Badge` (`border-brand/35 bg-black text-brand`) → `<LampTile label={intentLabel(entry.intent)} tone="exec" small interactive={false} />`.

- [ ] **Step 5: Telemetry Snapshot card** — replace `Card className="mission-panel …" data-dashboard-telemetry-snapshot=""` with a `data-`-carrying div + `Faceplate kicker="TELEMETRY SNAPSHOT" serial="EXECUTION PULSE" stripeSlot={<Open telemetry Button>}`. The four metric tiles (`rounded-2xl border border-white/10 bg-black p-4` with `text-eyebrow` label + `text-numeric`) → `<LcdWell className="px-4 py-3"><p className="text-eyebrow text-silver-mute">…</p><p className="mt-2 text-numeric">…</p></LcdWell>`. The "Current window" line `rounded-2xl … bg-black` → `RecessedWell`. The autonomy-snapshot `<button data-dashboard-autonomy-snapshot="">` `'rounded-2xl border border-white/10 bg-black … hover:border-brand/30 hover:bg-black'` → `'cap p-4 text-left'` + `DASHBOARD_INTERACTIVE_FOCUS_CLASS`; its inner `Badge` → `<LampTile label="PEND" tone={pendingApprovalCount > 0 ? 'hold' : 'off'} small interactive={false} />` alongside the `{pendingApprovalCount} pending` LCD count.

- [ ] **Step 6: Run — expect PASS** (all legacy-absence + contract pins green). If any legacy token remains, grep `mission-control-dashboard.tsx` for `bg-black|border-white|rounded-2xl|mission-|font-mono|-500|-400|-300|-200` and clear the stragglers.

- [ ] **Step 7: Gate + commit:** Biome write + `pnpm typecheck && pnpm lint:eslint && pnpm -F @team-x/desktop exec vitest run src/features/dashboard/mission-control-dashboard.test.tsx`
`feat(sweep): Phase 3 — secondary rail (copilot/commands/telemetry) swept; flagship legacy-free`

---

## Task S0: Create the consolidated sub-view pin test harness

**Files:** Create `apps/desktop/src/renderer/src/features/dashboard/dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Create the file with the read scaffold (no assertions yet — they land per sub-view task):**

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

const subtabsSrc = read('dashboard-subtabs.tsx');
const streamSrc = read('stream-view.tsx');
const cardsSrc = read('cards-view.tsx');
const employeeCardSrc = read('employee-card.tsx');
const timelineSrc = read('timeline-view.tsx');
const floorSrc = read('floor-view.tsx');
const commandsSrc = read('commands-view.tsx');

describe('dashboard cluster aesthetic sweep (Phase 3)', () => {
  it('placeholder — assertions added per sub-view task', () => {
    expect(typeof subtabsSrc).toBe('string');
    expect(typeof streamSrc).toBe('string');
    expect(typeof cardsSrc).toBe('string');
    expect(typeof employeeCardSrc).toBe('string');
    expect(typeof timelineSrc).toBe('string');
    expect(typeof floorSrc).toBe('string');
    expect(typeof commandsSrc).toBe('string');
  });
});
```

- [ ] **Step 2: Run — expect PASS** (scaffold only). `pnpm -F @team-x/desktop exec vitest run src/features/dashboard/dashboard-cluster-sweep.test.ts`

- [ ] **Step 3: Commit:** `test(sweep): Phase 3 — dashboard cluster sweep pin-test scaffold`

---

## Task S1: dashboard-subtabs → nav-tile rail

**Files:** `dashboard-subtabs.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions** (add an `it` to the describe):

```ts
it('subtabs use the nav-tile rail and keep label accessible names', () => {
  expect(subtabsSrc).toContain("{ label: 'Mission Control', icon: LayoutGrid, subview: 'cards' }");
  expect(subtabsSrc).toContain('nav-tile');
  expect(subtabsSrc).toContain('nav-tile-active');
  expect(subtabsSrc).not.toMatch(/\bbg-black\b/);
  expect(subtabsSrc).not.toContain('border-white/10');
  expect(subtabsSrc).not.toContain('rounded-full');
  expect(subtabsSrc).not.toContain('border-brand/30');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Recompose the rail + buttons** — replace the container `<div className="flex items-center gap-1 border-b border-border/70 bg-black px-4 py-2">` with `<div className="flex items-center gap-1 border-b border-[hsl(var(--hairline))] px-4 py-2">`, and the button `className` template with the nav-tile recipe. Import `cn`:

```tsx
import { cn } from '@/lib/utils.js';
```

```tsx
          <button
            type="button"
            key={tab.subview}
            onClick={() => setSubview(tab.subview)}
            className={cn(
              'nav-tile flex items-center gap-1.5 px-3.5 py-1.5 text-button-sm',
              isActive && 'nav-tile-active',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
```

(The `SUBTABS` array and the `{tab.label}` text node stay verbatim — accessible names preserved.)

- [ ] **Step 4: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — dashboard subtabs as nav-tile rail`

---

## Task S2: stream-view → Faceplate panes + display well + concurrency VuMeter

**Files:** `stream-view.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions:**

```ts
it('stream view uses console panes, a display well, and the concurrency VU meter', () => {
  expect(streamSrc).toContain('<VuMeter');
  expect(streamSrc).toContain('label="Live stream concurrency"');
  expect(streamSrc).toContain('thinkingCount / employees.length');
  expect(streamSrc).toContain('<LampTile');
  expect(streamSrc).not.toMatch(/\bbg-black\b/);
  expect(streamSrc).not.toContain('bg-zinc-500');
  expect(streamSrc).not.toContain('text-code-sm leading-relaxed text-foreground/80');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Imports** — add to `stream-view.tsx`:

```tsx
import { Faceplate, LampTile, VuMeter } from '@/components/console/index.js';
```

- [ ] **Step 4: Recompose `StreamPane`** — replace the outer `<button … className="flex h-full min-w-[280px] flex-col rounded-xl border border-border bg-black transition-colors hover:border-brand/30">` with a `cap` pane:

```tsx
    <button
      type="button"
      onClick={() => setSelected(employee.id)}
      className="cap flex h-full min-w-[280px] flex-col p-0 text-left"
    >
      <div className="flex items-center gap-2 border-b border-[hsl(var(--hairline))] px-4 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-carbon-900 text-xs font-semibold">
          {/* initials unchanged */}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-body-strong text-foreground">{employee.name}</p>
          <p className="truncate text-caption text-silver-mute">{employee.title}</p>
        </div>
        <LampTile label={isThinking ? 'LIVE' : 'IDLE'} tone={isThinking ? 'exec' : 'off'} small interactive={false} />
      </div>
```

For the stream body, wrap the `<pre>` in a recessed display well and move it onto display tokens + Iosevka (`.text-code-sm` is already Iosevka post-Phase-1):

```tsx
      <ScrollArea className="flex-1 px-4 py-3">
        {isThinking && live.currentStream.length > 0 ? (
          <pre className="whitespace-pre-wrap rounded-inset bg-[hsl(var(--void))] px-3 py-2 text-code-sm leading-relaxed text-[hsl(var(--display-fg))]">
            {live.currentStream.slice(-800)}
          </pre>
        ) : isThinking ? (
          <div className="flex items-center gap-2 text-caption text-silver-mute">
            <Radio className="h-3.5 w-3.5 animate-pulse text-armed" />
            Thinking...
          </div>
        ) : (
          <p className="text-caption italic text-silver-mute/60">Idle</p>
        )}
      </ScrollArea>
```

(Preserve `live.currentStream.slice(-800)` and the `ScrollArea`.)

- [ ] **Step 5: Recompose the header + mount the VuMeter** — replace the header `<div className="flex items-center gap-2 border-b border-border px-6 py-2">…` block:

```tsx
      <div className="flex items-center gap-3 border-b border-[hsl(var(--hairline))] px-6 py-2">
        <Radio className="h-4 w-4 text-armed" />
        <span className="text-caption font-medium text-silver-mute">
          {thinkingCount > 0 ? (
            <>
              <span className="text-armed">{thinkingCount} active</span>
              {' / '}
              {employees.length} total
            </>
          ) : (
            `${employees.length} employees — all idle`
          )}
        </span>
        <VuMeter
          className="ml-auto w-40"
          value={employees.length > 0 ? thinkingCount / employees.length : 0}
          label="Live stream concurrency"
        />
      </div>
```

Retoken the no-employees empty state `text-muted-foreground` → `text-silver-mute` (no structural change).

- [ ] **Step 6: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — stream view panes + display wells + concurrency VU meter`

---

## Task S3: cards-view + employee-card

**Files:** `cards-view.tsx`, `employee-card.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions:**

```ts
it('cards view + employee card use console hardware and keep the a11y label', () => {
  expect(cardsSrc).not.toMatch(/\bbg-black\b/);
  expect(cardsSrc).not.toContain('text-red-500');
  expect(employeeCardSrc).toContain('aria-label={`${employee.name}, ${employee.title} — ${statusLabel(displayStatus)}. Click to ${isSelected ? \'close\' : \'open\'} chat.`}');
  expect(employeeCardSrc).toContain('title={statusLabel(displayStatus)}');
  expect(employeeCardSrc).toContain('cap-select');
  expect(employeeCardSrc).toContain('<LampTile');
  expect(employeeCardSrc).not.toMatch(/\bbg-black\b/);
  expect(employeeCardSrc).not.toContain('font-mono');
  expect(employeeCardSrc).not.toContain('text-[11px]');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: `cards-view.tsx`** — imports: `import { LampTile, RecessedWell } from '@/components/console/index.js';`. SkeletonCard: `'flex flex-col gap-3 rounded-xl border border-border bg-black p-4'` → use `<RecessedWell className="flex flex-col gap-3 p-4 animate-pulse">`. Error block: replace `<AlertCircle className="… text-red-500" />` with a lamp + retoned icon:

```tsx
        <LampTile label="FAULT" tone="warn" small interactive={false} />
        <AlertCircle className="h-8 w-8 text-led-warn" />
        <p className="text-body-strong text-silver-mute">Failed to load employees</p>
```

Keep the Retry control (now a `Button variant="outline"`/`.cap` if it isn't already).

- [ ] **Step 4: `employee-card.tsx`** — imports: `import { LampTile } from '@/components/console/index.js';`. Replace `statusColor()` with a lamp-tone helper:

```ts
function lampTone(status: string): LampTone {
  switch (status) {
    case 'thinking':
      return 'exec';
    case 'blocked':
      return 'hold';
    case 'error':
      return 'warn';
    default:
      return 'off';
  }
}
```

(add `import type { LampTone } from '@/components/console/index.js';` or include it in the value import). Recompose the selection button class:

```tsx
      className={cn(
        'cap group relative flex w-full flex-col items-start gap-3 p-4 text-left',
        isSelected && 'cap-select',
      )}
```

Avatar `bg-black` → `bg-carbon-900`; replace the status dot `<span className={cn('h-2 w-2 …', statusColor(displayStatus))} title=… />` with a lamp while KEEPING the `title` for the tooltip contract:

```tsx
            <LampTile label={statusLabel(displayStatus).slice(0, 4).toUpperCase()} tone={lampTone(displayStatus)} small interactive={false} className="shrink-0" title={statusLabel(displayStatus)} />
```

(NOTE: `LampTile` renders a `<span>` when `interactive={false}` and spreads no `title`; if `title` cannot pass through, keep a sibling `<span className="sr-only" title={statusLabel(displayStatus)} />` OR retain a minimal dot carrying the `title`. Verify `LampTile` prop spread at implementation time — if it does not forward `title`, keep the original dot element but recolor it with a lamp token, e.g. `bg-[hsl(var(--led-scope))]`, and still satisfy the `title` pin.) Level chip `bg-black` → `bg-carbon-900`. Stream preview: outer `bg-black` → `bg-[hsl(var(--void))]`, `<pre>` `font-mono text-[11px] … text-foreground/70` → `text-code-sm … text-[hsl(var(--display-fg))]` (keep `streamRef`, `streamTail`, auto-scroll effect, `aria-label` verbatim).

- [ ] **Step 5: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — employee cards on cap-select tiles + lamp status + display stream well`

---

## Task S4: timeline-view

**Files:** `timeline-view.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions:**

```ts
it('timeline view uses stripe bands + lamp event tones', () => {
  expect(timelineSrc).not.toMatch(/\bbg-black\b/);
  expect(timelineSrc).not.toMatch(/text-(?:blue|green|red|purple|amber|cyan)-\d/);
  expect(timelineSrc).toContain('<StripeHeader');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Recompose** — imports: `import { StripeHeader } from '@/components/console/index.js';`. Replace the 7 event-icon raw colors with console tokens (map by family): `text-blue-400`→`text-led-scope`, `text-green-400`→`text-led-go`, `text-red-400`→`text-led-warn`, `text-purple-400`→`text-led-scope`, `text-amber-400`→`text-led-hold`, `text-cyan-400`→`text-led-scope`, default `text-muted-foreground`→`text-silver-mute`. Sticky date header `sticky top-0 z-10 mb-3 bg-black` → wrap the date label in `<StripeHeader kicker={dateLabel} />` (drop the raw `bg-black` sticky div, keep `sticky top-0 z-10` on the StripeHeader wrapper via `className`). Node dot `rounded-full border border-border bg-black` → `rounded-pill border border-[hsl(var(--hairline))] bg-carbon-950`; rail `border-l border-border` → `border-l border-[hsl(var(--hairline))]`; row hover `hover:bg-black` → `hover:bg-carbon-900`. Error icon `text-red-500` → `text-led-warn`.

- [ ] **Step 4: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — timeline view stripe bands + lamp event tones`

---

## Task S5: floor-view

**Files:** `floor-view.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions:**

```ts
it('floor view uses Faceplate, stripe level bands, lamp status, and removes the replace() hack', () => {
  expect(floorSrc).toContain('<Faceplate');
  expect(floorSrc).toContain('<StripeHeader');
  expect(floorSrc).toContain('<LampTile');
  expect(floorSrc).not.toMatch(/\bbg-black\b/);
  expect(floorSrc).not.toMatch(/(?:border|bg)-(?:amber|purple|blue|cyan|green|zinc|red)-\d/);
  expect(floorSrc).not.toContain(".replace('bg-', 'bg-')");
  expect(floorSrc).not.toContain('text-[9px]');
  expect(floorSrc).not.toContain('text-[10px]');
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Recompose** — imports: `import { Faceplate, StripeHeader, LampTile, LcdWell, type LampTone } from '@/components/console/index.js';`. Replace `levelColor()` to return a console bezel-tint class per level using hairline/led tokens (no raw `*-500/50 bg-black`); e.g. return `'border-[hsl(var(--led-hold-edge))]'` for officer, `'border-[hsl(var(--led-scope-edge))]'` for managers, `'border-[hsl(var(--hairline))]'` default — and apply cells as `cap` tiles (`'cap …'`) rather than `bg-black` boxes. Replace `statusIndicator()` with a `LampTone` helper: `thinking`→`exec`, `meeting`→`go`, `blocked`→`hold`, `error`→`warn`, idle/default→`off`; render the status as `<LampTile … small interactive={false} />`. Wrap the whole floor grid in a `<Faceplate kicker="OFFICE FLOOR" serial="LIVE">`. Replace each level group `<h3>` with `<StripeHeader kicker={levelLabel} />`. Header busy/idle counts → two `LcdWell`s (busy = `tone="amber"` when `thinkingCount>0`, idle default). Level chip `bg-black … text-[9px]` → `bg-carbon-900 … text-eyebrow-sm`. Avatar `bg-black` → `bg-carbon-900`. Title `text-[10px]` → `text-caption`. Delete the legend's `levelColor(l).replace('bg-', 'bg-').split(' ')[0]` hack — derive the legend swatch directly from the new `levelColor(l)` border class (it now returns a single border token, so use it directly).

- [ ] **Step 4: Run — expect PASS.** Gate + commit:
`feat(sweep): Phase 3 — floor view on Faceplate, stripe level bands, lamp status, LCD busy/idle`

---

## Task S6: commands-view (HIGHEST E2E RISK — preserve every testid + button structure)

**Files:** `commands-view.tsx`, `dashboard-cluster-sweep.test.ts`

- [ ] **Step 1: Write failing assertions (console-present + legacy-absent + FULL contract preserved):**

```ts
it('commands view swept while preserving every E2E selector and button rows', () => {
  // contract — every testid + structural guarantee
  expect(commandsSrc).toContain('data-testid="commands-view"');
  expect(commandsSrc).toContain('data-testid="commands-list"');
  expect(commandsSrc).toContain('data-testid="commands-loading"');
  expect(commandsSrc).toContain('aria-busy="true"');
  expect(commandsSrc).toContain('data-testid="commands-empty-state"');
  expect(commandsSrc).toContain('data-testid="commands-error-state"');
  expect(commandsSrc).toContain('<CommandRow key={entry.id} entry={entry} />');
  expect(commandsSrc).toContain('type="button"'); // rows stay buttons
  expect(commandsSrc).toContain('{truncated}'); // raw command text rendered
  expect(commandsSrc).toContain('{label}'); // intent label text node
  // console + legacy-absence
  expect(commandsSrc).toContain('<Faceplate');
  expect(commandsSrc).toContain('<LampTile');
  expect(commandsSrc).not.toMatch(/\bbg-black\b/);
  expect(commandsSrc).not.toMatch(/(?:text|border)-(?:emerald|red)-\d/);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Recompose chrome** — imports add `import { Faceplate, LampTile } from '@/components/console/index.js';`. Replace the `<Card className="flex flex-1 flex-col border-border bg-black">` + its `CardHeader`/`CardTitle` with a `Faceplate kicker="RECENT COMMANDS" serial={rows.length > 0 ? `${rows.length} SHOWN` : 'CMD+K'} bodyClassName="flex flex-1 flex-col p-0"` while keeping the outer `<div … data-testid="commands-view">` verbatim and the `ScrollArea` + the three state branches structurally identical. The `Terminal` header icon moves into the Faceplate stripe or drops (the placard kicker replaces the title).

- [ ] **Step 4: Recompose `SkeletonRow`** — the four `animate-pulse rounded bg-black` spans → `bg-carbon-900` (keep the row `border-b border-border/50`→`border-[hsl(var(--hairline))]`). Keep `aria-hidden="true"`.

- [ ] **Step 5: `EmptyState`** — `kbd … bg-black` → `kbd … bg-carbon-900` + `.text-shortcut`. Keep `data-testid="commands-empty-state"`.

- [ ] **Step 6: `ErrorState`** — `text-red-400` → `text-led-warn`; add a `<LampTile label="FAULT" tone="warn" small interactive={false} />` above the message. Keep `data-testid="commands-error-state"` + the Retry `Button`.

- [ ] **Step 7: `CommandRow`** — KEEP the `<button type="button" … title={`Click to copy: ${previewText}`}>` and `hover:bg-black focus-visible:bg-black` → `hover:bg-carbon-900 focus-visible:bg-carbon-900` (keep the focus ring). Intent `Badge` (`border-brand/35 bg-black text-brand`) → `<LampTile label={label} tone="exec" small interactive={false} />` (the `{label}` text node is preserved — `Route to Agent` stays visible). Outcome `Badge` (emerald/red) → `<LampTile label={outcomeOk ? 'OK' : 'ERR'} tone={outcomeOk ? 'go' : 'warn'} small interactive={false} />`. The copy-icon `text-emerald-400` (Check) → `text-led-go`. The `{truncated}` text node stays verbatim.

- [ ] **Step 8: Run the pin test — expect PASS, then run the affected E2E spec headlessly to confirm the contract really holds:**

Run: `pnpm -F @team-x/desktop exec vitest run src/features/dashboard/dashboard-cluster-sweep.test.ts`
Then (if the Electron E2E harness is available locally): `pnpm -F @team-x/desktop exec playwright test e2e/command-palette.spec.ts e2e/agentic-loop.spec.ts`
Expected: PASS (commands-view + commands-list visible, `commands-list` has exactly 2 button rows, `fire`/`hire`/`Route to Agent` text present). If Playwright cannot run locally, rely on CI Stage 1 and DO NOT modify the spec.

- [ ] **Step 9: Gate + commit:**
`feat(sweep): Phase 3 — recent commands view on Faceplate + lamp intent/outcome (E2E selectors intact)`

---

## Task R1: CHANGELOG entry

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Changed`, add as the FIRST bullet (above the Phase 2 entry):

```markdown
- **Aesthetic sweep Phase 3 — Mission Control.** Flagship dashboard and its eight
  sub-views recomposed onto the Command Console foundation: hero and every panel on
  brushed-aluminum Faceplates with stripe placards and hex bolts, marquee metrics and
  telemetry tiles as Departure-Mono LCD wells, all status badges retired for stencil
  word-lamps (live=exec, blocked=hold, error/fault=warn, done=go), live boards and rows
  on machined cap tiles, panel toggles as armed cap-select, dashboard subtabs as nav-tile
  rail, and the live output streams on void-black display wells (Iosevka). Two functional
  VU meters mounted on real 0–1 signals — hero workforce utilization and live stream
  concurrency. `mission-shell.tsx` (shared legacy primitive used by 22 unswept screens)
  intentionally deferred to its consumers' phases. Visual-only: behavior unchanged, E2E
  suite passes unmodified.
```

- [ ] **Step 2:** No `VERSION` bump (the sweep tags `v3.4.0` only at Phase 8 per the spec). Commit:
`chore(release): Phase 3 CHANGELOG — Mission Control sweep entry`

---

## Task GATE: Per-phase definition of done (CR-7 wall)

Run, in order, before opening the PR. Do not skip or reorder.

- [ ] **Stage 1 — CI green:** `pnpm typecheck && pnpm lint && pnpm lint:eslint && pnpm test`, then the full Electron E2E smoke. E2E MUST pass **unmodified** (visual-only sweep). 0 ESLint errors (125-warning baseline).
- [ ] **`/design-review`** skill audit of the swept dashboard against DESIGN.md's anti-slop checklist (both shifts) → fix every finding. Specifically verify: no decorative meters (only the two manifest VU mounts), displays dark in both shifts, lamp dual-form correct, no legacy composition mixed in, 60 fps on the dashboard (gradient/shadow recipes on panels not virtualized rows), 44 px touch targets retained (`min-h-11`).
- [ ] **Screenshot pack** — every swept surface (dashboard + the 5 subviews: cards/timeline/stream/floor/commands) × Night Ops + Day Shift, captured from the dev server → **Rocky's eyeball sign-off**.
- [ ] **Stage 2 — `/review`** on the diff (per-task spec + quality + the source-pin completeness). Force every finding to quote the code line that motivates it.
- [ ] **Stage 3 — Codex** (`dev-tools:codex-review`, Rocky-triggered ONLY). Any HIGH/`[P1]` blocks merge. Never self-clear.
- [ ] **Stage 4 — Rocky sign-off** → merge to `main`. (Stage 5 `/ship` + tag is release-only, Phase 8.)

---

## Self-review checklist (run by the plan author before handoff)

- **Spec coverage:** spec §3 Phase-3 row → flagship (F1–F7) + sub-views (S1–S6) ✓; mission-shell.tsx deliberately deferred with documented rationale ✓; spec §5 recomposition mapping table → every legacy surface has a console target in the LAMP/LCD maps + per-task steps ✓; spec §6 DoD → Task GATE ✓; VuMeter "real signal only" → VU Signal Manifest (exactly 2) ✓; both shifts → Task GATE screenshot pack ✓.
- **Placeholder scan:** every code step shows real classes/props; tone maps + helper functions defined once and reused; no "TBD"/"handle edge cases" ✓.
- **Type/name consistency:** `lampToneForLiveStatus`, `lampToneForRuntimeState`, `lampToneForRuntimeStatus`, `lcdToneForRuntimeMetric`, `lampTone` (employee-card/floor-view local) — names stable across the tasks that reference them ✓; `LampTone` imported wherever a helper returns it ✓; `DASHBOARD_*` constant NAMES preserved (test pins names, not values) ✓; `Faceplate` data-attribute caveat (wrap in a `data-`-carrying div) applied consistently in F4/F5/F7 ✓.
- **Known risk flagged for implementer:** `Faceplate`/`LampTile` prop-spread — confirm at implementation time whether `LampTile interactive={false}` forwards `title`/`data-*`; where it does not, use the documented fallback (sibling `sr-only` carrier or a recolored token dot). Verify `.text-code-sm` is Iosevka post-Phase-1 (foundation inventory says yes) before relying on it for stream wells.
