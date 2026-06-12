# Design System — Team-X

**Aesthetic direction:** Command Console (GO/NO-GO · Carbon Pro chassis)
**Created:** 2026-06-10 via `/design-consultation`
**Status:** Canonical · governs all UI work in this project (app **and** the future Team-X website — see §Website Mirror Mandate)
**Family DNA:** Shares the Carbon Pro chassis language with Vision Studio·X (`Vision-Studio-X-website\DESIGN.md`) — four-layer raised-hardware depth system, machined radii, mechanical motion envelopes, hex socket bolts, brushed-aluminum stripes, anti-slop discipline.
**Diverges on:** Accent (**armed red `#AA2024`**, not chrome), typography (Archivo / Public Sans / Departure Mono / Iosevka, not IBM Plex), metaphor (mission-control command desk, not creative deck), theme policy (**dual-shift**: Night Ops + Day Shift, not dark-only), status vocabulary (stencil word-lamps, annunciator rail).

> **The family story:** Strategia products share one chassis language, like Pioneer's professional division. Vision Studio is the CDJ — chrome accent, creative deck. **Team-X is the DJM — the command desk — armed red, mission control.** Same carbon, same bolts, same depth physics, same VU discipline; different faceplate identity.

---

## Product Context

- **What this is:** Team-X — "Run an AI company. Not a prompt." Open-source (MIT), privacy-first, local-first Electron desktop app for running AI-agent organizations: hire from 57 curated roles, build a real org chart, set goals, file tickets, schedule work, watch agents work in live token streams, call all-hands meetings.
- **Who it's for:** Builders/operators commanding an organization — closer to a CEO at a command console than a developer in an IDE.
- **Space/industry:** AI-agent orchestration desktops. Peers: Linear (quality ceiling), Warp, Cursor, LM Studio, Cognition/Devin. Category converges on either the lavender/indigo "AI uniform" or warm-paper editorial escapes. Everyone *claims* "mission control"; nobody ships it visually.
- **Project type:** Electron desktop monorepo (`apps/desktop` + `packages/*`), React + TypeScript renderer. A marketing website will follow and must mirror this system exactly.

**Memorable thing (every decision serves this):** *"Mission control — serious ops-room software where you command a real company."*

**The eureka this system is built on:** Agent-tool brands avoid red because in dev-tool semantics red = failure. Team-X is not a dev tool — it is a command room, and in ops-room visual culture (trading terminals, broadcast master control, mission control) red/amber IS the authority palette. Strategia red `#AA2024` is a structural differentiation asset in a category converging on lavender. **Red means LIVE, not error.**

---

## Aesthetic Direction — Command Console

**Visual thesis:** Pioneer DJM-Nexus engineering artistry applied to organizational command: brushed black aluminum chassis, purpose-built LED placement, phosphor LCD wells, machined caps and hex socket bolts — solid state in function, precision in form. Equipment that feels *procured, not downloaded*. Apollo flight console discipline (status as stencil words, density as respect for the operator) on Carbon Pro materials.

**Decoration level:** Brutalist-maximalist within hardware discipline. Every section is a faceplate; every faceplate is milled aluminum on the carbon chassis. **Nothing is purely decorative — every LED earns its placement** (see §VU Discipline).

**Mood:** The app is *operated*, not used. The first viewport is the poster, and the poster is your company operating live.

**Reference set (vocabulary, not literal copies):**
- **Pioneer DJ DJM-900NXS2 / CDJ-3000** — brushed black chassis, hints of polished bits, premium bezels, purposeful LED placement, segmented LCDs
- **Apollo-era flight consoles / broadcast master control** — annunciator panels, stencil status words, master-caution acknowledge, ON AIR light
- **Universal Audio Apollo** — LED state language, silver-faceplate hardware (Day Shift reference)
- **Bloomberg Terminal** — data density as authority

**Three deliberate departures from category norms:**
1. **Red = LIVE, not error.** Steady `#AA2024` means agents on the clock, money burning — the ON AIR light of your company. Faults are distinguished by **form, not hue**: warnings BLINK at 1Hz until acknowledged; live states burn steady. The only unclaimed color in the category, and it is already the brand.
2. **Stencil words, not icons, for status.** All state renders as 2–5 letter codes in Archivo caps on lamp tiles: `GO` `HOLD` `NO-GO` `STBY` `EXEC` `ON AIR`. Icons survive for navigation only. Unambiguous across 57 roles; every screenshot markets itself.
3. **Functional hardware density.** VU meters, LCD wells, lamp arrays — on every screen, all data-bound. The category does minimal-with-one-accent; Team-X does instrument-grade density where every element works.

