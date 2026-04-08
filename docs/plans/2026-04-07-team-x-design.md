# Team-X — Design Document

**Status:** Approved (v1.0)
**Date:** 2026-04-07
**Author:** Rocky Elsalaymeh (vision) · Claude (draft)
**Working name:** Team-X

---

## 1. Summary

Team-X is an **open-source, privacy-first, local-first desktop app for running AI-agent organizations**. Instead of managing prompts or pipelines, you run a **company**: hire employees from a curated Fortune-10-quality role library, assemble an org chart with real hierarchy (Officer → Senior Management → Management → Supervisor → Lead → IC), set company goals, break them into projects, file tickets, watch the team work in real-time on a multi-view cockpit, chat with anyone on demand, and pull everyone into an all-hands meeting with one click.

Default brains are local (Ollama / Qwen / Gemma). Users can plug any OpenAI-compatible, Anthropic, Google, OpenRouter, Groq, Together, Fireworks, or Codex provider. A **privacy tier** toggle lets 100%-local purists, 100%-open-source-cloud users, and cloud-hybrid users all operate as first-class citizens. Nothing phones home.

No backend file-size caps. One-click backup + restore. Cross-platform Electron app, Windows-first polish. Rocky-first now, open-sourced from commit #1, public release in phase 4.

**Tagline candidate:** *"Run an AI company. Not a prompt."*

---

## 2. Positioning

### Who it's for
- **Phase 1–3 (now):** Rocky Elsalaymeh, running Strategia-X and spoke products (ClipForge, Dynasty-X, Lumina Studio, Android-Architect, STX-1, WealthWise, etc.) from a single cockpit.
- **Phase 4+ (public release):** indie founders, solopreneurs, small teams, open-source tinkerers, privacy-focused orgs, and anyone who wants a local-first alternative to Paperclip AI.

### Why it exists
Existing multi-agent frameworks (AutoGen, CrewAI, LangGraph, Mastra) are **libraries**, not **products**. They give you agents; they don't give you a company. Paperclip AI gets the product vibe right but is closed, cloud-only, and doesn't model a real corporate hierarchy. Team-X is the missing piece: a product that treats the org chart as a first-class primitive, is runnable entirely offline, and ships with batteries included.

### Anti-positioning
Team-X is **not**:
- A general-purpose agent framework (use AutoGen/CrewAI for that).
- A no-code automation tool (use n8n/Zapier for that).
- A team project-management SaaS (use Linear/Jira for that — though Team-X will sync to them).
- A coding assistant IDE (use Claude Code/Cursor for that — though Team-X will integrate with them).

---

## 3. Goals and non-goals

### Goals (v1)
1. **Run an AI organization** with real hierarchy, not a flat swarm.
2. **Curated F10-quality role templates** that work out of the box.
3. **Real-time cockpit dashboard** — watch agents think, collaborate, and complete work.
4. **Pre-wired MCPs and CLIs** — Rocky's entire stack works on day one.
5. **Tickets, goals, projects, meetings, chat** as first-class primitives.
6. **Local-first, privacy-first, open-source.** Zero phone-home. Zero cloud lock-in.
7. **Adaptive runtime** — Auto-profiles the user's hardware + providers and picks the right strategy.
8. **One-click backup + restore** with zero file-size limitations.
9. **Cross-platform** (Windows-first polish; Mac + Linux via electron-builder).

### Non-goals (v1)
- Voice / avatar meeting rooms with TTS (phase 5+).
- Image / video generation pipelines (phase 5+).
- Fine-tuning or training custom models (out of scope).
- Mobile companion app (phase 5+).
- Multi-user collaboration within one install (single-operator, multi-company).
- Community role-pack marketplace (phase 4+).

---

## 4. Vision playback (what Rocky actually asked for)

Captured verbatim from brainstorming session 2026-04-07 so future sessions don't lose context:

> "Develop a desktop app similar to Paperclip in terms of workflows, company/project/task setup and agent hierarchy — much like a human-run organization structure. The difference is — I would like default roles.md files already pre-written and formatted. So if a person starts with a CEO — its already precisely framed and articulated F10 quality. If they need a social media specialist — same, the role is highly specified inside a template — and so on. Additionally I want all of my MCPs and CLIs already built-in — with a menu to easily add new ones. I want this product to have zero limitations on backend file-sizes and include a one-click backup function. I would like a realtime dashboard (much like Paperclip AI) where you can see each team-member/agent think/perform tasks/collaborate. I would like a real structure with real hierarchy and real officer/senior management/management/supervisor/lead/deck-level roles. I would like the ability to create company goals/projects/real-time telemetry/analytics/etc. I would like the ability to directly issue tickets/trackers and assign to a team-member. Additionally the ability to chat with a team member in a chat window without having the formality of only communicating via a ticket or workflow. I would like the one-click ability to pause everyone and hold a company meeting. This software will be desktop/privacy first. So that means open-source; local models. Qwen/Gemma/Ollama — with the ability to connect to a Claude API/Codex subscription/etc."

