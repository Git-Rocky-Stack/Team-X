# Sweep Phase 4b — Heavy Autonomy Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the four heavy autonomy panels (`runtime-profiles-panel`, `routines-panel`, `budgets-panel`, `runtime-operations-panel`) off the legacy `Mission*` primitives onto the Command Console design system — visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved — completing the Autonomy cluster (Phase 4).

**Architecture:** No new primitives — `MetricTile`, `Tag`, `SubviewState`, `Faceplate`, `RecessedWell`, `LampTile`, and `VuMeter` all shipped in Phases 1/3/4a. Each panel is recomposed in one task via a source-string-pin test (RED: console-present + legacy-absent + selectors-preserved → GREEN: recompose). VU meters are added only where a real `0–1` ratio already exists in the panel's data (clamped/guarded). A final task adds the cross-file legacy-absence pin + CHANGELOG + full gate.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4 + console recipes, Vitest (node env for source-pin), Biome, ESLint. Branch `feat/v3.4.0-sweep-phase-04b-heavy-panels` (already cut off `main` `22a51bd`; spec committed at `476c3ca`).

**Reference spec:** `docs/superpowers/specs/2026-06-24-sweep-phase-04b-heavy-panels-design.md`. **Reference playbook:** `docs/superpowers/plans/2026-06-17-sweep-phase-04a-autonomy-shell.md` (the 4a plan — identical mapping + test mechanism).

## Global Constraints