**Signature element — the Annunciator Rail:** a persistent strip of lamp-tiles (per system/agent: `SYS` `ORG` `TOKN` `BUDG` `GGUF` `QUE` `NET` `MTG`) across the top of every view.
- **The strike:** when a lamp goes live it IGNITES — 80ms attack with overshoot bloom, settles steady (the LED-ramp envelope). Reused everywhere a state goes live.
- **Master-caution acknowledge:** a blinking warning tile blinks until clicked, then stays lit until resolved. Acknowledgment is a physical ritual, not a dismissed toast.
- **Tiles are teleports:** clicking a lit tile jumps to the source view.

---

## Four-Layer Raised-Hardware Depth System

Inherited structurally from Vision-X (`Vision-Studio-X-website\DESIGN.md §Raised Hardware Depth System`) — same physics, Team-X tokens. **Depth comes from layered shadows, edge-light strips, and bevels — never flat drop shadows.** Every surface declares its layer; mixing raised and recessed shadows on one element is forbidden.

| Layer | What it is | Team-X examples |
|-------|------------|-----------------|
| **0 · Chassis** | Page/window background, flat | `--carbon-950` canvas |
| **1 · Raised faceplate** | Major section panels with stripe + hex bolts | Settings sections, dashboard panels, modals |
| **2 · Recessed well** | Carved into the faceplate; **always dark in both themes** | LCD windows, token-stream viewports, VU windows, form inputs, kanban wells |
| **3 · Raised control** | Sits on faceplate or well | Buttons, lamp tiles, agent cards, tickets, switch caps |

### Night Ops recipes (canonical)

```css
/* Layer 1 — raised faceplate (brushed black aluminum) */
.faceplate{
  border-radius:2px;
  background:
    radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255,255,255,0.04) 0%, transparent 60%),
    linear-gradient(180deg,#1C1C1C 0%,#151515 35%,#101010 70%,#0C0C0C 100%);
  border:1px solid rgba(255,255,255,0.06);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.7),
    inset 1px 0 0 rgba(255,255,255,0.025), inset -1px 0 0 rgba(0,0,0,0.4),
    0 1px 0 rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.7),
    0 12px 28px rgba(0,0,0,0.55), 0 40px 80px rgba(0,0,0,0.4);
}
/* + ::before edge-light strip (top, inset 24px) and ::after top-right key light
   — copy from the approved preview or Vision-X DESIGN.md; identical recipe. */

/* Layer 2 — recessed well (always dark, both themes) */
.well{
  border-radius:2px;
  background:linear-gradient(180deg,#080808 0%,#0a0a0a 100%);
  border:1px solid rgba(0,0,0,0.7);
  box-shadow:
    inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.03),
    inset 1px 0 2px rgba(0,0,0,0.5), inset -1px 0 2px rgba(0,0,0,0.5);
}

/* Layer 3 — raised control */
.control{
  border-radius:4px;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 60%),
    linear-gradient(180deg,#1F1F1F 0%,#171717 60%,#121212 100%);
  border:1px solid rgba(255,255,255,0.04);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.6),
    0 1px 2px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.5);
}

/* Brushed-aluminum stripe header (36px, top of every faceplate)
   Grain is DIRECTIONAL machine brushing — never fractal noise. */
.stripe{
  height:36px;padding:0 44px; /* clears 20px corner bolts */
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, rgba(255,255,255,0.012) 1px 2px, rgba(0,0,0,0.06) 2px 3px),
    linear-gradient(180deg,#2A2A2A 0%,#1F1F1F 55%,#181818 100%);
  border-bottom:1px solid rgba(0,0,0,0.8);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.10);
}

/* Hex socket cap bolts — full 3-layer recipe (outer hex + Allen socket +
   countersunk halo) inherited verbatim from Vision-X DESIGN.md.
   20px standard, 4 per faceplate, inset ~10px from corners. */
```