Key elaboration on the runtime model:

> "Create a culmination of all three with a setting that users can adjust (default to auto) based on users configuration, choice of AI models, hardware, etc. However there are many open-source cloud-based providers now too, and I want users to have the flexibility and ability to integrate 100% open-source, cloud-based models if they choose. If using Claude/Codex/cloud-based Qwen/etc. then there won't be the same hardware limitations on inference and compute as with locally installed models. But good models / new generation models are now shrinking in parameters and less reliant on GPU — I expect that trend to slowly continue as AI evolves in general. Having the flexibility and auto functions with personal preferences and adjustability up to the individual user would simply be amazing."

---

## 5. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Team-X Electron App                                          │
│                                                              │
│  ┌──────────────────────────┐   ┌────────────────────────┐   │
│  │ Renderer (React+TS+Tw)   │◀──│ Preload (contextBridge)│   │
│  │  • Cockpit dashboard     │   └──────────▲─────────────┘   │
│  │  • Org chart / tickets   │              │ typed IPC       │
│  │  • Chat / meeting UI     │              │ + WS events     │
│  │  • Role editor           │   ┌──────────▼─────────────┐   │
│  │  • Settings              │   │ Main (Node.js)         │   │
│  └──────────────────────────┘   │                        │   │
│                                 │ ┌────────────────────┐ │   │
│                                 │ │ Orchestrator       │ │   │
│                                 │ │  • Work queue      │ │   │
│                                 │ │  • Worker pool     │ │   │
│                                 │ │  • Model loader    │ │   │
│                                 │ │  • Event bus       │ │   │
│                                 │ └──────────┬─────────┘ │   │
│                                 │            │           │   │
│                                 │ ┌──────────▼─────────┐ │   │
│                                 │ │ Agent Workers      │ │   │
│                                 │ │ (worker_threads)   │ │   │
│                                 │ │  + Vercel AI SDK   │ │   │
│                                 │ │  + role.md         │ │   │
│                                 │ └──────────┬─────────┘ │   │
│                                 │            │           │   │
│                                 │ ┌──────────▼─────────┐ │   │
│                                 │ │ Service Layer      │ │   │
│                                 │ │  • MCP Host        │ │   │
│                                 │ │  • Provider router │ │   │
│                                 │ │  • Ollama manager  │ │   │
│                                 │ │  • Memory / RAG    │ │   │
│                                 │ │  • Ticket service  │ │   │
│                                 │ │  • Meeting service │ │   │
│                                 │ │  • Telemetry       │ │   │
│                                 │ │  • Backup service  │ │   │
│                                 │ └──────────┬─────────┘ │   │
│                                 │            │           │   │
│                                 │ ┌──────────▼─────────┐ │   │
│                                 │ │ Storage            │ │   │
│                                 │ │  • SQLite (WAL)    │ │   │
│                                 │ │  • File vault      │ │   │
│                                 │ │  • Vector store    │ │   │
│                                 │ └────────────────────┘ │   │
│                                 └────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
         │                                         │
         ▼                                         ▼
  ┌─────────────┐                          ┌──────────────┐
  │ Ollama      │                          │ Cloud APIs   │
  │ (subprocess)│                          │  Claude/OAI  │
  └─────────────┘                          │  Groq/OR/... │
                                           └──────────────┘
