# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Team-X is

Team-X is an open-source, privacy-first, **local-first desktop app for running AI-agent organizations**. You don't manage prompts or pipelines — you run a **company**: hire employees from a curated F10 role library, assemble an org chart with real hierarchy (Officer → Senior Management → Management → Supervisor → Lead → IC), set company goals, break them into projects, file tickets, watch the team work in real-time on a multi-view cockpit, chat with anyone on demand, and pull everyone into an all-hands meeting with one click. Runs on local models (Ollama / Qwen / Gemma) by default; plug Claude, OpenAI/Codex, Google, OpenRouter, Groq, Together, Fireworks, or any OpenAI-compatible provider when you want cloud power.

**Tagline candidate:** *"Run an AI company. Not a prompt."*

## Source of truth

**Before proposing any architectural change, read the design document:**

- [`docs/plans/2026-04-07-team-x-design.md`](docs/plans/2026-04-07-team-x-design.md) — full approved design (v1.0, 2026-04-07)

The decisions log in §15 of that doc is **locked** unless explicitly revisited with the user. If you find yourself disagreeing with a decision, raise it as a discussion — don't silently deviate.

## Status

**Phase 1 (Skeleton) — in progress.** Milestones 1-4 complete. Milestone 5 (renderer) is next.

- **M1 (repo foundations):** pnpm workspace, TypeScript strict, Biome, Vitest, CI.
- **M2 (shared packages):** `shared-types`, `role-schema` (parser + template renderer), `provider-router` (registry + streaming adapters for Anthropic + Ollama), `telemetry-core` (cost math).
- **M3 (main process + DB):** Electron boots with context isolation, SQLite + Drizzle migrate on first run, seed creates the Strategia-X company with CEO + Senior Fullstack Engineer, keytar-backed `SecretsStore`, providers service seeds `ollama-local` + `anthropic`, dev `.env` → keychain bootstrap.
- **M4 (agent runtime):** Append-only event bus, slot-semaphore work queue, `runAgent` with live streaming + persistence, orchestrator facade, real Anthropic + Ollama adapters via Vercel AI SDK, `provider-factory` (resolves employee → provider + model with keytar + privacy-tier fallback), `role-loader` (directory scan → role.md index → template rendering), IPC handlers (`employees.list`, `chat.send`, `chat.list`) with typed preload bridge (`window.teamx: TeamXApi`), full main/index.ts wiring (orchestrator + IPC + event forwarding + graceful shutdown), test-mode provider for Playwright E2E, smoke-chat.ts script for manual Ollama verification. 313 tests passing.

The detailed Phase 1 plan lives at [`docs/plans/2026-04-07-team-x-phase-1-skeleton.md`](docs/plans/2026-04-07-team-x-phase-1-skeleton.md) — 52 tasks across 6 milestones.

## Stack (locked)

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Build | electron-vite + electron-builder |
| Main process | Node.js 20 LTS + TypeScript (strict) |
| Renderer | React 19 + TypeScript + Tailwind + shadcn/ui + Radix |
| State | Zustand + React Query |
| LLM layer | Vercel AI SDK (`ai`) + provider packages |
| Agent framework | Custom orchestrator on top of AI SDK |
| MCP | `@modelcontextprotocol/sdk` (TypeScript) |
| Database | better-sqlite3 + Drizzle ORM |
| Vector store | sqlite-vec |
| Full-text search | SQLite FTS5 |
| Secrets | keytar (OS keychain) |
| Package manager | pnpm workspaces |
| Lint / format | Biome |
| Unit tests | Vitest |
| E2E tests | Playwright |
| CI | GitHub Actions |
| License | MIT |

Do NOT swap any of these without revisiting the design doc with the user first.

## Repository layout (planned)

```
Team-X/
├─ apps/desktop/           # Electron app (main + preload + renderer)
├─ packages/               # shared-types, role-schema, provider-router, mcp-client, telemetry-core
├─ role-packs/             # default F10 pack + community packs
├─ docs/                   # plans, architecture, user-guide
├─ scripts/
├─ .github/workflows/
├─ CLAUDE.md
├─ README.md               # phase 4
├─ LICENSE                 # MIT (phase 4)
└─ package.json            # pnpm workspace root
```

## Phase plan (locked)

