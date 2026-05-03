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

## CLI Tool

### Installation

The Team-X CLI tool is installed with the desktop application.

**Location:**
- **Windows:** `C:\Users\[User]\AppData\Local\Programs\Team-X\teamx.exe`
- **macOS:** `/Applications/Team-X.app/Contents/MacOS/teamx`
- **Linux:** `/opt/team-x/bin/teamx`

**Add to PATH:**

```bash
# Windows (PowerShell)
$env:Path += ";C:\Users\[User]\AppData\Local\Programs\Team-X"

# macOS/Linux (bash/zsh)
export PATH="$PATH:/Applications/Team-X.app/Contents/MacOS"
# or
export PATH="$PATH:/opt/team-x/bin"
```

### Basic Usage

```bash
# Show help
teamx --help

# Show version
teamx --version

# Login (if not logged in)
teamx login [api-key]
```

### Workspace Commands

```bash
# Get workspace info
teamx workspace get

# List workspaces
teamx workspace list

# Create workspace
teamx workspace create --name "My Workspace" --budget 100

# Update workspace
teamx workspace update --budget 200
```

### Employee Commands

```bash
# List employees
teamx employee list

# Get employee
teamx employee get [employee-id]

# Hire employee
teamx employee hire \
  --role "Full Stack Engineer" \
  --name "Alex" \
  --provider "anthropic"

# Fire employee
teamx employee fire [employee-id]
```

### Ticket Commands

```bash
# List tickets
teamx ticket list

# Create ticket
teamx ticket create \
  --title "Fix login bug" \
  --description "Users cannot login with SAML" \
  --assignee "alex" \
  --priority "high"

# Get ticket
teamx ticket get [ticket-id]

# Update ticket
teamx ticket update [ticket-id] --status "done"

# Delete ticket
teamx ticket delete [ticket-id]
```

### Agent Run Commands

```bash
# List runs
teamx run list

# Start run
teamx run start [ticket-id]

# Get run
teamx run get [run-id]

# Cancel run
teamx run cancel [run-id]

# Watch run (stream output)
teamx run watch [run-id]
```

### Budget Commands

```bash
# Show budget
teamx budget show

# Show spend
teamx budget spend

# Set budget alert
teamx budget alert --threshold 80 --email admin@example.com
```

### Output Formats

```bash
# JSON output (for scripting)
teamx ticket list --format json

# Table output (human-readable)
teamx ticket list --format table

# CSV output (for spreadsheets)
teamx ticket list --format csv
```

---

## Automation Examples

### Bash Scripting

**Example: Daily budget check**

```bash
#!/bin/bash
# daily-budget-check.sh

# Check budget
SPEND=$(teamx budget spend --format json | jq '.spend')
BUDGET=$(teamx budget show --format json | jq '.budget')
THRESHOLD=$(echo "$BUDGET * 0.9" | bc)

if (( $(echo "$SPEND > $THRESHOLD" | bc -l) )); then
  echo "⚠️  Budget alert: Spent $SPEND of $BUDGET"
  # Send notification
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
    -d "{\"text\":\"Budget alert: $SPEND of $BUDGET spent\"}"
fi
```

**Example: Automated ticket creation**

```bash
#!/bin/bash
# create-review-tickets.sh

# Get merged PRs from GitHub
PRS=$(gh pr list --state merged --json number,title)

echo "$PRS" | jq -r '.[] | @uri' | while read -r pr; do
  title=$(echo "$pr" | jq -r '.title')
  number=$(echo "$pr" | jq -r '.number')
  
  # Create ticket
  teamx ticket create \
    --title "Review PR #$number: $title" \
    --description "Review merged PR #$number from GitHub" \
    --assignee "alex" \
    --priority "normal"
done
```

### Python Scripting

**Example: Ticket analytics**

```python
#!/usr/bin/env python3
import teamx
import json

# Initialize client
client = teamx.Client()

# Get all tickets
tickets = client.tickets.list()

# Analyze by employee
from collections import Counter
employee_counts = Counter(t.assignee for t in tickets)

print("Tickets by Employee:")
for employee, count in employee_counts.most_common():
    print(f"  {employee}: {count} tickets")

# Analyze by priority
priority_counts = Counter(t.priority for t in tickets)

print("\nTickets by Priority:")
for priority, count in priority_counts.items():
    print(f"  {priority}: {count} tickets")

# Calculate average cost
total_cost = sum(t.cost for t in tickets if t.cost)
avg_cost = total_cost / len(tickets)

print(f"\nAverage cost per ticket: ${avg_cost:.2f}")
```

### PowerShell Scripting

**Example: Workspace health check**

```powershell
# workspace-health-check.ps1

# Connect to Team-X
Connect-TeamX

# Get workspace info
$workspace = Get-TeamXWorkspace
Write-Host "Workspace: $($workspace.Name)" -ForegroundColor Green

# Check budget
$spend = Get-TeamXBudgetSpend
$budget = $workspace.MonthlyBudget
$pct = ($spend / $budget) * 100

Write-Host "Budget: $spend of $budget ($pct%)" -ForegroundColor `
    $(if ($pct -lt 80) { "Green" } else { "Yellow" })

# Check active runs
$runs = Get-TeamXAgentRuns -Status "running"
Write-Host "Active runs: $($runs.Count)" -ForegroundColor Cyan

