# Aesthetic Sweep Phase 2 — Shell + Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the app chrome (layout, top bar, sidenav, workspace switcher, create-company dialog, company-settings sheet, command palette) onto the Phase 1 Command Console foundation, mount the AnnunciatorRail with real signals, and wire ShiftToggle to the per-company theme.

**Architecture:** Visual recomposition of existing components onto the console recipe layer that Phase 1 landed in `globals.css` (`.faceplate`, `.well`, `.well-input`, `.cap` family, `.stencil`, `.text-placard`, `.annunciator-strip`, LED/tag tokens) plus the `components/console/` primitive library (Faceplate, StripeHeader, HexBolt, LampTile, AnnunciatorRail, ShiftToggle, wells). Two NEW behaviors are explicitly in-scope per the spec: (1) AnnunciatorRail mounted in the shell fed by real renderer signals, (2) ShiftToggle wired to `company.theme` so Day Shift becomes reachable. Everything else is zero-behavior visual recomposition.

**Tech Stack:** React 19, Tailwind 3.4 + console recipes, Radix/shadcn primitives (restyled in Phase 1, APIs frozen), zustand (`app-store`), TanStack Query + IPC hooks, Vitest (node default; jsdom per-file pragma + `components/console/test-setup.ts`), Playwright E2E (must pass UNMODIFIED).

---

## Context primer (paste into every implementer prompt)

**Repo:** `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X` — Electron monorepo; renderer at `apps/desktop/src/renderer/src/`. Branch: `feat/v3.4.0-sweep-phase-02-shell-command-deck` (cut from main `6b92e6d`).

**The sweep doctrine (from `DESIGN.md` + the spec):**
- A swept screen uses the console vocabulary EXCLUSIVELY: faceplates, stripe headers, hex bolts, recessed wells, machined caps, lamp tiles, stencil/placard typography. It must NOT use `.mission-*`, `.brand-selected`, `.amoled-menu-surface`, raw `bg-black`, `border-white/10`, ad-hoc radii (`rounded-[30px]` etc.), `surface-*` palette, or raw `red-500`/`amber-500`/`emerald-500` status colors.
- The legacy classes stay DEFINED in `globals.css` for unswept screens (purged Phase 8) — you only remove *usages* in files this phase sweeps.
- Displays stay dark in BOTH shifts: `.well`, `.well-input`, `.lcd*`, `.lamp*`, `.annunciator-*`, `.switch-track`, `.cap` family carry literal dark values — never add `.dark` variants to them, never put shift-flipping tokens inside them.
- LED text that sits on SHIFT surfaces (not dark modules) must use `--tag-go/--tag-hold/--tag-warn` (day-darkened); LED text on dark modules/caps uses `--led-*` + `--led-*-edge` borders.
- No decorative LEDs/meters. Every lamp and meter is bound to a real signal.
- Motion: snap/mechanical only (`--ease-snap`, 150ms-) — no new transitions on cap recipes (they deliberately have none).

**Console class cheat-sheet (all already exist in `globals.css`):**
`.faceplate` (raised section panel) · `.plate` (Card/Dialog/Sheet chrome — shadcn primitives already apply it) · `.well` (recessed dark display) · `.well-input` (recessed input — Input/Textarea/SelectTrigger already apply it) · `.cap` / `.cap-armed` / `.cap-warn` / `.cap-chrome` (Button variants secondary|outline / default / destructive / chrome already apply them) · `.lamp` `.lamp-sm` `.lamp-{go,hold,warn,exec,armed}` `.lamp-interactive` · `.lcd` `.lcd-amber` `.lcd-red` · `.annunciator-module` (Alert applies it) · `.annunciator-strip` (rail shelf) · `.stencil` (word-lamp typography for TSX) · `.text-placard` (panel nameplate) · `.text-eyebrow`/`-sm`, `.text-menu-label`, `.text-shortcut`, `.text-code`/`-sm`, `.text-numeric`/`-lg` · `.hex` + `.hex-{tl,tr,bl,br}` · `.stripe` (brushed header band) · radii utilities `rounded-card|control|overlay|inset|pill` · tokens `--hairline`, `--carbon-*`, `--armed*`, `--led-*`, `--tag-*`, `--display-*`, `--scrollbar-thumb`.