### Day Shift recipes (silver anodized)

Same geometry and shadow structure; surfaces re-skin to brushed natural aluminum:

```css
[data-theme="day"] .faceplate{
  background:
    radial-gradient(ellipse 80% 60% at 30% -10%, rgba(255,255,255,0.55) 0%, transparent 60%),
    linear-gradient(180deg,#F5F5F3 0%,#EAEAE7 35%,#E0E0DC 70%,#D8D8D4 100%);
  border:1px solid rgba(0,0,0,0.12);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(0,0,0,0.16),
    0 1px 0 rgba(0,0,0,0.20), 0 2px 4px rgba(0,0,0,0.16),
    0 12px 28px rgba(0,0,0,0.14), 0 40px 80px rgba(0,0,0,0.10);
}
/* Stripe → #F0F0ED→#D5D5D1 with dark grain lines; controls → #F7F7F5→#DEDEDA;
   hex bolts → silver radial (#FFFFFF→#44443F) with dark socket.
   Full set of day re-skins lives in the approved preview file. */
```

### The displays-stay-dark rule (canonical, both themes)

**LCD wells, token-stream viewports, VU meter windows, and lamp-tile caps remain void-black in BOTH shifts** — exactly like silver hardware keeps black displays and black buttons. Recessed wells (Layer 2) never invert. This keeps phosphor glow and lamp legibility identical across themes and is what makes Day Shift read as real silver gear rather than an auto-inverted dark theme.

---

## Typography — four faces, four jobs, zero overlap

All fonts SIL OFL — **bundle locally via `@fontsource/*` packages in the Electron app** (local-first product; no runtime CDN font loads). The website may use Google Fonts/Fontsource CDN.

| Role | Family | Spec | Use |
|------|--------|------|-----|
| **Display / Placards** | **Archivo** (variable) | `wdth` 110–125, weight 750–800, ALL-CAPS, letter-spacing .05–.1em | View titles, placard labels, lamp codes, wordmark. Stenciled equipment lettering. |
| **Body / UI** | **Public Sans** | 300–700, 13–14px UI, 1.5–1.6 line-height | All prose, UI copy, form values. Government-grade workhorse. |
| **Telemetry** | **Departure Mono** | 10–12px (pixel-grid: use exact sizes) | **Any number that updates live**: token counts, costs, timestamps, serials, LCD content, `kbd`. |
| **Code / Streams** | **Iosevka** (Term) | 10–12px | LLM token streams, code, logs. ~20% more columns than JetBrains Mono — density is a feature. |

**Rules:**
- If a number updates live, it wears Departure Mono inside an LCD well. If a human reads it as prose, it's Public Sans. Display sizes are always Archivo caps.
- **NEVER use** Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat, Poppins, Space Grotesk, system-ui, or `-apple-system` as primary fonts.
- Migration note: JetBrains Mono (current incumbent) is superseded by Iosevka (streams) + Departure Mono (telemetry) during the aesthetic sweep.

**Scale:** hero/display 48–108px (Archivo, clamp), section titles 21–22px (Archivo caps), h-levels via Public Sans 600 at 32/24/18, body 14, body-sm 12.5, placard/ui-label 10.5–11 (Archivo 700 caps or Departure Mono UC), telemetry 10–26 (Departure Mono).

---

## Color

**Chromatic energy lives entirely in the LEDs; the chassis stays neutral so the armed red commands the room.**

### Carbon ramp (Night Ops surfaces — family chassis)

| Token | Hex | Use |
|-------|-----|-----|
| `--void` | `#000000` | LCD wells, deepest recess (both themes) |
| `--carbon-950` | `#050505` | Chassis / page canvas |
| `--carbon-900` | `#0D0D0D` | View interiors (cockpit floor, kanban) |
| `--carbon-850/-800/-750` | `#101010 / #141414 / #1A1A1A` | Panel bases, elevated surfaces |
| `--carbon-700` | `#262626` | Dividers |
| faceplate gradient | `#1C1C1C → #0C0C0C` | Brushed black aluminum (Layer 1) |

### Text — silver ramp

