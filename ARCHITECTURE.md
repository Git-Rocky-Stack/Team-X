# Team-X Architecture

**Version:** 3.4.0 (released 2026-07-11; unreleased work since on `main`)  
**Description:** Run an AI company. Not a prompt.

## Overview

Team-X is a sophisticated desktop application for operating AI companies — a simulation platform where users hire AI agents, assign work, and orchestrate multi-agent collaboration. Built on Electron with React, it combines a rich UI with a powerful multi-agent orchestration engine.

## Architecture Principles

1. **Modular Monorepo** — pnpm workspace with shared packages
2. **Pure Core** — Business logic isolated from Electron, testable without the framework
3. **Event-Driven** — Orchestrator emits events; renderer subscribes via IPC
4. **Type-Safe IPC** — Contract-based communication with shared TypeScript types
5. **Zero Phone-Home** — No telemetry exfiltration; all data stays local

## Project Structure

```
Team-X/
├── apps/
│   └── desktop/              # Main Electron app
│       ├── src/
│       │   ├── main/         # Node.js backend (orchestrator, services, IPC)
│       │   ├── preload/      # Secure IPC bridge (contextBridge)
│       │   └── renderer/     # React UI (Vite + Tailwind)
│       ├── drizzle.config.ts
│       └── package.json
├── packages/
│   ├── intelligence/         # NLU, RAG, agentic loop
│   ├── local-gguf-runtime/   # GPU probe, llama.cpp server lifecycle, LRU pool, GGUF parser, folder watcher
│   ├── provider-router/      # AI provider adapters (Anthropic, OpenAI, etc.)
│   ├── role-schema/          # Role pack parser + renderer + pack signing
│   ├── shared-types/         # TypeScript types, IPC contracts
│   └── telemetry-core/       # Cost calculation, pricing data
├── role-packs/               # AI role definitions (Markdown + YAML frontmatter)
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
└── vitest.config.ts          # Root Vitest config; `projects` lists each package
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Desktop Shell** | Electron 44 |
| **UI Framework** | React 19 + Vite 5 |
| **Styling** | Tailwind CSS 3 |
| **Database** | SQLite + Drizzle ORM |
| **State Management** | Zustand + TanStack Query |
| **Testing** | Vitest + Playwright |
| **AI Integration** | AI SDK (Vercel) + custom adapters |
| **Secrets** | keytar (OS keychain) |
| **Build** | electron-vite + electron-builder |

## Package Dependencies

```
@team-x/desktop
  ├─→ @team-x/intelligence        (NLU, RAG, agentic loop)
  ├─→ @team-x/local-gguf-runtime  (native GGUF runtime behind the Models tab)
  ├─→ @team-x/provider-router     (AI provider adapters)
  ├─→ @team-x/role-schema         (role pack loader)
  ├─→ @team-x/shared-types        (IPC contracts, entities)
  └─→ @team-x/telemetry-core      (cost tracking)

@team-x/local-gguf-runtime
  └─→ @team-x/shared-types

@team-x/intelligence
  ├─→ @team-x/shared-types
  └─→ @team-x/provider-router

@team-x/provider-router
  └─→ @team-x/shared-types
```

## Core Systems

### 1. Orchestrator (Main Process)

The orchestrator is the heart of Team-X. It:

- Dispatches agent turns FIFO through an in-module dispatcher (`pending` list + `scheduleDispatch`) gated by per-thread, per-provider and per-company in-flight accounting plus budget admission
- Manages concurrency (orchestrator slots, provider caps)
- Routes work to providers (Anthropic, OpenAI, Ollama, etc.)
- Emits events to the live dashboard
- Persists runs, messages, and telemetry

**Key Files:**
- `apps/desktop/src/main/orchestrator/index.ts` — Orchestrator builder
- `apps/desktop/src/main/orchestrator/event-bus.ts` — Event fan-out
- `apps/desktop/src/main/orchestrator/index.ts` also holds the dispatcher (`pending` + `scheduleDispatch`); there is no standalone queue module

### 2. Provider Router

Abstraction layer over AI providers. Supports:

- **Anthropic** (Claude Opus, Sonnet, Haiku)
- **OpenAI** (GPT-4, GPT-3.5)
- **Google** (Gemini)
- **OpenRouter**, **Groq**, **Together**, **Fireworks**
- **Ollama** (local models)
- **OpenAI-compatible** endpoints

**Key Files:**
- `packages/provider-router/src/registry.ts` — Provider factory
- `packages/provider-router/src/adapters/` — Per-provider adapters
- `packages/provider-router/src/stream.ts` — Streaming response handler

### 3. Role Schema System

Role packs define agent behavior using Markdown + YAML frontmatter:

```markdown
---
role_id: senior-fullstack-engineer
name: Sarah Chen
level: Senior Management
preferred_model_tier: claude-opus
tools_allowed:
  - file.read
  - file.write
