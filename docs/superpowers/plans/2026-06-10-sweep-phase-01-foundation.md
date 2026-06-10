# Aesthetic Sweep — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the global Carbon Pro foundation — dual-shift token layer, the four-face font stack, all 19 shadcn primitives restyled in place (APIs frozen), and the new `components/console/` primitive library — so the whole app reads as Command Console and Phases 2–7 only recompose screens.

**Architecture:** The shadcn CSS-variable mechanism (`:root` light / `.dark` dark, Tailwind reading HSL vars) is kept untouched as a mechanism; only values change (`:root` → Day Shift silver, `.dark` → Night Ops carbon). Console recipes (faceplate/well/lamp/LCD/VU/cap) are CSS component classes in `globals.css` written with **Day Shift as the unscoped base and `.dark` overrides for Night Ops** (matching the app's theme convention); display surfaces (wells, LCDs, lamp caps, VU segments) are written once with literal dark values and get **no** `.dark` variant — that is how displays-stay-dark is enforced. React console primitives consume those recipes.

**Tech Stack:** Tailwind 3.4 + CSS vars, CVA, Radix, Fontsource (Archivo/Public Sans/Iosevka) + vendored Departure Mono (OFL), Vitest + Testing Library, Playwright E2E (must pass unchanged).

**Branch:** `feat/v3.4.0-sweep-phase-01-foundation` (exists; canon docs committed at `3f1ac1c`).
**Canon:** `DESIGN.md` (repo root) — read it before any task. Approved preview: `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/design-system-20260609/team-x-design-preview.html`.
**Repo conventions:** pnpm 9.15.9 / Node 22. Root commands: `pnpm typecheck`, `pnpm lint` (Biome), `pnpm lint:eslint`, `pnpm test` (Vitest). E2E: `pnpm -F @team-x/desktop test:e2e`. Conventional commits; every commit subject describes the change.

**Hard rules for every task:**
- Visual-only. Zero behavior, IPC, data, or prop-API changes. Existing variant names on shadcn components are frozen (additive variants allowed).
- If an existing unit test asserts a *class string* on a shadcn primitive that this plan intentionally changes, update the assertion to the new class — never weaken a behavioral assertion.
- E2E specs select by role/aria/text; they must pass without modification.
- `prefers-reduced-motion` must collapse every new animation.

---

## File structure (what this phase touches)

| File | Action | Responsibility |
|---|---|---|
| `apps/desktop/package.json` | Modify | Font deps swap |
| `apps/desktop/src/renderer/src/main.tsx:5-6` | Modify | Font imports |
| `apps/desktop/src/renderer/src/styles/fonts/departure-mono.css` | Create | Vendored @font-face |
| `apps/desktop/src/renderer/src/assets/fonts/departure-mono/` | Create | Woff2 + OFL license |
| `apps/desktop/src/renderer/src/styles/globals.css` | Modify (heavy) | Tokens, recipes, retints |
| `apps/desktop/src/renderer/tailwind.config.ts` | Modify | Colors, radius, fonts, motion |
| `apps/desktop/src/renderer/src/components/ui/*.tsx` (19 files) | Modify | In-place restyle |
| `apps/desktop/src/renderer/src/components/console/*.tsx` (9 components + tests) | Create | Console primitive library |
| `CHANGELOG.md` | Modify | Phase entry |

---

### Task 1: Font stack — install, vendor, swap

**Files:**
- Modify: `apps/desktop/package.json` (dependencies)
- Create: `apps/desktop/src/renderer/src/assets/fonts/departure-mono/DepartureMono-Regular.woff2` + `LICENSE.txt`
- Create: `apps/desktop/src/renderer/src/styles/fonts/departure-mono.css`
- Modify: `apps/desktop/src/renderer/src/main.tsx:5-6`
- Modify: `apps/desktop/src/renderer/tailwind.config.ts:99-102` (fontFamily)
- Modify: `apps/desktop/src/renderer/src/styles/globals.css:79-83,115-119` (body + mono families)

- [ ] **Step 1: Install Fontsource packages, remove the old ones**

Run from repo root:
```bash
pnpm -F @team-x/desktop add @fontsource-variable/archivo @fontsource-variable/public-sans @fontsource/iosevka
pnpm -F @team-x/desktop remove @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```
Verified available: `@fontsource-variable/archivo@5.2.8`, `@fontsource-variable/public-sans@5.2.7`, `@fontsource/iosevka@5.2.5`. (`@fontsource/departure-mono` does **not** exist — vendored next step.)

- [ ] **Step 2: Vendor Departure Mono v1.500 (OFL-1.1)**

Official release (Helena Zhang / Tobias Fried — github.com/rektdeckard/departure-mono, latest `v1.500`, asset `DepartureMono-1.500.zip`):
```bash
cd apps/desktop/src/renderer/src/assets/fonts
mkdir -p departure-mono && cd departure-mono
curl -L -o dm.zip https://github.com/rektdeckard/departure-mono/releases/download/v1.500/DepartureMono-1.500.zip
unzip -o dm.zip && rm dm.zip
```
Keep ONLY `DepartureMono-Regular.woff2` and the license file (named `LICENSE.txt` or `OFL.txt` in the zip — keep whichever exists, rename to `LICENSE.txt`); delete every other extracted file (otf/woff/ttf/specimens). The license file MUST be committed beside the font (OFL requirement).

- [ ] **Step 3: Write the @font-face file**

Create `apps/desktop/src/renderer/src/styles/fonts/departure-mono.css`:
```css
/* Departure Mono v1.500 — SIL OFL 1.1, vendored (no Fontsource package exists).
   License: ../../assets/fonts/departure-mono/LICENSE.txt */
@font-face {
  font-family: 'Departure Mono';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('../../assets/fonts/departure-mono/DepartureMono-Regular.woff2') format('woff2');
}
```

- [ ] **Step 4: Swap the imports in main.tsx**

In `apps/desktop/src/renderer/src/main.tsx`, replace lines 5–6:
```tsx
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
```
with:
```tsx
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/public-sans';
import '@fontsource/iosevka';
import './styles/fonts/departure-mono.css';
```
Note the Archivo import is the **`/wdth.css`** variant — the design uses the width axis (`'wdth' 110–125`); the default import carries only the weight axis. Verify the file exists at `node_modules/@fontsource-variable/archivo/wdth.css`; if the packaging differs, use the import path that includes the wdth axis per the package README — do not silently fall back to weight-only.

- [ ] **Step 5: Update Tailwind font families**

In `apps/desktop/src/renderer/tailwind.config.ts`, replace the `fontFamily` block (lines 99–102):
```ts
      fontFamily: {
        sans: ['Public Sans Variable', 'system-ui', 'sans-serif'],
        display: ['Archivo Variable', 'sans-serif'],
        data: ['Departure Mono', 'ui-monospace', 'monospace'],
        stream: ['Iosevka', 'ui-monospace', 'monospace'],
        mono: ['Iosevka', 'ui-monospace', 'monospace'],
      },
```

- [ ] **Step 6: Update globals.css base families**

In `globals.css` body rule (line 81), replace:
```css
    font-family: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
```
with:
```css
    font-family: "Public Sans Variable", ui-sans-serif, system-ui, sans-serif;
```
And the mono rule (lines 115–119):
```css
  code,
  pre,
  .font-mono {
    font-family: "Iosevka", ui-monospace, monospace;
  }
```

- [ ] **Step 7: Verify nothing references the removed fonts, gates pass**

```bash
grep -rn "Inter Variable\|JetBrains Mono\|fontsource-variable/inter\|fontsource-variable/jetbrains" apps/desktop/src/renderer/src --include="*.{ts,tsx,css}"
```
Expected remaining hits: ONLY the typography component classes in `globals.css` (`.text-eyebrow*`, `.text-menu-label`, `.text-shortcut`, `.text-code*`, `.text-numeric*`) — they retarget in Task 3. Fix any other stragglers now.
```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(sweep): swap font stack to Archivo/Public Sans/Iosevka + vendored Departure Mono"
```

---

### Task 2: Dual-shift token layer (globals.css vars + tailwind config)

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css:18-65` (the `@layer base` var block)
- Modify: `apps/desktop/src/renderer/tailwind.config.ts` (colors, borderRadius, keyframes, animation, transitionTimingFunction)

- [ ] **Step 1: Replace the CSS variable block**

Replace `globals.css` lines 18–65 (the whole `:root` + `.dark` block inside the first `@layer base`) with:

```css
@layer base {
  /*
   * Dual-shift Carbon Pro tokens (DESIGN.md §Color).
   *   :root  = Day Shift  (silver anodized — designed variant, never auto-invert)
   *   .dark  = Night Ops  (brushed black on AMOLED carbon — default shift)
   * Semantic tokens stay raw HSL tuples so Tailwind opacity modifiers compose.
   * Console constants (armed, LEDs, displays, motion, spacing, radii) are
   * theme-INDEPENDENT and live once in :root.
   */
  :root {
    /* shadcn semantic layer — Day Shift values */
    --background: 60 4% 78%;            /* #C8C8C4 silver chassis */
    --foreground: 0 0% 10%;             /* #1A1A1A engraved enamel */
    --card: 60 4% 82%;                  /* #D2D2CE */
    --card-foreground: 0 0% 10%;
    --popover: 60 4% 86%;               /* #DCDCD8 */
    --popover-foreground: 0 0% 10%;
    --primary: 358 68% 40%;             /* #AA2024 ARMED — identical both shifts */
    --primary-foreground: 12 100% 97%;  /* #FFF3F0 */
    --secondary: 60 4% 84%;
    --secondary-foreground: 0 0% 18%;   /* #2E2E2C */
    --muted: 60 4% 84%;
    --muted-foreground: 60 4% 26%;      /* #44443F day silver text */
    --accent: 60 4% 84%;
    --accent-foreground: 0 0% 18%;
    --destructive: 4 83% 43%;           /* #C81E13 day-darkened warn */
    --destructive-foreground: 12 100% 97%;
    --border: 60 2% 68%;                /* #B0B0AC */
    --input: 60 2% 68%;
    --ring: 0 0% 16%;                   /* #2A2A2A day focus */
    --mission-red: 358 68% 40%;         /* legacy alias → armed (purged Phase 8) */

    /* Carbon ramp + text ramp (raw hex; flip per shift) */
    --carbon-950: #C8C8C4; --carbon-900: #D2D2CE; --carbon-850: #CCCCC8;
    --carbon-800: #C4C4C0; --carbon-750: #BCBCB8; --carbon-700: #B0B0AC;
    --platinum: #1A1A1A; --silver-bright: #2E2E2C; --silver: #44443F;
    --silver-mute: #62625E; --graphite: #96968F;
    --hairline: rgba(0, 0, 0, 0.10); --hairline-strong: rgba(0, 0, 0, 0.20);

    /* ARMED RED — theme-independent identity */
    --armed: #AA2024; --armed-lit: #E0252B; --armed-deep: #7F171A;
    --armed-edge: rgba(224, 37, 43, 0.35); --armed-glow: rgba(224, 37, 43, 0.22);
    --armed-soft: rgba(170, 32, 36, 0.12);

    /* Chrome — the polished bits, used sparingly */
    --chrome: #E6E6E6; --chrome-edge: rgba(230, 230, 230, 0.28);
    --chrome-soft: rgba(230, 230, 230, 0.10);

    /* LED semantics — identical both shifts (dots/wells keep night values) */
    --led-go: #41E25E; --led-hold: #FFB000; --led-warn: #FF4438; --led-scope: #58C4BC;
    --go-soft: rgba(65, 226, 94, 0.10); --hold-soft: rgba(255, 176, 0, 0.10);
    --warn-soft: rgba(255, 68, 56, 0.12); --scope-soft: rgba(88, 196, 188, 0.10);

    /* Displays-stay-dark group — defined ONCE, never overridden by any shift */
    --void: #000000;
    --display-bg-top: #040404; --display-bg-bottom: #070707;
    --display-border: rgba(0, 0, 0, 0.8);
    --phosphor: #41E25E; --phosphor-dim: #2E5237;

    /* Spacing — base-4 Fibonacci-flavored */
    --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 20px;
    --sp-5: 32px; --sp-6: 52px; --sp-7: 84px;

    /* Machined radii */
    --r-card: 2px; --r-control: 4px; --r-overlay: 8px; --r-pill: 9999px;

    /* Mechanical motion envelopes */
    --ease-snap: cubic-bezier(0.32, 0.72, 0, 1);
    --ease-led: cubic-bezier(0.2, 0.7, 0.3, 1);
    --ease-vu: cubic-bezier(0.2, 0.85, 0.15, 1);
  }

  .dark {
    /* shadcn semantic layer — Night Ops values */
    --background: 0 0% 2%;              /* #050505 carbon chassis */
    --foreground: 0 0% 96%;             /* #F5F5F5 platinum */
    --card: 0 0% 5%;                    /* #0D0D0D */
    --card-foreground: 0 0% 96%;
    --popover: 0 0% 5%;
    --popover-foreground: 0 0% 96%;
    --primary: 358 68% 40%;
    --primary-foreground: 12 100% 97%;
    --secondary: 0 0% 8%;               /* #141414 */
    --secondary-foreground: 0 0% 96%;
    --muted: 0 0% 8%;
    --muted-foreground: 0 0% 70%;       /* #B3B3B3 silver */
    --accent: 0 0% 8%;
    --accent-foreground: 0 0% 96%;
    --destructive: 4 100% 61%;          /* #FF4438 led-warn */
    --destructive-foreground: 12 100% 97%;
    --border: 0 0% 15%;                 /* #262626 */
    --input: 0 0% 15%;
    --ring: 0 0% 90%;                   /* #E6E6E6 chrome focus */
    --mission-red: 358 75% 51%;         /* legacy alias → armed-lit (purged Phase 8) */

    --carbon-950: #050505; --carbon-900: #0D0D0D; --carbon-850: #101010;
    --carbon-800: #141414; --carbon-750: #1A1A1A; --carbon-700: #262626;
    --platinum: #F5F5F5; --silver-bright: #D1D1D1; --silver: #B3B3B3;
    --silver-mute: #888888; --graphite: #5A5A5A;
    --hairline: rgba(255, 255, 255, 0.08); --hairline-strong: rgba(255, 255, 255, 0.16);
  }
}
```
Note `--radius` is intentionally gone — Step 2 remaps Tailwind's radius scale to the machined tokens.

- [ ] **Step 2: Update tailwind.config.ts**

In `apps/desktop/src/renderer/tailwind.config.ts`:

(a) Add console palettes inside `theme.extend.colors` (after the `surface` block; keep `brand` and `surface` as-is — `brand.DEFAULT` is already the armed red):
```ts
        // Console tokens (Carbon Pro — DESIGN.md §Color). CSS vars flip per shift.
        carbon: {
          950: 'var(--carbon-950)', 900: 'var(--carbon-900)', 850: 'var(--carbon-850)',
          800: 'var(--carbon-800)', 750: 'var(--carbon-750)', 700: 'var(--carbon-700)',
        },
        armed: { DEFAULT: 'var(--armed)', lit: 'var(--armed-lit)', deep: 'var(--armed-deep)' },
        led: {
          go: 'var(--led-go)', hold: 'var(--led-hold)',
          warn: 'var(--led-warn)', scope: 'var(--led-scope)',
        },
        chrome: 'var(--chrome)',
        platinum: 'var(--platinum)',
        silver: { DEFAULT: 'var(--silver)', bright: 'var(--silver-bright)', mute: 'var(--silver-mute)' },
        graphite: 'var(--graphite)',
```
LED colors are raw hex vars, so opacity modifiers like `bg-led-go/10` work via Tailwind's color-mix handling of non-HSL values in v3.4 arbitrary alpha — they do NOT (v3.4 `/alpha` requires channel tuples). Therefore: where alpha tints of LEDs are needed, use the pre-baked `--go-soft`-family vars or arbitrary values (`bg-[var(--go-soft)]`, `border-[rgba(65,226,94,0.4)]`). The component tasks below already follow this.

(b) Replace the `borderRadius` block:
```ts
      borderRadius: {
        // Machined radii (DESIGN.md). lg/md/sm remap legacy call sites onto the
        // console scale; semantic names are for new code.
        lg: 'var(--r-control)',
        md: 'var(--r-control)',
        sm: 'var(--r-card)',
        card: 'var(--r-card)',
        control: 'var(--r-control)',
        overlay: 'var(--r-overlay)',
      },
```

(c) Add motion to `theme.extend` (merge with existing `keyframes`/`animation`):
```ts
      transitionTimingFunction: {
        snap: 'var(--ease-snap)',
        led: 'var(--ease-led)',
        vu: 'var(--ease-vu)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        ignite: {
          '0%': { filter: 'brightness(0.35)', opacity: '0.4' },
          '30%': { filter: 'brightness(1.5)' },
          '100%': { filter: 'brightness(1)', opacity: '1' },
        },
        'lamp-blink': {
          '0%, 49%': { filter: 'brightness(1.25)', opacity: '1' },
          '50%, 100%': { opacity: '0.22', textShadow: 'none' },
        },
        'vu-tip': { '0%': { opacity: '1' }, '100%': { opacity: '0.25' } },
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        ignite: 'ignite 0.32s var(--ease-led)',
        'lamp-blink': 'lamp-blink 1s step-end infinite',
        'vu-tip': 'vu-tip 0.45s var(--ease-vu) infinite alternate',
      },
