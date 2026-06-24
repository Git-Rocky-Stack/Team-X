# Sweep Phase 4a — Autonomy Shell + Light Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the Autonomy shell (`autonomy-view.tsx`) + its six light panels off the legacy `Mission*` primitives onto the Command Console design system — visual-only, zero behavior/IPC change, every E2E/a11y selector preserved.

**Architecture:** Two clear duplications justify shared-primitive extraction first (Task 1–3): promote `SubviewState` into the console library, and add console `MetricTile` + `Tag` primitives. Then recompose the 7 files (Task 4–10), each via a source-string-pin test (RED: console-present + legacy-absent + selectors-preserved → GREEN). A final task adds the global legacy-absence sweep + CHANGELOG + full gate.

**Tech Stack:** React 19, TypeScript, Tailwind 3.4 + console recipes, Vitest (node env for source-pin; jsdom for primitive render tests), Biome, ESLint. Branch `feat/v3.4.0-sweep-phase-04a-autonomy-shell` (already cut off `main` `2d576a8`).

**Reference spec:** `docs/superpowers/specs/2026-06-17-sweep-phase-04a-autonomy-shell-design.md`.

---

## Canonical Recompose Rules (apply in every Task 4–10)

Every panel applies the SAME mapping. This section is the single source of truth; per-file tasks list only their specific instances + file-specific snippets.

### Import swap
Remove the `Mission*` import block:
```tsx
import {
  Mission… (whatever the file uses)
} from '../mission/mission-shell.js';
```
Replace with the console primitives the file now uses, imported from the barrel, plus the new ones:
```tsx
import { Faceplate, LampTile, type LampTone, LcdWell, MetricTile, RecessedWell, StripeHeader, SubviewState, Tag } from '@/components/console/index.js';
```
(Import only what the file actually uses. Keep relative imports — e.g. `./memory-formatters.js` — and `@/` imports ordered builtin → external → internal → parent → sibling, matching the existing file; Biome will normalize.)

### Component mapping
| `Mission*` | → | Notes |
|---|---|---|
| `MissionPageShell` | a plain container `<div className="flex flex-col gap-6 p-4 lg:p-6" data-…>` | Drop the `.mission-shell` class + `.mission-grid` background. **Preserve the `data-autonomy-view` attr.** Chassis/grid lives at the app shell (Phase 2). |
| `MissionHero` | `Faceplate` + `StripeHeader` (see Task 4 snippet) | Title/eyebrow/description/meta-pills/children(metric grid). |
| `MissionSectionCard` / `MissionRailCard` | `Faceplate kicker={title} …` | `description` → a `text-caption text-silver-mute` line under the placard or `bodyClassName`. **Faceplate spreads NO DOM props** — if a `data-*`/selector sits on the card, wrap the `Faceplate` in a `<div data-…>`. |
| `MissionControlRow` (nav) | `nav-tile` rail | See Task 4 nav snippet. |
| `MissionControlRow` (button/header row) | `<div className="flex flex-wrap items-center gap-2 …">` | Plain flex row; no legacy border/radius. |
| `MissionSegmentedButton` (top nav) | `nav-tile` / `nav-tile-active` + `aria-current="page"` | Task 4. |
| `MissionSegmentedButton` (filter chips) | `cap` / `cap-select` | Approvals, artifacts, memory-budget chips. Preserve any `data-*-filter` attr. |
| `MissionMetricTile` | `MetricTile` (Task 2) | Same `label`/`value`/`hint`/`icon`/`onClick` API. |
| `MissionInsetSurface` | `RecessedWell` | **Forwards DOM props** (verified via `SubviewState`) — `data-*`/`className`/`tone`? No `tone` prop — for `tone="danger"` inset, use `RecessedWell` + a `text-led-nogo` body, not a tone prop. Preserve all `data-*`. |
| `MissionStateBlock` | `SubviewState` (Task 1) | `title`/`description` map 1:1; `icon` is dropped (word-lamp is the status carrier); `tone="danger"` → `lampLabel="NO-GO" lampTone="nogo"`, default → `lampLabel="STBY" lampTone="off"`. |
| `MissionIconButton` | console icon button (see Task 5 snippet) | A `cap` square button. **Preserve `title` + `aria-label`.** |
| `MissionPill` (status, has `tone`) | `LampTile label={word} tone={lampTone} small interactive={false}` | Lamp **label = the existing domain status word** (content preserved; CSS stencil-uppercases it). Tone via the map below. |
| `MissionPill` (category/label, no tone) | `<Tag>{…}</Tag>` (Task 3) | e.g. role, authMode, slug, kind. |
| `MissionPill mono` (ref/id/timestamp) | `<Tag mono>{…}</Tag>` | Iosevka chip. |

### Status-pill → lamp-tone map
```
accent  → 'go'     (positive / active / linked / passed)
warning → 'hold'   (caution — steady amber; NOT 'warn', which blinks and is reserved for AnnunciatorRail unacked alerts)
danger  → 'nogo'   (terminal fault / failed / denied)
default → use <Tag> (it is a label, not a status)
```
Where a file has a `…Tone()` helper returning `'accent' | 'warning' | 'danger'`, convert it to return `LampTone` directly:
```tsx
function statusLampTone(status: AutonomyDoctorStatus): LampTone {
  if (status === 'blocked') return 'nogo';
  if (status === 'warning') return 'hold';
  return 'go';
}
```
**Design-review note (flagged, not a blocker):** lamps carry the *domain* status word (`approved`/`denied`/`pending`/`blocked`/`ok`) rather than the live-execution canon (`GO`/`HOLD`/`NO-GO`). This preserves content exactly and is domain-accurate; the Phase 4 design-review confirms it.

