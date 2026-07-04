# v3.4.0 Aesthetic Sweep — Phase 5b/6 (Work Remainder + Comms & Guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the 21 Meetings / Org Chart / Hire / Chat / Copilot / User Guide renderer files onto the Command Console / Carbon Pro primitives — visual-only, zero behavior/IPC/data change, every E2E/a11y selector and existing source-pin preserved.

**Architecture:** Each file's legacy composition (`Mission*` primitives, `mission-*` CSS, ad-hoc raw-palette chips, `bg-black`/`border-white` panels) is replaced 1:1 with console primitives (`Faceplate`, `RecessedWell`, `MetricTile`, `LampTile`, `Tag`, `VuMeter`, `StripeHeader`, `SubviewState`) and CSS recipes (`.well`, `.well-input`, `.cap`, `.cap-armed`, `.nav-tile`, `.faceplate`, `.stripe`). Correctness is gated by a co-located source-string-pin test (`work-comms-cluster-sweep.test.ts`) asserting console-present + legacy-absent + selectors-preserved per file, plus the seven existing pin suites that read these files.

**Tech Stack:** React 19 + TypeScript, Vitest, Biome, ESLint, pnpm 9.15.9, Node 22.22.2. Console primitives in `apps/desktop/src/renderer/src/components/console/` (export via `index.ts`); recipes in `apps/desktop/src/renderer/src/styles/globals.css`.

**Source spec:** `docs/superpowers/specs/2026-07-04-sweep-phase-05b-06-work-comms-design.md`.

## Global Constraints

- **Visual-only.** Zero behavior / IPC / data / query / store / hook change. Text content, element identity, and child ordering preserved. Only wrappers/classNames change (exceptions listed per task: removal of purely decorative chrome — the `mission-grid` overlay div — and collapsing a status dot+word pair into one `LampTile`, both established recompose norms). CSS `text-transform` does stencil casing — never edit DOM text.
- **Branch:** `feat/v3.4.0-sweep-phase-05b-06-work-comms` (cut off `main` `0ae0cbd`).
- **No version bump** (v3.4.0 tags only at Phase 8). No CHANGELOG entry for a sweep sub-phase (matches 4a/4b/5a).
- **Node/pnpm:** run `eval "$(fnm env)" && fnm use 22.22.2` first if `node -v` ≠ v22.22.2.
- **Gates per commit:** `pnpm biome check <files>`, `pnpm typecheck`, `pnpm eslint <files>` (0 errors / 0 warnings), the cluster sweep test green, AND the wave's existing pin suites green. Never commit red.
- **`mission-shell.tsx` is OUT** — never edit it (Phase 8 purge). This phase only removes *these files'* imports of it. **`memory-formatters.ts` is OUT** — bridge its tone strings locally (§S1c).
- **Do NOT touch** any file outside the 21 listed + the one new test file.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- **Subagent boundary** (if delegating recomposes): edit-only-the-assigned-file, no git, no tooling; never read/traverse `~/.claude`, any `.claude/`, or any `agents/` directory.

---

## Shared decisions (apply everywhere — DRY)

### S1. Status → `LampTile` tone maps

Status renders as a stencil word-lamp; the lamp `label` is the existing status word (CSS uppercases — never change DOM text). Use `<LampTile small … interactive={false} />` inside rows/cards; full size only in detail headers.

```
// a. Meetings — DESIGN.md dual-form rule: steady red = LIVE / ON AIR
MEETING_STATUS_TONE = { active: 'armed', ended: 'off' }        // labels stay 'Live'/'Ended' ('Active'/'Ended' in detail)

// b. Copilot severity (status)
COPILOT_SEVERITY_TONE = { critical: 'nogo', warning: 'hold', info: 'off' }
//    severity left-edge stripes: critical → bg-[var(--led-nogo)], warning → bg-[var(--led-hold)], info → bg-[var(--led-info)]

// c. Memory tones — bridge memory-formatters' Mission tones to LampTone LOCALLY in thread-memory-card.tsx:
const LAMP_TONE = { default: 'off', accent: 'go', warning: 'hold', danger: 'nogo' } as const;
//    usage: tone={LAMP_TONE[freshnessTone(digest?.freshness)]}  /  tone={LAMP_TONE[checkpointTone(kind)]}

// d. Composer mode lamp:  label={queueMode ? 'Queue' : 'Live'}  tone={queueMode ? 'hold' : 'armed'}

// e. User-guide signal lamps (Signal health rail + core-readiness pill):
//    lamp label is a stencil word; the existing status TEXT stays beside it as a caption span.
//    ready/recorded/installed/active → 'go' · missing → 'hold' · loading → 'hold' (label 'STBY') · none-yet → 'off'
//    core readiness: label={summary.coreRemaining > 0 ? 'HOLD' : 'GO'} + the existing sentence kept as adjacent text.
```

### S2. Category/label chips → `Tag`

Names, level labels, thread kinds ("Agent conversation", "Ticket thread" — exact text kept), insight categories, task kind/priority words, guide section categories, timestamps, counts → `<Tag>{…}</Tag>` (`mono` for ids/refs/timestamps/counts). Tag carries **no** color — never pass `text-*`/`bg-*` tone classes to it (the 4b `cn`/twMerge lesson). Tag/RecessedWell/MetricTile spread `data-*`; put selectors on them directly.

### S3. VU binding — the ONLY genuine `0–1` ratio in the cluster

| File | `value` expression | Guard | Props |
|---|---|---|---|
| `user-guide-view.tsx` | `summary.total > 0 ? summary.completed / summary.total : 0` | total can be 0 → ternary | `label="Checklist progress" variant="progress" segments={16}` |

**No other file gets a VU.** Counts (threads, insights, attendees, meetings, signals) are not ratios → `MetricTile`/`Tag`. Flag the single VU for `/design-review` confirmation.

### S4. Stream viewport recipe (Phase-3 shipped canon — `dashboard/stream-view.tsx:46`)

Live token-stream text and code fences render as:

```
className="whitespace-pre-wrap rounded-inset bg-[var(--void)] px-3 py-2 text-code-sm leading-relaxed text-[var(--display-fg)]"
```

Conversation prose (persisted bubbles, minutes) stays `text-body` on `RecessedWell`/`.well` with `text-[var(--display-fg)]` (displays-stay-dark; never `text-foreground` inside a well). Sender eyebrows → `text-silver-mute`.

### S5. Recipes

- Native `<select>`/ad-hoc `<input>`/`<textarea>` class strings → `className="well-input …"`. Keep shadcn `<Input>`/`<Textarea>` as-is minus any `border-white/* bg-black/* rounded-[Npx]` overrides.
- Inline icon buttons (back/close/dismiss/list/send/ask) → `className="cap …"`; the composer Send and copilot Ask submit → `.cap-armed` (command authority; **never** `.cap-chrome` — reserved single CTA, the 4b lesson). Preserve every `aria-label`/`sr-only` and `disabled` expression verbatim.
- Segmented/nav buttons (`MissionSegmentedButton`, guide section nav) → `.nav-tile` / `.nav-tile-active`; keep `aria-pressed` + `data-*` verbatim.
- Custom dialog overlays `bg-black/50|60` → `bg-[hsl(0_0%_0%/0.55)]` (verbatim from 5a's shipped `create-ticket-dialog.tsx:74`).
- Selection state (list rows, chooser cards, guide section nav): selected → `border-[var(--armed)]/45 bg-[var(--armed)]/5` on a `.well`/raised control; unselected → hairline + hover. Before implementing, mirror the shipped selected-row idiom in `features/projects/goal-row.tsx` (5a) — reuse its classes verbatim where they fit.
- Status LED dots that survive (drawer employee dot, live-stream dot): `rounded-sm` square LED (`rounded-full` is pinned out), colors via §S9.

### S6. Selector re-homing rule

Every selector in each task's list survives **verbatim**. `Faceplate` does **not** spread `data-*`/`aria-*`; `RecessedWell`/`MetricTile`/`Tag` do; `SubviewState` exposes `testId`. When a selector sits on a node that becomes a `Faceplate`, move it to the nearest prop-spreading console element or a plain wrapper `<div>` — never drop it. `data-…-state="…"` values stay on wrapper `<div>`s around `SubviewState`.

### S7. Sheet-header idiom (replaces `MissionSheetHeader` — 5 call sites)

```tsx
<div className="border-b border-[var(--hairline)] px-5 py-4">
  <StripeHeader kicker="<eyebrow text>" className="mb-3">{/* trailing slot: Tag/lamp badge */}</StripeHeader>
  <div className="flex items-center gap-3">
    {/* leadingAction → .cap button (aria-label kept) or the avatar chip */}
    {/* SheetTitle element preserved VERBATIM (Radix a11y) */}
    {/* trailingAction → .cap button */}
  </div>
  {/* description node kept as text-caption text-silver-mute */}
</div>
```

`StripeHeader`'s trailing slot is `children` (NOT `stripeSlot` — that's a `Faceplate` prop). Keep every `SheetTitle`/`SheetDescription` element (Radix aria wiring) and all aria-labels.