tools_denied:
  - network.request
---

You are a Senior Full-Stack Engineer...
```

**Key Files:**
- `packages/role-schema/src/parse.ts` — Frontmatter parser
- `packages/role-schema/src/render.ts` — Prompt template engine
- `packages/role-schema/src/pack-signature.ts` — SHA256 verification

### 4. Database Layer (Drizzle ORM)

SQLite database with full-text search (FTS5). Embeddings are stored as BLOBs and ranked in-process by the intelligence package (no SQLite vector extension):

**Repos** (thin data access layer):
- `companies.ts`, `employees.ts`, `tickets.ts`, `goals.ts`, `projects.ts`
- `threads.ts`, `messages.ts`, `runs.ts`, `events.ts`
- `mcp-servers.ts`, `extensions.ts`, `authority.ts`
- `embeddings.ts` (RAG), `copilot-insights.ts`
- `enhanced-ai-memory.ts` (Enhanced AI long-term memory + knowledge graph, migration `0037`)

**Migrations:**
- `apps/desktop/src/main/db/migrations/` — SQL schema evolution
- `apps/desktop/src/main/db/schema.ts` — Drizzle schema definitions

### 5. IPC Layer

Request/response and event streaming between main and renderer:

**Request Channels** (invoke/handle):
- `companies.*`, `employees.*`, `tickets.*`, `goals.*`, `projects.*`
- `meetings.*`, `vault.*`, `backup.*`, `providers.*`
- `command.*`, `copilot.*`, `rag.*`
- `localGguf.*` (36 channels, registered by the `registerLocalGguf*Handlers` functions)
- `paperclip.*` (preview + save a converted Paperclip export), `privateOperator.*` (read-only access plan + snapshot)
- `enhancedAi.*` (7 channels registered in main but not bridged to the renderer)

**Event Channel** (one-way push):
- `events.dashboard` — Fanned out to all BrowserWindows

**Key Files:**
- `apps/desktop/src/main/ipc/register.ts` — Channel registration
- `apps/desktop/src/main/ipc/handlers.ts` — Pure handler functions
- `apps/desktop/src/preload/index.ts` — ContextBridge glue

### 6. Intelligence Package

NLU, RAG, and agentic loop capabilities:

**Natural Language Understanding:**
- `intent-classifier.ts` — Classify user commands (e.g., "assign ticket to Bob")
- `entity-resolver.ts` — Resolve entities (employees, tickets, goals)
- `slot-filler.ts` — Extract parameters from natural language

**Retrieval-Augmented Generation (RAG):**
- `embeddings.ts` — Text embedding (Ollama, OpenAI)
- `chunker.ts` — Split long content into chunks
- `retriever.ts` — Vector similarity search
- `ann-index.ts` — IVF approximate nearest-neighbour index (k-means clusters, no native dependency)
- `service.ts` — RAG orchestration: exact cosine scan per company, switching to the IVF index once a company holds 4,096 or more vectors

**Enhanced AI (long-term memory, knowledge graph, planning):**
- `memory/long-term.ts` — LLM fact extraction with freshness scoring
- `knowledge/graph.ts` — Cross-thread entity/relationship graph
- `service/unified.ts` — Composes RAG, query expansion, memory, graph, planning and tracing
- Desktop wiring: `apps/desktop/src/main/services/enhanced-ai.ts` (created whenever RAG is enabled with an embedding provider). Memory and the graph persist through `db/repos/enhanced-ai-memory.ts` into the four `0037_enhanced_ai_memory` tables (`memory_facts`, `memory_summaries`, `knowledge_nodes`, `knowledge_edges`). The stack grounds Copilot answers via the `search_company_knowledge` tool, and completed `copilot.ask` exchanges feed long-term memory

**Agentic Loop (ReAct):**
- `loop.ts` — Multi-step reasoning with tools
- `prompt.ts` — System prompt builder
- `tool-registry.ts` — Tool discovery and invocation

### 7. Telemetry & Cost Tracking

Token counting, latency measurement, and cost attribution:

**Key Files:**
- `packages/telemetry-core/src/cost.ts` — Cost calculation
- `packages/telemetry-core/src/pricing.json` — Model pricing data
- `apps/desktop/src/main/db/repos/budgets.ts` — Budget governance

### 8. External Runtime Adapters

Team-X can launch external agent runtimes (Bash, HTTP, Codex, Cursor):

**Key Files:**
- `apps/desktop/src/main/services/external-runtime-adapters.ts`
- `apps/desktop/src/main/db/repos/runtime-sessions.ts`
- `apps/desktop/src/main/db/repos/runtime-profiles.ts`

## Data Flow

### Chat Turn Request

```
1. Renderer sends IPC: chat.send({ threadId, employeeId, content })
2. Handler creates message row → appends to thread
3. Orchestrator appends the task to its in-module `pending` list and calls `scheduleDispatch()`
4. Dispatcher (once slot, provider, thread, company and budget admission allow):
   - Resolves provider for employee
   - Builds system prompt (role + skills + context)
   - Streams response via provider-router
   - Writes run row (tokens, cost, latency)