- **Node 22.22.2** — activate with `eval "$(fnm env)" && fnm use 22.22.2` before any pnpm/node command (laptop default is v20).
- **pnpm 9.15.9** via the repo `packageManager` pin.
- **ESLint baseline = 0 errors / 0 warnings.** Do not introduce a warning; do not disable a rule.
- **Visual-only.** No change to hooks, mutations, query wiring, store usage, props, handlers, IPC, or data shape. Element identity, text content, and ordering preserved; only the visual wrapper/classes change.
- **Every E2E/a11y selector preserved verbatim** (each task lists its file's selectors).
- **Displays-stay-dark + dual-shift** correct (the console primitives already enforce this).
- **`mission-shell.tsx` is NOT touched** (purged in Phase 8; still imported by ~12 non-4b consumers).
- **No structural file-split** (visual-only), even for the 1,035-LOC profiles panel.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Canonical Recompose Rules (apply in every Task 1–4)

All four panels use the SAME legacy family and the SAME mapping. This section is the single source of truth; per-file tasks list only their specific instances.

### Import swap
Remove the `Mission*` import block, e.g.:
```tsx
import {
  MissionIconButton,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionStateBlock,
} from '../mission/mission-shell.js';
```
Replace with the console primitives the file actually uses, from the barrel (add `VuMeter` where the task specifies a meter; add `cn` from `@/lib/utils.js` if the file builds conditional classNames and doesn't already import it):
```tsx
import { Faceplate, LampTile, type LampTone, MetricTile, RecessedWell, SubviewState, Tag, VuMeter } from '@/components/console/index.js';
```
Keep existing non-Mission imports (hooks, types, lucide icons still used). Biome normalizes order; keep imports contiguous at file top.

### Component mapping
| `Mission*` (legacy) | → Console | Notes |
|---|---|---|
| `MissionInsetSurface` (card / mini-card) | `RecessedWell` | Forwards `className` + `data-*`. No `tone` prop — for a `tone="danger"` inset use `RecessedWell` + `text-led-nogo` body. **Preserve every `data-*`.** |
| entity cards (`PolicyCard`, `RuntimeProfileCard`, `RoutineCard`, session/checkout rows) | `Faceplate` **or** `RecessedWell` | Use `RecessedWell` for the per-item card (it forwards the `data-*` selector). `Faceplate kicker=…` for a titled section. **`Faceplate` spreads NO DOM props** — if a `data-*` sits on it, wrap the `Faceplate` in a `<div data-…>`. |
| `MissionMetricTile` | `MetricTile` | Same `label`/`value`/`hint`/`icon` API. Tone a fault figure with `tone="red"`, a caution with `tone="amber"`. |
| `MissionStateBlock` | `SubviewState` | `title`/`description` map 1:1; `icon` is dropped (the word-lamp carries state). `tone="danger"` → `lampLabel="NO-GO" lampTone="nogo"`; default → `lampLabel="STBY" lampTone="off"`. Preserve any wrapping `data-*`. |
| `MissionIconButton` | a `.cap-chrome` square button | Preserve `title` (and `aria-label`/`onClick`/`disabled`). See snippet below. |
| `MissionControlRow` (header row) | `<div className="flex flex-wrap items-center justify-between gap-3">` | Plain flex row; no legacy border/radius. |
| `MissionPill` **with `tone`** (status) | `<LampTile label={word} tone={lampTone} small interactive={false} />` | Lamp label = the existing domain status word (content preserved; CSS stencil-uppercases). Tone via the map below. |
| `MissionPill` **no tone** (category/label) | `<Tag>{…}</Tag>` | e.g. `kind`, `scopeKind`, `runKind`, `adapterKind`, `triggerKind`, `executionMode`, `enabled`/`disabled`, `priority`. |
| `MissionPill mono` (ref/id/timestamp) | `<Tag mono>{…}</Tag>` | Iosevka chip. e.g. `heartbeatContract`, `expires …`. |

### Status-pill → lamp-tone map
```
accent  → 'go'     (positive / active / healthy / passed / working)
warning → 'hold'   (caution — steady amber; NOT 'warn', which blinks and is reserved for AnnunciatorRail)
danger  → 'nogo'   (terminal fault / failed / error / exceeded / offline)
default → 'off'     (idle) — or use <Tag> if it is a label rather than a state
```
Where a file has a `…Tone()` helper returning `'default' | 'accent' | 'warning' | 'danger'`, add a sibling that returns `LampTone` and use it at the lamp call sites (leave the original if other code still needs it; in these files it is only consumed by the pills being replaced, so converting it in place is fine):
```tsx
function healthLampTone(status: RuntimeProfileSummary['lastHealthStatus']): LampTone {
  if (status === 'error') return 'nogo';
  if (status === 'warning') return 'hold';
  if (status === 'healthy') return 'go';
  return 'off';
}
```

### Form fields → `.well-input`
The shared field constants in these panels —
```tsx
const FIELD_CLASSNAME = 'h-11 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-body text-foreground outline-none transition focus:border-brand/30';
const LABEL_CLASSNAME = 'text-eyebrow text-muted-foreground';
const TEXTAREA_CLASSNAME = 'min-h-[120px] w-full rounded-[18px] border border-white/10 bg-black/20 px-3 py-3 text-body text-foreground outline-none transition focus:border-brand/30';
```
become the console recipe (the `.well-input` recipe in `globals.css` carries the recessed inset surface, hairline border, and armed focus ring — verified present at `globals.css:792`):
```tsx
const FIELD_CLASSNAME = 'well-input h-11 w-full px-3 text-body';
const LABEL_CLASSNAME = 'text-eyebrow text-silver-mute';
const TEXTAREA_CLASSNAME = 'well-input min-h-[120px] w-full px-3 py-3 text-body';
```
(`.well-input` styles `<input>`, `<select>`, and `<textarea>`. Keep the per-element layout utilities `h-11`/`min-h-[120px]`/`w-full`/`px-*`/`py-*`; drop the `rounded-[Npx] border border-white/10 bg-black/20 … focus:border-brand/30` — the recipe owns those.)

### Buttons
- **Icon button** (`MissionIconButton`):
```tsx
<button
  type="button"
  title="<existing title>"
  onClick={<existing>}
  disabled={<existing>}
  className="cap-chrome flex h-10 w-10 items-center justify-center disabled:opacity-50"
>
  <Icon className="h-4 w-4" />
</button>
```
  For the `tone="danger"` delete buttons, keep `.cap-chrome` and tint the glyph `text-led-nogo`: `<Trash2 className="h-4 w-4 text-led-nogo" />`.
- **Primary action** (the hand-rolled `rounded-[16px]/rounded-full border border-brand/… bg-brand/… text-brand` Save/Create buttons): replace with a `.cap.cap-select` armed button, preserving `type`/`onClick`/`disabled` and the label text:
```tsx
<button type="button" className="cap cap-select px-4 py-2 text-button-sm disabled:opacity-50" disabled={<existing>} onClick={<existing>}>
  <existing label>
</button>
```
  (A `<button type="submit">` inside a `<form>` keeps `type="submit"`.)
- **Secondary action** (Enable/Disable toggle, etc.): `.cap px-3 py-2 text-button-sm`.

### Legacy classes to remove (these become the per-file legacy-absence pins)
`bg-black` (`/10`, `/15`, `/20`), `border-white/10`, `border-white/8`, `border-brand/15`, `border-brand/20`, `border-brand/25`, `border-brand/30`, `border-brand/35`, `bg-brand/8`, `bg-brand/10`, `bg-brand/15`, `bg-brand/20`, raw `rounded-[28px]/[24px]/[22px]/[18px]/[16px]/[14px]`, `rounded-full` (chips → `cap`/`Tag`; pill radius → `rounded-pill`), `rounded-md`, `font-mono` (→ `Tag mono`), `font-semibold` ad-hoc label styling (→ `text-eyebrow` / `text-body-strong`), raw status colors `text-red-200`/`text-red-100`/`text-amber-300`/`text-amber-200`/`text-emerald-300` (→ `text-led-nogo` / `text-led-hold` / `text-led-go`), and the amber failure block `rounded-md border border-amber-500/20 bg-amber-500/10 … text-amber-200` (→ `RecessedWell` + `text-led-hold`).

### VU meters — functional-only, real-ratio-only (clamped/guarded)
Add `VuMeter` (from the barrel) only at the binding the task specifies. `VuMeter` clamps internally, but still guard the denominator so the ratio is meaningful:
```tsx
<VuMeter className="w-40" label="<accessible name>" value={<denominator> > 0 ? <numerator> / <denominator> : 0} />
```

### Per-task gate (run after each recompose, before commit)
```bash
eval "$(fnm env)" && fnm use 22.22.2
npx biome check --write <changed files>
pnpm -F @team-x/desktop exec eslint <changed files relative to apps/desktop>
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts
pnpm -F @team-x/desktop run typecheck
```
Expected: Biome no errors, ESLint 0 errors/0 warnings, vitest GREEN, typecheck exit 0.

---

## Task 1: Recompose `runtime-profiles-panel.tsx` + create the cluster test harness

**Files:**
- Create: `apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts`
- Modify: `apps/desktop/src/renderer/src/features/autonomy/runtime-profiles-panel.tsx`

**Selectors to preserve (verbatim):** `data-runtime-profiles-panel`, `data-runtime-profile-card={profile.id}`, `data-runtime-adapter-diagnostics={profile.id}`, `data-runtime-validation-result={profile.id}`, `data-runtime-employee-binding={employee.id}`.

- [ ] **Step 1: Write the failing test harness with the runtime-profiles case**

Create `heavy-panels-cluster-sweep.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

describe('autonomy heavy panels aesthetic sweep (Phase 4b)', () => {
  it('runtime-profiles: console hardware + VU + selectors preserved, no legacy', () => {
    const src = read('runtime-profiles-panel.tsx');
    // console-present
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('well-input');
    // selectors preserved
    expect(src).toContain('data-runtime-profiles-panel');
    expect(src).toContain('data-runtime-profile-card={profile.id}');
    expect(src).toContain('data-runtime-adapter-diagnostics={profile.id}');
    expect(src).toContain('data-runtime-validation-result={profile.id}');
    expect(src).toContain('data-runtime-employee-binding={employee.id}');
    // legacy-absent
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toMatch(/border-white\/\d/);
    expect(src).not.toContain('font-mono');
    expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts`
Expected: FAIL — `runtime-profiles-panel.tsx` still imports `mission-shell.js` / contains `Mission*`.

- [ ] **Step 3: Recompose `runtime-profiles-panel.tsx`** — apply the Canonical Recompose Rules. Specific instances:

1. **Imports:** drop the `Mission*` block; add `import { Faceplate, LampTile, type LampTone, MetricTile, RecessedWell, SubviewState, Tag, VuMeter } from '@/components/console/index.js';`.
2. **Field constants:** convert `FIELD_CLASSNAME` / `LABEL_CLASSNAME` to the `.well-input` form (see Canonical → Form fields).
3. **`healthTone` → add `healthLampTone`** (returns `LampTone`: error→nogo, warning→hold, healthy→go, else off) and use it at the health `LampTile` call sites. Leave the original `healthTone` only if still referenced after the swap; it is consumed solely by the pills being replaced, so delete it once unused (no dead code).
4. **`RuntimeDiagnosticsGrid`** (line ~383): `MissionInsetSurface` → `RecessedWell` (keep `data-runtime-adapter-diagnostics={profile.id}`); the `executionMode` `MissionPill` → `LampTile label={profile.executionMode} tone={profile.executionMode === 'native' ? 'go' : 'hold'} small interactive={false}`. The per-row mini-cards `rounded-[14px] border border-white/10 bg-black/10` → `RecessedWell className="px-3 py-2"`; the row `tone` text colors map `accent→text-led-go`, `warning→text-led-hold`, `danger→text-led-nogo`, default→`text-foreground`; `row.mono` → keep the value in a `<Tag mono>` instead of `font-mono` span. The validation block `rounded-[14px] border border-brand/15 bg-brand/8` (keep `data-runtime-validation-result={profile.id}`) → `RecessedWell`; its `healthTone(validation.status)` pill → `LampTile` (add a `validationLampTone` mapping `healthy→go/error→nogo/warning→hold/else off`, or reuse `healthLampTone` since the union matches); the validation chips `rounded-full border border-white/10 bg-black/10` → `<Tag>` / `<Tag mono>`.
5. **`RuntimeProfileCard`** (line ~583): `MissionInsetSurface` → `RecessedWell` (keep `data-runtime-profile-card={profile.id}`). The kind/health/executionMode/enabled `MissionPill`s: `kind` → `<Tag>`; `lastHealthStatus` → `LampTile … tone={healthLampTone(profile.lastHealthStatus)}`; `executionMode` → `<Tag>`; `enabled?'enabled':'disabled'` → `<Tag>`. The icon tile `rounded-[14px] border border-white/10 bg-black/20 text-brand` → `cap-chrome flex h-10 w-10 items-center justify-center`. The Validate/Delete `MissionIconButton`s → `.cap-chrome` icon buttons (preserve `title`; Delete glyph `text-led-nogo`; keep the `animate-spin` on the validating `RefreshCw`). The 3 `MissionMetricTile` → `MetricTile`. The Save `<button>` (`rounded-[16px] border border-brand/20 bg-brand/10 … text-brand`) → `.cap.cap-select` (Canonical → Buttons).
6. **`RuntimeConfigFields`** (line ~460): the `<select>`/`<input>` already use `FIELD_CLASSNAME` (now `.well-input`); no other change.
7. **Top metric grid** (line ~808): 4 `MissionMetricTile` → `MetricTile`. **Add the VU** to this region (a real, guarded ratio — native execution coverage):
```tsx
<VuMeter className="w-40" label="Native execution coverage" value={profiles.length > 0 ? nativeCount / profiles.length : 0} />
```
   Place it in a small header row above or beside the grid (e.g. inside a `Faceplate kicker="RUNTIME POSTURE"` wrapper, or a flex row) — keep `data-runtime-profiles-panel` on the outer `<div>`.
8. **Create-profile section** (line ~835) + **Employee-bindings section** (line ~973): `MissionInsetSurface` → `RecessedWell`; `<h3 className="text-h3">` stays; the `BYO agent posture` / `{employees.length} employees` `MissionPill`s → `<Tag>`; the Create `<button>` → `.cap.cap-select`; the per-employee row `rounded-[18px] border border-white/10 bg-black/10` (keep `data-runtime-employee-binding={employee.id}`) → `RecessedWell`; the binding `<select>` uses `.well-input`.
9. **Loading/error states** (`MissionStateBlock`, lines ~786/796) → `SubviewState` (loading→`lampLabel="STBY" lampTone="off"`, error→`lampLabel="NO-GO" lampTone="nogo"`). The "No runtime profiles" / "No employees" empty `MissionStateBlock`s → `SubviewState` (STBY/off).
10. **Error captions** `text-red-200` (`createError`/`bindError`/etc.) → `text-led-nogo`.

- [ ] **Step 4: Run test → PASS**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts`
Expected: PASS (runtime-profiles case green).

- [ ] **Step 5: Gate + commit** (per-task gate above). Commit:
```bash
git add apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts apps/desktop/src/renderer/src/features/autonomy/runtime-profiles-panel.tsx
git commit -m "feat(sweep): Phase 4b — recompose runtime-profiles-panel onto console primitives

Mission* -> Faceplate/RecessedWell/MetricTile/LampTile/Tag + .well-input forms;
health/executionMode as lamps/tags; native-coverage VU (guarded). Visual-only;
runtime-profile/adapter-diagnostics/validation/employee-binding selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Recompose `routines-panel.tsx`

**Files:** Modify `routines-panel.tsx` + add its `it` to `heavy-panels-cluster-sweep.test.ts`.

**Selectors to preserve:** `data-routines-panel`, `data-routine-card={routine.id}`, `data-routine-run={run.id}`.

- [ ] **Step 1: Add the failing test case** — append inside the `describe`:
```ts
it('routines: console hardware + VU + selectors preserved, no legacy', () => {
  const src = read('routines-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('<RecessedWell');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('well-input');
  expect(src).toContain('data-routines-panel');
  expect(src).toContain('data-routine-card={routine.id}');
  expect(src).toContain('data-routine-run={run.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toMatch(/border-white\/\d/);
  expect(src).not.toContain('font-mono');
  expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  expect(src).not.toContain('rounded-full');
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm -F @team-x/desktop exec vitest run …/heavy-panels-cluster-sweep.test.ts` — routines case fails).

- [ ] **Step 3: Recompose `routines-panel.tsx`:**
1. **Imports** → console barrel (`Faceplate, LampTile, type LampTone, MetricTile, RecessedWell, SubviewState, Tag, VuMeter`).
2. **Field constants** `FIELD_CLASSNAME`/`LABEL_CLASSNAME`/`TEXTAREA_CLASSNAME` → `.well-input` form (Canonical → Form fields).
3. **Add `runStatusLampTone`** for run status: `success→go`, `error→nogo`, else (`skipped`/`running`/pending)→`hold`.
4. **`RoutineCard`** (line ~269): `MissionInsetSurface` → `RecessedWell` (keep `data-routine-card={routine.id}`). The `triggerKind` `MissionPill tone="accent"` → `<Tag>` (category); `enabled?'enabled':'paused'` → `<Tag>`; `lastRunStatus` → `LampTile label={routine.lastRunStatus} tone={runStatusLampTone(routine.lastRunStatus)} small interactive={false}`. Run-now/Delete `MissionIconButton`s → `.cap-chrome` (preserve `title`; Delete glyph `text-led-nogo`). The 3 `MissionMetricTile` → `MetricTile`. The Save `<button>` (`rounded-full border border-brand/35 bg-brand/15 … text-brand`) → `.cap.cap-select`.
5. **Top metric grid** (line ~442): 4 `MissionMetricTile` → `MetricTile`. **Add the VU** (guarded enabled-ratio):
```tsx
<VuMeter className="w-40" label="Routines enabled" value={routines.length > 0 ? routines.filter((routine) => routine.enabled).length / routines.length : 0} />
```
   Place beside/above the grid; keep `data-routines-panel` on the outer `<div>`.
6. **Create-routine section** (line ~469): `MissionInsetSurface` → `RecessedWell`; the Create `<button>` (`rounded-full …`) → `.cap.cap-select` (keep `type`/`disabled`/`onClick` and the `'Creating...'`/`'Create Routine'` label).
7. **Recent-runs section** (line ~575): `MissionInsetSurface` → `RecessedWell`; each run `MissionInsetSurface` (keep `data-routine-run={run.id}`) → `RecessedWell`; the `run.status` `MissionPill` (accent/danger/warning) → `LampTile … tone={runStatusLampTone(run.status)}` (note: the run uses `success`/`error`/else — same mapping); the `run.reason` `MissionPill` → `<Tag>`.
8. **All `MissionStateBlock`** (loading/error + the two empty states) → `SubviewState` (loading→STBY/off, error→NO-GO/nogo, empty→STBY/off).

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Gate + commit:**
```bash
git add apps/desktop/src/renderer/src/features/autonomy/routines-panel.tsx apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts
git commit -m "feat(sweep): Phase 4b — recompose routines-panel onto console primitives

Mission* -> RecessedWell/MetricTile/LampTile/Tag + .well-input forms; run status
as lamps; enabled-ratio VU (guarded). Visual-only; routines/routine-card/
routine-run selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Recompose `budgets-panel.tsx`

**Files:** Modify `budgets-panel.tsx` + add its `it`.

**Selectors to preserve:** `data-budgets-panel`, `data-budget-policy={policy.id}`, `data-budget-ledger={entry.id}`, `data-budget-approval={approval.id}`.

- [ ] **Step 1: Add the failing test case:**
```ts
it('budgets: console hardware + burn VU + selectors preserved, no legacy', () => {
  const src = read('budgets-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('<RecessedWell');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('well-input');
  expect(src).toContain('data-budgets-panel');
  expect(src).toContain('data-budget-policy={policy.id}');
  expect(src).toContain('data-budget-ledger={entry.id}');
  expect(src).toContain('data-budget-approval={approval.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toMatch(/border-white\/\d/);
  expect(src).not.toContain('font-mono');
  expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  expect(src).not.toContain('rounded-full');
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Recompose `budgets-panel.tsx`:**
1. **Imports** → console barrel (`LampTile, type LampTone, MetricTile, RecessedWell, SubviewState, Tag, VuMeter`).
2. **Field constants** → `.well-input` form.
3. **Add `alertLampTone`**: `exceeded→nogo`, `warning`/`approval-required`→`hold`, else→`go`. (Mirrors the existing `alertTone`; convert the pill call sites.)
4. **`PolicyCard`** (line ~90): `MissionInsetSurface` → `RecessedWell` (keep `data-budget-policy={policy.id}`). The `scopeKind` `MissionPill tone="accent"` → `<Tag>`; `alertLevel` `MissionPill` → `LampTile label={policy.alertLevel} tone={alertLampTone(policy.alertLevel)} small interactive={false}`; `enabled?'enabled':'disabled'` → `<Tag>`; the conditional `auto-pause` `MissionPill tone="warning"` → `LampTile label="auto-pause" tone="hold" small interactive={false}`. The Enable/Disable `<button>` (`rounded-full border border-white/10 … uppercase`) → `.cap px-3 py-2 text-button-sm` (keep `onClick`/`disabled`). The Delete `MissionIconButton` → `.cap-chrome` (glyph `text-led-nogo`). The 4 `MissionMetricTile` → `MetricTile`. **Add the per-policy burn VU** (guarded — `currentSpendUsd`/`hardCapUsd` are strings):
```tsx
const burnCap = Number(policy.hardCapUsd);
const burnSpend = Number(policy.currentSpendUsd);
const burnRatio = Number.isFinite(burnCap) && burnCap > 0 ? Math.min(1, burnSpend / burnCap) : 0;
// …in the card body:
<VuMeter className="w-full" label="Budget burn vs hard cap" value={burnRatio} />
```
5. **Create-policy form** (line ~270): `MissionInsetSurface` → `RecessedWell`; the `<form>` `<select>`/`<input>` use `.well-input`; the auto-pause checkbox `<label>` (`rounded-[18px] border border-white/10 bg-black/20`) → `RecessedWell` wrapper (keep the `<input type="checkbox">` — the machined checkbox styling shipped in 4a applies app-wide); the `errorMessage` `MissionPill tone="danger"` → `LampTile label={errorMessage} tone="nogo" small interactive={false}` (or a `text-led-nogo` caption — prefer the lamp to preserve the pill role); the submit `<button>` (`rounded-full border border-brand/30 …`) → `.cap.cap-select px-4 py-2 text-button-sm` (keep `type="submit"`/`disabled` and `'Saving...'`/`'Save Policy'`).
6. **Overview metric grid** (line ~394): 4 `MissionMetricTile` → `MetricTile` (`Warnings / Exceeded` tile `tone={overview && overview.exceededCount > 0 ? 'red' : overview && overview.warningCount > 0 ? 'amber' : undefined}`; `Pending Approvals` tile `tone={overview && overview.pendingApprovalCount > 0 ? 'amber' : undefined}`).
7. **Ledger section** (line ~452): `MissionInsetSurface` ×N → `RecessedWell` (keep `data-budget-ledger={entry.id}` on each entry); the `scopeKind`/`runKind` `MissionPill`s → `<Tag>`.
8. **Approvals section** (line ~505): `MissionInsetSurface` → `RecessedWell` (keep `data-budget-approval={approval.id}`); the `priority` `MissionPill tone="warning"` → `LampTile label={approval.priority} tone="hold" small interactive={false}`; the `Ban` glyph `text-amber-300` → `text-led-hold`.
9. **Provider-mix section** (line ~548): `MissionInsetSurface` → `RecessedWell`; the row value `font-semibold text-foreground` → `text-body-strong text-foreground tabular-nums` (on-token emphasis + figures, matching the 4a `0c79898` access-count fix).
10. **All `MissionStateBlock`** (loading/error + the 4 empty states) → `SubviewState`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Gate + commit:**
```bash
git add apps/desktop/src/renderer/src/features/autonomy/budgets-panel.tsx apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts
git commit -m "feat(sweep): Phase 4b — recompose budgets-panel onto console primitives

Mission* -> RecessedWell/MetricTile/LampTile/Tag + .well-input forms; alert level
as lamps; per-policy spend/cap burn VU (guarded). Visual-only; budgets/budget-
policy/budget-ledger/budget-approval selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Recompose `runtime-operations-panel.tsx`

**Files:** Modify `runtime-operations-panel.tsx` + add its `it`.

**Selectors to preserve:** `data-runtime-operations-panel`, `data-runtime-session={session.id}`, `data-runtime-checkout={checkout.id}`.

- [ ] **Step 1: Add the failing test case:**
```ts
it('runtime-operations: console hardware + utilization VU + selectors preserved, no legacy', () => {
  const src = read('runtime-operations-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('<RecessedWell');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('data-runtime-operations-panel');
  expect(src).toContain('data-runtime-session={session.id}');
  expect(src).toContain('data-runtime-checkout={checkout.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toMatch(/border-white\/\d/);
  expect(src).not.toContain('font-mono');
  expect(src).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Recompose `runtime-operations-panel.tsx`:**
1. **Imports** → console barrel (`LampTile, type LampTone, MetricTile, RecessedWell, SubviewState, Tag, VuMeter`).
2. **Add `sessionLampTone`** for `statusTone`'s union: `working`/`active`→`go`, `blocked`/`stale`→`hold`, `failed`/`offline`→`nogo`, else→`off`.
3. **`RuntimeSessionCard`** (line ~28): `MissionInsetSurface` → `RecessedWell` (keep `data-runtime-session={session.id}`). The `status` `MissionPill` → `LampTile … tone={sessionLampTone(session.status)}`; the `adapterKind` `MissionPill` → `<Tag>`; the `heartbeatContract` `MissionPill mono` → `<Tag mono>`. The info-grid `font-semibold text-foreground` key labels → `text-body-strong text-foreground` (drop `font-semibold`). The `failureReason` block (`rounded-md border border-amber-500/20 bg-amber-500/10 … text-amber-200`) → `RecessedWell className="px-3 py-2 text-caption text-led-hold"`.
4. **`TicketCheckoutRow`** (line ~78): `MissionInsetSurface` → `RecessedWell` (keep `data-runtime-checkout={checkout.id}`); `status` `MissionPill` → `LampTile … tone={sessionLampTone(checkout.status)}`; the `expires …` `MissionPill mono` → `<Tag mono>`.
5. **Header** (line ~129): `MissionControlRow` → `<div className="flex flex-wrap items-center justify-between gap-3">` (keep `<h2 className="text-h2 …">`). The Refresh `MissionIconButton` → `.cap-chrome` (preserve `title`). **Add the VU** to this header row (guarded utilization):
```tsx
<VuMeter className="w-40" label="Runtime utilization" value={sessions.length > 0 ? workingSessions / sessions.length : 0} />
```
6. **Metric grid** (line ~148): 4 `MissionMetricTile` → `MetricTile` (`Blocked` tile `tone={blockedSessions > 0 ? 'amber' : undefined}`).
7. **Empty checkout inset** (line ~192): `MissionInsetSurface` → `RecessedWell` (keep its text). The two `text-eyebrow text-muted-foreground` section headers stay (already console-safe; just ensure `text-silver-mute` if `text-muted-foreground` is on the legacy list — it is NOT, leave it).
8. **`MissionStateBlock`** (loading/error/empty) → `SubviewState`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Gate + commit:**
```bash
git add apps/desktop/src/renderer/src/features/autonomy/runtime-operations-panel.tsx apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts
git commit -m "feat(sweep): Phase 4b — recompose runtime-operations-panel onto console primitives

Mission* -> RecessedWell/MetricTile/LampTile/Tag; session/checkout status as lamps;
working/total utilization VU (guarded). Visual-only; runtime-operations/runtime-
session/runtime-checkout selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Cross-file legacy-absence pin + CHANGELOG + full gate

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the final cross-file legacy-absence test** — append inside the `describe`:
```ts
it('the whole 4b heavy-panel cluster is free of Mission* and legacy composition', () => {
  const files = [
    'runtime-profiles-panel.tsx',
    'routines-panel.tsx',
    'budgets-panel.tsx',
    'runtime-operations-panel.tsx',
  ];
  for (const file of files) {
    const src = read(file);
    expect(src, `${file} imports mission-shell`).not.toContain('mission-shell.js');
    expect(src, `${file} uses a Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src, `${file} has bg-black`).not.toMatch(/\bbg-black\b/);
    expect(src, `${file} has border-white/N`).not.toMatch(/border-white\/\d/);
    expect(src, `${file} has font-mono`).not.toContain('font-mono');
    expect(src, `${file} has raw status color`).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
    expect(src, `${file} has rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  }
});
```

- [ ] **Step 2: Run → it must pass.** If any file trips a pin, fix that file (a missed legacy class) and re-run. Then run the FULL autonomy + console suites to confirm no regression:
```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/ src/renderer/src/components/console/
```
Expected: all GREEN.

- [ ] **Step 3: CHANGELOG** — add under `## [Unreleased]` → `### Changed`, immediately above the Phase 4a entry (newest-first):
```markdown
- **Aesthetic sweep Phase 4b — heavy autonomy panels.** The four heavy
  instrumentation panels (`runtime-profiles`, `routines`, `budgets`,
  `runtime-operations`) recomposed off the legacy `Mission*` shell onto the
  Command Console foundation: `RecessedWell` cards, Departure-Mono `MetricTile`
  readouts, `.well-input` forms, stencil word-lamps for status, `Tag` chips for
  categories, and functional VU meters bound to real ratios already in each
  panel's data (native-execution coverage, routines-enabled, per-policy spend/cap
  burn, runtime utilization — every denominator guarded). Completes the Autonomy
  cluster (Phase 4). `mission-shell.tsx` remains for its non-autonomy consumers,
  purged in Phase 8. Visual-only: zero behavior/IPC/data change, every E2E/a11y
  selector preserved.
```

- [ ] **Step 4: Full local validation** (the CR-7 Stage-1 set):
```bash
eval "$(fnm env)" && fnm use 22.22.2
git diff --check
pnpm -F @team-x/desktop run typecheck
pnpm lint
pnpm lint:eslint
pnpm test
pnpm -F @team-x/desktop test:e2e
pnpm audit:claims:strict
```
Expected: all green. ESLint 0/0. E2E especially must stay green (the autonomy surface is structurally preserved — every selector pinned).

- [ ] **Step 5: Commit:**
```bash
git add apps/desktop/src/renderer/src/features/autonomy/heavy-panels-cluster-sweep.test.ts CHANGELOG.md
git commit -m "test(sweep): Phase 4b cluster legacy-absence pin + CHANGELOG

Cross-file guard that all 4 heavy panels are free of Mission*/bg-black/
border-white/font-mono/raw-status-colors/rounded-[Npx]; CHANGELOG entry for the
Phase 4b recompose (completes the Autonomy cluster).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria

- All 4 heavy panels free of `Mission*` imports + legacy composition (the Task 5 cross-file pin passes).
- Every E2E/a11y selector preserved (the per-file pins).
- Four functional VU meters, each bound to a real guarded `[0,1]` ratio (native coverage, routines-enabled, budget burn, runtime utilization).
- No new primitives; `mission-shell.tsx` untouched.
- Full local gate green incl. ESLint 0/0 and E2E.
- Branch `feat/v3.4.0-sweep-phase-04b-heavy-panels` ready for PR → CR-7 wall. This completes Phase 4 (Autonomy cluster).
