# CLI Reference

**Command-Line Interface and Command Palette Reference**

---

## Overview

Team-X provides two CLI interfaces:

1. **Command Palette** — Natural language commands (primary interface)
2. **CLI Tool** — Traditional command-line tool for automation and scripting

This guide covers both interfaces.

---

## Table of Contents

1. [Command Palette Reference](#command-palette-reference)
2. [CLI Tool](#cli-tool)
3. [Automation Examples](#automation-examples)
4. [Scripting with Team-X](#scripting-with-team-x)
5. [Advanced Usage](#advanced-usage)

---

## Command Palette Reference

### Basic Syntax

Open Command Palette: `Ctrl+K` (Windows/Linux) or `Cmd+K` (macOS)

```
Natural language syntax:
[verb] [object] [parameters...]

Examples:
- create ticket
- hire employee
- show budget
- assign ticket to Alex
```

### Command Categories

#### Workspace Commands

```
Workspace Management:
- show workspace info
- list workspaces
- switch to [workspace name]
- create workspace [name]
- archive workspace [name]

Budget Commands:
- show budget
- what's our spend this month
- show spend by employee
- show spend by ticket
- budget alert threshold [amount]

Employee Commands:
- list employees
- hire [role name]
- fire [employee name]
- show employee [name]
- assign employee to [ticket]
```

#### Ticket Commands

```
Ticket Creation:
- create ticket [title]
- new ticket for [description]
- create high priority ticket for [title]

Ticket Management:
- show tickets
- show my tickets
- show open tickets
- show tickets assigned to [employee]
- show tickets in [project]

Ticket Actions:
- assign ticket #[number] to [employee]
- set ticket #[number] priority to [level]
- close ticket #[number]
- reopen ticket #[number]
- cancel ticket #[number]
```

#### Agent Commands

```
Agent Control:
- start agent for ticket #[number]
- cancel agent run
- cancel all running agents
- show running agents
- show agent history for ticket #[number]
```

#### Autonomy Commands

```
Runtime Management:
- list runtimes
- restart runtime [name]
- show runtime status

Routine Management:
- list routines
- enable routine [name]
- disable routine [name]
- trigger routine [name]
- show routine history [name]

Approval Management:
- show approvals
- approve all
- deny all
- approve ticket #[number] budget override
```

#### File Commands

```
File Operations:
- show files
- open file [name]
- download file [name]
- upload file [path]
- search files [query]
```

#### Help Commands

```
Help:
- help
- how do I [question]
- what is [term]
- show keyboard shortcuts
- show documentation
```

### Advanced Command Patterns

#### Chained Commands

```
Multiple actions in one command:
"create ticket for API integration and assign to Alex"
→ Creates ticket + assigns in one step

"show open tickets and assign to Sarah"
→ Filters + assigns matching tickets

"hire designer named Priya and assign ticket #42 to them"
→ Hires + assigns
```

#### Conditional Commands

```
Conditions:
"show tickets with priority high or critical"
"show agents running longer than 30 minutes"
"show spend over $10 per ticket"
```

#### Time-Based Commands

```
Time scopes:
"show tickets created today"
"show spend this week"
"show agent runs from yesterday"
"show budget projection for next month"
```


---

## Developer CLI (`ai-cli`)

Team-X ships a small developer/inspection CLI called `ai-cli` (bin: `team-x-ai`) in the `@team-x/intelligence` package. It is **not an end-user automation CLI** — ticket, employee, budget, and agent-run management all happen inside the desktop app via the Command Palette (above) or the UI directly. There is no installed `teamx` binary, no hosted REST API, and no `TEAMX_API_KEY` to configure.

### What `ai-cli` supports today

| Command | Purpose |
|---|---|
| `info` | Show AI-system version, available modules, and key exports |
| `knowledge` | Inspect the knowledge graph (stats, queries) |
| `memory` | Inspect long-term memory entries |
| `eval` | Run RAG evaluation against the golden dataset |
| `trace` | Export distributed-trace data for offline analysis |

Run `ai-cli <command> --help` for command-specific flags. Output defaults to a human-readable text format; pass `--json` to most commands for machine-readable output.

### Running `ai-cli` from source

There is no published binary yet — run the CLI directly from a checked-out copy of the repo:

```bash
git clone https://github.com/Git-Rocky-Stack/Team-X.git
cd Team-X
pnpm install --frozen-lockfile

# Run a command directly via tsx
npx tsx packages/intelligence/src/cli/ai-cli.ts info
npx tsx packages/intelligence/src/cli/ai-cli.ts knowledge --stats --company acme
npx tsx packages/intelligence/src/cli/ai-cli.ts memory --company acme --type episodic
```

### What `ai-cli` does NOT support

- No login, no API key, no `TEAMX_API_KEY` / `TEAMX_WORKSPACE` / `TEAMX_OUTPUT_FORMAT` / `TEAMX_TIMEOUT` environment variables.
- No `teamx ticket`, `teamx employee`, `teamx budget`, `teamx run`, `teamx workspace` subcommands — those were aspirational and never built.
- No Python SDK, no PowerShell module, no `Connect-TeamX` / `Get-TeamXWorkspace` / `Get-TeamXBudgetSpend` cmdlets.
- No `curl https://teamflow-x.com/install-cli.sh | bash` installer. Team-X is local-first and free-and-open-source; there is no hosted service to install against.

### Need scripted workflows?

For automation beyond what the Command Palette offers, the right extension point is to write an **MCP server**. Tools you implement in your MCP server become callable by any agent whose role spec allows it, and the agent can be triggered by anything from a Command Palette command to a scheduled routine. See the [Developer Reference](../developer-guide/api-reference.md#mcp-servers).

---

**Need more help?** Check the [Developer Reference](../developer-guide/api-reference.md) or open an issue at [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues).

---

*Last updated: 2026-05-11*