```

### Architectural principles

1. **Renderer is a pure view.** No direct LLM or MCP calls. All interactions cross the typed IPC bridge into Main. This is a public-release-grade Electron security posture from day one.
2. **Orchestrator is the only scheduler.** If it says pause, nothing dispatches. This is what makes the meeting "pause" primitive race-free.
3. **MCP Host is singleton in Main.** One pool of MCP connections; agents request tool calls via message passing. Prevents 30 child processes spawning 30 copies of Playwright.
4. **Storage is SQLite + file vault.** Metadata in SQLite, blobs on the filesystem. SHA256 integrity on files. No file-size cap.
5. **Provider router is the only place that touches LLM APIs.** It enforces privacy tiers, concurrency limits, and cost tracking.
6. **Event bus is append-only.** The dashboard subscribes; the orchestrator writes. This is the source of truth for "what happened."

### Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** | Cross-platform, mature, Node-native, best MCP SDK support, matches Rocky's existing Electron skills. |
| Build tooling | **electron-vite + electron-builder** | Modern, fast HMR, multi-platform installers. |
| Main process | **Node.js 20 LTS + TypeScript (strict)** | Aligns with Vercel AI SDK + MCP SDK. |
| Renderer | **React 19 + TypeScript + Tailwind + shadcn/ui + Radix** | Rocky's existing muscle, F10 component base. |
| State (renderer) | **Zustand + React Query** | Lightweight, IPC-friendly. |
| LLM layer | **Vercel AI SDK (`ai`)** + provider packages | Provider-agnostic, streaming, tool calling built-in, zero lock-in. |
| Agent framework | **Custom orchestrator on top of AI SDK** | Our org hierarchy doesn't fit LangGraph or Mastra cleanly. Custom is the right call. |
| MCP | **@modelcontextprotocol/sdk** (TypeScript) | Official, first-class. |
| Database | **better-sqlite3 + Drizzle ORM** | Synchronous, fastest Node binding; Drizzle for type-safe migrations. |
| Vector store | **sqlite-vec** (default) with fallback to LibSQL | Simple, Electron-packagable. |
| Full-text search | **SQLite FTS5** | Built-in, no extra deps. |
| Secrets | **keytar** (OS keychain) | Never plaintext. |
| Package manager | **pnpm workspaces** | Fast, strict, no phantom deps. |
| Lint / format | **Biome** | Faster than eslint+prettier. |
| Unit tests | **Vitest** | Vite-native, fast. |
| E2E tests | **Playwright** | Matches Rocky's existing `/browse` workflow. |
| CI | **GitHub Actions** | Standard, cross-platform matrices. |
| License | **MIT** | Rocky-approved open-source default. |

---

## 6. Data model

```sql
-- IDENTITIES
companies       (id, name, slug, created_at, settings_json, icon, theme)
employees       (id, company_id, role_pack_id, role_md_sha, level,
                 name, title, status, model_pref, provider_pref,
                 tools_allowed_json, tools_denied_json, memory_key, avatar)
org_edges       (company_id, manager_id, report_id)

-- WORK
goals           (id, company_id, title, description, status, target_date, kpi_json)
projects        (id, company_id, goal_id, name, description, status, lead_employee_id)
tickets         (id, company_id, project_id, goal_id, type, priority, status,
                 title, body, assignee_id, reporter_id, labels_json,
                 blocked_by_json, sla_at, due_at, created_at, closed_at)
ticket_comments (id, ticket_id, author_id, author_kind, body, created_at)
ticket_activity (id, ticket_id, actor_id, event_type, payload_json, created_at)

-- COMMUNICATION
threads         (id, company_id, kind, subject, created_by, created_at)
                 -- kind: dm | group | meeting | ticket | broadcast
thread_members  (thread_id, member_id, member_kind, role_in_thread)
messages        (id, thread_id, author_id, author_kind, content,
                 token_stream_json, tool_calls_json, parent_id, created_at)

-- MEETINGS
meetings        (id, company_id, type, chair_id, agenda, status,
                 attendees_json, started_at, ended_at, minutes_md,
                 action_items_json, recording_path)

-- TELEMETRY
runs            (id, employee_id, thread_id, ticket_id, provider, model,
                 prompt_tokens, completion_tokens, latency_ms, cost_usd,
                 tool_calls_count, started_at, ended_at, status, error)
events          (id, company_id, actor_id, actor_kind, event_type,
                 payload_json, created_at)

-- STORAGE
file_vault      (id, company_id, owner_kind, owner_id, path, mime,
                 size_bytes, sha256, metadata_json, created_at)
memories        (id, employee_id, kind, key, content, embedding_id, created_at)
embeddings      (id, memory_id, vector BLOB, model, dims)

-- CONFIG
mcp_servers     (id, scope, company_id, name, transport, config_json,
                 enabled, last_health, installed_at)
providers       (id, name, kind, config_json, privacy_tier, enabled)
                 -- privacy_tier: local | open-source-cloud | proprietary-cloud
model_registry  (id, provider_id, model_id, tier, ctx_window, caps_json, updated_at)
role_packs      (id, name, version, source, installed_at, path)
settings        (key, value_json, scope, scope_id, updated_at)

