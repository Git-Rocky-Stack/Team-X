# CLAUDE.md


## Inheritance from parent repositories

This project lives under `Strategia-Enhanced-App/` and inherits rules from:

- `~/.claude/CLAUDE.md` — Rocky's global standards (Elite Partner, execution standards, UI/UX bar, security, code quality, blog diligence, SEO/GEO diligence, zero-corner-cutting mandate).
- `Strategia-Enhanced-App/CLAUDE.md` — workspace-level build commands and guidance.

**Zero-tolerance-no-cutting-corners applies here.** Every feature built to full spec, every role spec hand-written to F10 quality, every dashboard state (loading/empty/error/disabled) implemented, every platform tested. Full fidelity. Full effort. Every time.

## Design system reminders

- **Accent color:** `#FFAA2024` (Strategia red)
- **Theme:** dark by default, light mode available
- **Grid:** 8-point (4px fine)
- **Typography:** Inter (UI) + JetBrains Mono (code/streams); 1.2 headings, 1.5–1.6 body, 65–75ch max
- **Icons:** Lucide React
- **Charts:** Recharts
- **Motion:** 150–300 ms feedback, 300–500 ms transitions, ease-out in, ease-in out
- **A11y:** WCAG 2.1 AA minimum, AAA for critical text; keyboard-navigable; 44 px touch targets
- **States:** every interactive element — hover, focus, loading, error, empty, disabled

### Reusable visual primitives (in `apps/desktop/src/renderer/src/styles/globals.css`)

When you reach for one of the patterns below, **use the existing class — do not reinvent it inline**. New visual primitives belong here, not scattered across feature files.

- **`.brand-selected`** — the active choice in any "select one of N" chooser (mode buttons, preset cards, filter chips, posture selectors, the Board Queue button, etc.). Supplies border, bg, text color, glow, hover, and focus-visible. Pair with `cn()`:
  ```tsx
  className={cn(
    'rounded-lg border px-3 py-3',
    selected ? 'brand-selected' : 'border-border hover:border-white/20 transition-colors',
  )}
  ```
  Do **not** also apply `border-brand`, `bg-brand/10`, `text-brand`, etc. when this class is on — it owns those properties. Reserved for chooser-card selection only; navigation tabs, list-item highlights, and semantic color codings (e.g. category pills) are out of scope.

  **Color variants** for choosers where color carries semantic meaning — apply alongside `.brand-selected`. The bezel weight, glow shape, hover behavior, and transition stay locked; only the tint changes.
  - `.brand-selected-green` — Local-only / safe / read-only / approved
  - `.brand-selected-blue` — Open-source / standard / informational
  - `.brand-selected-amber` — Caution / proprietary cloud / advanced / pending review
  ```tsx
  className={cn('rounded-lg border', selected && `brand-selected ${tier.variant}`)}
  ```
- **`.brand-range`** — `<input type="range">` slider styling. Visible rail + brand-red thumb with hover/focus glow. Apply with `className="brand-range"` and nothing else.

### Status badges (LED + label)

All status badges across the renderer share one foundation:
`text-[10px] px-1.5 py-0 gap-1.5` + a 1.5×1.5px LED span as the first child.

| State | Border | Bg | Text | LED |
|---|---|---|---|---|
| All-good / on | `border-green-400/40` | `bg-green-400/10` | `text-green-400` | green, `animate-pulse` |
| Off / not-running | `border-red-400/40` | `bg-red-500/10` | `text-red-400` | red, solid |
| Loading / detecting | `border-muted-foreground/30` | `bg-muted/20` | `text-muted-foreground` | grey, `animate-pulse` |

Match this signature when adding a new status badge so the page reads as one family.

## Key contacts

- **Project lead:** Rocky Elsalaymeh
- **Primary OS target:** Windows 11 (Phase 1–3); macOS + Linux (Phase 4)
- **Repo visibility:** open-source on commit #1, public GitHub release in Phase 4