```

- [ ] **Step 3: Run gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: PASS. If any renderer unit test asserts an old token-derived class/color, inspect: only update assertions that are purely visual (e.g. an exact `rounded-md` pixel expectation); behavioral assertions must not change.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(sweep): dual-shift Carbon Pro token layer (Night Ops + Day Shift)"
```

---

### Task 3: Global chrome retarget (body, scrollbars, selection, typography utilities)

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css` (second `@layer base` block + `@layer components` typography classes + `@layer utilities` scrollbar)

- [ ] **Step 1: Body + selection + form chrome**

In the second `@layer base` block of `globals.css`:

(a) Body (line 80): change `@apply bg-black text-foreground text-body;` to `@apply bg-background text-foreground text-body;` (chassis now flips per shift).

(b) `::selection` / `::-moz-selection` (lines 105–113): replace `hsl(var(--mission-red) / 0.42)` with `var(--armed-glow)` in both rules (keep `color: hsl(var(--foreground))`).

(c) `select` rules (lines 121–135): replace `color-scheme: dark;` with `color-scheme: light dark;`, replace both `accent-color: hsl(var(--mission-red))` → `accent-color: var(--armed)`, and the three `background-color: #000000` / `color` pairs in `select option` rules → `background-color: hsl(var(--popover))` and selected-option color `var(--armed-lit)`.

(d) `input[type="date"]` (line 138): `color-scheme: light dark;`. Leave the `::-webkit-calendar-picker-indicator` rule.

- [ ] **Step 2: Scrollbars → armed on chassis**

In both the global `*` scrollbar rules (lines 147–174) and `.scrollbar-thin` utilities (lines 518–543), replace every `#000000` with `hsl(var(--background))` and every `hsl(var(--mission-red) / X)` stays as-is (the alias now resolves to armed/armed-lit). Result: thumbs read armed red on the shift's chassis color in both themes.

- [ ] **Step 3: Retarget typography utility classes**