### S8. Forbidden-legacy set (the `expectNoLegacy` assertion)

Per file, source MUST NOT contain: `mission-shell`, `/\bMission[A-Z]\w+/`, `mission-select`, `mission-chrome-panel`, `mission-grid`, `mission-state-block`, `/\bbg-black\b/`, `/border-white\/\d/`, `font-mono`, `/rounded-\[\d+px\]/`, `/\brounded-full\b/`, and the raw-palette regex `/-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/`. (`brand`/`surface`/`muted`/`border`/`ring`/`destructive` tokens are retained Carbon tokens — NOT pinned, consistent with 4b/5a. `animate-pulse`/`animate-pulse-slow` are NOT banned — the swept sidenav canon uses them for live activity.)

### S9. Employee/status dot mapping (Phase-2 swept sidenav canon — `app/sidenav.tsx:20-31`)

```
thinking → 'bg-[var(--armed-lit)] animate-pulse-slow'
blocked  → 'bg-[var(--led-hold)]'
error    → 'bg-[var(--led-warn)]'
default  → 'bg-[var(--graphite)]'
```

Reuse verbatim in `chat-drawer.tsx`'s `statusColor()` (shape becomes `rounded-sm`).

### S10. Kicker copy

`StripeHeader`/`Faceplate` kickers are short module words, matching the shipped 5a idiom — read `features/tickets/tickets-view.tsx` once at execution start and mirror its kicker/serial style. Defaults used below: "Org Chart", "Meetings", "Conversations", "Threads", "Copilot", "User Guide".

---

## File structure

| # | File | Wave | Recompose weight | VU |
|---|---|---|---|---|
| new | `features/work-comms-cluster-sweep.test.ts` | — | the contract | — |
| 1 | `features/orgchart/org-chart-node.tsx` | A | levelPalette raw palette + action buttons + select | — |
| 2 | `features/orgchart/org-chart-view.tsx` | A | 4 ad-hoc states + header + toast | — |
| 3 | `features/orgchart/employee-profile-dialog.tsx` | A | fieldClass ×9 + error color | — |
| 4 | `features/orgchart/promote-dialog.tsx` | A | select + error color | — |
| 5 | `features/orgchart/fire-dialog.tsx` | A | input + error color | — |
| — | `features/orgchart/org-chart-tree.tsx` | A | clean — cross-file guard only | — |
| 6 | `features/meetings/meetings-view.tsx` | B | Live/Ended lamp + rows + 3 states | — |
| 7 | `features/meetings/meeting-detail.tsx` | B | lamp + transcript wells + composer | — |
| 8 | `features/meetings/call-meeting-dialog.tsx` | B | custom overlay + fields | — |
| 9 | `features/hire/hire-dialog.tsx` | B | chooser cards + Badge + select | — |
| 10 | `features/chat/system-agent-badge.tsx` | C | pill shape | — |
| 11 | `features/chat/composer.tsx` | C | chrome-panel + mode lamp + send cap | — |
| 12 | `features/chat/message-list.tsx` | C | bubbles + stream recipe + live LED | — |
| 13 | `features/memory/thread-memory-card.tsx` | C | InsetSurface + 11 MissionPills + 3 stat blocks | — |
| 14 | `features/chat/thread-list.tsx` | C | row wells + kind chips + 4 MissionPills | — |
| 15 | `features/chat/chat-view.tsx` | C | **8 Mission\* primitives** | — |
| 16 | `features/chat/chat-drawer.tsx` | C | mission-shell/grid + 4 sheet headers (674 LOC) | — |
| 17 | `features/copilot/copilot-insight-card.tsx` | D | SEVERITY_META palette + badges | — |
| 18 | `features/copilot/copilot-dashboard-widget.tsx` | D | section → .faceplate | — |
| 19 | `features/copilot/copilot-sidebar.tsx` | D | SegmentedButtons + 3 StateBlocks + sheet header | — |
| 20 | `features/user-guide/user-guide-view.tsx` | E | **10 Mission\* primitives** (525 LOC) | ✓ |

Waves are review batches; within a wave, leaf components before containers.

**Existing pin suites to run green per wave:** Wave A → `org-chart-view`, `org-chart-interactions`; Wave B → `company-settings`; Wave C → `chat-view`, `chat-drawer`; Wave D → `copilot-sidebar-export`; Wave E → `user-guide-shell`, `guide-progress`.

---

## Task 1: Test scaffold + baseline gates

**Files:** Create `apps/desktop/src/renderer/src/features/work-comms-cluster-sweep.test.ts`

**Interfaces:** Produces `read(rel)` + `expectNoLegacy(src, file)` + `RAW_PALETTE`, consumed by every per-file describe block (Tasks 2–21) and the cross-file block (Task 22).

- [ ] **Step 1: Confirm Node + clean baseline**

Run: `eval "$(fnm env)" && fnm use 22.22.2 && cd apps/desktop && pnpm vitest run --silent 2>&1 | tail -5`
Expected: existing suite PASS.

- [ ] **Step 2: Create the test file with helper only**

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

// Raw Tailwind palette colors the recompose must replace with console tones.
const RAW_PALETTE =
  /-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/;