### Legacy classes to remove (these become the per-file legacy-absence pins)
`bg-black` (and `/10`, `/15`, `/20`), `border-white/10`, `border-white/8`, `border-brand/25`, `border-brand/30` (chooser → `cap-select`), `text-red-200`, `text-red-100`, `text-emerald-300`, raw `rounded-[28px]/[24px]/[22px]/[18px]/[16px]/[14px]`, `rounded-full` (→ `rounded-pill`), `font-mono` (→ `Tag mono`), `font-semibold uppercase tracking-[…]` ad-hoc label styling (→ `text-eyebrow` / `Tag`). Replace inset surfaces' raw `rounded-md border border-white/10 bg-black/10` mini-cards with `RecessedWell` or `cap`.

### Per-task gate (run after each recompose, before commit)
```bash
eval "$(fnm env)" && fnm use 22.22.2
npx biome check --write <changed files>
pnpm -F @team-x/desktop exec eslint <changed files relative to apps/desktop>
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/autonomy-cluster-sweep.test.ts
pnpm -F @team-x/desktop run typecheck
```
Expected: Biome no errors, ESLint 0 errors, vitest GREEN, typecheck exit 0.

---

## Task 1: Promote `SubviewState` into the console library

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/subview-state.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`
- Delete: `apps/desktop/src/renderer/src/features/dashboard/dashboard-subview-state.tsx`
- Modify (importers): every dashboard file importing `./dashboard-subview-state.js`
- Test: `apps/desktop/src/renderer/src/components/console/subview-state.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/console/subview-state.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubviewState } from './index.js';