1. **Phase 1 — Skeleton** — Electron boot, SQLite, 1 hardcoded company, CEO + 1 SWE, AI SDK + Anthropic + Ollama, bare Cards dashboard with live token stream. Demo: *"Hire a CEO, chat with it, watch it think."*
2. **Phase 2 — The Org** — Role pack loader + ~55 roles, multi-company, org chart editor, MCP host, tickets + kanban. Demo: *"File a ticket → agent picks it up, uses an MCP, closes it."*
3. **Phase 3 — The Live Cockpit** — All 5 dashboard subviews, meeting primitive, goals + projects, telemetry, runtime modes, privacy tier filter. Demo: *"One-click all-hands → minutes → action items → tickets."*
4. **Phase 4 — Ship-readiness** — File vault, backup/restore, audit log UI, installers, landing site, public release.

## Build commands

**Install and run:**

```bash
pnpm install                    # install workspace deps (runs electron-rebuild postinstall)
pnpm dev                        # electron-vite dev server (main + renderer HMR)
pnpm -F @team-x/desktop dev     # same, scoped to the desktop app
pnpm build                      # production build of all workspaces
```

Packaged installer generation via electron-builder (`pnpm dist`) and Playwright E2E tests (`pnpm test:e2e`) land in later tasks (T49+). Neither command exists yet.

**Test, typecheck, lint:**

```bash
pnpm test                       # vitest run across all workspaces
pnpm test:watch                 # vitest in watch mode
pnpm test:coverage              # vitest with coverage report
pnpm typecheck                  # tsc --noEmit across all workspaces
pnpm lint                       # biome check
pnpm lint:fix                   # biome check --write
pnpm format                     # biome format --write
```

**Typecheck caveat — important.** Always run `pnpm typecheck` at the repo root (which expands to `pnpm -r typecheck`). The workspace-scoped `pnpm -F @team-x/desktop typecheck` does NOT traverse project references and silently misses per-package composite-mode regressions in the shared workspace packages. This cost real debugging time in Task 18 — do not shortcut it.

**Database migrations (Drizzle):**

```bash
pnpm -F @team-x/desktop exec drizzle-kit generate --name <snake_case_name>
```

Emits a new migration to `apps/desktop/src/main/db/migrations/`. Commit the resulting `.sql` file along with the updated `meta/_journal.json` and `meta/*_snapshot.json` that drizzle-kit writes alongside it.

**Native module rebuilds:**

```bash
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

Rebuilds both native modules against Electron's ABI. **Use the comma-separated form** for multi-module rebuilds — `@electron/rebuild@3.7.2`'s CLI crashes with `argv.w.split is not a function` on repeated `-w` flags (it calls `.split(',')` on the value internally). When adding a new native module, extend the comma list, not a second `-w` flag. The `@team-x/desktop` postinstall script already uses this form; mirror it if you script a rebuild elsewhere.

## Architectural invariants

These are non-negotiable. Violating any of them requires a design-doc amendment.

1. **Renderer is a pure view.** No direct LLM or MCP calls. Every interaction crosses the typed IPC bridge into Main. Context isolation on. No node integration in renderer.
2. **Orchestrator is the only scheduler.** If the orchestrator says pause (e.g., during a meeting), nothing new dispatches. This keeps the meeting primitive race-free.
3. **MCP Host is a singleton in Main.** One pool of MCP connections; agents request tool calls via message passing. Never spawn N MCP clients from N workers.
4. **Storage is SQLite + filesystem vault.** Metadata in SQLite, blobs on disk, SHA256 integrity. **Never** store file blobs in SQLite — that breaks the zero-file-size-limit guarantee.
5. **Provider router is the only place that touches LLM APIs.** It enforces privacy tiers, concurrency caps, and cost tracking.
6. **Events table is append-only.** Source of truth for the realtime dashboard. Orchestrator writes; renderer subscribes.
7. **Zero phone-home.** Ever. No anonymized metrics. Updates are explicitly user-triggered. This is the privacy-first posture and it does not get traded away.
8. **Secrets live in the OS keychain** (keytar). Never plaintext in config files.
9. **Role-pack user edits are saved as overrides**, not mutations of the pack. Upstream pack updates must never clobber user customizations.
10. **Runtime strategy is adaptive.** Default Auto; profile hardware + providers on startup; pick Hybrid / Always-On / Lean. User override always wins.

## Working with role packs

The curated F10 role library is the crown jewel. When creating or editing `role.md` files in `role-packs/strategia-official/`:

- **Match the quality bar** of `~/.claude/CLAUDE.md` and Rocky's Strategia-X writing voice: executive, authoritative, direct, F10. No marketing fluff.
- **Always include** the full frontmatter: `id`, `name`, `level`, `reports_to`, `manages`, `preferred_model_tier`, `preferred_providers`, `fallback_providers`, `tools_allowed`, `tools_denied`, `decision_authority`, `kpis`, `output_format`, `temperature`, `license`, `author`, `version`.
- **Use template variables** (`{{company.name}}`, `{{company.mission}}`, `{{employee.name}}`, etc.) so one role.md serves many companies.
- **Structure the body** with: `# Identity`, `# Mission`, `# Responsibilities`, `# Decision Framework`, `# Communication Style`, `# Escalation Rules`, `# Output Format`.
- **Version bumps** follow semver. Breaking changes to frontmatter keys are major bumps.