**Console React primitives (`components/console/`, barrel `index.ts`):** `Faceplate` (section, bolts default on, stripe via `kicker`/`serial`/`trail` props — pass `aria-label` when it's a labeled region), `StripeHeader`, `HexBolt`, `RecessedWell`, `LcdWell` (tone go|amber|red), `LampTile` (`label, tone, small, alert, acknowledged, onAcknowledge, interactive`), `VuMeter` (real signals only), `AnnunciatorRail` (`tiles: AnnunciatorTileSpec[], onNavigate, onAcknowledge` — ONE stable button per tile, ack→teleport ritual), `ShiftToggle` (`shift: 'night'|'day', onToggle`).

**Hard E2E contract — these selectors/attributes MUST survive verbatim (specs run UNMODIFIED):**
`data-top-bar-shell`, `data-top-bar-nav`, `data-testid="app-brand-name"`, the literal badge text `Phase 6`, `data-copilot-toolbar-toggle`, `data-autonomy-nav`, `data-user-guide-nav`, EmployeeItem `aria-label` format `"{name}, {title} — {status}. Click to open|close chat."`, `data-board-message-queue*` + `data-board-queue-led`, ALL `data-workspace-switcher-*`, ALL `data-create-company-*` (incl. `data-create-company-theme="dark|light"`), ALL `data-company-settings-*`, command palette `role="dialog"` + `aria-label="Command input"` + intent/entity `aria-label` prefixes + `Press … to run` text + `data-step-kind=*`, `[data-testid="commands-view"]`, `[data-testid="commands-list"]`.

**Test conventions:** workspace vitest env is `node` (`globals: false`). DOM tests opt in per-file with a `@vitest-environment jsdom` docblock pragma and `import './test-setup';` FIRST (only inside `components/console/`; for tests elsewhere, import `@testing-library/jest-dom/vitest` first + explicit `afterEach(cleanup)`). Source-string audit tests (e.g. `shell-foundation.test.tsx`, `top-bar.test.tsx`) read the component source as a string and assert pinned substrings — update pins when you change the strings they pin. Unit tests may change; **Playwright E2E specs may NOT**.

**Gates to run per task (from repo root):** `pnpm typecheck` · `pnpm lint` (Biome; run `npx biome check --write <files>` to format) · `pnpm lint:eslint` (0 errors required; 125-warning baseline) · `pnpm -F @team-x/desktop exec vitest run <paths>` for focused suites, `pnpm test` for full. Locate code by SELECTOR/searched string, never by line number (they drift).

**Commit style:** descriptive subjects, `feat(sweep):`/`fix(sweep):`/`test(sweep):` prefixes, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File map (what this phase touches)

| File | Action |
|---|---|
| `apps/desktop/src/renderer/src/styles/globals.css` | Add `.cap-select` chooser recipe + nav-tile recipe (Task 1) |
| `apps/desktop/src/renderer/src/app/layout.tsx` (23 LOC) | Recompose shell (Task 2) |
| `apps/desktop/src/renderer/src/app/shell-foundation.test.tsx` | Re-pin to console strings (Task 2) |
| `apps/desktop/src/renderer/src/app/top-bar.tsx` (131 LOC) | Recompose command bar (Task 3) |
| `apps/desktop/src/renderer/src/app/board-message-queue.tsx` (463 LOC) | Chrome-surface retoken (Task 4) |
| `apps/desktop/src/renderer/src/app/sidenav.tsx` (247 LOC) | Recompose team rail (Task 5) |
| `apps/desktop/src/renderer/src/features/workspace/workspace-switcher.tsx` (207 LOC) | Recompose (Task 6) |
| `apps/desktop/src/renderer/src/features/workspace/create-company-dialog.tsx` (485 LOC) | Recompose + fix legacy cap override (Task 7) |
| `apps/desktop/src/renderer/src/features/workspace/company-settings.tsx` (429 LOC) | Recompose (Task 8) |
| `apps/desktop/src/renderer/src/features/command/command-palette.tsx` (1064 LOC) | Recompose palette body (Task 9) |
| `apps/desktop/src/renderer/src/features/command/step-card.tsx` (459 LOC) | Recompose step cards + skeleton (Task 10) |
| `apps/desktop/src/renderer/src/hooks/use-shift.ts` + `.test.ts` | NEW — shift sync hook (Task 11) |
| `apps/desktop/src/renderer/src/app/annunciator-signals.ts` + `.test.ts` | NEW — pure tile derivation (Task 12) |
| `apps/desktop/src/renderer/src/app/annunciator-rail-mount.tsx` + `.test.tsx` | NEW — rail mount + hook wiring (Task 13) |
| `apps/desktop/src/store/app-store.ts` | Add annunciator ack slice (Task 12) |
| `CHANGELOG.md` | Phase 2 entry (Task 14) |

---

### Task 1: Branch + phase recipes (`.cap-select`, `.nav-tile`)

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css` (console recipe `@layer components` block — find the `.cap-chrome` recipe and add after its `.dark .cap-chrome` companion)

- [ ] **Step 1: Cut the branch from FRESH main**

```bash
git checkout main && git pull origin main
git log -1 --oneline   # expect: 6b92e6d Merge pull request #26 ...  (or newer)
git checkout -b feat/v3.4.0-sweep-phase-02-shell-command-deck
```

- [ ] **Step 2: Add the chooser-selection + nav-tile recipes**

DESIGN.md: "Tier/selection chips … selected = LED-tinted … Supersedes `.brand-selected` family during the sweep" and "Left nav rail: Archivo-caps stencil items; active = armed-red bordered tile". Swept choosers/nav need a console-native selected state. Add to the console recipe layer in `globals.css`, directly after the `.dark .cap-chrome` rule:

```css
  /* Chooser-selection caps — the swept replacement for `.brand-selected`.
     Apply ON TOP of `.cap`: armed-red is the default (brand/command);
     tint variants follow the LED semantic map. Selected chips stay
     legible on both shifts because the cap face is dark hardware. */
  .cap-select {
    border-color: var(--armed-edge);
    color: var(--armed-lit);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 0 14px var(--armed-glow);
  }
  .cap-select-go {
    border-color: var(--led-go-edge);
    color: var(--led-go);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 0 12px rgba(65, 226, 94, 0.18);
  }
  .cap-select-hold {
    border-color: var(--led-hold-edge);
    color: var(--led-hold);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 0 12px rgba(255, 176, 0, 0.16);
  }

  /* Nav tile — stencil nav items (sidenav sections, top-bar tabs).
     A flat chassis tile, NOT a raised cap: nav is wayfinding, not a
     command. Active = armed-red bordered tile (DESIGN.md §Layout). */
  .nav-tile {
    border: 1px solid transparent;
    border-radius: var(--r-control);
    color: hsl(var(--muted-foreground));
  }
  .nav-tile:hover {
    border-color: var(--hairline);
    color: hsl(var(--foreground));
  }
  .nav-tile-active {
    border-color: var(--armed-edge);
    background: var(--armed-soft);
    color: hsl(var(--foreground));
    box-shadow: 0 0 10px var(--armed-glow);
  }
```

- [ ] **Step 3: Gates + commit**

```bash
pnpm lint && pnpm typecheck
git add apps/desktop/src/renderer/src/styles/globals.css
git commit -m "feat(sweep): cap-select chooser + nav-tile recipes for Phase 2 chrome"
```

---

### Task 2: Shell layout recomposition

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/layout.tsx`
- Test: `apps/desktop/src/renderer/src/app/shell-foundation.test.tsx` (source-string audit — re-pin)

The current shell is `mission-app-shell` + `mission-grid` overlay + two `mission-chrome-panel` regions (`rounded-[30px]`, `bg-black`, `border-white/10`). The console shell is the bare carbon chassis: token background, no decorative grid (anti-slop: decoration without function), content regions framed by hairline + card tokens. The faceplates come from the views themselves (Phase 3+) — the shell stays quiet.

- [ ] **Step 1: Re-pin the source-string audit FIRST (TDD for string audits)**

In `shell-foundation.test.tsx`, replace every assertion that pins a legacy string. The pins to DELETE assert substrings like `mission-app-shell`, `mission-grid`, `mission-chrome-panel flex-1 overflow-y-auto rounded-[30px]`, `mission-chrome-panel flex w-64 shrink-0 flex-col rounded-[30px]`, `mission-control-row` (read the file; keep its read-source harness and test names, swap the expected strings). New pins:

```ts
// shell chassis: token background, no mission namespace, no grid overlay
expect(layoutSource).toContain('relative flex h-screen flex-col overflow-hidden bg-background text-foreground');
expect(layoutSource).not.toContain('mission-app-shell');
expect(layoutSource).not.toContain('mission-grid');
// content stage + sidenav: console framing, machined radius
expect(layoutSource).toContain('min-w-0 flex-1 overflow-y-auto rounded-card border border-[var(--hairline)] bg-card');
expect(layoutSource).toContain('flex w-64 shrink-0 flex-col rounded-card border border-[var(--hairline)] bg-card');
```

(If the audit file also pins sidenav/top-bar strings, leave those pins for Tasks 3/5 — only re-pin what Task 2 changes. If `mission-control-row` is pinned for the sidenav, that re-pin happens in Task 5.)

- [ ] **Step 2: Run to verify the new pins FAIL**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app/shell-foundation.test.tsx
```
Expected: FAIL on the new `toContain` pins.

- [ ] **Step 3: Recompose `layout.tsx`**

```tsx
import { AppViews } from './app-views';
import { Sidenav } from './sidenav';
import { TopBar } from './top-bar';

export function Layout() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      {/* AnnunciatorRail mounts here in Task 13 */}
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 pt-3">
        <Sidenav />
        <main className="min-w-0 flex-1 overflow-y-auto rounded-card border border-[var(--hairline)] bg-card scrollbar-thin">
          <AppViews />
        </main>
      </div>
    </div>
  );
}
```

IMPORTANT: read the existing file first and keep its actual imports/children EXACTLY (the names above are illustrative — the real children may differ, e.g. how views render inside `<main>`, chat drawer mounts, etc.). Only the wrapper classNames and the removal of the `mission-grid` div change. The sidenav's own root className changes in Task 5 — if the `w-64` framing currently lives on the `<aside>` inside `sidenav.tsx` rather than in layout, apply the console framing string there in Task 5 and pin accordingly; the string audit just has to match where the code actually puts it.

- [ ] **Step 4: Verify**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app/shell-foundation.test.tsx
pnpm typecheck && pnpm lint
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/app/layout.tsx apps/desktop/src/renderer/src/app/shell-foundation.test.tsx
git commit -m "feat(sweep): shell chassis - token background, hairline-framed stage, mission-grid removed"
```

---