function expectNoLegacy(src: string, file: string) {
  expect(src, `${file}: mission-shell import`).not.toContain('mission-shell');
  expect(src, `${file}: Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src, `${file}: mission-select`).not.toContain('mission-select');
  expect(src, `${file}: mission-chrome-panel`).not.toContain('mission-chrome-panel');
  expect(src, `${file}: mission-grid`).not.toContain('mission-grid');
  expect(src, `${file}: mission-state-block`).not.toContain('mission-state-block');
  expect(src, `${file}: bg-black`).not.toMatch(/\bbg-black\b/);
  expect(src, `${file}: border-white/N`).not.toMatch(/border-white\/\d/);
  expect(src, `${file}: font-mono`).not.toContain('font-mono');
  expect(src, `${file}: rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  expect(src, `${file}: rounded-full`).not.toMatch(/\brounded-full\b/);
  expect(src, `${file}: raw palette color`).not.toMatch(RAW_PALETTE);
}

export { read, expectNoLegacy };

describe('work & comms cluster sweep (Phase 5b/6)', () => {
  it.todo('per-file describe blocks added in Tasks 2–21');
});
```

- [ ] **Step 3: Verify green**

Run: `cd apps/desktop && pnpm vitest run work-comms-cluster-sweep --silent 2>&1 | tail -5`
Expected: PASS (1 todo, 0 failures).

- [ ] **Step 4: Lint/typecheck + commit**

```bash
cd apps/desktop && pnpm biome check src/renderer/src/features/work-comms-cluster-sweep.test.ts && pnpm typecheck
git add apps/desktop/src/renderer/src/features/work-comms-cluster-sweep.test.ts
git commit -m "test(sweep): Phase 5b/6 work-comms sweep test scaffold" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Per-file task template (Tasks 2–21)

Identical 6-step cycle; only **Selectors**, **Recompose map**, and **Test block** differ:

1. **Add the file's `describe` block** to `work-comms-cluster-sweep.test.ts`. Run it → RED (console-present asserts fail on unswept source).
2. **Run red:** `cd apps/desktop && pnpm vitest run work-comms-cluster-sweep -t '<file>' --silent` → FAIL.
3. **Recompose** per the map + Shared decisions. Preserve every listed selector verbatim (§S6). If delegating, one `elite-executor` subagent, edit-only-this-file.
4. **Run green:** same command → PASS. **Also run the wave's existing pin suites** (listed in File structure) → PASS.
5. **Gate:** `pnpm biome check <file> && pnpm typecheck && pnpm eslint <file>` → 0/0.
6. **Commit:** `git add <file> src/renderer/src/features/work-comms-cluster-sweep.test.ts && git commit -m "feat(sweep): recompose <file> onto console primitives" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

Console import: `from '@/components/console/index.js'` (NodeNext); assertions use the robust prefix `toContain("from '@/components/console")`.

---

## Wave A — Org Chart (Tasks 2–6)

### Task 2: `org-chart-node.tsx`

**Selectors to preserve:** `data-org-chart-node={employee.id}` (L83), `role="treeitem"`, `aria-level={depth + 1}`, `aria-expanded`, `data-org-chart-drag-handle={employee.id}` (L98), `data-org-chart-actions={employee.id}` (L141), `data-org-chart-profile=""` (L154), `data-org-chart-promote=""` (L162), `data-org-chart-fire=""` (L170), `data-org-chart-manager-select=""` (L178), `` aria-label={`Reassign manager for ${employee.name}`} `` (L176). Pinned by `org-chart-*.test.tsx`: `export function OrgChartNode(`, the `levelPalette` **keys** `officer:` / `'senior-management'` / `management:` / `supervisor:` / `lead:` / `ic:` — the map object stays; only its VALUES change. Source must still NOT contain `Actions ship in step (f)`.

**Recompose map:**
- `levelPalette` values (L7-14, raw fuchsia/blue/teal/emerald/slate) → monochrome silver rank ramp with armed command tier:
  ```ts
  const levelPalette: Record<string, string> = {
    officer: 'border-[var(--armed)]/40 text-[var(--armed-lit)]',
    'senior-management': 'border-[var(--hairline)] text-[var(--silver)]',
    management: 'border-[var(--hairline)] text-[var(--silver)]/85',
    supervisor: 'border-[var(--hairline)] text-silver-mute',
    lead: 'border-[var(--hairline)] text-silver-mute',
    ic: 'border-[var(--hairline)] text-silver-mute/80',
  };
  ```
  The level chip span (L121-128) keeps `rounded-md border px-1.5 py-0.5 text-eyebrow-sm` + `levelClass`.
- Fire button (L169) `border-red-500/50 text-red-300 hover:bg-red-500/10` → `border-[var(--led-nogo)]/50 text-[var(--led-nogo)] hover:bg-[var(--led-nogo)]/10`.
- Manager `<select>` (L177) → `className="well-input max-w-40 …"` keeping aria-label + `data-org-chart-manager-select`.
- Chat/Details/Promote buttons: keep shapes; they already use retained tokens (`border-border`, `bg-surface-200`, `border-brand/30 text-brand`) — no change needed beyond consistency.
- Avatar initials chip (L106) `bg-surface-200` — retained token, keep.

**Test block:**
```ts
describe('org-chart-node', () => {
  it('console rank ramp + well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-node.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--led-nogo)');
    expect(src).toContain('data-org-chart-node={employee.id}');
    expect(src).toContain('data-org-chart-manager-select=""');
    for (const key of ['officer:', "'senior-management'", 'management:', 'supervisor:', 'lead:', 'ic:']) {
      expect(src, `levelPalette key ${key}`).toContain(key);
    }
    expectNoLegacy(src, 'org-chart-node.tsx');
  });
});
```

### Task 3: `org-chart-view.tsx`

**Selectors to preserve:** `data-org-chart-view=""` (×5: L122/138/151/172/185), `data-org-chart-state=` `no-company` (L123) / `loading` (L139) / `error` (L152) / `empty` (L173), `data-org-chart-retry=""` (L159), `data-org-chart-toast=""` (L223 — stays on the **`<output>` element**, keep element identity). Pinned: `export function OrgChartView(`.

**Recompose map:**
- 4 state sections → `SubviewState` wrapped in `<section data-org-chart-view="" data-org-chart-state="…">`: no-company → `lampLabel="STBY" lampTone="off"`, loading → `lampLabel="STBY" lampTone="hold"`, error → `lampLabel="NO-GO" lampTone="nogo"` with `action=` the existing Retry button restyled to shadcn `<Button variant="outline">` carrying `data-org-chart-retry=""` + the same `onClick={() => refetch()}`, empty → `lampLabel="STBY" lampTone="off"`. Keep every title/description string verbatim.
- Error icon `text-red-400` (L154) → drop (SubviewState's lamp is the status carrier); keep the AlertCircle import only if still used, else remove import.
- Main header (L186-198) → `Faceplate kicker="Org Chart"` with the existing h1/description inside; the brand icon chip (L188) keeps retained tokens or is absorbed by the stripe.
- Toast `<output>` (L221-227): keep element + selector; classes → `.well`-flavored: `border border-[var(--hairline)] bg-background px-4 py-3 shadow-lg` (retain fixed positioning classes).

**Test block:**
```ts
describe('org-chart-view', () => {
  it('SubviewState states + console header + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-org-chart-view=""');
    for (const s of ['no-company', 'loading', 'error', 'empty']) {
      expect(src, `missing state ${s}`).toContain(`data-org-chart-state="${s}"`);
    }
    expect(src).toContain('data-org-chart-retry=""');
    expect(src).toContain('data-org-chart-toast=""');
    expect(src).toContain('<output');
    expectNoLegacy(src, 'org-chart-view.tsx');
  });
});
```

### Task 4: `employee-profile-dialog.tsx`

**Selectors to preserve:** `data-employee-profile-dialog=""` (L125) and the 9 field selectors: `data-employee-profile-name/-title/-role/-manager/-provider/-model/-runtime/-avatar/-save` (all `=""`). Pinned: dialog export + `data-employee-profile-name|role|manager|runtime|save`.

**Recompose map:**
- `fieldClass` (L38-39) → `'well-input h-10 w-full'` (the recipe owns border/bg/focus; drop the ad-hoc string).
- Error text `text-red-300` (L268) → `text-[var(--led-nogo)]`.
- shadcn `Dialog`/`Button` stay (Phase-1 restyled).

**Test block:**
```ts
describe('employee-profile-dialog', () => {
  it('well-input fields + selectors preserved, no legacy', () => {
    const src = read('orgchart/employee-profile-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-employee-profile-dialog=""');
    for (const id of ['name', 'title', 'role', 'manager', 'provider', 'model', 'runtime', 'avatar', 'save']) {
      expect(src, `missing data-employee-profile-${id}`).toContain(`data-employee-profile-${id}=""`);
    }
    expectNoLegacy(src, 'employee-profile-dialog.tsx');
  });
});
```

### Task 5: `promote-dialog.tsx`

**Selectors to preserve:** `data-promote-dialog=""` (L59), `htmlFor="promote-role"`/`id="promote-role"` (L66/70), `data-promote-role-select=""` (L74).

**Recompose map:** `<select>` class (L71) → `"well-input w-full"`; error `text-red-400` (L93) → `text-[var(--led-nogo)]`.

**Test block:**
```ts
describe('promote-dialog', () => {
  it('well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/promote-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-promote-dialog=""');
    expect(src).toContain('promote-role');
    expect(src).toContain('data-promote-role-select=""');
    expectNoLegacy(src, 'promote-dialog.tsx');
  });
});
```

### Task 6: `fire-dialog.tsx`

**Selectors to preserve:** `data-fire-dialog=""` (L46), `htmlFor="fire-confirm-name"`/`id="fire-confirm-name"` (L55/59), `data-fire-confirm-name=""` (L63), copy `Type the employee name to confirm` (L56).

**Recompose map:** `<input>` class (L60) → `"well-input w-full"`; error `text-red-400` (L66) → `text-[var(--led-nogo)]`. `Button variant="destructive"` stays.

**Test block:**
```ts
describe('fire-dialog', () => {
  it('well-input + confirm selectors preserved, no legacy', () => {
    const src = read('orgchart/fire-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-fire-dialog=""');
    expect(src).toContain('data-fire-confirm-name=""');
    expect(src).toContain('Type the employee name to confirm');
    expectNoLegacy(src, 'fire-dialog.tsx');
  });
});
```

**Wave A checkpoint:** `pnpm vitest run org-chart work-comms-cluster-sweep --silent` → all green (both existing org suites + the new blocks).

---

## Wave B — Meetings + Hire (Tasks 7–10)

### Task 7: `meetings-view.tsx`

**Selectors to preserve:** none exist (no test today — this task ADDS first coverage via the sweep block).

**Recompose map:**
- `MeetingRow` (L16-76): row `<button>` → `className={cn('well w-full px-3 py-2.5 text-left transition-all', selected ? 'border-[var(--armed)]/45 bg-[var(--armed)]/5' : 'hover:border-[var(--hairline)]')}` — mirror the shipped `goal-row.tsx` selected/hover idiom (§S5).
- Live/Ended badge (L61-72, `rounded-full bg-emerald-500/10 text-emerald-400` + pulse dot) → `<LampTile small label={liveStatus ? 'Live' : 'Ended'} tone={liveStatus ? 'armed' : 'off'} interactive={false} />` (§S1a — steady armed = ON AIR; the dot+word pair collapses into one lamp).
- Loading spinner (L86-93, `animate-spin rounded-full border-brand`) → `SubviewState lampLabel="STBY" lampTone="hold" title="Loading meetings..."`.
- Error block (L96-111) → `SubviewState lampLabel="NO-GO" lampTone="nogo" title="Failed to load meetings" action={<Button onClick={() => refetch()}>Retry</Button>}` (shadcn Button replaces the raw `bg-brand` button; keep text "Retry").
- Empty state (L141-148) → `SubviewState lampLabel="STBY" lampTone="off" title="No meetings yet" description="Call a meeting to bring your team together."`.
- Header (L121-137) → `Faceplate kicker="Meetings"`-topped list panel; "Call Meeting" raw `bg-brand` button → shadcn `<Button>` (keep Plus icon + text).
- "Active"/"Past" eyebrows (L153/163) keep (already `text-eyebrow-sm`).
- Meta icons row (Users2/Calendar/Clock + counts, L46-59) keeps caption styling.

**Test block:**
```ts
describe('meetings-view', () => {
  it('lamp status + SubviewState + console header, no legacy', () => {
    const src = read('meetings/meetings-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain("tone={liveStatus ? 'armed' : 'off'}");
    expectNoLegacy(src, 'meetings-view.tsx');
  });
});
```

### Task 8: `meeting-detail.tsx`

**Selectors to preserve:** `aria-label="Back to meetings"` (L53).

**Recompose map:**
- Loading spinner (L18-24) → `SubviewState lampLabel="STBY" lampTone="hold" title="Loading meeting..."` (title is net-new text for an unlabeled spinner — acceptable, mirrors 5a projects-view).
- Back button (L49-56) → `.cap` keeping aria-label + `lg:hidden`.
- Active/Ended badge (L65-74) → `<LampTile small label={isActive ? 'Active' : 'Ended'} tone={isActive ? 'armed' : 'off'} interactive={false} />`.
- End Meeting button (L78-87, raw `bg-red-600/80`) → shadcn `<Button variant="destructive" size="sm">` keeping Square icon, pending text swap, and `disabled={endMeeting.isPending}`.
- Minutes block (L91-101) → `RecessedWell` with `text-[var(--display-fg)]/85` content.
- Message bubbles (L117-128): user → `.well border-[var(--armed)]/25`; agent → `.well`; body text → `text-[var(--display-fg)]`; author eyebrow → `text-silver-mute`. System lines (L115) keep italic caption.
- Composer textarea (L141-148) → `className="well-input flex-1 resize-none"`; send icon button (L149-155, raw `bg-brand`) → `className="cap-armed"` + **add** `aria-label="Send interjection"` (net-new a11y — the button is icon-only and unlabeled today; safe addition, 5a's aria-current precedent). Keep `disabled` expression.
- Hint row (L158-161) keeps caption styling.

**Test block:**
```ts
describe('meeting-detail', () => {
  it('lamp + display wells + well-input composer + aria preserved, no legacy', () => {
    const src = read('meetings/meeting-detail.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--display-fg)');
    expect(src).toContain('aria-label="Back to meetings"');
    expect(src).toContain('aria-label="Send interjection"');
    expectNoLegacy(src, 'meeting-detail.tsx');
  });
});
```

### Task 9: `call-meeting-dialog.tsx`

**Selectors to preserve:** `htmlFor="meeting-agenda"`/`id="meeting-agenda"` (L64/68), `htmlFor="meeting-chair"`/`id="meeting-chair"` (L79/83), the `<fieldset>`/`<legend>` structure (L97-98).

**Recompose map:**
- Overlay (L55) `bg-black/60` → `bg-[hsl(0_0%_0%/0.55)]` (§S5).
- Panel (L56) `rounded-xl border-border bg-card shadow-2xl` → `Faceplate` (`className="w-full max-w-md"`, header h2 + description inside; or `kicker="Call Meeting"` with the h2 kept as body heading — keep the h2 text either way).
- Agenda textarea (L69) + chair select (L84) → `className="well-input …"` keeping ids.
- Attendee checkbox container (L99) → `RecessedWell` (`max-h-40 overflow-y-auto p-2`); checkbox rows keep `accent-brand`.
- Cancel/Start buttons (L120-134, raw) → shadcn `<Button variant="outline">` / `<Button>` keeping `disabled={selectedIds.size === 0 || callMeeting.isPending}` and both text states.

**Test block:**
```ts
describe('call-meeting-dialog', () => {
  it('console scrim + Faceplate + well-input fields, ids preserved, no legacy', () => {
    const src = read('meetings/call-meeting-dialog.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('bg-[hsl(0_0%_0%/0.55)]');
    expect(src).toContain('well-input');
    expect(src).toContain('meeting-agenda');
    expect(src).toContain('meeting-chair');
    expect(src).toContain('<fieldset');
    expectNoLegacy(src, 'call-meeting-dialog.tsx');
  });
});
```

### Task 10: `hire-dialog.tsx`

**Selectors to preserve:** `id="hire-name"` (L174) + `htmlFor` (L170), `id="hire-manager"` (L186) + `htmlFor` (L182), `data-hire-manager-select=""` (L190 — **pinned by `company-settings.test.tsx:112`**).

**Recompose map:**
- Role chooser cards (L131-162): selected `border-brand/40 bg-brand/5 shadow-sm` → `border-[var(--armed)]/45 bg-[var(--armed)]/5`; unselected → `well hover:border-[var(--hairline)]` (mirror goal-row idiom, §S5). Keep the full card body (name + responsibilities list).
- `Badge variant="secondary"` levelLabel (L147-149) → `<Tag>{role.levelLabel}</Tag>` (drop the `text-[10px] uppercase` class — Tag owns its type).
- Manager `<select>` (L185-198) → `className="well-input flex h-10 w-full"` keeping `data-hire-manager-select`.
- `text-destructive` error (L203) — retained token, keep.
- Confirm button `bg-brand text-white hover:bg-brand/90` (L214) → plain `<Button>` default variant (Phase-1 button is already console-armed); keep both text states + disabled expression.

**Test block:**
```ts
describe('hire-dialog', () => {
  it('armed chooser selection + Tag + well-input + pinned select preserved, no legacy', () => {
    const src = read('hire/hire-dialog.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<Tag');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--armed)');
    expect(src).toContain('data-hire-manager-select=""');
    expect(src).toContain('hire-name');
    expectNoLegacy(src, 'hire-dialog.tsx');
  });
});
```

**Wave B checkpoint:** `pnpm vitest run company-settings work-comms-cluster-sweep --silent` → green.

---

## Wave C — Chat + memory (Tasks 11–17)

### Task 11: `system-agent-badge.tsx`

**Selectors to preserve:** `aria-label="Copilot conversation"` (L40), text `Copilot`, both size variants' prop API (`size`, `className`).

**Recompose map:** span classes (L35-39): `rounded-full bg-brand/15 font-medium text-brand` → `rounded-pill border border-[var(--armed)]/30 bg-[var(--armed)]/10 font-medium text-[var(--armed-lit)]` (brand-red category marker kept, console radius + hairline). Size variants and Sparkles icon unchanged.

**Test block:**
```ts
describe('system-agent-badge', () => {
  it('console pill shape + aria preserved, no legacy', () => {
    const src = read('chat/system-agent-badge.tsx');
    expect(src).toContain('rounded-pill');
    expect(src).toContain('aria-label="Copilot conversation"');
    expectNoLegacy(src, 'system-agent-badge.tsx');
  });
});
```

### Task 12: `composer.tsx`

**Selectors to preserve (pinned by `chat-drawer.test.tsx`):** props `onQueue` / `onStop` / `queuedCount` in the interface + destructure; source must NOT contain `disabled={disabled}`; `sr-only` send label (L92) with both text states.

**Recompose map:**
- Outer bar (L50) `border-t border-white/10 bg-black/20` → `border-t border-[var(--hairline)]`.
- Stop `<Button>` (L60-69): drop `border-white/10 bg-black/10 … hover:bg-black/20` overrides (plain `variant="outline" size="sm"`); keep icon, disabled, text states.
- Panel (L72) `mission-chrome-panel rounded-[22px] border border-white/10 p-3` → `RecessedWell className="p-3"`.
- `<Textarea>` (L74-84): drop `border-white/10 bg-black/20` overrides; keep min/max height, placeholder logic, rows.
- Send button (L85-93) `rounded-[16px] bg-brand …` → `className="cap-armed h-11 w-11 shrink-0"`; keep `disabled={text.trim().length === 0}` + sr-only span.
- Mode chip (L101-103) `rounded-full border-white/10 bg-black/20 font-mono` → `<LampTile small label={queueMode ? 'Queue' : 'Live'} tone={queueMode ? 'hold' : 'armed'} interactive={false} />` (§S1d — steady armed = live line).
- Queued/busy status line (L52-58) keeps text; classes → `text-eyebrow text-silver-mute`.

**Test block:**
```ts
describe('composer', () => {
  it('well panel + mode lamp + queue contract preserved, no legacy', () => {
    const src = read('chat/composer.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('cap-armed');
    expect(src).toContain('onQueue');
    expect(src).toContain('onStop');
    expect(src).toContain('queuedCount');
    expect(src).not.toContain('disabled={disabled}');
    expectNoLegacy(src, 'composer.tsx');
  });
});
```

### Task 13: `message-list.tsx`

**Selectors to preserve:** none (no data-*/aria today); component/props API unchanged (`MessageList`, `messages`, `streamingText`, `isStreaming`, `employeeName`, `isAgentThread`, `employees`).

**Recompose map:**
- Code-fence `<pre>` (L41-45) → the §S4 stream recipe verbatim: `className="my-1 overflow-x-auto whitespace-pre-wrap rounded-inset bg-[var(--void)] px-3 py-2 text-code-sm leading-relaxed text-[var(--display-fg)]"`.
- `MessageBubble` (L82-89): `mission-chrome-panel rounded-[20px] border …` → user: `well border-[var(--armed)]/25`; agent: `well`; body → `text-body leading-7 text-[var(--display-fg)] break-words`.
- AI badge (L75-79, raw amber) → `<Tag className="…"><Bot className="h-2.5 w-2.5" />AI</Tag>` — neutral category chip, keep text "AI" + icon; sender eyebrow → `text-silver-mute`.
- Empty state (L160-169) `mission-state-block rounded-[24px] border-dashed border-white/10` → `SubviewState lampLabel="STBY" lampTone="off"` with the two existing sentences as `title`/`description` (the `isAgentThread` ternary title survives — pass it to `title`).
- `StreamingBubble` (L102-124): shell → `well`; "Live stream" dot (L109) `h-2 w-2 rounded-full bg-brand animate-pulse` → `h-2 w-2 rounded-sm bg-[var(--armed-lit)]` **steady** (dual-form rule: live burns steady; keep the "Live stream" text); streaming text wraps in the §S4 stream recipe (Iosevka on void); caret (L113) keeps `animate-pulse` (text-cursor idiom) with `bg-[var(--armed-lit)]`; "is thinking..." dot (L117) → `rounded-sm bg-[var(--armed-lit)] animate-pulse-slow` (§S9 thinking canon).

**Test block:**
```ts
describe('message-list', () => {
  it('display wells + stream recipe + steady live LED, no legacy', () => {
    const src = read('chat/message-list.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expect(src).toContain('var(--display-fg)');
    expect(src).toContain('var(--void)');
    expect(src).toContain('text-code-sm');
    expect(src).toContain('Live stream');
    expectNoLegacy(src, 'message-list.tsx');
  });
});
```

### Task 14: `thread-memory-card.tsx`

**Selectors to preserve:** `data-thread-memory-card=""` (both variants, L58/L108), `data-thread-memory-open=""` (both Inspect buttons, L88/L132), `data-thread-memory-facts=""` (L197). API unchanged (`title`/`description`/`compact`/`className` — pinned via chat-drawer usage).

**Recompose map:**
- Both `MissionInsetSurface` roots → `RecessedWell` (spreads `data-thread-memory-card`; keep `cn(...)` class merges).
- §S1c bridge at top of file: `const LAMP_TONE = { default: 'off', accent: 'go', warning: 'hold', danger: 'nogo' } as const;` — import type `LampTone` if needed. `memory-formatters.ts` untouched.
- Status pills → lamps: freshness (L64/L113) → `<LampTile small label={digest?.freshness ?? 'no digest'} tone={LAMP_TONE[freshnessTone(digest?.freshness)]} interactive={false} />`; checkpoint kind (L68/L117) → `<LampTile small label={checkpointLabel(latestCheckpoint.checkpointKind)} tone={LAMP_TONE[checkpointTone(latestCheckpoint.checkpointKind)]} interactive={false} />`.
- Category/count pills → Tags: resume label (L121) → `<Tag>`; `{estimatedTokens} tokens` / `digest pending` (L96-98) → `<Tag mono>`; `{checkpoints.length} checkpoints` (L99) → `<Tag mono>`; next-action pill (L100) → `<Tag>`; pinned facts (L199) → `<Tag key={fact.id}>{fact.fact}</Tag>`.
- Inspect Buttons (L82-91, L126-135): drop `border-white/10 bg-black/10 hover:bg-black/20` overrides; keep size/variant/text/`data-thread-memory-open`.
- Full-variant inner blocks: summary well (L148) + resume hint (L153) → `RecessedWell`; the 3 stat blocks (L158-194 Digest/Checkpoints/Next action) → `<MetricTile label=… value=… hint=… icon=… />` grid (`value` strings: `` digest ? `${digest.estimatedTokens} est. tokens` : 'Pending' ``, `String(checkpoints.length)`, `latestCheckpoint?.nextAction ?? 'Open full memory view'`; hints = the existing timestamp/sub lines).
- Loading strip (L139) → `RecessedWell` caption; error strip (L143, raw red) → `RecessedWell className="border-[var(--led-nogo)]/25"` + `text-[var(--led-nogo)]` caption (keep sentence).

**Test block:**
```ts
describe('thread-memory-card', () => {
  it('wells + lamps via LAMP_TONE bridge + MetricTiles + selectors preserved, no legacy', () => {
    const src = read('../memory/thread-memory-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('LAMP_TONE');
    expect(src).toContain('data-thread-memory-card=""');
    expect(src).toContain('data-thread-memory-open=""');
    expect(src).toContain('data-thread-memory-facts=""');
    expectNoLegacy(src, 'thread-memory-card.tsx');
  });
});
```

### Task 15: `thread-list.tsx`

**Selectors to preserve (pinned by `chat-drawer.test.tsx` + `chat-view.test.tsx`):** `type ThreadKind = 'copilot' | 'agent' | 'ticket' | 'regular'` (L59), `TicketCheck` import/usage, exact text `Ticket thread` (and keep `Agent conversation`), section `aria-label`s `"Copilot Conversations"` / `"Agent Conversations"` / `"Conversations"`, exports `isAgentThread` / `isCopilotThread` / `ThreadList`.

**Recompose map:**
- `ThreadRow` button (L100-103) `mission-chrome-panel rounded-[20px] border-white/10 hover:bg-black/20` → `well w-full text-left transition-all hover:border-[var(--hairline)]`; active → `border-[var(--armed)]/45 bg-[var(--armed)]/5` (§S5).
- `iconBg` map (L77-84): raw amber + `bg-white/10` → copilot/ticket: `bg-[var(--armed)]/12 text-[var(--armed-lit)]`; agent: `bg-[var(--led-hold)]/12 text-[var(--led-hold)]`; regular: `border-[var(--hairline)] text-[var(--display-fg)]`. Icon chip container (L106-109) `rounded-[16px] border-white/10` → `rounded-md border border-[var(--hairline)]`.
- Timestamp `MissionPill mono` (L119-121) → `<Tag mono className="shrink-0">`.
- Kind chips: agent (L125-129) → `<Tag className="mt-2"><Bot className="h-2.5 w-2.5" />Agent conversation</Tag>`; ticket (L131-135) → `<Tag className="mt-2"><TicketCheck className="h-2.5 w-2.5" />Ticket thread</Tag>` (categories → neutral Tags, §S2; exact texts kept).
- `SectionHeader` count pill (L155-157) → `<Tag mono className="tabular-nums">{count}</Tag>`.
- Empty state (L176-182) keeps its simple centered paragraph (no chrome to replace) — or wrap in `RecessedWell`; keep the sentence.

**Test block:**
```ts
describe('thread-list', () => {
  it('well rows + Tag chips + pinned kinds preserved, no legacy', () => {
    const src = read('chat/thread-list.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<Tag');
    expect(src).toContain("type ThreadKind = 'copilot' | 'agent' | 'ticket' | 'regular'");
    expect(src).toContain('TicketCheck');
    expect(src).toContain('Ticket thread');
    expect(src).toContain('Agent conversation');
    expect(src).toContain('aria-label="Copilot Conversations"');
    expectNoLegacy(src, 'thread-list.tsx');
  });
});
```

### Task 16: `chat-view.tsx`

**Selectors to preserve (pinned by `chat-view.test.tsx`):** `export function ChatView(`, `companyId: string | null`, `employees: Employee[]`, `useThreadList(companyId)`, `<ThreadList`, `threads={threads}`, `onSelectThread={handleSelectThread}`, `openThread`, `isAgentThread`, `isCopilotThread: true`, `data-chat-view=""` (×4: L60/84/116/157), `data-chat-view-state="no-company"` (L75) / `"loading"` (L107) / `"error"` (L143) / `"empty"` (L226), `data-chat-view-retry=""` (L131).

**Recompose map (the tickets-view playbook):**
- Drop the `@/features/mission/mission-shell.js` import; add `@/components/console/index.js`.
- `MissionPageShell data-chat-view=""` (×4 roots) → `<div data-chat-view="" className="…">` (mirror swept `tickets-view.tsx` root spacing).
- `MissionHero` ×4 → `Faceplate kicker="Conversations"` + `StripeHeader` with description text kept; hero badges (`Live thread sync` L91-97, `Drawer-backed threads` L164-170 — `border-white/10 bg-black/20 font-mono` Badges) → `<Tag mono>` with same text.
- Hero `meta` `MissionControlRow` + 3 `MissionPill`s (L172-179) → flex div + `<Tag>{threads.length} visible threads</Tag>`, `<Tag mono>{employees.length} employees</Tag>`, `<Tag mono>` drawer-state sentence.
- `MissionMetricTile` ×4 (L182-206) → `<MetricTile label value hint icon />` 1:1 (all four props supported).
- `MissionSectionCard` ×4 → `Faceplate kicker="Conversation roster"` (description text kept as body caption); the section badge `Thread index` (L213-219) → `<Tag mono>`.
- `MissionStateBlock` ×4 → `SubviewState` wrapped in `<div data-chat-view-state="…">`: no-company → STBY/`off`, loading → STBY/`hold`, error → NO-GO/`nogo`, empty → STBY/`off`. Titles/descriptions verbatim.
- Retry `<Button>` (L126-135): drop `border-white/10 bg-black/10 hover:bg-black/20` overrides; keep `data-chat-view-retry=""` + onClick.
- `MissionInsetSurface` roster wrapper (L229) → `<RecessedWell className="overflow-hidden p-0">` around the unchanged `<ThreadList …/>`.

**Test block:**
```ts
describe('chat-view', () => {
  it('console replaces all 8 Mission*, selectors + wiring preserved, no legacy', () => {
    const src = read('chat/chat-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-chat-view=""');
    for (const s of ['no-company', 'loading', 'error', 'empty']) {
      expect(src, `missing state ${s}`).toContain(`data-chat-view-state="${s}"`);
    }
    expect(src).toContain('data-chat-view-retry=""');
    expect(src).toContain('useThreadList(companyId)');
    expect(src).toContain('onSelectThread={handleSelectThread}');
    expectNoLegacy(src, 'chat-view.tsx');
  });
});
```

### Task 17: `chat-drawer.tsx` (the 674-LOC heavy file)

**Selectors to preserve (pinned by `chat-drawer.test.tsx` + `chat-view.test.tsx`):** `function TicketThreadPreviewPanel` + `data-thread-ticket-preview=""` (L91) + `<TicketThreadPreviewPanel` + `data-thread-ticket-preview-state="loading"` (L98); `const effectiveThreadId = activeThreadId;` (L143); `useStopChat` / `handleQueue` / `queuedCount={queuedCount}` / `onStop={handleStop}`; `ThreadMemoryCard` import + titles `"Copilot memory"` / `"Autonomous memory"` / `"Conversation memory"` + `compact`; sheet widths `sm:w-[720px]` / `xl:w-[820px]` / `2xl:w-[900px]` **verbatim**; aria-labels `"Back to threads"` (×2, L497/564), `"View all threads"` (L623); the sr-only `SheetDescription` block (L440-442).

**Recompose map:**
- `statusColor()` (L52-63) → §S9 sidenav canon verbatim (`--armed-lit`+pulse-slow / `--led-hold` / `--led-warn` / `--graphite`); dot span (L606-611) `rounded-full` → `rounded-sm`.
- `SheetContent` class (L425-428): `mission-shell … border-white/10 bg-background/95` → keep the width/flex/padding classes verbatim, swap chrome to `border-l border-[var(--hairline)] bg-background`.
- **Delete the `mission-grid` overlay div** (L443) — purely decorative (documented removal).
- `TicketThreadPreviewPanel` (L84-105): `border-white/10 … shadow-black/70 … xl:rounded-[24px]` → `border-[var(--hairline)] bg-background shadow-2xl xl:rounded-overlay` (if the `rounded-overlay` utility is absent, use `xl:rounded-lg`); keep both `data-thread-ticket-preview*` selectors and all positioning classes.
- 4 `MissionSheetHeader`s → §S7 idiom, one per view (kickers: "Communication index" / "Copilot transcript" / "Autonomous exchange" / "Direct line" — the existing eyebrow strings). Preserve every `SheetTitle` element + child (including the truncate span, `SystemAgentBadge`, the status dot) and every description expression (the copilot ternary L486-493 verbatim).
- `MissionIconButton` ×3 → `.cap` buttons keeping aria-labels + icons.
- Header badges: threads-count pill (L459-461) → `<Tag mono>{threads.length} threads</Tag>`; direct-line `displayStatus` pill (L630-632) → `<LampTile small label={displayStatus} tone={displayStatus === 'thinking' ? 'exec' : displayStatus === 'blocked' ? 'hold' : displayStatus === 'error' ? 'warn' : 'off'} interactive={false} />`; queued pill (L633-637) → `<Tag mono>{queuedCount} queued</Tag>` (same conditional render).
- Avatar chip (L616-618) `rounded-[18px] border-white/10 bg-black/20` → `rounded-md border border-[var(--hairline)] bg-surface-200 text-caption font-semibold` (org-node idiom).
- Amber agent icon treatment (L558) `iconClassName="border-amber-500/20 bg-amber-500/10 text-amber-300"` → `border-[var(--led-hold)]/20 bg-[var(--led-hold)]/10 text-[var(--led-hold)]` on the header icon chip.
- Memory-card strips (L504/571/642) `border-b border-white/10` → `border-b border-[var(--hairline)]`.
- Copilot/agent footer strips (L523-551, L590-597): outer `border-t border-white/10 bg-black/20` → `border-t border-[var(--hairline)]`; `MissionInsetSurface` → `RecessedWell className="flex items-center gap-2 px-3 py-3"`; failed-state `text-red-300` ×2 → `text-[var(--led-nogo)]`; keep every sentence + icon.
- All effects/handlers/render-gate logic (L191-419) untouched.

**Test block:**
```ts
describe('chat-drawer', () => {
  it('console sheet + S7 headers + every pinned contract preserved, no legacy', () => {
    const src = read('chat/chat-drawer.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<StripeHeader');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('const effectiveThreadId = activeThreadId;');
    expect(src).toContain('function TicketThreadPreviewPanel');
    expect(src).toContain('data-thread-ticket-preview=""');
    expect(src).toContain('sm:w-[720px]');
    expect(src).toContain('xl:w-[820px]');
    expect(src).toContain('2xl:w-[900px]');
    for (const t of ['Copilot memory', 'Autonomous memory', 'Conversation memory']) {
      expect(src, `missing memory title ${t}`).toContain(t);
    }
    expect(src).toContain('aria-label="Back to threads"');
    expect(src).toContain('aria-label="View all threads"');
    expectNoLegacy(src, 'chat-drawer.tsx');
  });
});
```

> Note: the drawer widths `sm:w-[720px]` etc. contain `[720px]` — the `rounded-[Npx]` pin only matches `rounded-[…]`, so widths are safe.

**Wave C checkpoint:** `pnpm vitest run chat work-comms-cluster-sweep --silent` → green (both chat suites + new blocks). Judge the §Extraction candidate (shared bubble treatment between `message-list`/`meeting-detail`) — extract into `components/console/` only if it factors cleanly; record the decision in the commit message of the last Wave-C commit.

---

## Wave D — Copilot (Tasks 18–20)

### Task 18: `copilot-insight-card.tsx`

**Selectors to preserve:** `data-copilot-insight-id={insight.id}`, `data-copilot-category={insight.category}`, `data-copilot-severity={insight.severity}` (L165-167), `` aria-label={`${categoryMeta.label} insight`} `` (L185), `` aria-label={`Dismiss insight: ${insight.title}`} `` (L246). `CATEGORY_META` labels/icons unchanged.

**Recompose map:**
- `SEVERITY_META` (L65-87) raw palette → LED vars:
  ```ts
  critical: { label: 'Critical', tone: 'nogo' as const, stripe: 'bg-[var(--led-nogo)]', chip: 'text-[var(--led-nogo)]' },
  warning:  { label: 'Warning',  tone: 'hold' as const, stripe: 'bg-[var(--led-hold)]', chip: 'text-[var(--led-hold)]' },
  info:     { label: 'Info',     tone: 'off'  as const, stripe: 'bg-[var(--led-info)]', chip: 'text-[var(--led-info)]' },
  ```
- `<li>` shell (L164-171) `mission-chrome-panel rounded-[24px] border-white/10` → `well transition-colors hover:border-[var(--hairline)]` (li keeps all three `data-*`).
- Left-edge stripe (L174-177) keeps shape, color from the new `stripe` value.
- Icon chip (L180-188) `rounded-[16px] border-white/10 bg-*-950/60` → `rounded-md border border-[var(--hairline)]` + `chip` text color; keep aria-label.
- Severity Badge (L192-202) → `<LampTile small label={severityMeta.label} tone={severityMeta.tone} interactive={false} />` (status). Category Badge (L203-208) → `<Tag>{categoryMeta.label}</Tag>`.
- Action `<Button>` (L228-237): drop `rounded-[16px] border-white/10 bg-black/10 hover:bg-black/20` overrides; keep text/disabled/onClick.
- Dismiss button (L242-255) → `className="cap …"` keeping aria-label, disabled, focus ring comes from the recipe.

**Test block:**
```ts
describe('copilot-insight-card', () => {
  it('LED severity + lamp/Tag badges + selectors preserved, no legacy', () => {
    const src = read('copilot/copilot-insight-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Tag');
    expect(src).toContain('var(--led-nogo)');
    expect(src).toContain('data-copilot-insight-id={insight.id}');
    expect(src).toContain('data-copilot-severity={insight.severity}');
    expect(src).toContain('Dismiss insight:');
    expectNoLegacy(src, 'copilot-insight-card.tsx');
  });
});
```

### Task 19: `copilot-dashboard-widget.tsx`

**Selectors to preserve:** `aria-label="Copilot insights"`, `data-copilot-widget=""` (L41), `data-copilot-widget-count={total}` (L50), `data-copilot-widget-empty=""` (L76), `data-copilot-widget-list=""` (L85), `data-copilot-widget-view-all=""` (L95).

**Recompose map:**
- `<section>` (L39-43): keep element + selectors; class `rounded-lg border border-border bg-surface-50 p-4` → `faceplate p-4` (the CSS recipe class directly — keeps element identity; matches the swept dashboard card family).
- Count Badge (L47-53) → `<Tag mono data-copilot-widget-count={total} className="ml-auto">{total} active</Tag>` (Tag spreads data-*; drop `font-mono` class — Tag `mono` owns it).
- Loading spinner block (L56-60) → `SubviewState lampLabel="STBY" lampTone="hold" title="Loading insights"` (keep `aria-label="Loading insights"` semantics via title).
- Error block (L62-73) → `SubviewState lampLabel="NO-GO" lampTone="nogo" title="Could not load insights." action={<Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>}`.
- Empty block (L75-81) → `<div data-copilot-widget-empty="">` wrapping `SubviewState lampLabel="STBY" lampTone="off" title="No active insights — the copilot is monitoring in the background."`.
- View-all button (L91-98): keep semantics + selector; classes → `nav-tile w-full border-dashed` flavor (dashed hairline, console hover).

**Test block:**
```ts
describe('copilot-dashboard-widget', () => {
  it('faceplate section + SubviewState states + selectors preserved, no legacy', () => {
    const src = read('copilot/copilot-dashboard-widget.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('data-copilot-widget=""');
    expect(src).toContain('data-copilot-widget-count={total}');
    expect(src).toContain('data-copilot-widget-empty=""');
    expect(src).toContain('data-copilot-widget-list=""');
    expect(src).toContain('data-copilot-widget-view-all=""');
    expectNoLegacy(src, 'copilot-dashboard-widget.tsx');
  });
});
```

### Task 20: `copilot-sidebar.tsx`

**Selectors to preserve (pinned by `copilot-sidebar-export.test.tsx` + E2E):** `data-copilot-sidebar-root=""` (L211), `data-copilot-active-count={activeCount}` (L223), `data-copilot-export-controls=""` (L241), `data-copilot-category-filter={category}` (L252), `data-copilot-severity-filter={severity}` (L270), `data-copilot-export-scope={scope}` (L288), `data-copilot-export-format={format}` (L302), `data-copilot-export-status=""` (L314), `data-copilot-export-error=""` (L325), `data-copilot-feedback-suggestion=""` (L335), `data-copilot-feedback-apply=""` (L344), `data-copilot-empty=""` (L388), `data-copilot-feed=""` (L398), `id="copilot-ask-input"` + `htmlFor` (L415/420), `data-copilot-ask-input=""` (L430), `data-copilot-ask-submit=""` (L439), `aria-label="Ask the copilot"` (L437), `data-copilot-ask-error=""` (L452), `role="alert"` (L451), every `aria-pressed`, `function buildExportRequest(format: CopilotExportFormat)` (L189), and all `case '<label>':` arms in the three formatters (L70-102 — untouched).

**Recompose map:**
- `SheetContent` (L208-212): `mission-shell … border-white/10 bg-background/95` → `border-l border-[var(--hairline)] bg-background` (keep flex/width/padding + `data-copilot-sidebar-root`). **Delete the `mission-grid` div** (L213).
- `MissionSheetHeader` (L215-234) → §S7 idiom, kicker "Copilot command"; keep `SheetTitle` + `SheetDescription` elements verbatim; active-count Badge (L220-227) → `<Tag mono data-copilot-active-count={activeCount}>{activeCount} active</Tag>`.
- Filter/export panel (L239-242) `mission-chrome-panel rounded-[24px] border-white/10` → `<RecessedWell className="p-4" data-copilot-export-controls="">`.
- All `MissionSegmentedButton`s (filters L248-258, L266-276; scope L284-294; formats L295-309; feedback L340-357; error retry L379-381) → `<button type="button" className={cn('nav-tile', active && 'nav-tile-active')} …>` keeping every `aria-pressed`, `data-*`, `disabled`, `onClick`, and label text. Format buttons (always `active` + `border-brand/25`) → `nav-tile-active` + `border-[var(--armed)]/25`.
- `MissionInsetSurface`s (feedback L335, loading L363, error L373, empty L388, ask panel L414) → `RecessedWell` (spreads the `data-copilot-feedback-suggestion`/`data-copilot-empty` selectors directly).
- `MissionStateBlock`s ×3 → `SubviewState`: loading → STBY/`hold`, error → NO-GO/`nogo` (Retry as `action`), empty ("All clear") → STBY/`off`. Titles/descriptions verbatim.
- Ask `<Textarea>` (L419-432): drop `border-white/10 bg-black/20` overrides; keep everything else. Ask submit button (L433-446) → `className="cap-armed h-11 w-11 shrink-0"` keeping aria-label, disabled expression, both icon states, `data-copilot-ask-submit`.
- Ask error `<p role="alert" data-copilot-ask-error="">` — keep verbatim (`text-destructive` retained).
- Footer bar (L413) `border-t border-white/10 bg-black/20` → `border-t border-[var(--hairline)]`.

**Test block:**
```ts
describe('copilot-sidebar', () => {
  it('console sheet + nav-tile filters + every pinned selector preserved, no legacy', () => {
    const src = read('copilot/copilot-sidebar.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('nav-tile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('cap-armed');
    for (const sel of [
      'data-copilot-sidebar-root=""', 'data-copilot-active-count={activeCount}',
      'data-copilot-export-controls=""', 'data-copilot-category-filter={category}',
      'data-copilot-severity-filter={severity}', 'data-copilot-export-scope={scope}',
      'data-copilot-export-format={format}', 'data-copilot-export-status=""',
      'data-copilot-export-error=""', 'data-copilot-empty=""', 'data-copilot-feed=""',
      'data-copilot-ask-input=""', 'data-copilot-ask-submit=""', 'data-copilot-ask-error=""',
    ]) {
      expect(src, `missing ${sel}`).toContain(sel);
    }
    expect(src).toContain('role="alert"');
    expect(src).toContain('aria-pressed');
    expect(src).toContain('function buildExportRequest(format: CopilotExportFormat)');
    expectNoLegacy(src, 'copilot-sidebar.tsx');
  });
});
```

**Wave D checkpoint:** `pnpm vitest run copilot work-comms-cluster-sweep --silent` → green.

---

## Wave E — User Guide (Task 21)

### Task 21: `user-guide-view.tsx`

**Selectors to preserve:** `data-user-guide-role={role}` (L253), `aria-label="Search the user guide"` + `data-user-guide-search=""` (L265/267), `data-user-guide-section-nav={section.id}` (L297), `data-user-guide-content={selectedSection.id}` (L315), `data-user-guide-task={task.id}` (L393), `data-user-guide-action={action.id}` (L456/472). Action ids and all copy come from `guide-content.ts` (untouched). `user-guide-shell.test.tsx` pins none of this file — but the E2E user-guide spec drives these selectors.

**Recompose map (the only 10-Mission\* file):**
- Drop the mission-shell import; add console import.
- `MissionPageShell` ×2 → root `<div>` (tickets-view idiom). No-company gate → `SubviewState lampLabel="STBY" lampTone="off"` with the existing title/description.
- `MissionHero` → `Faceplate kicker="User Guide"` + `StripeHeader`; description + actions (both `<Button>`s keep text/handlers; drop `rounded-full` className) kept.
- Hero badge `Workspace scoped` (L134) → `<Tag>`; meta pills: role label (L158) → `<Tag>`; core-readiness pill (L159-163) → §S1e: `<LampTile small label={summary.coreRemaining > 0 ? 'HOLD' : 'GO'} tone={summary.coreRemaining > 0 ? 'hold' : 'go'} interactive={false} />` + the existing sentence in an adjacent `<span className="text-caption text-silver-mute">`; Saving pill (L164-169) → `<Tag><Loader2 className="h-3 w-3 animate-spin" />Saving</Tag>`.
- `MissionMetricTile` ×3 (L174-192) → `MetricTile` 1:1 (label/value/hint). Under the "Checklist progress" tile add the phase's single VU (§S3): `<VuMeter value={summary.total > 0 ? summary.completed / summary.total : 0} label="Checklist progress" variant="progress" segments={16} />`.
- Welcome `MissionSectionCard` (L196-235) → `Faceplate kicker="First run"`; its badge pill → `<Tag>First run</Tag>`; sequence `MissionInsetSurface` (L221-233) → `RecessedWell` (keep the arrow sequence).
- saveError `MissionInsetSurface tone="danger"` (L238-244) → `RecessedWell className="border-[var(--led-nogo)]/25 px-4 py-4"` with `text-[var(--led-nogo)]` text (raw red-100/200 removed); keep ShieldCheck + message.
- `MissionControlRow` (L246) → flex div. Role `MissionSegmentedButton`s (L249-257) → `.nav-tile`/`.nav-tile-active` buttons keeping `data-user-guide-role={role}` + active logic. Search `<Input>` (L261-268): drop `rounded-[18px] border-white/10 bg-black/10` overrides; keep aria-label + `data-user-guide-search`.
- `MissionRailCard` ×4 (Role track L273, Checklist L369, Quick actions L445, Signal health L486) → `Faceplate kicker={title}` with description caption; Checklist badge pill (L373-375) → `<Tag mono>{summary.completed}/{summary.total}</Tag>`.
- Section-nav buttons (L287-303): `rounded-[18px] border-white/10 bg-black/10` + active `border-brand/20 bg-brand/10` → `nav-tile` w/ `nav-tile-active`-flavored selection (or the §S5 armed-selection well); keep the 3-line content + `data-user-guide-section-nav`.
- `MissionSectionCard` content host (L310-359) → `Faceplate`; category badge → `<Tag>`; bullets' `rounded-full` dots (L336) → `h-1.5 w-1.5 rounded-sm bg-[var(--armed)]`; callout `MissionInsetSurface`s (L344-356) → `RecessedWell` with tone borders: accent → `border-[var(--armed)]/20`, warning → `border-[var(--led-hold)]/20` (raw amber removed).
- No-selection `MissionStateBlock` (L361-365) → `SubviewState lampLabel="STBY" lampTone="off"` (title/description kept).
- Task rows (L387-438): wrapper → `RecessedWell` (spreads `data-user-guide-task`); completed → `border-[var(--armed)]/25 bg-[var(--armed)]/5`, else default well; CheckCircle2/Circle icons keep; priority pill (L406-408) → `<LampTile small label={task.priority} tone={task.priority === 'core' ? 'exec' : 'off'} interactive={false} />`; kind pill (L409) → `<Tag>{task.kind}</Tag>`; both Buttons keep (drop `rounded-full`).
- Quick-action buttons (L451-482 both loops): `rounded-[18px] border-white/10 bg-black/10 hover:…` → `well w-full text-left transition-colors hover:border-[var(--hairline)]`; keep `data-user-guide-action` + ArrowRight.
- Signal health rows (L490-518): each `MissionPill` → §S1e lamp + status text: e.g. provider → `<LampTile small label={providersLoading ? 'STBY' : signals.hasEnabledProvider ? 'GO' : 'HOLD'} tone={providersLoading ? 'hold' : signals.hasEnabledProvider ? 'go' : 'hold'} interactive={false} />` + `<span className="text-caption text-silver-mute">{existing status text}</span>`. Extensions/authority "none yet" → label `'OFF'`? No — keep stencil `label` from {GO|HOLD|STBY} and tone `'off'` for none-yet: `label={extensionsLoading ? 'STBY' : signals.hasExtensions ? 'GO' : 'STBY'} tone={…? 'go' : 'off'}`; existing words ('loading'/'installed'/'none yet'/…) always survive as the adjacent caption.

**Test block:**
```ts
describe('user-guide-view', () => {
  it('console replaces all 10 Mission*, VU on the checklist ratio, selectors preserved, no legacy', () => {
    const src = read('user-guide/user-guide-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('summary.total > 0 ? summary.completed / summary.total : 0');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('nav-tile');
    expect(src).toContain('data-user-guide-role={role}');
    expect(src).toContain('data-user-guide-search=""');
    expect(src).toContain('data-user-guide-section-nav={section.id}');
    expect(src).toContain('data-user-guide-content={selectedSection.id}');
    expect(src).toContain('data-user-guide-task={task.id}');
    expect(src).toContain('data-user-guide-action={action.id}');
    expectNoLegacy(src, 'user-guide-view.tsx');
  });
});
```

**Wave E checkpoint:** `pnpm vitest run user-guide guide-progress work-comms-cluster-sweep --silent` → green.

---

## Task 22: Cross-file sweep + final gates

**Files:** Modify `work-comms-cluster-sweep.test.ts` (add cross-file block; remove the `it.todo`).

- [ ] **Step 1: Add the cross-file legacy-absence guard**

```ts
describe('whole 5b/6 work-comms cluster is legacy-free', () => {
  const FILES = [
    'orgchart/org-chart-view.tsx', 'orgchart/org-chart-node.tsx', 'orgchart/org-chart-tree.tsx',
    'orgchart/employee-profile-dialog.tsx', 'orgchart/promote-dialog.tsx', 'orgchart/fire-dialog.tsx',
    'meetings/meetings-view.tsx', 'meetings/meeting-detail.tsx', 'meetings/call-meeting-dialog.tsx',
    'hire/hire-dialog.tsx',
    'chat/system-agent-badge.tsx', 'chat/composer.tsx', 'chat/message-list.tsx',
    'chat/thread-list.tsx', 'chat/chat-view.tsx', 'chat/chat-drawer.tsx',
    '../memory/thread-memory-card.tsx',
    'copilot/copilot-insight-card.tsx', 'copilot/copilot-dashboard-widget.tsx', 'copilot/copilot-sidebar.tsx',
    'user-guide/user-guide-view.tsx',
  ];
  for (const file of FILES) {
    it(`${file} has no legacy composition`, () => {
      expectNoLegacy(read(file), file);
    });
  }
});
```

- [ ] **Step 2: Full suite green**

Run: `cd apps/desktop && pnpm vitest run --silent 2>&1 | tail -8`
Expected: PASS — all 20 file blocks + cross-file block + all 7 pre-existing pin suites.

- [ ] **Step 3: Full lint/typecheck/biome 0-0**

Run: `cd apps/desktop && pnpm biome check && pnpm typecheck && pnpm eslint .`
Expected: 0 errors / 0 warnings.

- [ ] **Step 4: E2E smoke unchanged (visual-only proof)**

Run the repo's Electron E2E smoke (the CI Stage-1 command). Expected: PASS unchanged — chat/copilot/org/user-guide specs ride on preserved selectors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/work-comms-cluster-sweep.test.ts
git commit -m "test(sweep): Phase 5b/6 cross-file legacy-absence guard" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 23: Per-phase proof gate (before PR)

- [ ] `/design-review` skill audit against `DESIGN.md` anti-slop checklist → fix all findings. Explicit confirm list: §S1 tone maps (armed = ON AIR for live meeting/composer), the single §S3 VU, the levelPalette silver rank ramp, the message-bubble well treatment (60 fps on a long transcript — flat `.well`, no per-row depth stacks), checklist check icons, dashed view-all nav-tile.
- [ ] Screenshot pack (the 5a seeded-UI capture flow): Org Chart (tree + all 3 dialogs), Meetings (list + live detail + dialog), Hire dialog, Chat view + drawer (all four drawer views incl. copilot transcript + ticket preview), Copilot sidebar + dashboard widget, User Guide — × Night Ops + Day Shift. Verify: bolt corners render all four (the 5a purge-guard lesson), displays-stay-dark on every well/transcript in Day Shift, `--display-fg` text inside wells.
- [ ] Open PR → **CR-7 wall**: Stage-1 CI green → Stage-2 `/review` → Stage-3 Codex (Rocky-triggered; any HIGH/[P1] blocks — never self-clear) → Stage-4 Rocky sign-off → squash-merge.

---

## Self-Review

**Spec coverage:** All 21 files → Tasks 2–21 (org-chart-tree is guard-only by design — zero legacy markers); recompose mapping (§S1-S10 + per-task maps); single-real-ratio VU (§S3); stream recipe (§S4) applied in message-list; sheet-header idiom (§S7) at all 5 MissionSheetHeader sites; thread-memory-card heals the 5a ticket-detail mix (Task 14); cross-file guard (Task 22); design-review + dual-shift screenshots + CR-7 (Task 23). No gaps.

**Placeholder scan:** No TBD/handle-edge-cases/similar-to. Tone maps, the VU expression, the LAMP_TONE bridge, selector lists, and every test block are concrete. Judgment points (bubble-treatment extraction after Wave C; the tone-map confirmations at design-review) are bounded with default actions.

**Type/name consistency:** Verified against source 2026-07-04: `LampTone = 'off'|'go'|'hold'|'warn'|'nogo'|'exec'|'armed'`; `StripeHeader` trailing slot = `children` (only `Faceplate` has `stripeSlot`); `RecessedWell`/`MetricTile`/`Tag` spread `data-*`, `Faceplate` does not, `SubviewState` uses `testId`; `MetricTile` supports `icon`/`hint`; `VuMeter` `variant="progress"` exists (5a `7644908`); recipes `.well/.well-input/.cap/.cap-armed/.nav-tile/.nav-tile-active/.faceplate/.stripe` all present in `globals.css`; scrim literal from 5a-shipped `create-ticket-dialog.tsx:74`; §S9 dot map from swept `sidenav.tsx:20-31`; stream recipe from swept `stream-view.tsx:46`.

**Open verification at execution start:** confirm the `rounded-overlay`/`rounded-inset`/`rounded-pill` Tailwind utilities exist in the config (fallbacks stated inline); read shipped `tickets-view.tsx` + `goal-row.tsx` once for kicker style and the selected-row idiom before Wave A.
