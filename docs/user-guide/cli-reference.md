# CLI Reference

**Command Palette Reference**

---

## Overview

Team-X's command surface is the **Command Palette**: natural-language commands typed inside the desktop app. There is no separate command-line tool; see [No command-line tool](#no-command-line-tool) for what that means for automation.

---

## Table of Contents

1. [Command Palette Reference](#command-palette-reference)
2. [No command-line tool](#no-command-line-tool)

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

> **How these commands resolve.** The phrasings below are natural-language examples, not a fixed command grammar. Only the **14 structured intents** (hire, fire, promote, assign, create ticket / project / goal, close, reopen, call / end meeting, check status, show view, and search vault) plus the `/show` slash commands are the deterministic surface; they classify to a known intent and execute directly. Everything else here (`cancel agent run`, `start agent for ticket`, `list runtimes`, `approve all`, and similar operational phrasings) has no dedicated intent; it routes through the `complex_request` agentic fallback, which reasons over your org state and may ask a clarifying question instead of firing a fixed action.

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

## No command-line tool

Team-X does not ship a CLI. Ticket, employee, budget, and agent-run management all happen inside the desktop app via the Command Palette (above) or the UI directly.

- No installed `teamx` binary and no `teamx ticket` / `employee` / `budget` / `run` / `workspace` subcommands.
- No hosted REST API, no login, and no `TEAMX_API_KEY` / `TEAMX_WORKSPACE` / `TEAMX_OUTPUT_FORMAT` / `TEAMX_TIMEOUT` environment variables.
- No Python SDK, no PowerShell module, no `Connect-TeamX` / `Get-TeamXWorkspace` / `Get-TeamXBudgetSpend` cmdlets.
- No `curl https://teamflow-x.com/install-cli.sh | bash` installer. Team-X is local-first and free-and-open-source; there is no hosted service to install against.

An earlier developer inspection tool, `ai-cli` (bin `team-x-ai`), was removed: its `knowledge`, `memory`, `trace` and `eval` commands printed placeholder figures rather than reading any real store, so it could not be trusted for inspection.

### Need scripted workflows?

For automation beyond what the Command Palette offers, the right extension point is to write an **MCP server**. Tools you implement in your MCP server become callable by any agent whose role spec allows it, and the agent can be triggered by anything from a Command Palette command to a scheduled routine. See the [Developer Reference](../developer-guide/api-reference.md#mcp-servers).

---

**Need more help?** Check the [Developer Reference](../developer-guide/api-reference.md) or open an issue at [github.com/Git-Rocky-Stack/Team-X/issues](https://github.com/Git-Rocky-Stack/Team-X/issues).

---

*Last updated: 2026-10-07*