### Task 3: Top bar — the command bar

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/top-bar.tsx`
- Test: `apps/desktop/src/renderer/src/app/top-bar.test.tsx` (only if it pins styling strings — the `Phase 6` badge pin and version freeze-pins MUST stay untouched)

Recomposition (DESIGN.md §Layout: "Top command bar (edge-to-edge)"). Preserve EVERY data-* hook and the `Phase 6` badge literal.

- [ ] **Step 1: Recompose the header shell**

Replace the `mission-topbar`/`mission-chrome-panel` wrappers:
- `<header data-top-bar-shell>`: `relative z-10 border-b border-[var(--hairline)] bg-card px-3 py-2` (edge-to-edge strip — NO rounded panel, NO `bg-black`, no `border-white/10`).
- Brand block (currently `mission-chrome-panel … rounded-[28px]`): a quiet placard group — `flex items-center gap-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-1.5`.
- Brand icon box (currently `h-12 w-12 … rounded-[18px] … text-brand`): `flex h-9 w-9 items-center justify-center rounded-control border border-[var(--hairline)] bg-[var(--carbon-800)] text-primary` (keep the icon child as-is).
- Brand name `<span data-testid="app-brand-name">`: add `text-placard` (drop any ad-hoc font classes on it; keep the testid + text).
- The `Phase 6` `<Badge>` stays EXACTLY as-is (stencil Badge from Phase 1; the literal string is pinned by `top-bar.test.tsx`).

- [ ] **Step 2: Recompose the TABS nav**

Inside `<nav data-top-bar-nav>` (keep attribute + structure + onClick handlers + disabled logic verbatim), replace the per-tab button classes:

```tsx
className={cn(
  'nav-tile stencil inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px]',
  isActive && 'nav-tile-active',
  isDisabled && 'cursor-not-allowed opacity-40',
)}
```

Delete the legacy active/hover strings (`border-brand/30 bg-black text-brand`, `shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]`, `hover:border-white/10`). Keep icons. The Copilot button (`data-copilot-toolbar-toggle`) becomes a machined cap: replace its custom classes with `cap stencil inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] text-foreground` (no variant API change — it's a plain `<button>`; if it's a shadcn `<Button>`, use `variant="outline"` and drop the overrides).

- [ ] **Step 3: Right cluster + ⌘K hint**

Right cluster (BoardMessageQueue + logo): leave the components (Task 4 sweeps the queue button internally), but replace any `bg-black`/`border-white/10` wrapper classes here with `border-[var(--hairline)] bg-[var(--carbon-850)]` equivalents. Add a command-palette hint between the nav and the right cluster (DESIGN.md command bar spec):

```tsx
<span
  aria-hidden="true"
  className="well hidden items-center gap-1 rounded-control px-2 py-1 text-shortcut text-[var(--display-fg)] lg:inline-flex"
>
  ⌘K
</span>
```

(If the palette opens on Ctrl+K on Windows, render the label from the existing shortcut constant if one exists — search for the keydown handler that opens the palette; otherwise keep the literal `⌘K` per DESIGN.md.)

- [ ] **Step 4: Update `top-bar.test.tsx` ONLY if a styling pin broke; verify**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app/top-bar.test.tsx src/renderer/src/app/shell-foundation.test.tsx
pnpm typecheck && pnpm lint && pnpm lint:eslint
```
The `Phase 6` and version pins must still pass UNCHANGED.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/app/top-bar.tsx apps/desktop/src/renderer/src/app/top-bar.test.tsx
git commit -m "feat(sweep): command bar - edge-to-edge strip, stencil nav tiles, placard brand, cmd-K well hint"
```

---

### Task 4: Board message queue — chrome surfaces

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/board-message-queue.tsx`

This component carries `data-board-message-queue-button`, `data-board-queue-led`, `data-board-message-queue-panel`, `data-board-message-queue` — ALL preserved. It also has one of the three known legacy light-text cap overrides (a `<Button>` near line ~447 with `bg-*`/text overrides fighting the Phase 1 cap recipe).

- [ ] **Step 1: Retoken the button + panel**

Read the file. Apply these mappings everywhere they appear IN THIS FILE:
- `bg-black` → `bg-card` (panel surfaces) or `bg-[var(--carbon-850)]` (nested boxes)
- `border-white/10` / `border-white/20` → `border-[var(--hairline)]` / `border-[var(--hairline-strong)]`
- `.brand-selected` on the trigger button → keep IF the button is a chooser-selected state; if it marks "panel open", replace with `cap-select` on top of its cap base (the swept replacement)
- the queue LED span (`data-board-queue-led`) → keep its conditional logic, map its color classes onto `bg-[var(--led-go)]` / `bg-[var(--led-hold)]` / `bg-[var(--led-warn)]` / unlit `bg-[var(--graphite)]` per the existing semantic
- ad-hoc radii → `rounded-card`/`rounded-control`/`rounded-overlay` (nearest machined step)
- the legacy cap override (~line 447): a `<Button>` with `border border-brand/40 bg-black text-brand hover:bg-black`-style classes — DELETE the overrides entirely and pick the right variant (`variant="outline"` for neutral, `variant="default"` if it is the consequential primary action of the panel)

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app
git add apps/desktop/src/renderer/src/app/board-message-queue.tsx
git commit -m "feat(sweep): board queue chrome - carbon tokens, LED queue dot, cap variants without overrides"
```

---

### Task 5: Sidenav — the team rail

**Files:**
- Modify: `apps/desktop/src/renderer/src/app/sidenav.tsx`
- Test: `apps/desktop/src/renderer/src/app/shell-foundation.test.tsx` (re-pin `mission-control-row` → console string, if pinned there)

Preserve: `data-autonomy-nav`, `data-user-guide-nav`, the EmployeeItem `aria-label` contract `"{name}, {title} — {status}. Click to open|close chat."`, all conditional rendering.

- [ ] **Step 1: Recompose the rail**

- Root `<aside>` (currently `mission-chrome-panel … rounded-[30px]` or framed in layout): `flex w-64 shrink-0 flex-col rounded-card border border-[var(--hairline)] bg-card` (coordinate with the Task 2 pin — the string lives wherever the width is actually declared).
- Header: keep "Team" + "Employee rail" copy; "Team" gets `text-placard`; "Employee rail" stays `text-eyebrow text-muted-foreground`. The Hire `<Button>`: delete the `border border-brand/30 bg-black … text-brand hover:…` overrides → `variant="default"` (hiring is the rail's consequential command — armed cap), `size` unchanged.
- Status row (currently `mission-control-row … rounded-[22px] border-white/10`): `flex items-center justify-between rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-3`. The "{n} busy" pill → small lamp: replace the pill span with `<span className="lamp lamp-sm lamp-hold">{thinkingCount} BUSY</span>` (real signal: thinking employees).
- Employee count: wrap the number in `text-numeric text-[18px]`? NO — `.text-numeric` is a fixed 24px role; instead use `font-data tabular-nums text-foreground` for the count span (Departure Mono via the Tailwind `font-data` family).
- `statusColor()` map: replace raw colors — `bg-brand animate-pulse-slow` → `bg-[var(--armed-lit)] animate-pulse-slow`; `bg-amber-500` → `bg-[var(--led-hold)]`; `bg-red-500` → `bg-[var(--led-warn)]`; `bg-zinc-500` → `bg-[var(--graphite)]`.
- EmployeeItem buttons: keep aria-label EXACTLY; selected state `border-brand/30 bg-black text-foreground` → `nav-tile-active`; base/hover → `nav-tile`; avatar box `rounded-[16px] border-white/10 bg-black` → `rounded-control border border-[var(--hairline)] bg-[var(--carbon-800)]`; item radius `rounded-[18px]` → `rounded-control`.
- Threads / Autonomy / User Guide buttons: `nav-tile stencil flex w-full items-center gap-2 px-3 py-2 text-[10.5px]` + `nav-tile-active` when their view is active; icons keep `text-primary` only when active, else inherit. KEEP `data-autonomy-nav` / `data-user-guide-nav`.
- Footer idle/busy `<output>` pill: `rounded-pill border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-1`.
- All `<Separator className="bg-white/10">` → drop the override (Separator already renders `bg-[var(--hairline)]` from Phase 1).

- [ ] **Step 2: Verify + commit**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/app/sidenav.tsx apps/desktop/src/renderer/src/app/shell-foundation.test.tsx
git commit -m "feat(sweep): team rail - placard header, lamp busy signal, LED status dots, stencil nav tiles"
```