5. Events fan out:
   - work.started → renderer shows "thinking" badge
   - work.progress → renderer streams response chunks
   - work.completed → renderer shows final message
   - work.failed → renderer shows error
```

### Agentic Loop Execution

```
1. Command palette: "Build a landing page for my SaaS"
2. NLU classifies: intent = complex_request
3. AgenticLoopService.start():
   - Creates thread (kind = 'dm')
   - Resolves system-agent employee
   - Builds tools (read-side + write-side)
   - Loop: ReAct (thought → action → observation → repeat)
4. Each tool call:
   - Pre-authorization check (authority matrix)
   - Execution (MCP server, built-in tool, or write-side)
   - Result appended to context
5. Loop completes → summary + artifacts
```

### Copilot Analysis (M33)

```
1. Periodic tick (every N minutes, per settings)
2. CopilotEventWindow.snapshot(companyId) → bounded event buffer
3. System-copilot generates insights:
   - Operational (blocked tickets, overdue goals)
   - Cost (burn rate, budget risk)
   - Org (imbalanced workload)
   - Workflow (repeated patterns)
   - Anomaly (unusual events)
4. Deduplication:
   - Jaccard bigram similarity > 0.8 → merge
   - Numeric drift guard → always insert if numbers changed
5. Upsert to copilot_insights table
6. Fans out:
   - copilot.insight → renderer shows insight card
```

## Security Model

### 1. Secret Storage
- API keys stored in OS keychain via keytar
- Never logged or included in error messages
- Test mode bypasses keychain for E2E tests

### 2. Authority Matrix
- `authority_grants`: capability + path permissions
- `authority_requests`: pending approval workflow
- Per-scope: company, employee, extension
- Permissions: allow, deny, prompt (ask user)

### 3. Sandbox Isolation
- Renderer: context isolation ON, Node integration OFF, Chromium sandbox ON, webSecurity ON
- Preload: No direct Node access; uses contextBridge
- MCP servers: Run in child processes, not main thread

### 3a. Renderer Trust Boundary (`main/security/renderer-boundary.ts`)
- **IPC sender guard.** Installed on `ipcMain` before any handler registers. Every `handle`/`on` listener refuses a sender that is not the app's own top-level frame, so a foreign page refuses IPC even with the real preload.
- **Navigation.** The window cannot navigate off the app, open new windows, or attach a `<webview>`. `https:` and `mailto:` links open in the user's browser; every other scheme is dropped.
- **Permissions.** All permission requests are denied, except the sanitized clipboard write that the Commands copy button uses.
- **CSP.** Every build ships the strict policy in `apps/desktop/renderer-csp.ts`: no eval, no inline or remote script, no network origins. Only `electron-vite dev` keeps the relaxed HMR policy. `scripts/check-packaged-csp.mjs` verifies the built page in CI and in the release workflow.
- **Proof.** `e2e/security-boundary.spec.ts` exercises all of the above against the built app.

### 4. Content Security
- FTS5 full-text search for vault (extracted text only)
- MCP tool calls logged (input/output truncated to 8KB)
- File uploads: SHA256 verification, path sanitization

## Architectural Invariants

1. **Event Bus is Single Source of Truth** — All state changes emit events; renderer derives from events, not direct queries
2. **Meeting Mode is Mutually Exclusive** — When `companies.status = 'meeting'`, no other work runs for that company
3. **Orchestrator is Fire-and-Forget** — Enqueue returns immediately; work happens in background
4. **No File Blobs in SQLite** — Files stored on disk; only metadata in DB
5. **All LLM Calls Route Through Provider-Router** — Embeddings, completions, agentic loop
6. **Event Log is Append-Only** — Never delete or update events; use retention policy
7. **Zero Phone-Home** — No telemetry exfiltration; all data stays local

## Performance Considerations

### Concurrency
- **Orchestrator slots** (default 4): Max parallel work items
- **Provider caps** (per provider): Prevent API rate limits
- **Runtime sessions**: External agent liveness tracked via heartbeat

### Database
- **FTS5**: Full-text search on vault files
- **RAG ranking**: in-process cosine similarity over BLOB embeddings — exact per company, IVF approximate index at 4,096+ vectors
- **Indexes**: Strategic indexes on hot paths (company_id, status, created_at)
- **WAL mode**: Enabled for concurrent read/write

### UI
- **TanStack Query**: Cached data, background refetch
- **Virtual scrolling**: For long lists (tickets, events)
- **Debouncing**: Command palette, insight deduplication

## Testing Strategy

### Unit Tests (Vitest)
- Pure functions: role parsing, cost calculation, NLU classifiers
- Repo layer: in-memory SQLite or mocked DB
- Handler functions: pure request/response

### Integration Tests (Vitest)
- Orchestrator flow: enqueue → stream → complete
- Provider adapters: mock HTTP responses
- RAG pipeline: embed → retrieve → rank

### E2E Tests (Playwright)
- Smoke test: boot → hire → chat → ticket
- Ticket flow: create → assign → close
- Meeting flow: call → interject → end

## Development Workflow

```bash
# Install dependencies
pnpm install

