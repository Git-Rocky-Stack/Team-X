<div align="center">

# Team-X

**Run an AI company. Not a prompt.**

[![CI](https://github.com/strategia-x/team-x/actions/workflows/ci.yml/badge.svg)](https://github.com/strategia-x/team-x/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1099%20passing-brightgreen.svg)](#testing)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#installation)

Open-source, privacy-first, local-first desktop app for running AI-agent organizations. You don't manage prompts or pipelines — you run a **company**: hire employees from a curated role library, build an org chart with real hierarchy, set goals, break them into projects, file tickets, watch the team work in real-time, chat with anyone on demand, and pull everyone into an all-hands meeting with one click.

[Download](#installation) | [User Guide](docs/user-guide/) | [Contributing](CONTRIBUTING.md) | [Changelog](CHANGELOG.md)

</div>

---

## Features

### The Org

- **55 curated F10 roles** across 6 hierarchy levels (Officer, Senior Management, Management, Supervisor, Lead, IC) — hand-written role specifications, not generic templates
- **Multi-company workspace** — run multiple AI organizations side-by-side, each with its own employees, goals, and settings
- **Org chart editor** — drag-to-rearrange reporting lines, promote, fire, set managers, visualize the full hierarchy with color-coded levels
- **Hire dialog** — searchable role catalog with level filter chips, one-click hiring from the curated pack

### The Live Cockpit

- **5 dashboard subviews** — Cards (employee cards with live token stream), Timeline (event feed), Stream (raw LLM output), Floor (grid layout), Org (embedded chart)
- **Goals and projects** — set company-level goals, create projects with ticket linking, track progress with visual indicators
- **Kanban board** — 4-column ticket board (Open, In Progress, Blocked, Done) with drag-to-move and automatic agent assignment
- **One-click meetings** — call an all-hands with selected attendees, interject mid-meeting as Rocky, auto-generated minutes with action item extraction
- **Natural-language command palette** — Cmd+K to hire, fire, assign tickets, call meetings, and more. 15 intents, destructive-action confirmation gate, local-first
- **Real-time telemetry** — company stats, daily usage charts, per-employee breakdown, cost analysis by provider and model with date range filtering

### AI Runtime

- **10 LLM providers** — Ollama (local), Anthropic, OpenAI, Google, Groq, OpenRouter, Together, Fireworks, plus any OpenAI-compatible endpoint
- **Privacy tiers** — Local, Open-Source Cloud, Proprietary Cloud — filter which providers your agents can use
- **Adaptive runtime strategy** — Auto, Hybrid, Always-On, or Lean mode based on hardware profile and available providers
- **MCP tool calling** — agents use Model Context Protocol tools via a singleton host with connection pooling and `tools_allowed`/`tools_denied` enforcement
- **Employee-to-employee messaging** — agents communicate with colleagues via built-in tools, forming collaborative workflows

### Intelligence Layer

- **RAG-grounded agent turns** — every agent prompt is augmented with retrieved context from messages and vault files via the `@team-x/intelligence` package (sqlite-vec embeddings, token-aware chunking with overlap, cosine-threshold gating, SHA256-dedup attribution blocks)
- **Natural-language command palette** (`Cmd+K`) — 14 structured intents (hire / fire / promote / assign / create / close / reopen / project / goal / meeting / status / navigation / vault search) plus a `complex_request` fallback that hands off to the agentic loop. LLM-backed classifier with JSON-output retry, fuzzy entity resolution, FTS5 ticket lookup, destructive-action confirmation gate, last-20 command history
- **Agentic loop for complex questions** — ask free-form questions like *"why is the frontend team behind schedule?"* or *"summarize what the CEO did this week"* and get a grounded multi-paragraph answer citing specific tickets, employees, and events. Runs a ReAct-style loop on a hidden `system-agent` pseudo-employee, dispatches six read-only query tools (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`), and terminates under hard step / token / wall-clock budgets (defaults 8 / 8000 / 120s — all configurable in Settings → Runtime)
- **Live step log + persisted thread** — the palette streams each loop step as a labeled card (plan → tool call → tool result → answer) with provider and token footer. After the run completes, the full transcript lives on the system-agent in the "Copilot Conversations" sidebar section for later reference
- **Cancel any run** — the loop honors an `AbortController` wired to the palette's Cancel button; terminal step is emitted as `canceled` and the audit log records the abort
- **Task Planner (write-side)** — Management-and-above agents can decompose projects into tickets with `decompose_project`, delegate subtasks with deterministic workload scoring (`delegate_subtask`), and review deliverables (`review_deliverable`). Level-gated tool injection — IC employees get read-only, Officers/Senior-Mgmt/Management get decomposition, Management/Supervisor/Lead get delegation + review. Every write-side run passes through an **amber confirmation gate** in the palette before any ticket is created; the deterministic 4-term scoring function (`0.4 * role_fit + 0.3 * (1 - load) + 0.2 * availability + 0.1 * past_performance`) is auditable in the `task.delegated` event payload. Four clamped settings (`planner_max_tickets`, `planner_max_depth`, `planner_approval_level`, `planner_escalation_threshold`) in Settings → Runtime → Task Planner
- **Copilot Service (proactive analyst)** — the app prompts the agentic loop on a 5-minute cadence (clamped 1–60 min) on a hidden `system-copilot` pseudo-employee, asks *"what's wrong with this company right now?"*, and surfaces the answer as **insights** — proactive nudges across five categories (`operational` / `cost` / `org` / `workflow` / `anomaly`) with three severity levels (`info` / `warning` / `critical`). A debounced 30s event-trigger supplements the periodic schedule on `meeting.ended`, `ticket.closed`, `goal.progressChanged`, and `agentic.failed { budget_exhausted }`. Deterministic dedup — category-scoped Jaccard bigram similarity > 0.8 with a numeric-drift guard so workflow counts never silently merge. Ask the Copilot directly with `copilot.ask` — same agentic harness, same step-log palette, plus a `query_copilot_insights` introspection tool so it can ground answers in its own prior analysis. Three settings (`copilot_enabled`, `copilot_interval_minutes`, `copilot_categories`) in Settings → Runtime → Copilot. Pause-aware (a meeting in progress queues the next tick), zero phone-home (analysis runs on whatever provider you've configured — with Ollama at the Local privacy tier, every byte stays on-device)

### Ship-Ready

- **File vault** — filesystem-backed blob storage with SHA256 integrity verification and FTS5 full-text search
- **Ticket attachments** — bridge vault files to tickets for agent-accessible file workflows
- **One-click backup/restore** — full SQLite + vault archive with manifest validation
- **Append-only audit log** — filterable event timeline with summary cards, actor search, date range picker, and CSV/JSON export
- **Cross-platform installers** — Windows (NSIS), macOS (DMG), Linux (AppImage + .deb) via electron-builder
- **User-triggered updates** — check for new versions from GitHub Releases on demand (zero phone-home)

---

## Installation

### Download

Grab the latest release for your platform from [GitHub Releases](https://github.com/strategia-x/team-x/releases):

| Platform | File | Architecture |
|----------|------|--------------|
| Windows | `Team-X-Setup-x.x.x.exe` | x64, arm64 |
| macOS | `Team-X-x.x.x.dmg` | x64 (Intel), arm64 (Apple Silicon) |
| Linux | `Team-X-x.x.x.AppImage` / `.deb` | x64 |

### From Source

```bash
# Prerequisites: Node.js 20+, pnpm 9+
git clone https://github.com/strategia-x/team-x.git
cd team-x
pnpm install
pnpm dev
```

### Local LLM Setup (Ollama)

Team-X works fully offline with local models. Install [Ollama](https://ollama.com), then:

```bash
ollama serve
ollama pull llama3.1:8b
```

Launch Team-X — it auto-detects the local Ollama instance.

### Cloud Providers

Add any supported provider in **Settings > Providers**: enter your API key, test the connection, and toggle it on. Your keys are stored in the OS keychain (never in config files).

---

## Architecture

```
Team-X/
  apps/desktop/             Electron app
    src/main/               Main process (Node.js + TypeScript)
      db/                   SQLite + Drizzle ORM (10 migrations)
      ipc/                  Typed IPC handlers (60+ channels)
      orchestrator/         Agent scheduler + event bus
      services/             Vault, backup, MCP host, providers, updater,
                            rag-indexer, command-service, agentic-loop,
                            agentic-tools, system-agent-bootstrap
    src/preload/            Context-isolated bridge (TeamXApi)
    src/renderer/           React 19 + Tailwind + shadcn/ui
      features/             Audit, chat, command, dashboard, hire,
                            meetings, projects, settings, telemetry,
                            tickets, vault
      hooks/                20+ React Query hooks
      store/                Zustand app store
    e2e/                    8 Playwright specs
  packages/
    shared-types/           IPC contract types, event types, entities
    role-schema/            Role.md parser + template renderer
    provider-router/        LLM provider registry + streaming adapters
    telemetry-core/         Cost calculation utilities
    intelligence/           RAG (chunker, embedding, retriever),
                            NLU (classifier, entity resolver, slot filler),
                            agentic loop (ReAct scheduler, tool registry)
  role-packs/
    strategia-official/
      roles/                55 curated F10 roles across 6 levels
      roles/system/         Hidden system-agent pseudo-employee role card
```

### Key Design Decisions

- **Renderer is a pure view.** No direct LLM or MCP calls. Every interaction crosses the typed IPC bridge.
- **Orchestrator is the only scheduler.** Pause semantics (e.g., during meetings) are race-free because nothing dispatches without the orchestrator's consent.
- **MCP Host is a singleton.** One pool of connections shared across all agents — no N-client sprawl.
- **Storage is SQLite + filesystem.** Metadata in SQLite, blobs on disk, SHA256 integrity. File blobs never go in the database.
- **Provider router is the single LLM gateway.** Enforces privacy tiers, concurrency caps, and cost tracking in one place.
- **Events table is append-only.** Source of truth for the real-time dashboard and audit log.
- **Zero phone-home. Ever.** No telemetry, no analytics, no auto-update checks. Updates are explicitly user-triggered.
- **Secrets live in the OS keychain** via keytar. Never in config files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Build | electron-vite + electron-builder |
| Main process | Node.js 20 + TypeScript (strict) |
| Renderer | React 19 + TypeScript + Tailwind CSS + shadcn/ui + Radix |
| State management | Zustand + React Query |
| LLM integration | Vercel AI SDK + provider packages |
| Agent framework | Custom orchestrator (not LangChain/CrewAI) |
| MCP | @modelcontextprotocol/sdk |
| Database | better-sqlite3 + Drizzle ORM |
| Full-text search | SQLite FTS5 |
| Secrets | keytar (OS keychain) |
| Package manager | pnpm workspaces |
| Lint / format | Biome |
| Unit tests | Vitest (1033 tests) |
| E2E tests | Playwright (8 specs) |
| CI | GitHub Actions |

---

## Development

```bash
# Install dependencies (runs electron-rebuild postinstall)
pnpm install

# Start dev server with HMR
pnpm dev

# Run unit tests
pnpm test

# Run E2E tests (builds first)
pnpm -F @team-x/desktop test:e2e

# Typecheck all workspaces
pnpm typecheck

# Lint + format
pnpm lint
pnpm format
```

### Building Installers

```bash
pnpm dist          # Current platform
pnpm dist:win      # Windows NSIS (x64 + arm64)
pnpm dist:mac      # macOS DMG (x64 + arm64)
pnpm dist:linux    # Linux AppImage + .deb (x64)
```

### Database Migrations

```bash
pnpm -F @team-x/desktop exec drizzle-kit generate --name <snake_case_name>
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

---

## Testing

Team-X ships with **1033 unit tests** across the workspace and **8 Playwright E2E specs**:

| Spec | Coverage |
|------|----------|
| `smoke.spec.ts` | Boot, render employees, chat round-trip |
| `ticket-flow.spec.ts` | Create ticket, assign, agent reply |
| `meeting-flow.spec.ts` | Call meeting, interject, end, verify minutes |
| `vault-backup.spec.ts` | Vault upload, integrity check, backup create/verify |
| `rag-flow.spec.ts` | RAG retrieval and attribution in agent turns |
| `command-palette.spec.ts` | Cmd+K intent classification, destructive gate, history |
| `agentic-loop.spec.ts` | Complex-request agentic loop, step log, persisted thread |
| `task-planner.spec.ts` | Write-side planner, amber confirmation gate, decompose → delegate round-trip |

All E2E specs run against a canned test-mode provider — no Ollama, no API keys, no network.

```bash
pnpm test              # Unit tests
pnpm -F @team-x/desktop test:e2e   # E2E (full build + Playwright)
```

---

## Privacy

Team-X is built with a privacy-first posture:

- **Local-first by default.** Runs entirely on local models (Ollama) with no cloud dependency.
- **Zero phone-home.** No analytics, no telemetry, no crash reporting, no auto-update checks.
- **OS keychain for secrets.** API keys are stored in the system keychain via keytar, never in plaintext config files.
- **Privacy tier filtering.** Choose which provider tiers (local, open-source cloud, proprietary cloud) your agents are allowed to use.
- **Your data stays yours.** All data lives in a local SQLite database and filesystem vault on your machine.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, PR guidelines, coding standards, and the role-pack contribution guide.

---

## License

[MIT](LICENSE) &copy; 2026 [Rocky Elsalaymeh](https://github.com/strategia-x)