-- BACKUPS
backups         (id, created_at, mode, path, size_bytes, sha256, includes_json)
```

### Key design decisions

- **Polymorphic authorship.** Every column that references an agent or human uses `(id, kind)` where `kind ∈ {employee, human, system, integration}`. This lets chat, tickets, and meetings mix Rocky and agents freely.
- **`events` is the dashboard source of truth.** Orchestrator writes, renderer subscribes via WebSocket over IPC. Append-only; never mutated.
- **`runs` is per-LLM-call telemetry.** Rolled up into company analytics and per-employee scorecards.
- **`memories` + `embeddings` power long-term recall.** So the CEO "remembers" a decision from last month and cites it.
- **`file_vault.path` is filesystem-relative.** Files never live in SQLite blobs — only metadata + hash. This is how we honor the "zero file-size limits" requirement.
- **`role_md_sha` captures the exact version of the role the employee was hired against.** Upstream role-pack updates don't silently mutate live employees.

---

## 7. Role pack format

Role packs are shipped as versioned directories:

```
role-packs/
└─ strategia-official/              # default F10 pack, pre-installed
   ├─ pack.json                     # name, version, author, signature
   ├─ README.md
   └─ roles/
      ├─ officer/
      │  ├─ ceo.md
      │  ├─ coo.md
      │  ├─ cto.md
      │  ├─ cmo.md
      │  ├─ cfo.md
      │  ├─ cso.md       # Chief Security Officer
      │  ├─ cpo.md       # Chief Product Officer
      │  └─ chief-of-staff.md
      ├─ senior-management/
      │  ├─ vp-engineering.md
      │  ├─ vp-marketing.md
      │  ├─ vp-sales.md
      │  ├─ vp-design.md
      │  ├─ vp-operations.md
      │  ├─ vp-finance.md
      │  └─ vp-people.md
      ├─ management/
      │  ├─ engineering-manager.md
      │  ├─ product-manager.md
      │  ├─ marketing-manager.md
      │  ├─ design-manager.md
      │  ├─ operations-manager.md
      │  ├─ finance-manager.md
      │  └─ hr-manager.md
      ├─ supervisor/
      │  ├─ qa-supervisor.md
      │  ├─ devops-supervisor.md
      │  ├─ support-supervisor.md
      │  └─ content-supervisor.md
      ├─ lead/
      │  ├─ tech-lead.md
      │  ├─ design-lead.md
      │  ├─ data-lead.md
      │  ├─ security-lead.md
      │  └─ content-lead.md
      └─ ic/
         ├─ senior-fullstack-engineer.md
         ├─ frontend-engineer.md
         ├─ backend-engineer.md
         ├─ mobile-engineer.md
         ├─ ai-engineer.md
         ├─ devops-engineer.md
         ├─ security-engineer.md
         ├─ qa-engineer.md
         ├─ data-analyst.md
         ├─ data-scientist.md
         ├─ ml-engineer.md
         ├─ ui-designer.md
         ├─ ux-researcher.md
         ├─ brand-designer.md
         ├─ motion-designer.md
         ├─ content-writer.md
         ├─ technical-writer.md
         ├─ copywriter.md
         ├─ seo-specialist.md
         ├─ geo-specialist.md
         ├─ social-media-specialist.md
         ├─ community-manager.md
         ├─ growth-marketer.md
         ├─ email-marketer.md
         ├─ partnerships-manager.md
         ├─ sales-development-rep.md
         ├─ account-executive.md
         ├─ customer-success-manager.md
         ├─ support-engineer.md
         ├─ business-analyst.md
         ├─ finance-analyst.md
         ├─ legal-counsel.md
         ├─ hr-generalist.md
         ├─ recruiter.md
         └─ executive-assistant.md
```

**Target: ~55 curated F10 roles in the default pack.** Each one hand-written to the quality bar of `CLAUDE.md`.

### role.md schema

```markdown
---
id: chief-executive-officer
name: Chief Executive Officer
level: officer                       # officer|senior_management|management|supervisor|lead|ic
reports_to: [board]
manages: [coo, cto, cmo, cfo, cpo]
preferred_model_tier: high           # high|mid|low (resolved against model_registry)
preferred_providers: [anthropic, openai, ollama]
fallback_providers: [groq, openrouter]
preferred_context_window: 200000
tools_allowed: [browse, context7, episodic-memory, email, calendar]
tools_denied: [shell, filesystem_write]
decision_authority: final
escalates_to: []
kpis: [revenue, team_health, product_vision, runway]
cadences:
  - type: standup, every: mon-fri, time: "09:00"
  - type: review, every: fri, time: "16:00"
output_format: exec_brief
temperature: 0.4
license: MIT
author: Strategia-X
version: 1.0.0
---

# Identity
You are the Chief Executive Officer of {{company.name}}. You are the final
decision-maker on company direction, vision, and resource allocation...

# Mission
{{company.mission}}

# Responsibilities
1. Set and defend the 12-month product vision.
2. Allocate budget and headcount across C-suite...

# Decision Framework
When you need to make a call, ask:
1. Does this advance the North Star?
2. What does {{company.values}} say?

# Communication Style
- Terse, executive-brief format
- Lead with the decision, then rationale
- Never hedge; when uncertain, delegate to the right expert

# Escalation Rules
- Escalate to the board when: [...]
- Delegate to COO when: [...]