In `@layer components`, replace the font-family lines (keep every size/spacing/weight value identical):

| Class | New font-family line | Extra |
|---|---|---|
| `.text-eyebrow` | `font-family: "Archivo Variable", sans-serif;` | add `font-variation-settings: 'wdth' 110;` |
| `.text-eyebrow-sm` | same as above | same |
| `.text-menu-label` | same as above | same |
| `.text-shortcut` | `font-family: "Departure Mono", ui-monospace, monospace;` | — |
| `.text-code` | `font-family: "Iosevka", ui-monospace, monospace;` | — |
| `.text-code-sm` | `font-family: "Iosevka", ui-monospace, monospace;` | — |
| `.text-numeric` | `font-family: "Departure Mono", ui-monospace, monospace;` | live numbers wear Departure Mono (DESIGN.md) |
| `.text-numeric-lg` | `font-family: "Departure Mono", ui-monospace, monospace;` | — |

- [ ] **Step 4: Gates + visual smoke**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: PASS. Then `pnpm dev` briefly: app boots, text renders in Public Sans, no font-shaped layout explosions (Departure Mono at numeric sizes will look slightly wider — acceptable until per-screen sweeps).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sweep): retarget global chrome + typography utilities to console stack"
```

---

### Task 4: Legacy class retint (.mission-*, .brand-selected, .amoled-menu-surface)

These classes survive until Phase 8 but must read coherently on Carbon tokens **in both shifts** (today they hardcode `#000000`, which would look broken on Day Shift silver).

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css` (mission classes lines 408–515, brand-selected lines 271–322)

- [ ] **Step 1: Replace hardcoded blacks in mission classes with semantic tokens**

In `@layer components` mission rules, apply exactly:
- `.mission-app-shell`: `hsl(var(--mission-red) / 0.2)` → `var(--armed-soft)`; the `linear-gradient(180deg, #000000 0%, #000000 100%)` → `linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background)) 100%)`.
- `.mission-shell`, `.mission-icon-button`, `.mission-sheet-header`, `.mission-state-block`: `background-color: #000000` → `background-color: hsl(var(--background))`.
- `.mission-hero`, `.mission-panel`, `.mission-chrome-panel`, `.mission-workspace-trigger`: `background-color: #000000` (with or without `!important`) → `background-color: hsl(var(--card))` (keep `!important` where present); keep the box-shadows.
- `.mission-control-row`, `.mission-metric-tile`, `.mission-inset-surface`: `#000000` → `hsl(var(--card))`.
- `.mission-select`: `bg-black` in the `@apply` → `bg-card`; `:hover` `background-color: #000000` → `hsl(var(--card))`; the focus `hsl(var(--mission-red) / …)` stays (alias).
- `.amoled-menu-surface` (both rules, lines 498–515): `#000000` → `hsl(var(--popover))` (keep `!important` in the second rule).

- [ ] **Step 2: Retint .brand-selected default to armed**

Line 274–276: change the default tone channels to the armed values:
```css
    --bs-h: 358;
    --bs-s: 68%;
    --bs-l: 40%;
```
(Variants green/blue/amber unchanged — they map to the LED vocabulary closely enough until each chooser is recomposed.)

- [ ] **Step 3: Gates + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat(sweep): retint legacy mission/brand classes onto dual-shift tokens"
```

---

### Task 5: Console recipe CSS layer

The canonical four-layer recipes from the approved preview, transcribed to the app's theme convention (base = Day, `.dark` = Night; displays get ONE dark rule). All go at the END of `@layer components` in `globals.css`.

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/globals.css` (append to `@layer components`; extend the reduced-motion block)

- [ ] **Step 1: Collision check**

```bash
grep -rn "className=[\"'][^\"']*\b\(faceplate\|stripe\|lamp\|lcd\|cap\|well\|hex\|plate\)\b" apps/desktop/src/renderer/src --include="*.tsx" | grep -v "components/console"
```
Expected: 0 hits (these class names are unused today). If any hit appears, prefix ALL new recipe classes in this task and all later tasks with `cx-` and note it in the PR description.

- [ ] **Step 2: Append the recipe block**

Append to `@layer components` in `globals.css` (after `.mission-select:focus`):

```css
  /* ================================================================
   * CONSOLE RECIPES — Carbon Pro four-layer depth system (DESIGN.md).
   * Base rules = Day Shift (matches :root); `.dark` overrides = Night Ops.
   * DISPLAYS-STAY-DARK: .well, .lcd, .lamp, .vu carry literal dark values
   * and have NO .dark variant — they are identical in both shifts.
   * ================================================================ */

  /* Layer 1 — raised faceplate */
  .faceplate {
    position: relative;
    border-radius: var(--r-card);
    background:
      radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255, 255, 255, 0.55) 0%, transparent 60%),
      linear-gradient(180deg, #F5F5F3 0%, #EAEAE7 35%, #E0E0DC 70%, #D8D8D4 100%);
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(0, 0, 0, 0.16),
      inset 1px 0 0 rgba(255, 255, 255, 0.5), inset -1px 0 0 rgba(0, 0, 0, 0.08),
      0 1px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.16),
      0 12px 28px rgba(0, 0, 0, 0.14), 0 40px 80px rgba(0, 0, 0, 0.1);
  }
  .faceplate::before { /* edge-light strip */
    content: '';
    position: absolute;
    top: 2px; left: 24px; right: 24px; height: 1px; z-index: 6;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.65) 20%, rgba(255, 255, 255, 0.95) 50%, rgba(255, 255, 255, 0.65) 80%, transparent 100%);
    pointer-events: none;
  }
  .faceplate::after { /* top-right key light */
    content: '';
    position: absolute;
    top: 0; right: 0; width: 140px; height: 60px;
    background: radial-gradient(ellipse at 80% 0%, rgba(255, 255, 255, 0.5) 0%, transparent 70%);
    pointer-events: none;
    border-radius: var(--r-card);
  }
  .dark .faceplate {
    background:
      radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255, 255, 255, 0.04) 0%, transparent 60%),
      linear-gradient(180deg, #1C1C1C 0%, #151515 35%, #101010 70%, #0C0C0C 100%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.7),
      inset 1px 0 0 rgba(255, 255, 255, 0.025), inset -1px 0 0 rgba(0, 0, 0, 0.4),
      0 1px 0 rgba(0, 0, 0, 0.9), 0 2px 4px rgba(0, 0, 0, 0.7),
      0 12px 28px rgba(0, 0, 0, 0.55), 0 40px 80px rgba(0, 0, 0, 0.4);
  }
  .dark .faceplate::before {
    background: linear-gradient(90deg, transparent 0%, rgba(230, 230, 230, 0.18) 20%, rgba(230, 230, 230, 0.32) 50%, rgba(230, 230, 230, 0.18) 80%, transparent 100%);
  }
  .dark .faceplate::after {
    background: radial-gradient(ellipse at 80% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%);
  }

  /* Faceplate-lite — Card/Dialog surfaces (no edge-light pseudo, lighter throw) */
  .plate {
    border-radius: var(--r-card);
    background:
      radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255, 255, 255, 0.55) 0%, transparent 60%),
      linear-gradient(180deg, #F5F5F3 0%, #EAEAE7 50%, #DCDCD8 100%);
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(0, 0, 0, 0.12),
      0 1px 0 rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(0, 0, 0, 0.1);
  }
  .dark .plate {
    background:
      radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255, 255, 255, 0.04) 0%, transparent 60%),
      linear-gradient(180deg, #161616 0%, #111111 50%, #0D0D0D 100%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 0 rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.5), 0 8px 20px rgba(0, 0, 0, 0.4);
  }

  /* Layer 2 — recessed well (DISPLAY SURFACE: identical both shifts) */
  .well {
    border-radius: var(--r-card);
    background: linear-gradient(180deg, #080808 0%, #0A0A0A 100%);
    border: 1px solid rgba(0, 0, 0, 0.7);
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      inset 1px 0 2px rgba(0, 0, 0, 0.5), inset -1px 0 2px rgba(0, 0, 0, 0.5);
  }

  /* Recessed input well — form fields (light text BOTH shifts per DESIGN.md) */
  .well-input {
    border-radius: var(--r-control);
    background: linear-gradient(180deg, #060606, #0A0A0A);
    border: 1px solid rgba(0, 0, 0, 0.8);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -1px 0 rgba(255, 255, 255, 0.03);
    color: #F5F5F5;
    transition: border-color 150ms var(--ease-snap), box-shadow 150ms var(--ease-snap);
  }
  .well-input::placeholder { color: #888888; }
  .well-input:focus-visible {
    outline: none;
    border-color: hsl(var(--ring) / 0.5);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 0 1px hsl(var(--ring) / 0.5);
  }

  /* Layer 3 — machined cap (neutral raised control) */
  .cap {
    border-radius: var(--r-control);
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.7) 0%, transparent 60%),
      linear-gradient(180deg, #F7F7F5 0%, #E7E7E4 60%, #DBDBD7 100%);
    border: 1px solid rgba(0, 0, 0, 0.14);
    color: #2E2E2C;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 0 rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.25), 0 4px 8px rgba(0, 0, 0, 0.14);
  }
  .dark .cap {
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.07) 0%, transparent 60%),
      linear-gradient(180deg, #222222 0%, #181818 60%, #121212 100%);
    border: 1px solid rgba(255, 255, 255, 0.07);
    color: var(--silver-bright);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5);
  }
  .cap:hover { filter: brightness(1.04); }
  .dark .cap:hover { filter: brightness(1.18); }
  .cap:active { transform: translateY(1px); }

  /* Armed cap — consequential commands only (identical both shifts) */
  .cap-armed {
    border-radius: var(--r-control);
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.2) 0%, transparent 60%),
      linear-gradient(180deg, #C8333A 0%, #AA2024 55%, #7F171A 100%);
    border: 1px solid var(--armed-deep);
    color: #FFF3F0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 0 rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(170, 32, 36, 0.4), 0 1px 2px rgba(0, 0, 0, 0.7),
      0 4px 12px rgba(0, 0, 0, 0.5), 0 0 24px var(--armed-glow);
    text-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
  }
  .cap-armed:hover { filter: brightness(1.1); }
  .cap-armed:active { transform: translateY(1px); }

  /* Warn cap — destructive actions (LED-warn tinted; dark cap both shifts) */
  .cap-warn {
    border-radius: var(--r-control);
    background:
      linear-gradient(180deg, rgba(255, 68, 56, 0.14), rgba(255, 68, 56, 0.04)),
      linear-gradient(180deg, #241412, #140F0E);
    border: 1px solid rgba(255, 68, 56, 0.4);
    color: var(--led-warn);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 3px 6px rgba(0, 0, 0, 0.45);
    text-shadow: 0 0 8px rgba(255, 68, 56, 0.4);
  }
  .cap-warn:hover { filter: brightness(1.15); }
  .cap-warn:active { transform: translateY(1px); }

  /* Chrome cap — THE single polished CTA (inverts to black-gloss on Day) */
  .cap-chrome {
    border-radius: var(--r-control);
    background: linear-gradient(180deg, #3E3E3C 0%, #1E1E1C 50%, #0E0E0C 100%);
    color: #F5F5F3;
    border: 1px solid rgba(0, 0, 0, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  .dark .cap-chrome {
    background: linear-gradient(180deg, #FFFFFF 0%, #E6E6E6 50%, #C8C8C8 100%);
    color: #000000;
    border-color: rgba(230, 230, 230, 0.4);
    text-shadow: none;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      inset 0 -2px 0 rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.6),
      0 4px 12px rgba(0, 0, 0, 0.5), 0 0 24px rgba(230, 230, 230, 0.14);
  }
  .cap-chrome:hover { filter: brightness(1.08); }
  .dark .cap-chrome:hover { filter: brightness(1.05); }
  .cap-chrome:active { transform: translateY(1px); }

  /* Brushed-aluminum stripe header (directional machine grain — NEVER noise) */
  .stripe {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 36px;
    padding: 0 44px; /* clears 20px corner bolts */
    z-index: 5;
    border-radius: var(--r-card) var(--r-card) 0 0;
    background:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.035) 0 1px, rgba(0, 0, 0, 0.012) 1px 2px, rgba(255, 255, 255, 0.45) 2px 3px),
      linear-gradient(180deg, #F0F0ED 0%, #E0E0DC 55%, #D5D5D1 100%);
    border-bottom: 1px solid rgba(0, 0, 0, 0.18);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 0 rgba(255, 255, 255, 0.4);
  }
  .dark .stripe {
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, rgba(255, 255, 255, 0.012) 1px 2px, rgba(0, 0, 0, 0.06) 2px 3px),
      linear-gradient(180deg, #2A2A2A 0%, #1F1F1F 55%, #181818 100%);
    border-bottom: 1px solid rgba(0, 0, 0, 0.8);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  /* Hex socket cap bolt — 3-layer machined (outer hex + Allen socket) */
  .hex {
    position: absolute;
    width: 20px;
    height: 20px;
    z-index: 7;
    background:
      radial-gradient(circle at 50% 50%, transparent 62%, rgba(0, 0, 0, 0.06) 68%, transparent 75%),
      radial-gradient(circle at 28% 22%, #FFFFFF 0%, #DCDCD8 12%, #B4B4B0 30%, #8E8E8A 55%, #62625E 80%, #44443F 100%);
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
  }
  .hex::after {
    content: '';
    position: absolute;
    inset: 23%;
    background: radial-gradient(circle at 72% 78%, #6A6A66 0%, #3E3E3A 35%, #222220 100%);
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  }
  .dark .hex {
    background:
      radial-gradient(circle at 50% 50%, transparent 62%, rgba(255, 255, 255, 0.04) 68%, transparent 75%),
      radial-gradient(circle at 28% 22%, #A4A4A4 0%, #7C7C7C 12%, #525252 30%, #323232 55%, #181818 80%, #0A0A0A 100%);
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.95)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7));
  }
  .dark .hex::after {
    background: radial-gradient(circle at 72% 78%, #1C1C1C 0%, #0A0A0A 35%, #000000 100%);
  }
  .hex-tl { top: 8px; left: 10px; }
  .hex-tr { top: 8px; right: 10px; }
  .hex-bl { bottom: 10px; left: 10px; }
  .hex-br { bottom: 10px; right: 10px; }

  /* Lamp tile — stencil word status (DISPLAY: dark cap both shifts) */
  .lamp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 54px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--r-control);
    font-family: "Archivo Variable", sans-serif;
    font-variation-settings: 'wdth' 110;
    font-weight: 750;
    font-size: 10.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(180deg, #1F1F1F 0%, #161616 60%, #111111 100%);
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #5A5A5A; /* unlit graphite — literal: lamp caps never invert */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.6),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 3px 6px rgba(0, 0, 0, 0.45);
    user-select: none;
  }
  .lamp-sm { min-width: 40px; height: 19px; font-size: 8.5px; padding: 0 7px; }
  .lamp-go {
    color: var(--led-go);
    background: linear-gradient(180deg, rgba(65, 226, 94, 0.14), rgba(65, 226, 94, 0.05)), linear-gradient(180deg, #1C1F1C, #121412);
    border-color: rgba(65, 226, 94, 0.35);
    text-shadow: 0 0 8px rgba(65, 226, 94, 0.6);
  }
  .lamp-hold {
    color: var(--led-hold);
    background: linear-gradient(180deg, rgba(255, 176, 0, 0.13), rgba(255, 176, 0, 0.04)), linear-gradient(180deg, #201D14, #141210);
    border-color: rgba(255, 176, 0, 0.35);
    text-shadow: 0 0 8px rgba(255, 176, 0, 0.55);
  }
  .lamp-exec {
    color: var(--led-scope);
    background: linear-gradient(180deg, rgba(88, 196, 188, 0.12), rgba(88, 196, 188, 0.04)), linear-gradient(180deg, #161E1D, #101413);
    border-color: rgba(88, 196, 188, 0.32);
    text-shadow: 0 0 8px rgba(88, 196, 188, 0.5);
  }
  .lamp-armed {
    color: #FFF3F0;
    background: linear-gradient(180deg, #C8333A 0%, #AA2024 55%, #7F171A 100%);
    border-color: var(--armed-deep);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 0 rgba(0, 0, 0, 0.5),
      0 1px 2px rgba(0, 0, 0, 0.8), 0 0 18px var(--armed-glow);
    text-shadow: 0 0 6px rgba(255, 255, 255, 0.35);
  }
  .lamp-warn {
    color: var(--led-warn);
    background: linear-gradient(180deg, rgba(255, 68, 56, 0.14), rgba(255, 68, 56, 0.04)), linear-gradient(180deg, #241412, #140F0E);
    border-color: rgba(255, 68, 56, 0.4);
    text-shadow: 0 0 8px rgba(255, 68, 56, 0.6);
  }

  /* LCD — recessed phosphor window (DISPLAY: identical both shifts) */
  .lcd {
    font-family: "Departure Mono", ui-monospace, monospace;
    background: linear-gradient(180deg, var(--display-bg-top), var(--display-bg-bottom));
    border: 1px solid var(--display-border);
    border-radius: var(--r-card);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.85), inset 0 -1px 0 rgba(255, 255, 255, 0.03);
    padding: 8px 12px;
    color: var(--phosphor);
    text-shadow: 0 0 7px rgba(65, 226, 94, 0.5);
  }
  .lcd .lcd-dim { color: var(--phosphor-dim); text-shadow: none; }
  .lcd-amber { color: var(--led-hold); text-shadow: 0 0 7px rgba(255, 176, 0, 0.45); }
  .lcd-red { color: var(--armed-lit); text-shadow: 0 0 8px var(--armed-glow); }

  /* VU meter segments (DISPLAY: unlit segments dark both shifts) */
  .vu-seg {
    background: #151515;
    border-radius: 1px;
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.7);
  }
  .vu-seg-g { background: var(--led-go); box-shadow: 0 0 5px rgba(65, 226, 94, 0.55); }
  .vu-seg-a { background: var(--led-hold); box-shadow: 0 0 5px rgba(255, 176, 0, 0.5); }
  .vu-seg-r { background: var(--led-warn); box-shadow: 0 0 6px rgba(255, 68, 56, 0.55); }

  /* Bat-lever switch track/thumb (track is a dark recessed well both shifts) */
  .switch-track {
    background: linear-gradient(180deg, #060606, #0B0B0B);
    border: 1px solid rgba(0, 0, 0, 0.8);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8);
    transition: box-shadow 150ms var(--ease-snap);
  }
  .switch-track[data-state='checked'] {
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px var(--armed-soft);
  }
  .switch-thumb {
    background: linear-gradient(180deg, #FAFAF8, #D8D8D4);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(0, 0, 0, 0.35);
    transition: transform 150ms var(--ease-snap), background 150ms var(--ease-snap);
  }
  .dark .switch-thumb {
    background: linear-gradient(180deg, #3A3A3A, #222222);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .switch-thumb[data-state='checked'] {
    background: linear-gradient(180deg, #C8333A, #8F1B1F);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 1px 2px rgba(0, 0, 0, 0.6), 0 0 8px var(--armed-glow);
  }

  /* Annunciator alert module (dark module rows BOTH shifts per DESIGN.md) */
  .annunciator-module {
    background: linear-gradient(180deg, #101010, #0C0C0C);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 6px rgba(0, 0, 0, 0.5);
  }
```

- [ ] **Step 3: Extend the reduced-motion block**

Replace the `@media (prefers-reduced-motion: reduce)` block at the end of `globals.css` with:
```css
/* Respect reduced-motion preferences — all console animation collapses;
   states stay legible by color + form (lamp components render a visible
   UNACK affix under reduced motion — see LampTile). */
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-slow,
  .animate-pulse,
  .animate-ignite,
  .animate-lamp-blink,
  .animate-vu-tip {
    animation: none;
  }
}
```

- [ ] **Step 4: Gates + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat(sweep): console recipe layer — faceplate/well/cap/stripe/hex/lamp/lcd/vu (dual-shift)"
```

---

### Task 6: shadcn restyle — form controls (Button, Input, Textarea, Select, Switch, RadioGroup, Label)

APIs frozen: every existing variant/size/prop keeps its name. The `chrome` button variant is ADDED (additive is allowed).

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/ui/button.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/input.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/textarea.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/select.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/switch.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/radio-group.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/label.tsx`

- [ ] **Step 1: Button — machined caps**

Replace the `buttonVariants` definition in `button.tsx` (lines 7–31) with:
```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-display font-[750] text-button uppercase tracking-[0.08em] [font-variation-settings:"wdth"_110] ring-offset-background transition-[filter,transform] duration-150 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'cap-armed',
        destructive: 'cap-warn',
        outline: 'cap',
        secondary: 'cap',
        ghost:
          'text-muted-foreground hover:bg-foreground/5 hover:text-foreground normal-case tracking-normal font-sans font-medium [font-variation-settings:normal]',
        link: 'text-primary underline-offset-4 hover:underline normal-case tracking-normal font-sans font-medium [font-variation-settings:normal]',
        chrome: 'cap-chrome',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
```
(`rounded-md` dropped from sizes — radius now comes from the cap recipes / base class.)

- [ ] **Step 2: Input + Textarea — recessed wells**

`input.tsx` line 11, replace the class string with:
```ts
          'well-input flex h-10 w-full px-3 py-2 text-body file:border-0 file:bg-transparent file:text-button file:text-current focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
```
`textarea.tsx` line 10, replace the class string with:
```ts
          'well-input flex min-h-[80px] w-full px-3 py-2 text-body focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
```
(`.well-input` owns bg/border/shadow/radius/text/placeholder/focus — do not re-add `border`, `bg-background`, `rounded-md`, or `placeholder:` utilities.)

- [ ] **Step 3: Select — well trigger, overlay content**

In `select.tsx`:
- `SelectTrigger` base classes: replace `rounded-md border border-input bg-background … placeholder:text-muted-foreground` portion with `well-input` (keep layout classes: `flex h-10 w-full items-center justify-between px-3 py-2 text-body`, keep `[&>span]:line-clamp-1`, keep disabled classes; drop `focus:ring-*` in favor of well-input's focus).
- `SelectContent` base classes: replace `rounded-md` with `rounded-overlay` and append `border-border bg-popover` if not present (it is standard shadcn `bg-popover` — keep). Content menus are NOT displays; they flip per shift.
- `SelectItem`: replace `rounded-sm` with `rounded-[3px]`; replace `focus:bg-accent focus:text-accent-foreground` with `focus:bg-[var(--armed-soft)] focus:text-foreground`.

- [ ] **Step 4: Switch — bat-lever**

Replace the two class strings in `switch.tsx`:
Root (line 14):
```ts
      'switch-track peer inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
```
Thumb (line 22):
```ts
        'switch-thumb pointer-events-none block h-3.5 w-3.5 rounded-[3px] ring-0 data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[3px]',
```
(Note: `data-state` exists on both Root and Thumb in Radix — the CSS recipes key off it.)

- [ ] **Step 5: RadioGroup + Label**

`radio-group.tsx` — on the `RadioGroupItem` class string: replace `border-primary text-primary` (or stock equivalents) so the item reads as a small recessed socket with an armed indicator:
```ts
      'aspect-square h-4 w-4 rounded-full border border-black/70 bg-[#0a0a0a] text-armed-lit shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
```
Keep the `RadioGroupIndicator` circle fill classes but ensure the dot uses `fill-armed-lit text-armed-lit` and add `drop-shadow-[0_0_4px_var(--armed-glow)]`.

`label.tsx` — replace the base class string (console plate forms: labels in Departure Mono UC):
```ts
  'font-data text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
```

- [ ] **Step 6: Gates — fix only class-assertion tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Some renderer tests may assert old shadcn classes (e.g. `bg-primary` on a default button). Update ONLY pure class assertions to the new strings; if a test asserts behavior (click handlers, aria, disabled), it must pass unmodified.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sweep): restyle form-control primitives as machined caps + recessed wells"
```

---

### Task 7: shadcn restyle — surfaces (Card, Dialog, Sheet, DropdownMenu, Tabs, Badge, Alert, Separator, ScrollArea, Skeleton, Avatar, Collapsible)

**Files:** all under `apps/desktop/src/renderer/src/components/ui/`: `card.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `badge.tsx`, `alert.tsx`, `separator.tsx`, `scroll-area.tsx`, `skeleton.tsx`, `avatar.tsx`, `collapsible.tsx`

- [ ] **Step 1: Card → faceplate-lite**

`card.tsx` line 9, replace the class string with:
```ts
      className={cn('plate rounded-card text-card-foreground', className)}
```
(`.plate` owns bg/border/shadow; `border`/`bg-card`/`shadow-sm` removed.) `CardTitle` becomes a placard: replace `'text-h3'` with `'font-display text-h4 uppercase tracking-[0.05em] [font-variation-settings:"wdth"_118]'`. CardHeader/Description/Content/Footer unchanged.

- [ ] **Step 2: Dialog + Sheet → overlay plates**

`dialog.tsx` `DialogContent` (line 39): replace `border bg-background p-6 shadow-lg` with `plate rounded-overlay p-6` and replace the trailing `sm:rounded-lg` with `sm:rounded-overlay`. `DialogTitle`: replace `'text-h3'` with `'font-display text-h4 uppercase tracking-[0.05em] [font-variation-settings:"wdth"_118]'`.

`sheet.tsx` `SheetContent` (its `sheetVariants` cva base): replace `bg-background` with `plate` and any `border-l`/`border-r`/etc. side borders stay; replace `shadow-lg` with nothing (plate owns shadows). `SheetTitle` gets the same placard classes as DialogTitle.

- [ ] **Step 3: DropdownMenu → overlay**

`dropdown-menu.tsx`: in `DropdownMenuContent` and `DropdownMenuSubContent` replace `rounded-md` with `rounded-overlay` (keep `bg-popover`); in `DropdownMenuItem`/`CheckboxItem`/`RadioItem` replace `rounded-sm` with `rounded-[3px]` and `focus:bg-accent focus:text-accent-foreground` with `focus:bg-[var(--armed-soft)] focus:text-foreground`.

- [ ] **Step 4: Tabs → machined track**

`tabs.tsx` `TabsList` (line 17): replace `rounded-md` with `rounded-control`. `TabsTrigger` (line 32): replace `rounded-sm` with `rounded-[3px]` and `data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm` with `data-[state=active]:cap data-[state=active]:text-foreground`. (Full lamp-style tab recomposition is per-screen work in Phases 2–7.)

- [ ] **Step 5: Badge → stencil tags**

Replace `badgeVariants` in `badge.tsx` (lines 6–25) with:
```ts
const badgeVariants = cva(
  'inline-flex items-center rounded-control border px-2 py-0.5 font-display text-[10px] font-[700] uppercase tracking-[0.08em] [font-variation-settings:"wdth"_110] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-[rgba(255,68,56,0.4)] bg-[var(--warn-soft)] text-led-warn',
        warning: 'border-[rgba(255,176,0,0.35)] bg-[var(--hold-soft)] text-led-hold',
        outline: 'text-foreground',
        go: 'border-[rgba(65,226,94,0.35)] bg-[var(--go-soft)] text-led-go',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
```
(`go` is additive; `rounded-full` → `rounded-control` per machined-radius canon; hover tints dropped — badges are states, not buttons.)

- [ ] **Step 6: Alert → annunciator module**

Replace `alertVariants` in `alert.tsx` (lines 6–22) with:
```ts
const alertVariants = cva(
  'annunciator-module relative w-full rounded-control p-4 text-[#B3B3B3] [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-[#B3B3B3]',
  {
    variants: {
      variant: {
        default: '[&>svg]:text-led-scope',
        destructive: 'border-[rgba(255,68,56,0.4)] [&>svg]:text-led-warn',
        warning: 'border-[rgba(255,176,0,0.35)] [&>svg]:text-led-hold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
```
`AlertTitle` (line 35): replace `'mb-1 text-h4 leading-none'` with `'mb-1 font-display text-[11px] font-[750] uppercase tracking-[0.1em] leading-none'` and add per-variant title colors by extending the cva base with `[&>h5]:…`? No — simpler and explicit: in `alertVariants`, append to each variant: default `[&_h5]:text-led-scope`, destructive `[&_h5]:text-led-warn`, warning `[&_h5]:text-led-hold`. `AlertDescription` unchanged (module body is light-on-dark already via the base text color).
Module rows are dark in BOTH shifts (DESIGN.md) — hence the literal `#B3B3B3` body text, not `text-muted-foreground`.

- [ ] **Step 7: Separator, ScrollArea, Skeleton, Avatar, Collapsible**

- `separator.tsx`: replace `bg-border` with `bg-[var(--hairline)]` (hairline, not solid).
- `scroll-area.tsx`: in the scrollbar thumb class replace `bg-border` with `bg-[hsl(var(--mission-red)/0.58)]` to match the global scrollbar language.
- `skeleton.tsx`: replace `rounded-md` with `rounded-control` (keep `animate-pulse bg-muted`).
- `avatar.tsx`: no class changes (pill radius is canon for avatars) — verify only.
- `collapsible.tsx`: no class changes (pure Radix wrappers) — verify only.

- [ ] **Step 8: Gates — fix only class-assertion tests, then commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat(sweep): restyle surface primitives as plates, overlays, stencil badges, annunciator alerts"
```

---

### Task 8: Console primitives — HexBolt, StripeHeader, Faceplate, RecessedWell, LcdWell

TDD: write the test file first, watch it fail, implement, watch it pass. Tests live beside components (repo convention). Use the same Testing Library setup as `apps/desktop/src/renderer/src/app/top-bar.test.tsx` (copy its render/imports pattern).

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/structural.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/hex-bolt.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/stripe-header.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/faceplate.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/recessed-well.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/lcd-well.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/index.ts`

- [ ] **Step 1: Write the failing tests**

`structural.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Faceplate } from './faceplate';
import { HexBolt } from './hex-bolt';
import { LcdWell } from './lcd-well';
import { RecessedWell } from './recessed-well';
import { StripeHeader } from './stripe-header';

describe('HexBolt', () => {
  it('renders a decorative bolt hidden from the a11y tree', () => {
    const { container } = render(<HexBolt corner="tl" />);
    const bolt = container.firstElementChild as HTMLElement;
    expect(bolt).toHaveAttribute('aria-hidden', 'true');
    expect(bolt.className).toContain('hex');
    expect(bolt.className).toContain('hex-tl');
  });
});

describe('StripeHeader', () => {
  it('renders kicker, serial, and trailing slot', () => {
    render(
      <StripeHeader kicker="MOD · LIBRARY · 03" serial="S/N · TX-2026-0610">
        <span data-testid="trail">lamp</span>
      </StripeHeader>,
    );
    expect(screen.getByText('MOD · LIBRARY · 03')).toBeInTheDocument();
    expect(screen.getByText('S/N · TX-2026-0610')).toBeInTheDocument();
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });
});

describe('Faceplate', () => {
  it('renders four corner bolts, a stripe when kicker given, and children', () => {
    const { container } = render(
      <Faceplate kicker="MOD · TEST · 01">
        <p>body content</p>
      </Faceplate>,
    );
    expect(container.querySelectorAll('.hex')).toHaveLength(4);
    expect(screen.getByText('MOD · TEST · 01')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('omits bolts and stripe when disabled', () => {
    const { container } = render(
      <Faceplate bolts={false}>
        <p>plain</p>
      </Faceplate>,
    );
    expect(container.querySelectorAll('.hex')).toHaveLength(0);
    expect(container.querySelector('.stripe')).toBeNull();
  });
});

describe('RecessedWell', () => {
  it('applies the well recipe and forwards className', () => {
    const { container } = render(<RecessedWell className="p-4">w</RecessedWell>);
    const well = container.firstElementChild as HTMLElement;
    expect(well.className).toContain('well');
    expect(well.className).toContain('p-4');
  });
});

describe('LcdWell', () => {
  it('renders phosphor-green by default and tones via prop', () => {
    const { container, rerender } = render(<LcdWell>42 TOK/MIN</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd');
    rerender(<LcdWell tone="amber">HOT</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd-amber');
    rerender(<LcdWell tone="red">$9.99/HR</LcdWell>);
    expect((container.firstElementChild as HTMLElement).className).toContain('lcd-red');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- structural` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the five components**

`hex-bolt.tsx`:
```tsx
import { cn } from '@/lib/utils';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Decorative 3-layer hex socket cap bolt (DESIGN.md §Depth). */
export function HexBolt({ corner, className }: { corner: Corner; className?: string }) {
  return <i aria-hidden="true" className={cn('hex', `hex-${corner}`, className)} />;
}
```

`stripe-header.tsx`:
```tsx
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface StripeHeaderProps {
  /** Departure-Mono module kicker, e.g. "MOD · LIBRARY · 03" */
  kicker: string;
  /** Optional serial stripe, e.g. "S/N · TX-2026-0610" */
  serial?: string;
  /** Trailing slot (typically a LampTile) */
  children?: ReactNode;
  className?: string;
}

/** Brushed-aluminum stripe header — top of every faceplate (DESIGN.md §Layout). */
export function StripeHeader({ kicker, serial, children, className }: StripeHeaderProps) {
  return (
    <div className={cn('stripe', className)}>
      <span className="whitespace-nowrap font-data text-[11px] uppercase tracking-[0.08em] text-[var(--silver)]">
        {kicker}
      </span>
      {serial ? (
        <span className="whitespace-nowrap font-data text-[10px] text-[var(--silver-mute)]">
          {serial}
        </span>
      ) : null}
      <span className="flex-1" />
      {children}
    </div>
  );
}
```

`faceplate.tsx`:
```tsx
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { HexBolt } from './hex-bolt';
import { StripeHeader } from './stripe-header';

interface FaceplateProps {
  /** Stripe kicker; stripe renders only when provided */
  kicker?: string;
  serial?: string;
  /** Trailing stripe slot (e.g. a LampTile) */
  stripeSlot?: ReactNode;
  /** Corner hex bolts (default true) */
  bolts?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Layer-1 raised faceplate: bolts → stripe → body (DESIGN.md §Depth). */
export function Faceplate({
  kicker,
  serial,
  stripeSlot,
  bolts = true,
  children,
  className,
  bodyClassName,
}: FaceplateProps) {
  return (
    <section className={cn('faceplate', className)}>
      {bolts ? (
        <>
          <HexBolt corner="tl" />
          <HexBolt corner="tr" />
          <HexBolt corner="bl" />
          <HexBolt corner="br" />
        </>
      ) : null}
      {kicker ? (
        <StripeHeader kicker={kicker} serial={serial}>
          {stripeSlot}
        </StripeHeader>
      ) : null}
      <div className={cn('relative p-[var(--sp-5)]', bodyClassName)}>{children}</div>
    </section>
  );
}
```

`recessed-well.tsx`:
```tsx
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/** Layer-2 recessed well — always dark in both shifts (DESIGN.md). */
export function RecessedWell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('well', className)} {...props} />;
}
```

`lcd-well.tsx`:
```tsx
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type LcdTone = 'go' | 'amber' | 'red';

interface LcdWellProps extends HTMLAttributes<HTMLDivElement> {
  /** Phosphor tone: go (default green), amber (caution), red (hot values) */
  tone?: LcdTone;
}

/** Recessed phosphor LCD window — void-black in both shifts (DESIGN.md). */
export function LcdWell({ tone = 'go', className, ...props }: LcdWellProps) {
  return (
    <div
      className={cn('lcd', tone === 'amber' && 'lcd-amber', tone === 'red' && 'lcd-red', className)}
      {...props}
    />
  );
}
```

`index.ts`:
```ts
export { Faceplate } from './faceplate';
export { HexBolt } from './hex-bolt';
export { LcdWell } from './lcd-well';
export { RecessedWell } from './recessed-well';
export { StripeHeader } from './stripe-header';
```

- [ ] **Step 4: Run tests to verify pass, full gates, commit**

```bash
pnpm test -- structural   # Expected: PASS (6 tests)
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(sweep): console structural primitives — Faceplate, StripeHeader, HexBolt, wells"
```

---

### Task 9: LampTile — stencil word-lamp with the dual-form red rule

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/lamp-tile.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/lamp-tile.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`

- [ ] **Step 1: Write the failing tests**

`lamp-tile.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LampTile } from './lamp-tile';

