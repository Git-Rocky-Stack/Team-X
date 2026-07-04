# v3.4.0 Aesthetic Sweep — Phase 5a (Boards & Planning Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the 16 Projects + Tickets renderer files onto the Command Console / Carbon Pro primitives — visual-only, zero behavior/IPC/data change, every E2E/a11y selector preserved.

**Architecture:** Each file's legacy/shadcn composition is replaced 1:1 with console primitives (`Faceplate`, `RecessedWell`, `MetricTile`, `LampTile`, `Tag`, `VuMeter`, `StripeHeader`, `SubviewState`) and CSS recipes (`.well-input`, `.cap`, `.nav-tile`). Correctness is gated by a co-located source-string-pin test (`boards-planning-cluster-sweep.test.ts`) asserting console-present + legacy-absent + selectors-preserved per file. No behavior changes, so source-pin (not RTL) is the deterministic tool.

**Tech Stack:** React 19 + TypeScript, Vitest, Biome, ESLint, pnpm 9.15.9, Node 22.22.2. Console primitives live in `apps/desktop/src/renderer/src/components/console/` (exported from `index.ts`); recipes in `apps/desktop/src/renderer/src/styles/globals.css`.

**Source spec:** `docs/superpowers/specs/2026-06-28-sweep-phase-05a-boards-planning-design.md` (committed `7c921e3`).

## Global Constraints

- **Visual-only.** Zero behavior / IPC / data / query / store / hook change. Text content, element identity, and child ordering preserved. Only wrappers/classNames change. (CSS `text-transform` does stencil casing — never edit DOM text.)
- **Branch:** `feat/v3.4.0-sweep-phase-05a-boards-planning` (already cut off `main` `49cc856`; spec committed `7c921e3`).
- **No version bump** (v3.4.0 tags only at Phase 8). No CHANGELOG entry required for a sweep sub-phase (matches 4a/4b).
- **Node/pnpm:** run `eval "$(fnm env)" && fnm use 22.22.2` first if `node -v` ≠ v22.22.2 (laptop default is v20).
- **Gates per commit:** `pnpm biome check`, `pnpm typecheck`, `pnpm eslint` (0 errors / 0 warnings), and the sweep test green. Never commit red.
- **`mission-shell.tsx` is OUT** — never edit it; it is purged in Phase 8. 5a only removes *these files'* imports of it.
- **Do NOT touch** any file outside the 16 listed + the one new test file.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Subagent boundary** (if delegating recomposes): edit-only-the-assigned-file, no git, no tooling; never read/traverse `~/.claude`, any `.claude/`, or any `agents/` directory.

---

## Shared decisions (apply everywhere — DRY)

### S1. Status → `LampTile` tone maps (design-review-confirmable defaults)

```
TICKET_STATUS_TONE   = { open: 'hold', 'in-progress': 'exec', blocked: 'nogo', done: 'go' }
PROJECT_STATUS_TONE  = { planning: 'hold', active: 'exec', completed: 'go', archived: 'off' }
GOAL_STATUS_TONE     = { active: 'exec', achieved: 'go', abandoned: 'off' }
```

Lamp `label` = the status word (CSS uppercases it). Use `<LampTile small ... />` inside cards/rows; full size only on detail-panel headers via `Faceplate`/`StripeHeader` `stripeSlot`.

### S2. Priority → `LampTile small` severity tone (NOT Tag — Tag is neutral-only)

```
PRIORITY_TONE = { critical: 'nogo', high: 'hold', medium: 'off', low: 'off' }
```

Only critical/high light; medium/low render unlit (`tone: 'off'`). Flagged for the `/design-review` gate to confirm or collapse. Lamp `label` = priority word.

### S3. Category/label chips → `Tag`

Assignee / lead / owner names, linked-goal/entity titles, file names, "kind" labels → `<Tag>{name}</Tag>` (add `mono` only for ids/refs/timestamps). Tag carries **no** color — never pass a `text-*`/`bg-*` tone class to it (repeats the 4b `cn`/twMerge font-size-collapse bug).

### S4. VU bindings — the ONLY four genuine `0–1` ratios (replace existing progress bars)

| File | `value` expression | Guard | `label` |
|---|---|---|---|
| `project-detail.tsx` | `project.ticketCounts.total > 0 ? project.ticketCounts.done / project.ticketCounts.total : 0` | total can be 0 → ternary guard (already computed as `progressPct` L148-151) | `"Ticket progress"` |
| `goal-row.tsx` | `goal.progressPct / 100` | constant denom, no guard | `"Goal progress"` |
| `goal-detail.tsx` | `detail.progressPct / 100` | constant denom, no guard | `"Goal progress"` |
| `kanban-board.tsx` (tickets) | `tickets.length > 0 ? columnTickets.length / tickets.length : 0` | `tickets.length` can be 0 → ternary guard | `` `${column.label} share` `` |

`VuMeter` self-clamps to `[0,1]` and tolerates NaN, but pass a guarded value anyway (Phase-3 P1 discipline). `kanban-board` VU is **optional** — mount only if it reads as genuine board instrumentation at the design-review; otherwise drop (per-column count stays a `MetricTile`/`Tag`). **No other file gets a VU** — all other surfaces use lamps + MetricTiles.

### S5. Numeric readouts → `MetricTile`; section headers → `StripeHeader`/`Faceplate`; selects/inputs → `.well-input`; icon buttons → `.cap`; subtab nav → `.nav-tile`