# Output Format
All written outputs follow this structure:
## Decision
## Rationale
## Action Items (assignees + deadlines)
## Risks
```

### Template variables

Resolved at runtime by the orchestrator before role.md is used as the system prompt:

| Variable | Source |
|---|---|
| `{{company.name}}` | `companies.name` |
| `{{company.mission}}` | `companies.settings_json.mission` |
| `{{company.values}}` | `companies.settings_json.values` |
| `{{employee.name}}` | `employees.name` |
| `{{employee.title}}` | `employees.title` |
| `{{team.manager}}` | Resolved via `org_edges` |
| `{{team.reports}}` | Resolved via `org_edges` |
| `{{today}}` | Current date |
| `{{cwd}}` | Current working directory (for engineering roles) |

One role.md serves many companies.

### Versioning & updates

- Each role pack is versioned semver. Packs live under `~/.team-x/role-packs/`.
- Team-X checks for updates on startup (opt-in, per pack).
- When a user edits a role, the edit is saved as a **local override** at `~/.team-x/role-overrides/<company>/<employee>.md`. Upstream updates never clobber overrides.
- "Reset to upstream" button restores the canonical version.
- Community packs installable via URL or registry (phase 4+).

---

## 8. Agent runtime & orchestrator

### Runtime strategies

Selected at startup based on hardware + provider profile. Changeable in Settings.

| Strategy | When Auto picks it | Behavior |
|---|---|---|
| **Hybrid** (default for mixed local+cloud) | Ollama present + any cloud provider | Persistent identity in SQLite; scheduled execution; 4 concurrent slots (configurable); LRU model loader keeps 1–2 Ollama models hot. |
| **Always-On** (for cloud-only setups) | All configured providers are cloud | Each agent = dedicated worker thread. Long-poll inbox. Near-zero latency. Capped by per-provider rate limits. |
| **Lean** (for low-spec or battery saver) | <16 GB RAM, no GPU, or battery-saver toggle | 1 concurrent slot, serialized. Agents spawn per task, torn down after. |

### Auto-profiling logic

```ts
// apps/desktop/main/orchestrator/profile.ts
async function pickStrategy(): Promise<Strategy> {
  const hw = await profileHardware();           // CPU, RAM, GPU, VRAM
  const providers = await profileProviders();   // configured + reachable
  const models = await profileModels();         // params, ctx, tool-capable

  const hasLocal = providers.some(p => p.kind === 'ollama');
  const hasCloud = providers.some(p => p.kind !== 'ollama');
  const batterySaver = await os.isBatterySaverMode();
  const lowSpec = hw.totalRamGb < 16 || !hw.hasGpu;

  if (batterySaver || lowSpec) return 'lean';
  if (hasCloud && !hasLocal) return 'always-on';
  return 'hybrid';
}
```

### Per-provider concurrency caps

Conservative defaults; user-overridable in Settings.

| Provider | Slots | Rationale |
|---|---|---|
| ollama | 1 (min with available GPU layers) | Local GPU bottleneck |
| anthropic | 4 | Respect tier rate limits |
| openai | 6 | Higher tier allowances |
| openrouter | 8 | Aggregator, higher ceiling |
| groq | 10 | Fast inference, generous limits |
| together | 6 | |
| fireworks | 6 | |
| google | 4 | |
| custom (OpenAI-compatible) | 4 | Safe default |

### Per-agent overrides

Set in `role.md` frontmatter:

```yaml
preferred_providers: [anthropic]    # CEO always uses Opus
preferred_model_tier: high
```

### Work lifecycle

```
1. Trigger arrives (ticket assigned, chat message, meeting call, cron)
2. Orchestrator enqueues WorkItem { agent_id, thread_id, payload }
3. Scheduler picks next WorkItem when a slot frees
4. Scheduler resolves provider+model from role.md + company prefs + registry
5. Scheduler loads memory/context/tools for that agent
6. Worker thread picks up, calls AI SDK streamText()
7. Each token → event bus → dashboard (live)
8. Tool calls intercepted → routed to MCP host → result streamed back
9. Final message persisted → ticket/chat/meeting updated
10. runs row written (tokens, latency, cost) for telemetry
11. Slot released → next WorkItem
```

### Meeting primitive

```
callMeeting({ companyId, attendees, agenda, chair, mode })

  1. Orchestrator sets company.status = 'meeting'
  2. In-flight WorkItems drain (finish current token, persist, release)
  3. Meeting thread created, attendees added
  4. Chair speaks first (agenda framing)
  5. Mode dispatches turns:
     - round-robin: every attendee speaks once per round
     - chair-directed: chair picks next speaker
     - freeform: all can respond, rate-limited
  6. Rocky can interject with <enter> at any time
  7. [End Meeting] button:
     - Summarizer agent drafts minutes_md
     - LLM extracts action items → creates tickets
     - company.status = 'running', queue resumes