| Token | Night | Day | Use |
|-------|-------|-----|-----|
| `--platinum` | `#F5F5F5` | `#1A1A1A` | Primary text (engraved enamel) |
| `--silver` | `#B3B3B3` | `#44443F` | Secondary text |
| `--silver-bright` | `#D1D1D1` | `#2E2E2C` | Emphasis |
| `--silver-mute` | `#888888` | `#62625E` | Tertiary, silkscreen labels |
| `--graphite` | `#5A5A5A` | `#96968F` | Disabled, unlit lamp text |

### Team-X brand — ARMED RED (the identity)

| Token | Hex | Use |
|-------|-----|-----|
| `--armed` | `#AA2024` | Strategia red. Machined-cap gradient `#C8333A → #AA2024 55% → #7F171A` for consequential command buttons, ON AIR bars, active nav. **Steady = LIVE / command authority.** |
| `--armed-lit` | `#E0252B` | Backlit wordmark X, hot readouts, glow text |
| `--armed-deep` | `#7F171A` | Cap borders, pressed states |
| `--armed-glow / -soft` | `rgba(224,37,43,.22) / rgba(170,32,36,.12)` | Glow rings, selection tints |

### LED semantics (lamp vocabulary — identical both themes)

| Token | Hex | Meaning | Form |
|-------|-----|---------|------|
| `--led-go` | `#41E25E` | GO / running / healthy / LCD phosphor | Steady |
| `--led-hold` | `#FFB000` | HOLD / caution / pending | Steady |
| `--led-warn` | `#FF4438` | Unacknowledged warning | **Blinking 1Hz only** — never steady |
| `--led-scope` | `#58C4BC` | Informational / EXEC — the rarest color | Steady |
| `--chrome` | `#E6E6E6` | The polished bits: focus rings (night), rare chrome cap (e.g. Download) — family accent, used sparingly | — |

Render LEDs with glow (`box-shadow`/`text-shadow: 0 0 8px currentColor`-class). Day Shift darkens LED *text* colors where they sit on silver surfaces (`#177A3D` green, `#996300` amber, `#C81E13` red, `#256F69` cyan) — LED dots and anything inside dark wells keep night values.

**The dual-form red rule (non-negotiable):** steady red = LIVE/armed/command; blinking red = a question that demands an answer (click to acknowledge → steady until resolved). Never use blink for anything else; never use steady `--led-warn` for errors — errors blink, then hold.

### Hairlines

`--hairline: rgba(255,255,255,0.08)` (night) / `rgba(0,0,0,0.10)` (day) · strong variants at 2×.

---

## Spacing

Base-4, Fibonacci-flavored (family scale — compatible with the 8-point grid; all stops are 4px multiples). Mechanical even spacing is itself an AI-slop signal; broken cadence reads as composed.

```css
--sp-1: 4px;   /* micro */     --sp-2: 8px;   /* compact */
--sp-3: 12px;  /* default */   --sp-4: 20px;  /* comfortable */
--sp-5: 32px;  /* panel */     --sp-6: 52px;  /* section */
--sp-7: 84px;  /* canvas */
```

**Density: professional compact.** Density is respect for the operator.

## Border Radius — machined

```css
--r-card: 2px;      /* faceplates, panels, wells — machined plate */
--r-control: 4px;   /* buttons, lamps, inputs, cards — mechanical cap */
--r-overlay: 8px;   /* modals/dropdowns — the only soft surface */
--r-pill: 9999px;   /* LED dots, avatars */
```

NEVER uniform radius across surface types — the varied hierarchy is itself anti-slop signal.

---

## Layout — the console composition

The first viewport is a poster, and the poster is the company operating live. No welcome copy.

- **Top command bar** (edge-to-edge): wordmark, active objective (`OBJ-NN · name`), burn rate `$/HR`, runtime status, `⌘K` hint
- **Annunciator rail** (below command bar, dark strip in both themes): system/agent lamp tiles + strike/ack/teleport behaviors
- **Left nav rail** (64px): Archivo-caps stencil items; active = armed-red bordered tile
- **Center stage**: the selected view — Floor/Org by default ("I command people and work," not widgets)
- **Right telemetry rail** (~250px): phosphor LCD readouts + functional VU meters + blocked list
- **Bottom status strip**: GGUF/model health, VRAM, TOK/MIN, $/HR, LOCAL-FIRST state