---

### Task 6: Workspace switcher

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/workspace/workspace-switcher.tsx`

Preserve ALL `data-workspace-switcher-*` attributes, `aria-label`/`aria-current`, Skeleton loading slot, error/empty rows and their behavior.

- [ ] **Step 1: Recompose**

- Trigger (currently `mission-workspace-trigger … rounded-[24px] border-white/10` + `data-[state=open]:bg-black`): `flex items-center gap-3 rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] px-3 py-2 text-left transition-colors hover:border-[var(--hairline-strong)] data-[state=open]:border-[var(--armed-edge)]`. Error tint: keep the conditional but map `text-destructive` → unchanged (it is tokenized). Drop every `hover:bg-black`.
- Trigger icon box `h-10 w-10 rounded-[18px] border-white/10 bg-black text-brand` → `flex h-9 w-9 items-center justify-center rounded-control border border-[var(--hairline)] bg-[var(--carbon-800)] text-primary`.
- "Workspace" eyebrow + name + caption: keep the typography roles (`text-eyebrow-sm`, `text-body-strong`, `text-caption`) — they are master-scale roles, allowed.
- `DropdownMenuContent` (currently `min-w-[280px] rounded-[24px] border-white/10 bg-black p-2 shadow-2xl`): drop ALL of it — Phase 1's DropdownMenuContent already renders the console overlay (rounded-overlay plate). Keep only `min-w-[280px]` + the data attribute.
- Item rows: drop `rounded-[18px]` (items already `rounded-inset` from Phase 1). Active item `border border-brand/25 bg-black font-semibold text-brand` → `font-semibold text-primary` + keep the `<Check>`; the focus/selected backdrop comes from the Phase 1 item recipe (`focus:bg-[var(--armed-soft)]`).
- `DropdownMenuSeparator className="bg-white/10"` → drop the override.

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/features/workspace/workspace-switcher.tsx
git commit -m "feat(sweep): workspace switcher - carbon trigger well, console overlay, armed active row"
```

---

### Task 7: Create-company dialog

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/workspace/create-company-dialog.tsx`

Preserve ALL `data-create-company-*` attributes, label `htmlFor`/`id` pairs, `aria-invalid`/`aria-describedby` error wiring, conditional template/blank sections.

- [ ] **Step 1: Recompose**

- `selectClass` constant (native `<select>` styling with `bg-black ring-offset-black`): replace with the recessed-well voice — `'well-input flex h-10 w-full rounded-control px-3 py-2 text-body focus-visible:outline-none'` (`.well-input` carries border/background/focus ring; delete the rest).
- Labels (`text-label text-muted-foreground`): replace with the console form voice → `font-data text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground` is what the Phase 1 `<Label>` primitive renders — if these are raw `<label>` elements, swap each to the shadcn `<Label htmlFor=…>` component (import from `@/components/ui/label`) and keep the text.
- Template preview panel `rounded-lg border border-border bg-black p-3` → `well rounded-control p-3` (recessed display showing template data — display surface).
- Theme chooser labels (the `data-create-company-theme={choice}` radios): replace the conditional classes with the chooser-cap vocabulary:

```tsx
className={cn(
  'cap flex-1 cursor-pointer rounded-control px-3 py-2 text-center text-button-sm capitalize',
  'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring',
  isSelected && 'cap-select',
)}
```

- Info/note panel `rounded-lg border-white/10 bg-black …` → `well rounded-control px-3 py-2 text-caption text-[var(--display-fg)]`.
- Submit `<Button data-create-company-submit>` — THE known legacy override (`border border-brand/40 bg-black text-brand hover:bg-black`): DELETE the className overrides entirely; `variant="default"` (armed cap — creating a workspace is consequential). Cancel stays `variant="ghost"`.
- Error `<p>` styling stays (`text-caption text-destructive` is tokenized).

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/workspace 2>/dev/null || true
git add apps/desktop/src/renderer/src/features/workspace/create-company-dialog.tsx
git commit -m "feat(sweep): create-workspace dialog - well inputs, cap-select theme chooser, armed submit cap"
```

---

### Task 8: Company settings sheet

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/workspace/company-settings.tsx`

Preserve ALL `data-company-settings-*` attributes and the `<details>` delete-confirmation flow.

- [ ] **Step 1: Recompose**

- `SheetContent` className `mission-shell … border-l border-white/10 bg-background/95 p-0`: → `flex w-full flex-col overflow-hidden p-0 sm:max-w-md` (SheetContent already renders the `.plate` console chrome from Phase 1; delete `mission-shell` and the grid overlay `<div className="mission-grid …" />` entirely).
- `MissionSheetHeader` (legacy composition component): replace with `<StripeHeader kicker="MOD · WORKSPACE · 01" …>` from `@/components/console` if its API fits the slot — otherwise inline: a `div.stripe` band containing the icon + `<SheetTitle>` (SheetTitle already renders `text-placard` style from Phase 1; drop its `text-h3` override) + `<SheetDescription>`. Keep the eyebrow copy ("Workspace control") as the stripe kicker.
- `MissionInsetSurface` wrapper → `<RecessedWell className="p-4">` from `@/components/console` (or `div.well rounded-control p-4` if the component slot shape differs). Section heading "General" → `text-placard`.
- Every `<Input className="border-white/10 bg-black">` → drop the override (Input is already `well-input`).
- Provider `<select>` with the long focus classes → same `well-input` replacement as Task 7's `selectClass`.
- Theme radios (`data-company-settings-theme={choice}`) → the same `cap` + `cap-select` chooser treatment as Task 7 Step 1.
- Save button (`data-company-settings-save`, currently `rounded-[18px] border-brand/40 bg-black text-brand hover:bg-black`): delete overrides → `variant="default"` + `className="w-full"`.
- Archive button (`data-company-settings-archive`): delete overrides → `variant="outline"` + `className="w-full justify-start"`.
- Delete `<details>` panel `rounded-[20px] border-destructive/25 bg-black` → `rounded-control border border-[var(--led-warn-edge)] bg-[var(--warn-soft)] p-3`; the delete `<Button data-company-settings-delete>` → `variant="destructive"` (cap-warn), drop text overrides; confirm Input override dropped.
- `scrollbar-thin` stays (tokenized in Phase 1/Stage 2).

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/features/workspace/company-settings.tsx
git commit -m "feat(sweep): company settings - plate sheet, stripe header, recessed wells, variant-pure caps"
```

---