```

The "all agents can pause" invariant: the orchestrator is the **only** scheduler. When it says pause, nothing new dispatches. This is what makes the meeting primitive clean — zero race conditions with in-flight work starting new tool calls mid-pause.

---

## 9. UI surfaces

### Window layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [🏢 Strategia-X ▾] [Dashboard] [Org] [Projects] [Tickets]       │
│                    [Meetings] [Chat] [Files] [Telemetry] [⚙️]   │
├────────┬────────────────────────────────────────────────────────┤
│        │                                                         │
│ Side   │   (main content area — view switches per tab)          │
│ nav    │                                                         │
│        │                                                         │
│ • CEO  │                                                         │
│ • COO  │                                                         │
│ • CTO  │                                                         │
│ • ...  │                                                         │
│        │                                                         │
│ [+Hire]│                                                         │
│        │                                                         │
│ ────── │                                                         │
│ [▶ Call│                                                         │
│  Meet- │                                                         │
│  ing]  │                                                         │
│        │                                                         │
│ ────── │                                                         │
│ Status:│                                                         │
│ 4 busy │                                                         │
│ 12 idle│                                                         │
│ 2 meet │                                                         │
└────────┴────────────────────────────────────────────────────────┘
```

### Top-level tabs

| Tab | Subviews | Purpose |
|---|---|---|
| **Dashboard** | Cards, Org, Timeline, Stream, Floor | The cockpit. Default is Cards with live token streams. |
| **Org** | — | Org chart editor (drag-to-rearrange, hire/fire, promote/demote). |
| **Projects** | Kanban, List | Goals and projects linked to tickets. |
| **Tickets** | Kanban, List, Roadmap | The tracker. Assignable, syncable to external. |
| **Meetings** | List, Detail | Past meetings with minutes + action items. |
| **Chat** | DM, Group, Channel | Slack-style. DMs with any employee. |
| **Files** | Grid, List | The file vault. Full-text search. |
| **Telemetry** | Company, Employee, Cost | Analytics: tokens/day, cost/day, velocity, SLA. |
| **Settings** | Providers, MCPs, Runtime, Role Packs, Backups, Privacy | All user-configurable knobs. |

### Key interactions

- **Hire** — opens role library; pick role → auto-fills suggested name/title/model/tools → confirm → employee added.
- **Chat with employee** — click any card → side drawer with full thread + input box + "thinking" indicator when they reply.
- **Assign ticket** — drag ticket to employee card, or right-click → assign → employee picker.
- **Watch agent think** — card shows live token stream. Click card → modal with full run detail (tool calls, reasoning, timings, cost).
- **Call meeting** — persistent sidenav button. Opens modal, picks attendees, starts meeting thread.
- **Switch company** — top-left workspace switcher. Everything in the cockpit swaps context instantly.

### Design system

- **Accent color:** `#FFAA2024` (Strategia red).
- **Theme:** Dark by default, light mode available.
- **Grid:** 8-point system (4px fine adjustments).
- **Typography:** Inter (headings) + JetBrains Mono (code/streams); 1.2 line-height headings, 1.5–1.6 body, 65–75ch max.
- **Components:** Tailwind + shadcn/ui + Radix primitives.
- **Icons:** Lucide React.
- **Charts:** Recharts (matching Strategia-X conventions).
- **Motion:** 150–300 ms for feedback, 300–500 ms for transitions, ease-out entrances, ease-in exits.
- **Accessibility:** WCAG 2.1 AA minimum, AAA for critical text; full keyboard nav; 44 px touch targets.
- **States:** Every interactive element has hover, focus, loading, error, empty, disabled.

---

## 10. File vault, unlimited sizes, one-click backup

### File vault

- All files live under `~/.team-x/companies/<company-slug>/vault/`.
- **Zero SQLite blob storage.** Everything on the filesystem; only metadata in `file_vault`.
- **SHA256 integrity** on write, verified on read.
- **Full-text search** via SQLite FTS5 on extracted text (PDFs, docs, markdown, code; images via OCR in phase 2).
- **Attach to ticket** — pulls a file into a ticket's evidence list.
- **Share with agent** — exposes a file to an agent's context (inline or via a tool the agent can call).
- **No file-size cap.** Limited only by disk.

### Backup

One-click export: `teamx-backup-<company>-<timestamp>.zip` containing:

- Full SQLite dump (`.sql`, compressed)
- Entire vault directory (files verbatim)
- `role-overrides/` for that company
- `mcp.json` for that company
- `manifest.json` with version, hashes, restore instructions

**Backup modes:**

| Mode | Destination | Trigger |
|---|---|---|
| **Local** | User-chosen folder | Manual or scheduled |
| **External drive** | Mounted USB | Manual or scheduled |
| **Cloud** | BYO S3/R2/GCS/Backblaze credentials | Opt-in only |

**Restore:** one-click file picker → verify hashes → restore SQLite → restore vault → reconcile.

**Scheduled backups (opt-in):** daily/weekly, retention policy (7 daily, 4 weekly, 6 monthly).

**Privacy guarantee:** nothing leaves the machine without explicit opt-in.

---

## 11. Security & privacy

