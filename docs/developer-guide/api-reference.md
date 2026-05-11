# Developer Reference

**Extension points for Team-X**

---

> **Team-X is a local-first desktop app.** It does **not** expose a hosted REST API, webhooks, OAuth, a plugin marketplace, or third-party SaaS integrations (GitHub PR auto-review, Slack, Jira, Notion, etc.). All runtime state lives in your local SQLite database; all LLM calls go directly from your machine to the provider you configured. There is no `api.team-x.app` or hosted service to integrate against.
>
> The two extension points that **do** ship are documented here:
>
> 1. **MCP servers** — give agents new tools, resources, and prompts via the [Model Context Protocol](https://modelcontextprotocol.io).
> 2. **Role packs** — extend the curated catalog with your own role specifications.
>
> If you need the in-app command surface (Cmd+K, agentic loop, copilot), see the user-guide. If you need the developer CLI, see `docs/user-guide/cli-reference.md`.

---

## Table of Contents

1. [Architecture](#architecture)
2. [MCP Servers](#mcp-servers)
3. [Role Packs](#role-packs)
4. [Local IPC Surface (internal)](#local-ipc-surface-internal)
5. [Testing](#testing)
6. [Resources](#resources)

---

## Architecture

Team-X is an Electron app with three processes and four packages.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Team-X Desktop (Electron)                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Renderer process (React + Zustand + React Query + Tailwind)       │
│      │                                                              │
│      │  contextBridge IPC (preload.ts, sandboxed)                  │
│      ▼                                                              │
│  Main process                                                       │
│      ├── Orchestrator  (run-queue, event bus, agent runtime)       │
│      ├── @team-x/provider-router (Anthropic, OpenAI, Ollama,       │
│      │     Google, Groq, OpenRouter, Together, Fireworks,          │
│      │     OpenAI-compatible)                                       │
│      ├── @team-x/intelligence (RAG, agentic loop, copilot,         │
│      │     command palette, task planner)                           │
│      ├── @team-x/shared-types (typed contracts, events)            │
│      ├── @team-x/role-schema (role-pack loader + validator)        │
│      ├── @team-x/telemetry-core (cost + usage tracking)            │
│      ├── SQLite (better-sqlite3 / sql.js, FTS5, sqlite-vec)        │
│      ├── File vault (filesystem blobs, SHA256 integrity)           │
│      └── MCP host (singleton, pooled, tools_allowed/denied)        │
│           │                                                         │
│           ▼  stdio JSON-RPC                                         │
│      External MCP servers (your code, third-party servers)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Implementation |
|---|---|
| UI shell | Electron + React 19 + Zustand + React Query |
| Styling | Tailwind + shadcn/ui + Strategia-X design system |
| Local storage | SQLite (WAL mode, FTS5 search, sqlite-vec embeddings) |
| Provider layer | Vercel AI SDK adapters wrapped in privacy-tier filtering |
| Agent runtime | In-house orchestrator with slot semaphore + pause/drain + append-only event bus |
| Extension surface | MCP (tools/resources/prompts) and role packs (markdown + YAML frontmatter) |

---

## MCP Servers

[Model Context Protocol](https://modelcontextprotocol.io) servers extend agent capabilities with custom tools, resources, and prompts. Team-X runs a singleton MCP host with connection pooling; per-employee `tools_allowed` / `tools_denied` lists enforce access.

### Server skeleton

```
my-mcp-server/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### Minimal stdio server

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'my-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'One-sentence description the agent reads at planning time',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-form input' },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'my_tool') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  const { query } = request.params.arguments as { query: string };
  return {
    content: [{ type: 'text', text: `Echo: ${query}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('my-mcp-server up'); // stderr only — stdout is the JSON-RPC channel
```

### Registering with Team-X

`Settings → Extensions → Add MCP` → point at the built entrypoint (`dist/index.js`) or a published `npx` command. Per-employee tool allow/deny lists live on the role spec (`tools_allowed` / `tools_denied`).

### MCP best practices

1. **Stdio only on the default path.** Stdout is the JSON-RPC channel — log to stderr.
2. **Tools must be idempotent.** Multiple agents can call the same tool simultaneously through the pool.
3. **Validate input.** Trust nothing from the agent side; tool calls are LLM-generated.
4. **Return small payloads.** Team-X clamps tool results on the default chat path (audit H11). If you need to return a large blob, write it to the vault and return a reference.
5. **Describe tools precisely.** The agent's tool-selection accuracy is bottlenecked by your description.

---

## Role Packs

A role pack is a directory of markdown files — one per role — with YAML frontmatter for the structured fields and a markdown body for the system prompt. The `strategia-official` pack ships with 57 roles across 6 levels.

### Pack layout

```
my-role-pack/
├── pack.json
└── roles/
    ├── officer/
    │   ├── ceo.md
    │   └── cto.md
    ├── senior-mgmt/
    ├── management/
    ├── supervisor/
    ├── lead/
    ├── ic/
    └── system/
```

### `pack.json`

```json
{
  "id": "my-role-pack",
  "name": "My Custom Role Pack",
  "version": "1.0.0",
  "author": "Your Name",
  "license": "MIT",
  "description": "Custom roles for X",
  "homepage": "https://github.com/you/my-role-pack",
  "compatibleWith": ">=3.0.0",
  "levels": ["officer", "senior_management", "management", "supervisor", "lead", "ic"],
  "signed": false
}
```

### Role file

```markdown
---
id: devops-engineer
name: DevOps Engineer
level: ic
reports_to: [devops-lead]
manages: []
preferred_model_tier: medium
preferred_providers: [anthropic, openai, ollama]
fallback_providers: [groq, openrouter]
preferred_context_window: 128000
tools_allowed: [browse, shell, filesystem_read, filesystem_write]
tools_denied: []
decision_authority: scoped
escalates_to: [devops-lead]
kpis: [deploy_frequency, mttr, change_failure_rate, infrastructure_cost]
output_format: technical_doc
temperature: 0.3
license: MIT
author: Your Name
version: 1.0.0
capabilities: [infrastructure_as_code, containerization, observability]
---

# Identity

You are **{{employee.name}}**, a DevOps Engineer at **{{company.name}}**. You own
deployment pipelines, runtime infrastructure, and the reliability of every
service in production.

# Mission

{{company.mission}}

# Operating principles

1. Automate every repeated task; if you do it twice, codify it.
2. Reliability is a feature; treat downtime as a P0 bug.
3. Infrastructure changes ship through code review and rollback plans.

# Cadences

- Daily: review on-call signals, triage paging events.
- Weekly: pipeline health review, capacity planning.
- Monthly: cost audit, dependency upgrades.
```

### Template variables

The role markdown body is run through a tiny substitution pass before the system prompt is built. Supported tokens:

| Token | Resolves to |
|---|---|
| `{{employee.name}}` | The hired employee's display name |
| `{{employee.id}}` | The employee row ID |
| `{{company.name}}` | The company name |
| `{{company.mission}}` | The company's mission statement |

### Installing your pack

`Settings → Extensions → Add Role Pack` → point at the pack directory. Team-X
validates the YAML against `@team-x/role-schema`, hashes each file (SHA256) for
integrity, and records the pack in the role catalog.

Signed packs use Ed25519 — see `scripts/sign-pack.mjs` and
`scripts/generate-pack-key.mjs` for the toolchain.

---

## Local IPC Surface (internal)

Team-X's main and renderer processes communicate over Electron `contextBridge`
with strongly-typed channels declared in `@team-x/shared-types/ipc`. This
surface is **internal to the app** — it is not exposed over the network and
should not be treated as a public API.

Channel families (~290 channels across the four `tsconfig` projects):

| Family | Examples |
|---|---|
| `companies.*` | `create` / `list` / `update` / `archive` |
| `employees.*` | `hire` / `fire` / `promote` / `setManager` |
| `chat.*` | `send` / `resolveThread` |
| `agentic.*` / `command.*` | command palette + agentic loop entry points |
| `copilot.*` | proactive analyst dispatch + dismissal |
| `proactive.*` | trigger service controls |
| `vault.*` / `backup.*` | file vault + backup/restore |
| `settings.*` / `providers.*` | runtime configuration |
| `mcp.*` / `extensions.*` | MCP host and pack/skill management |
| `telemetry.*` | usage analytics |

If you are forking Team-X and need to add an IPC channel, see
`apps/desktop/src/main/ipc/register.ts` for the registration pattern and
`packages/shared-types/src/ipc.ts` for the type contracts.

---

## Testing

### MCP servers

```typescript
// test/mcp-server.test.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client(
  { name: 'test-client', version: '1.0.0' },
  { capabilities: {} },
);

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
});

await client.connect(transport);
const tools = await client.listTools();
console.log(tools);

const result = await client.callTool({
  name: 'my_tool',
  arguments: { query: 'test' },
});
console.log(result);
```

### Role packs

`@team-x/role-schema` exports a `parseRoleMarkdown(...)` helper with full Zod
validation; use it in your pack's CI to catch schema drift before publish.

---

## Resources

- **Source code:** [github.com/Git-Rocky-Stack/Team-X](https://github.com/Git-Rocky-Stack/Team-X)
- **Releases:** [github.com/Git-Rocky-Stack/Team-X/releases](https://github.com/Git-Rocky-Stack/Team-X/releases)
- **Issue tracker:** [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues)
- **CONTRIBUTING:** [`/CONTRIBUTING.md`](../../CONTRIBUTING.md)
- **CHANGELOG:** [`/CHANGELOG.md`](../../CHANGELOG.md)
- **MCP Protocol spec:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MCP SDK:** [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)

For questions about the Team-X internals or contribution flow, open a GitHub
discussion or issue. There is no support email — Team-X is open-source and
community-supported.