### Task 9: Command palette — input, states, gates

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/command/command-palette.tsx`

Preserve: `role="dialog"` semantics (DialogContent), `aria-label="Command input"`, intent/entity chip `aria-label` prefixes (`Intent:` / `Entity`), the `Press … to run` copy, all state-machine conditionals, keyboard handlers, `data-testid` anchors. This task covers everything EXCEPT `StepLogView`'s step cards/skeleton/toast (Task 10) — but the StepLogView header/footer/list shell IS in this file, so retoken it here.

- [ ] **Step 1: Surface retoken (mechanical, whole file)**

Apply these mappings throughout `command-palette.tsx`:
- `bg-surface-100` → `bg-card` · `bg-surface-50` → `bg-[var(--carbon-850)]` · `bg-surface-200` → `bg-[var(--carbon-800)]` · `hover:bg-surface-200` → `hover:bg-[var(--carbon-800)]`
- `border-border` stays (tokenized); `border-border/60` stays
- error family: `border-red-500/30 bg-red-500/10` → `border-[var(--led-warn-edge)] bg-[var(--warn-soft)]` · `text-red-400`/`text-red-300` → `text-led-warn` · `border-red-500/40 … hover:bg-red-500/20` (retry button) → `border-[var(--led-warn-edge)] hover:bg-[var(--warn-soft)]` · `border-red-500/60 bg-red-500/5` (failed run row) → `border-[var(--led-warn-edge)] bg-[var(--warn-soft)]`
- write-side amber family: `border-amber-500/30 bg-amber-500/10` → `border-[var(--led-hold-edge)] bg-[var(--hold-soft)]` · `bg-amber-600 text-white hover:bg-amber-600/90` (confirm button) → DELETE className and use `<Button variant="outline" className="cap text-led-hold border-[var(--led-hold-edge)]">` — a dark cap with hold-LED text (caution command on dark hardware; `--led-hold` is correct on a dark cap, NOT `--tag-hold`)
- destructive confirm `bg-red-600 text-white hover:bg-red-600/90` → DELETE className, `variant="destructive"` (cap-warn carries the voice)
- focus rings `ring-amber-500/60` / `ring-red-500/60` → `ring-[var(--led-hold)]` / `ring-[var(--led-warn)]`
- ConfidenceBar: track `bg-surface-200` → `bg-[var(--carbon-800)]`; fills `bg-red-500`/`bg-amber-500`/`bg-emerald-500` → `bg-[var(--led-warn)]`/`bg-[var(--led-hold)]`/`bg-[var(--led-go)]`
- MetaRow intent badge override `bg-red-500/15 text-red-400 hover:bg-red-500/20` → drop the override; `variant="destructive"` on the Phase 1 Badge already renders the warn stencil tag
- clarification selected `bg-brand/10 text-foreground ring-1 ring-brand/40` → `bg-[var(--armed-soft)] text-foreground ring-1 ring-[var(--armed-edge)]`
- `Kbd` helper `rounded border-border bg-surface-50 px-1.5 py-0.5 text-shortcut text-foreground/80` → `well rounded-inset px-1.5 py-0.5 text-shortcut text-[var(--display-fg)]`
- input row: keep layout; the `<input>` itself stays transparent (the dialog plate is the surface) — only swap `placeholder:text-muted-foreground/70` → unchanged (tokenized)
- StepLogView shell (header/footer/list backdrop in this file): `bg-surface-50` list backdrop → `well rounded-control` ON the `<ul>` (the transcript is a stream viewport — display-dark in both shifts, per the recomposition table); footer `bg-surface-100` → `bg-card`; Stop button red classes → `text-led-warn hover:bg-[var(--warn-soft)]`; "Open Thread" `bg-brand … text-white hover:bg-brand/90` → DELETE className, `variant="default"`
- runId `<code className="font-mono">` → `font-data` (Departure Mono for identifiers)

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
pnpm -F @team-x/desktop exec vitest run src/renderer/src/features/command 2>/dev/null || true
git add apps/desktop/src/renderer/src/features/command/command-palette.tsx
git commit -m "feat(sweep): command palette - carbon surfaces, LED gate vocabulary, display-dark transcript well"
```

---

### Task 10: Step cards, skeleton, toast

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/command/step-card.tsx`
- Modify: `apps/desktop/src/renderer/src/features/command/command-palette.tsx` (Toast component only, if it lives there)

Preserve ALL `data-step-kind=*` attributes, roving focus behavior, aria roles.

- [ ] **Step 1: Recompose step cards**

- Card `<article>` base `rounded-md border-border bg-surface-50 p-3 … hover:border-brand/40 hover:bg-surface-100 hover:shadow-md` → `rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)] p-3 transition-all hover:-translate-y-px hover:border-[var(--armed-edge)] hover:bg-[var(--carbon-800)] hover:shadow-md` (cards sit INSIDE the display-dark transcript well, so carbon literals are correct here — they're part of the display, not the shift surface).
- `<pre>` tool I/O blocks `bg-surface-200 … text-code-sm` → `lcd max-h-48 overflow-auto rounded-card p-2 text-code-sm` with `text-shadow: none`? NO — `.lcd` brings phosphor glow which is wrong for JSON dumps; use `well rounded-card p-2 text-code-sm text-[var(--display-fg)]` instead.
- error header/text `text-red-400`/`text-red-300` → `text-led-warn`; special outcome cards (ticket_created etc.): map any `emerald/amber` accents → `text-led-go`/`text-led-hold` + `--led-*-edge` borders.
- step number indicator `bg-surface-200` → `bg-[var(--carbon-800)]`.
- Skeleton: `bg-surface-50` card → `bg-[var(--carbon-850)]`; pulsing bars `bg-surface-200` → `bg-[var(--carbon-800)]`.
- Toast `<output>` (`border-border bg-surface-100 … shadow-lg`) → `annunciator-module rounded-control px-4 py-3` + swap the Sparkles icon color to `text-led-scope`; Undo button `text-brand hover:bg-brand/10` → `text-primary hover:bg-[var(--armed-soft)]`; close button `hover:bg-surface-200` → `hover:bg-[var(--carbon-800)]`.

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/features/command/step-card.tsx apps/desktop/src/renderer/src/features/command/command-palette.tsx
git commit -m "feat(sweep): step cards on carbon, well-framed tool IO, annunciator toast"
```

---