# Check for errors
$errors = Get-TeamXAgentRuns -Status "failed" -Today
if ($errors.Count -gt 0) {
    Write-Host "Failed runs today: $($errors.Count)" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $($error.TicketId): $($error.Error)" -ForegroundColor Red
    }
}
```

---

## Scripting with Team-X

### Environment Variables

```bash
# Team-X CLI uses these environment variables

TEAMX_API_KEY="your-api-key"        # API authentication
TEAMX_WORKSPACE="default"           # Default workspace
TEAMX_OUTPUT_FORMAT="table"          # Default output format
TEAMX_TIMEOUT="30"                   # Request timeout (seconds)
TEAMX_DEBUG="false"                  # Enable debug logging
```

### Configuration File

```yaml
# ~/.teamx/config.yaml

api_key: your-api-key
workspace: default
output_format: json
timeout: 30
debug: false

workspace_aliases:
  main: ws_main_123
  client-a: ws_client_a_456
  client-b: ws_client_b_789

employee_aliases:
  alex: emp_alex_001
  sarah: emp_sarah_002
  jamie: emp_jamie_003
```

### Exit Codes

```bash
# Exit codes for scripting
0  # Success
1  # General error
2  # Authentication error
3  # Not found
4  # Validation error
5  # Rate limited
6  # Server error
```

**Using exit codes:**

```bash
#!/bin/bash
teamx ticket create --title "Test ticket"

if [ $? -eq 0 ]; then
  echo "Ticket created successfully"
else
  echo "Failed to create ticket"
  exit 1
fi
```

---

## Advanced Usage

### Batch Operations

```bash
# Create multiple tickets from CSV
cat tickets.csv | while IFS=, read -r title description priority; do
  teamx ticket create \
    --title "$title" \
    --description "$description" \
    --priority "$priority"
done
```

### Filtering and Querying

```bash
# Filter tickets with jq
teamx ticket list --format json | \
  jq '.[] | select(.priority == "high")'

# Sort by cost
teamx ticket list --format json | \
  jq 'sort_by(.cost) | reverse'

# Group by status
teamx ticket list --format json | \
  jq 'group_by(.status) | map({status: .key, count: length})'
```

### Parallel Execution

```bash
# Start multiple agents in parallel
for ticket in 42 43 44 45; do
  teamx run start $ticket &
done

# Wait for all to complete
wait
```

### Integration with CI/CD

```yaml
# .github/workflows/teamx-review.yml
name: Team-X Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Install Team-X CLI
        run: |
          curl -sSL https://teamflow-x.com/install-cli.sh | bash
      
      - name: Create review ticket
        run: |
          teamx ticket create \
            --title "Review PR #${{ github.event.number }}" \
            --description "Review PR: ${{ github.event.pull_request.html_url }}" \
            --priority "normal" \
            --format json | jq -r '.id'
```

---

## Tips and Tricks

### Aliases for Common Commands

```bash
# Bash aliases
alias tx='teamx'
alias txl='teamx ticket list'
alias txe='teamx employee list'
alias txb='teamx budget show'

# Use them
txl  # List tickets
txe  # List employees
txb  # Show budget
```

### Shell Completion

```bash
# Enable bash completion
source <(teamx completion bash)

# Enable zsh completion
source <(teamx completion zsh)

# Now tab-complete commands
teamx ticket [tab]  # Suggests: create, list, get, update, delete
```

### Custom Output Formats

```python
# Python script to customize output
import teamx
import tabulate

tickets = teamx.Client().tickets.list()

# Custom table
table = []
for t in tickets:
    table.append([t.id, t.title[:30], t.assignee, f"${t.cost:.2f}"])

print(tabulate(table, headers=["ID", "Title", "Assignee", "Cost"]))
```

---

## Troubleshooting

### Common Issues

**"Authentication failed"**

```bash
# Re-login
teamx logout
teamx login [new-api-key]

# Or use environment variable
export TEAMX_API_KEY="[new-api-key]"
```

**"Workspace not found"**

```bash
# List available workspaces
teamx workspace list

# Set default workspace
export TEAMX_WORKSPACE="[workspace-id]"
```

**"Timeout exceeded"**

```bash
# Increase timeout
export TEAMX_TIMEOUT="60"

# Or use command flag
teamx ticket list --timeout 60
```

---

## Reference Card

**Quick reference card (printable):**

```
Team-X CLI Quick Reference
==========================

BASIC COMMANDS
--------------
teamx ticket list          List all tickets
teamx employee list         List all employees
teamx budget show           Show budget status
teamx run start [id]        Start agent run

FLAGS
------
--format json               JSON output
--format table              Table output
--workspace [name]          Use specific workspace
--timeout [seconds]         Set timeout

HELP
----
teamx --help                Show help
teamx [command] --help      Command-specific help

CONFIG
------
~/.teamx/config.yaml        Configuration file

ENVIRONMENT
-----------
TEAMX_API_KEY              API key
TEAMX_WORKSPACE            Default workspace
TEAMX_OUTPUT_FORMAT        Output format
TEAMX_TIMEOUT              Timeout (seconds)

For full documentation: docs.teamflow-x.com/cli
```

---

**Need more help?** Check the [Developer Guide](../developer-guide/api-reference.md) or contact support@teamflow-x.com.

---

*Last updated: 2026-05-03*
