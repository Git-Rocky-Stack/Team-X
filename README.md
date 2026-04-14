<div align="center">

# Team-X

**Run an AI company. Not a prompt.**

[![CI](https://github.com/strategia-x/team-x/actions/workflows/ci.yml/badge.svg)](https://github.com/strategia-x/team-x/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-612%20passing-brightgreen.svg)](#testing)
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
      db/                   SQLite + Drizzle ORM (8 migrations)
      ipc/                  Typed IPC handlers (50+ channels)
      orchestrator/         Agent scheduler + event bus
      services/             Vault, backup, MCP host, providers, updater
    src/preload/            Context-isolated bridge (TeamXApi)
    src/renderer/           React 19 + Tailwind + shadcn/ui
      features/             Audit, chat, dashboard, hire, meetings,
                            projects, settings, telemetry, tickets, vault
      hooks/                17 React Query hooks
      store/                Zustand app store
    e2e/                    3 Playwright specs
  packages/
    shared-types/           IPC contract types
    role-schema/            Role.md parser + template renderer
    provider-router/        LLM provider registry + streaming adapters
    telemetry-core/         Cost calculation utilities
  role-packs/
    strategia-official/     55 curated F10 roles across 6 levels
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
| Unit tests | Vitest (612 tests) |
| E2E tests | Playwright (4 specs) |
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

Team-X ships with **612 unit tests** across 55 test files and **4 Playwright E2E specs**:

| Spec | Coverage |
|------|----------|
| `smoke.spec.ts` | Boot, render employees, chat round-trip |
| `ticket-flow.spec.ts` | Create ticket, assign, agent reply |
| `meeting-flow.spec.ts` | Call meeting, interject, end, verify minutes |
| `vault-backup.spec.ts` | Vault upload, integrity check, backup create/verify |

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