| Concern | Mitigation |
|---|---|
| **API keys in cleartext** | Stored in OS keychain via `keytar` (Windows Credential Manager / macOS Keychain / Secret Service). |
| **Privacy tier leaks** | `providers.privacy_tier` enforced at provider router; filter toggle hides proprietary-cloud providers. |
| **Cross-company data leaks** | Each company is a separate directory + scoped queries. Zero cross-contamination. |
| **Agent shell access** | `tools_denied: [shell, filesystem_write]` enforced at MCP host, not agent good behavior. |
| **Phone-home telemetry** | **Never.** No calls home. No anonymized metrics. Updates are explicitly user-triggered. |
| **Renderer RCE** | Context isolation on; no node integration; all IPC through typed preload bridge. |
| **Unsigned role packs** | Signature verification when installing community packs (phase 4+). |
| **Audit gaps** | `events` table is append-only; every sensitive action (hire, fire, MCP add, backup restore) logged with actor + timestamp. |

---

## 12. Repository layout

```
Team-X/
├─ apps/
│  └─ desktop/                      # Electron app
│     ├─ main/                      # Node main process
│     │  ├─ orchestrator/
│     │  ├─ agents/
│     │  ├─ services/
│     │  │  ├─ mcp-host/
│     │  │  ├─ providers/
│     │  │  ├─ ollama/
│     │  │  ├─ memory/
│     │  │  ├─ tickets/
│     │  │  ├─ meetings/
│     │  │  ├─ telemetry/
│     │  │  └─ backup/
│     │  ├─ ipc/
│     │  └─ db/
│     ├─ preload/
│     ├─ renderer/                  # React app
│     │  ├─ src/
│     │  │  ├─ app/
│     │  │  ├─ features/
│     │  │  │  ├─ dashboard/
│     │  │  │  ├─ org/
│     │  │  │  ├─ projects/
│     │  │  │  ├─ tickets/
│     │  │  │  ├─ meetings/
│     │  │  │  ├─ chat/
│     │  │  │  ├─ files/
│     │  │  │  ├─ telemetry/
│     │  │  │  └─ settings/
│     │  │  ├─ components/
│     │  │  ├─ hooks/
│     │  │  ├─ lib/
│     │  │  └─ styles/
│     │  └─ index.html
│     └─ electron.vite.config.ts
├─ packages/
│  ├─ shared-types/                 # TS types shared main↔renderer
│  ├─ role-schema/                  # role.md parser + validator
│  ├─ provider-router/              # AI SDK wrappers + privacy tiers
│  ├─ mcp-client/                   # typed MCP wrapper
│  └─ telemetry-core/               # token/cost/latency math
├─ role-packs/
│  └─ strategia-official/           # default F10 pack (versioned)
├─ docs/
│  ├─ plans/
│  │  └─ 2026-04-07-team-x-design.md
│  ├─ architecture/
│  └─ user-guide/
├─ scripts/
├─ .github/workflows/
├─ CLAUDE.md
├─ README.md
├─ LICENSE                          # MIT
├─ package.json                     # pnpm workspace
└─ tsconfig.json
```

---

## 13. Phase plan

Four phases. Each phase ends with a shippable demo.

### Phase 1 — Skeleton (MVP shell)

**Deliverables:**
- Electron + Vite + React + Tailwind + shadcn boot
- SQLite + Drizzle migrations for core tables
- Single hardcoded company + CEO + 1 SWE
- Provider router with Anthropic + Ollama only
- One agent worker responding to a chat message via AI SDK
- Bare Cards dashboard with live token stream
- No tickets, no meetings, no MCP yet

**Demo:** *"I can hire a CEO, chat with it, and watch it think."*

### Phase 2 — The Org

**Deliverables:**
- Full role pack loader + ~55 hand-written F10 roles
- Multi-company workspace switcher
- Org chart editor + hire/fire/promote
- Employee-to-employee messaging via orchestrator
- MCP host + pre-wired global MCPs
- Ticket service + kanban view
- Ticket assignment wakes an agent

**Demo:** *"I can file a ticket, an agent picks it up, uses an MCP, and closes it."*

### Phase 3 — The Live Cockpit

**Deliverables:**
- All five dashboard subviews (Cards/Org/Timeline/Stream/Floor)
- Meeting primitive (pause, group thread, auto-minutes, action items → tickets)
- Goals + projects + per-company telemetry
- Runtime mode switcher + hardware profiling
- Privacy tier filter
- Settings UI for providers/models/MCPs

**Demo:** *"One-click all-hands, agents discuss, minutes auto-generated, tickets auto-filed."*

### Phase 4 — Ship-readiness

**Deliverables:**
- File vault with FTS5 + attach-to-ticket
- Backup/restore (local + external drive)
- Scheduled backups
- Audit log UI
- Cross-platform installers via electron-builder
- Landing site + README + LICENSE + user guide
- Open-source public release