**Faceplate composition (every major section):** raised faceplate → 4 corner hex bolts → brushed stripe header with Departure-Mono kicker `MOD · NAME · NN` + optional serial `S/N · TX-XXXX-NNNN` + optional lamp → body → recessed wells for data → raised controls on wells.

**Live state:** every view has at least one always-animated truthful element (VU tip flicker, pulsing ON AIR LED, master VU strip).

---

## Component Vocabulary

| Primitive | Spec |
|---|---|
| **Lamp tile** | Raised control cap + Archivo stencil word (`GO/HOLD/NO-GO/STBY/EXEC/ON AIR`), LED-colored text+tint+glow. 26px standard / 19px small. Always dark-capped (both themes). |
| **Annunciator rail** | Lamp strip; strike ignition; 1Hz blink until click-to-ack; lit tiles teleport to source view. |
| **VU meter** | Segment cascade (green→amber→red zones), horizontal or vertical, **data-bound only** (tok/min, VRAM, per-agent activity), flickering tip on the boundary segment, IEC ballistics. Unlit segments stay dark in both themes. |
| **LCD well** | Recessed void-black window + Departure Mono phosphor text with glow. Green default; amber/red variants for caution/hot values. |
| **Machined caps (buttons)** | Raised control + specular top highlight. Armed-red cap = consequential commands only. Chrome cap = the single polished CTA (inverts to black-gloss in Day Shift). Press: 1px cap travel, 80ms. |
| **Console plate forms** | Labels in Departure Mono UC; inputs/selects as recessed dark wells (light text, both themes); error = `--led-warn` border + NO-GO hint. |
| **Annunciator alerts** | Dark module rows (both themes) with LED dot + Archivo title + body; GO/HOLD/WARN(blink)/SCOPE variants. |
| **Agent card** | Raised control: Archivo name + lamp + role + recessed phosphor stream window (Iosevka) + TOK readout + mini-VU + cost. |
| **Tickets/kanban** | Tickets as raised controls with `TKT-NNNN` (Departure Mono) + lamp; columns on `--carbon-900` interior. |
| **Tier/selection chips** | Raised caps; selected = LED-tinted (green for Local). Supersedes `.brand-selected` family during the sweep — selection variants map: green=local/safe, scope-cyan=informational, amber=caution, armed-red=brand/command. |
| **Bat-lever switch** | Recessed track + machined cap thumb; armed-red when on. |

**Status badge migration:** the legacy LED+label badges (`globals.css` status-badge family) are superseded by **lamp tiles** during the aesthetic sweep. Until a screen is swept, existing primitives remain in force — do not mix the two families on one swept screen.

---

## Motion — mechanical envelopes

Inherited from the family language. No floating blobs, no gradient drift, no decorative shimmer.

| Event | Behavior | Spec |
|---|---|---|
| **LED ramp ("the strike")** | State goes live: ignition with overshoot bloom, settles at 85% sustained | 80ms attack / 240ms decay · `--ease-led: cubic-bezier(.2,.7,.3,1)` |
| **Warning blink** | 1Hz step until acknowledged; then steady until resolved | `1000ms step-end` · ack = physical ritual |
| **VU ballistics** | 300ms attack to indicated peak + analog overshoot, 300ms release | IEC 60268-17 · `--ease-vu: cubic-bezier(.2,.85,.15,1)` |
| **Button press** | 1px cap travel + brightness lift on hover | 80ms click · `--ease-snap: cubic-bezier(.32,.72,0,1)` |
| **View transitions** | Functional cross-fade, no choreography | 240ms glide |
| **Reduced motion** | All animation suppressed; states legible by color + form | `prefers-reduced-motion` honored, collapses to 0ms |

---

## Theme Policy — dual-shift

- **Night Ops** (default): brushed black aluminum on AMOLED carbon.
- **Day Shift**: silver anodized faceplates — a **deliberately designed variant** (approved 2026-06-10), never an auto-invert.
- **Displays stay dark in both shifts** (see the canonical rule above).
- Armed red, LED meanings, geometry, depth structure, spacing, type: identical across shifts.

---

## Website Mirror Mandate

