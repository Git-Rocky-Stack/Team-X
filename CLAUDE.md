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

**Phase 2 (The Org) — complete.** All 13 milestones shipped.

**Phase 3 (The Live Cockpit) — in progress.** M14-M15 shipped. 412 unit tests + 2 E2E specs passing.

### Phase 1 (Skeleton) — complete

- **M1 (repo foundations):** pnpm workspace, TypeScript strict, Biome, Vitest, CI.
- **M2 (shared packages):** `shared-types`, `role-schema` (parser + template renderer), `provider-router` (registry + streaming adapters for Anthropic + Ollama), `telemetry-core` (cost math).
- **M3 (main process + DB):** Electron boots with context isolation, SQLite + Drizzle migrate on first run, seed creates the Strategia-X company with CEO + Senior Fullstack Engineer, keytar-backed `SecretsStore`, providers service seeds `ollama-local` + `anthropic`, dev `.env` → keychain bootstrap.
- **M4 (agent runtime):** Append-only event bus, slot-semaphore work queue, `runAgent` with live streaming + persistence, orchestrator facade, real Anthropic + Ollama adapters via Vercel AI SDK, `provider-factory` (resolves employee → provider + model with keytar + privacy-tier fallback), `role-loader` (directory scan → role.md index → template rendering), IPC handlers (`employees.list`, `chat.send`, `chat.list`) with typed preload bridge (`window.teamx: TeamXApi`), full main/index.ts wiring (orchestrator + IPC + event forwarding + graceful shutdown), test-mode provider for Playwright E2E, smoke-chat.ts script for manual Ollama verification.
- **M5 (renderer):** Tailwind + shadcn/ui dark theme, Zustand + React Query, IPC client hooks, app shell (top bar + sidenav + content area), dashboard cards view with live token stream preview, chat drawer with streaming replies + composer, hire dialog, empty/loading/error states, Inter + JetBrains Mono typography, live status counts, WCAG 2.1 AA accessibility pass.
- **M6 (demo + hardening):** Playwright E2E smoke test (full chat round-trip against canned test-mode provider), CI e2e job (ubuntu + xvfb), DevTools + will-quit shutdown fixes.

### Phase 2 (The Org) — complete

- **M7 (multi-company + workspace):** Company CRUD + soft-delete, `WorkspaceSwitcher`, `CreateCompanyDialog`, `CompanySettings` panel. DB migration adds `archived_at`, `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` to companies.
- **M8 (role pack system + 55 roles):** Role-loader (`listRoles()`, `listByLevel()`, `reload()`), 55 F10 roles across 6 levels (Officer 5, Senior Mgmt 7, Management 8, Supervisor 5, Lead 5, IC 25), searchable hire dialog with level filter chips.
- **M9 (org chart + hire/fire/promote):** `org_edges` table with cycle detection, `employees.fire`, `employees.promote`, `employees.setManager`, `orgchart.get` IPC channels, indented-list tree UI with color-coded levels, drag-to-rearrange, "Reports to" manager selection in hire flow.
- **M10 (MCP host + tool calling):** `McpHost` singleton with stdio/SSE connection pool, `tools_allowed`/`tools_denied` enforcement at host level, `mcp_servers` + `tool_calls` tables, streaming tool-call support via `fullStream`, 5 `mcp.*` IPC channels, default seeds (Context7, Supabase), graceful shutdown.
- **M11 (employee-to-employee messaging):** Built-in tools (`send_message_to_colleague`, `list_colleagues`), orchestrator `enqueueAgentReply` with role-relative history mapping, `is_agent_initiated` column, `ThreadList` UI with amber bot icons, read-only agent thread viewing.
- **M12 (tickets + kanban):** Ticket CRUD (`tickets` table, 8 IPC channels), 4-column kanban board (open/in-progress/blocked/done) with drag-to-move, ticket detail panel with discussion thread, create-with-assign triggers orchestrator run, `CreateTicketDialog` with priority + assignee selection.
- **M13 (demo + hardening):** Playwright E2E ticket-flow spec (full create-assign-agent-reply round-trip, 1.8s), production build fix (`inlineDynamicImports` for `__filename`/`__dirname` collision), smoke test updated for Phase 2 badge, lint cleanup. 379 unit tests + 2 E2E passing.

### Phase 3 (The Live Cockpit) — in progress