- Standalone counts (`{tickets.length} total`, backlog/active/blocked/resolved, per-column counts, participants/attachments/projects `(N)`) → `MetricTile` (`label` + `value`), or an inline `Tag` for tiny inline `(N)` header counts.
- Panel/hero headers → `StripeHeader` (inside a `Faceplate`) with a trailing `stripeSlot` lamp where a status exists.
- Native `<select className="mission-select …">` and ad-hoc inputs → `className="well-input …"`. Keep shadcn `<Input>`/`<Textarea>` as-is (Phase 1 already restyled them to wells — they are console vocabulary; not a legacy marker).
- Inline icon buttons (complete/delete/close/week-nav/add) → `className="cap …"` (neutral raised cap; **not** `.cap-chrome`, which is the reserved single CTA — the 4b lesson). The shadcn `<Button>` stays for primary text buttons.
- `projects-subtabs` segmented nav → `.nav-tile` / `.nav-tile-active` recipe; **add** `aria-current="page"` on the active tab (net-new a11y — there is no existing `role=tab`/`aria-current` to preserve, so this is a safe addition, not a contract change).

### S6. Selector re-homing rule

Every selector in §"Selectors to preserve" must survive **verbatim**. `Faceplate` does **not** spread `data-*`/`aria-*`; `RecessedWell`/`MetricTile`/`Tag`/`SubviewState`(`testId`) do. When a selector currently sits on a Mission shell or a div that becomes a `Faceplate`, move it to the **nearest prop-spreading console element or a plain wrapper `<div>`** — never drop it. `data-…-state` values are not `testId`; keep them on a wrapper `<div>` around `SubviewState`.

### S7. Extraction judgment (inline-first — Rocky 2026-06-28)

Default: inline-compose each board/card. **After** recomposing `ticket-card` + `kanban-board` (Wave A), judge whether a shared `KanbanColumn` and/or entity-card primitive factors cleanly across both kanbans/cards. Extract into `components/console/` (with its own test) **only if** it is a clean, low-divergence fit; otherwise stay inline. Do not pre-build. Record the decision in the Wave-B kickoff.

### S8. Forbidden-legacy set (the source-pin `expectNoLegacy` assertion)

Per file, source MUST NOT contain: `mission-shell`, `/Mission[A-Z]\w+/`, `mission-select`, `mission-chrome-panel`, `bg-black`, `/border-white\/\d/`, `font-mono`, `/rounded-\[\d+px\]/`, `/\brounded-full\b/`, and the raw-palette regex `/-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/`. (`brand`/`surface`/`muted`/`border`/`ring` tokens are retained Carbon tokens — NOT pinned, consistent with the 4b harness.)

---

## File structure

| # | File | Wave | Recompose weight | VU |
|---|---|---|---|---|
| new | `features/boards-planning-cluster-sweep.test.ts` | — | the contract | — |
| 1 | `features/tickets/ticket-card.tsx` | A | mission-chrome-panel + PRIORITY_CONFIG | — |
| 2 | `features/tickets/kanban-board.tsx` | A | mission-chrome-panel + column color maps | opt |
| 3 | `features/tickets/create-ticket-dialog.tsx` | A | bg-black backdrop + well-input fields | — |
| 4 | `features/tickets/ticket-detail.tsx` | A | STATUS/PRIORITY_COLORS + many raw tokens | — |
| 5 | `features/tickets/tickets-view.tsx` | A | **8 Mission\* primitives** | — |
| 6 | `features/projects/project-card.tsx` | B | PRIORITY_CONFIG + rounded-full avatar | — |
| 7 | `features/projects/projects-kanban.tsx` | B | column accents + rounded-full badge | — |
| 8 | `features/projects/projects-subtabs.tsx` | B | nav strip → nav-tile | — |
| 9 | `features/projects/projects-view.tsx` | B | spinner/error → SubviewState | — |
| 10 | `features/projects/project-detail.tsx` | B | 4 mission-select + progress bar + maps | ✓ |
| 11 | `features/projects/goal-row.tsx` | C | STATUS_CONFIG + progress bar | ✓ |
| 12 | `features/projects/goals-view.tsx` | C | spinner/error + header | — |
| 13 | `features/projects/goal-detail.tsx` | C | 2 color maps + progress bar | ✓ |
| 14 | `features/projects/create-goal-dialog.tsx` | C | bg-black backdrop + well-input fields | — |
| 15 | `features/projects/create-project-dialog.tsx` | C | 3 mission-select + backdrop | — |
| 16 | `features/projects/schedule-view.tsx` | C | 5 mission-select + SummaryTile + ScheduleCard + raw colors | — |

Waves are review batches; within a wave, recompose leaf components before their containers (card → board → view).

---

## Task 1: Test scaffold + baseline gates

**Files:**
- Create: `apps/desktop/src/renderer/src/features/boards-planning-cluster-sweep.test.ts`

**Interfaces:**
- Produces: `read(rel)` helper + `expectNoLegacy(src, file)` + `RAW_PALETTE` regex, consumed by every per-file describe block added in Tasks 2–16, and the cross-file block in Task 17.

- [ ] **Step 1: Confirm Node + clean baseline**

Run: `eval "$(fnm env)" && fnm use 22.22.2 && cd apps/desktop && pnpm vitest run --silent 2>&1 | tail -5`
Expected: existing suite PASS (green baseline before any change).