describe('LampTile', () => {
  it('renders the stencil word', () => {
    render(<LampTile label="GO" tone="go" />);
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  it('applies the tone class', () => {
    const { container } = render(<LampTile label="HOLD" tone="hold" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('lamp-hold');
  });

  it('unlit by default (off tone has no LED class)', () => {
    const { container } = render(<LampTile label="STBY" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('lamp');
    expect(el.className).not.toMatch(/lamp-(go|hold|warn|exec|armed)/);
  });

  it('dual-form rule: unacknowledged alert blinks and is an actionable button', async () => {
    const onAcknowledge = vi.fn();
    render(<LampTile label="BUDG" tone="warn" alert onAcknowledge={onAcknowledge} />);
    const lamp = screen.getByRole('button', { name: /BUDG.*unacknowledged/i });
    expect(lamp.className).toContain('animate-lamp-blink');
    await userEvent.click(lamp);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('dual-form rule: acknowledged alert burns steady (no blink)', () => {
    render(<LampTile label="BUDG" tone="warn" alert acknowledged />);
    const lamp = screen.getByText('BUDG').closest('[class*="lamp"]') as HTMLElement;
    expect(lamp.className).not.toContain('animate-lamp-blink');
    expect(lamp.className).toContain('lamp-warn');
  });

  it('non-alert lamps are not buttons', () => {
    render(<LampTile label="EXEC" tone="exec" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reduced-motion fallback: UNACK affix present while unacknowledged', () => {
    render(<LampTile label="NET" tone="warn" alert onAcknowledge={() => {}} />);
    expect(screen.getByText('UNACK')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- lamp-tile` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`lamp-tile.tsx`:
```tsx
import { cn } from '@/lib/utils';

export type LampTone = 'off' | 'go' | 'hold' | 'warn' | 'exec' | 'armed';

interface LampTileProps {
  /** Stencil word, 2–6 chars: GO / HOLD / NO-GO / STBY / EXEC / ON AIR / SYS … */
  label: string;
  tone?: LampTone;
  /** Compact 19px variant */
  small?: boolean;
  /**
   * Dual-form red rule (DESIGN.md): an alert lamp BLINKS at 1Hz until
   * acknowledged, then burns steady until resolved. Acknowledgment is a
   * click ritual — alert lamps render as buttons.
   */
  alert?: boolean;
  acknowledged?: boolean;
  onAcknowledge?: () => void;
  className?: string;
}

const toneClass: Record<Exclude<LampTone, 'off'>, string> = {
  go: 'lamp-go',
  hold: 'lamp-hold',
  warn: 'lamp-warn',
  exec: 'lamp-exec',
  armed: 'lamp-armed',
};

export function LampTile({
  label,
  tone = 'off',
  small = false,
  alert = false,
  acknowledged = false,
  onAcknowledge,
  className,
}: LampTileProps) {
  const blinking = alert && !acknowledged;
  const classes = cn(
    'lamp',
    small && 'lamp-sm',
    tone !== 'off' && toneClass[tone],
    tone !== 'off' && !blinking && 'animate-ignite',
    blinking && 'animate-lamp-blink',
    className,
  );
  // Reduced-motion users see no blink — the UNACK affix keeps the
  // unacknowledged state legible by form, not just animation.
  const unackAffix = blinking ? (
    <span className="ml-1 hidden text-[0.8em] opacity-80 motion-reduce:inline">UNACK</span>
  ) : null;

  if (alert) {
    return (
      <button
        type="button"
        aria-label={`${label} — ${acknowledged ? 'acknowledged' : 'unacknowledged'} warning`}
        className={cn(classes, 'cursor-pointer')}
        onClick={() => {
          if (!acknowledged) onAcknowledge?.();
        }}
      >
        {label}
        {unackAffix}
      </button>
    );
  }
  return <span className={classes}>{label}</span>;
}
```

- [ ] **Step 4: Export, test, commit**

Add `export { LampTile, type LampTone } from './lamp-tile';` to `index.ts`.
```bash
pnpm test -- lamp-tile    # Expected: PASS (7 tests)
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(sweep): LampTile word-lamp with dual-form blink/ack ritual"
```

---

### Task 10: VuMeter — functional segment cascade with IEC ballistics

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/vu-meter.test.ts` (pure math) + `vu-meter.test.tsx` (render)
- Create: `apps/desktop/src/renderer/src/components/console/vu-meter.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`

- [ ] **Step 1: Write the failing math tests**

`vu-meter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { ballisticsStep, segmentStates } from './vu-meter';

describe('segmentStates', () => {
  it('lights the right count: value 0.5 of 16 segments lights 8', () => {
    const segs = segmentStates(0.5, 16);
    expect(segs.filter((s) => s.lit)).toHaveLength(8);
  });

  it('zones: green to 60%, amber to 85%, red above', () => {
    const segs = segmentStates(1, 20);
    expect(segs[0]?.zone).toBe('g');
    expect(segs[11]?.zone).toBe('g'); // 12/20 = 60%
    expect(segs[12]?.zone).toBe('a');
    expect(segs[16]?.zone).toBe('a'); // 17/20 = 85%
    expect(segs[17]?.zone).toBe('r');
    expect(segs[19]?.zone).toBe('r');
  });

  it('marks exactly the highest lit segment as the flickering tip', () => {
    const segs = segmentStates(0.5, 16);
    expect(segs.findIndex((s) => s.tip)).toBe(7);
    expect(segs.filter((s) => s.tip)).toHaveLength(1);
  });

  it('value 0 lights nothing and has no tip', () => {
    const segs = segmentStates(0, 16);
    expect(segs.some((s) => s.lit)).toBe(false);
    expect(segs.some((s) => s.tip)).toBe(false);
  });

  it('clamps out-of-range values', () => {
    expect(segmentStates(1.7, 8).filter((s) => s.lit)).toHaveLength(8);
    expect(segmentStates(-1, 8).some((s) => s.lit)).toBe(false);
  });
});

describe('ballisticsStep (IEC 60268-17: ~300ms attack / ~300ms release)', () => {
  it('moves toward the target without overshooting it in one big step', () => {
    const next = ballisticsStep(0, 1, 150);
    expect(next).toBeGreaterThan(0.3);
    expect(next).toBeLessThan(1);
  });

  it('reaches ~99% of target within 300ms of accumulated steps', () => {
    let v = 0;
    for (let t = 0; t < 300; t += 16) v = ballisticsStep(v, 1, 16);
    expect(v).toBeGreaterThan(0.95);
  });

  it('releases symmetrically', () => {
    let v = 1;
    for (let t = 0; t < 300; t += 16) v = ballisticsStep(v, 0, 16);
    expect(v).toBeLessThan(0.05);
  });

  it('is stable at the target', () => {
    expect(ballisticsStep(0.5, 0.5, 16)).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- vu-meter` — Expected: FAIL.

- [ ] **Step 3: Implement**

`vu-meter.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export type VuZone = 'g' | 'a' | 'r';

export interface VuSegment {
  lit: boolean;
  zone: VuZone;
  tip: boolean;
}

const GREEN_CEIL = 0.6;
const AMBER_CEIL = 0.85;
/** Time constant ≈ 65ms ⇒ ~99% of a step change indicated within 300ms (IEC-style integration). */
const TAU_MS = 65;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Pure segment computation — exported for tests and for static renders. */
export function segmentStates(value: number, count: number): VuSegment[] {
  const litCount = Math.round(clamp01(value) * count);
  return Array.from({ length: count }, (_, i) => {
    const position = (i + 1) / count;
    const zone: VuZone = position <= GREEN_CEIL ? 'g' : position <= AMBER_CEIL ? 'a' : 'r';
    return { lit: i < litCount, zone, tip: litCount > 0 && i === litCount - 1 };
  });
}

/** One integration step of the meter needle toward `target` over `dtMs`. */
export function ballisticsStep(current: number, target: number, dtMs: number): number {
  if (current === target) return current;
  const alpha = 1 - Math.exp(-dtMs / TAU_MS);
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < 0.001 ? target : next;
}

function useVuBallistics(target: number): number {
  const [displayed, setDisplayed] = useState(() => clamp01(target));
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;

  useEffect(() => {
    const goal = clamp01(target);
    if (displayedRef.current === goal) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = ballisticsStep(displayedRef.current, goal, dt);
      setDisplayed(next);
      if (next !== goal) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return displayed;
}

interface VuMeterProps {
  /**
   * The REAL signal, normalized 0–1. VU meters are functional-only
   * (DESIGN.md §VU Discipline) — never mount one without a live data source.
   */
  value: number;
  segments?: number;
  orientation?: 'horizontal' | 'vertical';
  /** Accessible name for the meter, e.g. "Token throughput" */
  label: string;
  className?: string;
}

export function VuMeter({
  value,
  segments = 16,
  orientation = 'horizontal',
  label,
  className,
}: VuMeterProps) {
  const displayed = useVuBallistics(value);
  const segs = segmentStates(displayed, segments);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(value) * 100)}
      className={cn(
        'flex gap-[2px]',
        orientation === 'horizontal' ? 'h-[14px] items-stretch' : 'h-[72px] w-[14px] flex-col-reverse',
        className,
      )}
    >
      {segs.map((seg, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by definition
          key={i}
          className={cn(
            'vu-seg min-h-[3px] min-w-[4px] flex-1',
            seg.lit && seg.zone === 'g' && 'vu-seg-g',
            seg.lit && seg.zone === 'a' && 'vu-seg-a',
            seg.lit && seg.zone === 'r' && 'vu-seg-r',
            seg.tip && 'animate-vu-tip',
          )}
        />
      ))}
    </div>
  );
}
```

`vu-meter.test.tsx` (render layer):
```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VuMeter } from './vu-meter';

describe('VuMeter render', () => {
  it('renders an accessible meter with the requested segment count', () => {
    const { container, getByRole } = render(
      <VuMeter value={0.5} segments={12} label="Token throughput" />,
    );
    const meter = getByRole('meter', { name: 'Token throughput' });
    expect(meter).toHaveAttribute('aria-valuenow', '50');
    expect(container.querySelectorAll('.vu-seg')).toHaveLength(12);
  });

  it('vertical orientation flips the axis', () => {
    const { getByRole } = render(
      <VuMeter value={0.2} orientation="vertical" label="VRAM" />,
    );
    expect(getByRole('meter').className).toContain('flex-col-reverse');
  });
});
```

- [ ] **Step 4: Export, test, commit**

Add `export { VuMeter, segmentStates, ballisticsStep } from './vu-meter';` to `index.ts`.
```bash
pnpm test -- vu-meter     # Expected: PASS (11 tests)
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(sweep): VuMeter — functional segment cascade with IEC-style ballistics"
```

---

### Task 11: AnnunciatorRail + ShiftToggle

**Files:**
- Create: `apps/desktop/src/renderer/src/components/console/annunciator-rail.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/annunciator-rail.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/shift-toggle.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/console/shift-toggle.tsx`
- Modify: `apps/desktop/src/renderer/src/components/console/index.ts`

- [ ] **Step 1: Write the failing AnnunciatorRail tests**

`annunciator-rail.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnnunciatorRail, type AnnunciatorTileSpec } from './annunciator-rail';

const tiles: AnnunciatorTileSpec[] = [
  { id: 'sys', label: 'SYS', tone: 'go' },
  { id: 'budg', label: 'BUDG', tone: 'warn', alert: true },
  { id: 'net', label: 'NET', tone: 'off' },
];

describe('AnnunciatorRail', () => {
  it('renders every tile in order on a dark strip', () => {
    const { container } = render(<AnnunciatorRail tiles={tiles} />);
    const labels = Array.from(container.querySelectorAll('[class*="lamp"]')).map(
      (n) => n.textContent,
    );
    expect(labels.join(' ')).toContain('SYS');
    expect(labels.join(' ')).toContain('BUDG');
    expect(labels.join(' ')).toContain('NET');
  });

  it('lit tiles teleport: clicking a lit non-alert tile fires onNavigate(id)', async () => {
    const onNavigate = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: /SYS/ }));
    expect(onNavigate).toHaveBeenCalledWith('sys');
  });

  it('unlit tiles do not navigate', () => {
    const onNavigate = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} />);
    expect(screen.queryByRole('button', { name: /^NET/ })).toBeNull();
  });

  it('alert tiles acknowledge first, then navigate on second click', async () => {
    const onNavigate = vi.fn();
    const onAcknowledge = vi.fn();
    render(<AnnunciatorRail tiles={tiles} onNavigate={onNavigate} onAcknowledge={onAcknowledge} />);
    const budg = screen.getByRole('button', { name: /BUDG/ });
    await userEvent.click(budg);
    expect(onAcknowledge).toHaveBeenCalledWith('budg');
    expect(onNavigate).not.toHaveBeenCalled();
    // parent marks it acknowledged (controlled component)
    render(
      <AnnunciatorRail
        tiles={[{ ...tiles[1]!, acknowledged: true }]}
        onNavigate={onNavigate}
        onAcknowledge={onAcknowledge}
      />,
    );
    await userEvent.click(screen.getAllByRole('button', { name: /BUDG/ })[1]!);
    expect(onNavigate).toHaveBeenCalledWith('budg');
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `pnpm test -- annunciator` — Expected: FAIL.

`annunciator-rail.tsx`:
```tsx
import { cn } from '@/lib/utils';

import { LampTile, type LampTone } from './lamp-tile';

export interface AnnunciatorTileSpec {
  /** Source view / system id — passed to onNavigate (teleport target) */
  id: string;
  /** Stencil word: SYS / ORG / TOKN / BUDG / GGUF / QUE / NET / MTG … */
  label: string;
  tone: LampTone;
  /** Unacknowledged warning — blinks until acknowledged (dual-form rule) */
  alert?: boolean;
  acknowledged?: boolean;
}

interface AnnunciatorRailProps {
  tiles: AnnunciatorTileSpec[];
  /** Teleport: fired with the tile id when a LIT, non-blinking tile is clicked */
  onNavigate?: (id: string) => void;
  /** Master-caution ack: fired with the tile id on first click of a blinking tile */
  onAcknowledge?: (id: string) => void;
  className?: string;
}

/**
 * The signature element (DESIGN.md): a persistent strip of lamp tiles.
 * Strike ignition on light-up, 1Hz blink until click-to-ack, lit tiles
 * teleport to their source view. The strip itself is a dark display
 * surface in BOTH shifts.
 */
export function AnnunciatorRail({
  tiles,
  onNavigate,
  onAcknowledge,
  className,
}: AnnunciatorRailProps) {
  return (
    <div
      role="status"
      aria-label="Annunciator rail"
      className={cn(
        'flex flex-wrap items-center gap-[6px] border-b border-black/80 bg-[#0C0C0C] px-4 py-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]',
        className,
      )}
    >
      {tiles.map((tile) => {
        const blinking = Boolean(tile.alert && !tile.acknowledged);
        const lit = tile.tone !== 'off';
        if (blinking) {
          return (
            <LampTile
              key={tile.id}
              label={tile.label}
              tone={tile.tone}
              small
              alert
              acknowledged={false}
              onAcknowledge={() => onAcknowledge?.(tile.id)}
            />
          );
        }
        if (lit && onNavigate) {
          return (
            <button
              key={tile.id}
              type="button"
              aria-label={`${tile.label} — open source view`}
              className="appearance-none border-0 bg-transparent p-0"
              onClick={() => onNavigate(tile.id)}
            >
              <LampTile label={tile.label} tone={tile.tone} small className="cursor-pointer" />
            </button>
          );
        }
        return <LampTile key={tile.id} label={tile.label} tone={tile.tone} small />;
      })}
    </div>
  );
}
```
Run: `pnpm test -- annunciator` — Expected: PASS (4 tests). (If the nested-button lint rule flags LampTile-inside-button for alert tiles: alert tiles render LampTile directly, which is itself the button — no nesting. The teleport wrapper only wraps non-alert `span` lamps.)

- [ ] **Step 3: ShiftToggle — failing tests, then implement**

`shift-toggle.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShiftToggle } from './shift-toggle';

describe('ShiftToggle', () => {
  it('shows the current shift and the switch target', () => {
    render(<ShiftToggle shift="night" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /day shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('day shift state', () => {
    render(<ShiftToggle shift="day" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /night ops/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onToggle with the opposite shift', async () => {
    const onToggle = vi.fn();
    render(<ShiftToggle shift="night" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('day');
  });
});
```

`shift-toggle.tsx`:
```tsx
import { cn } from '@/lib/utils';

export type Shift = 'night' | 'day';

interface ShiftToggleProps {
  shift: Shift;
  /** Wire to the existing company-level theme setting ('dark' ⇄ 'light'). */
  onToggle: (next: Shift) => void;
  className?: string;
}

/**
 * Night Ops / Day Shift switch. Presentation-only: persistence stays in the
 * existing company theme setting (mounted into chrome in sweep Phase 2).
 */
export function ShiftToggle({ shift, onToggle, className }: ShiftToggleProps) {
  const next: Shift = shift === 'night' ? 'day' : 'night';
  return (
    <button
      type="button"
      aria-pressed={shift === 'day'}
      onClick={() => onToggle(next)}
      className={cn(
        'cap inline-flex items-center gap-2 px-3.5 py-[7px] font-display text-[10.5px] font-[750] uppercase tracking-[0.1em] [font-variation-settings:"wdth"_110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] rounded-full bg-led-hold shadow-[0_0_7px_var(--led-hold)]"
      />
      {shift === 'night' ? 'NIGHT OPS — SWITCH TO DAY SHIFT' : 'DAY SHIFT — SWITCH TO NIGHT OPS'}
    </button>
  );
}
```

- [ ] **Step 4: Export, full gates, commit**

Add to `index.ts`:
```ts
export { AnnunciatorRail, type AnnunciatorTileSpec } from './annunciator-rail';
export { ShiftToggle, type Shift } from './shift-toggle';
```
```bash
pnpm test               # Expected: full suite PASS
pnpm typecheck && pnpm lint && pnpm lint:eslint
git add -A
git commit -m "feat(sweep): AnnunciatorRail (strike/ack/teleport) + ShiftToggle"
```

---

### Task 12: Phase gate — full CI parity, dual-shift screenshot pack, CHANGELOG

- [ ] **Step 1: Full local CI parity**

```bash
pnpm typecheck && pnpm lint && pnpm lint:eslint && pnpm test
pnpm -F @team-x/desktop test:e2e
pnpm audit:claims
```
Expected: ALL PASS. E2E must pass **unmodified** — if an E2E spec fails, the foundation broke behavior somewhere; investigate and fix the foundation, never the spec.

- [ ] **Step 2: Dual-shift screenshot pack**

Start `pnpm dev`. Using the gstack browse binary (or the `/qa-only` flow) against the dev server, capture **Night Ops AND Day Shift** (toggle the workspace theme setting between dark/light) screenshots of: Dashboard (Mission Control), Settings, Tickets, Autonomy. Eight shots minimum, saved to `~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/sweep-phase-01/`.
Audit each against DESIGN.md's anti-slop list (especially: no auto-inverted look on Day Shift; inputs stay dark wells with light text in BOTH shifts; armed red reads as authority, not error). Fix any drift found, re-shoot, then present the pack to Rocky for eyeball sign-off.

- [ ] **Step 3: CHANGELOG entry**

Add under `## [Unreleased]` in `CHANGELOG.md` (create the section if absent), matching the existing entry style:
```markdown
### Changed
- **Aesthetic sweep Phase 1 — Command Console foundation.** Dual-shift Carbon Pro
  token layer (Night Ops + Day Shift silver, displays-stay-dark), font stack swap
  (Archivo / Public Sans / Departure Mono / Iosevka — Inter and JetBrains Mono
  removed), all 19 UI primitives restyled as machined hardware (APIs unchanged),
  new console primitive library (Faceplate, LampTile, VuMeter, AnnunciatorRail,
  LCD wells, ShiftToggle). Visual-only: no behavior changes. See `DESIGN.md`.
```

- [ ] **Step 4: Final commit + push + PR**

```bash
git add -A
git commit -m "chore(sweep): Phase 1 CHANGELOG entry + dual-shift screenshot evidence"
git push -u origin feat/v3.4.0-sweep-phase-01-foundation
```
Open the PR (`gh pr create`) titled `feat(v3.4.0): Aesthetic Sweep Phase 1 — Command Console foundation`, body listing: scope, the visual-only guarantee, screenshot pack location, and the CR-7 gate checklist. The PR then walks the wall: CI → `/review` → Codex (Rocky triggers) → Rocky sign-off.

---

## Self-review record

- **Spec coverage:** §4.1 tokens (Task 2), §4.2 displays-stay-dark (Tasks 2/5 — token group + no-`.dark`-variant rule), §4.3 fonts incl. fallback plan (Task 1 — vendored Departure Mono since no Fontsource package exists), §4.4 shadcn frozen-API restyle (Tasks 6–7), §4.5 console library + TDD (Tasks 8–11), §4.6 theme mechanics untouched (`dark`/`light` mapping preserved; ShiftToggle presentational), §4.7 legacy retint (Task 4), §6 gate (Task 12). ✓
- **Placeholder scan:** none — every step carries code or exact substitutions. The only conditional is the Archivo `/wdth.css` packaging check (Step 1.4) and the recipe-collision grep (Step 5.1), both with explicit resolutions. ✓
- **Type consistency:** `LampTone` defined in Task 9, consumed in Task 11; `segmentStates`/`ballisticsStep` named identically in test and implementation; `Shift` type local to shift-toggle. ✓