## Working with providers & models

- **Never hardcode model names** in code. Models live in the `model_registry` table, populated from a versioned JSON manifest that ships with role packs and can be updated independently.
- **Respect privacy tiers.** Every provider has `privacy_tier ∈ { local, open-source-cloud, proprietary-cloud }`. The provider router enforces the user's privacy filter at call time. If a role requests a provider the filter blocks, fall back per `fallback_providers`.
- **Respect per-provider concurrency caps** defined in settings. Defaults: ollama=1, anthropic=4, openai=6, openrouter=8, groq=10, together=6, fireworks=6, google=4.
- **Track every call** in the `runs` table with provider, model, tokens, latency, cost. Cost telemetry is user-visible in the Telemetry tab.

## Security posture (public-release grade from day one)

- Context isolation + disabled node integration in renderer.
- All IPC typed via preload bridge; no `ipcRenderer` exposed.
- API keys in OS keychain.
- MCP `tools_denied` enforced at the host, not in the agent prompt.
- Community role packs require signature verification (phase 4+).
- Append-only audit log in `events` table for every sensitive action (hire, fire, MCP add, backup restore).

## Testing expectations

- **Unit tests (Vitest)** for: role.md parser, provider router logic, orchestrator scheduler math, telemetry calculations, backup/restore round-trip.
- **Integration tests (Vitest)** for: MCP host + one real MCP, Drizzle migrations, worker lifecycle, meeting pause/resume.
- **E2E tests (Playwright)** via the `/browse` skill for: hire flow, chat flow, ticket assign → close flow, meeting flow, backup/restore flow.
- Every Phase-X demo must have green tests before the phase is marked shippable.

## Things to NOT do

- **Do not use LangChain, LangGraph, CrewAI, AutoGen, or Mastra.** They were considered and rejected; our custom orchestrator is differentiated.
- **Do not add telemetry or phone-home endpoints.** Privacy-first is non-negotiable.
- **Do not add a hosted/cloud-sync feature** without a design-doc amendment.
- **Do not introduce React Server Components or Next.js.** This is Electron; client-only React.
- **Do not use eslint + prettier.** Biome only.
- **Do not hardcode model names** in agent code. Use the registry.
- **Do not create a README.md** until phase 4 unless the user explicitly asks.
- **Do not add emojis** to code or docs unless Rocky asks.

## Inheritance from parent repositories

This project lives under `Strategia-Enhanced-App/` and inherits rules from:

- `~/.claude/CLAUDE.md` — Rocky's global standards (Elite Partner, execution standards, UI/UX bar, security, code quality, blog diligence, SEO/GEO diligence, zero-corner-cutting mandate).
- `Strategia-Enhanced-App/CLAUDE.md` — workspace-level build commands and guidance.

**Zero-tolerance-no-cutting-corners applies here.** Every feature built to full spec, every role.md hand-written to F10 quality, every dashboard state (loading/empty/error/disabled) implemented, every platform tested. Full fidelity. Full effort. Every time.

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

## Key contacts

- **Project lead:** Rocky Elsalaymeh
- **Primary OS target:** Windows 11 (Phase 1–3); macOS + Linux (Phase 4)
- **Repo visibility:** open-source on commit #1, public GitHub release in Phase 4