### Task 11: ShiftToggle wiring — `useShift` (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/hooks/use-shift.ts`
- Test: `apps/desktop/src/renderer/src/hooks/use-shift.test.ts` (node env — pure logic; DOM application tested via a tiny jsdom test in the same file is NOT possible per-file-env — split: pure mapping tests in `.test.ts`, DOM-effect test goes in Task 13's jsdom suite or a dedicated `use-shift.dom.test.tsx` with the jsdom pragma)
- Modify: `apps/desktop/src/renderer/src/app/top-bar.tsx` (mount ShiftToggle)

The active company's `theme: 'dark' | 'light'` is the persistence (already on the Company model, already editable in company-settings + create dialog; `ipc.companies.update` mutation pattern exists in `company-settings.tsx`). `shift = theme === 'light' ? 'day' : 'night'`. The hook syncs `document.documentElement.classList` and exposes a toggle that persists through the existing companies mutation.

- [ ] **Step 1: Write the failing pure-logic tests**

`use-shift.test.ts` (node env, no pragma needed):

```ts
import { describe, expect, it } from 'vitest';

import { applyShiftClass, shiftFromTheme, themeFromShift } from './use-shift';

describe('shift mapping', () => {
  it('maps company theme to shift', () => {
    expect(shiftFromTheme('dark')).toBe('night');
    expect(shiftFromTheme('light')).toBe('day');
    expect(shiftFromTheme(undefined)).toBe('night'); // no company / unknown → Night Ops default
  });
  it('maps shift back to theme', () => {
    expect(themeFromShift('night')).toBe('dark');
    expect(themeFromShift('day')).toBe('light');
  });
  it('applyShiftClass toggles the dark class on a classList-like target', () => {
    const calls: Array<[string, boolean]> = [];
    const fake = { classList: { toggle: (cls: string, on: boolean) => calls.push([cls, on]) } };
    applyShiftClass('night', fake as unknown as HTMLElement);
    applyShiftClass('day', fake as unknown as HTMLElement);
    expect(calls).toEqual([['dark', true], ['dark', false]]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-shift.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `use-shift.ts`**

```ts
import { useEffect } from 'react';

import type { Shift } from '@/components/console';

/** Company theme is the persistence; shift is the console vocabulary. */
export const shiftFromTheme = (theme: string | undefined): Shift =>
  theme === 'light' ? 'day' : 'night';

export const themeFromShift = (shift: Shift): 'dark' | 'light' =>
  shift === 'day' ? 'light' : 'dark';

/** Single writer for the documentElement theme class (boot default in main.tsx). */
export const applyShiftClass = (shift: Shift, el: HTMLElement = document.documentElement) => {
  el.classList.toggle('dark', shift === 'night');
};

/**
 * Reads the ACTIVE company's theme, keeps the <html> class in sync, and
 * exposes a persisted toggle. Companies/mutation wiring mirrors
 * company-settings.tsx (useCompanies + ipc.companies.update + ['companies']
 * invalidation) — read that file and reuse its exact query/mutation pattern.
 */
export function useShift(): { shift: Shift; setShift: (next: Shift) => void } {
  // …compose from the EXISTING hooks: active company from the same source
  // workspace-switcher.tsx uses; mutation per company-settings.tsx. The
  // effect below is the only DOM writer:
  // useEffect(() => applyShiftClass(shift), [shift]);
  // setShift(next) → update({ id: activeCompany.id, theme: themeFromShift(next) })
  // No company → shift 'night', setShift is a no-op.
}
```

The implementer fills `useShift` by READING `workspace-switcher.tsx` (active company source) and `company-settings.tsx` (update mutation + cache invalidation) and reusing their exact patterns — do not invent new IPC. `Shift` type is exported from `components/console/shift-toggle.tsx` (add `export type { Shift }` to the console barrel if missing).

- [ ] **Step 4: Run tests to verify PASS**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks/use-shift.test.ts
```

- [ ] **Step 5: Mount ShiftToggle in the top bar right cluster**

In `top-bar.tsx`, next to BoardMessageQueue:

```tsx
const { shift, setShift } = useShift();
…
<ShiftToggle shift={shift} onToggle={setShift} />
```

Render it ALWAYS (no company → toggle is a visual no-op; acceptable for chrome). Import from `@/components/console`.

- [ ] **Step 6: Full gates + commit**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint
pnpm -F @team-x/desktop exec vitest run src/renderer/src/hooks src/renderer/src/app
git add apps/desktop/src/renderer/src/hooks/use-shift.ts apps/desktop/src/renderer/src/hooks/use-shift.test.ts apps/desktop/src/renderer/src/app/top-bar.tsx apps/desktop/src/renderer/src/components/console/index.ts
git commit -m "feat(sweep): wire ShiftToggle to company theme - Day Shift reachable from chrome"
```

---

### Task 12: Annunciator signals — pure derivation + ack slice (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/app/annunciator-signals.ts`
- Test: `apps/desktop/src/renderer/src/app/annunciator-signals.test.ts` (node env)
- Modify: `apps/desktop/src/store/app-store.ts` (ack slice)

Five REAL signals (no decorative lamps; SYS/NET deferred to Phases 4/7 where their data sources land):

| Tile | Source hook (existing) | Tone logic |
|---|---|---|
| `QUE` | board-queue unread count (the same derivation `BoardMessageQueue` uses) | `>0 → 'hold'`, else `'off'` |
| `GGUF` | `useRuntimeOperations(companyId)` → `stateTone` | `danger → 'warn'+alert` · `warning → 'hold'` · `accent → 'exec'` · default → sessions>0 ? `'go'` : `'off'` |
| `BUDG` | `useBudgetOverview(companyId)` | usage ≥100% → `'warn'+alert` · ≥80% → `'hold'` · configured → `'go'` · none → `'off'` |
| `APPR` | pending approvals count (`use-approvals`/`use-budgets` hooks) | `>0 → 'hold'+alert` (ack ritual) |
| `MTG` | `useMeetings(companyId)` active count | `>0 → 'exec'`, else `'off'` |

Alert fingerprinting: an alert re-blinks when its *instance* changes (e.g. budget crosses 100% again in a new period, a NEW approval arrives). Fingerprint = a stable string from the triggering data; acked fingerprints live in the app-store; `acknowledged = ackedFingerprint === currentFingerprint`.

- [ ] **Step 1: Write the failing derivation tests**

`annunciator-signals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { type AnnunciatorInputs, deriveAnnunciatorTiles } from './annunciator-signals';

const base: AnnunciatorInputs = {
  queueUnread: 0,
  runtime: { stateTone: 'default', sessionCount: 0 },
  budget: { configured: false, usedPct: 0, periodKey: '' },
  approvalsPending: 0,
  approvalsNewestId: null,
  meetingsActive: 0,
  acked: {},
};

describe('deriveAnnunciatorTiles', () => {
  it('quiet system: every tile present, unlit/calm, nothing blinking', () => {
    const tiles = deriveAnnunciatorTiles(base);
    expect(tiles.map((t) => t.id)).toEqual(['que', 'gguf', 'budg', 'appr', 'mtg']);
    expect(tiles.every((t) => !t.alert)).toBe(true);
    expect(tiles.find((t) => t.id === 'que')?.tone).toBe('off');
  });

  it('queue + meetings light their tones', () => {
    const tiles = deriveAnnunciatorTiles({ ...base, queueUnread: 3, meetingsActive: 1 });
    expect(tiles.find((t) => t.id === 'que')?.tone).toBe('hold');
    expect(tiles.find((t) => t.id === 'mtg')?.tone).toBe('exec');
  });

  it('runtime danger blinks until acked, then burns steady', () => {
    const hot = { ...base, runtime: { stateTone: 'danger' as const, sessionCount: 2 } };
    const blinking = deriveAnnunciatorTiles(hot).find((t) => t.id === 'gguf');
    expect(blinking).toMatchObject({ tone: 'warn', alert: true, acknowledged: false });
    const fp = blinking?.fingerprint as string;
    const acked = deriveAnnunciatorTiles({ ...hot, acked: { gguf: fp } }).find((t) => t.id === 'gguf');
    expect(acked).toMatchObject({ alert: true, acknowledged: true });
  });

  it('budget thresholds: 80% holds, 100% warns+alerts, new period re-alerts', () => {
    const b = (usedPct: number, periodKey = 'p1') => ({
      ...base,
      budget: { configured: true, usedPct, periodKey },
    });
    expect(deriveAnnunciatorTiles(b(50)).find((t) => t.id === 'budg')?.tone).toBe('go');
    expect(deriveAnnunciatorTiles(b(85)).find((t) => t.id === 'budg')?.tone).toBe('hold');
    const over = deriveAnnunciatorTiles(b(110)).find((t) => t.id === 'budg');
    expect(over).toMatchObject({ tone: 'warn', alert: true });
    // ack p1, then a NEW period over-budget must re-blink
    const ackedP1 = { budg: over?.fingerprint as string };
    const p2 = deriveAnnunciatorTiles({ ...b(110, 'p2'), acked: ackedP1 }).find((t) => t.id === 'budg');
    expect(p2?.acknowledged).toBe(false);
  });

  it('new approval re-alerts after an earlier ack', () => {
    const one = { ...base, approvalsPending: 1, approvalsNewestId: 'a1' };
    const tile1 = deriveAnnunciatorTiles(one).find((t) => t.id === 'appr');
    expect(tile1).toMatchObject({ tone: 'hold', alert: true });
    const acked = { appr: tile1?.fingerprint as string };
    expect(
      deriveAnnunciatorTiles({ ...one, acked }).find((t) => t.id === 'appr')?.acknowledged,
    ).toBe(true);
    const two = { ...base, approvalsPending: 2, approvalsNewestId: 'a2', acked };
    expect(deriveAnnunciatorTiles(two).find((t) => t.id === 'appr')?.acknowledged).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL, then implement**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app/annunciator-signals.test.ts
```

`annunciator-signals.ts`:

```ts
import type { AnnunciatorTileSpec } from '@/components/console';

/** Tile spec + the fingerprint that identifies the CURRENT alert instance. */
export type AnnunciatorTile = AnnunciatorTileSpec & { fingerprint?: string };

export interface AnnunciatorInputs {
  queueUnread: number;
  runtime: { stateTone: 'default' | 'accent' | 'warning' | 'danger'; sessionCount: number };
  budget: { configured: boolean; usedPct: number; periodKey: string };
  approvalsPending: number;
  approvalsNewestId: string | null;
  meetingsActive: number;
  /** tile id → acked fingerprint (from the app-store ack slice) */
  acked: Record<string, string>;
}

/**
 * Pure derivation: app state → annunciator tiles. Every lamp is bound to a
 * real signal (DESIGN.md VU/lamp discipline). Alert instances are
 * fingerprinted so an ack survives re-renders but a NEW instance
 * (new budget period, new approval) re-blinks.
 */
export function deriveAnnunciatorTiles(inputs: AnnunciatorInputs): AnnunciatorTile[] {
  const ackState = (id: string, fingerprint: string) => ({
    fingerprint,
    alert: true,
    acknowledged: inputs.acked[id] === fingerprint,
  });

  const que: AnnunciatorTile = {
    id: 'que',
    label: 'QUE',
    tone: inputs.queueUnread > 0 ? 'hold' : 'off',
  };

  const r = inputs.runtime;
  const gguf: AnnunciatorTile =
    r.stateTone === 'danger'
      ? { id: 'gguf', label: 'GGUF', tone: 'warn', ...ackState('gguf', `gguf:${r.stateTone}`) }
      : {
          id: 'gguf',
          label: 'GGUF',
          tone:
            r.stateTone === 'warning'
              ? 'hold'
              : r.stateTone === 'accent'
                ? 'exec'
                : r.sessionCount > 0
                  ? 'go'
                  : 'off',
        };

  const b = inputs.budget;
  const budg: AnnunciatorTile = !b.configured
    ? { id: 'budg', label: 'BUDG', tone: 'off' }
    : b.usedPct >= 100
      ? { id: 'budg', label: 'BUDG', tone: 'warn', ...ackState('budg', `budg:${b.periodKey}:over`) }
      : { id: 'budg', label: 'BUDG', tone: b.usedPct >= 80 ? 'hold' : 'go' };

  const appr: AnnunciatorTile =
    inputs.approvalsPending > 0
      ? {
          id: 'appr',
          label: 'APPR',
          tone: 'hold',
          ...ackState('appr', `appr:${inputs.approvalsNewestId ?? inputs.approvalsPending}`),
        }
      : { id: 'appr', label: 'APPR', tone: 'off' };

  const mtg: AnnunciatorTile = {
    id: 'mtg',
    label: 'MTG',
    tone: inputs.meetingsActive > 0 ? 'exec' : 'off',
  };

  return [que, gguf, budg, appr, mtg];
}

/** Teleport map: tile id → app view (verify ids against app-store's view union). */
export const ANNUNCIATOR_TELEPORT: Record<string, string> = {
  que: 'tickets',
  gguf: 'autonomy',
  budg: 'autonomy',
  appr: 'autonomy',
  mtg: 'meetings',
};
```

NOTE for implementer: `AnnunciatorTileSpec.tone` is `LampTone` — confirm the exact union in `components/console/lamp-tile.tsx` and that `'exec'`/`'hold'` exist (they do). Verify the app-store view ids for the teleport map against the real `setActiveView` union and adjust values (NOT keys).

- [ ] **Step 3: Add the ack slice to `app-store.ts`**

Find the zustand store and add:

```ts
// Annunciator master-caution acks: tile id → acked alert fingerprint.
// Session-scoped on purpose — a fresh boot re-presents unresolved warnings.
ackedAnnunciators: {} as Record<string, string>,
ackAnnunciator: (id: string, fingerprint: string) =>
  set((state) => ({ ackedAnnunciators: { ...state.ackedAnnunciators, [id]: fingerprint } })),
```

(Match the store's existing slice/action style exactly — read the file first.)

- [ ] **Step 4: Verify + commit**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app/annunciator-signals.test.ts
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/app/annunciator-signals.ts apps/desktop/src/renderer/src/app/annunciator-signals.test.ts apps/desktop/src/store/app-store.ts
git commit -m "feat(sweep): annunciator signal derivation - five real signals, fingerprinted ack ritual"
```

---

### Task 13: Mount the AnnunciatorRail (TDD)

**Files:**
- Create: `apps/desktop/src/renderer/src/app/annunciator-rail-mount.tsx`
- Test: `apps/desktop/src/renderer/src/app/annunciator-rail-mount.test.tsx` (jsdom pragma; import `@testing-library/jest-dom/vitest` first + explicit `afterEach(cleanup)` — this file is outside `components/console/`, so it cannot import the console `test-setup`; replicate the two lines)
- Modify: `apps/desktop/src/renderer/src/app/layout.tsx` (mount under TopBar)

- [ ] **Step 1: Write the failing mount test**

```tsx
/**
 * AnnunciatorRailMount — chrome wiring tests (Sweep Phase 2).
 * The mount derives tiles from live hooks and hands ack/teleport to the
 * store. Hooks are mocked at module level; the derivation itself is
 * covered by annunciator-signals.test.ts.
 *
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const setActiveView = vi.fn();
const ackAnnunciator = vi.fn();

vi.mock('./annunciator-rail-data', () => ({
  useAnnunciatorData: () => ({
    inputs: {
      queueUnread: 2,
      runtime: { stateTone: 'danger', sessionCount: 1 },
      budget: { configured: true, usedPct: 50, periodKey: 'p1' },
      approvalsPending: 0,
      approvalsNewestId: null,
      meetingsActive: 1,
      acked: {},
    },
    setActiveView,
    ackAnnunciator,
  }),
}));

import { AnnunciatorRailMount } from './annunciator-rail-mount';

describe('AnnunciatorRailMount', () => {
  it('renders the rail with derived tiles on the dark strip', () => {
    render(<AnnunciatorRailMount />);
    const rail = screen.getByRole('group', { name: 'Annunciator rail' });
    expect(rail).toBeInTheDocument();
    expect(rail.closest('[data-annunciator-rail]')).not.toBeNull();
    expect(rail.textContent).toContain('QUE');
    expect(rail.textContent).toContain('GGUF');
  });

  it('teleports lit tiles through setActiveView', async () => {
    render(<AnnunciatorRailMount />);
    await userEvent.click(screen.getByRole('button', { name: /MTG/ }));
    expect(setActiveView).toHaveBeenCalledWith('meetings');
  });

  it('blinking tile acks into the store with its fingerprint', async () => {
    render(<AnnunciatorRailMount />);
    await userEvent.click(screen.getByRole('button', { name: /GGUF.*unacknowledged/i }));
    expect(ackAnnunciator).toHaveBeenCalledWith('gguf', expect.stringContaining('gguf:'));
    expect(setActiveView).not.toHaveBeenCalledWith('autonomy');
  });
});
```

- [ ] **Step 2: Run to verify FAIL, then implement**

Two files. `annunciator-rail-data.ts` (the hook seam the test mocks — composes the real hooks):

```ts
// Composes the live hooks into AnnunciatorInputs + the store handlers.
// Each hook already exists; reuse their exact signatures (read the files):
//   queue unread     → same derivation BoardMessageQueue uses
//   runtime          → useRuntimeOperations(companyId) snapshot summary
//   budget overview  → useBudgetOverview(companyId)
//   approvals        → pending approvals hook
//   meetings         → useMeetings(companyId) filtered to active
//   acked / ack      → useAppStore ackedAnnunciators / ackAnnunciator
//   setActiveView    → useAppStore
export function useAnnunciatorData() { /* implementer composes; missing data = calm defaults (0 / 'default' / not configured) so the rail renders truthfully during loading */ }
```

`annunciator-rail-mount.tsx`:

```tsx
import { AnnunciatorRail } from '@/components/console';

import { ANNUNCIATOR_TELEPORT, deriveAnnunciatorTiles } from './annunciator-signals';
import { useAnnunciatorData } from './annunciator-rail-data';

/** The persistent lamp shelf under the command bar (DESIGN.md §Layout). */
export function AnnunciatorRailMount() {
  const { inputs, setActiveView, ackAnnunciator } = useAnnunciatorData();
  const tiles = deriveAnnunciatorTiles(inputs);
  return (
    <div data-annunciator-rail="">
      <AnnunciatorRail
        tiles={tiles}
        onNavigate={(id) => {
          const view = ANNUNCIATOR_TELEPORT[id];
          if (view) setActiveView(view);
        }}
        onAcknowledge={(id) => {
          const fp = tiles.find((t) => t.id === id)?.fingerprint;
          if (fp) ackAnnunciator(id, fp);
        }}
      />
    </div>
  );
}
```

Mount in `layout.tsx` directly under `<TopBar />` (replace the Task 2 placeholder comment):

```tsx
<TopBar />
<AnnunciatorRailMount />
```

- [ ] **Step 3: Verify (focused + full unit suite + typecheck/lint) + commit**

```bash
pnpm -F @team-x/desktop exec vitest run src/renderer/src/app
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add apps/desktop/src/renderer/src/app/annunciator-rail-mount.tsx apps/desktop/src/renderer/src/app/annunciator-rail-mount.test.tsx apps/desktop/src/renderer/src/app/annunciator-rail-data.ts apps/desktop/src/renderer/src/app/layout.tsx apps/desktop/src/renderer/src/app/shell-foundation.test.tsx
git commit -m "feat(sweep): mount AnnunciatorRail under the command bar - live lamps, ack ritual, teleport wiring"
```

(If `shell-foundation.test.tsx` pins the layout source, re-pin for the new mount line.)

---

### Task 14: Phase gate — full CI parity, dual-shift pack, CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Changed`)