The future Team-X marketing website **mirrors this system exactly** — same tokens, same four-layer recipes, same lamp/LCD/VU vocabulary, same motion envelopes — the way `Vision-Studio-X-website` mirrors the Vision Studio app. The mirror is structural (shared recipes), not imitative. When the website is built: copy the recipes from this file and the approved preview; do not redesign.

**Reference preview (the approved visual source of truth):**
`~/.gstack/projects/Git-Rocky-Stack-Team-X/designs/design-system-20260609/team-x-design-preview.html` (dual-shift toggle, all specimens + 3 mockups)

---

## Anti-Slop Validation

Inherited family rules + Team-X specifics. On every UI change, re-validate:

- ❌ NO Inter/Roboto/Arial/Helvetica/Open Sans/Lato/Montserrat/Poppins/Space Grotesk/system-ui as primary fonts
- ❌ NO purple-violet gradients; NO indigo `#6366f1`; NO lavender "AI uniform"
- ❌ NO 3-column icon-circle feature grids; NO centered-everything-uniform-spacing
- ❌ NO uniform border radius; NO flat drop-shadow elevation (declare a depth layer)
- ❌ NO fractal-noise/grain textures — brushed grain is directional or absent
- ❌ NO icons for status — status is a stencil word in a lamp tile
- ❌ NO steady red for errors / NO blinking red for live states (the dual-form rule)
- ❌ NO purely decorative LEDs, meters, or lamps — every element is data-bound or live-simulated truthfully
- ❌ NO auto-inverted light theme — Day Shift uses the designed silver recipes; displays stay dark
- ❌ NO prompt box as the primary visual metaphor — the company is the center, chat is a tool

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-10 | Initial design system created — Command Console direction | `/design-consultation` full run: competitive research (Linear/Warp/Cursor/LM Studio/Cognition + AI-slop convergence evidence), outside voices (Codex + independent Claude subagent — both independently converged on red-as-command-authority), proposal with SAFE/RISK split, two preview iterations, Rocky approval. |
| 2026-06-10 | Red = LIVE, not error (dual-form rule) | The eureka: ops-room visual culture treats red/amber as authority; the category avoids red. `#AA2024` is existing brand equity recast as the ON AIR light. Both outside voices arrived at this independently. |
| 2026-06-10 | Carbon Pro chassis adopted from Vision-X (family DNA) | Rocky's direction: Pioneer DJM-Nexus material language — brushed black aluminum, premium bezels, purposeful LEDs, hex bolts. Vision-X had already codified the four-layer depth recipes; adopting them makes the future website mirror structural. REV 01's fractal-grain + olive-grey carbon was rejected ("drywall") and replaced. |
| 2026-06-10 | Typography locked: Archivo / Public Sans / Departure Mono / Iosevka | Approved at REV 01 ("chef's kiss") and carried unchanged into REV 02. All OFL; bundle via Fontsource in the app (local-first, no CDN). Distinct from Vision-X's IBM Plex — each family member keeps its own type voice. |
| 2026-06-10 | Stencil word-status + annunciator rail (strike / ack / teleport) | Status as words is unambiguous across 57 roles, screenshots market themselves, and the ack ritual makes "mission control" load-bearing instead of cosplay. |
| 2026-06-10 | Functional VU discipline | Rocky: "VU meter LEDs that actually serve and operate as appropriate for their placement." Every meter is data-bound (tok/min, VRAM, per-agent activity); decorative meters are banned. |
| 2026-06-10 | Dual-shift theme policy with displays-stay-dark rule | Rocky chose to keep light mode as a first-class citizen (D8: "Keep light mode"). Day Shift designed as silver anodized hardware — like a silver DJM/Apollo, displays and buttons stay black. Approved at D9 with both shifts rendered. |
| 2026-06-10 | Website mirror mandate | Rocky: the app design translates directly to the Team-X website so the two mirror exactly — same model as Vision Studio ↔ Vision-Studio-X-website. |

---

**This document is the source of truth.** All Team-X UI work anchors to the tokens, recipes, and rules defined here. Where Team-X is silent on a pattern, fall back to `Vision-Studio-X-website\DESIGN.md` (the family chassis progenitor) — but Team-X's divergences (armed red, typography, dual-shift, lamp vocabulary) always win inside this repo. Until a screen is touched by the aesthetic sweep, existing shipped primitives remain in force; never mix old and new families on one swept screen.