# Type-check all packages
pnpm typecheck

# Run unit tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Dev server (hot reload)
pnpm dev

# Build for production
pnpm build

# Build installers
pnpm dist:win    # Windows
pnpm dist:mac    # macOS
pnpm dist:linux  # Linux
```

## Roadmap

**Phase 4** (Complete):
- File vault (M21)
- Ticket attachments (M22)
- Backup/restore (M23)
- Audit log (M24)
- Auto-updater (M25)

**Phase 5** (Complete):
- RAG embeddings (M28)
- Command palette (M30)
- Agentic loop (M31)
- Task planner (M32)
- Copilot analyzer (M33)

**Phase 6** (Complete):
- Proactive execution engine
- Agent wakeup queue
- Routine-driven work

**v3.4.0 — Command Console aesthetic sweep** (released 2026-07-11):
- Renderer recomposed onto the Command Console / Carbon Pro design system (`DESIGN.md`):
  faceplates, recessed wells, LCD readouts, stencil word-lamps, data-bound VU meters
- Dual-shift theming — Night Ops (default) + Day Shift silver; displays stay dark in both
- Local GGUF groundwork (the v3.3.0 scope) shipped inside this release as backend-only
  infrastructure: `@team-x/local-gguf-runtime`, `0036_local_gguf`, `localGguf.*` IPC

**Unreleased (on `main` since v3.4.0):**
- **Models tab** — Library / Discover (Hugging Face) / Endpoints / Runtime panels plus per-model
  benchmarks over the 36 `localGguf.*` channels. The `@team-x/local-gguf-runtime` package holds
  GPU probing (CUDA / ROCm / Vulkan / Metal / CPU), llama.cpp server lifecycle, LRU model pool,
  GGUF metadata parser and folder scanning + network-share-resilient watchers; the Hugging Face
  client and the benchmark runner live in `apps/desktop/src/main/services/local-gguf/`
  (`hf-service.ts`, `benchmark-service.ts`). A GGUF model is not yet an agent provider
  (`ProviderKind` has no GGUF member) — Ollama remains the local agent-provider path
- **Enhanced AI** — the `@team-x/intelligence` stack is created whenever RAG is enabled with an
  embedding provider; it grounds Copilot answers (`search_company_knowledge`), and completed
  `copilot.ask` exchanges feed long-term memory. Memory and the knowledge graph persist in
  SQLite (`0037_enhanced_ai_memory`)
- **Private Operator Access** (`privateOperator.*`) — read-only decision record; nothing opens a listener
- **Paperclip Import** (`paperclip.*`) — preview an export folder and save it as a package that
  Portability's `companies.importPackage` commits

---

*Last updated: 2026-10-07*
