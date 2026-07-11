# CLAUDE.md


## Inheritance from parent repositories

This project lives under `Strategia-Enhanced-App/` and inherits rules from:

- `~/.claude/CLAUDE.md` — Rocky's global standards (Elite Partner, execution standards, UI/UX bar, security, code quality, blog diligence, SEO/GEO diligence, zero-corner-cutting mandate).
- `Strategia-Enhanced-App/CLAUDE.md` — workspace-level build commands and guidance.

**Zero-tolerance-no-cutting-corners applies here.** Every feature built to full spec, every role spec hand-written to F10 quality, every dashboard state (loading/empty/error/disabled) implemented, every platform tested. Full fidelity. Full effort. Every time.

## Design System

**Always read `DESIGN.md` before making any visual or UI decisions.** It is the canonical source of truth (created 2026-06-10 via `/design-consultation`, Rocky-approved): the Command Console direction — Carbon Pro chassis (brushed black aluminum, four-layer raised-hardware depth, hex bolts, phosphor LCD wells, functional VU meters), armed-red `#AA2024` as LIVE/command authority (dual-form rule: steady = live, blinking = unacknowledged), stencil word-lamps + annunciator rail, Archivo / Public Sans / Departure Mono / Iosevka, dual-shift theming (Night Ops + Day Shift silver, displays stay dark in both). All font choices, colors, spacing, depth recipes, and motion envelopes are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match DESIGN.md.

**Sweep complete (2026-07-10, Phase 8):** every renderer surface composes from the DESIGN.md console vocabulary (faceplates, wells, lamps, stripes, caps). The legacy composition families — the mission primitive library, the chooser-selection recipe and its tier variants, and the LED status-badge family — are deleted from the codebase. Do not reintroduce them; source-pin guards across the cluster-sweep tests enforce their absence.

## Reusable visual primitives (in `apps/desktop/src/renderer/src/styles/globals.css`)

When you reach for an existing pattern, **use the existing class — do not reinvent it inline**. New visual primitives belong in `globals.css` (console recipes section), not scattered across feature files. The full recipe vocabulary (caps, wells, LCDs, lamp/tag families) is documented in DESIGN.md.

- **`.brand-range`** — `<input type="range">` slider styling. Visible rail + brand-red thumb with hover/focus glow. Apply with `className="brand-range"` and nothing else.

## Key contacts

- **Project lead:** Rocky Elsalaymeh
- **Primary OS target:** Windows 11 (Phase 1–3); macOS + Linux (Phase 4)
- **Repo visibility:** open-source on commit #1, public GitHub release in Phase 4

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill. Process skills (brainstorming, debugging, planning) come **before** implementation — they decide *how* to approach the work.

**Always-on governance (these frame every session — apply them, don't wait to be asked):**
- `rockys-elite-partner` — the foundational operating mode (ownership, F10 quality, proactive excellence). Active by default.
- Zero-tolerance-no-cutting-corners + the Design system reminders above govern all renderer work.

**Core routing (gstack + superpowers):**
- New feature / behavior change / "let's build X" → `superpowers:brainstorming` first, then `superpowers:writing-plans`, then `superpowers:executing-plans`
- Any feature or bugfix implementation → `superpowers:test-driven-development` (TDD is the Phase-2+ default for this repo)
- Bug / test failure / unexpected behavior → `superpowers:systematic-debugging` (or `/investigate`) before proposing a fix
- Product ideas / scoping a phase → `/office-hours`; strategy/scope → `/plan-ceo-review`; architecture → `/plan-eng-review`; full review pipeline → `/autoplan`
- Design-system or plan-design review → `/design-consultation` or `/plan-design-review`; renderer visual polish → `/design-review`
- QA the running desktop app (renderer over the dev server) → `/qa` or report-only `/qa-only`
- Save / resume working context across sessions → `/context-save` · `/context-restore`

**Review wall (CR-7) — the mandatory gate order for every phase PR. Do not skip or reorder:**
1. **Stage 1 — CI** must be green (typecheck + Biome + ESLint + test ×3 OS + Electron E2E smoke + claim-evidence audit).
2. **Stage 2 — internal review** → `/review` on the diff (per-task spec + quality + subprocess-security pass). Force every finding to quote the code line that motivates it.
3. **Stage 3 — Codex (MANDATORY, only Rocky triggers)** → `dev-tools:codex-review` / `/codex`. Required because of the subprocess-spawn trust boundary. **Any HIGH/`[P1]` finding blocks merge.** Never self-clear this gate.
4. **Stage 4 — Rocky sign-off.**
5. **Stage 5 — `/ship` + release tag** is **release-only, NOT per-phase.** After Stage 4 a phase PR merges straight to `main`.

**Desktop-app reality (don't mis-route):**
- This is an **Electron desktop monorepo** (`apps/desktop` + `packages/*`), not a deployed website. There is no blog and no public web surface here, so `rockys-blog-diligence` and `rockys-seo-geo-diligence` do **not** apply to Team-X — they belong to the spoke sites under `Strategia-Enhanced-App/`.
- Releases ship via `git tag v*` → `release.yml` → GitHub Releases (electron-updater). `/ship` and `/land-and-deploy` operate on PRs + CI, not a hosting deploy.
- Web browsing, when needed → `/browse` (gstack), never the raw `mcp__claude-in-chrome__*` tools.
