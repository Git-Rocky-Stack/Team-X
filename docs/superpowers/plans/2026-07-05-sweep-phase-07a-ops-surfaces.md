# v3.4.0 Aesthetic Sweep — Phase 7a (Ops Surfaces: Telemetry + Audit + Vault) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the Ops surfaces — Telemetry (4 files, the last `mission-shell` consumers), Audit (3 files), Vault (1 file) — onto the Command Console / Carbon Pro system, and establish the Recharts → console-token chart theme. Visual-only, zero behavior change, every E2E/a11y selector preserved.

**Architecture:** Per-file recompose onto the existing `components/console/` library (no new primitives), plus one new pure-constants module `features/telemetry/chart-theme.ts`. Contract = source-string-pin tests: a new `features/ops-cluster-sweep.test.ts` grows a per-file block per task; the two existing pinned suites (`telemetry-view.test.tsx` composition block, `audit-event-chip.test.tsx` color values) update red→green inside the tasks that sweep their files. Cross-file legacy-absence guard lands LAST (Phase-3 lesson 5).

**Tech Stack:** React 19 + TypeScript, Tailwind (console tokens in `styles/globals.css`), Recharts, Vitest source-string pins (node env), Biome + ESLint.

**Spec:** `docs/superpowers/specs/2026-07-05-sweep-phase-07a-ops-surfaces-design.md`

## Global Constraints

- **Branch:** `feat/v3.4.0-sweep-phase-07a-ops-surfaces` off `main` `6a6b961`. No version bump, no CHANGELOG entry (v3.4.0 tags at Phase 8).
- **Visual-only.** Zero behavior / IPC / data / query / store / hook / sort / filter / export change. Text content, element identity, and child ordering preserved. Decorative-only wrappers may be removed.
- **Selectors are law.** Preserved verbatim: every `data-telemetry-*` (incl. all nine `data-telemetry-*-state` values, `data-telemetry-stat="total-runs"`, `data-telemetry-subtab`, `data-telemetry-kind-filter`, row/controls/governance/subtabs attrs), `data-event-type`, `aria-label`/`aria-pressed` contracts, `File Vault` + `Audit Log` heading text, vault `N file(s)` count text.
- **`SubviewState.testId` renders `data-testid` — NOT arbitrary attrs.** Every pinned `data-telemetry-*-state="…"` selector survives via a wrapper div: `<div data-telemetry-company-state="loading"><SubviewState … /></div>`.
- **Displays-stay-dark (lesson 29):** anything inside a `RecessedWell`/chart/payload/table well reads `var(--display-fg)` — never `text-foreground`, `text-silver-mute`, or `text-muted-foreground`.
- **Lamp labels are 2–6-char stencil words** (LampTile contract): GO / HOLD / NO-GO / STBY / EXEC / LIVE / SYNC / WARN.
- **`.cap` is a padding-free visual recipe** — every `.cap` caller sizes itself (`px-3 py-1.5 text-button-sm` or icon `p-1.5`). No bare `className="cap"`.
- **`.nav-tile` segmented buttons:** `nav-tile px-3 py-1.5 text-button-sm` + conditional `nav-tile-active`, keeping `aria-pressed` + `data-*` (copilot-sidebar idiom).
- **Armed selection lives on chassis rows** (`border-[var(--armed-edge)] bg-[var(--armed-soft)]`), never tinted onto a `.well` (lesson 33).
- **Never build class names with template literals** (lesson 28 — Tailwind purge): static maps only.
- **Untouchable files:** `features/mission/mission-shell.tsx`, `features/mission/mission-shell.test.tsx` (purged Phase 8), `features/memory/memory-formatters.ts`.
- **Gates per task:** `pnpm lint` (Biome) · `pnpm lint:eslint` (0 err / 0 warn) · `pnpm typecheck` · `pnpm test` (or the scoped vitest run named in the step, with the FULL suite at Tasks 9–10). Commit only on green.
- **Commits:** imperative subject describing the change (never placeholders), trailer on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **Subagent delegation (if used):** edit-only-the-named-file, no git/tooling, never read or traverse `~/.claude`, any `.claude/` directory, or any `agents/` directory. Test contract authored centrally; every diff reviewed, gated, and committed centrally.
- **Console primitives (verified 2026-07-05):** `LampTone = 'off'|'go'|'hold'|'warn'|'nogo'|'exec'|'armed'`; `SubviewState(lampLabel, lampTone, title, description?, action?, children?, testId?, className?)`; `MetricTile(label, value, hint?, icon?, tone?: 'amber'|'red', onClick?)` spreads `data-*`; `Tag(mono?)`; `Faceplate(kicker?, serial?, bodyClassName?, stripeSlot?)`; `StripeHeader` trailing slot is `children`; `RecessedWell` spreads `data-*`.

---

### Task 1: Chart console theme module

**Files:**
- Create: `apps/desktop/src/renderer/src/features/telemetry/chart-theme.ts`
- Test: `apps/desktop/src/renderer/src/features/telemetry/chart-theme.test.ts`

**Interfaces:**
- Produces: `CHART_GRID_STROKE: string`, `CHART_TICK: { fontSize: number; fill: string }`, `CHART_TOOLTIP_STYLE: CSSProperties`, `CHART_SERIES: { tokens: string; cost: string }`, `getProviderSeriesColor(provider: string, index: number): string` — consumed by Tasks 3 and 5.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/renderer/src/features/telemetry/chart-theme.test.ts
import { describe, expect, it } from 'vitest';