- **M14 (dashboard subviews):** 4 new subviews (Timeline, Stream, Floor, Org embed) + subtab nav in Dashboard, top bar expanded to all 8 tabs with disabled placeholders, `events.list` IPC with cursor-based pagination. 384 tests passing.
- **M15 (goals & projects):** `goals`, `projects`, `project_tickets` tables + migration. Goals repo (CRUD + recalcProgress), Projects repo (CRUD + ticket linking). 12 new IPC channels (5 goals.*, 7 projects.*). Projects kanban board (4-column drag-drop), project cards + detail panel, create project dialog. Goals subtab with progress bars, goal rows + detail panel, create goal dialog. Projects tab enabled. 412 tests passing.
- **M16 (meeting primitive):** `meetings` table + `companies.status` column + migration. Meetings repo (CRUD + lifecycle). Per-company orchestrator pause/drain (`pauseCompany`/`resumeCompany`/`isCompanyPaused`). Meeting service (callMeeting/nextTurn/interject/endMeeting with minutes generation + action item extraction). 5 new IPC channels (meetings.*). MeetingsView with list panel, detail panel, call dialog, composer. Meetings tab enabled. 441 tests passing.
- **M17 (telemetry dashboard):** 4 aggregate query methods on runs repo (companyStats, dailyUsage, employeeStats, costBreakdown). 4 telemetry IPC channels + handlers + preload bridge. Recharts integration. TelemetryView with 3 subviews: Company (summary cards + 30-day AreaCharts for tokens/cost), Employees (sortable per-employee table), Cost (PieChart by provider + BarChart by model + date range filter). Telemetry tab enabled. 456 tests passing.
- **M18 (additional providers):** 7 new provider adapters (OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OpenAI-compat) in `provider-router` via AI SDK + `createOpenAI` custom baseURL pattern. Provider factory extended with 7 `buildStream` cases + default models. Providers service with add/update/remove + 6 disabled seed rows. Env-key bootstrap for 7 API keys. 5 new `providers.*` IPC channels + handlers + preload bridge. SettingsView with ProvidersSection (card grid), ProviderCard (toggle, API key input, test connection, remove), AddProviderDialog (kind picker, privacy tier, key, base URL). Settings tab enabled. 501 tests passing.
- **M19 (runtime modes + privacy):** Settings repo (key-value store with seedDefaults). Hardware profiler (CPU, RAM, GPU detection via `execFileSync` + wmic on Windows, session-cached). Strategy picker (`pickStrategy` — Auto/Hybrid/Always-On/Lean based on hardware + providers). Privacy tier types + constants (`PRIVACY_TIER_RANK`, `DEFAULT_CONCURRENCY_CAPS`, `STRATEGY_SLOTS`). 6 new `settings.*` IPC channels + handlers + preload bridge. Settings UI expanded with RuntimeSection (strategy selector + hw profile), PrivacySection (tier selector + per-provider allowed/blocked), ConcurrencySection (slot selector + per-provider caps). 530 tests passing.

The Phase 1 plan lives at [`docs/plans/2026-04-07-team-x-phase-1-skeleton.md`](docs/plans/2026-04-07-team-x-phase-1-skeleton.md).
The Phase 2 plan lives at [`docs/plans/2026-04-11-team-x-phase-2-the-org.md`](docs/plans/2026-04-11-team-x-phase-2-the-org.md).
The Phase 3 plan lives at [`docs/plans/2026-04-12-team-x-phase-3-live-cockpit.md`](docs/plans/2026-04-12-team-x-phase-3-live-cockpit.md).

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
2. **Phase 2 — The Org** — Role pack loader + 55 roles, multi-company, org chart editor, MCP host, tickets + kanban. Demo: *"File a ticket → agent picks it up, uses an MCP, closes it."*
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

Packaged installer generation via electron-builder (`pnpm dist`) lands in Phase 4 — no command yet. Playwright E2E tests are wired (T49) and run via `pnpm -F @team-x/desktop test:e2e`.

**Test, typecheck, lint:**

```bash
pnpm test                       # vitest run across all workspaces (530 tests)
pnpm test:watch                 # vitest in watch mode
pnpm test:coverage              # vitest with coverage report
pnpm typecheck                  # tsc --noEmit across all workspaces
pnpm lint                       # biome check
pnpm lint:fix                   # biome check --write
pnpm format                     # biome format --write
```

**End-to-end smoke test (Playwright + real Electron):**

```bash
# Full build + run — what CI does and what you should run before /ship.
pnpm -F @team-x/desktop test:e2e

# Skip the build (faster iteration when out/main is already current).
pnpm -F @team-x/desktop test:e2e:run
```

Two E2E specs live under `apps/desktop/e2e/`:

- `smoke.spec.ts` — Phase 1 chat round-trip (boot, render employees, send message, canned reply).
- `ticket-flow.spec.ts` — Phase 2 ticket lifecycle (navigate to Tickets, create ticket with assignee, agent processes via test-mode provider, verify reply in detail panel).

Both launch a real Electron instance against `out/main/index.js` with
`NODE_ENV=test`, which flips `provider-factory.isTestMode()` to `true`
and swaps the resolver for the canned-reply `createTestModeResolveProvider`.
No Ollama, no Anthropic key, no network — the full round-trips are
exercised through the orchestrator and event bus end-to-end.

Each run gets its own throwaway `--user-data-dir=<tmp>` so the test
SQLite database never collides with Rocky's real dev DB at
`%APPDATA%/Team-X/team-x/team-x.sqlite`.

**Manual smoke against a real local LLM (Ollama):**

```bash
pnpm -F @team-x/desktop exec tsx scripts/smoke-chat.ts
```

Requires `ollama serve` running locally with `llama3.1:8b` (or whatever
you set as `modelPref`) pulled. Streams a real response to stdout —
the fastest way to verify the orchestrator + provider router pipeline
end-to-end without booting Electron.

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
- **E2E tests (Playwright)** for: hire flow, chat flow, ticket assign → close flow, meeting flow, backup/restore flow. Phase 2 ships two specs: smoke (chat round-trip) and ticket-flow (create-assign-agent-reply lifecycle), both against the canned test-mode provider.
- Every Phase-X demo must have green tests before the phase is marked shippable.

## IPC channels (Phase 2 + Phase 3)

All channels are typed via `TeamXApi` in `packages/shared-types/src/ipc.ts` and exposed through the preload bridge.

| Namespace | Channel | Description |
|-----------|---------|-------------|
| companies | `companies.create` | Create new company |
| | `companies.update` | Update company settings |
| | `companies.delete` | Soft-delete (archive) company |
| employees | `employees.list` | List employees for company |
| | `employees.create` | Hire from role catalog |
| | `employees.fire` | Archive employee |
| | `employees.promote` | Change role/level |
| | `employees.setManager` | Update reporting line |
| orgchart | `orgchart.get` | Get full org tree for company |
| chat | `chat.send` | Send message to employee |
| | `chat.list` | List messages in thread |
| | `chat.resolveThread` | Get or create DM thread |
| | `chat.listThreads` | List all threads for company |
| events | `events.list` | Paginated event list for timeline (M14) |
| mcp | `mcp.list` | List MCP servers for company |
| | `mcp.add` | Register new MCP server |
| | `mcp.remove` | Remove MCP server |
| | `mcp.toggle` | Enable/disable MCP server |
| | `mcp.health` | Check MCP server health |
| goals | `goals.create` | Create company goal (M15) |
| | `goals.update` | Update goal fields |
| | `goals.list` | List all goals for company |
| | `goals.get` | Goal detail with linked projects |
| | `goals.delete` | Delete a goal |
| projects | `projects.create` | Create project (M15) |
| | `projects.update` | Update project fields |
| | `projects.list` | List all projects for company |
| | `projects.get` | Project detail with tickets + lead |
| | `projects.delete` | Delete project + ticket links |
| | `projects.linkTicket` | Link ticket to project |
| | `projects.unlinkTicket` | Unlink ticket from project |
| meetings | `meetings.call` | Start a meeting (pause orchestrator, create thread) (M16) |
| | `meetings.end` | End meeting, generate minutes, resume orchestrator |
| | `meetings.interject` | Rocky sends a message mid-meeting |
| | `meetings.list` | List past meetings for company |
| | `meetings.get` | Get meeting detail with thread + minutes |
| telemetry | `telemetry.companyStats` | Aggregate company-level stats (M17) |
| | `telemetry.dailyUsage` | Daily time-series of tokens + cost |
| | `telemetry.employeeStats` | Per-employee breakdown |
| | `telemetry.costBreakdown` | Cost by provider/model with date range |
| settings | `settings.getRuntime` | Strategy + hardware profile + effective slots (M19) |
| | `settings.setRuntime` | Set runtime strategy override |
| | `settings.getPrivacy` | Privacy tier + per-provider allowed/blocked |
| | `settings.setPrivacy` | Set max privacy tier |
| | `settings.getConcurrency` | Orchestrator slots + per-provider caps |
| | `settings.setConcurrency` | Update slots + caps |
| providers | `providers.list` | List all configured providers (M18) |
| | `providers.add` | Register a new provider (API key to keychain) |
| | `providers.update` | Update config, toggle, set API key |
| | `providers.remove` | Remove provider + keychain entry |
| | `providers.testConnection` | Test provider API key + connectivity |
| tickets | `tickets.create` | File ticket (optional immediate assign) |
| | `tickets.update` | Update mutable fields |
| | `tickets.assign` | Assign + create thread + enqueue agent |
| | `tickets.close` | Close ticket (status → done) |
| | `tickets.reopen` | Reopen closed ticket |
| | `tickets.addComment` | Add discussion comment (triggers agent) |
| | `tickets.list` | List all tickets for company |
| | `tickets.get` | Full detail with messages + assignee |