describe('SubviewState (console)', () => {
  it('renders the lamp label, title, and description', () => {
    render(
      <SubviewState lampLabel="STBY" lampTone="off" title="Nothing here" description="Empty." />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Empty.')).toBeInTheDocument();
    expect(screen.getByText('STBY')).toBeInTheDocument();
  });

  it('forwards testId to the well', () => {
    render(<SubviewState testId="probe" lampLabel="NO-GO" lampTone="nogo" title="Fault" />);
    expect(screen.getByTestId('probe')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/subview-state.test.tsx`
Expected: FAIL — `index.js` does not export `SubviewState`.

- [ ] **Step 3: Move the file**

Create `components/console/subview-state.tsx` with the EXACT current body of `features/dashboard/dashboard-subview-state.tsx`, changing the import to the sibling barrel:
```tsx
import type { ReactNode } from 'react';

import { LampTile, type LampTone, RecessedWell } from './index.js';

interface SubviewStateProps {
  /** Stencil word-lamp carrying the state: STBY (empty/idle) / NO-GO (fault). */
  lampLabel: string;
  lampTone: LampTone;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  testId?: string;
}

export function SubviewState({
  lampLabel,
  lampTone,
  title,
  description,
  action,
  children,
  testId,
}: SubviewStateProps) {
  return (
    <RecessedWell
      data-testid={testId}
      className="flex h-full min-h-[12rem] flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <LampTile label={lampLabel} tone={lampTone} small interactive={false} />
      <div className="space-y-1">
        <p className="text-body-strong text-[hsl(var(--display-fg))]">{title}</p>
        {description ? <p className="max-w-md text-body text-silver-mute">{description}</p> : null}
      </div>
      {children}
      {action}
    </RecessedWell>
  );
}
```
Add to `components/console/index.ts` (alphabetical position after `StripeHeader`):
```ts
export { SubviewState } from './subview-state';
```

- [ ] **Step 4: Repoint dashboard importers + delete the old file**

Run to find importers: `pnpm -F @team-x/desktop exec grep -rl "dashboard-subview-state" src/renderer/src` (or use the editor's search). In each (`stream-view.tsx`, `floor-view.tsx`, `cards-view.tsx`, and any other), replace:
```tsx
import { SubviewState } from './dashboard-subview-state.js';
```
with the barrel import — fold `SubviewState` into the file's existing `@/components/console/index.js` import line (alphabetical). Then delete `features/dashboard/dashboard-subview-state.tsx`.

- [ ] **Step 5: Run tests**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/subview-state.test.tsx src/renderer/src/features/dashboard/`
Expected: PASS (console test green; all dashboard tests still green — the `dashboard-cluster-sweep` test pins `SubviewState` usage by name, which still matches).

- [ ] **Step 6: Gate + commit**

```bash
npx biome check --write apps/desktop/src/renderer/src/components/console/subview-state.tsx apps/desktop/src/renderer/src/components/console/subview-state.test.tsx apps/desktop/src/renderer/src/components/console/index.ts apps/desktop/src/renderer/src/features/dashboard/stream-view.tsx apps/desktop/src/renderer/src/features/dashboard/floor-view.tsx apps/desktop/src/renderer/src/features/dashboard/cards-view.tsx
pnpm -F @team-x/desktop run typecheck
git add -A && git commit -m "refactor(console): promote SubviewState into the console library

Duplication emerged (dashboard + Phase 4a autonomy both need the recessed-well
empty/error state), so promote SubviewState from features/dashboard to
components/console and repoint dashboard importers. No behavior change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add console `MetricTile` primitive

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/metric-tile.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`
- Test: `apps/desktop/src/renderer/src/components/console/metric-tile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/console/metric-tile.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetricTile } from './index.js';

describe('MetricTile (console)', () => {
  it('renders label, value, and hint', () => {
    render(<MetricTile label="Operators" value="4" hint="human supervisors" />);
    expect(screen.getByText('Operators')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('human supervisors')).toBeInTheDocument();
  });

  it('renders as a button and fires onClick when interactive', () => {
    const onClick = vi.fn();
    render(<MetricTile label="Open" value="2" onClick={onClick} />);
    const button = screen.getByRole('button');
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/metric-tile.test.tsx`
Expected: FAIL — `index.js` does not export `MetricTile`.

- [ ] **Step 3: Implement the primitive**

Create `components/console/metric-tile.tsx`:
```tsx
import type { ComponentType, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils.js';

import { LcdWell } from './index.js';

type MetricIcon = ComponentType<{ className?: string }>;

interface MetricTileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** Eyebrow label above the readout. */
  label: string;
  /** The figure shown in the phosphor well. */
  value: string;
  /** Optional sub-line under the well. */
  hint?: string;
  /** Optional leading icon next to the label. */
  icon?: MetricIcon;
  /** LCD tone: undefined = green (default), amber = caution, red = fault. */
  tone?: 'amber' | 'red';
  /** When set, the tile renders as a button. */
  onClick?: () => void;
}

/**
 * Labeled console readout: an eyebrow label + a Departure-Mono LCD well +
 * an optional hint. The console-vocabulary replacement for the legacy
 * MissionMetricTile. Displays stay dark in both shifts (LcdWell carries the
 * literal void/phosphor values).
 */
export function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
  className,
  ...props
}: MetricTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-eyebrow text-silver-mute">
        {Icon ? <Icon className="h-4 w-4 text-silver-mute" /> : null}
        {label}
      </div>
      <LcdWell tone={tone} className="px-3 py-1.5">
        <span className="text-numeric tabular-nums">{value}</span>
      </LcdWell>
      {hint ? <p className="text-caption text-silver-mute">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn('cap flex flex-col gap-2 p-4 text-left', className)}>
        {body}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border border-[hsl(var(--hairline))] p-4',
        className,
      )}
      {...props}
    >
      {body}
    </div>
  );
}
```
> If `LcdWell`'s `tone` prop does not accept `undefined` for the green default, check `lcd-well.tsx` and pass `tone={tone ?? 'go'}`. If `rounded-card` is not a defined radius utility, use `rounded-control` (confirm against `tailwind.config.ts` `borderRadius` remap before writing).

Add to `index.ts` (alphabetical, after `LcdWell`):
```ts
export { MetricTile } from './metric-tile';
```

- [ ] **Step 4: Run test → PASS**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/metric-tile.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate + commit**

```bash
npx biome check --write apps/desktop/src/renderer/src/components/console/metric-tile.tsx apps/desktop/src/renderer/src/components/console/metric-tile.test.tsx apps/desktop/src/renderer/src/components/console/index.ts
pnpm -F @team-x/desktop exec eslint src/renderer/src/components/console/metric-tile.tsx src/renderer/src/components/console/metric-tile.test.tsx
pnpm -F @team-x/desktop run typecheck
git add -A && git commit -m "feat(console): add MetricTile readout primitive

Labeled Departure-Mono LCD readout (label + value well + hint), the console
replacement for the legacy MissionMetricTile used ~28× across the autonomy
cluster. Displays stay dark in both shifts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add console `Tag` primitive

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/tag.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`
- Test: `apps/desktop/src/renderer/src/components/console/tag.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/console/tag.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tag } from './index.js';

describe('Tag (console)', () => {
  it('renders its label', () => {
    render(<Tag>operator</Tag>);
    expect(screen.getByText('operator')).toBeInTheDocument();
  });

  it('renders a mono variant for refs/ids', () => {
    render(<Tag mono>ticket-123</Tag>);
    expect(screen.getByText('ticket-123')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/tag.test.tsx`
Expected: FAIL — no `Tag` export.

- [ ] **Step 3: Implement the primitive**

Create `components/console/tag.tsx`:
```tsx
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils.js';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Iosevka mono variant for refs / ids / timestamps. */
  mono?: boolean;
}

/**
 * Non-status category chip — the console replacement for a toneless/`mono`
 * MissionPill. Status (positive/caution/fault) must use LampTile instead; a
 * Tag is a neutral label only.
 */
export function Tag({ mono = false, className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-[hsl(var(--hairline))] px-2.5 py-0.5 text-eyebrow-sm text-silver-mute',
        mono && 'font-data tabular-nums',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
```
> Confirm `font-data` is the Iosevka/Departure token in `tailwind.config.ts` (Phase 1 mapped the mono families). If the token is named differently (e.g. `font-mono-data`), use that. Do NOT use raw `font-mono` (a legacy-absence pin forbids it).

Add to `index.ts` (alphabetical, after `SubviewState`):
```ts
export { Tag } from './tag';
```

- [ ] **Step 4: Run test → PASS**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/components/console/tag.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate + commit**

```bash
npx biome check --write apps/desktop/src/renderer/src/components/console/tag.tsx apps/desktop/src/renderer/src/components/console/tag.test.tsx apps/desktop/src/renderer/src/components/console/index.ts
pnpm -F @team-x/desktop exec eslint src/renderer/src/components/console/tag.tsx src/renderer/src/components/console/tag.test.tsx
pnpm -F @team-x/desktop run typecheck
git add -A && git commit -m "feat(console): add Tag category chip primitive

Neutral label/ref chip (with mono variant) — the console replacement for
toneless/mono MissionPills across the autonomy cluster. Status stays on
LampTile; Tag is labels only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Recompose `autonomy-view.tsx` (shell + hero + nav + access + rail) + create the cluster test harness

**Files:**
- Create: `apps/desktop/src/renderer/src/features/autonomy/autonomy-cluster-sweep.test.ts`
- Modify: `apps/desktop/src/renderer/src/features/autonomy/autonomy-view.tsx`

- [ ] **Step 1: Write the failing test harness with the autonomy-view case**

Create `autonomy-cluster-sweep.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

const viewSrc = read('autonomy-view.tsx');

describe('autonomy cluster aesthetic sweep (Phase 4a)', () => {
  it('autonomy-view: console shell + nav-tile + MetricTile, no Mission* / legacy', () => {
    // console-present
    expect(viewSrc).toContain("from '@/components/console/index.js'");
    expect(viewSrc).toContain('<MetricTile');
    expect(viewSrc).toContain('nav-tile');
    expect(viewSrc).toContain("aria-current={subview.value === activeSubview ? 'page' : undefined}");
    expect(viewSrc).toContain('<SubviewState');
    // selectors preserved
    expect(viewSrc).toContain('data-autonomy-view');
    expect(viewSrc).toContain('data-autonomy-subview={subview.value}');
    expect(viewSrc).toContain('data-cloud-link-card');
    expect(viewSrc).toContain('data-operator-invites');
    expect(viewSrc).toContain('data-operator-invite-compose');
    expect(viewSrc).toContain('data-operator-invite={invite.id}');
    // legacy-absent
    expect(viewSrc).not.toContain('mission-shell.js');
    expect(viewSrc).not.toContain('MissionPageShell');
    expect(viewSrc).not.toContain('MissionSegmentedButton');
    expect(viewSrc).not.toMatch(/\bbg-black\b/);
    expect(viewSrc).not.toContain('border-white/10');
    expect(viewSrc).not.toContain('text-red-200');
    expect(viewSrc).not.toContain('text-emerald-300');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/autonomy-cluster-sweep.test.ts`
Expected: FAIL — `viewSrc` still imports `mission-shell.js` / contains `MissionPageShell`.

- [ ] **Step 3: Recompose `autonomy-view.tsx`** — apply the Canonical Recompose Rules. Specific instances:

1. **Imports:** drop the `Mission*` block; add `import { Faceplate, LampTile, type LampTone, MetricTile, RecessedWell, StripeHeader, SubviewState, Tag } from '@/components/console/index.js';`. Keep `cn` from `@/lib/utils.js` (add if not present — the nav needs it).
2. **`MissionPageShell` → container** (both the no-company branch and the main return):
```tsx
<div className="flex flex-col gap-6 p-4 lg:p-6" data-autonomy-view="">
  …
</div>
```
3. **`MissionHero` → Faceplate hero.** Replace the hero header with:
```tsx
<Faceplate kicker="OPERATOR CONTROL PLANE" serial="AUTONOMY" bodyClassName="space-y-6">
  <div className="space-y-2">
    <h1 className="text-display font-display text-foreground">Autonomy</h1>
    <p className="max-w-3xl text-body text-silver-mute">{/* the existing description string */}</p>
  </div>
  <div className="flex flex-wrap gap-2">
    <Tag>{company.name}</Tag>
    <Tag>{company.slug}</Tag>
    <Tag>local-first</Tag>
    <Tag>cloud-ready seams</Tag>
  </div>
  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
    {/* the 4 MissionMetricTile → MetricTile, same label/value/hint/icon props */}
  </div>
</Faceplate>
```
   (No-company branch: same Faceplate hero, then a `SubviewState lampLabel="STBY" lampTone="off"` for the "needs an active workspace" block. Drop the `Workflow`/`ShieldCheck` hero `icon` — the Faceplate placard carries identity.)
4. **`MissionSectionCard` "Autonomy Scope" + nav `MissionControlRow`/`MissionSegmentedButton` → Faceplate + nav-tile rail:**
```tsx
<Faceplate kicker="AUTONOMY SCOPE" bodyClassName="space-y-3">
  <p className="text-caption text-silver-mute">This first slice ships the operator and access foundation plus the visible control-plane shell.</p>
  <div className="flex flex-wrap items-center gap-1">
    {AUTONOMY_SUBVIEWS.map((subview) => {
      const Icon = subview.icon;
      const isActive = subview.value === activeSubview;
      return (
        <button
          type="button"
          key={subview.value}
          onClick={() => setActiveSubview(subview.value)}
          aria-current={subview.value === activeSubview ? 'page' : undefined}
          data-autonomy-subview={subview.value}
          className={cn('nav-tile flex items-center gap-1.5 px-3.5 py-1.5 text-button-sm', isActive && 'nav-tile-active')}
        >
          <Icon className="h-3.5 w-3.5" />
          {subview.label}
        </button>
      );
    })}
  </div>
</Faceplate>
```
5. **Main content `MissionSectionCard` (panel host)** → `Faceplate kicker={activeCopy.title}` with the `activeCopy.description` as a `text-caption text-silver-mute` line; children unchanged (the panel switch + the inline access JSX).
6. **Access subview inline JSX:** `MissionStateBlock` → `SubviewState` (loading→STBY/off, error/empty→NO-GO/nogo); `MissionInsetSurface` → `RecessedWell` (preserve `data-cloud-link-card`, `data-operator-invites`, `data-operator-invite-compose`, `data-operator-invite={invite.id}`); status `MissionPill`s → `LampTile` (cloud-link state via `cloudLinkTone` converted to `LampTone`; invite status via `inviteStatusTone`→LampTone; `pendingInvites.length > 0 ? warning:accent` → hold:go); label/mono `MissionPill`s (authMode, role, source, deviceId, cloudWorkspaceId) → `<Tag>`/`<Tag mono>`. The `ACCESS_*_CLASSNAME` constants: replace `border border-white/10 bg-black/20`/`bg-black/10` with console field styling — `rounded-control border border-[hsl(var(--hairline))] bg-[hsl(var(--well))]` (confirm `--well` token; else reuse the input recipe). Replace the inner `rounded-lg border border-white/10 bg-black/10` mini-cards (Cloud Workspace Id / Last Sync) with `RecessedWell`. Replace `text-red-200` error text → `text-led-nogo`; `text-emerald-300` ready text → `text-led-go`.
7. **`AccessList` helper** (lines ~361): `MissionInsetSurface` → `RecessedWell`; the role/authMode/source/privilege `MissionPill`s → `<Tag>` (these are labels). The accent role pill → keep as `<Tag>` (role is a category, not live status).
8. **Right rail `MissionRailCard` ×2 → Faceplate;** inner `MissionInsetSurface` → `RecessedWell`; the posture key/value rows keep their text; `font-semibold uppercase tracking-[0.16em]` → `text-eyebrow`; sharing-readiness/cloud-link status `MissionPill`s → `LampTile`, label pills → `<Tag>`; `text-red-200`→`text-led-nogo`, `text-emerald-300`→`text-led-go`. The `Button` elements with `className="border-white/10 bg-black/10 hover:bg-black/20"` — drop that ad-hoc className (the `variant="outline"` console Button already styles correctly post-Phase-1).
9. Add the `LampTone` conversion helpers near the existing tone helpers (replace `cloudLinkTone`/`inviteStatusTone`/`sharingReadinessTone` return types `'accent'|'warning'|'danger'` with `LampTone` per the status→lamp-tone map). Update call sites to `<LampTile label={…} tone={…} small interactive={false} />`.

- [ ] **Step 4: Run test → PASS**

Run: `pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/autonomy-cluster-sweep.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit** (per-task gate above). Commit:
```bash
git add -A && git commit -m "feat(sweep): Phase 4a — recompose autonomy-view shell onto console primitives

Shell/hero/nav/access/rail off Mission* onto Faceplate/StripeHeader/MetricTile/
RecessedWell/SubviewState/LampTile/Tag + nav-tile rail (aria-current). Visual-only;
data-autonomy-view / data-autonomy-subview / data-operator-* selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Recompose `autonomy-doctor-panel.tsx`

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/autonomy/autonomy-doctor-panel.tsx`
- Modify: `autonomy-cluster-sweep.test.ts` (add the doctor `it`)

- [ ] **Step 1: Add the failing test case** — append to the `describe` in `autonomy-cluster-sweep.test.ts`:
```ts
it('doctor panel: console hardware, lamp status, selectors preserved, no legacy', () => {
  const src = read('autonomy-doctor-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('data-autonomy-doctor-panel');
  expect(src).toContain('data-autonomy-doctor-check={check.id}');
  expect(src).toContain('data-autonomy-doctor-finding={finding.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm -F @team-x/desktop exec vitest run …/autonomy-cluster-sweep.test.ts` — the doctor case fails).

- [ ] **Step 3: Recompose** `autonomy-doctor-panel.tsx`:
  - Imports → console barrel.
  - `statusTone`/`severityTone` → return `LampTone` (`blocked`→`nogo`, `warning`→`hold`, else `go`/`off`). Keep `statusIcon` ONLY if still used for the header glyph; per anti-slop, drop the per-row status icons and let the lamp carry status — remove `StatusIcon`/`CheckIcon` glyphs.
  - Top `MissionControlRow` → a `<div className="flex flex-wrap items-center justify-between gap-3">`; the `<h2 className="text-h2 …">` stays; the status `MissionPill` → `<LampTile label={report.status} tone={statusLampTone(report.status)} small interactive={false} />`.
  - `MissionIconButton` (Rerun) → console icon button (preserve `title`):
```tsx
<button
  type="button"
  title="Rerun Autonomy Doctor"
  onClick={() => { void doctorQuery.refetch(); }}
  disabled={doctorQuery.isFetching}
  className="cap flex h-10 w-10 items-center justify-center disabled:opacity-50"
>
  <RefreshCw className="h-4 w-4" />
</button>
```
  - The 4 `MissionMetricTile` → `MetricTile` (same props). Tone the Blocked tile red when `report.totals.blocked > 0`: `tone={report.totals.blocked > 0 ? 'red' : undefined}`; Warnings tile `tone={report.totals.warning > 0 ? 'amber' : undefined}`.
  - Each check `MissionInsetSurface` → `RecessedWell` (keep `data-autonomy-doctor-check`); check status `MissionPill` → `LampTile`; `MissionPill mono` (timestamp) → `<Tag mono>`.
  - Findings inner `rounded-md border border-white/10 bg-black/10` → `RecessedWell` (keep `data-autonomy-doctor-finding`); severity `MissionPill` → `LampTile`; ref `MissionPill mono` → `<Tag mono>`; "No findings" mini-card → a `RecessedWell` with caption text.
  - Loading/error states `MissionStateBlock` → `SubviewState` (loading→STBY/off, error→NO-GO/nogo).
  - **VU (lean-in, functional):** add `VuMeter` to the import and to the header row, bound to the checks-passing ratio (guarded denominator): `<VuMeter className="w-40" value={report.checks.length > 0 ? report.totals.ok / report.checks.length : 0} label="Doctor checks passing" />`.

- [ ] **Step 4: Run → PASS.** Run the cluster test; doctor case green.

- [ ] **Step 5: Gate + commit:**
```bash
git add -A && git commit -m "feat(sweep): Phase 4a — recompose autonomy-doctor-panel onto console primitives

Mission* → Faceplate row/MetricTile/RecessedWell/LampTile/Tag; status as
stencil word-lamps (no glyphs); doctor/check/finding selectors preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Recompose `autonomy-benchmark-panel.tsx`

**Files:** Modify `autonomy-benchmark-panel.tsx` + add its `it` to the cluster test.

- [ ] **Step 1: Failing test case:**
```ts
it('benchmark panel: console hardware, lamp status, selectors preserved, no legacy', () => {
  const src = read('autonomy-benchmark-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('data-autonomy-benchmark-panel');
  expect(src).toContain('data-autonomy-benchmark-result={result.scenarioId}');
  expect(src).toContain('data-autonomy-benchmark-runtime={kind}');
  expect(src).toContain('data-autonomy-benchmark-scenario={scenarioId}');
  expect(src).toContain('data-autonomy-benchmark-summary');
  expect(src).toContain('data-autonomy-benchmark-results');
  expect(src).toContain('data-autonomy-benchmark-runtime-group={runtimeKind}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Recompose:**
  - Imports → console barrel.
  - `resultTone` → `LampTone` (`passed`→`go`, else `nogo`).
  - Top `MissionControlRow` header → flex row (keep `<h2>`, the `control-plane-simulated` `MissionPill` → `<Tag>`). Reset/Run `Button`s keep their structure; drop the `border-white/10 bg-black/10 hover:bg-black/20` className on the outline reset button.
  - The 6 summary `MissionMetricTile` → `MetricTile` (Pass Rate tone amber if `< 1`; nothing else toned). Keep `data-autonomy-benchmark-summary` on the wrapping `<div>`.
  - Runtime/scenario selector `MissionInsetSurface` → `RecessedWell`; the checkbox `<label>` mini-cards `rounded-md border border-white/10 bg-black/10` → `cap` (preserve `data-autonomy-benchmark-runtime`/`-scenario`).
  - `ScenarioResultRow`: `MissionInsetSurface` → `RecessedWell` (keep `data-autonomy-benchmark-result`); drop the `StatusIcon` glyph; status `MissionPill` → `LampTile`; runtime `MissionPill mono` → `<Tag mono>`; the `EvidencePills` `MissionPill mono`/plain → `<Tag mono>`/`<Tag>`; the error `rounded-md border border-red-500/20 bg-red-500/10 … text-red-100` block → `RecessedWell` with `text-led-nogo` text.
  - Runtime-group `MissionInsetSurface` → `RecessedWell` (keep `data-autonomy-benchmark-runtime-group`); the `passed` count `MissionPill` → `LampTile` (all-passed→go else nogo).
  - `MissionStateBlock` (failed/empty) → `SubviewState`.
  - **VU (lean-in, functional):** add `VuMeter` to the import and to the summary grid, bound to the already-0–1 pass rate: `<VuMeter className="w-40" value={benchmark.report.summary.successRate} label="Benchmark pass rate" />`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(sweep): Phase 4a — recompose autonomy-benchmark-panel onto console primitives` + Co-Authored-By).

---

## Task 7: Recompose `agent-improvement-panel.tsx`

**Files:** Modify `agent-improvement-panel.tsx` + add its `it`.

- [ ] **Step 1: Failing test case** (note the critical `aria-label` pin):
```ts
it('agent-improvement panel: console hardware + aria-label preserved, no legacy', () => {
  const src = read('agent-improvement-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('<LampTile');
  expect(src).toContain('aria-label={`Open ${ticket.title}`}');
  expect(src).toContain('data-agent-improvement-panel');
  expect(src).toContain('data-agent-improvement-ticket={ticket.id}');
  expect(src).toContain('data-agent-improvement-recommendation={recommendation.id}');
  expect(src).toContain('data-agent-improvement-run-result');
  expect(src).toContain('data-agent-improvement-run={run.eventId}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
  expect(src).not.toContain('rounded-[16px]');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Recompose:**
  - Imports → console barrel.
  - `priorityTone` → `LampTone` (`critical`→`nogo`, `high`→`hold`, else `off`/`go`). Priority pills are status-ish → `LampTile`; ticket `status`/`already queued`/`ready` pills → `<Tag>` (labels).
  - `TicketRow`: `MissionInsetSurface` → `RecessedWell` (keep `data-agent-improvement-ticket`); drop `TicketCheck` glyph or keep as decorative; priority `MissionPill` → `LampTile`; status `MissionPill` → `<Tag>`; label `MissionPill mono` → `<Tag mono>`; `MissionIconButton` (Open) → console icon button **preserving `aria-label={`Open ${ticket.title}`}`**:
```tsx
<button
  type="button"
  title="Open ticket"
  aria-label={`Open ${ticket.title}`}
  onClick={() => onOpen(ticket.id)}
  className="cap flex h-10 w-10 items-center justify-center"
>
  <ExternalLink className="h-4 w-4" />
</button>
```
  - `RecommendationRow`: `MissionInsetSurface` → `RecessedWell` (keep `data-agent-improvement-recommendation`); priority `MissionPill` → `LampTile`; `ticket opened`/`already queued`/`ready` → `<Tag>` (or LampTile go for "ticket opened"); ref `MissionPill mono` → `<Tag mono>`.
  - Top `MissionControlRow` header → flex row; active/clear `MissionPill` → `LampTile` (active→hold, clear→go). The hand-rolled "Run Improvement Loop" `<button>` already uses `border-brand/25 bg-black …` → restyle to `cap` button. `MissionIconButton` (Refresh) → console icon button.
  - 3 `MissionMetricTile` → `MetricTile`.
  - `runLoop.isError` `MissionInsetSurface tone="danger"` → `RecessedWell` with `text-led-nogo`.
  - `data-agent-improvement-run-result` `MissionInsetSurface` → `RecessedWell`; the two list-section `MissionInsetSurface` → `RecessedWell`; `MissionPill` counts → `<Tag>`; per-run mini-card `rounded-md border border-white/10 bg-black/10` (keep `data-agent-improvement-run`) → `RecessedWell`/`cap`; `MissionPill` (opened count) → `LampTile`/`<Tag>`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(sweep): Phase 4a — recompose agent-improvement-panel onto console primitives`).

---

## Task 8: Recompose `approvals-panel.tsx`

**Files:** Modify `approvals-panel.tsx` + add its `it`.

- [ ] **Step 1: Failing test case:**
```ts
it('approvals panel: console hardware + cap-select filters + selectors, no legacy', () => {
  const src = read('approvals-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('cap-select');
  expect(src).toContain('data-approvals-panel');
  expect(src).toContain('data-approval-kind-filter={value}');
  expect(src).toContain('data-approval-status-filter={value}');
  expect(src).toContain('data-approval-card={item.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
  expect(src).not.toContain('rounded-full');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Recompose:**
  - Imports → console barrel.
  - `kindTone`/`statusTone` → `LampTone` (approved→go, denied/dismissed→nogo, pending→hold; kinds: authority→go, budget/delegation→hold, else off). Status `MissionPill`s → `LampTile`; the `item.priority` plain pill → `<Tag>`.
  - 4 `MissionMetricTile` → `MetricTile` (Pending tone amber when `pendingCount > 0`).
  - Filters: the `MissionSegmentedButton` chips → `cap`/`cap-select` (preserve `data-approval-kind-filter`/`-status-filter`):
```tsx
<button
  type="button"
  key={value}
  onClick={() => setKindFilter(value)}
  data-approval-kind-filter={value}
  className={cn('cap px-3 py-1.5 text-button-sm', kindFilter === value && 'cap-select')}
>
  {value === 'all' ? 'All' : kindLabel(value)}
</button>
```
   (same for status). The wrapping `MissionControlRow` → a flex `<div>`; the `MissionInsetSurface` filter container → `RecessedWell`.
  - Each approval `MissionInsetSurface` → `RecessedWell` (keep `data-approval-card`); kind/status `MissionPill` → `LampTile`, priority → `<Tag>`; the rationale `rounded-[16px] border border-white/10 bg-black/20` block → `RecessedWell`; the `FIELD_CLASSNAME` textarea (`rounded-[16px] border border-white/10 bg-black/20 … focus:border-brand/30`) → console field tokens (`rounded-control border border-[hsl(var(--hairline))] bg-[hsl(var(--well))]`).
  - The Approve/Deny/Dismiss hand-rolled `rounded-full border … uppercase tracking-[0.14em]` buttons → console `cap` buttons (Approve = `cap cap-select` armed; Deny/Dismiss = `cap`). Preserve `onClick`/`disabled`.
  - `MissionStateBlock` (loading/error/empty/decision-failed) → `SubviewState`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(sweep): Phase 4a — recompose approvals-panel onto console primitives`).

---

## Task 9: Recompose `artifacts-panel.tsx`

**Files:** Modify `artifacts-panel.tsx` + add its `it`.

- [ ] **Step 1: Failing test case:**
```ts
it('artifacts panel: console hardware + cap-select filters + selectors, no legacy', () => {
  const src = read('artifacts-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('cap-select');
  expect(src).toContain('data-artifacts-panel');
  expect(src).toContain('data-artifact-card={artifact.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
  expect(src).not.toContain('border-white/8');
  expect(src).not.toContain('rounded-full');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Recompose:**
  - Imports → console barrel.
  - 4 `MissionMetricTile` → `MetricTile`.
  - Filter `MissionControlRow`/`MissionSegmentedButton` → `cap`/`cap-select` flex row.
  - `ArtifactCard`: `MissionInsetSurface` → `RecessedWell` (keep `data-artifact-card`); kind/outcome/source `MissionPill`s → `<Tag>` (labels; the accent kind pill can be `<Tag>` — not live status); ref `MissionPill mono` (ticketId/fileId/approvalItemId/uri) → `<Tag mono>`; the Preview/Open hand-rolled `rounded-full border border-white/10 … uppercase tracking-[0.14em]` buttons (inside `MissionControlRow density="compact"`) → `cap` buttons in a flex row; the preview `rounded-[18px] border border-white/8 bg-black/20` panel → `RecessedWell`; the `font-semibold uppercase tracking-[0.14em]` keys → `text-eyebrow`.
  - The bottom provenance `MissionInsetSurface` (3-col) → `RecessedWell`.
  - `MissionStateBlock` (loading/error/empty/no-match) → `SubviewState`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(sweep): Phase 4a — recompose artifacts-panel onto console primitives`).

---

## Task 10: Recompose `memory-panel.tsx`

**Files:** Modify `memory-panel.tsx` + add its `it`.

- [ ] **Step 1: Failing test case:**
```ts
it('memory panel: console hardware + cap-select budget + selectors, no legacy', () => {
  const src = read('memory-panel.tsx');
  expect(src).toContain("from '@/components/console/index.js'");
  expect(src).toContain('<MetricTile');
  expect(src).toContain('cap-select');
  expect(src).toContain('<VuMeter');
  expect(src).toContain('data-memory-panel');
  expect(src).toContain('data-memory-thread-select');
  expect(src).toContain('data-memory-dropped-block={drop.blockId}');
  expect(src).toContain('data-memory-checkpoint={checkpoint.id}');
  expect(src).not.toContain('mission-shell.js');
  expect(src).not.toMatch(/\bbg-black\b/);
  expect(src).not.toContain('border-white/10');
  expect(src).not.toContain('border-white/8');
  expect(src).not.toContain('rounded-[16px]');
  expect(src).not.toContain('rounded-[18px]');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Recompose:**
  - Imports → console barrel. Keep the `../memory/memory-formatters.js` import (`checkpointTone`/`freshnessTone` etc.) — but those `…Tone` helpers return the legacy `'accent'|'warning'|'danger'`; wrap them at the call site with a small local `toLampTone(missionTone)` mapper, OR (preferred) add a local `freshnessLampTone`/`checkpointLampTone` in this file that maps to `LampTone`. Do NOT edit `memory-formatters.ts` (out of 4a scope — shared with `features/memory`).
```tsx
function toLampTone(tone: 'default' | 'accent' | 'warning' | 'danger'): LampTone {
  if (tone === 'danger') return 'nogo';
  if (tone === 'warning') return 'hold';
  if (tone === 'accent') return 'go';
  return 'off';
}
```
  - Header `MissionInsetSurface` → `RecessedWell`; the `<h2>` stays; kind/system-agent `MissionPill` → `<Tag>`; the Refresh/Open `MissionControlRow density="compact"` + outline `Button`s → flex row of console buttons (drop the `border-white/10 bg-black/10` classes).
  - Focus-thread `<select>` (`rounded-[16px] border border-white/10 bg-black/20`) → console field tokens (keep `data-memory-thread-select`). Pack-budget `MissionSegmentedButton` → `cap`/`cap-select`.
  - 4 top `MissionMetricTile` → `MetricTile`; nested packed-context 3 `MissionMetricTile` → `MetricTile`.
  - Digest/PackedContext/Checkpoints `MissionInsetSurface` → `RecessedWell`; freshness/included-blocks/checkpoint-kind `MissionPill` → `LampTile` (via `toLampTone`); pinned-facts/included-block-kind plain `MissionPill` → `<Tag>`; the `rounded-[18px] border border-white/8 bg-black/20` summary/addendum blocks → `RecessedWell`; the dropped-block + blocker mini-cards (`rounded-[14px] border border-white/8 bg-black/15`, keep `data-memory-dropped-block`) → `cap`/`RecessedWell`; checkpoint cards (`rounded-[18px] border border-white/8 bg-black/20`, keep `data-memory-checkpoint`) → `RecessedWell`; `font-semibold uppercase tracking-[0.14em]` keys → `text-eyebrow`.
  - All `MissionStateBlock` → `SubviewState`.
  - **VU (lean-in, functional):** add `VuMeter` to the import and beside the pack-usage metric, bound to used/target tokens (guarded + clamped): `<VuMeter className="w-40" value={packedContext && effectiveTargetTokenBudget > 0 ? Math.min(1, packedContext.usedTokens / effectiveTargetTokenBudget) : 0} label="Pack budget usage" />`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** (`feat(sweep): Phase 4a — recompose memory-panel onto console primitives`).

---

## Task 11: Global legacy-absence sweep + CHANGELOG + full gate

**Files:**
- Modify: `autonomy-cluster-sweep.test.ts` (final cross-file pin)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the final cross-file legacy-absence test** — append to the `describe`:
```ts
it('the whole 4a cluster is free of Mission* and legacy composition', () => {
  const files = [
    'autonomy-view.tsx',
    'autonomy-doctor-panel.tsx',
    'autonomy-benchmark-panel.tsx',
    'agent-improvement-panel.tsx',
    'approvals-panel.tsx',
    'artifacts-panel.tsx',
    'memory-panel.tsx',
  ];
  for (const file of files) {
    const src = read(file);
    expect(src, `${file} imports mission-shell`).not.toContain('mission-shell.js');
    expect(src, `${file} uses a Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
    expect(src, `${file} has bg-black`).not.toMatch(/\bbg-black\b/);
    expect(src, `${file} has border-white/N`).not.toMatch(/border-white\/\d/);
    expect(src, `${file} has font-mono`).not.toContain('font-mono');
    expect(src, `${file} has raw status color`).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
  }
});
```

- [ ] **Step 2: Run → it must pass.** If any file trips a pin, fix that file (a missed legacy class) and re-run. Run the FULL autonomy + dashboard suites to confirm no regression:
```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/autonomy/ src/renderer/src/features/dashboard/ src/renderer/src/components/console/
```
Expected: all GREEN.

- [ ] **Step 3: CHANGELOG** — add under `## [Unreleased]` → `### Changed` (above the existing Phase 3 entry, newest-first):
```markdown
- **Aesthetic sweep Phase 4a — Autonomy shell + light panels.** The Autonomy
  view (`autonomy-view.tsx`) + six light panels (doctor, benchmark, agent
  improvement, approvals, artifacts, memory) recomposed off the legacy
  `Mission*` shell onto the Command Console foundation: Faceplates + stripe
  placards, a nav-tile subview rail (`aria-current`), Departure-Mono `MetricTile`
  readouts, machined `cap`/`cap-select` filter chips, `RecessedWell` panels,
  stencil word-lamps for status, and the shared console `SubviewState` for every
  empty/error state. New shared console primitives: `MetricTile`, `Tag`, and
  `SubviewState` (promoted from the dashboard). `mission-shell.tsx` is left for
  its remaining consumers (the 4b heavy panels + telemetry/chat/tickets/etc.),
  purged in Phase 8. Visual-only: zero behavior change, every E2E/a11y selector
  preserved.
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
Expected: all green. E2E especially must stay 26/26 (the autonomy surface is structurally preserved).

- [ ] **Step 5: Commit:**
```bash
git add -A && git commit -m "test(sweep): Phase 4a cluster legacy-absence pin + CHANGELOG

Cross-file guard that all 7 4a files are free of Mission*/bg-black/border-white/
font-mono/raw status colors; CHANGELOG entry for the Phase 4a recompose.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria

- All 7 files free of `Mission*` imports + legacy composition (the Task 11 pin passes).
- 3 shared console primitives added/promoted (`SubviewState`, `MetricTile`, `Tag`) with render tests.
- Every E2E/a11y selector preserved (the per-file pins + `aria-label` pin).
- Full local gate green incl. E2E 26/26.
- `mission-shell.tsx` untouched.
- Branch ready for PR → CR-7 wall.