**Demo:** *"Public GitHub release, full documentation, installable on Win/Mac/Linux."*

---

## 14. Open questions deferred to implementation

| Topic | Default proposal | When to decide |
|---|---|---|
| Embedding model | Ollama `nomic-embed-text`, benchmark vs BGE-M3 | Phase 2 |
| SQLite vector extension | `sqlite-vec` | Phase 2, validate Electron packaging |
| Meeting transcription | Text-only in phase 3; optional Whisper in phase 4+ | Phase 4 |
| Agent self-directed cadences | Yes, via cron triggers from `role.md` `cadences` | Phase 3 |
| Cost tracking unit economics | Ships as versioned JSON pricing table | Phase 3 |
| Update model registry | Pulled from signed manifest; user-triggered only | Phase 4 |
| Community role-pack marketplace | Phase 4+; signed packs; URL install first | Phase 4 |
| Mobile companion | Out of scope for v1 | — |
| Voice meeting rooms | Out of scope for v1 | — |

---

## 15. Decisions log

Captured from the brainstorming session on 2026-04-07. Every decision below is locked unless explicitly revisited.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Audience: Rocky-first, public later.** Windows-first polish, MCPs pre-wired to Rocky's stack, open-sourced from commit #1. | Optimizes for speed without closing off the public release path. |
| D2 | **Stack: Electron + React + TypeScript + Node.js + SQLite.** | Fastest path given Rocky's muscle; MCP SDK is Node-native; better-sqlite3 is battle-tested. |
| D3 | **Agent brain: Vercel AI SDK + custom orchestrator.** | Provider-agnostic, streaming + tool calling built-in, zero lock-in. Org hierarchy is differentiated custom code. |
| D4 | **Runtime model: adaptive, user-configurable.** Auto mode default; Hybrid / Always-On / Lean strategies; per-provider caps; per-agent overrides; privacy tier tagging. | Honors hardware constraints for local-only users AND scales up for cloud-heavy users. Model registry is versioned JSON so new model generations don't require app releases. |
| D5 | **Scoping: multi-company per install, each with its own org/goals/projects/tickets/MCP config/telemetry.** Workspace switcher swaps context. | Perfect for Rocky running Strategia-X + ClipForge + Dynasty-X + Lumina + STX-1 + WealthWise from one cockpit. |
| D6 | **Role templates: curated F10 library, editable, versioned.** ~55 hand-written roles across 6 hierarchy levels. Role packs are semver-versioned directories. User edits saved as local overrides. | The "wow" of opening the app and finding 55 F10 roles is the core value prop. |
| D7 | **Meeting primitive: pause work + group thread + auto-minutes + action items → tickets.** Round-robin / chair-directed / freeform modes. Rocky can interject live. | Faithful to Rocky's "one-click pause and hold a meeting" request; turns into real deliverables. |
| D8 | **Dashboard: multi-view cockpit with live token streams.** Cards (default) + Org + Timeline + Stream + Floor. | Card grid with live streams is the "watch them think" Paperclip magic. Other views are toggle-instant. |
| D9 | **Tickets: homegrown + optional bidirectional sync to Linear/GitHub/Jira/Notion.** | Privacy-first by default; zero lock-in; sync is opt-in per company. |
| D10 | **MCPs: global defaults + per-company overrides + per-agent allowlists.** All Rocky's MCPs pre-wired globally. Add MCP menu supports registry, URL, stdio command, OAuth. | Three layers match the multi-company + role-diverse reality. |
| D11 | **File vault: filesystem-backed, metadata-only in SQLite, SHA256 integrity, FTS5 search.** | Honors zero-file-size-limit requirement cleanly. |
| D12 | **Backup: one-click ZIP (SQLite dump + vault + overrides + mcp.json + manifest).** Local / external drive / BYO cloud. Scheduled backups opt-in. | Privacy-first with real ergonomics. |
| D13 | **Security: keytar for secrets, privacy tier filter, MCP sandboxing, append-only audit log, context-isolated renderer, zero phone-home.** | Public-release-grade Electron security from day one. |
| D14 | **License: MIT.** | Rocky-approved open-source default. |
| D15 | **Phase plan: 4 phases (Skeleton → Org → Live Cockpit → Ship-readiness).** Each phase ships a demo. | Forces real progress and prevents the 90%-done trap. |

---

## 16. Next steps

1. **This document is the source of truth** for Team-X design. All future sessions should read it before proposing changes.
2. **Hand off to the writing-plans skill** to produce the detailed Phase 1 implementation plan.
3. **Initialize the repository** (pnpm init, Electron scaffold, Drizzle, Tailwind, shadcn, Biome, Vitest) per the Phase 1 deliverables.
4. **Write the first role.md** (CEO) as the quality-bar reference; all other roles will be benchmarked against it.

---

*End of design document.*