- [ ] **Step 2: Create the test file with helper only (no failing assertions)**

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
  expect(src, `${file}: bg-black`).not.toMatch(/\bbg-black\b/);
  expect(src, `${file}: border-white/N`).not.toMatch(/border-white\/\d/);
  expect(src, `${file}: font-mono`).not.toContain('font-mono');
  expect(src, `${file}: rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  expect(src, `${file}: rounded-full`).not.toMatch(/\brounded-full\b/);
  expect(src, `${file}: raw palette color`).not.toMatch(RAW_PALETTE);
}

// Exported via module scope for the per-file describe blocks below.
export { read, expectNoLegacy };

describe('boards & planning cluster sweep (Phase 5a)', () => {
  it.todo('per-file describe blocks added in Tasks 2–16');
});
```

- [ ] **Step 3: Verify green**

Run: `cd apps/desktop && pnpm vitest run boards-planning-cluster-sweep --silent 2>&1 | tail -5`
Expected: PASS (1 todo, 0 failures).

- [ ] **Step 4: Lint/typecheck + commit**

```bash
cd apps/desktop && pnpm biome check src/renderer/src/features/boards-planning-cluster-sweep.test.ts && pnpm typecheck
git add apps/desktop/src/renderer/src/features/boards-planning-cluster-sweep.test.ts
git commit -m "test(sweep): Phase 5a boards-planning sweep test scaffold

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Per-file task template (Tasks 2–16)

Every per-file task follows the identical 6-step cycle; only the **Selectors**, **Recompose map**, **VU**, and **Test block** differ. The cycle:

1. **Add the file's `describe` block** (from the task) to `boards-planning-cluster-sweep.test.ts`, replacing/append after the scaffold. Run it → **RED** (console-present assertions fail on the un-recomposed source).
2. **Run red:** `cd apps/desktop && pnpm vitest run boards-planning-cluster-sweep -t '<file>' --silent` → FAIL.
3. **Recompose the source file** per the Recompose map + Shared decisions. Preserve every listed selector verbatim (§S6). If delegating, dispatch one `elite-executor` subagent (edit-only-this-file).
4. **Run green:** same vitest command → PASS.
5. **Gate:** `pnpm biome check <file> && pnpm typecheck && pnpm eslint <file>` → 0/0.
6. **Commit:** `git add <file> boards-planning-cluster-sweep.test.ts && git commit -m "feat(sweep): recompose <file> onto console primitives" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

Each test block uses this shape (console-present list is per file):

```ts
describe('<file>', () => {
  it('console-present + legacy-absent + selectors preserved', () => {
    const src = read('<relative path>');
    expect(src).toContain("from '@/components/console'");        // console import
    // … per-file console-present asserts (see task) …
    // … per-file selector asserts (verbatim) …
    expectNoLegacy(src, '<file>');
  });
});
```

> Import path note: console primitives export from `@/components/console` (its `index.ts`); the **confirmed specifier is `@/components/console/index.js`** (NodeNext `.js` extension — verbatim from the 4b `heavy-panels-cluster-sweep.test.ts`, L14). The per-file assertions use a prefix match `toContain("from '@/components/console")`, which is robust to either form, so no change is needed regardless.

---

## Wave A — Tickets (Tasks 2–6)

### Task 2: `ticket-card.tsx`

**Files:** Modify `apps/desktop/src/renderer/src/features/tickets/ticket-card.tsx`; Test: add `ticket-card` block.

**Selectors to preserve:** `data-ticket-card={ticket.id}` (L63).

**Recompose map:**
- Card `mission-chrome-panel … rounded-[20px] bg-black/10 border-brand/20 hover:shadow-[…--mission-red…]` (L65) → `RecessedWell` (carries `data-ticket-card`). Drop the `--mission-red` shadow; rely on `.well` depth.
- `PRIORITY_CONFIG` color literals (L7-32) → priority `<LampTile small label={priority.label} tone={PRIORITY_TONE[ticket.priority]} interactive={false} />` (§S2). Remove `color`/`background` palette strings.
- Avatar `rounded-[10px] bg-brand/10 text-brand` (L89) → `rounded-card border border-[var(--hairline)]` neutral chip (no brand fill, no rounded-[Npx]).
- Label `Badge` (L100-107) → `<Tag>{labels[0]}{labels.length > 1 ? ` +${labels.length - 1}` : ''}</Tag>`.
- Assignee name → `<Tag>{assignee.name}</Tag>` / "Unassigned" → `<Tag>Unassigned</Tag>`.
- Overdue clock `text-red-300` (L111) → `text-[var(--led-nogo)]` when overdue else `text-silver-mute`.
- Card title h4 (L67-69) → keep as heading inside the well (no StripeHeader needed for a compact card).

**Test block:**
```ts
describe('ticket-card', () => {
  it('console hardware + lamp priority + selector preserved, no legacy', () => {
    const src = read('tickets/ticket-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Tag');
    expect(src).toContain('data-ticket-card={ticket.id}');
    expectNoLegacy(src, 'ticket-card.tsx');
  });
});
```

### Task 3: `kanban-board.tsx`

**Files:** Modify `…/tickets/kanban-board.tsx`; Test: add `kanban-board` block.

**Selectors to preserve:** `data-tickets-board=""` (L72), `data-tickets-column={column.status}` (L79), `aria-label="Create ticket"` (L105).

**Recompose map:**
- `COLUMNS` `accentClassName`/`badgeClassName` palette literals (L10-40) → drop; encode column status via a `LampTile` in the column `StripeHeader` using `TICKET_STATUS_TONE[column.status]` (§S1).
- Column shell `mission-chrome-panel … rounded-[24px] bg-black/15 ${accent}` (L78) → `Faceplate` (with `data-tickets-column` re-homed onto a wrapper `<div>` per §S6, since Faceplate doesn't spread props) **or** `RecessedWell` (spreads props — preferred so `data-tickets-column` stays on it directly).
- Column header block (L83-98): h3 `{column.label}` + count badge + sub-line → `StripeHeader kicker={column.label}` with `stripeSlot={<LampTile small label={column.label} tone={TICKET_STATUS_TONE[column.status]} interactive={false} />}`; the `rounded-full` count badge (L88) → `<MetricTile label={column.label} value={String(columnTickets.length)} />` **or** inline `<Tag mono>{columnTickets.length}</Tag>` (pick MetricTile for the column total).
- Create button (L104) `rounded-[14px] bg-black/20` → `className="cap …"`, keep `aria-label="Create ticket"`.
- Empty-lane placeholder (L115) → `RecessedWell` dashed (drop `bg-black/10`, `border-white/10`).
- **VU (optional, §S4):** column-fill `VuMeter value={tickets.length > 0 ? columnTickets.length / tickets.length : 0} label={`${column.label} share`} segments={12}` in the column header. Decide at design-review; if dropped, leave the MetricTile count.

**Test block:**
```ts
describe('kanban-board', () => {
  it('console columns + lamp status + selectors preserved, no legacy', () => {
    const src = read('tickets/kanban-board.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<StripeHeader');
    expect(src).toContain('<LampTile');
    expect(src).toContain('data-tickets-board=""');
    expect(src).toContain('data-tickets-column={column.status}');
    expect(src).toContain('aria-label="Create ticket"');
    expectNoLegacy(src, 'kanban-board.tsx');
  });
});
```

### Task 4: `create-ticket-dialog.tsx`

**Files:** Modify `…/tickets/create-ticket-dialog.tsx`; Test: add block.

**Selectors to preserve:** `aria-hidden={!open}` (L72), `role="presentation"` (L79), and the 5 `htmlFor`/`id` pairs: `ticket-title`, `ticket-desc`, `ticket-priority`, `ticket-assignee`, `ticket-due-date`.

**Recompose map:**
- Backdrop `fixed inset-0 bg-black/50` (L74) → `fixed inset-0 bg-[var(--scrim)]` (console overlay scrim token; verify token name in globals.css `--scrim`/`--overlay`; if absent use `bg-[hsl(0_0%_0%/0.6)]` literal — NOT `bg-black`).
- Dialog header h2 + description (L82-85) → `StripeHeader kicker="File a Ticket"` + caption description (or keep h2 with console heading classes).
- Form fields: the two native `<select>` (priority L120, assignee L138) → `className="well-input …"`; keep shadcn `<Input>`/`<Textarea>`. Labels → label recipe (`text-label text-silver-mute`).

**Test block:**
```ts
describe('create-ticket-dialog', () => {
  it('well-input fields + dialog selectors preserved, no legacy', () => {
    const src = read('tickets/create-ticket-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('aria-hidden={!open}');
    expect(src).toContain('role="presentation"');
    for (const id of ['ticket-title', 'ticket-desc', 'ticket-priority', 'ticket-assignee', 'ticket-due-date']) {
      expect(src, `missing id ${id}`).toContain(id);
    }
    expectNoLegacy(src, 'create-ticket-dialog.tsx');
  });
});
```

### Task 5: `ticket-detail.tsx`

**Files:** Modify `…/tickets/ticket-detail.tsx`; Test: add block.

**Selectors to preserve:** `data-ticket-detail-state="loading"` (L77), `data-ticket-detail=""` (L114), `data-ticket-participants=""` (L190), and aria-labels: `"Close detail"` (L120), `"Close"` (L139), `"Add ticket participant"` (L205), `"Add selected employee to ticket"` (L224), `` `Remove ${participant.name} from ticket` `` (L254), `"Remove attachment"` (L332).

**Recompose map:**
- `STATUS_COLORS` (L36-41) → status `<LampTile small label={detail.status} tone={TICKET_STATUS_TONE[detail.status]} interactive={false} />`.
- `PRIORITY_COLORS` (L43-48) → priority `<LampTile small label={detail.priority} tone={PRIORITY_TONE[detail.priority]} interactive={false} />`.
- Loading state (L77 block) → wrap `SubviewState lampLabel="STBY" lampTone="hold"` in a `<div data-ticket-detail-state="loading">`.
- Detail header (L114-132): re-home `data-ticket-detail` onto the `Faceplate` wrapper `<div>`; header → `StripeHeader kicker="Detail rail"` + title; short-id badge `rounded-full font-mono` (L128) → `<Tag mono>{detail.id.slice(0,8)}</Tag>`.
- Participants section: `data-ticket-participants` stays on its container `<div>`; `Participants ({n})` → `MetricTile`/section header; participant chips → `<Tag>`; add-participant `<select>` (L205) → `well-input` keeping `aria-label`; remove/close/add buttons → `.cap` keeping aria-labels.
- Attachments: chips → `<Tag>`; the many `rounded-[Npx] bg-black/15 border-white/10` blocks → `RecessedWell`/`Faceplate`; message bubbles (L359-365) → `RecessedWell` (drop brand/black tokens); Textarea kept; Send button → shadcn `<Button>`; avatar `bg-brand/10` → neutral chip.

**Test block:**
```ts
describe('ticket-detail', () => {
  it('console hardware + lamps + selectors preserved, no legacy', () => {
    const src = read('tickets/ticket-detail.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Tag');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('data-ticket-detail=""');
    expect(src).toContain('data-ticket-detail-state="loading"');
    expect(src).toContain('data-ticket-participants=""');
    for (const a of ['Close detail', 'Add ticket participant', 'Add selected employee to ticket', 'Remove attachment']) {
      expect(src, `missing aria ${a}`).toContain(a);
    }
    expect(src).toContain('from ticket'); // the `Remove ${name} from ticket` template
    expectNoLegacy(src, 'ticket-detail.tsx');
  });
});
```

### Task 6: `tickets-view.tsx`

**Files:** Modify `…/tickets/tickets-view.tsx`; Test: add block.

**Selectors to preserve:** `data-tickets-view=""` (L59), `data-tickets-view-state` 5 values (`no-company` L133, `loading` L145, `error` L168, `empty` L190, `detail-idle` L248), `data-tickets-board-shell=""` (L196).

**Recompose map (the only multi-`Mission*` file):**
- Import drop `@/features/mission/mission-shell.js`; add `@/components/console`.
- `MissionPageShell` (root) → `<div data-tickets-view="">` wrapping a `Faceplate`.
- `MissionHero` (L60-63, "Ticket Operations") → `StripeHeader kicker="Ticket Operations"` + description.
- `MissionMetricTile` ×4 (L97-118 Backlog/Active/Blocked/Resolved) → `MetricTile label=… value={String(summary.open)}` etc.
- `MissionPill` ×4 (L89-92): `{tickets.length} total` → `MetricTile`/`Tag`; `{summary.critical} critical` → `<LampTile small label="CRITICAL" tone="nogo" interactive={false} />` + count; `unassigned`/`collaborators` → `<Tag>`.
- `MissionSectionCard`/`MissionRailCard` (L125-236) → `Faceplate kicker=…`; re-home `data-tickets-board-shell` onto the board container `<div>`.
- `MissionStateBlock` ×5 → `SubviewState`, each wrapped in `<div data-tickets-view-state="…">` (states: no-company/loading/error/empty/detail-idle). Map tones: loading→`hold`/STBY, error→`nogo`, empty→`hold`/STBY, no-company→`off`/STBY, detail-idle→`off`/STBY.
- `MissionControlRow` → flex row container (plain div).
- Buttons `border-white/10 bg-black/10` / `bg-brand text-white` → shadcn `<Button>`; `font-mono` Badge (L204) → `<Tag mono>`.

**Test block:**
```ts
describe('tickets-view', () => {
  it('console hardware replaces all Mission*, selectors preserved, no legacy', () => {
    const src = read('tickets/tickets-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-tickets-view=""');
    expect(src).toContain('data-tickets-board-shell=""');
    for (const s of ['no-company', 'loading', 'error', 'empty', 'detail-idle']) {
      expect(src, `missing state ${s}`).toContain(`data-tickets-view-state="${s}"`);
    }
    expectNoLegacy(src, 'tickets-view.tsx');
  });
});
```

**Wave A checkpoint:** after Task 6, run the full cluster test + decide §S7 extraction (KanbanColumn/entity-card) against the now-recomposed `ticket-card`/`kanban-board`. Record decision before Wave B.

---

## Wave B — Projects boards (Tasks 7–11)

### Task 7: `project-card.tsx`

**Selectors to preserve:** none.

**Recompose map:**
- `PRIORITY_CONFIG` (L11-14) → priority `<LampTile small label={priority.label} tone={PRIORITY_TONE[project.priority]} interactive={false} />`.
- `Card mission`-free but `bg-surface-50` → `RecessedWell`.
- Lead avatar `rounded-full bg-brand/20 text-brand` (L58) → `rounded-card border` neutral chip; lead name → `<Tag>`.
- Overdue date `text-red-400` (L72) → `text-[var(--led-nogo)]`.
- Card title h4 → heading inside the well.

**Test block:**
```ts
describe('project-card', () => {
  it('console card + lamp priority, no legacy', () => {
    const src = read('projects/project-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Tag');
    expectNoLegacy(src, 'project-card.tsx');
  });
});
```

### Task 8: `projects-kanban.tsx`

**Selectors to preserve:** `aria-label="Create project"` (L69).

**Recompose map:**
- `COLUMNS` `accent` literals (`border-t-brand`/`border-t-yellow-500`/`green-500`/`zinc-500`, L11-14) → drop; column status via `LampTile` (`PROJECT_STATUS_TONE`, §S1) in the `StripeHeader`.
- Column shell (L53) → `RecessedWell`/`Faceplate`.
- Header h3 `{col.label}` + `rounded-full bg-muted` count (L60) → `StripeHeader kicker={col.label}` `stripeSlot={<LampTile small label={col.label} tone={PROJECT_STATUS_TONE[col.status]} interactive={false} />}` + `<MetricTile value={String(colProjects.length)} />`.
- Add button (L68) → `.cap`, keep `aria-label="Create project"`.
- Empty state (L79) → `RecessedWell` dashed.

**Test block:**
```ts
describe('projects-kanban', () => {
  it('console columns + lamp status + selector preserved, no legacy', () => {
    const src = read('projects/projects-kanban.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<StripeHeader');
    expect(src).toContain('<LampTile');
    expect(src).toContain('aria-label="Create project"');
    expectNoLegacy(src, 'projects-kanban.tsx');
  });
});
```

### Task 9: `projects-subtabs.tsx`

**Selectors to preserve:** none (active is visual-only today).

**Recompose map:**
- Container `bg-surface-50` strip (L23) → keep as a `.stripe`-flavored bar or a `Faceplate` header; the button row → `.nav-tile` recipe.
- Active state `bg-brand/10 text-brand` (L36) → `.nav-tile-active`; inactive → `.nav-tile`.
- **Add** `aria-current={isActive ? 'page' : undefined}` on each tab button (net-new a11y, §S5).

**Test block:**
```ts
describe('projects-subtabs', () => {
  it('nav-tile recipe + aria-current added, no legacy', () => {
    const src = read('projects/projects-subtabs.tsx');
    expect(src).toContain('nav-tile');
    expect(src).toContain("aria-current");
    expectNoLegacy(src, 'projects-subtabs.tsx');
  });
});
```

### Task 10: `projects-view.tsx`

**Selectors to preserve:** none.

**Recompose map:**
- Loading spinner `rounded-full border-brand` (L38) → `SubviewState lampLabel="STBY" lampTone="hold" title="Loading projects…"`.
- Error block (L52) → `SubviewState lampLabel="NO-GO" lampTone="nogo" title="Failed to load projects" action={<Button …>Retry</Button>}` (keep the retry handler).
- "New project" button `bg-brand text-white` (L56) → shadcn `<Button>`.

**Test block:**
```ts
describe('projects-view', () => {
  it('SubviewState for loading/error, no legacy', () => {
    const src = read('projects/projects-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expectNoLegacy(src, 'projects-view.tsx');
  });
});
```

### Task 11: `project-detail.tsx`

**Selectors to preserve:** aria-labels `"Close detail panel"` (L197), `"Delete project"` (L234); 7 `htmlFor`/`id` pairs: `project-edit-title`, `project-edit-description`, `project-edit-status`, `project-edit-priority`, `project-edit-lead`, `project-edit-goal`, `project-edit-target-date`.

**Recompose map:**
- `STATUS_COLORS`/`PRIORITY_COLORS` (L19-31) → status `<LampTile small tone={PROJECT_STATUS_TONE[project.status]} label={project.status} />`; priority `<LampTile small tone={PRIORITY_TONE[project.priority]} label={project.priority} />`.
- Spinner (L136) → `SubviewState`.
- **VU (§S4):** progress bar (L433-438) → `<VuMeter value={project.ticketCounts.total > 0 ? project.ticketCounts.done / project.ticketCounts.total : 0} label="Ticket progress" segments={16} />`; keep the `{done}/{total}` text as a `MetricTile`/caption (L441). Remove `progressColor` ladder (L154) + `rounded-full` track/fill.
- 4 `mission-select` (L279/299/318/337) → `className="well-input …"`.
- Lead avatar `rounded-full bg-brand/20 text-brand` (L415) → neutral chip; lead/linked-goal names → `<Tag>`.
- Header bar (L192-238) → re-home aria-labels onto `.cap` buttons; title → `StripeHeader`.
- Linked-tickets `(N)` (L448) → `MetricTile`/inline `Tag`.

**Test block:**
```ts
describe('project-detail', () => {
  it('VU progress + lamps + well-input + selectors preserved, no legacy', () => {
    const src = read('projects/project-detail.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<VuMeter');
    expect(src).toContain('<LampTile');
    expect(src).toContain('well-input');
    for (const a of ['Close detail panel', 'Delete project']) expect(src).toContain(a);
    for (const id of ['project-edit-title', 'project-edit-description', 'project-edit-status',
      'project-edit-priority', 'project-edit-lead', 'project-edit-goal', 'project-edit-target-date']) {
      expect(src, `missing id ${id}`).toContain(id);
    }
    expectNoLegacy(src, 'project-detail.tsx');
  });
});
```

---

## Wave C — Projects goals + dialogs + schedule (Tasks 12–16)

### Task 12: `goal-row.tsx`

**Selectors to preserve:** none.

**Recompose map:**
- `STATUS_CONFIG` (L6-10) → `<LampTile small label={statusConfig.label} tone={GOAL_STATUS_TONE[goal.status]} interactive={false} />`.
- Row container `border-brand/50 bg-brand/5` / `bg-surface-50` (L34-39) → `RecessedWell` (selected variant via console selection recipe if a selected state exists).
- **VU (§S4):** progress bar (L55-57) → `<VuMeter value={goal.progressPct / 100} label="Goal progress" segments={12} />`; keep `{progressPct}%` as caption. Remove `progressColor` ladder (L23) + `rounded-full`.
- Status `Badge` (L45-50) replaced by the LampTile above; `projectCount` → `<Tag>` or `MetricTile`; overdue `text-red-400` (L72) → `text-[var(--led-nogo)]`.

**Test block:**
```ts
describe('goal-row', () => {
  it('VU progress + lamp status, no legacy', () => {
    const src = read('projects/goal-row.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<VuMeter');
    expect(src).toContain('<LampTile');
    expectNoLegacy(src, 'goal-row.tsx');
  });
});
```

### Task 13: `goals-view.tsx`

**Selectors to preserve:** none.

**Recompose map:** spinner (L30) + any error → `SubviewState`; header `Company Goals ({n})` + New Goal `bg-brand` button (L41-51) → `StripeHeader kicker="Company Goals"` (+ `MetricTile`/inline count) + shadcn `<Button>`.

**Test block:**
```ts
describe('goals-view', () => {
  it('console header + SubviewState, no legacy', () => {
    const src = read('projects/goals-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toMatch(/<SubviewState|<StripeHeader/);
    expectNoLegacy(src, 'goals-view.tsx');
  });
});
```

### Task 14: `goal-detail.tsx`

**Selectors to preserve:** aria-labels `"Close detail panel"` (L55), `"Delete goal"` (L68).

**Recompose map:**
- `STATUS_COLORS` (L9-13) → `<LampTile small label={detail.status} tone={GOAL_STATUS_TONE[detail.status]} />`.
- `PROJECT_STATUS_COLORS` (L15-20) → per-project status small lamp; lead name → `<Tag>`.
- Spinner (L35) → `SubviewState`.
- **VU (§S4):** progress bar (L85-87) → `<VuMeter value={detail.progressPct / 100} label="Goal progress" segments={12} />`; keep `{progressPct}%` caption. Remove `progressColor` (L44) + `rounded-full`.
- Header bar (L50-72) → `.cap` buttons (keep aria-labels) + `StripeHeader`; delete-hover `text-red-400` → `text-[var(--led-nogo)]`.

**Test block:**
```ts
describe('goal-detail', () => {
  it('VU progress + lamps + selectors preserved, no legacy', () => {
    const src = read('projects/goal-detail.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<VuMeter');
    expect(src).toContain('<LampTile');
    for (const a of ['Close detail panel', 'Delete goal']) expect(src).toContain(a);
    expectNoLegacy(src, 'goal-detail.tsx');
  });
});
```

### Task 15: `create-goal-dialog.tsx`

**Selectors to preserve:** `aria-hidden={!open}` (L44), `role="presentation"` (L51); `goal-title`, `goal-desc`, `goal-date` `htmlFor`/`id`.

**Recompose map:** backdrop `bg-black/50` (L46) → scrim token (§S5/Task 4); header h2 (L54) → `StripeHeader kicker="Create Goal"`; the raw native date `<input>` (L90-96) and shadcn fields → `className="well-input …"` (unify with create-project-dialog's treatment).

**Test block:**
```ts
describe('create-goal-dialog', () => {
  it('well-input fields + dialog selectors preserved, no legacy', () => {
    const src = read('projects/create-goal-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('aria-hidden={!open}');
    expect(src).toContain('role="presentation"');
    for (const id of ['goal-title', 'goal-desc', 'goal-date']) expect(src).toContain(id);
    expectNoLegacy(src, 'create-goal-dialog.tsx');
  });
});
```

### Task 16: `create-project-dialog.tsx`

**Selectors to preserve:** `aria-hidden={!open}` (L76), `role="presentation"` (L83); 6 `htmlFor`/`id` pairs: `project-title`, `project-desc`, `project-priority`, `project-lead`, `project-goal`, `project-target-date`.

**Recompose map:** backdrop `bg-black/50` (L78) → scrim token; header h2 (L86) → `StripeHeader kicker="Create Project"`; 3 `mission-select` (L127/145/165) + shadcn fields → `className="well-input …"`.

**Test block:**
```ts
describe('create-project-dialog', () => {
  it('well-input fields + dialog selectors preserved, no legacy', () => {
    const src = read('projects/create-project-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('aria-hidden={!open}');
    expect(src).toContain('role="presentation"');
    for (const id of ['project-title', 'project-desc', 'project-priority', 'project-lead', 'project-goal', 'project-target-date']) {
      expect(src, `missing id ${id}`).toContain(id);
    }
    expectNoLegacy(src, 'create-project-dialog.tsx');
  });
});
```

### Task 17: `schedule-view.tsx` (the 843-LOC heavy file)

**Selectors to preserve:** form ids/htmlFor (13): `schedule-title`, `schedule-kind`, `schedule-priority`, `schedule-start-date`, `schedule-start-time`, `schedule-end-date`, `schedule-end-time`, `schedule-reminder-date`, `schedule-reminder-time`, `schedule-assignee`, `schedule-link-kind`, `schedule-link-id`, `schedule-description`; aria-labels: `"Previous week"` (L459), `"Next week"` (L476), `"Complete scheduled item"` (L252), `"Delete scheduled item"` (L263), `"Close scheduler form"` (L558); `title` attrs: `"Previous week"`, `"Next week"`, `"Complete"`, `"Delete"`, `"Close"`.

**Recompose map:**
- Header `Team Schedule` + week-nav bar (L444-485) → `StripeHeader kicker="Team Schedule"`; the 3 week-nav buttons (prev/today/next) → `.cap` (keep `aria-label`+`title`); "Add" → shadcn `<Button>`.
- `SummaryTile` inline component (L177-193) → replace its body with `MetricTile` (label/value/icon); 4 usages (L487-490 Today/Overdue/Next-14/Agent-wakes).
- Day grid columns (L501-541): `section` shells → `RecessedWell`/`Faceplate`; `isToday` accent `border-brand/60` → console armed border token; day-count `rounded-full bg-muted` badge (L514) → `<Tag mono>{dayItems.length}</Tag>`; empty "Clear" placeholder → `RecessedWell` dashed.
- `ScheduleCard` inline component (L195-293): `priorityClass` border-l palette (L133-144) → `border-l-[var(--led-…)]` console tones mapped from `PRIORITY_TONE`; `statusClass` (L146-151) `text-emerald/red-500` → console tones; card shell → `RecessedWell`; source/status chips (L231-238) → `<Tag>`; complete/delete `.cap` buttons keep aria-label+title; `text-emerald-500`/`text-red-500` complete/delete hovers → console led tones.
- Scheduler form (L547-809): 5 native `<select className="mission-select …">` (L588/605/717/743/760) → `className="well-input …"`; close button (L551) → `.cap` keep aria-label+title; shadcn `<Input>`/`<Textarea>` kept.
- Loading/error states (L418-440) → `SubviewState` (loading→`hold`/STBY, error→`nogo`/NO-GO with Retry).
- Agenda sidebar (L812-838) → `Faceplate`/`RecessedWell`.

**Test block:**
```ts
describe('schedule-view', () => {
  it('console hardware + well-input + all form/aria selectors preserved, no legacy', () => {
    const src = read('projects/schedule-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('well-input');
    for (const id of ['schedule-title','schedule-kind','schedule-priority','schedule-start-date',
      'schedule-start-time','schedule-end-date','schedule-end-time','schedule-reminder-date',
      'schedule-reminder-time','schedule-assignee','schedule-link-kind','schedule-link-id','schedule-description']) {
      expect(src, `missing id ${id}`).toContain(id);
    }
    for (const a of ['Previous week','Next week','Complete scheduled item','Delete scheduled item','Close scheduler form']) {
      expect(src, `missing aria ${a}`).toContain(a);
    }
    expectNoLegacy(src, 'schedule-view.tsx');
  });
});
```

---

## Task 18: Cross-file sweep + final gates

**Files:** Modify `boards-planning-cluster-sweep.test.ts` (add cross-file block; remove the `it.todo`).

- [ ] **Step 1: Add the cross-file legacy-absence guard**

```ts
describe('whole 5a boards-planning cluster is legacy-free', () => {
  const FILES = [
    'tickets/ticket-card.tsx', 'tickets/kanban-board.tsx', 'tickets/create-ticket-dialog.tsx',
    'tickets/ticket-detail.tsx', 'tickets/tickets-view.tsx',
    'projects/project-card.tsx', 'projects/projects-kanban.tsx', 'projects/projects-subtabs.tsx',
    'projects/projects-view.tsx', 'projects/project-detail.tsx', 'projects/goal-row.tsx',
    'projects/goals-view.tsx', 'projects/goal-detail.tsx', 'projects/create-goal-dialog.tsx',
    'projects/create-project-dialog.tsx', 'projects/schedule-view.tsx',
  ];
  for (const file of FILES) {
    it(`${file} has no legacy composition`, () => {
      expectNoLegacy(read(file), file);
    });
  }
});
```

- [ ] **Step 2: Full suite green (3× for flake-safety on the dev machine)**

Run: `cd apps/desktop && pnpm vitest run --silent 2>&1 | tail -8`
Expected: PASS, all 16 file blocks + cross-file block green.

- [ ] **Step 3: Full lint/typecheck/biome 0-0**

Run: `cd apps/desktop && pnpm biome check && pnpm typecheck && pnpm eslint .`
Expected: 0 errors / 0 warnings.

- [ ] **Step 4: E2E smoke unchanged (visual-only proof)**

Run the repo's Electron E2E smoke (the CI Stage-1 job, e.g. `pnpm test:e2e` or the documented command). Expected: PASS unchanged — selectors preserved.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/features/boards-planning-cluster-sweep.test.ts
git commit -m "test(sweep): Phase 5a cross-file legacy-absence guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Per-phase proof gate (before PR)

- [ ] `/design-review` skill audit against `DESIGN.md` anti-slop checklist → fix all findings (esp. confirm/adjust the §S1/S2 tone maps and the §S4 optional kanban VU).
- [ ] Screenshot pack: every swept surface (projects kanban/goals/schedule, project & goal detail, tickets board & detail, both create dialogs) × Night Ops + Day Shift → Rocky eyeball sign-off. Verify displays-stay-dark in Day Shift; 60 fps on schedule-view + boards.
- [ ] Open PR → **CR-7 wall**: Stage-1 CI green → Stage-2 `/review` → Stage-3 Codex (Rocky-triggered; any HIGH/[P1] blocks) → Stage-4 Rocky sign-off → squash-merge.

---

## Self-Review

**Spec coverage:** Every spec §-item maps to a task — scope (16 files → Tasks 2–17), recompose mapping (§S1-S5 + per-task maps), real-ratio-only VU (§S4: 4 genuine ratios, all others none), inline-first extraction (§S7 + Wave-A checkpoint), contract/test mechanism (Task 1 helper + per-file blocks + Task 18 cross-file), dual-shift/displays-dark + design-review + screenshot + CR-7 (Task 19). No gaps.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". VU expressions, tone maps, selector lists, and every test block are concrete. The two deliberate judgment points (kanban VU, KanbanColumn extraction) are explicitly bounded with a default action, not vague.

**Type/name consistency:** Console primitive names + props verified against source (`Faceplate`/`RecessedWell`/`MetricTile`/`LampTile`/`Tag`/`VuMeter`/`StripeHeader`/`SubviewState`, `LampTone` values `off|go|hold|warn|nogo|exec|armed`). `expectNoLegacy`/`read`/`RAW_PALETTE` defined once (Task 1), referenced identically everywhere. Tone-map names (`TICKET_STATUS_TONE`/`PROJECT_STATUS_TONE`/`GOAL_STATUS_TONE`/`PRIORITY_TONE`) consistent across §S1-S2 and all tasks.

**Open verification at execution start:** confirm the exact console import specifier (`@/components/console` vs `…/index.js`) against an existing swept file (e.g. an autonomy panel) before pinning the assertion string; confirm the overlay scrim token name in `globals.css` (`--scrim`/`--overlay`) for the dialog backdrops.