- [ ] **Step 1: Full local gates**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint && pnpm test
pnpm -F @team-x/desktop exec electron-vite build
pnpm -F @team-x/desktop test:e2e
pnpm audit:claims 2>/dev/null || true
```
Expected: ESLint 0 errors; full Vitest green; **E2E 26+ passed UNMODIFIED**; build clean. If any E2E fails, the sweep broke a contract — fix the sweep, never the spec.

- [ ] **Step 2: Dual-shift screenshot pack**

Recreate the throwaway capture script (delete after): `apps/desktop/screenshot-pack.mjs` launching the BUILT app via Playwright `_electron` with `executablePath` resolved through `createRequire(import.meta.url).resolve('electron')` + `dist/electron.exe`, `NODE_ENV=test`, fresh `--user-data-dir`; viewport 1600×1000; wait for `[data-top-bar-nav]`; for each shift (`night`: add `dark` class, `day`: remove) click top-bar tabs by label (Dashboard / Autonomy / Tickets / Settings) and screenshot to `C:/Users/User/.gstack/projects/Git-Rocky-Stack-Team-X/designs/sweep-phase-02/{shift}-{slug}.png`. ALSO capture: the command palette open (`{shift}-palette.png`, trigger via keyboard Ctrl/Cmd+K through `win.keyboard`) and a rail close-up is covered by the dashboard shots. 10 shots total. Verify the rail renders, Day Shift chrome is genuinely silver, and tabs/sidenav read as console hardware.

- [ ] **Step 3: CHANGELOG entry**

Append under `## [Unreleased]` → `### Changed`:

```markdown
- **Aesthetic sweep Phase 2 — Shell + Command Deck.** App chrome recomposed onto
  the Command Console foundation: edge-to-edge command bar (stencil nav tiles,
  placard brand, ⌘K well hint), team rail as console hardware (lamp busy signal,
  LED status dots), workspace switcher/create-workspace/company-settings on
  recessed wells + machined caps (legacy overrides removed), command palette on
  carbon surfaces with LED gate vocabulary and a display-dark transcript well.
  NEW: AnnunciatorRail mounted under the command bar with five real signals
  (QUE/GGUF/BUDG/APPR/MTG — fingerprinted master-caution ack, tile teleport);
  ShiftToggle wired to the per-company theme — Day Shift is now reachable from
  chrome. Visual-only elsewhere: E2E suite passes unmodified.
```

- [ ] **Step 4: Push + PR**

```bash
git add CHANGELOG.md && git commit -m "chore(release): Phase 2 CHANGELOG entry - Shell + Command Deck"
git push -u origin feat/v3.4.0-sweep-phase-02-shell-command-deck
gh pr create --title "feat(v3.4.0): Aesthetic Sweep Phase 2 — Shell + Command Deck" --body "<scope, gates, screenshot pack path, CR-7 checklist — mirror the PR #26 body shape>"
```

Then the CR-7 wall: Stage 1 CI → Stage 2 `/review` → Stage 3 Codex (Rocky-triggered) → Stage 4 Rocky sign-off (incl. the 10-shot pack) → merge.

---

## Self-review record

- **Spec coverage:** Phase-ladder scope (layout ✓ T2, top bar ✓ T3, sidenav ✓ T5, workspace switcher ✓ T6 (+dialogs T7/T8), command palette ✓ T9/T10, AnnunciatorRail mounted ✓ T12/T13) — plus board-queue chrome (T4, part of the command deck) and ShiftToggle wiring (T11, required by the spec's §4.6 theming mechanics + the Phase 1 carry-forward). Recomposition table honored: stripe/faceplate vocabulary (T5/T8), wells for inputs (T7/T8/T9), lamp vocabulary for status (T4/T5/T12), `.brand-selected` superseded by `.cap-select` (T1/T4/T7/T8), stream viewport display-dark (T9). VuMeter: NOT mounted this phase — no chrome-level real meter signal is established; meters arrive with Mission Control/Autonomy (Phases 3–4). Per-phase DoD: gates + unmodified E2E + dual-shift pack (T14).
- **Placeholder scan:** the two deliberate implementer-fills (useShift composition, useAnnunciatorData composition) are not placeholders — they are directives to reuse EXISTING patterns by reading named files, with the pure logic fully specified and tested. All other steps carry complete code or exact mappings.
- **Type consistency:** `Shift` from `components/console/shift-toggle.tsx`; `AnnunciatorTileSpec`/`LampTone` from the console barrel; `AnnunciatorTile = AnnunciatorTileSpec & { fingerprint?: string }` used consistently in T12/T13; `deriveAnnunciatorTiles`/`ANNUNCIATOR_TELEPORT` names match between files; ack slice (`ackedAnnunciators`, `ackAnnunciator`) matches the T13 mock.
