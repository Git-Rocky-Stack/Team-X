# Integration guide

**Wiring Team-X into your stack**

---

> **Team-X integrates locally.** There is no cloud bridge, no managed connector service, and no native first-party integration with GitHub, Slack, Discord, Jira, Notion, or any other SaaS. Three surfaces exist for plugging Team-X into the rest of your stack: AI providers (outbound), MCP servers (tool sources), and Skills extensions (capability extensions). Plus workspace export and import, audit-log streaming, and local backup. That is the entire integration surface.

---

## Table of Contents

1. [AI providers](#1-ai-providers)
2. [MCP servers](#2-mcp-servers)
3. [Skills extensions](#3-skills-extensions)
4. [Workspace portability: export and import](#4-workspace-portability-export-and-import)
5. [Audit log streaming](#5-audit-log-streaming)
6. [Local backup](#6-local-backup)
7. [What is intentionally not here](#what-is-intentionally-not-here)

---

## 1. AI providers

Team-X is provider-agnostic. The default provider router ships with adapters for nine families. Each adapter is its own file under `packages/provider-router/src/adapters/`.

| Provider | Privacy tier | Use case |
|---|---|---|
| **Ollama** | Local | Fully offline; nothing leaves the machine |
| **OpenAI-compatible** | Local | Self-hosted vLLM, llama.cpp server, LM Studio, etc |
| **Anthropic** (Claude) | Cloud | Claude Opus / Sonnet / Haiku via API key |
| **OpenAI** | Cloud | GPT-4, GPT-3.5, GPT-4o |
| **Google** (Gemini) | Cloud | Gemini 1.5 family |
| **OpenRouter** | Cloud | Aggregator: 100+ models, one API key |
| **Groq** | Cloud | Llama / Mixtral inference at very high throughput |
| **Together** | Cloud | Open-weights inference |
| **Fireworks** | Cloud | Open-weights inference plus custom fine-tunes |

### Privacy tiers

Every provider is tagged with a tier. The active workspace has a configurable `maxTier` setting. If a provider's tier exceeds the workspace ceiling, the provider is hidden from routing and from the model picker. The two tiers Team-X tracks today:

- **Local**: traffic never leaves the host. Ollama and OpenAI-compatible pointed at a localhost endpoint both qualify.
- **Cloud**: traffic crosses the network to a remote endpoint. Every hosted provider qualifies.

Set the ceiling via `settings.setPrivacy`:

```typescript
await invoke('settings.setPrivacy', { maxTier: 'local' });
```

With `maxTier: 'local'`, Team-X refuses to add or use any cloud provider for the active workspace. This is the posture local-first deployments use to guarantee no exfiltration regardless of misconfiguration.

### Registering a provider

```typescript
// Anthropic
await invoke('providers.add', {
  name: 'Anthropic (Claude)',
  kind: 'anthropic',
  privacyTier: 'cloud',
  apiKey: 'sk-ant-...',
});

// Ollama (default local endpoint)
await invoke('providers.add', {
  name: 'Ollama (local)',
  kind: 'ollama',
  privacyTier: 'local',
  configJson: JSON.stringify({
    baseUrl: 'http://localhost:11434',
  }),
});

// OpenAI-compatible (vLLM, llama.cpp, LM Studio)
await invoke('providers.add', {
  name: 'Local vLLM',
  kind: 'openai-compatible',
  privacyTier: 'local',
  configJson: JSON.stringify({
    baseUrl: 'http://localhost:8000/v1',
    models: ['meta-llama/Llama-3-70B-Instruct'],
  }),
  apiKey: 'dummy',
});
```

API keys are stored in the OS keychain via `keytar`, never in plain text on disk and never in the SQLite database. Test the connection before trusting it:

```typescript
const result = await invoke('providers.testConnection', {
  providerId: 'prv_anthropic_123',
});
if (!result.success) {
  console.error(result.error);
}
```

### Writing a new provider adapter

If your model lives behind a non-standard API, write an adapter that implements the `ProviderAdapter` interface in `packages/provider-router/src/types.ts`. The interface is small: a `name`, a streaming `complete()` method, a `listModels()` method, and a `testConnection()` health check. Existing adapters in `packages/provider-router/src/adapters/` are the reference implementations.

For operator-facing provider setup walkthrough, see [Configuring providers](../user-guide/configuring-providers.md).

---

## 2. MCP servers

Team-X's MCP integration is the standard [Model Context Protocol](https://modelcontextprotocol.io). Any MCP server, public or private, can be registered as a tool source for a workspace. Servers run as separate processes (stdio transport) or as remote HTTP endpoints (SSE transport).

### Pre-built templates

The fastest path is `mcp.listTemplates` followed by `mcp.installTemplate`. Templates ship with sane defaults and a known schema. List the templates available for the active workspace:

```typescript
const templates = await invoke('mcp.listTemplates', {
  companyId: 'cmp_123',
});

await invoke('mcp.installTemplate', {
  companyId: 'cmp_123',
  templateId: 'github',
});
```

### Hand-rolled stdio registration

To register an MCP server you wrote yourself, or one not in the template catalog:

```typescript
await invoke('mcp.addServer', {
  companyId: 'cmp_123',
  name: 'GitHub MCP',
  transport: 'stdio',
  configJson: JSON.stringify({
    command: 'node',
    args: ['/path/to/github-mcp-server/dist/index.js'],
    env: { GITHUB_TOKEN: '${env:GITHUB_TOKEN}' },
  }),
});
```

The `configJson` is opaque to Team-X. It is forwarded verbatim to the transport layer. Any environment-variable interpolation syntax (such as the `env` block in the example above) is the transport's responsibility, not Team-X's. Credentials passed via `env` are never persisted; Team-X re-reads them from the host environment when the server is restarted.

### Hand-rolled SSE registration

For a remote MCP server speaking SSE:

```typescript
await invoke('mcp.addServer', {
  companyId: 'cmp_123',
  name: 'Remote Memory MCP',
  transport: 'sse',
  configJson: JSON.stringify({
    url: 'https://mcp.example.com/sse',
    headers: { Authorization: 'Bearer ${env:REMOTE_MCP_TOKEN}' },
  }),
});
```

The remote endpoint must speak MCP-over-SSE. There is no Team-X-specific protocol on top.

### Enable, test, remove

```typescript
// Enable / disable
await invoke('mcp.toggle', { serverId: 'mcp_456', enabled: true });

// Health check before committing to a config
const { success, error } = await invoke('mcp.testConnection', {
  transport: 'stdio',
  configJson: JSON.stringify({
    command: 'node',
    args: ['./build/index.js'],
  }),
});

// Remove
await invoke('mcp.removeServer', { serverId: 'mcp_456' });
```

For MCP server authoring patterns (server skeleton, tool registration, best practices), see [API reference: MCP Servers](./api-reference.md#mcp-servers).

---

## 3. Skills extensions

Skills are a higher-level extension surface than MCP tools. A Skill is a folder containing a `SKILL.md` (the instruction document) and any supporting scripts, prompts, or data files. The agent runtime treats a Skill as a labeled capability that can be invoked by name.

Two installation paths.

### Local folder

Point at a folder on disk:

```typescript
await invoke('extensions.installLocalSkill', {
  companyId: 'cmp_123',
  folderPath: '/Users/rocky/skills/code-review-skill',
});
```

The folder is read once; the contents are copied into the workspace's skills directory. Subsequent edits to the source folder do not affect the installed copy. To pick up changes, reinstall.

### GitHub source

Any public GitHub repo that follows the Skills schema:

```typescript
await invoke('extensions.installGithubSkill', {
  companyId: 'cmp_123',
  sourceUrl: 'https://github.com/your-org/your-skill',
});
```

GitHub-source Skills are pinned by commit at install time. To update, reinstall.

### Assignment

A Skill is registered against a workspace; it is assigned to either a specific employee or to every employee in the workspace:

```typescript
await invoke('extensions.upsertSkillAssignment', {
  companyId: 'cmp_123',
  extensionId: 'ext_789',
  employeeId: 'emp_alex',
  enabled: true,
});
```

Pass `employeeId: null` to make the Skill available to every employee in the company. Disabling an assignment retains the install but removes the Skill from the assigned employee's capability list. Removing the Skill entirely:

```typescript
await invoke('extensions.removeSkill', {
  companyId: 'cmp_123',
  extensionId: 'ext_789',
});
```

---

## 4. Workspace portability: export and import

Every Team-X workspace is portable. A workspace export is a `.tx-pack` archive containing the full state: employees, tickets, projects, goals, threads, meetings, runs, audit log, vault file index, role-pack references, MCP config, Skill assignments, settings. The archive is self-contained, deterministic, and re-importable on any other Team-X install.

### Export

```typescript
const result = await invoke('companies.exportPackage', {
  companyId: 'cmp_123',
  destination: '/Users/rocky/exports/',
  includeVaultFiles: true,
  includeRunHistory: true,
});
```

The metadata block carries the source workspace name, the Team-X version that produced the archive, the timestamp, and the SHA-256 of the archive payload for verification.

### Preview before import

Imports are reviewable. Run a preview against a `.tx-pack` to see what will land before committing:

```typescript
const preview = await invoke('companies.previewImportPackage', {
  filePath: '/path/to/acme-corp.tx-pack',
});
```

The preview returns the source workspace name, the employee count, the ticket count, the thread count, the source Team-X version, and any warnings. Warnings include version mismatches (importing a v2.x archive into a v3.x install), missing role packs, and unknown providers.

### Import

```typescript
const { companyId, restoredSystemAgents } = await invoke('companies.importPackage', {
  filePath: '/path/to/acme-corp.tx-pack',
  newName: 'Acme Corp (restored)',
});
```

The import is a single transaction. Either the entire workspace lands or none of it does; there is no partial-import failure mode.

---

## 5. Audit log streaming

For SIEM, observability, and compliance use cases, every state change in a Team-X workspace is recorded in the audit log. The log is queryable and exportable.

### Query

```typescript
const events = await invoke('audit.list', {
  companyId: 'cmp_123',
  eventTypes: ['employee.created', 'ticket.assigned', 'meeting.ended'],
  fromMs: Date.now() - 24 * 60 * 60 * 1000,
  limit: 500,
});
```

Every event carries `eventId`, `companyId`, `eventType`, `actorId`, `payload` (type-specific JSON), and a millisecond `createdAt`.

### Export

The export takes a filter plus a format and returns a path to the generated file:

```typescript
// CSV for spreadsheet or SIEM ingest
const csv = await invoke('audit.export', {
  filter: {
    companyId: 'cmp_123',
    fromMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  format: 'csv',
});

// JSON for programmatic ingest
const json = await invoke('audit.export', {
  filter: { companyId: 'cmp_123' },
  format: 'json',
});
```

For continuous streaming (rather than periodic export), poll `audit.list` with the highest `eventId` from the previous batch and the appropriate `fromMs` cursor. The audit log is append-only; events never mutate or disappear.

---

## 6. Local backup

Backup and restore is separate from workspace export. A backup captures the entire Team-X data directory: every workspace, the OS-keychain references (not the secrets themselves), settings, and run history.

```typescript
// Create a backup. If destination is omitted, a user picker opens.
const { backupPath } = await invoke('backup.create', {
  destination: '/Volumes/External/team-x-backups/',
});

// List previous backups
const backups = await invoke('backup.list');

// Restore from a backup (replaces current data dir; confirmation required)
await invoke('backup.restore', { backupPath });
```

Backups are NOT a substitute for workspace exports when moving a single workspace between machines. Use `companies.exportPackage` for that; use `backup.create` for full-machine disaster recovery.

For operator-facing backup walkthrough, see [Backup and restore](../user-guide/backup-and-restore.md).

---

## What is intentionally not here

- **No native GitHub, GitLab, Slack, Discord, Jira, or Notion integration.** Anyone can build any of these as an MCP server, and several community MCP servers exist for GitHub, Slack, and a handful of others. Team-X itself ships no first-party SaaS connectors.
- **No outbound webhooks to external services.** The `events.dashboard` stream is renderer-only inside the desktop process. To relay events outside the process, use the audit-log export, or build an MCP server that polls `events.list`.
- **No "Connect to X" OAuth flow.** Team-X never asks for third-party credentials and never holds OAuth tokens on your behalf. If an MCP server needs credentials, it manages them inside its own config and environment.
- **No managed cloud bridge.** Even with the optional `cloud.linkWorkspace` linkage, traffic does not relay through a remote server; the linkage is a metadata pointer.
- **No SaaS-style API rate limits, quotas, or usage caps imposed by Team-X.** The only limits in play are the ones your AI provider imposes (Anthropic rate limit, OpenAI tier, etc) and the budget policies you configure locally via `budgets.createPolicy`.

The integration surface stops at the boundary of your machine. If you need a hosted bridge, write one yourself; Team-X will not.

---

## See also

- [API reference](./api-reference.md): extension authoring patterns including MCP server skeleton, role pack schema, and local IPC surface internals.
- [Configuring providers](../user-guide/configuring-providers.md): operator-facing walkthrough for adding Anthropic, OpenAI, Ollama, and OpenAI-compatible endpoints.
- [Backup and restore](../user-guide/backup-and-restore.md): full-machine backup strategy in operator terms.
- [Autonomy control plane](../user-guide/autonomy-control-plane.md): runtime profiles and the autonomy diagnostics that gate provider routing.