## Troubleshooting

**`Cannot find module '...better_sqlite3.node'` or any native-module ABI mismatch.** Electron rebuilds against its own Node ABI; pnpm installs against the system Node. Run the rebuild after every dep change that touches native modules:

```bash
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

The `@team-x/desktop` postinstall script does this automatically on `pnpm install`. If you're seeing the error after a dep upgrade, it usually means the postinstall hook was skipped — re-run install with `--force`.

**Ollama smoke chat fails with `ECONNREFUSED 127.0.0.1:11434`.** Ollama isn't running. Start it (`ollama serve` on Linux/macOS, or open the Ollama desktop app on Windows) and re-run. Confirm the model is pulled:

```bash
ollama list
ollama pull llama3.1:8b   # or whatever the test references
```

If Ollama is bound to a non-default host, set `OLLAMA_BASE_URL` in `apps/desktop/.env` — see `bootstrapEnvKeys` for the full env-key import contract.

**Drizzle migrations are out of sync — "table already exists" or "missing column" on dev boot.** The dev DB lives at `%APPDATA%/Team-X/team-x/team-x.sqlite` on Windows. Nuke it and let the next boot reseed:

```bash
# Windows (PowerShell)
Remove-Item -Force "$env:APPDATA\Team-X\team-x\team-x.sqlite*"

# macOS / Linux equivalent
rm -f ~/Library/Application\ Support/Team-X/team-x/team-x.sqlite*
```

The `*` glob also removes the `-shm` and `-wal` WAL companion files. On the next `pnpm dev`, migrations re-run from scratch and `seedIfEmpty()` reseeds the Strategia-X company + CEO + SWE.

**Playwright E2E hangs at the 90s test timeout.** The smoke test is supposed to finish in ~1-2 seconds. A hang means one of the assertions is waiting on an element that never appears. Things to check, in order:

1. The renderer crashed silently — read the `[renderer pageerror]` and `[renderer error]` lines forwarded by `e2e/smoke.spec.ts`.
2. A locator regex doesn't match the entire accessible name — Playwright's `getByRole({ name: regex })` is anchored, so use attribute-starts-with selectors (`button[aria-label^="..."]`) for robust matches.
3. `app.close()` itself is hanging — the will-quit handler in `main/index.ts` calls `app.exit(0)` after the orchestrator drains; if that ever stops working, the afterEach will force-kill after 5s and the test will surface the real assertion that failed before the hang.

**`pnpm typecheck` passes but unit tests fail with "test is not defined".** Vitest is picking up an `e2e/*.spec.ts` Playwright file. Confirm `apps/desktop/vitest.config.ts` excludes `e2e/**` — the per-workspace exclude is required because `vitest.workspace.ts` resolves projects independently and the root `vitest.config.ts` exclude does not propagate down.

**DevTools auto-opens during the Playwright run and the test hangs.** Should not happen — `main/index.ts` gates `openDevTools` on `process.env.NODE_ENV !== 'test'`. If the gate ever regresses, DevTools and Playwright fight over the same Chrome DevTools Protocol channel and every `expect().toBeVisible()` hangs indefinitely.

**Production build fails with `__filename has already been declared`.** The `electron.vite.config.ts` injects an ESM `__filename`/`__dirname` shim as a banner. If Rollup code-splits into chunks, each chunk gets its own CJS shim from electron-vite, colliding with the banner. The fix: `inlineDynamicImports: true` in the main build output config forces a single-file bundle. This is the correct shape for an Electron main process with one entry point.

**Ticket-flow E2E fails with strict mode violation on `getByText`.** Ticket description text appears in multiple DOM nodes (kanban card, detail panel description, initial thread message). Scope locators to a container: `detailPanel.locator('p').filter({ hasText: desc })` targets only the description paragraph, not the message `<div>`.

**MCP servers fail to connect in dev.** MCP servers are seeded as templates (`enabled: false`) by default. Enable them via the Company Settings panel or directly in the `mcp_servers` table. Verify the MCP binary is on the PATH. Check `[mcp]` prefixed logs in the main process console.

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