import {
  CHART_GRID_STROKE,
  CHART_SERIES,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  getProviderSeriesColor,
} from './chart-theme.js';

describe('chart-theme console tokens', () => {
  it('draws grid and ticks from display-surface tokens (never silver/muted)', () => {
    expect(CHART_GRID_STROKE).toBe('var(--display-border)');
    expect(CHART_TICK.fill).toBe('var(--display-fg)');
    expect(CHART_TICK.fontSize).toBe(10);
  });

  it('styles the tooltip as a machined plate', () => {
    expect(CHART_TOOLTIP_STYLE.backgroundColor).toBe('var(--carbon-850)');
    expect(CHART_TOOLTIP_STYLE.border).toBe('1px solid var(--hairline-strong)');
    expect(CHART_TOOLTIP_STYLE.borderRadius).toBe('var(--r-inset)');
    expect(CHART_TOOLTIP_STYLE.color).toBe('var(--display-fg)');
  });

  it('tones the two area series: token burn = armed, cost = go', () => {
    expect(CHART_SERIES.tokens).toBe('var(--armed)');
    expect(CHART_SERIES.cost).toBe('var(--led-go)');
  });

  it('maps known providers onto the non-armed LED + metal family', () => {
    expect(getProviderSeriesColor('anthropic', 0)).toBe('var(--led-hold)');
    expect(getProviderSeriesColor('ollama', 0)).toBe('var(--led-go)');
    expect(getProviderSeriesColor('openai', 0)).toBe('var(--led-scope)');
    // Case-insensitive, mirroring the legacy getProviderColor contract.
    expect(getProviderSeriesColor('Anthropic', 0)).toBe('var(--led-hold)');
  });

  it('cycles a display-safe fallback ramp for unknown providers, never armed red', () => {
    const a = getProviderSeriesColor('unknown-a', 0);
    const b = getProviderSeriesColor('unknown-b', 1);
    expect(a).toMatch(/^var\(--/);
    expect(a).not.toBe(b);
    for (let i = 0; i < 12; i++) {
      expect(getProviderSeriesColor('x', i)).not.toContain('--armed');
    }
  });

  it('contains zero hardcoded hex colors', () => {
    const everything = JSON.stringify({ CHART_GRID_STROKE, CHART_SERIES, CHART_TICK, CHART_TOOLTIP_STYLE });
    expect(everything).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `pnpm vitest run src/renderer/src/features/telemetry/chart-theme.test.ts` (from `apps/desktop`)
Expected: FAIL — `Cannot find module './chart-theme.js'`

- [ ] **Step 3: Implement the module**

```ts
// apps/desktop/src/renderer/src/features/telemetry/chart-theme.ts
/**
 * Console-token Recharts theme (Phase 7a — sweep).
 *
 * Charts are DISPLAY SURFACES: they mount inside RecessedWells and stay dark
 * in both shifts, so every color here reads a display-safe token — ticks are
 * `--display-fg` (never silver/muted, which flip on Day Shift), the grid is
 * the display hairline, and the tooltip is a machined carbon plate.
 *
 * Series semantics: daily token volume burns armed red (usage = the
 * money-burning signal, matching the budget VU precedent); cost trend reads
 * go green. The categorical provider palette draws from the non-armed LED +
 * metal family — armed red stays reserved for LIVE.
 */

import type { CSSProperties } from 'react';

/** CartesianGrid stroke — the display-surface hairline. */
export const CHART_GRID_STROKE = 'var(--display-border)';

/** Axis tick style — phosphor text on the dark well. */
export const CHART_TICK = { fontSize: 10, fill: 'var(--display-fg)' } as const;

/** Tooltip contentStyle — machined plate floating over the well. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--carbon-850)',
  border: '1px solid var(--hairline-strong)',
  borderRadius: 'var(--r-inset)',
  fontSize: '12px',
  color: 'var(--display-fg)',
};

/** Area-series tones. */
export const CHART_SERIES = {
  tokens: 'var(--armed)',
  cost: 'var(--led-go)',
} as const;

/** Known providers → fixed categorical tokens (identity, not status). */
const PROVIDER_SERIES: Record<string, string> = {
  anthropic: 'var(--led-hold)',
  ollama: 'var(--led-go)',
  openai: 'var(--led-scope)',
  google: 'var(--led-warn)',
  groq: 'var(--phosphor)',
  openrouter: 'var(--platinum)',
  together: 'var(--chrome)',
  fireworks: 'var(--led-hold-dim)',
};

/** Display-safe ramp for unknown providers — dim LEDs + metals, no armed. */
const FALLBACK_SERIES = [
  'var(--led-scope-dim)',
  'var(--led-go-dim)',
  'var(--phosphor-dim)',
  'var(--chrome)',
  'var(--platinum)',
  'var(--graphite)',
];

/** Categorical series color — mirrors the legacy getProviderColor contract. */
export function getProviderSeriesColor(provider: string, index: number): string {
  const known = PROVIDER_SERIES[provider.toLowerCase()];
  if (known) return known;
  return FALLBACK_SERIES[index % FALLBACK_SERIES.length] ?? 'var(--graphite)';
}
```

- [ ] **Step 4: Run the test — expect PASS**, then the gates

Run: `pnpm vitest run src/renderer/src/features/telemetry/chart-theme.test.ts` → PASS (6 tests)
Run from repo root: `pnpm lint && pnpm lint:eslint && pnpm typecheck` → all clean

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/telemetry/chart-theme.ts apps/desktop/src/renderer/src/features/telemetry/chart-theme.test.ts
git commit -m "feat(sweep): Phase 7a — console-token Recharts theme module"
```

---

### Task 2: TelemetryView recompose (mission-shell exit #1)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx`
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx` (composition block ONLY)
- Create: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (harness + first per-file block)

**Interfaces:**
- Consumes: `Faceplate`, `StripeHeader`, `MetricTile`, `LampTile`, `Tag`, `SubviewState` from `@/components/console/index.js`.
- Produces: the harness shape of `ops-cluster-sweep.test.ts` that Tasks 3–9 extend (`readSrc(...)` helper + one `describe` per file).

- [ ] **Step 1: Rewrite the pins (red)**

(a) In `telemetry-view.test.tsx`, replace the `describe('Telemetry mission-language carry-forward', …)` block's first two tests with console pins — all selector assertions KEPT byte-identical, only composition assertions change:

```ts
describe('Telemetry console composition', () => {
  it('wraps TelemetryView in console faceplates with the selector contract intact', () => {
    expect(telemetryViewSrc).toContain('data-telemetry-view=""');
    expect(telemetryViewSrc).toContain('<Faceplate');
    expect(telemetryViewSrc).toContain('<MetricTile');
    expect(telemetryViewSrc).toContain('data-telemetry-controls=""');
    expect(telemetryViewSrc).toContain('data-telemetry-governance=""');
    expect(telemetryViewSrc).toContain('data-telemetry-subtabs=""');
    expect(telemetryViewSrc).toContain('data-telemetry-kind-filter-row=""');
    expect(telemetryViewSrc).not.toContain('mission-shell');
  });

  it('pins the top-level no-company state and segmented control selectors', () => {
    expect(telemetryViewSrc).toContain('data-telemetry-view-state="no-company"');
    expect(telemetryViewSrc).toContain('data-telemetry-subtab={tab.view}');
    expect(telemetryViewSrc).toContain('data-telemetry-kind-filter={filter}');
    expect(telemetryViewSrc).toContain("'nav-tile px-3 py-1.5 text-button-sm'");
  });
  // …the remaining tests in this block (per-surface states, governance wiring)
  // stay EXACTLY as they are, except the section-card assertion in the
  // 'wraps charts and tables' test moves to per-file console pins in Tasks 3–5:
  //   <MissionSectionCard → <Faceplate    and    <MissionControlRow → (drop)
});
```

(b) Create `ops-cluster-sweep.test.ts` with the 5a/5b6 harness + the telemetry-view block:

```ts
// apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts
/**
 * Phase 7a Ops-cluster sweep contract (source-string pins).
 * Per-file: console-present + legacy-absent + selectors-preserved.
 * The cross-file legacy-absence guard lands with the final sweep task.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const featuresDir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(featuresDir, rel), 'utf8');

describe('telemetry-view sweep', () => {
  const src = readSrc('telemetry/telemetry-view.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain("'nav-tile px-3 py-1.5 text-button-sm'");
    expect(src).toContain('<Tag');
    expect(src).toContain('<LampTile');
  });

  it('carries zero mission-family or raw-chrome legacy', () => {
    expect(src).not.toContain('mission-shell');
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
  });

  it('preserves the full selector contract', () => {
    for (const sel of [
      'data-telemetry-view=""',
      'data-telemetry-view-state="no-company"',
      'data-telemetry-subtabs=""',
      'data-telemetry-subtab={tab.view}',
      'data-telemetry-kind-filter-row=""',
      'data-telemetry-kind-filter={filter}',
      'aria-pressed={filter === active}',
      'data-telemetry-controls=""',
      'data-telemetry-governance=""',
    ]) {
      expect(src).toContain(sel);
    }
  });
});
```

- [ ] **Step 2: Run both — expect the new pins to FAIL** (source still Mission)

Run: `pnpm vitest run src/renderer/src/features/ops-cluster-sweep.test.ts src/renderer/src/features/telemetry/`
Expected: FAIL on console-present pins; behavior pins still green.

- [ ] **Step 3: Recompose `telemetry-view.tsx`** — exact mapping:

| Legacy | → Console |
|---|---|
| `MissionPageShell data-telemetry-view=""` | `<div data-telemetry-view="" className="flex h-full flex-col gap-4 overflow-y-auto p-4">` |
| `MissionHero` (eyebrow/title/description/icon/badge/meta) | `Faceplate kicker="Analytics command" serial="TELEMETRY"` → `<h1 className="text-h1 text-foreground">Telemetry</h1>` + description `text-caption text-silver-mute`; badge → `<Tag>{activeSubviewCopy.title}</Tag>`; meta pills row → `<Tag>{summaryBadges.subview}</Tag>` + `<Tag mono>{summaryBadges.kind}</Tag>` + `<LampTile small interactive={false} label={summaryQuery.isError ? 'NO-GO' : 'LIVE'} tone={summaryQuery.isError ? 'nogo' : 'go'} />` with the visible text ("Summary unavailable" / "Live analytics") kept as an adjacent caption span (content preserved) |
| 4 hero + 3 governance `MissionMetricTile` | `MetricTile` 1:1 (`label`/`value`/`hint`/`icon` map directly) |
| `MissionSectionCard title/description` ×2 | `Faceplate` + `StripeHeader` kicker (title) + `text-caption text-silver-mute` description; keep `data-telemetry-controls=""` / `data-telemetry-governance=""` on the Faceplate-wrapping div (`Faceplate` does NOT spread arbitrary DOM props — Phase-3 lesson 2: wrap in a `data-*`-carrying div) |
| `MissionSegmentedButton` (subtabs + kind chips) | `<button type="button" … aria-pressed={…} className={cn('nav-tile px-3 py-1.5 text-button-sm', isActive && 'nav-tile-active')}>` — `data-telemetry-subtab={tab.view}` / `data-telemetry-kind-filter={filter}` and `onClick` kept verbatim; subtabs gain explicit `aria-pressed={isActive}` (MissionSegmentedButton rendered it via `active`) |
| `MissionStateBlock … data-telemetry-view-state="no-company"` | `<div data-telemetry-view-state="no-company"><SubviewState lampLabel="STBY" lampTone="off" title="No workspace loaded" description="Choose or create a workspace to unlock the telemetry dashboard and analytics breakdowns." /></div>` |
| `MissionControlRow` | plain `flex` div |
| Badge `border-white/10 bg-black/20 …` | drop the overrides — plain `<Tag>` |
| governance Button `border-white/10 bg-black/10 hover:bg-black/20` | plain `Button variant="outline" size="sm"` (Phase-1 restyled) |

The `LIVE` steady-go lamp is a STATUS (analytics feed healthy), not armed — armed stays reserved for live/money-burning surfaces (dual-form rule).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm vitest run src/renderer/src/features/ops-cluster-sweep.test.ts src/renderer/src/features/telemetry/` → ALL PASS (new pins + `telemetry-subviews.test.tsx` untouched-green)
Run gates: `pnpm lint && pnpm lint:eslint && pnpm typecheck` → clean

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/telemetry/telemetry-view.tsx apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts
git commit -m "feat(sweep): Phase 7a — TelemetryView shell recomposed onto console primitives"
```

---

### Task 3: CompanyTelemetry recompose (first themed charts)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx`
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx` (the `'wraps charts and tables in mission section cards'` test: `<MissionSectionCard` → `<Faceplate` per file as each of Tasks 3–5 lands; keep `<MissionControlRow` pin only for not-yet-swept files, drop it entirely in Task 5)

**Interfaces:**
- Consumes: Task 1's `CHART_GRID_STROKE`, `CHART_TICK`, `CHART_TOOLTIP_STYLE`, `CHART_SERIES`.

- [ ] **Step 1: Add the failing block to `ops-cluster-sweep.test.ts`**

```ts
describe('company-telemetry sweep', () => {
  const src = readSrc('telemetry/company-telemetry.tsx');

  it('composes from console primitives with themed charts', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('CHART_SERIES.tokens');
    expect(src).toContain('CHART_SERIES.cost');
    expect(src).toContain('CHART_TOOLTIP_STYLE');
    expect(src).toContain('stroke={CHART_GRID_STROKE}');
  });

  it('carries zero mission-family legacy or hardcoded chart hex', () => {
    expect(src).not.toContain('mission-shell');
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain("hsl(var(--card))");
  });

  it('preserves the three per-state selectors', () => {
    expect(src).toContain('data-telemetry-company-state="loading"');
    expect(src).toContain('data-telemetry-company-state="error"');
    expect(src).toContain('data-telemetry-company-state="empty"');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, plus the updated `telemetry-view.test.tsx` chart-wrap pin.

- [ ] **Step 3: Recompose.** Mapping:

| Legacy | → Console |
|---|---|
| `MissionSectionCard` ×4 | `Faceplate` + `StripeHeader` kicker + caption description |
| `MissionMetricTile` ×5 | `MetricTile` (keep `data-telemetry-stat="total-runs"` ON the MetricTile — it spreads `data-*`) |
| `MissionStateBlock` ×3 | wrapper-div-selector + `SubviewState` (loading `lampLabel="SYNC" lampTone="hold"`, error `"NO-GO"/"nogo"` with the Retry `Button` as `action`, empty `"STBY"/"off"`) — titles/descriptions preserved verbatim |
| Retry Button `border-white/10 bg-black/10 text-foreground hover:bg-black/20` | plain `Button variant="outline"` |
| chart `<ResponsiveContainer>` | wrap each chart in `<RecessedWell className="p-3">`; gradient stops → `stopColor={CHART_SERIES.tokens}` / `{CHART_SERIES.cost}`; `stroke={CHART_SERIES.tokens}` / `{CHART_SERIES.cost}`; `CartesianGrid stroke={CHART_GRID_STROKE}`; `XAxis/YAxis tick={CHART_TICK}`; `Tooltip contentStyle={CHART_TOOLTIP_STYLE}` — tick/label formatters and all data wiring byte-identical |

- [ ] **Step 4: Run — PASS** (`pnpm vitest run src/renderer/src/features/ops-cluster-sweep.test.ts src/renderer/src/features/telemetry/`), gates clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/telemetry/company-telemetry.tsx apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx
git commit -m "feat(sweep): Phase 7a — CompanyTelemetry recomposed with console-token area charts"
```

---

### Task 4: EmployeeTelemetry recompose (display table idiom)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/employee-telemetry.tsx`
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx` (chart-wrap pin for this file)

- [ ] **Step 1: Failing block**

```ts
describe('employee-telemetry sweep', () => {
  const src = readSrc('telemetry/employee-telemetry.tsx');

  it('renders the sortable table inside a display well', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('text-[var(--display-fg)]');
    expect(src).toContain('border-[var(--display-border)]');
    expect(src).toContain('tabular-nums');
  });

  it('carries zero mission-family or raw-chrome legacy', () => {
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
    expect(src).not.toContain('rounded-[20px]');
    expect(src).not.toContain('text-foreground');
  });

  it('preserves state selectors and sort wiring', () => {
    expect(src).toContain('data-telemetry-employees-state="loading"');
    expect(src).toContain('data-telemetry-employees-state="error"');
    expect(src).toContain('data-telemetry-employees-state="empty"');
    expect(src).toContain('onClick={() => onClick(col)}');
    expect(src).toContain('function toggleSort');
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Recompose.** `MissionSectionCard` → `Faceplate`; 3 `MissionStateBlock` → wrapper-div + `SubviewState` (same tone mapping as Task 3); `MissionInsetSurface rounded-[20px] bg-black/15` → `RecessedWell className="overflow-hidden p-0"`. Table becomes a display surface: header row `border-b border-[var(--display-border)]`, header sort buttons `text-[var(--display-fg)] opacity-60 hover:opacity-100` (wiring + `SortIcon` untouched), body rows `border-b border-[var(--display-border)] last:border-b-0 hover:bg-white/[0.03]`, name cell `font-medium text-[var(--display-fg)]`, title sub-line `text-caption text-[var(--display-fg)] opacity-55`, numeric cells keep `tabular-nums` and gain `text-[var(--display-fg)]`. Retry button → plain outline.

- [ ] **Step 4: Run — PASS**, gates clean.

- [ ] **Step 5: Commit** — `feat(sweep): Phase 7a — EmployeeTelemetry table onto the display-well idiom`

---

### Task 5: CostBreakdown recompose (categorical charts + last mission-shell exit)

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/telemetry/cost-breakdown.tsx`
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)
- Modify: `apps/desktop/src/renderer/src/features/telemetry/telemetry-view.test.tsx` (finish the chart-wrap pin: all three files `<Faceplate`, drop the `<MissionControlRow` assertion)

**Interfaces:**
- Consumes: Task 1's `getProviderSeriesColor`, `CHART_GRID_STROKE`, `CHART_TICK`, `CHART_TOOLTIP_STYLE`.

- [ ] **Step 1: Failing block**

```ts
describe('cost-breakdown sweep', () => {
  const src = readSrc('telemetry/cost-breakdown.tsx');

  it('composes range chips, themed charts, and the summary table from console vocabulary', () => {
    expect(src).toContain("'nav-tile px-3 py-1.5 text-button-sm'");
    expect(src).toContain('getProviderSeriesColor');
    expect(src).toContain('CHART_TOOLTIP_STYLE');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<SubviewState');
  });

  it('carries zero mission-family legacy, raw hex, or raw chrome', () => {
    expect(src).not.toMatch(/Mission[A-Z]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(src).not.toContain('PROVIDER_COLORS');
    expect(src).not.toContain('border-white/');
    expect(src).not.toContain('bg-black');
  });

  it('preserves state selectors and range wiring', () => {
    expect(src).toContain('data-telemetry-cost-state="loading"');
    expect(src).toContain('data-telemetry-cost-state="error"');
    expect(src).toContain('data-telemetry-cost-state="empty"');
    expect(src).toContain('onClick={() => setRange(option.value)}');
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Recompose.** Delete the local `PROVIDER_COLORS` + `getProviderColor` (replaced by the theme module import — the only "logic" moved is the color lookup, contract-identical). Range `MissionSegmentedButton`s → `.nav-tile` buttons with `aria-pressed={range === option.value}`. Pie `Cell fill={getProviderSeriesColor(entry.provider, index)}`; Bar likewise; `Legend` formatter span → `text-[var(--display-fg)] opacity-70`. Both charts + the free-provider notice + the summary table move into `RecessedWell`s; the notice keeps its text inside the well (`border-dashed` inner div allowed); summary table = Task 4's display-table idiom exactly. States → wrapper-div + `SubviewState`. `MissionControlRow` → flex div.

- [ ] **Step 4: Run — PASS.** Then confirm the endgame census:

Run: `grep -rln "from.*mission-shell" apps/desktop/src/renderer/src/features apps/desktop/src/renderer/src/components`
Expected: **no output** — zero mission-shell importers remain. Record this in the commit body.

- [ ] **Step 5: Commit** — `feat(sweep): Phase 7a — CostBreakdown themed charts; mission-shell importer count hits zero`

---

### Task 6: Audit event-chip tone re-map

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/audit/audit-event-chip-helpers.ts` (COLOR VALUES ONLY)
- Modify: `apps/desktop/src/renderer/src/features/audit/audit-event-chip.tsx` (`text-xs` → `text-caption`)
- Modify: `apps/desktop/src/renderer/src/features/audit/audit-event-chip.test.tsx` (color-value assertions ONLY)
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)

**Interfaces:**
- Produces: `getEventTypeColor()` now returns one of five console chip class strings (below). Every key, label, aria, and `buildRowSummary` contract byte-identical.

**The five display-chip tones** (chips render inside the audit list's RecessedWell — display context, so LED tokens, not the Day-flipping `--tag-*` chassis family):

```ts
// Tone recipes (module-level consts in the helpers file):
const CHIP_GO = 'border-[var(--led-go-edge)] bg-[var(--go-soft)] text-[var(--led-go)]';
const CHIP_HOLD = 'border-[var(--led-hold-edge)] bg-[var(--hold-soft)] text-[var(--led-hold)]';
const CHIP_NOGO = 'border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] text-[var(--led-nogo)]';
const CHIP_SCOPE = 'border-[var(--led-scope-edge)] bg-[var(--scope-soft)] text-[var(--led-scope)]';
const CHIP_NEUTRAL = 'border-[var(--hairline)] bg-transparent text-[var(--display-fg)]';
```

**Semantic mapping (every key keeps its entry; value only):**
- **GO** — employee.hired, ticket.closed, extension.installed, authority.grant.created, agentic.completed, company.linked, runtime.checkout.claimed, runtime.artifact.created, runtime.session.recovered, plan.approved, work.completed, backup.created, vault.uploaded, rag.index.indexed/reindexed → wait, indexing is lifecycle-informational → SCOPE. Final assignment rule: *completion/creation/success* → GO.
- **HOLD** — authority.request.reviewed, approval.reviewed, review.requested, review.completed, ticket.assigned, runtime.session.stale, meeting.started/ended (attention events), employee.promoted (org change, notable) — rule: *review/pending/attention* → HOLD.
- **NOGO** — employee.fired, ticket.participantRemoved, extension.removed, authority.grant.deleted, authority.violation, work.failed, task.escalated, agentic.failed, company.linkFailed, runtime.checkout.conflict, runtime.execution.failed, vault.deleted, backup.restored → restore is recovery, not fault → GO. Rule: *failure/violation/removal/destructive* → NOGO.
- **SCOPE** — ticket.created, ticket.participantAdded, chat.sent, work.started, plan.proposed, task.delegated, agent.step, agentic (lifecycle), copilot.analyzed, copilot.insight, company.linkStarted, company.reconnected, company.packageExported/Imported, company.templateInstalled, mcp.added/removed/toggled, skill.assignmentUpdated, rag.index.*, runtime.session.started, runtime.heartbeat, runtime.execution.started/output. Rule: *informational lifecycle* → SCOPE.
- **NEUTRAL** — company.unlinked + `DEFAULT_COLOR`.

The executor applies the RULE per key (the four rules above are the review contract; borderline keys follow the closest rule and get called out in the commit body). `DEFAULT_COLOR = CHIP_NEUTRAL`.

- [ ] **Step 1 (red):** Update `audit-event-chip.test.tsx` — every `toBe('bg-…-600/20 text-…-400')` assertion becomes the mapped chip const string (import nothing; assert literal strings, e.g. `expect(getEventTypeColor('agentic.failed')).toBe('border-[var(--led-nogo-edge)] bg-[var(--warn-soft)] text-[var(--led-nogo)]')`). Do NOT touch any label/aria/summary assertion. Add the ops-cluster block:

```ts
describe('audit-event-chip sweep', () => {
  const helpersSrc = readSrc('audit/audit-event-chip-helpers.ts');
  const chipSrc = readSrc('audit/audit-event-chip.tsx');

  it('tones every event type from the LED display family', () => {
    expect(helpersSrc).toContain('var(--led-go-edge)');
    expect(helpersSrc).toContain('var(--led-nogo-edge)');
    expect(helpersSrc).not.toMatch(/bg-(green|red|blue|cyan|yellow|sky|rose|emerald|purple|orange|amber|slate|indigo|teal|violet|zinc)-600/);
  });

  it('keeps the chip shell contract', () => {
    expect(chipSrc).toContain('aria-label={ariaLabel}');
    expect(chipSrc).toContain('data-event-type={eventType}');
    expect(chipSrc).not.toContain('text-xs');
  });
});
```

- [ ] **Step 2: Run — FAIL** (`pnpm vitest run src/renderer/src/features/audit/ src/renderer/src/features/ops-cluster-sweep.test.ts`).
- [ ] **Step 3: Implement** — re-tone the map values + `DEFAULT_COLOR`; `text-xs` → `text-caption` in the chip shell (both className branches).
- [ ] **Step 4: Run — PASS**, gates clean.
- [ ] **Step 5: Commit** — `feat(sweep): Phase 7a — audit event chips re-toned onto the LED display family`

---

### Task 7: AuditView recompose

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/audit/audit-view.tsx`
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)

- [ ] **Step 1: Failing block**

```ts
describe('audit-view sweep', () => {
  const src = readSrc('audit/audit-view.tsx');

  it('composes from console primitives', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain("bg-[var(--void)]"); // payload pre = stream recipe
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]'); // chip selection
  });

  it('carries zero legacy chrome', () => {
    expect(src).not.toContain('amoled-menu-surface');
    expect(src).not.toContain('brand-selected');
    expect(src).not.toContain('bg-black');
    expect(src).not.toMatch(/\b(bg|text|border)-zinc-/);
    expect(src).not.toContain('rounded-full');
    expect(src).not.toContain('animate-spin');
  });

  it('preserves the heading, export, and pagination contracts', () => {
    expect(src).toContain('Audit Log');
    expect(src).toContain("handleExport('csv')");
    expect(src).toContain("handleExport('json')");
    expect(src).toContain('<AuditEventChip eventType={event.eventType} />');
    expect(src).toContain('setPage((p) => Math.max(0, p - 1))');
    expect(src).toContain('setPage((p) => p + 1)');
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Recompose.** Mapping (all handlers/state/hooks byte-identical):

| Legacy | → Console |
|---|---|
| root `amoled-menu-surface … bg-black` | `flex h-full flex-col gap-4 p-4` (console `bg-background` root) |
| no-company guard div | `SubviewState lampLabel="STBY" lampTone="off" title="Select a company to view the audit log."` inside a full-height centering div |
| header h1 + Shield | `Faceplate kicker="Governance" serial="AUDIT"` + `<h1 className="text-h1 text-foreground">Audit Log</h1>`; CSV/JSON `Button`s lose the zinc overrides (plain `variant="outline" size="sm"`); export-success span `text-green-400` → `text-led-go` |
| 3 `SummaryCards` `Card border-zinc-800 bg-zinc-900/50` | `MetricTile` ×3 — `label="Total Events" value={totalEvents.toLocaleString()}`, `label="Events Today"`, `label="Top Event Type" value={formatEventType(top.eventType)} hint={`${top.count} occurrences`}` (`'None'` fallback preserved) in a `grid grid-cols-3 gap-4` |
| `EventTypeChips` rounded-full zinc chips + `brand-selected` | chassis chips: `rounded-[var(--r-pill)] border px-2.5 py-0.5 text-button-sm` + active `border-[var(--armed-edge)] bg-[var(--armed-soft)] text-foreground` / idle `border-[var(--hairline)] text-muted-foreground hover:border-[var(--hairline-strong)] transition-colors`; Clear chip same family; count span `text-muted-foreground/60` |
| search/date `Input` zinc overrides | strip overrides — Phase-1 restyled `Input` + `.well-input` is already its recipe; icons `text-muted-foreground` |
| `Separator bg-zinc-800` | `bg-[var(--hairline)]` |
| event list `ScrollArea border-zinc-800 bg-zinc-900/30` | `RecessedWell className="flex-1 overflow-hidden p-0"` wrapping the `ScrollArea` — rows become display-surface rows: `border-[var(--display-border)]`, timestamp/actor/summary text `text-[var(--display-fg)]` with opacity steps (55/70/85), hover `hover:bg-white/[0.03]` |
| loading spinner `animate-spin border-brand` | `SubviewState lampLabel="SYNC" lampTone="hold" title="Loading audit events…"` |
| empty state Shield block | `SubviewState lampLabel="STBY" lampTone="off" title="No events match the current filters."` |
| payload `<pre bg-zinc-950 …>` | stream recipe: `max-h-48 overflow-auto rounded-inset bg-[var(--void)] p-3 text-code-sm text-[var(--display-fg)]` |
| pagination buttons zinc | `.cap px-3 py-1 text-button-sm` + `disabled:opacity-50` (recipe ships disabled states post-5b/6); page label `text-muted-foreground` |

- [ ] **Step 4: Run — PASS**, gates clean. (`data-event-type` chips untouched — Task 6 owns them.)
- [ ] **Step 5: Commit** — `feat(sweep): Phase 7a — AuditView recomposed onto console primitives`

---

### Task 8: VaultView recompose

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/vault/vault-view.tsx`
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (add block)

- [ ] **Step 1: Failing block**

```ts
describe('vault-view sweep', () => {
  const src = readSrc('vault/vault-view.tsx');

  it('composes from console primitives with armed row selection', () => {
    expect(src).toContain('<Faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<Tag');
    expect(src).toContain('<LampTile');
    expect(src).toContain('border-[var(--armed-edge)] bg-[var(--armed-soft)]');
  });

  it('carries zero legacy status colors or brand-tint selection', () => {
    expect(src).not.toContain('bg-brand/5');
    expect(src).not.toContain('text-green-400');
    expect(src).not.toContain('text-red-400');
    expect(src).not.toContain('bg-green-500/10');
    expect(src).not.toContain('bg-red-500/10');
    expect(src).not.toContain('animate-spin');
  });

  it('preserves the E2E text + handler contract', () => {
    expect(src).toContain('File Vault');
    expect(src).toContain("{stats.fileCount} file{stats.fileCount !== 1 ? 's' : ''}");
    expect(src).toContain('onClick={() => setSelectedFile(file)}');
    expect(src).toContain('handleVerify(selectedFile.id)');
    expect(src).toContain('handleDelete(selectedFile.id)');
    expect(src).toContain('Open Location');
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Recompose.** Mapping (hooks/handlers byte-identical, incl. the pre-existing `console.log` download path):

| Legacy | → Console |
|---|---|
| no-company div | centered `SubviewState lampLabel="STBY" lampTone="off" title="No company selected"` |
| header row (HardDrive + h1 + count + search + Upload) | `Faceplate kicker="Ops" serial="VAULT" bodyClassName="flex items-center justify-between"` — h1 `text-h1 text-foreground`, count `text-caption text-silver-mute`, search `Input` unchanged, Upload `Button` unchanged |
| loading `Loader2 animate-spin` | `SubviewState lampLabel="SYNC" lampTone="hold" title="Loading vault…"` |
| empty state | `SubviewState lampLabel="STBY" lampTone="off"` — both text branches preserved (`No matching files` / `No files in vault` + captions) |
| file row selection `bg-brand/5 border-l-2 border-brand` / idle `hover:bg-surface-100 border-l-2 border-transparent` | chassis-row armed selection: selected `border-[var(--armed-edge)] bg-[var(--armed-soft)]` / idle `border-transparent hover:border-[var(--hairline-strong)]` on a `rounded-card border px-6 py-3` row (divide-y drops in favor of row borders + `space-y-1` list padding) |
| tag `Badge text-[10px]` chips (row + detail) | `<Tag mono>{tag}</Tag>` |
| detail panel | chassis panel kept; SHA256 block → display well: `break-all rounded-inset bg-[var(--void)] p-2 text-code-sm text-[var(--display-fg)]`; `DetailRow` labels `text-label text-muted-foreground` kept, values `text-body text-foreground` |
| verify result `bg-green-500/10 text-green-400` / red | `flex items-center gap-1.5` row: `LampTile small interactive={false} label={ok ? 'GO' : 'NO-GO'} tone={ok ? 'go' : 'nogo'}` + text `Integrity verified` / `Hash mismatch` in `text-led-go` / `text-led-nogo` (icons dropped — the lamp is the status carrier; visible text preserved) |
| close (XCircle) button | `.cap p-1.5` icon button |

- [ ] **Step 4: Run — PASS**, gates clean.
- [ ] **Step 5: Commit** — `feat(sweep): Phase 7a — VaultView recomposed onto console primitives`

---

### Task 9: Cross-file legacy-absence guard + full gate

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts` (final block)

- [ ] **Step 1: Add the guard (green immediately if Tasks 2–8 are complete — it still runs red-first if any residue exists)**

```ts
describe('ops cluster cross-file legacy absence', () => {
  const files = [
    'telemetry/telemetry-view.tsx',
    'telemetry/company-telemetry.tsx',
    'telemetry/employee-telemetry.tsx',
    'telemetry/cost-breakdown.tsx',
    'audit/audit-view.tsx',
    'audit/audit-event-chip.tsx',
    'audit/audit-event-chip-helpers.ts',
    'vault/vault-view.tsx',
  ];

  it('keeps the swept ops files free of every legacy composition family', () => {
    for (const file of files) {
      const src = readSrc(file);
      expect(src, file).not.toContain('mission-shell');
      expect(src, file).not.toMatch(/Mission[A-Z]/);
      expect(src, file).not.toContain('brand-selected');
      expect(src, file).not.toContain('amoled-menu-surface');
      expect(src, file).not.toContain('border-white/');
      expect(src, file).not.toMatch(/\bbg-black\b/);
      expect(src, file).not.toMatch(/\b(bg|text|border)-(zinc|slate|emerald|rose|sky|violet|indigo|teal|cyan|purple|orange|amber|fuchsia|lime|pink)-[0-9]/);
      expect(src, file).not.toMatch(/#(c53439|22c55e|d97706|3b82f6|ef4444|a855f7|ec4899|14b8a6|f97316|6366f1|84cc16|06b6d4|f43f5e|8b5cf6|eab308)/);
    }
  });

  it('confirms zero mission-shell importers remain in the renderer', () => {
    // telemetry was the last consumer cluster; this pin locks the Phase-8 purge gate open.
    for (const file of files) {
      expect(readSrc(file)).not.toContain("from '@/features/mission/mission-shell.js'");
    }
  });
});
```

- [ ] **Step 2: Full local gate**

Run from repo root: `pnpm lint && pnpm lint:eslint && pnpm typecheck && pnpm test`
Expected: Biome clean · ESLint 0 err/0 warn · typecheck ×4 clean · full vitest suite green.
Also run: `pnpm audit:claims:strict` → 0 unallowed.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/features/ops-cluster-sweep.test.ts
git commit -m "test(sweep): Phase 7a cross-file legacy-absence guard"
```

---

### Task 10: Proof gate — build, dual-shift screenshot pack, PR

- [ ] **Step 1: Verify `var()` inside Recharts SVG on the real renderer** — build (`pnpm build`), boot the E2E test-mode harness, confirm chart strokes/fills resolve (inspect one AreaChart path's computed stroke). If any Recharts internal drops `var()`, fall back per the spec (resolve tokens once via `getComputedStyle` in `chart-theme.ts`) and re-run Tasks 1/3/5 pins.
- [ ] **Step 2: Screenshot pack** — the 5a/5b6 recipe (`_electron` launch of the built app in test mode; seed telemetry runs + vault files via the direct-IPC/E2E patterns; NEVER concurrent with the vitest suite — lesson 32). Surfaces × Night Ops + Day Shift: telemetry Company (charts populated) / Employees (table) / Cost (pie + bar + table) / empty states, audit (chips + expanded payload + filters active), vault (list + selection + detail + verify result). Save under `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/sweep-phase-07a/`. Delete any throwaway capture spec from `e2e/` before the PR (lesson 34).
- [ ] **Step 3: Audit the pack vs DESIGN.md both shifts** (bolt corners, Day-Shift well legibility, chart tick legibility — the 5a defect classes). Fix findings as atomic commits, re-capture.
- [ ] **Step 4: `/design-review`** against DESIGN.md's anti-slop checklist (categorical provider palette assignment is an explicit review item) → fix all findings.
- [ ] **Step 5: Push branch, open PR** — body lists: scope table, the zero-mission-shell census evidence, the chip tone-mapping table, zero-VuMeter rationale, screenshot pack link. Then Stage-1 CI → Stage-2 `/review` → **STOP: Stage-3 Codex is Rocky-triggered; Stage-4 is Rocky's sign-off. Never self-clear.**

---

## Self-review (spec coverage · placeholders · type consistency)

- **Spec coverage:** chart theme (T1), 4 telemetry files (T2–T5), chip helpers + shell (T6), audit-view (T7), vault-view (T8), cross-file guard (T9), Recharts-`var()` risk + pack + wall (T10). Zero VuMeters — per spec census. `mission-shell.tsx` deletion deliberately absent (Phase 8). 7b (Settings + proactive-controls) deliberately absent (own spec/plan after 7a merges).
- **Placeholder scan:** every step carries exact pin code, exact class strings, exact commands. The two rule-driven bulk edits (chip tone map ~60 keys; per-cell table classes) specify the rule AND the exact target strings the pins enforce.
- **Type consistency:** `getProviderSeriesColor(provider: string, index: number): string` matches the legacy `getProviderColor` call sites it replaces; `CHART_TICK` shape `{ fontSize, fill }` matches Recharts' `tick` prop object usage already in the files; `SubviewState` props match the verified interface; chip consts are plain strings so `getEventTypeColor`'s `Record<string, string>` contract is unchanged.
